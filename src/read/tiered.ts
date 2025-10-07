import { BridgeRouter } from '../router/router.js';
import type { RouteContext } from '../config.js';
import type { ReadOptions } from './read.js';
import { getItem } from './read.js';
import { deepMergeRecords, type RecordMergeOptions } from './merge.js';
import { logger } from '../utils/logger.js';

/**
 * Options for tiered fetching (getKnowledge/getMetadata)
 */
export interface TieredFetchOptions extends ReadOptions {
  /** Tenant ID for tenant-tier lookup */
  tenantId?: string;
  /** Domain for domain-tier lookup */
  domain?: string;
  /** If true, merge data from all tiers (generic -> domain -> tenant). If false, return first found. */
  merge: boolean;
  /** Merge options for combining records */
  mergeOptions?: RecordMergeOptions;
}

/**
 * Result of tiered fetch operation
 */
export interface TieredFetchResult {
  /** Merged or first-found record data */
  data: Record<string, any> | null;
  /** Which tiers had data */
  tiersFound: Array<'generic' | 'domain' | 'tenant'>;
  /** Full records from each tier (if merge was true) */
  tierRecords?: {
    generic?: Record<string, any>;
    domain?: Record<string, any>;
    tenant?: Record<string, any>;
  };
}

/**
 * Fetch a record from the Knowledge database with tiered fallback/merge
 * 
 * Tier priority: tenant -> domain -> generic
 * 
 * @param router - Bridge router instance
 * @param collection - Collection name
 * @param filter - MongoDB filter to find the record
 * @param options - Tiered fetch options
 * @returns Tiered fetch result
 * 
 * @example
 * // Fetch with fallback (first found)
 * const result = await getKnowledge(router, 'products', { sku: 'ABC123' }, {
 *   tenantId: 'tenant-a',
 *   domain: 'retail',
 *   merge: false
 * });
 * 
 * @example
 * // Fetch with merge (combine all tiers)
 * const result = await getKnowledge(router, 'config', { key: 'settings' }, {
 *   tenantId: 'tenant-a',
 *   domain: 'retail',
 *   merge: true,
 *   mergeOptions: { dedupeArrays: true }
 * });
 */
export async function getKnowledge(
  router: BridgeRouter,
  collection: string,
  filter: Record<string, any>,
  options: TieredFetchOptions
): Promise<TieredFetchResult> {
  return await getTieredRecord(router, collection, filter, 'knowledge', options);
}

/**
 * Fetch a record from the Metadata database with tiered fallback/merge
 * 
 * Tier priority: tenant -> domain -> generic
 * 
 * @param router - Bridge router instance
 * @param collection - Collection name
 * @param filter - MongoDB filter to find the record
 * @param options - Tiered fetch options
 * @returns Tiered fetch result
 * 
 * @example
 * // Fetch with fallback (first found)
 * const result = await getMetadata(router, 'schemas', { name: 'user' }, {
 *   tenantId: 'tenant-a',
 *   domain: 'saas',
 *   merge: false
 * });
 * 
 * @example
 * // Fetch with merge (combine all tiers)
 * const result = await getMetadata(router, 'permissions', { resource: 'users' }, {
 *   tenantId: 'tenant-a',
 *   domain: 'saas',
 *   merge: true
 * });
 */
export async function getMetadata(
  router: BridgeRouter,
  collection: string,
  filter: Record<string, any>,
  options: TieredFetchOptions
): Promise<TieredFetchResult> {
  return await getTieredRecord(router, collection, filter, 'metadata', options);
}

/**
 * Internal function to fetch records across tiers
 */
async function getTieredRecord(
  router: BridgeRouter,
  collection: string,
  filter: Record<string, any>,
  databaseType: 'metadata' | 'knowledge',
  options: TieredFetchOptions
): Promise<TieredFetchResult> {
  const { tenantId, domain, merge, mergeOptions = {}, ...readOptions } = options;

  logger.debug(`Fetching ${databaseType} record with tiered lookup`, {
    collection,
    filter,
    tenantId,
    domain,
    merge,
  });

  const tiersFound: Array<'generic' | 'domain' | 'tenant'> = [];
  const tierRecords: TieredFetchResult['tierRecords'] = {};
  let mergedData: Record<string, any> | null = null;

  // Define tier order: generic -> domain -> tenant (for merging)
  // For non-merge mode, we go in reverse: tenant -> domain -> generic
  const tiers: Array<{
    tier: 'generic' | 'domain' | 'tenant';
    ctx: RouteContext;
  }> = [];

  // Generic tier (always available)
  tiers.push({
    tier: 'generic',
    ctx: {
      dbName: '', // Will be resolved by router
      collection,
      databaseType,
      tier: 'generic',
    },
  });

  // Domain tier (if domain is provided)
  if (domain) {
    tiers.push({
      tier: 'domain',
      ctx: {
        dbName: '', // Will be resolved by router
        collection,
        databaseType,
        tier: 'domain',
        domain,
      },
    });
  }

  // Tenant tier (if tenantId is provided)
  if (tenantId) {
    tiers.push({
      tier: 'tenant',
      ctx: {
        dbName: '', // Will be resolved by router
        collection,
        databaseType,
        tier: 'tenant',
        tenantId,
      },
    });
  }

  // If not merging, reverse the order (tenant -> domain -> generic)
  if (!merge) {
    tiers.reverse();
  }

  // Fetch from each tier
  for (const { tier, ctx } of tiers) {
    try {
      // Route to get the correct database info
      const routeInfo = await router.route(ctx);
      const mongoClient = await router.getMongoClient(routeInfo.mongoUri);
      const dbInfo = await router.resolveDatabaseConnection(ctx);
      if (!dbInfo) {
        throw new Error(`Failed to resolve database connection for ${tier} tier`);
      }
      const db = mongoClient.db(dbInfo.dbName);
      const headCollection = db.collection(`${collection}_head`);

      // Find the record using the filter
      const headDoc = await headCollection.findOne(filter);

      if (headDoc) {
        logger.debug(`Found record in ${tier} tier`, {
          tier,
          collection,
          filter,
        });

          // Fetch the full record using getItem
          const fullRecord = await getItem(router, ctx, headDoc._id.toString(), readOptions);

        if (fullRecord) {
          tiersFound.push(tier);

          if (merge) {
            // Store tier record
            tierRecords[tier] = fullRecord;

            // Merge into result
            if (mergedData === null) {
              mergedData = { ...fullRecord };
            } else {
              mergedData = deepMergeRecords(mergedData, fullRecord, mergeOptions);
            }
          } else {
            // Return first found
            return {
              data: fullRecord,
              tiersFound: [tier],
            };
          }
        }
      }
    } catch (error) {
      logger.warn(`Error fetching from ${tier} tier`, {
        tier,
        collection,
        filter,
        error: (error as Error).message,
      });
      // Continue to next tier
    }
  }

  if (!merge && tiersFound.length === 0) {
    // No record found in any tier
    logger.debug(`No record found in any tier`, {
      collection,
      filter,
    });
    return {
      data: null,
      tiersFound: [],
    };
  }

  logger.info(`Tiered fetch completed`, {
    databaseType,
    collection,
    filter,
    tiersFound,
    merge,
  });

  return {
    data: mergedData,
    tiersFound,
    ...(merge && { tierRecords }),
  };
}

