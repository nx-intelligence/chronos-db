import { ObjectId } from 'mongodb';
import type { CollectionMap } from '../config.js';

// ============================================================================
// MongoDB Schemas
// ============================================================================

export type OpType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

/**
 * Head document schema - latest pointer for each item
 */
export interface HeadDoc {
  _id: ObjectId;                         // stable item id
  itemId: ObjectId;                      // FK to item (same as _id for convenience)
  ov: number;                            // latest object version
  cv: number;                            // collection version at head (monotonic)
  jsonBucket: string;
  jsonKey: string;                       // where to read latest item.json
  metaIndexed: Record<string, unknown>;  // small searchable subset (from map)
  size: number | null;                   // bytes of item.json (at head)
  checksum: string | null;               // sha256 of item.json bytes we wrote
  createdAt: Date;                       // first CREATE time
  updatedAt: Date;                       // last mutation time
  deletedAt?: Date;                      // present if logically deleted
  fullShadow?: {                         // dev shadow for full snapshot in Mongo
    ov: number;                          // ov this shadow corresponds to
    at: Date;                            // time shadow was written
    data: Record<string, unknown>;       // transformed JSON, with refs (no base64)
    bytes?: number;                      // size guard (approx)
  };
}

/**
 * Version document schema - immutable version index (bounded window)
 */
export interface VerDoc {
  _id: ObjectId;
  itemId: ObjectId;                      // FK to Head._id
  ov: number;                            // object version
  cv: number;                            // collection version (global, monotonic)
  op: OpType;                            // write intent
  at: Date;                              // time of commit (UTC)
  actor?: string;                        // who (optional)
  reason?: string;                       // why (optional)

  jsonBucket: string;                    // snapshot location at that ov
  jsonKey: string;

  metaIndexed: Record<string, unknown>;  // snapshot's indexed subset (from map)
  size: number | null;                   // item.json size at that ov
  checksum: string | null;               // sha256 at that ov
  prevOv?: number;                       // convenience pointer to previous ov
}

/**
 * Counter document schema - collection version counter
 */
export interface CounterDoc {
  _id: 'cv';
  value: number;
}

// ============================================================================
// Index Definitions
// ============================================================================

/**
 * Base indexes that are always created
 */
export const BASE_INDEXES = {
  // Head collection indexes
  head: [
    { key: { itemId: 1 as const }, name: 'idx_head_itemId', unique: true },
    { key: { ov: -1 as const }, name: 'idx_head_ov' },
    { key: { cv: -1 as const }, name: 'idx_head_cv' },
    { key: { updatedAt: -1 as const }, name: 'idx_head_updatedAt' },
    { key: { deletedAt: 1 as const }, name: 'idx_head_deletedAt' },
  ],
  
  // Version collection indexes
  ver: [
    { key: { itemId: 1 as const, ov: -1 as const }, name: 'idx_ver_itemId_ov' },
    { key: { ov: -1 as const }, name: 'idx_ver_ov' },
    { key: { cv: -1 as const }, name: 'idx_ver_cv' },
    { key: { at: -1 as const }, name: 'idx_ver_at' },
    { key: { op: 1 as const }, name: 'idx_ver_op' },
    { key: { at: -1 as const, ov: -1 as const }, name: 'idx_ver_at_ov' },
  ],
  
  // Counter collection indexes
  counter: [
    { key: { _id: 1 as const }, name: 'idx_counter_id', unique: true },
  ],
};

/**
 * Generate meta indexes for a collection map
 * @param map - Collection map configuration
 * @returns Array of index definitions for metaIndexed fields
 */
export function generateMetaIndexes(map: CollectionMap): Array<{
  key: Record<string, 1 | -1>;
  name: string;
  partialFilterExpression?: Record<string, unknown>;
}> {
  const indexes: Array<{
    key: Record<string, 1 | -1>;
    name: string;
    partialFilterExpression?: Record<string, unknown>;
  }> = [];
  
  for (const propPath of map.indexedProps) {
    // Convert dot notation to MongoDB field notation
    const fieldPath = `metaIndexed.${propPath.replace('[]', '')}`;
    const indexName = `meta_${propPath.replace('.', '_').replace('[]', '_array')}_1`;
    
    indexes.push({
      key: { [fieldPath]: 1 as const },
      name: indexName,
      partialFilterExpression: { [fieldPath]: { $exists: true } },
    });
  }
  
  return indexes;
}

/**
 * Get all indexes for a collection
 * @param collectionName - Name of the collection
 * @param map - Collection map configuration
 * @returns Array of index definitions
 */
export function getCollectionIndexes(
  collectionName: string,
  map: CollectionMap
): Array<{
  key: Record<string, 1 | -1>;
  name: string;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}> {
  const indexes: Array<{
    key: Record<string, 1 | -1>;
    name: string;
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
  }> = [];
  
  // Add base indexes
  if (collectionName.endsWith('_head')) {
    indexes.push(...BASE_INDEXES.head);
  } else if (collectionName.endsWith('_ver')) {
    indexes.push(...BASE_INDEXES.ver);
  }
  
  // Add meta indexes for head collection
  if (collectionName.endsWith('_head')) {
    const metaIndexes = generateMetaIndexes(map);
    indexes.push(...metaIndexes);
  }
  
  return indexes;
}

// ============================================================================
// Collection Names
// ============================================================================

/**
 * Get collection names for a logical collection
 * @param logicalName - Logical collection name
 * @returns Object with collection names
 */
export function getCollectionNames(logicalName: string): {
  head: string;
  ver: string;
  counter: string;
} {
  return {
    head: `${logicalName}_head`,
    ver: `${logicalName}_ver`,
    counter: `${logicalName}_counter`,
  };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Create a query for finding the latest version of an item
 * @param itemId - Item ID
 * @returns MongoDB query
 */
export function createLatestVersionQuery(itemId: ObjectId): Record<string, unknown> {
  return { _id: itemId };
}

/**
 * Create a query for finding a specific version of an item
 * @param itemId - Item ID
 * @param ov - Object version
 * @returns MongoDB query
 */
export function createVersionQuery(itemId: ObjectId, ov: number): Record<string, unknown> {
  return { itemId, ov };
}

/**
 * Create a query for finding versions as of a specific time
 * @param itemId - Item ID
 * @param asOf - Timestamp
 * @returns MongoDB query
 */
export function createAsOfQuery(itemId: ObjectId, asOf: Date): Record<string, unknown> {
  return { itemId, at: { $lte: asOf } };
}

/**
 * Create a query for finding versions by collection version
 * @param itemId - Item ID
 * @param cv - Collection version
 * @returns MongoDB query
 */
export function createCvQuery(itemId: ObjectId, cv: number): Record<string, unknown> {
  return { itemId, cv: { $lte: cv } };
}

/**
 * Create a query for finding items by metadata
 * @param filter - Metadata filter
 * @returns MongoDB query
 */
export function createMetaQuery(filter: Record<string, unknown>): Record<string, unknown> {
  const metaFilter: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(filter)) {
    metaFilter[`metaIndexed.${key}`] = value;
  }
  
  return metaFilter;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a document matches the HeadDoc schema
 * @param doc - Document to validate
 * @returns True if valid, false otherwise
 */
export function isValidHeadDoc(doc: unknown): doc is HeadDoc {
  if (typeof doc !== 'object' || doc === null) {
    return false;
  }
  
  const head = doc as Record<string, unknown>;
  
  return (
    head['_id'] instanceof ObjectId &&
    head['itemId'] instanceof ObjectId &&
    typeof head['ov'] === 'number' &&
    typeof head['cv'] === 'number' &&
    typeof head['jsonBucket'] === 'string' &&
    typeof head['jsonKey'] === 'string' &&
    typeof head['metaIndexed'] === 'object' &&
    head['metaIndexed'] !== null &&
    (typeof head['size'] === 'number' || head['size'] === null) &&
    (typeof head['checksum'] === 'string' || head['checksum'] === null) &&
    head['createdAt'] instanceof Date &&
    head['updatedAt'] instanceof Date &&
    (head['deletedAt'] === undefined || head['deletedAt'] instanceof Date)
  );
}

/**
 * Validate that a document matches the VerDoc schema
 * @param doc - Document to validate
 * @returns True if valid, false otherwise
 */
export function isValidVerDoc(doc: unknown): doc is VerDoc {
  if (typeof doc !== 'object' || doc === null) {
    return false;
  }
  
  const ver = doc as Record<string, unknown>;
  
  return (
    ver['_id'] instanceof ObjectId &&
    ver['itemId'] instanceof ObjectId &&
    typeof ver['ov'] === 'number' &&
    typeof ver['cv'] === 'number' &&
    typeof ver['op'] === 'string' &&
    ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'].includes(ver['op']) &&
    ver['at'] instanceof Date &&
    (ver['actor'] === undefined || typeof ver['actor'] === 'string') &&
    (ver['reason'] === undefined || typeof ver['reason'] === 'string') &&
    typeof ver['jsonBucket'] === 'string' &&
    typeof ver['jsonKey'] === 'string' &&
    typeof ver['metaIndexed'] === 'object' &&
    ver['metaIndexed'] !== null &&
    (typeof ver['size'] === 'number' || ver['size'] === null) &&
    (typeof ver['checksum'] === 'string' || ver['checksum'] === null) &&
    (ver['prevOv'] === undefined || typeof ver['prevOv'] === 'number')
  );
}

/**
 * Validate that a document matches the CounterDoc schema
 * @param doc - Document to validate
 * @returns True if valid, false otherwise
 */
export function isValidCounterDoc(doc: unknown): doc is CounterDoc {
  if (typeof doc !== 'object' || doc === null) {
    return false;
  }
  
  const counter = doc as Record<string, unknown>;
  
  return (
    counter['_id'] === 'cv' &&
    typeof counter['value'] === 'number'
  );
}
