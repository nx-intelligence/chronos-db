import { Collection, Db, ObjectId } from 'mongodb';
import type { FallbackOp, DeadLetterOp, FallbackQueueOptions, EnqueueOptions } from './schemas.js';
import { calculateNextAttempt, generateRequestId, shouldRetry } from './schemas.js';

// ============================================================================
// Fallback Queue Repository
// ============================================================================

export class FallbackQueue {
  private readonly queueCol: Collection<FallbackOp>;
  private readonly deadLetterCol: Collection<DeadLetterOp>;
  private readonly options: FallbackQueueOptions;

  constructor(db: Db, options: FallbackQueueOptions) {
    this.queueCol = db.collection<FallbackOp>('chronos_fallback_ops');
    this.deadLetterCol = db.collection<DeadLetterOp>(options.deadLetterCollection);
    this.options = options;
  }

  /**
   * Ensure indexes for fallback queue collections
   */
  async ensureIndexes(): Promise<void> {
    // Queue indexes
    await this.queueCol.createIndex({ nextAttemptAt: 1 });
    await this.queueCol.createIndex({ requestId: 1 }, { unique: true });
    await this.queueCol.createIndex({ type: 1 });
    await this.queueCol.createIndex({ 'ctx.dbName': 1, 'ctx.collection': 1 });
    await this.queueCol.createIndex({ createdAt: 1 });

    // Dead letter indexes
    await this.deadLetterCol.createIndex({ failedAt: 1 });
    await this.deadLetterCol.createIndex({ type: 1 });
    await this.deadLetterCol.createIndex({ 'ctx.dbName': 1, 'ctx.collection': 1 });
  }

  /**
   * Enqueue a failed operation for retry
   */
  async enqueue(options: EnqueueOptions): Promise<string> {
    const requestId = options.requestId || generateRequestId();
    const now = new Date();

    const nextAttemptAt = options.immediate
      ? now
      : calculateNextAttempt(0, this.options.baseDelayMs, this.options.maxDelayMs);

    const forcedIndex = options.ctx['forcedIndex'];
    const op: FallbackOp = {
      _id: new ObjectId(),
      type: options.type,
      ctx: {
        dbName: options.ctx.dbName,
        collection: options.ctx.collection,
        ...(options.ctx.tenantId && { tenantId: options.ctx.tenantId }),
        ...(typeof forcedIndex === 'number' && { forcedIndex }),
      },
      payload: options.payload,
      opts: options.opts || {},
      requestId,
      attempt: 0,
      nextAttemptAt,
      createdAt: now,
    };

    try {
      await this.queueCol.insertOne(op);
      return requestId;
    } catch (error) {
      // If duplicate requestId, update existing
      if ((error as any).code === 11000) {
        await this.queueCol.updateOne(
          { requestId },
          {
            $set: {
              payload: options.payload,
              opts: options.opts || {},
              nextAttemptAt,
            },
          }
        );
        return requestId;
      }
      throw error;
    }
  }

  /**
   * Get operations ready for retry
   */
  async dequeue(limit: number = 10): Promise<FallbackOp[]> {
    const now = new Date();

    const ops = await this.queueCol
      .find({ nextAttemptAt: { $lte: now } })
      .sort({ nextAttemptAt: 1 })
      .limit(limit)
      .toArray();

    return ops;
  }

  /**
   * Mark an operation as completed and remove from queue
   */
  async markComplete(requestId: string): Promise<void> {
    await this.queueCol.deleteOne({ requestId });
  }

  /**
   * Mark an operation as failed and reschedule or move to dead letter
   */
  async markFailed(requestId: string, error: string): Promise<void> {
    const op = await this.queueCol.findOne({ requestId });
    if (!op) {
      return;
    }

    const newAttempt = op.attempt + 1;

    // Check if should retry
    if (shouldRetry(newAttempt, this.options.maxAttempts, error)) {
      // Reschedule with backoff
      const nextAttemptAt = calculateNextAttempt(
        newAttempt,
        this.options.baseDelayMs,
        this.options.maxDelayMs
      );

      await this.queueCol.updateOne(
        { requestId },
        {
          $set: {
            attempt: newAttempt,
            lastError: error,
            nextAttemptAt,
          },
        }
      );
    } else {
      // Move to dead letter
      await this.moveToDeadLetter(op, error);
    }
  }

  /**
   * Move an operation to dead letter queue
   */
  async moveToDeadLetter(op: FallbackOp, finalError: string): Promise<void> {
    const deadLetterOp: DeadLetterOp = {
      ...op,
      finalError,
      failedAt: new Date(),
    };

    try {
      await this.deadLetterCol.insertOne(deadLetterOp);
      await this.queueCol.deleteOne({ requestId: op.requestId });
    } catch (error) {
      console.error('Failed to move operation to dead letter:', error);
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    queueSize: number;
    deadLetterSize: number;
    oldestPending: Date | null;
    byType: Record<string, number>;
  }> {
    const [queueSize, deadLetterSize, oldestOp, byType] = await Promise.all([
      this.queueCol.countDocuments(),
      this.deadLetterCol.countDocuments(),
      this.queueCol.findOne({}, { sort: { createdAt: 1 } }),
      this.queueCol
        .aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    return {
      queueSize,
      deadLetterSize,
      oldestPending: oldestOp?.createdAt || null,
      byType: byType.reduce((acc, item) => {
        acc[item['_id']] = item['count'];
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Clear completed operations older than specified date
   */
  async pruneOldOps(olderThan: Date): Promise<number> {
    const result = await this.deadLetterCol.deleteMany({
      failedAt: { $lt: olderThan },
    });

    return result.deletedCount;
  }

  /**
   * Get operations from dead letter queue
   */
  async getDeadLetterOps(
    filter: { type?: string; dbName?: string; collection?: string } = {},
    limit: number = 100
  ): Promise<DeadLetterOp[]> {
    const query: any = {};

    if (filter.type) {
      query.type = filter.type;
    }
    if (filter.dbName) {
      query['ctx.dbName'] = filter.dbName;
    }
    if (filter.collection) {
      query['ctx.collection'] = filter.collection;
    }

    return await this.deadLetterCol
      .find(query)
      .sort({ failedAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Retry an operation from dead letter queue
   */
  async retryDeadLetter(deadLetterId: ObjectId): Promise<string> {
    const op = await this.deadLetterCol.findOne({ _id: deadLetterId });
    if (!op) {
      throw new Error(`Dead letter operation not found: ${deadLetterId}`);
    }

    // Re-enqueue the operation
    const requestId = await this.enqueue({
      requestId: `retry_${op.requestId}`,
      type: op.type,
      ctx: op.ctx,
      payload: op.payload,
      opts: op.opts,
      immediate: true,
    });

    // Remove from dead letter
    await this.deadLetterCol.deleteOne({ _id: deadLetterId });

    return requestId;
  }

  /**
   * Get pending operations for monitoring
   */
  async getPendingOps(
    filter: { type?: string; dbName?: string; collection?: string } = {},
    limit: number = 100
  ): Promise<FallbackOp[]> {
    const query: any = {};

    if (filter.type) {
      query.type = filter.type;
    }
    if (filter.dbName) {
      query['ctx.dbName'] = filter.dbName;
    }
    if (filter.collection) {
      query['ctx.collection'] = filter.collection;
    }

    return await this.queueCol
      .find(query)
      .sort({ nextAttemptAt: 1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Cancel a pending operation
   */
  async cancelOp(requestId: string): Promise<boolean> {
    const result = await this.queueCol.deleteOne({ requestId });
    return result.deletedCount > 0;
  }
}

