import { BridgeRouter } from '../router/router.js';
import type { RouteContext } from '../config.js';
import { Repos } from './repos.js';
import { createItem } from './crud.js';
import { enrichRecord } from '../service/enrich.js';
import type { CrudOptions } from './crud.js';
import type { EnrichOptions } from '../service/enrich.js';

// ============================================================================
// Smart Insert
// ============================================================================

export interface SmartInsertOptions {
  /** Unique key fields to check for existing record */
  uniqueKeys: string[];
  /** Actor performing the operation */
  actor?: string;
  /** Reason for the operation */
  reason?: string;
  /** Function ID for provenance (if merging) */
  functionId?: string;
  /** Parent record for lineage tracking */
  parentRecord?: {
    id: string;
    collection: string;
    dbName?: string;
  };
  /** Dev shadow override */
  devShadowOverride?: boolean;
}

export interface SmartInsertResult {
  /** Record ID */
  id: string;
  /** Object version */
  ov: number;
  /** Collection version */
  cv: number;
  /** Whether a new record was created (true) or existing merged (false) */
  created: boolean;
  /** Timestamp of operation */
  at: Date;
}

/**
 * Smart insert: Check if record exists by unique keys, merge if exists, create if not
 * 
 * This is like MongoDB's upsert, but with Xronox's enrichment merge semantics:
 * - If no matching record exists → CREATE new record
 * - If matching record exists → ENRICH (deep merge) into existing record
 * 
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param data - Data to insert or merge
 * @param opts - Smart insert options with unique keys
 * @param config - Optional configuration
 * @returns Smart insert result
 * 
 * @example
 * // Check by email, create or merge
 * const result = await smartInsert(router, ctx, 
 *   { email: 'john@example.com', name: 'John', tags: ['vip'] },
 *   { uniqueKeys: ['email'], functionId: 'importer@v1' }
 * );
 * 
 * if (result.created) {
 *   console.log('Created new record:', result.id);
 * } else {
 *   console.log('Merged into existing:', result.id);
 * }
 */
export async function smartInsert(
  router: BridgeRouter,
  ctx: RouteContext,
  data: Record<string, unknown>,
  opts: SmartInsertOptions,
  config?: { devShadow?: any }
): Promise<SmartInsertResult> {
  if (!opts.uniqueKeys || opts.uniqueKeys.length === 0) {
    throw new Error('smartInsert requires at least one unique key');
  }

  const routeInfo = router.route(ctx);
  const mongoClient = await router.getMongoClient(routeInfo.mongoUri);
  const mongo = mongoClient.db(ctx.dbName);
  const repos = new Repos(mongo, ctx.collection);

  // 1. Build filter from unique keys
  const filter: Record<string, any> = {};
  for (const key of opts.uniqueKeys) {
    const value = getNestedValue(data, key);
    if (value === undefined || value === null) {
      throw new Error(`Unique key '${key}' is missing or null in data`);
    }
    filter[`metaIndexed.${key}`] = value;
  }

  // 2. Check if record exists
  // Note: This will only work if the uniqueKeys are in the collection's indexedProps
  const existingHeads = await repos.getHeadByMetaList(filter);
  
  // Debug: Log if no match found
  if (existingHeads.length === 0) {
    console.log(`[smartInsert] No existing record found with filter:`, filter);
    console.log(`[smartInsert] Make sure unique keys [${opts.uniqueKeys.join(', ')}] are in collectionMap.indexedProps`);
  }

  // 3. If exists → ENRICH (merge)
  if (existingHeads.length > 0 && existingHeads[0]) {
    const existingHead = existingHeads[0];
    const existingId = existingHead._id.toString();

    const enrichOpts: EnrichOptions = {
      ...(opts.functionId && { functionId: opts.functionId }),
      ...(opts.actor && { actor: opts.actor }),
      ...(opts.reason && { reason: opts.reason }),
      ...(opts.devShadowOverride !== undefined && { devShadowOverride: opts.devShadowOverride }),
    };

    const enrichResult = await enrichRecord(
      router,
      ctx,
      existingId,
      data,
      enrichOpts,
      config
    );

    return {
      id: enrichResult.id,
      ov: enrichResult.ov,
      cv: enrichResult.cv,
      created: false,
      at: new Date(),
    };
  }

  // 4. If not exists → CREATE
  const crudOpts: CrudOptions = {
    ...(opts.actor && { actor: opts.actor }),
    ...(opts.reason && { reason: opts.reason }),
    ...(opts.parentRecord && { parentRecord: opts.parentRecord }),
    ...(opts.devShadowOverride !== undefined && { devShadowOverride: opts.devShadowOverride }),
  };

  const createResult = await createItem(router, ctx, data, crudOpts, config);

  return {
    id: createResult.id,
    ov: createResult.ov,
    cv: createResult.cv,
    created: true,
    at: createResult.createdAt,
  };
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

