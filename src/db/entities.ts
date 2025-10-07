import { logger } from '../utils/logger.js';
import { BridgeRouter } from '../router/router.js';
import type { RouteContext } from '../config.js';
import { createItem, updateItem } from './crud.js';

/**
 * Entity mapping configuration
 */
export interface EntityMapping {
  /** Property name in the main record that holds the entity object */
  property: string;
  /** Collection name where the entity should be stored */
  collection: string;
  /** Property name in the entity object that acts as the key/ID */
  keyProperty: string;
  /** Database type where the entity collection exists */
  databaseType?: 'metadata' | 'knowledge' | 'runtime' | 'logs';
  /** Tier for the entity collection */
  tier?: 'generic' | 'domain' | 'tenant';
}

/**
 * Options for insertWithEntities operation
 */
export interface InsertWithEntitiesOptions {
  /** Main record to insert */
  record: Record<string, any>;
  /** Collection name for the main record */
  collection: string;
  /** Entity mappings configuration */
  entityMappings: EntityMapping[];
  /** Routing context */
  ctx: RouteContext;
  /** Requester information */
  requester: string;
  /** Reason for the operation */
  reason: string;
  /** Router instance */
  router: BridgeRouter;
}

/**
 * Result of insertWithEntities operation
 */
export interface InsertWithEntitiesResult {
  /** ID of the main record created */
  mainRecordId: string;
  /** Map of entity property names to their saved/updated entity IDs */
  entityResults: Map<string, {
    id: string;
    operation: 'created' | 'updated' | 'unchanged';
  }>;
}

/**
 * Insert a record with automatic entity relationship management
 * 
 * This function:
 * 1. Extracts entity objects from the main record based on mappings
 * 2. For each entity, checks if it already exists in its collection
 * 3. Creates new entities or updates existing ones with changed properties
 * 4. Inserts the main record with references to the entities
 * 
 * @param options - Insert with entities options
 * @returns Result with main record ID and entity operation results
 */
export async function insertWithEntities(
  options: InsertWithEntitiesOptions
): Promise<InsertWithEntitiesResult> {
  const { record, collection, entityMappings, ctx, requester, reason, router } = options;

  logger.debug('Starting insertWithEntities', {
    collection,
    entityMappingsCount: entityMappings.length,
    tenantId: ctx.tenantId,
  });

  const entityResults = new Map<string, {
    id: string;
    operation: 'created' | 'updated' | 'unchanged';
  }>();

  // Process each entity mapping
  for (const mapping of entityMappings) {
    const entityObject = record[mapping.property];

    if (!entityObject || typeof entityObject !== 'object') {
      logger.warn(`Entity property "${mapping.property}" is not an object, skipping`, {
        property: mapping.property,
        value: entityObject,
      });
      continue;
    }

    const keyValue = entityObject[mapping.keyProperty];
    if (!keyValue) {
      logger.warn(`Entity missing key property "${mapping.keyProperty}", skipping`, {
        property: mapping.property,
        keyProperty: mapping.keyProperty,
      });
      continue;
    }

    // Create routing context for the entity
    const entityCtx: RouteContext = {
      dbName: ctx.dbName,
      collection: mapping.collection,
      databaseType: (mapping.databaseType || ctx.databaseType)!,
      tier: (mapping.tier || ctx.tier)!,
      ...(ctx.tenantId && { tenantId: ctx.tenantId }),
      ...(ctx.domain && { domain: ctx.domain }),
    };

    // Get backend info for the entity collection
    const routeInfo = await router.route(entityCtx);
    const mongoClient = await router.getMongoClient(routeInfo.mongoUri);
    const dbInfo = await router.resolveDatabaseConnection(entityCtx);
    if (!dbInfo) {
      throw new Error(`Failed to resolve database connection for entity collection ${mapping.collection}`);
    }
    const db = mongoClient.db(dbInfo.dbName);
    const entityCollection = db.collection(`${mapping.collection}_head`);

    // Check if entity already exists
    const existingEntity = await entityCollection.findOne({
      [mapping.keyProperty]: keyValue,
    });

    if (existingEntity) {
      // Entity exists - check if we need to update
      let hasChanges = false;
      const updates: Record<string, any> = {};

      for (const [key, value] of Object.entries(entityObject)) {
        if (key === mapping.keyProperty) continue; // Skip the key property itself
        
        if (existingEntity[key] !== value) {
          hasChanges = true;
          updates[key] = value;
        }
      }

      if (hasChanges) {
        // Update the entity with changed properties
        logger.debug(`Updating existing entity in ${mapping.collection}`, {
          keyValue,
          updates,
        });

        await updateItem(
          router,
          entityCtx,
          existingEntity._id.toString(),
          updates,
          { actor: requester, reason },
          {}
        );

        entityResults.set(mapping.property, {
          id: existingEntity._id.toString(),
          operation: 'updated',
        });
      } else {
        // No changes needed
        logger.debug(`Entity unchanged in ${mapping.collection}`, {
          keyValue,
        });

        entityResults.set(mapping.property, {
          id: existingEntity._id.toString(),
          operation: 'unchanged',
        });
      }
    } else {
      // Entity doesn't exist - create it
      logger.debug(`Creating new entity in ${mapping.collection}`, {
        keyValue,
      });

      const createResult = await createItem(
        router,
        entityCtx,
        entityObject,
        { actor: requester, reason },
        {}
      );

      entityResults.set(mapping.property, {
        id: createResult.id,
        operation: 'created',
      });
    }
  }

  // Create the main record (with entity objects still embedded)
  logger.debug(`Creating main record in ${collection}`, {
    collection,
  });

  const mainResult = await createItem(
    router,
    ctx,
    record,
    { actor: requester, reason },
    {}
  );

  logger.info('InsertWithEntities completed', {
    mainRecordId: mainResult.id,
    entityResults: Array.from(entityResults.entries()).map(([prop, result]) => ({
      property: prop,
      ...result,
    })),
  });

  return {
    mainRecordId: mainResult.id,
    entityResults,
  };
}

/**
 * Options for getWithEntities operation
 */
export interface GetWithEntitiesOptions {
  /** Main record ID to fetch */
  id: string;
  /** Collection name for the main record */
  collection: string;
  /** Entity mappings configuration */
  entityMappings: EntityMapping[];
  /** Routing context */
  ctx: RouteContext;
  /** Router instance */
  router: BridgeRouter;
  /** Read options */
  readOptions?: import('../read/read.js').ReadOptions;
}

/**
 * Result of getWithEntities operation
 */
export interface GetWithEntitiesResult {
  /** Main record data */
  mainRecord: Record<string, any> | null;
  /** Map of entity property names to their fetched entity records */
  entityRecords: Map<string, Record<string, any> | null>;
}

/**
 * Get a record with automatic entity relationship fetching
 * 
 * This function:
 * 1. Fetches the main record
 * 2. For each entity mapping, extracts the entity object from the main record
 * 3. Fetches the full entity record from its collection using the key property
 * 4. Returns the main record with all entity records
 * 
 * @param options - Get with entities options
 * @returns Result with main record and entity records
 */
export async function getWithEntities(
  options: GetWithEntitiesOptions
): Promise<GetWithEntitiesResult> {
  const { id, collection, entityMappings, ctx, router, readOptions = {} } = options;

  logger.debug('Starting getWithEntities', {
    id,
    collection,
    entityMappingsCount: entityMappings.length,
    tenantId: ctx.tenantId,
  });

  const { getItem } = await import('../read/read.js');

  // Fetch the main record
  const mainRecord = await getItem(router, ctx, id, readOptions);

  if (!mainRecord) {
    logger.warn('Main record not found', { id, collection });
    return {
      mainRecord: null,
      entityRecords: new Map(),
    };
  }

  const entityRecords = new Map<string, Record<string, any> | null>();

  // Fetch each entity
  for (const mapping of entityMappings) {
    const entityObject = (mainRecord as any)[mapping.property];

    if (!entityObject || typeof entityObject !== 'object') {
      logger.warn(`Entity property "${mapping.property}" is not an object, skipping`, {
        property: mapping.property,
        value: entityObject,
      });
      entityRecords.set(mapping.property, null);
      continue;
    }

    const keyValue = entityObject[mapping.keyProperty];
    if (!keyValue) {
      logger.warn(`Entity missing key property "${mapping.keyProperty}", skipping`, {
        property: mapping.property,
        keyProperty: mapping.keyProperty,
      });
      entityRecords.set(mapping.property, null);
      continue;
    }

    // Create routing context for the entity
    const entityCtx: RouteContext = {
      dbName: ctx.dbName,
      collection: mapping.collection,
      databaseType: (mapping.databaseType || ctx.databaseType)!,
      tier: (mapping.tier || ctx.tier)!,
      ...(ctx.tenantId && { tenantId: ctx.tenantId }),
      ...(ctx.domain && { domain: ctx.domain }),
    };

    // Get backend info for the entity collection
    const routeInfo = await router.route(entityCtx);
    const mongoClient = await router.getMongoClient(routeInfo.mongoUri);
    const dbInfo = await router.resolveDatabaseConnection(entityCtx);
    if (!dbInfo) {
      throw new Error(`Failed to resolve database connection for entity collection ${mapping.collection}`);
    }
    const db = mongoClient.db(dbInfo.dbName);
    const entityCollection = db.collection(`${mapping.collection}_head`);

    // Find the entity by its key
    const entityHead = await entityCollection.findOne({
      [mapping.keyProperty]: keyValue,
    });

    if (entityHead) {
      // Fetch the full entity record
      const fullEntityRecord = await getItem(router, entityCtx, entityHead._id.toString(), readOptions);
      
      logger.debug(`Fetched entity from ${mapping.collection}`, {
        keyValue,
        entityId: entityHead._id,
      });

      entityRecords.set(mapping.property, fullEntityRecord);
    } else {
      logger.warn(`Entity not found in ${mapping.collection}`, {
        keyValue,
      });
      entityRecords.set(mapping.property, null);
    }
  }

  logger.info('GetWithEntities completed', {
    id,
    collection,
    entityRecords: Array.from(entityRecords.entries()).map(([prop, record]) => ({
      property: prop,
      found: record !== null,
    })),
  });

  return {
    mainRecord,
    entityRecords,
  };
}

