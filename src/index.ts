import { validateChronosConfig, validateTransactionConfig, type ChronosConfig, type RouteContext } from './config.js';
import { setGlobalConfig } from './config/global.js';
import { logger } from './utils/logger.js';
import { BridgeRouter } from './router/router.js';
import type { RestoreResult as RestoreRestoreResult, CollectionRestoreResult, VersionSpec as RestoreVersionSpec, CollVersionSpec, RestoreOptions, CollectionRestoreOptions } from './db/restore.js';
import { CounterTotalsRepo, type CounterTotalsDoc } from './counters/counters.js';
import { MongoClient } from 'mongodb';
import { enrichRecord, type EnrichContext, type EnrichOptions, type EnrichResult } from './service/enrich.js';
import { smartInsert, type SmartInsertOptions, type SmartInsertResult } from './db/smartInsert.js';
import { health, shutdown, type HealthReport } from './admin/admin.js';
import { markItemsAsProcessedByTTL, markItemAsProcessed, type StateTransitionOptions, type StateTransitionResult } from './admin/stateManager.js';
import { ensureBucketsExist, testS3Connectivity, validateSpacesConfiguration, type BucketManagerOptions, type BucketManagerResult } from './admin/bucketManager.js';
import { getItem, getLatest, getVersion, getAsOf, query, listByMeta, type ReadContext, type ReadOptions, type QueryOptions, type MetaFilter, type ItemView } from './read/read.js';
import { FallbackQueue } from './fallback/queue.js';
import { FallbackWorker, type WorkerOptions } from './fallback/worker.js';
import { WriteOptimizer } from './fallback/optimizer.js';
// Fallback wrapper and result type are exported for users but not used internally
export type { FallbackResult } from './fallback/wrapper.js';

// ============================================================================
// Main API Interface
// ============================================================================

/**
 * Main interface for the Unified Data Manager
 */
export interface Chronos {
  /**
   * Route a request to determine which backend to use
   * @param ctx - Routing context
   * @returns Backend index and routing information
   */
  route(ctx: RouteContext): { index: number; backend: string };

  /**
   * Get bound operations for a specific context
   * @param ctx - Routing context
   * @returns Bound operations interface
   */
  with(ctx: RouteContext): BoundOps;

  /**
   * Counters API for analytics and reporting
   */
  counters: CountersApi;

  /**
   * Administrative operations
   */
  admin: AdminApi;

  /**
   * Fallback queue operations (if enabled)
   */
  fallback?: FallbackApi;
}

/**
 * Bound operations for a specific context
 */
export interface BoundOps {
  /**
   * Create a new item
   * @param data - Item data
   * @param actor - Actor performing the operation
   * @param reason - Reason for the operation
   * @returns Created item with version information
   */
  create(data: Record<string, unknown>, actor?: string, reason?: string): Promise<CreateResult>;

  /**
   * Update an existing item
   * @param id - Item ID
   * @param data - Updated data
   * @param expectedOv - Expected object version for optimistic locking
   * @param actor - Actor performing the operation
   * @param reason - Reason for the operation
   * @returns Updated item with version information
   */
  update(
    id: string,
    data: Record<string, unknown>,
    expectedOv?: number,
    actor?: string,
    reason?: string
  ): Promise<UpdateResult>;

  /**
   * Delete an item
   * @param id - Item ID
   * @param expectedOv - Expected object version for optimistic locking
   * @param actor - Actor performing the operation
   * @param reason - Reason for the operation
   * @returns Deletion result
   */
  delete(
    id: string,
    expectedOv?: number,
    actor?: string,
    reason?: string
  ): Promise<DeleteResult>;

  /**
   * Enrich an item with deep merge and array union
   * @param id - Item ID
   * @param enrichment - Enrichment data (single object or array of objects)
   * @param opts - Enrichment options
   * @returns Enrichment result
   */
  enrich(
    id: string,
    enrichment: Record<string, unknown> | Array<Record<string, unknown>>,
    opts?: EnrichOptions
  ): Promise<EnrichResult>;

  /**
   * Smart insert: Create if not exists, merge if exists (by unique keys)
   * Like MongoDB upsert but with enrichment merge semantics
   * @param data - Data to insert or merge
   * @param opts - Smart insert options with unique keys
   * @returns Smart insert result with created flag
   */
  smartInsert(
    data: Record<string, unknown>,
    opts: SmartInsertOptions
  ): Promise<SmartInsertResult>;

  /**
   * Get an item (latest by default, or historical with ov/at)
   * @param id - Item ID
   * @param opts - Read options (can include ov or at for historical reads)
   * @returns Item view or null if not found
   */
  getItem(id: string, opts?: ReadOptions): Promise<ItemView | null>;

  /**
   * Query a collection (latest by default, or as-of time with at option)
   * @param filter - Metadata filter
   * @param opts - Query options (can include at for point-in-time query)
   * @returns Query result with items and pagination cursor
   */
  query(filter: MetaFilter, opts?: QueryOptions): Promise<{ items: ItemView[]; pageToken?: string }>;

  /**
   * @deprecated Use getItem() instead
   */
  getLatest(id: string, opts?: ReadOptions): Promise<ItemView | null>;

  /**
   * @deprecated Use getItem() with { ov } option instead
   */
  getVersion(id: string, ov: number, opts?: ReadOptions): Promise<ItemView | null>;

  /**
   * @deprecated Use getItem() with { at } option instead
   */
  getAsOf(id: string, isoTime: string, opts?: ReadOptions): Promise<ItemView | null>;

  /**
   * @deprecated Use query() instead
   */
  listByMeta(filter: MetaFilter, opts?: QueryOptions): Promise<{ items: ItemView[]; pageToken?: string }>;

  /**
   * Restore an object to a specific version
   * @param id - Item ID
   * @param to - Target version specification
   * @param opts - Restore options
   * @returns Restore result
   */
  restoreObject(
    id: string,
    to: RestoreVersionSpec,
    opts?: RestoreOptions
  ): Promise<RestoreRestoreResult>;

  /**
   * Restore an entire collection to a specific version
   * @param to - Target version specification
   * @param opts - Restore options
   * @returns Restore result
   */
  restoreCollection(
    to: CollVersionSpec,
    opts?: CollectionRestoreOptions
  ): Promise<CollectionRestoreResult>;

  /**
   * Generate a presigned URL for a property
   * @param id - Item ID
   * @param property - Property name
   * @param expiresIn - Expiration time in seconds
   * @returns Presigned URL
   */
  presignProperty(
    id: string,
    property: string,
    expiresIn?: number
  ): Promise<string>;
}

/**
 * Counters API for analytics
 */
export interface CountersApi {
  /**
   * Get totals for a collection
   * @param query - Query parameters
   * @returns Counter totals
   */
  getTotals(query: {
    dbName: string;
    collection: string;
    tenant?: string;
    includeRules?: boolean;
    rules?: string[];
  }): Promise<CounterTotalsDoc | null>;

  /**
   * Reset totals for a collection (admin operation)
   * @param query - Query parameters
   */
  resetTotals(query: {
    dbName: string;
    collection: string;
    tenant?: string;
  }): Promise<void>;
}

/**
 * Fallback queue API
 */
export interface FallbackApi {
  /**
   * Start the fallback worker
   */
  startWorker(): Promise<void>;

  /**
   * Stop the fallback worker
   */
  stopWorker(): Promise<void>;

  /**
   * Get worker status
   */
  getWorkerStatus(): { isRunning: boolean; activeOperations: number; pollIntervalMs: number };

  /**
   * Get queue statistics
   */
  getQueueStats(): Promise<{
    queueSize: number;
    deadLetterSize: number;
    oldestPending: Date | null;
    byType: Record<string, number>;
  }>;

  /**
   * Get pending operations
   */
  getPendingOps(filter?: { type?: string; dbName?: string; collection?: string }, limit?: number): Promise<any[]>;

  /**
   * Get dead letter operations
   */
  getDeadLetterOps(filter?: { type?: string; dbName?: string; collection?: string }, limit?: number): Promise<any[]>;

  /**
   * Retry an operation from dead letter queue
   */
  retryDeadLetter(deadLetterId: string): Promise<string>;

  /**
   * Cancel a pending operation
   */
  cancelOp(requestId: string): Promise<boolean>;

  /**
   * Get write optimizer statistics
   */
  getOptimizerStats(): {
    s3QueueSize: number;
    counterQueueSize: number;
    batchingEnabled: boolean;
    debouncingEnabled: boolean;
  };
}

/**
 * Administrative API
 */
export interface AdminApi {
  /**
   * Check health of all backends
   * @returns Health report
   */
  health(): Promise<HealthReport>;

  /**
   * Shutdown all connections
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(): Promise<void>;

  /**
   * Trigger immediate rollup of old data
   * @returns Rollup result
   */
  rollupNow(): Promise<RollupResult>;

  /**
   * Trigger immediate pruning of old data
   * @returns Prune result
   */
  pruneNow(): Promise<PruneResult>;

  /**
   * Mark items as processed based on TTL expiration
   * @param ctx - Route context
   * @param ttlHours - TTL in hours
   * @param opts - State transition options
   * @returns State transition result
   */
  markItemsAsProcessedByTTL(ctx: RouteContext, ttlHours: number, opts?: StateTransitionOptions): Promise<StateTransitionResult>;

  /**
   * Mark a specific item as processed
   * @param ctx - Route context
   * @param id - Item ID
   * @param opts - State transition options
   * @returns Whether the item was marked as processed
   */
  markItemAsProcessed(ctx: RouteContext, id: string, opts?: StateTransitionOptions): Promise<boolean>;

  /**
   * Ensure required buckets exist for a collection
   * @param ctx - Route context
   * @param opts - Bucket manager options
   * @returns Bucket manager result
   */
  ensureBucketsExist(ctx: RouteContext, opts?: BucketManagerOptions): Promise<BucketManagerResult>;

  /**
   * Test S3 connectivity and list available buckets
   * @param ctx - Route context
   * @returns Connectivity test result
   */
  testS3Connectivity(ctx: RouteContext): Promise<{ success: boolean; buckets: string[]; error?: string }>;

  /**
   * Validate S3 configuration for DigitalOcean Spaces
   * @param ctx - Route context
   * @returns Validation result
   */
  validateSpacesConfiguration(ctx: RouteContext): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }>;
}

// ============================================================================
// Result Types
// ============================================================================

export interface CreateResult {
  id: string;
  ov: number;
  cv: number;
  createdAt: Date;
  actor?: string;
  reason?: string;
}

export interface UpdateResult {
  id: string;
  ov: number;
  cv: number;
  updatedAt: Date;
  actor?: string;
  reason?: string;
}

export interface DeleteResult {
  id: string;
  ov: number;
  cv: number;
  deletedAt: Date;
  actor?: string;
  reason?: string;
}

export interface RestoreResult {
  restoredCount: number;
  restoredAt: Date;
  actor?: string;
  reason?: string;
}

export interface ItemData {
  id: string;
  data: Record<string, unknown>;
  ov: number;
  cv: number;
  createdAt: Date;
  updatedAt: Date;
  actor?: string;
  reason?: string;
}

export interface CounterQueryOptions {
  dbName: string;
  collection: string;
  tenant?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface CounterSeries {
  period: string;
  values: Record<string, number>;
}

export interface CounterValue {
  period: string;
  values: Record<string, number>;
}

export interface CounterSummary {
  totalItems: number;
  totalBytes: number;
  period: string;
}

export interface HealthStatus {
  healthy: boolean;
  backends: BackendHealth[];
  timestamp: Date;
}

export interface BackendHealth {
  index: number;
  mongo: boolean;
  s3: boolean;
  lastChecked: Date;
}

export interface RollupResult {
  processedCollections: number;
  processedItems: number;
  manifestsCreated: number;
  completedAt: Date;
}

export interface PruneResult {
  prunedVersions: number;
  prunedCounters: number;
  completedAt: Date;
}

// ============================================================================
// Main Initialization Function
// ============================================================================

/**
 * Initialize the Unified Data Manager with the given configuration
 * @param config - Configuration object
 * @returns Chronos instance
 * @throws Error if configuration is invalid
 */
export function initChronos(config: ChronosConfig): Chronos {
  const startTime = Date.now();
  logger.info('Initializing chronos-db', {
    version: '2.0.0',
    databasesCount: Object.keys(config.databases).length,
    hasSpacesConnections: !!config.spacesConnections && Object.keys(config.spacesConnections).length > 0,
    localStorageEnabled: config.localStorage?.enabled,
    transactionsEnabled: config.transactions?.enabled
  });
  
  // Validate configuration
  const validatedConfig = validateChronosConfig(config);
  
  // Validate transaction configuration (async, but we'll handle it in background)
  validateTransactionConfig(validatedConfig).catch(error => {
    logger.error('chronos-db configuration validation failed', {}, error);
    // Don't throw here as it would break the synchronous initialization
    // The error will be caught when transactions are actually attempted
  });
  
  // Set global configuration for access throughout the application
  setGlobalConfig(validatedConfig);

  // Initialize router
  logger.debug('Initializing BridgeRouter');
  const router = new BridgeRouter({
    dbConnections: config.dbConnections,
    spacesConnections: config.spacesConnections,
    databases: config.databases,
    ...(config.localStorage && { localStorage: config.localStorage }),
    hashAlgo: config.routing.hashAlgo,
    chooseKey: config.routing.chooseKey ?? 'tenantId|dbName|collection:objectId',
  });
  logger.debug('BridgeRouter initialized successfully');

  // Initialize counters (only if analytics databases are configured)
  let countersRepo: CounterTotalsRepo | null = null;
  const initCounters = async () => {
    // Check if runtime databases have analytics configured
    if (!config.databases.runtime?.tenantDatabases) {
      return null; // Skip counters if no runtime databases configured
    }
    
    if (!countersRepo) {
      // Use the first runtime tenant database for counters
      const firstTenantDb = config.databases.runtime.tenantDatabases[0];
      if (!firstTenantDb) {
        throw new Error('No runtime tenant databases configured');
      }
      
      const dbConn = config.dbConnections[firstTenantDb.dbConnRef];
      if (!dbConn) {
        throw new Error(`Database connection '${firstTenantDb.dbConnRef}' not found`);
      }
      
      const countersClient = new MongoClient(dbConn.mongoUri);
      await countersClient.connect();
      const countersDb = countersClient.db(firstTenantDb.analyticsDbName);
      countersRepo = new CounterTotalsRepo(countersDb, config.counterRules?.rules || []);
      await countersRepo.ensureIndexes();
    }
    return countersRepo;
  };

  // Initialize fallback queue and worker (if enabled)
  let fallbackQueue: FallbackQueue | null = null;
  let fallbackWorker: FallbackWorker | null = null;
  let writeOptimizer: WriteOptimizer | null = null;

  // Get first available MongoDB URI for fallback
  let fallbackMongoUri: string | undefined;
  if (config.databases.metadata?.genericDatabase) {
    const dbConn = config.dbConnections[config.databases.metadata.genericDatabase.dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  } else if (config.databases.knowledge?.genericDatabase) {
    const dbConn = config.dbConnections[config.databases.knowledge.genericDatabase.dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  } else if (config.databases.runtime?.tenantDatabases?.[0]) {
    const dbConn = config.dbConnections[config.databases.runtime.tenantDatabases[0].dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  } else if (config.databases.logs) {
    const dbConn = config.dbConnections[config.databases.logs.dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  }

  if (config.fallback?.enabled && fallbackMongoUri) {
    const fallbackClient = new MongoClient(fallbackMongoUri);
    fallbackClient.connect().then(() => {
      const fallbackDb = fallbackClient.db('chronos_system');
      if (config.fallback) {
        fallbackQueue = new FallbackQueue(fallbackDb, config.fallback);
      }
      
      // Initialize worker
      if (config.fallback && fallbackQueue) {
        const workerOptions: WorkerOptions = {
          ...config.fallback,
          pollIntervalMs: 5000, // 5 seconds
          batchSize: 10,
          verbose: false,
        };
        fallbackWorker = new FallbackWorker(router, fallbackQueue, workerOptions);
      }
    }).catch(error => {
      console.error('Failed to initialize fallback queue:', error);
    });
  }

  // Initialize write optimizer (if enabled)
  if (config.writeOptimization) {
    writeOptimizer = new WriteOptimizer(config.writeOptimization);
  }

  // Log initialization completion
  const duration = Date.now() - startTime;
  logger.info('chronos-db initialization completed successfully', {
    durationMs: duration,
    collectionsCount: Object.keys(validatedConfig.collectionMaps).length,
    fallbackEnabled: !!validatedConfig.fallback?.enabled
  });

  return {
    route: (ctx: RouteContext) => {
      const routeInfo = router.route(ctx);
      return { index: routeInfo.index, backend: routeInfo.endpoint };
    },

    with: (ctx: RouteContext) => {
      // Return bound operations for the given context
      return {
        create: async (data: Record<string, unknown>, actor?: string, reason?: string) => {
          const { createItem } = await import('./db/crud.js');
          const opts: any = {};
          if (actor !== undefined) opts.actor = actor;
          if (reason !== undefined) opts.reason = reason;
          const crudConfig: any = {};
          if (config.devShadow) {
            crudConfig.devShadow = config.devShadow;
          }
          return await createItem(router, ctx, data, opts, crudConfig);
        },
        update: async (
          id: string, 
          data: Record<string, unknown>, 
          expectedOv?: number, 
          actor?: string, 
          reason?: string
        ) => {
          const { updateItem } = await import('./db/crud.js');
          const opts: any = {};
          if (expectedOv !== undefined) opts.expectedOv = expectedOv;
          if (actor !== undefined) opts.actor = actor;
          if (reason !== undefined) opts.reason = reason;
          const crudConfig: any = {};
          if (config.devShadow) {
            crudConfig.devShadow = config.devShadow;
          }
          return await updateItem(router, ctx, id, data, opts, crudConfig);
        },
        delete: async (
          id: string, 
          expectedOv?: number, 
          actor?: string, 
          reason?: string
        ) => {
          const { deleteItem } = await import('./db/crud.js');
          const opts: any = {};
          if (expectedOv !== undefined) opts.expectedOv = expectedOv;
          if (actor !== undefined) opts.actor = actor;
          if (reason !== undefined) opts.reason = reason;
          const crudConfig: any = {};
          if (config.devShadow) {
            crudConfig.devShadow = config.devShadow;
          }
          return await deleteItem(router, ctx, id, opts, crudConfig);
        },
        enrich: async (
          id: string,
          enrichment: Record<string, unknown> | Array<Record<string, unknown>>,
          opts?: EnrichOptions
        ) => {
          const enrichCtx: EnrichContext = {
            dbName: ctx.dbName,
            collection: ctx.collection,
            ...(ctx.tenantId && { tenantId: ctx.tenantId }),
          };
          const enrichConfig: any = {};
          if (config.devShadow) {
            enrichConfig.devShadow = config.devShadow;
          }
          return await enrichRecord(router, enrichCtx, id, enrichment, opts, enrichConfig);
        },
        smartInsert: async (
          data: Record<string, unknown>,
          opts: SmartInsertOptions
        ) => {
          const smartConfig: any = {};
          if (config.devShadow) {
            smartConfig.devShadow = config.devShadow;
          }
          return await smartInsert(router, ctx, data, opts, smartConfig);
        },
        getItem: async (id: string, opts?: ReadOptions) => {
          const readCtx: ReadContext = {
            dbName: ctx.dbName,
            collection: ctx.collection,
            ...(ctx.tenantId && { tenantId: ctx.tenantId }),
          };
          return await getItem(router, readCtx, id, opts);
        },
        query: async (filter: MetaFilter, opts?: QueryOptions) => {
          const readCtx: ReadContext = {
            dbName: ctx.dbName,
            collection: ctx.collection,
            ...(ctx.tenantId && { tenantId: ctx.tenantId }),
          };
          return await query(router, readCtx, filter, opts);
        },
        // Deprecated methods (for backwards compatibility)
        getLatest: async (id: string, opts?: ReadOptions) => {
          const readCtx: ReadContext = {
            dbName: ctx.dbName,
            collection: ctx.collection,
            ...(ctx.tenantId && { tenantId: ctx.tenantId }),
          };
          return await getLatest(router, readCtx, id, opts);
        },
        getVersion: async (id: string, ov: number, opts?: ReadOptions) => {
          const readCtx: ReadContext = {
            dbName: ctx.dbName,
            collection: ctx.collection,
            ...(ctx.tenantId && { tenantId: ctx.tenantId }),
          };
          return await getVersion(router, readCtx, id, ov, opts);
        },
        getAsOf: async (id: string, isoTime: string, opts?: ReadOptions) => {
          const readCtx: ReadContext = {
            dbName: ctx.dbName,
            collection: ctx.collection,
            ...(ctx.tenantId && { tenantId: ctx.tenantId }),
          };
          return await getAsOf(router, readCtx, id, isoTime, opts);
        },
        listByMeta: async (filter: MetaFilter, opts?: QueryOptions) => {
          const readCtx: ReadContext = {
            dbName: ctx.dbName,
            collection: ctx.collection,
            ...(ctx.tenantId && { tenantId: ctx.tenantId }),
          };
          return await listByMeta(router, readCtx, filter, opts);
        },
        restoreObject: async (id: string, to: RestoreVersionSpec, opts?: RestoreOptions) => {
          const { restoreObject } = await import('./db/restore.js');
          return await restoreObject(router, ctx, id, to, opts);
        },
        restoreCollection: async (to: CollVersionSpec, opts?: CollectionRestoreOptions) => {
          const { restoreCollection } = await import('./db/restore.js');
          return await restoreCollection(router, ctx, to, opts);
        },
        presignProperty: async () => 'stub-url',
      };
    },

    counters: {
      getTotals: async (query) => {
        const repo = await initCounters();
        if (!repo) {
          throw new Error('Counters not configured - add counters config to enable this functionality');
        }
        return await repo.getTotals(query);
      },
      resetTotals: async (query) => {
        const repo = await initCounters();
        if (!repo) {
          throw new Error('Counters not configured - add counters config to enable this functionality');
        }
        await repo.resetTotals(query);
      },
    },

    admin: {
      health: async () => {
        return await health(router, config);
      },
      shutdown: async () => {
        await shutdown(router, config);
        if (fallbackWorker) {
          await fallbackWorker.stop();
        }
        if (writeOptimizer) {
          await writeOptimizer.shutdown();
        }
      },
      rollupNow: async () => ({
        processedCollections: 0,
        processedItems: 0,
        manifestsCreated: 0,
        completedAt: new Date(),
      }),
      pruneNow: async () => ({
        prunedVersions: 0,
        prunedCounters: 0,
        completedAt: new Date(),
      }),
      markItemsAsProcessedByTTL: async (ctx: RouteContext, ttlHours: number, opts?: StateTransitionOptions) => {
        return await markItemsAsProcessedByTTL(router, ctx, ttlHours, opts);
      },
      markItemAsProcessed: async (ctx: RouteContext, id: string, opts?: StateTransitionOptions) => {
        return await markItemAsProcessed(router, ctx, id, opts);
      },
      ensureBucketsExist: async (ctx: RouteContext, opts?: BucketManagerOptions) => {
        return await ensureBucketsExist(router, ctx, opts);
      },
      testS3Connectivity: async (ctx: RouteContext) => {
        return await testS3Connectivity(router, ctx);
      },
      validateSpacesConfiguration: async (ctx: RouteContext) => {
        return await validateSpacesConfiguration(router, ctx);
      },
    },

    ...(fallbackQueue && fallbackWorker && writeOptimizer ? {
      fallback: {
        startWorker: async () => {
          if (fallbackWorker) {
            await fallbackWorker.start();
          }
        },
        stopWorker: async () => {
          if (fallbackWorker) {
            await fallbackWorker.stop();
          }
        },
        getWorkerStatus: () => {
          return fallbackWorker?.getStatus() || { isRunning: false, activeOperations: 0, pollIntervalMs: 0 };
        },
        getQueueStats: async () => {
          if (!fallbackQueue) {
            throw new Error('Fallback queue not initialized');
          }
          return await fallbackQueue.getStats();
        },
        getPendingOps: async (filter = {}, limit = 100) => {
          if (!fallbackQueue) {
            throw new Error('Fallback queue not initialized');
          }
          return await fallbackQueue.getPendingOps(filter, limit);
        },
        getDeadLetterOps: async (filter = {}, limit = 100) => {
          if (!fallbackQueue) {
            throw new Error('Fallback queue not initialized');
          }
          return await fallbackQueue.getDeadLetterOps(filter, limit);
        },
        retryDeadLetter: async (deadLetterId: string) => {
          if (!fallbackQueue) {
            throw new Error('Fallback queue not initialized');
          }
          return await fallbackQueue.retryDeadLetter(new (await import('mongodb')).ObjectId(deadLetterId));
        },
        cancelOp: async (requestId: string) => {
          if (!fallbackQueue) {
            throw new Error('Fallback queue not initialized');
          }
          return await fallbackQueue.cancelOp(requestId);
        },
        getOptimizerStats: () => {
          return writeOptimizer?.getStats() || { s3QueueSize: 0, counterQueueSize: 0, batchingEnabled: false, debouncingEnabled: false };
        },
      }
    } : {}),
  };
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export all configuration types and validation functions
export * from './config.js';

// Storage helpers
export * as StorageKeys from './storage/keys.js';
export * as StorageS3 from './storage/s3.js';

// Metadata helpers
export * as MetadataMap from './meta/metadataMap.js';
export * as Externalize from './meta/externalize.js';

// Database helpers
export * from './db/schemas.js';
export * from './db/repos.js';
export * from './db/errors.js';
export * from './db/crud.js';
export * from './db/restore.js';
export * from './db/smartInsert.js';

// Fallback queue and optimization
export * from './fallback/schemas.js';
export * from './fallback/queue.js';
export * from './fallback/worker.js';
export * from './fallback/optimizer.js';
export * from './fallback/wrapper.js';

// Counters and enrichment
export * from './counters/counters.js';
export * from './service/enrich.js';

// Re-export main types for convenience
export type {
  ChronosConfig,
  RouteContext,
  VersionSpec,
  SpacesConnection,
  RoutingConfig,
  RetentionConfig,
  RollupConfig,
  CollectionMap,
} from './config.js';

// Re-export state management types and functions
export type { StateTransitionOptions, StateTransitionResult } from './admin/stateManager.js';
export { markItemsAsProcessedByTTL, markItemAsProcessed } from './admin/stateManager.js';

// Re-export bucket management types and functions
export type { BucketManagerOptions, BucketManagerResult, BucketStatus } from './admin/bucketManager.js';
export { ensureBucketsExist, testS3Connectivity, validateSpacesConfiguration } from './admin/bucketManager.js';
