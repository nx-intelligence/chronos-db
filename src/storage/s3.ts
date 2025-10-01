import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import { Readable } from 'stream';

// ============================================================================
// Types
// ============================================================================

export interface S3OperationResult {
  size: number | null;
  sha256: string;
  etag?: string | undefined;
}

export interface S3HeadResult {
  contentLength?: number | undefined;
  contentType?: string | undefined;
  lastModified?: Date | undefined;
  etag?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface S3ListOptions {
  maxKeys?: number;
  continuationToken?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compute SHA-256 hash of data
 * @param data - Data to hash
 * @returns SHA-256 hash as hex string
 */
function computeSHA256(data: Buffer | Uint8Array | string): string {
  const hash = createHash('sha256');
  
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }
  
  return hash.digest('hex');
}

/**
 * Convert Readable stream to Buffer
 * @param stream - Readable stream
 * @returns Promise that resolves to Buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Get content type for data
 * @param data - Data to analyze
 * @param contentType - Explicit content type
 * @returns Content type string
 */
function getContentType(data: unknown, contentType?: string): string {
  if (contentType) {
    return contentType;
  }
  
  if (typeof data === 'string') {
    try {
      JSON.parse(data);
      return 'application/json; charset=utf-8';
    } catch {
      return 'text/plain; charset=utf-8';
    }
  }
  
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    return 'application/octet-stream';
  }
  
  return 'application/json; charset=utf-8';
}

// ============================================================================
// S3 Operations
// ============================================================================

/**
 * Put JSON data to S3
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @param payload - JSON payload
 * @param contentType - Optional content type
 * @returns Operation result with size and SHA-256
 */
export async function putJSON(
  s3: S3Client,
  bucket: string,
  key: string,
  payload: unknown,
  contentType?: string
): Promise<S3OperationResult> {
  const jsonString = JSON.stringify(payload, null, 0);
  const buffer = Buffer.from(jsonString, 'utf8');
  const sha256 = computeSHA256(buffer);
  const finalContentType = getContentType(jsonString, contentType);
  
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: finalContentType,
    Metadata: {
      'sha256': sha256,
      'content-type': finalContentType,
    },
  });
  
  try {
    const result = await s3.send(command);
    
    return {
      size: buffer.length,
      sha256,
      etag: result.ETag,
    };
  } catch (error) {
    throw new Error(`Failed to put JSON to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get JSON from S3
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Parsed JSON object
 */
export async function getJSON(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<Record<string, unknown>> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  try {
    const result = await s3.send(command);
    
    if (!result.Body) {
      throw new Error('Empty response body from S3');
    }
    
    // Convert stream to string
    const chunks: Buffer[] = [];
    const stream = result.Body as Readable;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    const jsonString = buffer.toString('utf8');
    
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Failed to get JSON from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Put raw data to S3
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @param body - Raw data (Buffer, Uint8Array, or Readable stream)
 * @param contentType - Optional content type
 * @returns Operation result with size and SHA-256
 */
export async function putRaw(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | Readable,
  contentType?: string
): Promise<S3OperationResult> {
  let buffer: Buffer;
  let sha256: string;
  
  if (body instanceof Readable) {
    buffer = await streamToBuffer(body);
    sha256 = computeSHA256(buffer);
  } else {
    buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    sha256 = computeSHA256(buffer);
  }
  
  const finalContentType = getContentType(buffer, contentType);
  
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: finalContentType,
    Metadata: {
      'sha256': sha256,
      'content-type': finalContentType,
    },
  });
  
  try {
    const result = await s3.send(command);
    
    return {
      size: buffer.length,
      sha256,
      etag: result.ETag,
    };
  } catch (error) {
    throw new Error(`Failed to put raw data to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get object metadata from S3
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Object metadata
 */
export async function head(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<S3HeadResult> {
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  try {
    const result = await s3.send(command);
    
    return {
      contentLength: result.ContentLength,
      contentType: result.ContentType,
      lastModified: result.LastModified,
      etag: result.ETag,
      metadata: result.Metadata,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      throw new Error(`Object not found: ${key}`);
    }
    throw new Error(`Failed to head object from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete object from S3
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Promise that resolves when deletion is complete
 */
export async function del(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  try {
    await s3.send(command);
  } catch (error) {
    throw new Error(`Failed to delete object from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate presigned GET URL for an object
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @param ttlSeconds - URL expiration time in seconds (default: 3600)
 * @returns Presigned URL
 */
export async function presignGet(
  s3: S3Client,
  bucket: string,
  key: string,
  ttlSeconds: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  try {
    return await getSignedUrl(s3, command, { expiresIn: ttlSeconds });
  } catch (error) {
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List objects in S3 with a prefix
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param prefix - Key prefix
 * @param options - List options
 * @returns Async generator of object keys
 */
export async function* list(
  s3: S3Client,
  bucket: string,
  prefix: string,
  options: S3ListOptions = {}
): AsyncGenerator<string> {
  const { maxKeys = 1000, continuationToken } = options;
  
  let nextToken = continuationToken;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: nextToken,
    });
    
    try {
      const result = await s3.send(command);
      
      if (result.Contents) {
        for (const obj of result.Contents) {
          if (obj.Key) {
            yield obj.Key;
          }
        }
      }
      
      nextToken = result.NextContinuationToken;
    } catch (error) {
      throw new Error(`Failed to list objects from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } while (nextToken);
}

/**
 * Get object from S3 as Buffer
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Object data as Buffer
 */
export async function get(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  try {
    const result = await s3.send(command);
    
    if (!result.Body) {
      throw new Error('Object body is empty');
    }
    
    if (result.Body instanceof Readable) {
      return await streamToBuffer(result.Body);
    } else {
      // Handle other body types if needed
      throw new Error('Unsupported body type');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchKey') {
      throw new Error(`Object not found: ${key}`);
    }
    throw new Error(`Failed to get object from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if an object exists in S3
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns True if object exists, false otherwise
 */
export async function exists(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    await head(s3, bucket, key);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return false;
    }
    throw error;
  }
}

/**
 * Copy object within S3
 * @param s3 - S3 client
 * @param bucket - Bucket name
 * @param sourceKey - Source object key
 * @param destKey - Destination object key
 * @returns Promise that resolves when copy is complete
 */
export async function copy(
  s3: S3Client,
  bucket: string,
  sourceKey: string,
  destKey: string
): Promise<void> {
  const command = new CopyObjectCommand({
    Bucket: bucket,
    Key: destKey,
    CopySource: `${bucket}/${sourceKey}`,
  });
  
  try {
    await s3.send(command);
  } catch (error) {
    throw new Error(`Failed to copy object in S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
