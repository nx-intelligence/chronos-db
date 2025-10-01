import { S3Client } from '@aws-sdk/client-s3';
import { putJSON, putRaw } from '../storage/s3.js';
import type { WriteOptimizationConfig } from '../config.js';

// ============================================================================
// Write Optimizer
// ============================================================================

export class WriteOptimizer {
  private readonly config: WriteOptimizationConfig;
  
  // S3 batching state
  private s3BatchQueue: Array<{
    s3: S3Client;
    bucket: string;
    key: string;
    data: any;
    contentType?: string | undefined;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private s3BatchTimer: NodeJS.Timeout | null = null;

  // Counter debouncing state
  private counterUpdates: Map<string, {
    dbName: string;
    collection: string;
    tenant?: string;
    op: 'CREATE' | 'UPDATE' | 'DELETE';
    count: number;
  }> = new Map();
  private counterTimer: NodeJS.Timeout | null = null;
  private counterCallback: ((updates: Array<any>) => Promise<void>) | null = null;

  constructor(config: WriteOptimizationConfig) {
    this.config = config;
  }

  // ============================================================================
  // S3 Batching
  // ============================================================================

  /**
   * Queue an S3 write for batching
   */
  async batchPutJSON(
    s3: S3Client,
    bucket: string,
    key: string,
    data: any
  ): Promise<{ size: number | null; sha256: string | null }> {
    if (!this.config.batchS3) {
      // Batching disabled, write immediately
      return await putJSON(s3, bucket, key, data);
    }

    return new Promise((resolve, reject) => {
      this.s3BatchQueue.push({
        s3,
        bucket,
        key,
        data,
        resolve,
        reject,
      });

      // Schedule batch flush
      if (!this.s3BatchTimer) {
        this.s3BatchTimer = setTimeout(
          () => this.flushS3Batch(),
          this.config.batchWindowMs
        );
      }
    });
  }

  /**
   * Queue an S3 raw write for batching
   */
  async batchPutRaw(
    s3: S3Client,
    bucket: string,
    key: string,
    body: Buffer | Uint8Array,
    contentType?: string | undefined
  ): Promise<{ size: number | null; sha256: string | null }> {
    if (!this.config.batchS3) {
      // Batching disabled, write immediately
      return await putRaw(s3, bucket, key, body, contentType);
    }

    return new Promise((resolve, reject) => {
      this.s3BatchQueue.push({
        s3,
        bucket,
        key,
        data: body,
        contentType,
        resolve,
        reject,
      });

      // Schedule batch flush
      if (!this.s3BatchTimer) {
        this.s3BatchTimer = setTimeout(
          () => this.flushS3Batch(),
          this.config.batchWindowMs
        );
      }
    });
  }

  /**
   * Flush pending S3 writes
   */
  private async flushS3Batch(): Promise<void> {
    if (this.s3BatchTimer) {
      clearTimeout(this.s3BatchTimer);
      this.s3BatchTimer = null;
    }

    const batch = [...this.s3BatchQueue];
    this.s3BatchQueue = [];

    if (batch.length === 0) {
      return;
    }

    // Process all writes in parallel
    await Promise.all(
      batch.map(async (item) => {
        try {
          let result;
          if (item.contentType) {
            result = await putRaw(
              item.s3,
              item.bucket,
              item.key,
              item.data,
              item.contentType
            );
          } else {
            result = await putJSON(item.s3, item.bucket, item.key, item.data);
          }
          item.resolve(result);
        } catch (error) {
          item.reject(error);
        }
      })
    );
  }

  /**
   * Force flush any pending S3 writes
   */
  async forceFlushS3(): Promise<void> {
    await this.flushS3Batch();
  }

  // ============================================================================
  // Counter Debouncing
  // ============================================================================

  /**
   * Queue a counter update for debouncing
   */
  debouncedCounterUpdate(
    dbName: string,
    collection: string,
    tenant: string | undefined,
    op: 'CREATE' | 'UPDATE' | 'DELETE'
  ): void {
    if (!this.config.debounceCountersMs) {
      // Debouncing disabled, would update immediately
      // But we can't make this async, so we just queue it
    }

    const key = `${dbName}:${collection}:${tenant || 'none'}:${op}`;
    const existing = this.counterUpdates.get(key);

    if (existing) {
      existing.count++;
    } else {
      this.counterUpdates.set(key, {
        dbName,
        collection,
        ...(tenant && { tenant }),
        op,
        count: 1,
      });
    }

    // Schedule counter flush
    if (!this.counterTimer) {
      this.counterTimer = setTimeout(
        () => this.flushCounters(),
        this.config.debounceCountersMs
      );
    }
  }

  /**
   * Set counter flush callback
   */
  setCounterCallback(callback: (updates: Array<any>) => Promise<void>): void {
    this.counterCallback = callback;
  }

  /**
   * Flush pending counter updates
   */
  private async flushCounters(): Promise<void> {
    if (this.counterTimer) {
      clearTimeout(this.counterTimer);
      this.counterTimer = null;
    }

    if (this.counterUpdates.size === 0) {
      return;
    }

    const updates = Array.from(this.counterUpdates.values());
    this.counterUpdates.clear();

    if (this.counterCallback) {
      try {
        await this.counterCallback(updates);
      } catch (error) {
        console.error('Failed to flush counters:', error);
        // Re-queue failed updates
        for (const update of updates) {
          const key = `${update.dbName}:${update.collection}:${update.tenant || 'none'}:${update.op}`;
          this.counterUpdates.set(key, update);
        }
      }
    }
  }

  /**
   * Force flush any pending counter updates
   */
  async forceFlushCounters(): Promise<void> {
    await this.flushCounters();
  }

  // ============================================================================
  // Dev Shadow Skip
  // ============================================================================

  /**
   * Check if dev shadow should be skipped for this operation
   */
  shouldSkipShadow(operationType: string, payloadSize: number): boolean {
    if (!this.config.allowShadowSkip) {
      return false;
    }

    // Skip shadows for large payloads or bulk operations
    const LARGE_PAYLOAD_THRESHOLD = 100 * 1024; // 100KB
    
    return (
      payloadSize > LARGE_PAYLOAD_THRESHOLD ||
      operationType === 'BULK_UPDATE' ||
      operationType === 'BULK_DELETE'
    );
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get optimizer statistics
   */
  getStats(): {
    s3QueueSize: number;
    counterQueueSize: number;
    batchingEnabled: boolean;
    debouncingEnabled: boolean;
  } {
    return {
      s3QueueSize: this.s3BatchQueue.length,
      counterQueueSize: this.counterUpdates.size,
      batchingEnabled: this.config.batchS3,
      debouncingEnabled: this.config.debounceCountersMs > 0,
    };
  }

  /**
   * Shutdown optimizer and flush all pending operations
   */
  async shutdown(): Promise<void> {
    await this.forceFlushS3();
    await this.forceFlushCounters();
  }
}

