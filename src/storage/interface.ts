// ============================================================================
// Storage Interface (S3-compatible)
// ============================================================================

/**
 * Unified storage interface that works with both S3 and local filesystem
 * This allows code to be storage-agnostic
 */
export interface StorageAdapter {
  /**
   * Put JSON to storage
   */
  putJSON(
    bucket: string,
    key: string,
    data: any
  ): Promise<{ size: number | null; sha256: string | null }>;

  /**
   * Put raw data to storage
   */
  putRaw(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array,
    contentType?: string
  ): Promise<{ size: number | null; sha256: string | null }>;

  /**
   * Get JSON from storage
   */
  getJSON(bucket: string, key: string): Promise<Record<string, unknown>>;

  /**
   * Get raw data from storage
   */
  getRaw(bucket: string, key: string): Promise<Buffer>;

  /**
   * Check if object exists
   */
  head(bucket: string, key: string): Promise<{ exists: boolean; size?: number }>;

  /**
   * Delete object from storage
   */
  del(bucket: string, key: string): Promise<void>;

  /**
   * Generate presigned URL for GET
   */
  presignGet(bucket: string, key: string, ttlSeconds: number): Promise<string>;

  /**
   * List objects with prefix
   */
  list(
    bucket: string,
    prefix: string,
    opts?: { maxKeys?: number; continuationToken?: string }
  ): Promise<{ keys: string[]; nextToken?: string }>;

  /**
   * Copy object
   */
  copy(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<void>;
}

/**
 * Storage operation result
 */
export interface StorageResult {
  size: number | null;
  sha256: string | null;
}

