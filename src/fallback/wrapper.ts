import type { BridgeRouter } from '../router/router.js';
import type { RouteContext, FallbackConfig } from '../config.js';
import { FallbackQueue } from './queue.js';
import { generateRequestId } from './schemas.js';

// ============================================================================
// Fallback Wrapper for CRUD Operations
// ============================================================================

export interface FallbackResult<T> {
  /** Whether the operation completed immediately */
  completed: boolean;
  /** Result if completed */
  result?: T;
  /** Whether the operation was queued for retry */
  queued: boolean;
  /** Request ID for tracking */
  requestId?: string;
  /** Error if operation failed immediately and couldn't be queued */
  error?: string;
}

export class FallbackWrapper {
  private readonly router: BridgeRouter;
  private readonly queue: FallbackQueue | null;
  private readonly config: FallbackConfig | null;

  constructor(
    router: BridgeRouter,
    queue: FallbackQueue | null,
    config: FallbackConfig | null
  ) {
    this.router = router;
    this.queue = queue;
    this.config = config;
  }

  /**
   * Execute an operation with fallback support
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallbackOptions: {
      type: 'CREATE' | 'UPDATE' | 'DELETE' | 'ENRICH' | 'RESTORE';
      ctx: RouteContext;
      payload: any;
      opts?: any;
      requestId?: string;
    }
  ): Promise<FallbackResult<T>> {
    // If fallback is not enabled, just execute the operation
    if (!this.config?.enabled || !this.queue) {
      try {
        const result = await operation();
        return {
          completed: true,
          result,
          queued: false,
        };
      } catch (error) {
        return {
          completed: false,
          queued: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // Try to execute the operation
    try {
      const result = await operation();
      return {
        completed: true,
        result,
        queued: false,
      };
    } catch (error) {
      // Operation failed, enqueue for retry
      const requestId = fallbackOptions.requestId || generateRequestId();

      try {
        await this.queue.enqueue({
          requestId,
          type: fallbackOptions.type,
          ctx: fallbackOptions.ctx,
          payload: fallbackOptions.payload,
          opts: fallbackOptions.opts,
        });

        return {
          completed: false,
          queued: true,
          requestId,
        };
      } catch (queueError) {
        // Failed to enqueue, return error
        return {
          completed: false,
          queued: false,
          error: `Operation failed and could not be queued: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }
  }

  /**
   * Wrap createItem with fallback support
   */
  async createWithFallback(
    ctx: RouteContext,
    data: Record<string, unknown>,
    opts?: any,
    config?: any
  ): Promise<FallbackResult<any>> {
    const { createItem } = await import('../db/crud.js');

    return await this.execute(
      () => createItem(this.router, ctx, data, opts, config),
      {
        type: 'CREATE',
        ctx,
        payload: data,
        opts,
      }
    );
  }

  /**
   * Wrap updateItem with fallback support
   */
  async updateWithFallback(
    ctx: RouteContext,
    id: string,
    data: Record<string, unknown>,
    opts?: any,
    config?: any
  ): Promise<FallbackResult<any>> {
    const { updateItem } = await import('../db/crud.js');

    return await this.execute(
      () => updateItem(this.router, ctx, id, data, opts, config),
      {
        type: 'UPDATE',
        ctx,
        payload: { id, data },
        opts,
      }
    );
  }

  /**
   * Wrap deleteItem with fallback support
   */
  async deleteWithFallback(
    ctx: RouteContext,
    id: string,
    opts?: any,
    config?: any
  ): Promise<FallbackResult<any>> {
    const { deleteItem } = await import('../db/crud.js');

    return await this.execute(
      () => deleteItem(this.router, ctx, id, opts, config),
      {
        type: 'DELETE',
        ctx,
        payload: { id },
        opts,
      }
    );
  }

  /**
   * Wrap enrichRecord with fallback support
   */
  async enrichWithFallback(
    ctx: RouteContext,
    id: string,
    enrichment: Record<string, unknown> | Array<Record<string, unknown>>,
    opts?: any,
    config?: any
  ): Promise<FallbackResult<any>> {
    const { enrichRecord } = await import('../service/enrich.js');

    return await this.execute(
      () => enrichRecord(this.router, ctx, id, enrichment, opts, config),
      {
        type: 'ENRICH',
        ctx,
        payload: { id, enrichment },
        opts,
      }
    );
  }

  /**
   * Wrap restoreObject with fallback support
   */
  async restoreObjectWithFallback(
    ctx: RouteContext,
    id: string,
    to: any,
    opts?: any
  ): Promise<FallbackResult<any>> {
    const { restoreObject } = await import('../db/restore.js');

    return await this.execute(
      () => restoreObject(this.router, ctx, id, to, opts),
      {
        type: 'RESTORE',
        ctx,
        payload: { type: 'object', id, to },
        opts,
      }
    );
  }

  /**
   * Wrap restoreCollection with fallback support
   */
  async restoreCollectionWithFallback(
    ctx: RouteContext,
    to: any,
    opts?: any
  ): Promise<FallbackResult<any>> {
    const { restoreCollection } = await import('../db/restore.js');

    return await this.execute(
      () => restoreCollection(this.router, ctx, to, opts),
      {
        type: 'RESTORE',
        ctx,
        payload: { type: 'collection', to },
        opts,
      }
    );
  }
}

