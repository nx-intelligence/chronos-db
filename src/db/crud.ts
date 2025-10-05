import { ObjectId, ClientSession } from 'mongodb';
// S3Client no longer directly used - using StorageAdapter interface
// import { S3Client } from '@aws-sdk/client-s3';
import { BridgeRouter } from '../router/router.js';
import { Repos } from './repos.js';
import type { HeadDoc, VerDoc } from './schemas.js';
import { 
  ValidationError, 
  NotFoundError, 
  OptimisticLockError, 
  StorageError, 
  TxnError, 
  ExternalizationError,
  RouteMismatchError,
  CrudError
} from './errors.js';
import type { RouteContext } from '../config.js';
import type { StorageAdapter } from '../storage/interface.js';
import { externalizeBase64 } from '../meta/externalize.js';
import { extractIndexed, validateRequiredIndexed, getBase64Properties } from '../meta/metadataMap.js';
import { getGlobalConfig } from '../config/global.js';
import { shouldUseTransactions } from '../utils/replicaSet.js';
import { logger } from '../utils/logger.js';
// No longer using s3.ts directly - using StorageAdapter interface
// import { putJSON, del } from '../storage/s3.js';
import { jsonKey } from '../storage/keys.js';
import { createSystemHeader, updateSystemHeader, deleteSystemHeader, addSystemHeader, extractSystemHeader, markAsSynced } from '../meta/systemFields.js';
import type { DevShadowConfig } from '../config.js';
import { TransactionLockManager, withTransactionLock } from './transactionLock.js';

// ============================================================================
// Types
// ============================================================================

export interface CrudOptions {
  actor?: string | undefined;
  reason?: string | undefined;
  requestId?: string | undefined;
  devShadowOverride?: boolean | undefined;
  /** Server ID for transaction locking */
  serverId?: string | undefined;
  /** Parent record for lineage tracking */
  parentRecord?: {
    id: string;           // The _id of the parent
    collection: string;   // The collection of the parent
    dbName?: string;      // Optional db name (defaults to current context)
  } | undefined;
  /** Direct origin specification (for external data imports) */
  origin?: {
    id: string;           // Origin record ID (can be external system ID like "stripe_cus_123")
    collection: string;   // Origin collection/entity name (e.g., "customers")
    system?: string;      // External system name (e.g., "stripe", "salesforce")
  } | undefined;
}

export interface CrudResult {
  id: string;
  ov: number;
  cv: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export interface CreateResult {
  id: string;
  ov: number;
  cv: number;
  createdAt: Date;
}

export interface UpdateResult {
  id: string;
  ov: number;
  cv: number;
  updatedAt: Date;
}

export interface DeleteResult {
  id: string;
  ov: number;
  cv: number;
  deletedAt: Date;
}

export interface CompensationContext {
  jsonBucket: string;
  contentBucket: string;
  writtenKeys: string[];
  storage: StorageAdapter;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique server ID for this process
 * @returns Server ID string
 */
function generateServerId(): string {
  const hostname = require('os').hostname();
  const pid = process.pid;
  const timestamp = Date.now();
  return `${hostname}-${pid}-${timestamp}`;
}

// ============================================================================
// Transaction Helper Functions
// ============================================================================

/**
 * Execute operation with or without transactions based on configuration
 */
async function executeWithTransactionSupport<T>(
  mongoClient: any,
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const config = getGlobalConfig();
  const mongoUri = config?.mongoUris?.[0];
  
  logger.debug('Starting transaction support check', {
    mongoUri: mongoUri?.replace(/\/\/.*@/, '//***@'),
    transactionsEnabled: config?.transactions?.enabled,
    autoDetect: config?.transactions?.autoDetect
  });
  
  if (!mongoUri) {
    logger.error('No MongoDB URI available for transaction check');
    throw new Error('No MongoDB URI available for transaction check');
  }
  
  const useTransactions = await shouldUseTransactions(
    { enabled: config?.transactions?.enabled ?? true, autoDetect: config?.transactions?.autoDetect ?? true },
    mongoUri
  );
  
  logger.debug('Transaction support decision made', {
    useTransactions,
    mongoUri: mongoUri.replace(/\/\/.*@/, '//***@')
  });
  
  if (useTransactions) {
    // Use transactions
    logger.debug('Executing operation with transactions');
    const session = mongoClient.startSession();
    try {
      const result = await session.withTransaction(operation);
      const duration = Date.now() - startTime;
      logger.debug('Transaction operation completed successfully', { durationMs: duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Transaction operation failed', { durationMs: duration }, error as Error);
      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    // Execute without transactions
    logger.debug('Executing operation without transactions');
    const session = mongoClient.startSession();
    try {
      const result = await operation(session);
      const duration = Date.now() - startTime;
      logger.debug('Non-transaction operation completed successfully', { durationMs: duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Non-transaction operation failed', { durationMs: duration }, error as Error);
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new item
 * @param router - Bridge router instance
 * @param ctx - Routing context
 * @param data - Item data
 * @param opts - Optional metadata
 * @returns Create result
 */
export async function createItem(
  router: BridgeRouter,
  ctx: RouteContext,
  data: Record<string, unknown>,
  opts: CrudOptions = {},
  config?: { devShadow?: DevShadowConfig }
): Promise<CreateResult> {
  const { actor, reason, serverId = generateServerId() } = opts;
  const op = 'CREATE';
  const startTime = Date.now();
  
  logger.debug('Starting create operation', {
    collection: ctx.collection,
    dbName: ctx.dbName,
    tenantId: ctx.tenantId,
    dataKeys: Object.keys(data),
    serverId
  });
  
  // VERBOSE: Log full data being created
  logger.fullData('CREATE operation input', data, {
    collection: ctx.collection,
    dbName: ctx.dbName,
    tenantId: ctx.tenantId
  });
  
  try {
    // 1. Route to backend
    const routeInfo = router.getRouteInfo(ctx);
    const mongoClient = await router.getMongo(routeInfo.index);
    const mongo = mongoClient.db(routeInfo.resolvedDbName || ctx.dbName);
    const storage = router.getStorage(routeInfo.index);
    const spaces = router.getSpaces(routeInfo.index);
    
    if (!mongo || !storage || !spaces) {
      throw new RouteMismatchError(
        'Backend not available',
        op,
        ctx.collection,
        undefined,
        undefined,
        undefined,
        routeInfo.index,
        routeInfo.routingKey
      );
    }

    // 2. Get collection map and validate
    const collectionMap = getCollectionMap(ctx.collection);
    
    // 3. Validate required fields (only if collection map has required fields)
    if (collectionMap.validation?.requiredIndexed?.length > 0) {
      try {
        validateRequiredIndexed(data, collectionMap);
      } catch (error) {
        throw new ValidationError(
          `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          op,
          ctx.collection
        );
      }
    }

    // 4. Generate IDs and version
    const id = new ObjectId();
    const idHex = id.toHexString();
    const ov = 0;
    const now = new Date();

    // 5. Create transaction lock manager
    const lockManager = new TransactionLockManager(mongoClient, ctx.dbName, ctx.collection);

    // 6. Execute create operation with transaction lock
    return await withTransactionLock(
      lockManager,
      id,
      'CREATE',
      { serverId, requestId: opts.requestId },
      async () => {

        // 7. Externalize base64 properties
        const base64Props = getBase64Properties(data, collectionMap);
        let transformed = { ...data };
        let metaIndexed: Record<string, unknown> = {};
        let writtenKeys: string[] = [];

        if (base64Props.length > 0) {
          try {
            const externalizeResult = await externalizeBase64({
              storage,
              contentBucket: spaces.contentBucket,
              collection: ctx.collection,
              idHex,
              ov,
              data,
              map: collectionMap,
            });

            transformed = externalizeResult.transformed;
            metaIndexed = externalizeResult.metaIndexed;
            writtenKeys = externalizeResult.writtenKeys;
          } catch (error) {
            throw new ExternalizationError(
              `Externalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              op,
              ctx.collection,
              idHex
            );
          }
        } else {
          // Extract indexed properties for non-externalized data
          metaIndexed = extractIndexed(data, collectionMap);
        }

        // 7.5. Add system fields
        const lineageInfo = (opts.parentRecord || opts.origin) ? {
          ...(opts.parentRecord && { parentRecord: opts.parentRecord }),
          ...(opts.origin && { origin: opts.origin }),
        } : undefined;
        const systemHeader = createSystemHeader(now, lineageInfo, 'new-not-synched');
        transformed = addSystemHeader(transformed, systemHeader);

        // 8. Write item.json to S3
        const jKey = jsonKey(ctx.collection, idHex, ov);
        let size: number;
        let sha256: string;

        // VERBOSE: Log storage operation details
        logger.storageOperation('putJSON', spaces.jsonBucket, jKey, transformed, {
          operation: 'CREATE',
          collection: ctx.collection,
          itemId: idHex,
          ov
        });

        try {
          const result = await storage.putJSON(spaces.jsonBucket, jKey, transformed);
          size = result.size ?? 0;
          sha256 = result.sha256 || '';
          writtenKeys.push(jKey);
          
          // Mark as synced after successful JSON storage
          const syncedSystemHeader = markAsSynced(systemHeader);
          transformed = addSystemHeader(transformed, syncedSystemHeader);
        } catch (error) {
          throw new StorageError(
            `Failed to write item.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
            op,
            ctx.collection,
            idHex,
            ov
          );
        }

        // 9. MongoDB operation (with or without transactions based on config)
        const repos = new Repos(mongo, ctx.collection);
        let cv: number = 0;

        try {
          await executeWithTransactionSupport(mongoClient, async (session) => {
            // Ensure indexes
            await repos.ensureIndexes(collectionMap);

            // Increment collection version
            cv = await repos.incCv(session);

            // Create version document
            const verDoc: VerDoc = {
              _id: new ObjectId(),
              itemId: id,
              ov,
              cv,
              op: 'CREATE',
              at: now,
              ...(actor && { actor }),
              ...(reason && { reason }),
              jsonBucket: spaces.jsonBucket,
              jsonKey: jKey,
              metaIndexed,
              size: size ?? 0,
              checksum: sha256,
            };

            // Create head document
            const headDoc: HeadDoc = {
              _id: id,
              itemId: id,
              ov,
              cv,
              jsonBucket: spaces.jsonBucket,
              jsonKey: jKey,
              metaIndexed,
              size: size ?? 0,
              checksum: sha256,
              createdAt: now,
              updatedAt: now,
            };

            // Add dev shadow if enabled
            if (config?.devShadow?.enabled || opts.devShadowOverride) {
              const shadowData = { ...transformed };
              const shadowBytes = JSON.stringify(shadowData).length;
              const maxBytes = config?.devShadow?.maxBytesPerDoc;
              
              if (!maxBytes || shadowBytes <= maxBytes) {
                headDoc.fullShadow = {
                  ov,
                  at: now,
                  data: shadowData,
                  bytes: shadowBytes,
                };
              }
            }

            // VERBOSE: Log MongoDB operations
            logger.mongoOperation('insertVersion', ctx.collection, undefined, verDoc, undefined, {
              operation: 'CREATE',
              itemId: idHex
            });
            
            logger.mongoOperation('upsertHead', ctx.collection, undefined, headDoc, undefined, {
              operation: 'CREATE',
              itemId: idHex
            });

            // Insert documents
            await repos.insertVersion(verDoc, session);
            await repos.upsertHead(headDoc, session);
          });
        } catch (error) {
          // Compensation: delete written S3 keys
          await compensateS3(storage, spaces.jsonBucket, spaces.contentBucket, writtenKeys);
          
          throw new TxnError(
            `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            op,
            ctx.collection,
            idHex,
            ov,
            cv
          );
        }

        // 10. Return result
        const duration = Date.now() - startTime;
        const result = {
          id: idHex,
          ov,
          cv: cv,
          createdAt: now,
        };
        
        logger.debug('Create operation completed successfully', {
          id: idHex,
          ov,
          cv,
          durationMs: duration,
          collection: ctx.collection
        });
        
        return result;
      }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Create operation failed', {
      collection: ctx.collection,
      dbName: ctx.dbName,
      durationMs: duration,
      serverId
    }, error as Error);
    
    if (error instanceof CrudError) {
      throw error;
    }
    
    throw new TxnError(
      `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      op,
      ctx.collection
    );
  }
}

/**
 * Update an existing item
 * @param router - Bridge router instance
 * @param ctx - Routing context
 * @param id - Item ID
 * @param data - Updated data
 * @param opts - Optional metadata including expectedOv for optimistic locking
 * @returns Update result
 */
export async function updateItem(
  router: BridgeRouter,
  ctx: RouteContext,
  id: string,
  data: Record<string, unknown>,
  opts: CrudOptions & { expectedOv?: number } = {},
  config?: { devShadow?: DevShadowConfig }
): Promise<UpdateResult> {
  const { actor, reason, expectedOv, serverId = generateServerId() } = opts;
  const op = 'UPDATE';
  
  try {
    // 1. Route to backend
    const routeInfo = router.getRouteInfo(ctx);
    const mongoClient = await router.getMongo(routeInfo.index);
    const mongo = mongoClient.db(routeInfo.resolvedDbName || ctx.dbName);
    const storage = router.getStorage(routeInfo.index);
    const spaces = router.getSpaces(routeInfo.index);
    
    if (!mongo || !storage || !spaces) {
      throw new RouteMismatchError(
        'Backend not available',
        op,
        ctx.collection,
        id,
        undefined,
        undefined,
        routeInfo.index,
        routeInfo.routingKey
      );
    }

    // 2. Get collection map and validate
    const collectionMap = getCollectionMap(ctx.collection);
    if (!collectionMap) {
      throw new ValidationError(
        `Collection map not found for ${ctx.collection}`,
        op,
        ctx.collection,
        id
      );
    }

    // 3. Validate required fields
    try {
      validateRequiredIndexed(data, collectionMap);
    } catch (error) {
      throw new ValidationError(
        `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        op,
        ctx.collection,
        id
      );
    }

    // 4. Get current head document
    const repos = new Repos(mongo, ctx.collection);
    const head = await repos.getHead(new ObjectId(id));
    
    if (!head) {
      throw new NotFoundError(
        `Item not found: ${id}`,
        op,
        ctx.collection,
        id
      );
    }

    // 5. Check optimistic lock
    if (expectedOv !== undefined && head.ov !== expectedOv) {
      throw new OptimisticLockError(
        `Expected OV ${expectedOv}, but head has OV ${head.ov}`,
        op,
        ctx.collection,
        id,
        head.ov
      );
    }

    // 6. Compute new version
    const ov = head.ov + 1;
    const now = new Date();

    // 7. Create transaction lock manager
    const lockManager = new TransactionLockManager(mongoClient, ctx.dbName, ctx.collection);

    // 8. Execute update operation with transaction lock
    return await withTransactionLock(
      lockManager,
      new ObjectId(id),
      'UPDATE',
      { serverId, requestId: opts.requestId },
      async () => {

        // 9. Externalize base64 properties
        const base64Props = getBase64Properties(data, collectionMap);
        let transformed = { ...data };
        let metaIndexed: Record<string, unknown> = {};
        let writtenKeys: string[] = [];

        if (base64Props.length > 0) {
          try {
            const externalizeResult = await externalizeBase64({
              storage,
              contentBucket: spaces.contentBucket,
              collection: ctx.collection,
              idHex: id,
              ov,
              data,
              map: collectionMap,
            });

            transformed = externalizeResult.transformed;
            metaIndexed = externalizeResult.metaIndexed;
            writtenKeys = externalizeResult.writtenKeys;
          } catch (error) {
            throw new ExternalizationError(
              `Externalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              op,
              ctx.collection,
              id,
              ov
            );
          }
        } else {
          metaIndexed = extractIndexed(data, collectionMap);
        }

        // 9.5. Add system fields
        const systemHeader = updateSystemHeader(extractSystemHeader(transformed) || createSystemHeader(head.createdAt), now, 'new-not-synched');
        transformed = addSystemHeader(transformed, systemHeader);

        // 10. Write item.json to S3
        const jKey = jsonKey(ctx.collection, id, ov);
        let size: number;
        let sha256: string;

        try {
          const result = await storage.putJSON(spaces.jsonBucket, jKey, transformed);
          size = result.size ?? 0;
          sha256 = result.sha256 || '';
          writtenKeys.push(jKey);
          
          // Mark as synced after successful JSON storage
          const syncedSystemHeader = markAsSynced(systemHeader);
          transformed = addSystemHeader(transformed, syncedSystemHeader);
        } catch (error) {
          throw new StorageError(
            `Failed to write item.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
            op,
            ctx.collection,
            id,
            ov
          );
        }

        // 11. MongoDB operation (with or without transactions based on config)
        let cv: number = 0;

        try {
          await executeWithTransactionSupport(mongoClient, async (session) => {
            // Increment collection version
            cv = await repos.incCv(session);

            // Create version document
            const verDoc: VerDoc = {
              _id: new ObjectId(),
              itemId: new ObjectId(id),
              ov,
              cv,
              op: 'UPDATE',
              at: now,
              ...(actor && { actor }),
              ...(reason && { reason }),
              jsonBucket: spaces.jsonBucket,
              jsonKey: jKey,
              metaIndexed,
              size: size ?? 0,
              checksum: sha256,
              prevOv: head.ov,
            };

            // Update head document
            const headDoc: HeadDoc = {
              _id: new ObjectId(id),
              itemId: new ObjectId(id),
              ov,
              cv,
              jsonBucket: spaces.jsonBucket,
              jsonKey: jKey,
              metaIndexed,
              size: size ?? 0,
              checksum: sha256,
              createdAt: head.createdAt,
              updatedAt: now,
            };

            // Add dev shadow if enabled
            if (config?.devShadow?.enabled || opts.devShadowOverride) {
              const shadowData = { ...transformed };
              const shadowBytes = JSON.stringify(shadowData).length;
              const maxBytes = config?.devShadow?.maxBytesPerDoc;
              
              if (!maxBytes || shadowBytes <= maxBytes) {
                headDoc.fullShadow = {
                  ov,
                  at: now,
                  data: shadowData,
                  bytes: shadowBytes,
                };
              }
            }

            // Insert version and update head with optimistic lock
            await repos.insertVersion(verDoc, session);
            await repos.updateHeadWithLock(headDoc, head.ov, session);
          });
        } catch (error) {
          // Compensation: delete written S3 keys
          await compensateS3(storage, spaces.jsonBucket, spaces.contentBucket, writtenKeys);
          
          throw new TxnError(
            `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            op,
            ctx.collection,
            id,
            ov,
            cv
          );
        }

        // 12. Return result
        return {
          id,
          ov,
          cv: cv!,
          updatedAt: now,
        };
      }
    );

  } catch (error) {
    if (error instanceof CrudError) {
      throw error;
    }
    
    throw new TxnError(
      `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      op,
      ctx.collection,
      id
    );
  }
}

/**
 * Delete an item (logical deletion)
 * @param router - Bridge router instance
 * @param ctx - Routing context
 * @param id - Item ID
 * @param opts - Optional metadata including expectedOv for optimistic locking
 * @returns Delete result
 */
export async function deleteItem(
  router: BridgeRouter,
  ctx: RouteContext,
  id: string,
  opts: CrudOptions & { expectedOv?: number } = {},
  config?: { devShadow?: DevShadowConfig }
): Promise<DeleteResult> {
  const { actor, reason, expectedOv, serverId = generateServerId() } = opts;
  const op = 'DELETE';
  
  try {
    // 1. Route to backend
    const routeInfo = router.getRouteInfo(ctx);
    const mongoClient = await router.getMongo(routeInfo.index);
    const mongo = mongoClient.db(routeInfo.resolvedDbName || ctx.dbName);
    const storage = router.getStorage(routeInfo.index);
    const spaces = router.getSpaces(routeInfo.index);
    
    if (!mongo || !storage || !spaces) {
      throw new RouteMismatchError(
        'Backend not available',
        op,
        ctx.collection,
        id,
        undefined,
        undefined,
        routeInfo.index,
        routeInfo.routingKey
      );
    }

    // 2. Get current head document
    const repos = new Repos(mongo, ctx.collection);
    const head = await repos.getHead(new ObjectId(id));
    
    if (!head) {
      throw new NotFoundError(
        `Item not found: ${id}`,
        op,
        ctx.collection,
        id
      );
    }

    // 3. Check optimistic lock
    if (expectedOv !== undefined && head.ov !== expectedOv) {
      throw new OptimisticLockError(
        `Expected OV ${expectedOv}, but head has OV ${head.ov}`,
        op,
        ctx.collection,
        id,
        head.ov
      );
    }

    // 4. Compute new version
    const ov = head.ov + 1;
    const now = new Date();

    // 5. Create transaction lock manager
    const lockManager = new TransactionLockManager(mongoClient, ctx.dbName, ctx.collection);

    // 6. Execute delete operation with transaction lock
    return await withTransactionLock(
      lockManager,
      new ObjectId(id),
      'DELETE',
      { serverId, requestId: opts.requestId },
      async () => {

        // 7. MongoDB operation (with or without transactions based on config)
        let cv: number = 0;

        try {
          await executeWithTransactionSupport(mongoClient, async (session) => {
            // Increment collection version
            cv = await repos.incCv(session);

            // Create version document (tombstone with previous snapshot)
            const verDoc: VerDoc = {
              _id: new ObjectId(),
              itemId: new ObjectId(id),
              ov,
              cv,
              op: 'DELETE',
              at: now,
              ...(actor && { actor }),
              ...(reason && { reason }),
              jsonBucket: head.jsonBucket,
              jsonKey: head.jsonKey, // Reference previous snapshot
              metaIndexed: head.metaIndexed,
              size: head.size,
              checksum: head.checksum,
              prevOv: head.ov,
            };

            // Update head document with deletion timestamp
            const headDoc: HeadDoc = {
              ...head,
              ov,
              cv,
              updatedAt: now,
              deletedAt: now,
            };

            // Add dev shadow if enabled
            if (config?.devShadow?.enabled || opts.devShadowOverride) {
              // For delete, we need to get the previous data and mark it as deleted
              const previousData = head.fullShadow?.data || {};
              const systemHeader = deleteSystemHeader(extractSystemHeader(previousData) || createSystemHeader(head.createdAt), now);
              const shadowData = addSystemHeader(previousData, systemHeader);
              const shadowBytes = JSON.stringify(shadowData).length;
              const maxBytes = config?.devShadow?.maxBytesPerDoc;
              
              if (!maxBytes || shadowBytes <= maxBytes) {
                headDoc.fullShadow = {
                  ov,
                  at: now,
                  data: shadowData,
                  bytes: shadowBytes,
                };
              }
            }

            // Insert version and update head with optimistic lock
            await repos.insertVersion(verDoc, session);
            await repos.updateHeadWithLock(headDoc, head.ov, session);
          });
        } catch (error) {
          throw new TxnError(
            `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            op,
            ctx.collection,
            id,
            ov,
            cv
          );
        }

        // 8. Return result
        return {
          id,
          ov,
          cv: cv!,
          deletedAt: now,
        };
      }
    );

  } catch (error) {
    if (error instanceof CrudError) {
      throw error;
    }
    
    throw new TxnError(
      `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      op,
      ctx.collection,
      id
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get collection map for a collection name
 * @param collectionName - Collection name
 * @returns Collection map or default map with all properties indexed
 */
function getCollectionMap(collectionName: string): any {
  // Try to get collection map from global config
  const globalConfig = getGlobalConfig();
  const collectionMap = globalConfig?.collectionMaps?.[collectionName];
  
  if (collectionMap) {
    return collectionMap;
  }
  
  // If no collection map is defined, return a default map that indexes all properties
  // This means all properties will be considered indexed/mapped
  return {
    indexedProps: [], // Empty array means all properties are indexed
    base64Props: {},
    validation: {
      requiredIndexed: [],
    },
  };
}

/**
 * Compensate S3 writes by deleting written keys
 * @param s3 - S3 client
 * @param jsonBucket - JSON bucket name
 * @param contentBucket - Content bucket name
 * @param writtenKeys - Keys to delete
 */
async function compensateS3(
  storage: StorageAdapter,
  jsonBucket: string,
  contentBucket: string,
  writtenKeys: string[]
): Promise<void> {
  const deletePromises = writtenKeys.map(async (key) => {
    try {
      if (key.endsWith('.json')) {
        await storage.del(jsonBucket, key);
      } else {
        await storage.del(contentBucket, key);
      }
    } catch (error) {
      // Log but don't throw - compensation is best effort
      console.warn(`Failed to delete storage key ${key}:`, error);
    }
  });

  await Promise.all(deletePromises);
}
