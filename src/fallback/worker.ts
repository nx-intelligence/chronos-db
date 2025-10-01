import { BridgeRouter } from '../router/router.js';
import { FallbackQueue } from './queue.js';
import type { FallbackOp, FallbackQueueOptions } from './schemas.js';
import type { RouteContext } from '../config.js';

// ============================================================================
// Fallback Worker
// ============================================================================

export interface WorkerOptions extends FallbackQueueOptions {
  /** Poll interval in milliseconds */
  pollIntervalMs: number;
  /** Batch size for processing operations */
  batchSize: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

export class FallbackWorker {
  private readonly router: BridgeRouter;
  private readonly queue: FallbackQueue;
  private readonly options: WorkerOptions;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeOperations: Set<string> = new Set();

  constructor(router: BridgeRouter, queue: FallbackQueue, options: WorkerOptions) {
    this.router = router;
    this.queue = queue;
    this.options = options;
  }

  /**
   * Start the background worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.log('Fallback worker started');

    // Ensure queue indexes
    await this.queue.ensureIndexes();

    // Start polling
    this.scheduleNextPoll();
  }

  /**
   * Stop the background worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for active operations to complete
    while (this.activeOperations.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.log('Fallback worker stopped');
  }

  /**
   * Schedule next poll
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      await this.poll();
      this.scheduleNextPoll();
    }, this.options.pollIntervalMs);
  }

  /**
   * Poll for operations and process them
   */
  private async poll(): Promise<void> {
    try {
      const ops = await this.queue.dequeue(this.options.batchSize);

      if (ops.length === 0) {
        return;
      }

      this.log(`Processing ${ops.length} operations`);

      // Process operations in parallel
      await Promise.all(
        ops.map(op => this.processOperation(op))
      );
    } catch (error) {
      this.log(`Poll error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a single operation
   */
  private async processOperation(op: FallbackOp): Promise<void> {
    // Skip if already being processed
    if (this.activeOperations.has(op.requestId)) {
      return;
    }

    this.activeOperations.add(op.requestId);

    try {
      this.log(`[${op.type}] Retrying operation ${op.requestId} (attempt ${op.attempt + 1})`);

      // Execute the operation based on type
      await this.executeOperation(op);

      // Mark as completed
      await this.queue.markComplete(op.requestId);
      this.log(`[${op.type}] Operation ${op.requestId} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`[${op.type}] Operation ${op.requestId} failed: ${errorMessage}`);

      // Mark as failed (will reschedule or move to dead letter)
      await this.queue.markFailed(op.requestId, errorMessage);
    } finally {
      this.activeOperations.delete(op.requestId);
    }
  }

  /**
   * Execute an operation based on its type
   */
  private async executeOperation(op: FallbackOp): Promise<void> {
    const ctx: RouteContext = {
      dbName: op.ctx.dbName,
      collection: op.ctx.collection,
      ...(op.ctx.tenantId && { tenantId: op.ctx.tenantId }),
      ...(op.ctx.forcedIndex !== undefined && { forcedIndex: op.ctx.forcedIndex }),
    };

    switch (op.type) {
      case 'CREATE':
        await this.executeCreate(ctx, op);
        break;

      case 'UPDATE':
        await this.executeUpdate(ctx, op);
        break;

      case 'DELETE':
        await this.executeDelete(ctx, op);
        break;

      case 'ENRICH':
        await this.executeEnrich(ctx, op);
        break;

      case 'RESTORE':
        await this.executeRestore(ctx, op);
        break;

      default:
        throw new Error(`Unknown operation type: ${(op as any).type}`);
    }
  }

  /**
   * Execute CREATE operation
   */
  private async executeCreate(ctx: RouteContext, op: FallbackOp): Promise<void> {
    const { createItem } = await import('../db/crud.js');
    await createItem(this.router, ctx, op.payload, op.opts);
  }

  /**
   * Execute UPDATE operation
   */
  private async executeUpdate(ctx: RouteContext, op: FallbackOp): Promise<void> {
    const { updateItem } = await import('../db/crud.js');
    await updateItem(this.router, ctx, op.payload.id, op.payload.data, op.opts);
  }

  /**
   * Execute DELETE operation
   */
  private async executeDelete(ctx: RouteContext, op: FallbackOp): Promise<void> {
    const { deleteItem } = await import('../db/crud.js');
    await deleteItem(this.router, ctx, op.payload.id, op.opts);
  }

  /**
   * Execute ENRICH operation
   */
  private async executeEnrich(ctx: RouteContext, op: FallbackOp): Promise<void> {
    const { enrichRecord } = await import('../service/enrich.js');
    await enrichRecord(
      this.router,
      ctx,
      op.payload.id,
      op.payload.enrichment,
      op.opts
    );
  }

  /**
   * Execute RESTORE operation
   */
  private async executeRestore(ctx: RouteContext, op: FallbackOp): Promise<void> {
    const { restoreObject, restoreCollection } = await import('../db/restore.js');

    if (op.payload.type === 'object') {
      await restoreObject(this.router, ctx, op.payload.id, op.payload.to, op.opts);
    } else {
      await restoreCollection(this.router, ctx, op.payload.to, op.opts);
    }
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    activeOperations: number;
    pollIntervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      activeOperations: this.activeOperations.size,
      pollIntervalMs: this.options.pollIntervalMs,
    };
  }

  /**
   * Log message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[FallbackWorker] ${new Date().toISOString()} ${message}`);
    }
  }
}

