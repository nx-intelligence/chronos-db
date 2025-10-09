import { validateXronoxConfig, validateTransactionConfig, type XronoxConfig, type RouteContext } from './config.js';
import { setGlobalConfig } from './config/global.js';
import { logger } from './utils/logger.js';
import { loadConfig } from './config/loader.js';
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
 * Main interface for Xronox
 */
export interface Xronox {
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

  /**
   * Fetch a record from Knowledge database with tiered fallback/merge
   * @param collection - Collection name
   * @param filter - MongoDB filter
   * @param options - Tiered fetch options
   * @returns Tiered fetch result
   */
  getKnowledge(
    collection: string,
    filter: Record<string, any>,
    options: import('./read/tiered.js').TieredFetchOptions
  ): Promise<import('./read/tiered.js').TieredFetchResult>;

  /**
   * Fetch a record from Metadata database with tiered fallback/merge
   * @param collection - Collection name
   * @param filter - MongoDB filter
   * @param options - Tiered fetch options
   * @returns Tiered fetch result
   */
  getMetadata(
    collection: string,
    filter: Record<string, any>,
    options: import('./read/tiered.js').TieredFetchOptions
  ): Promise<import('./read/tiered.js').TieredFetchResult>;

  /**
   * Get messaging API for a specific tenant (Chronow integration)
   * @param tenantId - Tenant identifier
   * @returns Messaging API instance
   */
  messaging(tenantId: string): import('./messaging/messagingApi.js').MessagingApi;
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
   * Insert with automatic entity relationship management
   * Extracts entity objects, saves/updates them in their own collections,
   * then creates the main record with references
   * @param data - Data to insert
   * @param entityMappings - Configuration for entity extraction and storage
   * @param actor - Actor performing the operation
   * @param reason - Reason for the operation
   * @returns Insert result with entity operation details
   */
  insertWithEntities(
    data: Record<string, unknown>,
    entityMappings: import('./db/entities.js').EntityMapping[],
    actor?: string,
    reason?: string
  ): Promise<import('./db/entities.js').InsertWithEntitiesResult>;

  /**
   * Get a record with automatic entity relationship fetching
   * Fetches the main record and all related entities from their collections
   * @param id - Main record ID
   * @param entityMappings - Configuration for entity fetching
   * @param opts - Read options
   * @returns Main record and entity records
   */
  getWithEntities(
    id: string,
    entityMappings: import('./db/entities.js').EntityMapping[],
    opts?: ReadOptions
  ): Promise<import('./db/entities.js').GetWithEntitiesResult>;

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
 * Analytics API for counters and advanced analytics
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
   * Get unique analytics results (one row per unique value)
   * @param query - Query parameters
   * @returns Array of unique analytics documents
   */
  getUniqueAnalytics(query: {
    dbName: string;
    collection: string;
    tenant?: string;
    ruleName?: string;
    propertyName?: string;
    limit?: number;
  }): Promise<any[]>;

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
 * Initialize Xronox with the given configuration
 * 
 * @param config - Configuration object (optional - will auto-discover from file if not provided)
 * @param options - Initialization options
 * @returns Xronox instance
 * @throws {XronoxConfigNotFoundError} If no config provided and no config file found
 * @throws {XronoxEnvVarMissingError} If ENV variable referenced in config is missing
 * @throws {XronoxConfigValidationError} If configuration is invalid
 * 
 * @example
 * // Option 1: Provide config explicitly
 * const xronox = initXronox({ dbConnections: { ... }, databases: { ... } });
 * 
 * @example
 * // Option 2: Auto-discover from xronox.config.json
 * const xronox = initXronox();
 */
export function initXronox(
  config?: XronoxConfig,
  options?: { verbose?: boolean }
): Xronox {
  const startTime = Date.now();
  
  // Load configuration (from argument or file)
  const loadResult = loadConfig(config, options?.verbose ? { verbose: true } : {});
  const finalConfig = loadResult.config;
  
  // Log configuration source
  if (loadResult.source === 'file') {
    logger.info('Xronox configuration loaded from file', {
      filePath: loadResult.filePath,
      resolvedEnvVars: loadResult.resolvedVars?.length || 0,
    });
  }
  
  logger.info('Initializing xronox', {
    version: '3.0.2',
    databasesCount: Object.keys(finalConfig.databases).length,
    hasSpacesConnections: !!finalConfig.spacesConnections && Object.keys(finalConfig.spacesConnections).length > 0,
    localStorageEnabled: finalConfig.localStorage?.enabled,
    transactionsEnabled: finalConfig.transactions?.enabled
  });
  
  // Validate configuration
  const validatedConfig = validateXronoxConfig(finalConfig);
  
  // Validate transaction configuration (async, but we'll handle it in background)
  validateTransactionConfig(validatedConfig).catch(error => {
    logger.error('xronox configuration validation failed', {}, error);
    // Don't throw here as it would break the synchronous initialization
    // The error will be caught when transactions are actually attempted
  });
  
  // Set global configuration for access throughout the application
  setGlobalConfig(validatedConfig);

  // Initialize router
  logger.debug('Initializing BridgeRouter');
  const router = new BridgeRouter({
    dbConnections: validatedConfig.dbConnections,
    spacesConnections: validatedConfig.spacesConnections,
    databases: validatedConfig.databases,
    ...(validatedConfig.localStorage && { localStorage: validatedConfig.localStorage }),
    hashAlgo: validatedConfig.routing.hashAlgo,
    chooseKey: validatedConfig.routing.chooseKey ?? 'tenantId|dbName|collection:objectId',
    config: validatedConfig, // Pass full config for projection and other features
  });
  logger.debug('BridgeRouter initialized successfully');

  // Initialize analytics (counters, time-based, cross-tenant)
  let countersRepo: CounterTotalsRepo | null = null;
  const initAnalytics = async () => {
    // Check if runtime databases have analytics configured
    if (!validatedConfig.databases.runtime?.tenantDatabases) {
      return null; // Skip analytics if no runtime databases configured
    }
    
    if (!countersRepo) {
      // Use the first runtime tenant database for analytics
      const firstTenantDb = validatedConfig.databases.runtime.tenantDatabases[0];
      if (!firstTenantDb) {
        throw new Error('No runtime tenant databases configured');
      }
      
      const dbConn = validatedConfig.dbConnections[firstTenantDb.dbConnRef];
      if (!dbConn) {
        throw new Error(`Database connection '${firstTenantDb.dbConnRef}' not found`);
      }
      
      const analyticsClient = new MongoClient(dbConn.mongoUri);
      await analyticsClient.connect();
      const analyticsDb = analyticsClient.db(firstTenantDb.analyticsDbName);
      countersRepo = new CounterTotalsRepo(analyticsDb, validatedConfig.analytics?.counterRules || []);
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
  if (validatedConfig.databases.metadata?.genericDatabase) {
    const dbConn = validatedConfig.dbConnections[validatedConfig.databases.metadata.genericDatabase.dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  } else if (validatedConfig.databases.knowledge?.genericDatabase) {
    const dbConn = validatedConfig.dbConnections[validatedConfig.databases.knowledge.genericDatabase.dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  } else if (validatedConfig.databases.runtime?.tenantDatabases?.[0]) {
    const dbConn = validatedConfig.dbConnections[validatedConfig.databases.runtime.tenantDatabases[0].dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  } else if (validatedConfig.databases.logs) {
    const dbConn = validatedConfig.dbConnections[validatedConfig.databases.logs.dbConnRef];
    if (dbConn) fallbackMongoUri = dbConn.mongoUri;
  }

  if (validatedConfig.fallback?.enabled && fallbackMongoUri) {
    const fallbackClient = new MongoClient(fallbackMongoUri);
    fallbackClient.connect().then(() => {
      const fallbackDb = fallbackClient.db('chronos_system');
      if (validatedConfig.fallback) {
        fallbackQueue = new FallbackQueue(fallbackDb, validatedConfig.fallback);
      }
      
      // Initialize worker
      if (validatedConfig.fallback && fallbackQueue) {
        const workerOptions: WorkerOptions = {
          ...validatedConfig.fallback,
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
  if (validatedConfig.writeOptimization) {
    writeOptimizer = new WriteOptimizer(validatedConfig.writeOptimization);
  }

  // Log initialization completion
  const duration = Date.now() - startTime;
  logger.info('xronox initialization completed successfully', {
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
          if (validatedConfig.devShadow) {
            crudConfig.devShadow = validatedConfig.devShadow;
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
          if (validatedConfig.devShadow) {
            crudConfig.devShadow = validatedConfig.devShadow;
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
          if (validatedConfig.devShadow) {
            crudConfig.devShadow = validatedConfig.devShadow;
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
          if (validatedConfig.devShadow) {
            enrichConfig.devShadow = validatedConfig.devShadow;
          }
          return await enrichRecord(router, enrichCtx, id, enrichment, opts, enrichConfig);
        },
        smartInsert: async (
          data: Record<string, unknown>,
          opts: SmartInsertOptions
        ) => {
          const smartConfig: any = {};
          if (validatedConfig.devShadow) {
            smartConfig.devShadow = validatedConfig.devShadow;
          }
          return await smartInsert(router, ctx, data, opts, smartConfig);
        },
        insertWithEntities: async (
          data: Record<string, unknown>,
          entityMappings: import('./db/entities.js').EntityMapping[],
          actor?: string,
          reason?: string
        ) => {
          const { insertWithEntities } = await import('./db/entities.js');
          return await insertWithEntities({
            record: data,
            collection: ctx.collection,
            entityMappings,
            ctx,
            requester: actor || 'system',
            reason: reason || 'insertWithEntities',
            router,
          });
        },
        getWithEntities: async (
          id: string,
          entityMappings: import('./db/entities.js').EntityMapping[],
          opts?: ReadOptions
        ) => {
          const { getWithEntities } = await import('./db/entities.js');
          return await getWithEntities({
            id,
            collection: ctx.collection,
            entityMappings,
            ctx,
            router,
            ...(opts && { readOptions: opts }),
          });
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
        const repo = await initAnalytics();
        if (!repo) {
          throw new Error('Analytics not configured - add analytics config to enable this functionality');
        }
        return await repo.getTotals(query);
      },
      getUniqueAnalytics: async (query) => {
        const repo = await initAnalytics();
        if (!repo) {
          throw new Error('Analytics not configured - add analytics config to enable this functionality');
        }
        return await repo.getUniqueAnalytics(query);
      },
      resetTotals: async (query) => {
        const repo = await initAnalytics();
        if (!repo) {
          throw new Error('Analytics not configured - add analytics config to enable this functionality');
        }
        await repo.resetTotals(query);
      },
    },

    admin: {
      health: async () => {
        return await health(router, validatedConfig);
      },
      shutdown: async () => {
        await shutdown(router, validatedConfig);
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

    getKnowledge: async (
      collection: string,
      filter: Record<string, any>,
      options: import('./read/tiered.js').TieredFetchOptions
    ) => {
      const { getKnowledge } = await import('./read/tiered.js');
      return await getKnowledge(router, collection, filter, options);
    },

    getMetadata: async (
      collection: string,
      filter: Record<string, any>,
      options: import('./read/tiered.js').TieredFetchOptions
    ) => {
      const { getMetadata } = await import('./read/tiered.js');
      return await getMetadata(router, collection, filter, options);
    },

    messaging: (tenantId: string) => {
      // Resolve messaging database connection (single database for all tenants)
      const dbInfo = router.resolveDatabaseConnection({ 
        databaseType: 'messaging',
        dbName: '',  // Not used for messaging (single DB for all)
        collection: ''  // Not used for messaging
      });
      
      if (!dbInfo) {
        throw new Error('No messaging database configured');
      }

      // Get MongoDB client
      const mongoClientPromise = router.getMongoClient(dbInfo.mongoUri);
      
      // Get captureDeliveries flag from config
      const captureDeliveries = validatedConfig.databases.messaging?.captureDeliveries ?? false;

      // Import and create messaging API
      const { createMessagingApi } = require('./messaging/messagingApi.js');
      
      // Create proxy that lazily initializes on first method call
      let cachedClient: any = null;
      let apiInstance: any = null;
      
      const getClient = async () => {
        if (!cachedClient) {
          cachedClient = await mongoClientPromise;
        }
        return cachedClient;
      };
      
      const getApi = async () => {
        if (!apiInstance) {
          const client = await getClient();
          apiInstance = createMessagingApi({
            mongoClient: client,
            dbName: dbInfo.dbName,
            tenantId,
            captureDeliveries,
          });
        }
        return apiInstance;
      };

      // Return proxy object that matches MessagingApi interface
      return {
        shared: {
          save: async (opts: any) => (await getApi()).shared.save(opts),
          load: async (opts: any) => (await getApi()).shared.load(opts),
          tombstone: async (opts: any) => (await getApi()).shared.tombstone(opts),
        },
        topics: {
          ensure: async (opts: any) => (await getApi()).topics.ensure(opts),
          get: async (opts: any) => (await getApi()).topics.get(opts),
        },
        messages: {
          save: async (opts: any) => (await getApi()).messages.save(opts),
          get: async (opts: any) => (await getApi()).messages.get(opts),
          list: async (opts: any) => (await getApi()).messages.list(opts),
        },
        get deliveries() {
          if (!captureDeliveries) return undefined;
          return {
            append: async (opts: any) => (await getApi()).deliveries?.append(opts),
            listByMessage: async (opts: any) => (await getApi()).deliveries?.listByMessage(opts),
          };
        },
        deadLetters: {
          save: async (opts: any) => (await getApi()).deadLetters.save(opts),
          list: async (opts: any) => (await getApi()).deadLetters.list(opts),
        },
      } as any;
    },
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
export * from './analytics/advancedAnalytics.js';
export * from './service/enrich.js';

// Entity relationships and tiered fetching
export * from './db/entities.js';
export * from './read/tiered.js';
export * from './read/merge.js';

// Messaging (Chronow integration)
export * from './messaging/schemas.js';
export * from './messaging/messagingApi.js';

// Configuration Builder
export { 
  XronoxConfigBuilder, 
  createDevConfig, 
  createProductionConfig, 
  createMinimalConfig 
} from './config/builder.js';

// Configuration Loading & ENV Resolution
export {
  discoverConfigFile,
  loadConfigFromFile,
  autoLoadConfig,
} from './config/loader.js';
export type { LoadConfigOptions, LoadConfigResult } from './config/loader.js';

export {
  resolveEnvTokens,
  extractEnvTokens,
  maskSecret,
  maskSecretsInObject,
} from './config/envResolver.js';
export type { EnvResolutionOptions, EnvResolutionResult } from './config/envResolver.js';

// Configuration Errors
export {
  XronoxError,
  XronoxConfigNotFoundError,
  XronoxConfigParseError,
  XronoxEnvVarMissingError,
  XronoxConfigValidationError,
  XronoxConfigStructureError,
} from './config/errors.js';

// Identity Types (Standard attribution for ecosystem)
export type { Identity, IdentityType } from './types/identity.js';
export {
  createIdentity,
  createUserIdentity,
  createAgentIdentity,
  createSystemIdentity,
  createAPIIdentity,
  validateIdentity,
  isIdentity,
  identityToString,
  parseIdentityString,
} from './types/identity.js';

// XronoxClient (MongoDB-like API)
export { XronoxClient, createXronoxClient } from './client/XronoxClient.js';
export type {
  XronoxClientConfig,
  InsertOptions,
  FindOneOptions,
  FindOptions,
  UpdateOptions,
  DeleteOptions,
} from './client/XronoxClient.js';

// Backwards compatibility alias
/**
 * @deprecated Use initXronox instead. Kept for backwards compatibility.
 */
export const initChronos = initXronox;

// Re-export main types for convenience
export type {
  XronoxConfig,
  RouteContext,
  VersionSpec,
  SpacesConnection,
  RoutingConfig,
  RetentionConfig,
  RollupConfig,
  CollectionMap,
} from './config.js';

// Backwards compatibility type alias
/**
 * @deprecated Use XronoxConfig instead. Kept for backwards compatibility.
 */
export type ChronosConfig = XronoxConfig;

// Re-export state management types and functions
export type { StateTransitionOptions, StateTransitionResult } from './admin/stateManager.js';
export { markItemsAsProcessedByTTL, markItemAsProcessed } from './admin/stateManager.js';

// Re-export bucket management types and functions
export type { BucketManagerOptions, BucketManagerResult, BucketStatus } from './admin/bucketManager.js';
export { ensureBucketsExist, testS3Connectivity, validateSpacesConfiguration } from './admin/bucketManager.js';
