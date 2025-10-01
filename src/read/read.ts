import { ObjectId } from 'mongodb';
// No longer using S3-specific imports - using StorageAdapter interface
// import { GetObjectCommand } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BridgeRouter } from '../router/router.js';
import { Repos } from '../db/repos.js';
import type { StorageAdapter } from '../storage/interface.js';
import type { HeadDoc, VerDoc } from '../db/schemas.js';

// ============================================================================
// Types
// ============================================================================

export interface ReadContext {
  dbName: string;
  collection: string;
  tenantId?: string;
  forcedIndex?: number;
}

export interface PresignOptions {
  presign?: boolean;         // default false
  ttlSeconds?: number;       // default 3600
  includeText?: boolean;     // if the ref has textKey, also presign it
}

export type RefObject = {
  ref: {
    contentBucket: string;
    blobKey: string;
    textKey?: string;
  };
};

export interface ReadOptions extends PresignOptions {
  projection?: string[];         // whitelist of top-level fields to include (on transformed JSON)
  includeDeleted?: boolean;      // explicitly include deleted items (default: false - HIDDEN like MongoDB)
  includeMeta?: boolean;         // include _meta with ov/cv/at (default: false - HIDDEN)
  preferShadow?: boolean;        // use dev shadow if available (latest only)
  ov?: number;                   // exact object version (historical read - EXPLICIT)
  at?: Date | string;            // ISO 8601; version at/before this time (historical read - EXPLICIT)
}

export interface QueryOptions extends PresignOptions {
  projection?: string[];         // whitelist of top-level fields
  includeDeleted?: boolean;      // explicitly include deleted items (default: false - HIDDEN like MongoDB)
  includeMeta?: boolean;         // include _meta with ov/cv/at (default: false - HIDDEN)
  at?: Date | string;            // ISO 8601; point-in-time query (EXPLICIT)
  limit?: number;                // default 50, max 1000
  sort?: Array<{ field: string; dir: 1 | -1 }>; // fields limited to meta/indexed/system
  pageToken?: string;            // opaque pagination cursor
}

export interface MetaFilter {
  [key: string]: any;            // Mongo-ish filter on metaIndexed (safe subset)
}

export interface ItemView {
  id: string;
  item: Record<string, unknown>;     // transformed JSON (with ref objects) - MAIN DATA
  _meta?: {                          // metadata (hidden by default, show with includeMeta option)
    ov: number;
    cv: number;
    at: string;                      // commit time for the version
    metaIndexed: Record<string, unknown>;
    deletedAt?: string;
  };
  presigned?: {
    [jsonPath: string]: {            // e.g. "avatar"
      blobUrl?: string;
      textUrl?: string;
      expiresIn?: number;
    }
  };
}

// ============================================================================
// Read Functions
// ============================================================================

/**
 * Get an item (latest by default, or historical with ov/at)
 * @param router - Bridge router instance
 * @param ctx - Read context
 * @param id - Item ID
 * @param opts - Read options
 * @returns Item view or null if not found
 */
export async function getItem(
  router: BridgeRouter,
  ctx: ReadContext,
  id: string,
  opts: ReadOptions = {}
): Promise<ItemView | null> {
  // Validate: can't provide both ov and at
  if (opts.ov !== undefined && opts.at !== undefined) {
    throw new Error('Cannot specify both ov and at options');
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

  // 1. If ov is provided → return that exact version
  if (opts.ov !== undefined) {
    const verDoc = await repos.getVerByOv(opts.ov);
    if (!verDoc) {
      return null;
    }
    return await hydrateItemViewFromVersion(storage, spaces, verDoc, opts);
  }

  // 2. If at is provided → return version at/before that time
  if (opts.at !== undefined) {
    const targetTime = typeof opts.at === 'string' ? new Date(opts.at) : opts.at;
    const verDocs = await repos.getVerByTimeRange(new Date(0), targetTime);
    
    if (!verDocs || verDocs.length === 0) {
      return null;
    }

    const latestVer = verDocs[verDocs.length - 1];
    if (!latestVer) {
      return null;
    }
    return await hydrateItemViewFromVersion(storage, spaces, latestVer, opts);
  }

  // 3. Default → return latest from _head
  const head = await repos.getHead(objectId);
  
  if (!head) {
    return null;
  }

  // HIDE deleted items by default (like regular MongoDB)
  // Only show if explicitly requested via includeDeleted
  if (head.deletedAt && !opts.includeDeleted) {
    return null;
  }

  return await hydrateItemView(storage, spaces, head, opts);
}

/**
 * @deprecated Use getItem() instead. This is a thin alias for backwards compatibility.
 */
export async function getLatest(
  router: BridgeRouter,
  ctx: ReadContext,
  id: string,
  opts: ReadOptions = {}
): Promise<ItemView | null> {
  console.warn('[DEPRECATED] getLatest() is deprecated. Use getItem() instead.');
  return await getItem(router, ctx, id, opts);
}

/**
 * @deprecated Use getItem() with { ov } option instead.
 */
export async function getVersion(
  router: BridgeRouter,
  ctx: ReadContext,
  id: string,
  ov: number,
  opts: ReadOptions = {}
): Promise<ItemView | null> {
  console.warn('[DEPRECATED] getVersion() is deprecated. Use getItem(id, { ov }) instead.');
  return await getItem(router, ctx, id, { ...opts, ov });
}

/**
 * @deprecated Use getItem() with { at } option instead.
 */
export async function getAsOf(
  router: BridgeRouter,
  ctx: ReadContext,
  id: string,
  isoTime: string,
  opts: ReadOptions = {}
): Promise<ItemView | null> {
  console.warn('[DEPRECATED] getAsOf() is deprecated. Use getItem(id, { at }) instead.');
  return await getItem(router, ctx, id, { ...opts, at: isoTime });
}

/**
 * Query a collection (latest by default, or as-of time with at option)
 * @param router - Bridge router instance
 * @param ctx - Read context
 * @param filter - Metadata filter
 * @param opts - Query options
 * @returns Query result with items and pagination cursor
 */
export async function query(
  router: BridgeRouter,
  ctx: ReadContext,
  filter: MetaFilter,
  opts: QueryOptions = {}
): Promise<{ items: ItemView[]; pageToken?: string }> {
  const routeInfo = router.getRouteInfo(ctx);
  const mongoClient = await router.getMongo(routeInfo.index);
  const mongo = mongoClient.db(ctx.dbName);
  const storage = router.getStorage(routeInfo.index);
  const spaces = router.getSpaces(routeInfo.index);
  
  if (!mongo || !storage || !spaces) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const limit = Math.min(opts.limit || 50, 1000);
  
  // Build safe filter for metaIndexed
  const safeFilter = buildSafeFilter(filter);
  
  // Add pagination cursor if provided
  if (opts.pageToken) {
    safeFilter['_id'] = { $gt: new ObjectId(opts.pageToken) };
  }

  // If as-of time is provided, query from _ver instead of _head
  if (opts.at !== undefined) {
    return await queryAsOfTime(router, ctx, safeFilter, opts, storage, spaces, repos, limit);
  }

  // Default: query latest from _head
  const heads = await repos.getHeadByMetaList(safeFilter);
  
  const items: ItemView[] = [];
  let lastId: string | undefined;
  
  for (const head of heads) {
    // HIDE deleted items by default (like regular MongoDB)
    // Only show if explicitly requested via includeDeleted
    if (head.deletedAt && !opts.includeDeleted) {
      continue;
    }

    const itemView = await hydrateItemView(storage, spaces, head, opts);
    if (itemView) {
      items.push(itemView);
      lastId = head._id.toString();
    }

    if (items.length >= limit) {
      break;
    }
  }

  return {
    items,
    ...(items.length === limit && lastId && { pageToken: lastId }),
  };
}

/**
 * @deprecated Use query() instead. This is a thin alias for backwards compatibility.
 */
export async function listByMeta(
  router: BridgeRouter,
  ctx: ReadContext,
  filter: MetaFilter,
  opts: QueryOptions = {}
): Promise<{ items: ItemView[]; pageToken?: string }> {
  console.warn('[DEPRECATED] listByMeta() is deprecated. Use query() instead.');
  return await query(router, ctx, filter, opts);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Query as of a specific time (from _ver collection)
 */
async function queryAsOfTime(
  _router: BridgeRouter,
  _ctx: ReadContext,
  safeFilter: Record<string, any>,
  opts: QueryOptions,
  storage: StorageAdapter,
  spaces: any,
  repos: Repos,
  limit: number
): Promise<{ items: ItemView[]; pageToken?: string }> {
  const targetTime = typeof opts.at === 'string' ? new Date(opts.at) : opts.at!;
  
  // This is a simplified implementation
  // In production, you'd want to optimize this query
  const verDocs = await repos.getVerByTimeRange(new Date(0), targetTime);
  
  // Group by itemId and get latest version per item
  const latestPerItem = new Map<string, typeof verDocs[0]>();
  for (const ver of verDocs) {
    const itemIdStr = ver.itemId.toString();
    const existing = latestPerItem.get(itemIdStr);
    if (!existing || ver.ov > existing.ov) {
      latestPerItem.set(itemIdStr, ver);
    }
  }

  const items: ItemView[] = [];
  let lastId: string | undefined;

  for (const ver of latestPerItem.values()) {
    // Apply metadata filter
    const matchesFilter = Object.entries(safeFilter).every(([key, value]) => {
      if (key.startsWith('metaIndexed.')) {
        const field = key.substring('metaIndexed.'.length);
        return ver.metaIndexed[field] === value;
      }
      return true;
    });

    if (!matchesFilter) {
      continue;
    }

    const itemView = await hydrateItemViewFromVersion(storage, spaces, ver, opts);
    if (itemView) {
      items.push(itemView);
      lastId = ver.itemId.toString();
    }

    if (items.length >= limit) {
      break;
    }
  }

  return {
    items,
    ...(items.length === limit && lastId && { pageToken: lastId }),
  };
}

/**
 * Hydrate item view from head document
 */
async function hydrateItemView(
  storage: StorageAdapter,
  _spaces: any,
  head: HeadDoc,
  opts: ReadOptions
): Promise<ItemView> {
  // Fetch item.json from storage
  const item = await storage.getJSON(head.jsonBucket, head.jsonKey);
  
  // Apply projection if specified
  const projectedItem = opts.projection ? projectFields(item, opts.projection) : item;
  
  // Generate presigned URLs if requested
  const presigned = opts.presign ? await generatePresignedUrls(storage, projectedItem, opts) : undefined;
  
  // Build result - like regular MongoDB, just return the data by default
  const result: ItemView = {
    id: head._id.toString(),
    item: projectedItem,
    ...(presigned && { presigned }),
  };

  // Only include metadata if explicitly requested (HIDDEN by default)
  if (opts.includeMeta) {
    result._meta = {
      ov: head.ov,
      cv: head.cv,
      at: head.updatedAt.toISOString(),
      metaIndexed: head.metaIndexed,
      ...(head.deletedAt && { deletedAt: head.deletedAt.toISOString() }),
    };
  }

  return result;
}

/**
 * Hydrate item view from version document
 */
async function hydrateItemViewFromVersion(
  storage: StorageAdapter,
  _spaces: any,
  verDoc: VerDoc,
  opts: ReadOptions
): Promise<ItemView> {
  // Fetch item.json from storage
  const item = await storage.getJSON(verDoc.jsonBucket, verDoc.jsonKey);
  
  // Apply projection if specified
  const projectedItem = opts.projection ? projectFields(item, opts.projection) : item;
  
  // Generate presigned URLs if requested
  const presigned = opts.presign ? await generatePresignedUrls(storage, projectedItem, opts) : undefined;
  
  // Build result - like regular MongoDB, just return the data by default
  const result: ItemView = {
    id: verDoc.itemId.toString(),
    item: projectedItem,
    ...(presigned && { presigned }),
  };

  // Only include metadata if explicitly requested (HIDDEN by default)
  if (opts.includeMeta) {
    result._meta = {
      ov: verDoc.ov,
      cv: verDoc.cv,
      at: verDoc.at.toISOString(),
      metaIndexed: verDoc.metaIndexed,
    };
  }

  return result;
}

/**
 * Project fields from an object
 */
function projectFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  return result;
}

/**
 * Generate presigned URLs for ref objects
 */
async function generatePresignedUrls(
  storage: StorageAdapter,
  item: Record<string, unknown>,
  opts: PresignOptions
): Promise<Record<string, { blobUrl?: string; textUrl?: string; expiresIn?: number }> | undefined> {
  if (!opts.presign) {
    return undefined;
  }

  const ttlSeconds = opts.ttlSeconds || 3600;
  const presigned: Record<string, { blobUrl?: string; textUrl?: string; expiresIn?: number }> = {};
  
  // Walk the object recursively to find ref objects
  await walkForRefs(item, async (path, refObj) => {
    if (isRefObject(refObj)) {
      const { contentBucket, blobKey, textKey } = refObj.ref;
      
      try {
        // Generate presigned URL for blob
        const blobUrl = await storage.presignGet(contentBucket, blobKey, ttlSeconds);
        
        presigned[path] = {
          blobUrl,
          expiresIn: ttlSeconds,
        };
        
        // Generate presigned URL for text if requested and available
        if (opts.includeText && textKey) {
          const textUrl = await storage.presignGet(contentBucket, textKey, ttlSeconds);
          presigned[path].textUrl = textUrl;
        }
      } catch (error) {
        // Log but don't fail - presigning is best effort
        console.error(`Failed to generate presigned URL for ${path}:`, error);
      }
    }
  });
  
  return Object.keys(presigned).length > 0 ? presigned : undefined;
}

/**
 * Check if an object is a ref object
 */
function isRefObject(obj: unknown): obj is RefObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'ref' in obj &&
    typeof (obj as any).ref === 'object' &&
    (obj as any).ref !== null &&
    'contentBucket' in (obj as any).ref &&
    'blobKey' in (obj as any).ref
  );
}

/**
 * Walk object recursively to find ref objects
 */
async function walkForRefs(
  obj: unknown,
  callback: (path: string, refObj: unknown) => Promise<void>,
  path = ''
): Promise<void> {
  if (obj === null || typeof obj !== 'object') {
    return;
  }
  
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      await walkForRefs(obj[i], callback, `${path}[${i}]`);
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (isRefObject(value)) {
        await callback(currentPath, value);
      } else {
        await walkForRefs(value, callback, currentPath);
      }
    }
  }
}

/**
 * Build safe filter for metaIndexed queries
 */
function buildSafeFilter(filter: Record<string, any>): Record<string, any> {
  const safeFilter: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith('metaIndexed.')) {
      const field = key.substring('metaIndexed.'.length);
      safeFilter[`metaIndexed.${field}`] = value;
    } else {
      // Allow direct metaIndexed field access
      safeFilter[`metaIndexed.${key}`] = value;
    }
  }
  
  return safeFilter;
}
