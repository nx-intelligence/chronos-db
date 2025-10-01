import { ObjectId, ClientSession } from 'mongodb';
import { BridgeRouter } from '../router/router.js';
import { Repos } from '../db/repos.js';
import type { HeadDoc } from '../db/schemas.js';
import type { RouteContext, DevShadowConfig } from '../config.js';
import { 
  ValidationError, 
  TxnError 
} from '../db/errors.js';

// ============================================================================
// Types
// ============================================================================

export interface ShrinkOptions {
  /** Confirm shrink operation */
  confirm: boolean;
  /** Dry run - don't actually shrink */
  dryRun?: boolean;
  /** Force shrink even if TTL hasn't expired */
  force?: boolean;
  /** Actor performing the operation */
  actor?: string;
  /** Reason for shrink */
  reason?: string;
}

export interface ShrinkResult {
  /** Collection name */
  collection: string;
  /** Number of items processed */
  itemsProcessed: number;
  /** Number of shadows shrunk */
  shadowsShrunk: number;
  /** Total bytes freed */
  bytesFreed: number;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Timestamp of shrink operation */
  shrunkAt: Date;
}

export interface ShrinkItemResult {
  /** Item ID */
  id: string;
  /** Whether shadow was shrunk */
  shrunk: boolean;
  /** Bytes freed */
  bytesFreed: number;
  /** Reason for not shrinking (if applicable) */
  reason?: string;
}

// ============================================================================
// Shrink Functions
// ============================================================================

/**
 * Shrink dev shadows for a collection
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param config - Dev shadow configuration
 * @param opts - Shrink options
 * @returns Shrink result
 */
export async function shrinkDevShadows(
  router: BridgeRouter,
  ctx: RouteContext,
  config: DevShadowConfig,
  opts: ShrinkOptions
): Promise<ShrinkResult> {
  if (!opts.confirm) {
    throw new ValidationError(
      'Shrink operation requires explicit confirmation',
      'SHRINK',
      ctx.collection,
      undefined
    );
  }

  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  
  if (!mongo) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const now = new Date();
  const ttlMs = config.ttlHours * 60 * 60 * 1000;

  // Get all head documents with dev shadows
  const headsWithShadows = await repos.getHeadsWithDevShadows();
  
  let itemsProcessed = 0;
  let shadowsShrunk = 0;
  let totalBytesFreed = 0;
  const itemResults: ShrinkItemResult[] = [];

  for (const head of headsWithShadows) {
    const result = await shrinkItemShadow(head, config, now, ttlMs, opts);
    itemResults.push(result);
    itemsProcessed++;

    if (result.shrunk) {
      shadowsShrunk++;
      totalBytesFreed += result.bytesFreed;
    }
  }

  if (!opts.dryRun && shadowsShrunk > 0) {
    // Update head documents to remove shrunk shadows
    await updateShrunkShadows(repos, itemResults.filter(r => r.shrunk), mongoClient);
  }

  return {
    collection: ctx.collection,
    itemsProcessed,
    shadowsShrunk,
    bytesFreed: totalBytesFreed,
    dryRun: opts.dryRun || false,
    shrunkAt: new Date(),
  };
}

/**
 * Shrink dev shadows for a specific item
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param id - Item ID
 * @param config - Dev shadow configuration
 * @param opts - Shrink options
 * @returns Shrink item result
 */
export async function shrinkItemShadow(
  router: BridgeRouter,
  ctx: RouteContext,
  id: string,
  config: DevShadowConfig,
  opts: ShrinkOptions
): Promise<ShrinkItemResult> {
  if (!opts.confirm) {
    throw new ValidationError(
      'Shrink operation requires explicit confirmation',
      'SHRINK',
      ctx.collection,
      id
    );
  }

  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  
  if (!mongo) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const head = await repos.getHead(new ObjectId(id));
  
  if (!head || !head.fullShadow) {
    return {
      id,
      shrunk: false,
      bytesFreed: 0,
      reason: 'No dev shadow found',
    };
  }

  const now = new Date();
  const ttlMs = config.ttlHours * 60 * 60 * 1000;
  
  return await shrinkItemShadow(head, config, now, ttlMs, opts);
}

/**
 * Shrink a single item's dev shadow
 */
async function shrinkItemShadow(
  head: HeadDoc,
  config: DevShadowConfig,
  now: Date,
  ttlMs: number,
  opts: ShrinkOptions
): Promise<ShrinkItemResult> {
  if (!head.fullShadow) {
    return {
      id: head._id.toString(),
      shrunk: false,
      bytesFreed: 0,
      reason: 'No dev shadow found',
    };
  }

  const shadowAge = now.getTime() - head.fullShadow.at.getTime();
  const isExpired = shadowAge > ttlMs;
  const isOversized = config.maxBytesPerDoc && 
    head.fullShadow.bytes && 
    head.fullShadow.bytes > config.maxBytesPerDoc;

  if (!isExpired && !isOversized && !opts.force) {
    return {
      id: head._id.toString(),
      shrunk: false,
      bytesFreed: 0,
      reason: `Shadow not expired (age: ${Math.round(shadowAge / 1000 / 60)}min, TTL: ${config.ttlHours}h) and not oversized`,
    };
  }

  const bytesToFree = head.fullShadow.bytes || 0;

  if (opts.dryRun) {
    return {
      id: head._id.toString(),
      shrunk: true,
      bytesFreed: bytesToFree,
    };
  }

  return {
    id: head._id.toString(),
    shrunk: true,
    bytesFreed: bytesToFree,
  };
}

/**
 * Update head documents to remove shrunk shadows
 */
async function updateShrunkShadows(
  repos: Repos,
  shrunkItems: ShrinkItemResult[],
  mongoClient: any
): Promise<void> {
  if (shrunkItems.length === 0) return;

  let session: ClientSession | undefined;

  try {
    session = mongoClient.startSession();
    await session.withTransaction(async () => {
      for (const item of shrunkItems) {
        await repos.updateHeadShadow(new ObjectId(item.id), null, session!);
      }
    });
  } catch (error) {
    throw new TxnError(
      `Shrink transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SHRINK',
      'unknown',
      undefined,
      undefined,
      undefined
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

/**
 * Get dev shadow statistics for a collection
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @returns Dev shadow statistics
 */
export async function getDevShadowStats(
  router: BridgeRouter,
  ctx: RouteContext
): Promise<{
  totalItems: number;
  itemsWithShadows: number;
  totalShadowBytes: number;
  averageShadowBytes: number;
  oldestShadow: Date | null;
  newestShadow: Date | null;
  oversizedShadows: number;
}> {
  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  
  if (!mongo) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const headsWithShadows = await repos.getHeadsWithDevShadows();
  
  const totalItems = await repos.getHeadCount();
  const itemsWithShadows = headsWithShadows.length;
  
  let totalShadowBytes = 0;
  let oversizedShadows = 0;
  let oldestShadow: Date | null = null;
  let newestShadow: Date | null = null;

  for (const head of headsWithShadows) {
    if (head.fullShadow) {
      const bytes = head.fullShadow.bytes || 0;
      totalShadowBytes += bytes;
      
      if (bytes > 1024 * 1024) { // 1MB threshold for oversized
        oversizedShadows++;
      }
      
      if (!oldestShadow || head.fullShadow.at < oldestShadow) {
        oldestShadow = head.fullShadow.at;
      }
      
      if (!newestShadow || head.fullShadow.at > newestShadow) {
        newestShadow = head.fullShadow.at;
      }
    }
  }

  return {
    totalItems,
    itemsWithShadows,
    totalShadowBytes,
    averageShadowBytes: itemsWithShadows > 0 ? totalShadowBytes / itemsWithShadows : 0,
    oldestShadow,
    newestShadow,
    oversizedShadows,
  };
}

/**
 * List items with dev shadows that are candidates for shrinking
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param config - Dev shadow configuration
 * @param limit - Maximum number of items to return
 * @returns List of items with shrinkable shadows
 */
export async function listShrinkableShadows(
  router: BridgeRouter,
  ctx: RouteContext,
  config: DevShadowConfig,
  limit: number = 100
): Promise<Array<{
  id: string;
  shadowBytes: number;
  shadowAge: number; // in minutes
  isExpired: boolean;
  isOversized: boolean;
  reason: string;
}>> {
  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  
  if (!mongo) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const headsWithShadows = await repos.getHeadsWithDevShadows();
  
  const now = new Date();
  const ttlMs = config.ttlHours * 60 * 60 * 1000;
  const candidates: Array<{
    id: string;
    shadowBytes: number;
    shadowAge: number;
    isExpired: boolean;
    isOversized: boolean;
    reason: string;
  }> = [];

  for (const head of headsWithShadows) {
    if (!head.fullShadow) continue;

    const shadowAge = now.getTime() - head.fullShadow.at.getTime();
    const isExpired = shadowAge > ttlMs;
    const isOversized = config.maxBytesPerDoc && 
      head.fullShadow.bytes && 
      head.fullShadow.bytes > config.maxBytesPerDoc;

    if (isExpired || isOversized) {
      let reason = '';
      if (isExpired && isOversized) {
        reason = 'Expired and oversized';
      } else if (isExpired) {
        reason = 'Expired';
      } else {
        reason = 'Oversized';
      }

      candidates.push({
        id: head._id.toString(),
        shadowBytes: head.fullShadow.bytes || 0,
        shadowAge: Math.round(shadowAge / 1000 / 60), // minutes
        isExpired,
        isOversized,
        reason,
      });
    }
  }

  // Sort by shadow age (oldest first) and limit results
  return candidates
    .sort((a, b) => b.shadowAge - a.shadowAge)
    .slice(0, limit);
}
