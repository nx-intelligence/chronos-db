import { ObjectId, ClientSession } from 'mongodb';
import type { StorageAdapter } from '../storage/interface.js';
import { BridgeRouter } from '../router/router.js';
import { Repos } from '../db/repos.js';
import type { HeadDoc, VerDoc } from '../db/schemas.js';
import { 
  ValidationError, 
  NotFoundError, 
  OptimisticLockError, 
  StorageError, 
  TxnError, 
  ExternalizationError,
  RouteMismatchError
} from '../db/errors.js';
import { externalizeBase64 } from '../meta/externalize.js';
import { extractIndexed, getBase64Properties } from '../meta/metadataMap.js';
// No longer using s3.ts directly - using StorageAdapter interface
// import { putJSON, getJSON } from '../storage/s3.js';
import { jsonKey } from '../storage/keys.js';
import { deepMergeWithArrayUnion } from '../util/merge.js';
import { 
  createSystemHeader, 
  addSystemHeader, 
  extractSystemHeader,
  type SystemHeader 
} from '../meta/systemFields.js';
import type { DevShadowConfig } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export interface EnrichContext {
  dbName: string;
  collection: string;
  tenantId?: string;
  forcedIndex?: number;
}

export interface EnrichOptions {
  /** Optional optimistic lock. If provided, current head.ov must equal this. */
  expectedOv?: number;
  /** Optional enrichment source tag to store under _system.functionIds[] (unique). */
  functionId?: string | null;
  /** Who/why (recorded in _ver) */
  actor?: string;
  reason?: string;
  /** Per-call override of devShadow config */
  devShadowOverride?: boolean;
}

export interface EnrichResult {
  id: string;
  ov: number;
  cv: number;
}

// ============================================================================
// Enrichment Service
// ============================================================================

/**
 * Enrich a single record by deep-merging enrichment into the head payload
 * @param router - Bridge router instance
 * @param ctx - Enrichment context
 * @param id - Item ID (hex ObjectId)
 * @param enrichment - Enrichment data (single object or array of objects)
 * @param opts - Enrichment options
 * @param config - Configuration including devShadow settings
 * @returns Enrichment result
 */
export async function enrichRecord(
  router: BridgeRouter,
  ctx: EnrichContext,
  id: string,
  enrichment: Record<string, unknown> | Array<Record<string, unknown>>,
  opts: EnrichOptions = {},
  config?: { devShadow?: DevShadowConfig }
): Promise<EnrichResult> {
  const { expectedOv, functionId, actor, reason } = opts;
  const op = 'UPDATE'; // Enrichment creates an UPDATE operation
  
  try {
    // 1. Validate enrichment payload
    if (!isValidEnrichmentPayload(enrichment)) {
      throw new ValidationError(
        'Invalid enrichment payload: must be a plain object or array of plain objects',
        op,
        ctx.collection,
        id
      );
    }

    // 2. Route to backend
    const routeInfo = router.getRouteInfo(ctx);
    const mongoClient = await router.getMongo(routeInfo.index);
    const mongo = mongoClient.db(ctx.dbName);
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

    // 3. Get collection map and validate
    const collectionMap = getCollectionMap(ctx.collection);
    if (!collectionMap) {
      throw new ValidationError(
        `Collection map not found for: ${ctx.collection}`,
        op,
        ctx.collection,
        id
      );
    }

    // 4. Load head document
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

    // 7. Fetch current item.json from S3 (or use dev shadow if available)
    let currentData: Record<string, unknown>;
    try {
      // TODO: Check dev shadow if preferShadow is available
      currentData = await storage.getJSON(head.jsonBucket, head.jsonKey);
    } catch (error) {
      throw new StorageError(
        `Failed to read current item.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
        op,
        ctx.collection,
        id,
        head.ov
      );
    }

    // 8. Apply merge rules
    const enrichmentArray = Array.isArray(enrichment) ? enrichment : [enrichment];
    let mergedData = { ...currentData };
    
    for (const enrichmentItem of enrichmentArray) {
      mergedData = deepMergeWithArrayUnion(mergedData, enrichmentItem);
    }

    // 9. Update _system fields
    const currentSystem = extractSystemHeader(mergedData) || createSystemHeader(head.createdAt);
    const updatedSystem = applySystemHeaderForEnrichment(currentSystem, now, functionId);
    mergedData = addSystemHeader(mergedData, updatedSystem);

    // 10. Externalize base64 properties from enrichment
    const base64Props = getBase64Properties(mergedData, collectionMap);
    let transformed = { ...mergedData };
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
          data: mergedData,
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
      metaIndexed = extractIndexed(mergedData, collectionMap);
    }

    // 11. Write new item.json to S3
    const jKey = jsonKey(ctx.collection, id, ov);
    let size: number;
    let sha256: string;

    try {
      const result = await storage.putJSON(spaces.jsonBucket, jKey, transformed);
      size = result.size ?? 0;
      sha256 = result.sha256 || '';
      writtenKeys.push(jKey);
    } catch (error) {
      throw new StorageError(
        `Failed to write item.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
        op,
        ctx.collection,
        id,
        ov
      );
    }

    // 12. MongoDB transaction
    let cv: number;
    let session: ClientSession | undefined;

    try {
      session = mongoClient.startSession();
      await session.withTransaction(async () => {
        // Increment collection version
        cv! = await repos.incCv(session!);

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
          // Keep or clear deletedAt based on _system.deleted
          ...(updatedSystem.deleted === false ? {} : { deletedAt: head.deletedAt }),
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
        await repos.insertVersion(verDoc, session!);
        await repos.updateHeadWithLock(headDoc, head.ov, session!);
      });
    } catch (error) {
      // Compensation: delete written S3 keys
      await compensateS3(storage, spaces.jsonBucket, spaces.contentBucket, writtenKeys);
      
      throw new TxnError(
        `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        op,
        ctx.collection,
        id,
        ov,
        cv!
      );
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    // 13. Return result
    return {
      id,
      ov,
      cv: cv!,
    };

  } catch (error) {
    if (error instanceof ValidationError || 
        error instanceof NotFoundError || 
        error instanceof OptimisticLockError || 
        error instanceof StorageError || 
        error instanceof TxnError || 
        error instanceof ExternalizationError || 
        error instanceof RouteMismatchError) {
      throw error;
    }
    
    throw new TxnError(
      `Enrichment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      op,
      ctx.collection,
      id,
      undefined,
      undefined
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate enrichment payload
 */
function isValidEnrichmentPayload(
  enrichment: unknown
): enrichment is Record<string, unknown> | Array<Record<string, unknown>> {
  if (Array.isArray(enrichment)) {
    return enrichment.every(item => 
      item !== null && 
      typeof item === 'object' && 
      !Array.isArray(item) &&
      item.constructor === Object
    );
  }
  
  return (
    enrichment !== null &&
    typeof enrichment === 'object' &&
    !Array.isArray(enrichment) &&
    enrichment.constructor === Object
  );
}

/**
 * Get collection map (placeholder - should be implemented)
 */
function getCollectionMap(_collection: string): any {
  // TODO: Implement collection map lookup
  return {
    indexedProps: [],
    base64Props: {},
    validation: {
      requiredIndexed: []
    }
  };
}

/**
 * Apply system header updates for enrichment
 */
function applySystemHeaderForEnrichment(
  currentSystem: SystemHeader,
  now: Date,
  functionId?: string | null
): SystemHeader {
  const updatedSystem: SystemHeader = {
    insertedAt: currentSystem.insertedAt,
    updatedAt: now.toISOString(),
  };

  // Handle deleted status - only change if explicitly set to false
  if (currentSystem.deleted === true) {
    // Keep deleted status unless explicitly overridden
    updatedSystem.deleted = true;
    if (currentSystem.deletedAt) {
      updatedSystem.deletedAt = currentSystem.deletedAt;
    }
  } else {
    // Not deleted, keep as is
    if (currentSystem.deleted === false) {
      updatedSystem.deleted = false;
    }
    if (currentSystem.deletedAt) {
      updatedSystem.deletedAt = currentSystem.deletedAt;
    }
  }

  // Handle functionId tracking
  if (functionId) {
    const existingFunctionIds = currentSystem.functionIds || [];
    if (!existingFunctionIds.includes(functionId)) {
      updatedSystem.functionIds = [...existingFunctionIds, functionId];
    } else {
      updatedSystem.functionIds = existingFunctionIds;
    }
  } else if (currentSystem.functionIds) {
    updatedSystem.functionIds = currentSystem.functionIds;
  }

  return updatedSystem;
}

/**
 * Compensate S3 operations on failure
 */
async function compensateS3(
  storage: StorageAdapter,
  jsonBucket: string,
  _contentBucket: string,
  writtenKeys: string[]
): Promise<void> {
  for (const key of writtenKeys) {
    try {
      await storage.del(jsonBucket, key);
    } catch (error) {
      // Log but don't throw - compensation is best effort
      console.error(`Failed to compensate storage key ${key}:`, error);
    }
  }
}
