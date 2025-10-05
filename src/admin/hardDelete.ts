import { ObjectId, ClientSession } from 'mongodb';
import { BridgeRouter } from '../router/router.js';
import { Repos } from '../db/repos.js';
import { CounterTotalsRepo } from '../counters/counters.js';
import type { HeadDoc, VerDoc } from '../db/schemas.js';
import type { RouteContext } from '../config.js';
import { 
  ValidationError, 
  NotFoundError, 
  TxnError 
} from '../db/errors.js';

// ============================================================================
// Types
// ============================================================================

export interface HardDeleteOptions {
  /** Confirm hard delete operation */
  confirm: boolean;
  /** Actor performing the operation */
  actor?: string;
  /** Reason for hard delete */
  reason?: string;
  /** Dry run - don't actually delete */
  dryRun?: boolean;
}

export interface HardDeleteResult {
  /** Item ID that was deleted */
  id: string;
  /** Number of versions deleted */
  versionsDeleted: number;
  /** Number of S3 objects deleted */
  s3ObjectsDeleted: number;
  /** S3 keys that were deleted */
  deletedS3Keys: string[];
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Timestamp of deletion */
  deletedAt: Date;
}

export interface HardDeleteCollectionResult {
  /** Collection name */
  collection: string;
  /** Number of items deleted */
  itemsDeleted: number;
  /** Total versions deleted */
  totalVersionsDeleted: number;
  /** Total S3 objects deleted */
  totalS3ObjectsDeleted: number;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Timestamp of deletion */
  deletedAt: Date;
}

// ============================================================================
// Hard Delete Functions
// ============================================================================

/**
 * Hard delete a single item (irreversible)
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param id - Item ID to delete
 * @param opts - Hard delete options
 * @returns Hard delete result
 */
export async function hardDeleteItem(
  router: BridgeRouter,
  ctx: RouteContext,
  id: string,
  opts: HardDeleteOptions
): Promise<HardDeleteResult> {
  if (!opts.confirm) {
    throw new ValidationError(
      'Hard delete requires explicit confirmation',
      'HARD_DELETE',
      ctx.collection,
      id
    );
  }

  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  const storage = router.getStorage(routeInfo.index);
  const spaces = router.getSpaces(routeInfo.index);
  
  if (!mongo || !storage || !spaces) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const objectId = new ObjectId(id);

  // Get all versions for this item
  const versions = await repos.getVerByItemId(objectId);
  if (versions.length === 0) {
    throw new NotFoundError(
      `Item not found: ${id}`,
      'HARD_DELETE',
      ctx.collection,
      id
    );
  }

  // Collect all S3 keys to delete
  const s3KeysToDelete: string[] = [];
  for (const version of versions) {
    s3KeysToDelete.push(version.jsonKey);
  }

  // Get head document to check for additional S3 keys
  const head = await repos.getHead(objectId);
  if (head) {
    // Add any additional S3 keys from head (e.g., externalized content)
    // This is a simplified version - in practice, you'd need to scan the item.json
    // for ref objects and collect their S3 keys
  }

  if (opts.dryRun) {
    return {
      id,
      versionsDeleted: versions.length,
      s3ObjectsDeleted: s3KeysToDelete.length,
      deletedS3Keys: s3KeysToDelete,
      dryRun: true,
      deletedAt: new Date(),
    };
  }

  let session: ClientSession | undefined;
  let versionsDeleted = 0;
  let s3ObjectsDeleted = 0;
  const deletedS3Keys: string[] = [];

  try {
    session = mongoClient.startSession();
    await session.withTransaction(async () => {
      // Delete all versions
      for (const version of versions) {
        await repos.deleteVersion(version._id, session!);
        versionsDeleted++;
      }

      // Delete head document
      if (head) {
        await repos.deleteHead(objectId, session!);
      }

      // Update counters
      const countersRepo = new CounterTotalsRepo(mongo, []);
      await countersRepo.bumpTotals({
        scope: {
          dbName: ctx.dbName,
          collection: ctx.collection,
          ...(ctx.tenantId && { tenantId: ctx.tenantId }),
        },
        op: 'DELETE',
        metaIndexed: head?.metaIndexed || {},
      });
    });
  } catch (error) {
    throw new TxnError(
      `Hard delete transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'HARD_DELETE',
      ctx.collection,
      id,
      undefined,
      undefined
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }

  // Delete S3 objects (best effort)
  for (const key of s3KeysToDelete) {
    try {
      await storage.del(spaces.buckets.json, key);
      s3ObjectsDeleted++;
      deletedS3Keys.push(key);
    } catch (error) {
      // Log but don't fail - S3 cleanup is best effort
      console.error(`Failed to delete S3 object ${key}:`, error);
    }
  }

  return {
    id,
    versionsDeleted,
    s3ObjectsDeleted,
    deletedS3Keys,
    dryRun: false,
    deletedAt: new Date(),
  };
}

/**
 * Hard delete an entire collection (irreversible)
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param opts - Hard delete options
 * @returns Hard delete collection result
 */
export async function hardDeleteCollection(
  router: BridgeRouter,
  ctx: RouteContext,
  opts: HardDeleteOptions
): Promise<HardDeleteCollectionResult> {
  if (!opts.confirm) {
    throw new ValidationError(
      'Hard delete requires explicit confirmation',
      'HARD_DELETE',
      ctx.collection,
      undefined
    );
  }

  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  const storage = router.getStorage(routeInfo.index);
  const spaces = router.getSpaces(routeInfo.index);
  
  if (!mongo || !storage || !spaces) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);

  // Get all head documents for this collection
  const heads = await repos.getAllHeads();
  
  if (opts.dryRun) {
    let totalVersions = 0;
    for (const head of heads) {
      const versions = await repos.getVerByItemId(head._id);
      totalVersions += versions.length;
    }

    return {
      collection: ctx.collection,
      itemsDeleted: heads.length,
      totalVersionsDeleted: totalVersions,
      totalS3ObjectsDeleted: totalVersions, // Simplified
      dryRun: true,
      deletedAt: new Date(),
    };
  }

  let itemsDeleted = 0;
  let totalVersionsDeleted = 0;
  let totalS3ObjectsDeleted = 0;

  for (const head of heads) {
    try {
      const result = await hardDeleteItem(router, ctx, head._id.toString(), {
        ...opts,
        confirm: true, // Already confirmed at collection level
      });
      
      itemsDeleted++;
      totalVersionsDeleted += result.versionsDeleted;
      totalS3ObjectsDeleted += result.s3ObjectsDeleted;
    } catch (error) {
      // Log but continue with other items
      console.error(`Failed to hard delete item ${head._id}:`, error);
    }
  }

  return {
    collection: ctx.collection,
    itemsDeleted,
    totalVersionsDeleted,
    totalS3ObjectsDeleted,
    dryRun: false,
    deletedAt: new Date(),
  };
}

/**
 * List items that are candidates for hard delete (logically deleted items)
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param limit - Maximum number of items to return
 * @returns List of logically deleted items
 */
export async function listHardDeleteCandidates(
  router: BridgeRouter,
  ctx: RouteContext,
  limit: number = 100
): Promise<Array<{ id: string; deletedAt: Date; ov: number }>> {
  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  
  if (!mongo) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  
  // Get logically deleted items
  const deletedHeads = await repos.getDeletedHeads(limit);
  
  return deletedHeads.map(head => ({
    id: head._id.toString(),
    deletedAt: head.deletedAt!,
    ov: head.ov,
  }));
}

/**
 * Clean up orphaned S3 objects (objects that don't have corresponding version documents)
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param opts - Cleanup options
 * @returns Cleanup result
 */
export async function cleanupOrphanedS3Objects(
  router: BridgeRouter,
  ctx: RouteContext,
  opts: { dryRun?: boolean; batchSize?: number } = {}
): Promise<{ orphanedKeys: string[]; deletedKeys: string[]; dryRun: boolean }> {
  const routeInfo = router.getRouteInfo(ctx);
  const storage = router.getStorage(routeInfo.index);
  const spaces = router.getSpaces(routeInfo.index);
  
  if (!storage || !spaces) {
    throw new Error('Backend not available');
  }

  const batchSize = opts.batchSize || 1000;
  const orphanedKeys: string[] = [];
  const deletedKeys: string[] = [];
  let continuationToken: string | undefined;

  // List all objects in the JSON bucket
  do {
    const result = await storage.list(spaces.buckets.json, `${ctx.collection}/`, { 
      maxKeys: batchSize,
      ...(continuationToken && { continuationToken })
    });

    for (const key of result.keys) {
      // Check if this key has a corresponding version document
      const hasVersion = await checkS3KeyHasVersion(router, ctx, key);
      if (!hasVersion) {
        orphanedKeys.push(key);
        
        if (!opts.dryRun) {
          try {
            await storage.del(spaces.buckets.json, key);
            deletedKeys.push(key);
          } catch (error) {
            console.error(`Failed to delete orphaned storage object ${key}:`, error);
          }
        }
      }
    }

    continuationToken = result.nextToken;
  } while (continuationToken);

  return {
    orphanedKeys,
    deletedKeys,
    dryRun: opts.dryRun || false,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an S3 key has a corresponding version document
 */
async function checkS3KeyHasVersion(
  router: BridgeRouter,
  ctx: RouteContext,
  s3Key: string
): Promise<boolean> {
  // Parse the S3 key to extract item ID and version
  // This is a simplified implementation - in practice, you'd need to parse
  // the key format used by your storage layout
  const keyParts = s3Key.split('/');
  if (keyParts.length < 3) return false;

  const itemId = keyParts[keyParts.length - 2];
  const version = keyParts[keyParts.length - 1];

  try {
    const routeInfo = router.getRouteInfo(ctx);
    const mongoClient = await router.getMongo(routeInfo.index);
    const mongo = mongoClient.db(ctx.dbName);
    
    if (!mongo) return false;

    const repos = new Repos(mongo, ctx.collection);
    const versionNum = parseInt(version.replace('v', ''));
    if (isNaN(versionNum)) return false;
    const verDoc = await repos.getVerByOv(versionNum);
    return verDoc !== null;
  } catch {
    return false;
  }
}
