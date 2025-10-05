import type { StorageAdapter } from '../storage/interface.js';
import type { CollectionMap } from '../config.js';
import * as StorageKeys from '../storage/keys.js';
import {
  getBase64Properties,
  validateBase64Properties,
  extractTextFromBase64,
  type ValidationError,
} from './metadataMap.js';

// ============================================================================
// Types
// ============================================================================

export interface ExternalizeResult {
  transformed: Record<string, unknown>;
  metaIndexed: Record<string, unknown>;
  writtenKeys: string[];
  bytesContent: number;
}

export interface ExternalizeOptions {
  storage: StorageAdapter;
  contentBucket: string;
  collection: string;
  idHex: string;
  ov: number;
  data: Record<string, unknown>;
  map: CollectionMap;
}

// ============================================================================
// Main Externalization Function
// ============================================================================

/**
 * Externalize base64 properties to S3 and return transformed data
 * @param options - Externalization options
 * @returns Externalization result with transformed data and metadata
 */
export async function externalizeBase64(options: ExternalizeOptions): Promise<ExternalizeResult> {
  const { storage, contentBucket, collection, idHex, ov, data, map } = options;
  
  // Validate base64 properties first
  validateBase64Properties(data, map);
  
  // Get base64 properties to externalize
  const base64Props = getBase64Properties(data, map);
  
  // Create a deep copy of the data for transformation
  const transformed = JSON.parse(JSON.stringify(data));
  const writtenKeys: string[] = [];
  let bytesContent = 0;
  
  // Process each base64 property
  for (const { path, value, config } of base64Props) {
    try {
      // Decode base64 to buffer
      const buffer = Buffer.from(value, 'base64');
      bytesContent += buffer.length;
      
      // Upload blob to storage
      const blobKey = StorageKeys.propBlobKey(collection, path, idHex, ov);
      await storage.putRaw(contentBucket, blobKey, buffer, config.contentType);
      writtenKeys.push(blobKey);
      
      // Upload text rendition if preferred or if content type suggests text
      let textKey: string | undefined;
      if (config.preferredText || config.contentType.startsWith('text/')) {
        const text = extractTextFromBase64(value, (config.textCharset as BufferEncoding) || 'utf8');
        if (text !== null) {
          textKey = StorageKeys.propTextKey(collection, path, idHex, ov);
          const textResult = await storage.putRaw(
            contentBucket,
            textKey,
            Buffer.from(text, 'utf8'),
            'text/plain; charset=utf-8'
          );
          writtenKeys.push(textKey);
          bytesContent += textResult.size || 0;
        }
      }
      
      // Replace the base64 value with a reference object
      const refObject = {
        ref: {
          contentBucket,
          blobKey,
          ...(textKey && { textKey }),
        },
      };
      
      // Set the reference object in the transformed data
      setNestedValue(transformed, path, refObject);
      
    } catch (error) {
      // If externalization fails, clean up any keys we've written so far
      await cleanupWrittenKeys(storage, contentBucket, writtenKeys);
      
      const validationError = new Error(
        `Failed to externalize base64 property '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`
      ) as ValidationError;
      validationError.code = 'VALIDATION_ERROR';
      validationError.field = path;
      validationError.value = value;
      throw validationError;
    }
  }
  
  // Extract indexed metadata from the original data (before transformation)
  const metaIndexed = extractIndexedMetadata(data, map);
  
  return {
    transformed,
    metaIndexed,
    writtenKeys,
    bytesContent,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract indexed metadata from data
 * @param data - Input data
 * @param map - Collection map
 * @returns Indexed metadata
 */
function extractIndexedMetadata(data: Record<string, unknown>, map: CollectionMap): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  // If indexedProps is empty, index all properties (except _system)
  if (map.indexedProps.length === 0) {
    for (const [key, value] of Object.entries(data)) {
      if (key !== '_system' && value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }
  
  // Otherwise, only extract specified properties
  for (const propPath of map.indexedProps) {
    const value = getNestedValue(data, propPath);
    if (value !== undefined) {
      setNestedValue(result, propPath, value);
    }
  }
  
  return result;
}

/**
 * Get nested value from object using dot notation
 * @param obj - Source object
 * @param path - Property path
 * @returns Value at path or undefined
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = parsePath(path);
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object' || !part) {
      return undefined;
    }
    
    if (Array.isArray(current)) {
      if (part === '[]') {
        return current;
      } else {
        const index = parseInt(part, 10);
        if (isNaN(index)) {
          return undefined;
        }
        current = current[index];
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  
  return current;
}

/**
 * Set nested value in object using dot notation
 * @param obj - Target object
 * @param path - Property path
 * @param value - Value to set
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = parsePath(path);
  let current: Record<string, unknown> = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    if (!part || part === '[]') {
      continue;
    }
    
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    
    current = current[part] as Record<string, unknown>;
  }
  
  const lastPart = parts[parts.length - 1];
  if (lastPart === '[]') {
    current[path.replace('[]', '')] = value;
  } else if (lastPart) {
    current[lastPart] = value;
  }
}

/**
 * Parse property path into parts
 * @param path - Property path string
 * @returns Array of path parts
 */
function parsePath(path: string): string[] {
  if (path.endsWith('[]')) {
    const basePath = path.slice(0, -2);
    return basePath ? [...basePath.split('.'), '[]'] : ['[]'];
  }
  
  return path.split('.');
}

/**
 * Clean up written S3 keys in case of failure
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param keys - Keys to delete
 */
async function cleanupWrittenKeys(storage: StorageAdapter, bucket: string, keys: string[]): Promise<void> {
  const deletePromises = keys.map(key => 
    storage.del(bucket, key).catch(error => {
      console.warn(`Failed to cleanup key ${key}:`, error);
    })
  );
  
  await Promise.all(deletePromises);
}

// ============================================================================
// Validation and Utility Functions
// ============================================================================

/**
 * Validate that all required indexed fields are present
 * @param data - Input data
 * @param map - Collection map
 * @throws ValidationError if required fields are missing
 */
export function validateRequiredFields(data: Record<string, unknown>, map: CollectionMap): void {
  if (!map.validation?.requiredIndexed) {
    return;
  }
  
  for (const requiredPath of map.validation.requiredIndexed) {
    const value = getNestedValue(data, requiredPath);
    if (value === undefined || value === null || value === '') {
      const error = new Error(`Required indexed field '${requiredPath}' is missing or empty`) as ValidationError;
      error.code = 'VALIDATION_ERROR';
      error.field = requiredPath;
      error.value = value;
      throw error;
    }
  }
}

/**
 * Check if data has any base64 properties that need externalization
 * @param data - Input data
 * @param map - Collection map
 * @returns True if data has base64 properties to externalize
 */
export function hasBase64Properties(data: Record<string, unknown>, map: CollectionMap): boolean {
  if (!map.base64Props) {
    return false;
  }
  
  return getBase64Properties(data, map).length > 0;
}

/**
 * Get the total size of base64 properties that would be externalized
 * @param data - Input data
 * @param map - Collection map
 * @returns Total size in bytes
 */
export function getBase64PropertiesSize(data: Record<string, unknown>, map: CollectionMap): number {
  if (!map.base64Props) {
    return 0;
  }
  
  let totalSize = 0;
  const base64Props = getBase64Properties(data, map);
  
  for (const { value } of base64Props) {
    try {
      const buffer = Buffer.from(value, 'base64');
      totalSize += buffer.length;
    } catch {
      // Skip invalid base64
    }
  }
  
  return totalSize;
}

/**
 * Create a reference object for an externalized property
 * @param contentBucket - S3 bucket name
 * @param blobKey - Blob key
 * @param textKey - Optional text key
 * @returns Reference object
 */
export function createRefObject(
  contentBucket: string,
  blobKey: string,
  textKey?: string
): { ref: { contentBucket: string; blobKey: string; textKey?: string } } {
  return {
    ref: {
      contentBucket,
      blobKey,
      ...(textKey && { textKey }),
    },
  };
}
