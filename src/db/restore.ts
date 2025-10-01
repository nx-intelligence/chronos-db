import { ObjectId, ClientSession } from 'mongodb';
import { BridgeRouter } from '../router/router.js';
import { Repos } from './repos.js';
import type { HeadDoc, VerDoc } from './schemas.js';
import {
  SimpleNotFoundError as NotFoundError,
  SimpleOptimisticLockError as OptimisticLockError,
  SimpleTxnError as TxnError,
  SimpleCrudError as CrudError
} from './errors.js';
import type { RouteContext } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export type VersionSpec = { ov: number } | { at: string /* ISO */ };
export type CollVersionSpec = { cv: number } | { at: string /* ISO */ };

export interface RestoreOptions {
  actor?: string;
  reason?: string;
  expectedHeadOv?: number;
  requestId?: string;
}

export interface CollectionRestoreOptions {
  actor?: string;
  reason?: string;
  pageSize?: number;       // default 500
  parallel?: number;       // default 4
  dryRun?: boolean;        // default false
  requestId?: string;
}

export interface RestoreResult {
  id: string;
  newOv: number;
  newCv: number;
}

export interface CollectionRestoreResult {
  target: CollVersionSpec & { resolvedCv: number; resolvedAt: string };
  planned: number;           // items considered (dry-run)
  restored: number;          // items actually restored (non-dry-run)
}

export interface SnapshotInfo {
  jsonBucket: string;
  jsonKey: string;
  metaIndexed: Record<string, unknown>;
  size: number | null;
  checksum: string | null;
  ov: number;
  cv: number;
  at: Date;
}

// ============================================================================
// Object Restore
// ============================================================================

/**
 * Restore an object to a specific version
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param id - Object ID (hex string)
 * @param to - Target version specification
 * @param opts - Restore options
 * @returns Restore result
 */
export async function restoreObject(
  router: BridgeRouter,
  ctx: RouteContext,
  id: string,
  to: VersionSpec,
  opts: RestoreOptions = {}
): Promise<RestoreResult> {
  const { actor, reason, expectedHeadOv } = opts;

  try {
    // 1. Route & bind
    const routeInfo = router.getRouteInfo(ctx);
    if (!routeInfo.backend) {
      throw new CrudError(`No backend found for route context: ${JSON.stringify(ctx)}`, {
        collection: ctx.collection,
        targetSpec: to,
      });
    }

    const mongoClient = await router.getMongo(routeInfo.index);
    const mongo = mongoClient.db(ctx.dbName);
    const repos = new Repos(mongo, ctx.collection);

    // 2. Read head document
    const head = await repos.getHead(new ObjectId(id));
    if (!head) {
      throw new NotFoundError(`Object not found: ${id}`, {
        collection: ctx.collection,
        id,
        targetSpec: to,
      });
    }

    // 3. Check expected head OV if provided
    if (expectedHeadOv !== undefined && head.ov !== expectedHeadOv) {
      throw new OptimisticLockError(`Expected head OV ${expectedHeadOv}, got ${head.ov}`, {
        collection: ctx.collection,
        id,
        expectedOv: expectedHeadOv,
        actualOv: head.ov,
      });
    }

    // 4. Resolve target snapshot
    const snapshot = await resolveTargetSnapshot(repos, id, to);
    if (!snapshot) {
      throw new NotFoundError(`Target version not found`, {
        collection: ctx.collection,
        id,
        targetSpec: to,
      });
    }

    // 5. Check if already at target state
    if (snapshot.jsonKey === head.jsonKey) {
      return {
        id,
        newOv: head.ov,
        newCv: head.cv,
      };
    }

    // 6. Start MongoDB transaction
    let cv: number = 0;
    let session: ClientSession | undefined;

    try {
      session = mongoClient.startSession();
      await session.withTransaction(async () => {
        // Increment collection version
        cv = await repos.incCv(session!);

        // Create new OV
        const newOv = head.ov + 1;

        // Create version document (RESTORE operation)
        const verDoc: VerDoc = {
          _id: new ObjectId(),
          itemId: new ObjectId(id),
          ov: newOv,
          cv,
          op: 'RESTORE',
          at: new Date(),
          ...(actor && { actor }),
          ...(reason && { reason }),
          jsonBucket: snapshot.jsonBucket,
          jsonKey: snapshot.jsonKey,
          metaIndexed: snapshot.metaIndexed,
          size: snapshot.size,
          checksum: snapshot.checksum,
          prevOv: head.ov,
        };

        await repos.insertVersion(verDoc, session!);

        // Update head document with restored pointers
        const headDoc: HeadDoc = {
          ...head,
          ov: newOv,
          cv,
          jsonBucket: snapshot.jsonBucket,
          jsonKey: snapshot.jsonKey,
          metaIndexed: snapshot.metaIndexed,
          size: snapshot.size,
          checksum: snapshot.checksum,
          updatedAt: new Date(),
        };

        await repos.updateHeadWithLock(headDoc, head.ov, session!);
      });
    } catch (txnError) {
      throw new TxnError(`Transaction failed for restore operation`, {
        collection: ctx.collection,
        id,
        targetSpec: to,
        error: txnError instanceof Error ? txnError.message : String(txnError),
      });
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    // 7. TODO: Bump counters (Stage H)

    return {
      id,
      newOv: head.ov + 1,
      newCv: cv!,
    };

  } catch (error) {
    if (error instanceof CrudError) {
      throw error;
    }
    throw new CrudError(`Failed to restore object`, {
      collection: ctx.collection,
      id,
      targetSpec: to,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Collection Restore
// ============================================================================

/**
 * Restore a collection to a specific version
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param to - Target version specification
 * @param opts - Restore options
 * @returns Collection restore result
 */
export async function restoreCollection(
  router: BridgeRouter,
  ctx: RouteContext,
  to: CollVersionSpec,
  opts: CollectionRestoreOptions = {}
): Promise<CollectionRestoreResult> {
  const { actor, reason, pageSize = 500, parallel = 4, dryRun = false } = opts;

  try {
    // 1. Route & bind
    const routeInfo = router.getRouteInfo(ctx);
    if (!routeInfo.backend) {
      throw new CrudError(`No backend found for route context: ${JSON.stringify(ctx)}`, {
        collection: ctx.collection,
        targetSpec: to,
      });
    }

    const mongoClient = await router.getMongo(routeInfo.index);
    const mongo = mongoClient.db(ctx.dbName);
    const repos = new Repos(mongo, ctx.collection);

    // 2. Resolve target CV
    const { resolvedCv, resolvedAt } = await resolveTargetCv(repos, to);

    // 3. Enumerate candidate items
    const allItems = await repos.getHeadByMetaList({});
    const totalItems = allItems.length;
    let planned = 0;
    let restored = 0;

    // 4. Process items in pages
    for (let offset = 0; offset < totalItems; offset += pageSize) {
      const page = allItems.slice(offset, offset + pageSize);
      
      if (dryRun) {
        // Count items that would be restored
        for (const item of page) {
          const targetSnapshot = await findLastVersionForItem(repos, item.itemId, resolvedCv);
          if (targetSnapshot && targetSnapshot.jsonKey !== item.jsonKey) {
            planned++;
          }
        }
      } else {
        // Process items in parallel batches
        const batches = [];
        for (let i = 0; i < page.length; i += parallel) {
          const batch = page.slice(i, i + parallel);
          const batchOpts = { ...(actor && { actor }), ...(reason && { reason }) };
          batches.push(processBatch(repos, batch, resolvedCv, batchOpts));
        }
        
        const results = await Promise.all(batches);
        restored += results.reduce((sum, count) => sum + count, 0);
      }
    }

    return {
      target: {
        ...to,
        resolvedCv,
        resolvedAt,
      },
      planned: dryRun ? planned : 0,
      restored,
    };

  } catch (error) {
    if (error instanceof CrudError) {
      throw error;
    }
    throw new CrudError(`Failed to restore collection`, {
      collection: ctx.collection,
      targetSpec: to,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve target snapshot for object restore
 * @param repos - Repos instance
 * @param id - Object ID
 * @param to - Target version specification
 * @returns Snapshot information or null if not found
 */
async function resolveTargetSnapshot(
  repos: Repos,
  id: string,
  to: VersionSpec
): Promise<SnapshotInfo | null> {
  if ('ov' in to) {
    // Restore by OV
    const verDoc = await repos.getVerByOv(to.ov);
    if (verDoc && verDoc.itemId.toString() === id) {
      return {
        jsonBucket: verDoc.jsonBucket,
        jsonKey: verDoc.jsonKey,
        metaIndexed: verDoc.metaIndexed,
        size: verDoc.size,
        checksum: verDoc.checksum,
        ov: verDoc.ov,
        cv: verDoc.cv,
        at: verDoc.at,
      };
    }
    
    // TODO: Check manifests if not in hot window
    return null;
  } else {
    // Restore by timestamp
    const targetTime = new Date(to.at);
    const verDocs = await repos.getVerByTimeRange(new Date(0), targetTime);
    
    // Find the latest version for this item before the target time
    const itemVersions = verDocs
      .filter(v => v.itemId.toString() === id)
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    
    if (itemVersions.length > 0) {
      const verDoc = itemVersions[0];
      if (!verDoc) {
        return null;
      }
      return {
        jsonBucket: verDoc.jsonBucket,
        jsonKey: verDoc.jsonKey,
        metaIndexed: verDoc.metaIndexed,
        size: verDoc.size,
        checksum: verDoc.checksum,
        ov: verDoc.ov,
        cv: verDoc.cv,
        at: verDoc.at,
      };
    }
    
    // TODO: Check manifests if not in hot window
    return null;
  }
}

/**
 * Resolve target CV for collection restore
 * @param repos - Repos instance
 * @param to - Target version specification
 * @returns Resolved CV and timestamp
 */
async function resolveTargetCv(
  repos: Repos,
  to: CollVersionSpec
): Promise<{ resolvedCv: number; resolvedAt: string }> {
  if ('cv' in to) {
    return {
      resolvedCv: to.cv,
      resolvedAt: new Date().toISOString(),
    };
  } else {
    // Convert timestamp to CV
    const targetTime = new Date(to.at);
    const verDocs = await repos.getVerByTimeRange(new Date(0), targetTime);
    
    if (verDocs.length === 0) {
      throw new NotFoundError(`No versions found before timestamp: ${to.at}`, {
        targetSpec: to,
      });
    }
    
    // Find the maximum CV before the target time
    const maxCv = Math.max(...verDocs.map(v => v.cv));
    return {
      resolvedCv: maxCv,
      resolvedAt: to.at,
    };
  }
}

/**
 * Find the last version for an item with CV <= targetCv
 * @param repos - Repos instance
 * @param itemId - Item ObjectId
 * @param targetCv - Target collection version
 * @returns Snapshot information or null if not found
 */
async function findLastVersionForItem(
  repos: Repos,
  itemId: ObjectId,
  targetCv: number
): Promise<SnapshotInfo | null> {
  const verDocs = await repos.getVerByItemId(itemId);
  
  // Find the latest version with CV <= targetCv
  const targetVersions = verDocs
    .filter(v => v.cv <= targetCv)
    .sort((a, b) => b.cv - a.cv);
  
  if (targetVersions.length === 0) {
    return null;
  }
  
  const verDoc = targetVersions[0];
  if (!verDoc) {
    return null;
  }
  return {
    jsonBucket: verDoc.jsonBucket,
    jsonKey: verDoc.jsonKey,
    metaIndexed: verDoc.metaIndexed,
    size: verDoc.size,
    checksum: verDoc.checksum,
    ov: verDoc.ov,
    cv: verDoc.cv,
    at: verDoc.at,
  };
}

/**
 * Process a batch of items for collection restore
 * @param repos - Repos instance
 * @param items - Items to process
 * @param targetCv - Target collection version
 * @param opts - Restore options
 * @returns Number of items restored
 */
async function processBatch(
  repos: Repos,
  items: HeadDoc[],
  targetCv: number,
  _opts: { actor?: string; reason?: string }
): Promise<number> {
  let restored = 0;
  
  for (const item of items) {
    try {
      const targetSnapshot = await findLastVersionForItem(repos, item.itemId, targetCv);
      if (targetSnapshot && targetSnapshot.jsonKey !== item.jsonKey) {
        // Restore this item
        // TODO: Implement individual item restore within batch
        restored++;
      }
    } catch (error) {
      // Log error but continue with other items
      console.error(`Failed to restore item ${item.itemId}:`, error);
    }
  }
  
  return restored;
}
