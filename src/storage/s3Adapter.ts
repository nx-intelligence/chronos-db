import { S3Client } from '@aws-sdk/client-s3';
import type { StorageAdapter } from './interface.js';
import { putJSON, putRaw, getJSON, head as s3Head, del as s3Del, presignGet as s3PresignGet, list as s3List, copy as s3Copy } from './s3.js';

// ============================================================================
// S3 Storage Adapter
// ============================================================================

/**
 * S3 storage adapter that implements StorageAdapter interface
 * Works with any S3-compatible provider (AWS, DigitalOcean, MinIO, R2, etc.)
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly s3: S3Client;

  constructor(s3: S3Client) {
    this.s3 = s3;
  }

  async putJSON(
    bucket: string,
    key: string,
    data: any
  ): Promise<{ size: number | null; sha256: string | null }> {
    return await putJSON(this.s3, bucket, key, data);
  }

  async putRaw(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array,
    contentType?: string
  ): Promise<{ size: number | null; sha256: string | null }> {
    return await putRaw(this.s3, bucket, key, body, contentType);
  }

  async getJSON(bucket: string, key: string): Promise<Record<string, unknown>> {
    return await getJSON(this.s3, bucket, key);
  }

  async getRaw(bucket: string, key: string): Promise<Buffer> {
    const result = await getJSON(this.s3, bucket, key);
    return Buffer.from(JSON.stringify(result));
  }

  async head(bucket: string, key: string): Promise<{ exists: boolean; size?: number }> {
    const result = await s3Head(this.s3, bucket, key);
    return {
      exists: result.contentLength !== undefined,
      size: result.contentLength || undefined,
    };
  }

  async del(bucket: string, key: string): Promise<void> {
    await s3Del(this.s3, bucket, key);
  }

  async presignGet(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    return await s3PresignGet(this.s3, bucket, key, ttlSeconds);
  }

  async list(
    bucket: string,
    prefix: string,
    opts?: { maxKeys?: number; continuationToken?: string }
  ): Promise<{ keys: string[]; nextToken?: string }> {
    // Collect keys from async generator
    const keys: string[] = [];
    const maxKeys = opts?.maxKeys || 1000;
    let count = 0;
    
    for await (const key of s3List(this.s3, bucket, prefix, opts || {})) {
      keys.push(key);
      count++;
      if (count >= maxKeys) {
        break;
      }
    }
    
    return { keys };
  }

  async copy(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<void> {
    await s3Copy(this.s3, `${sourceBucket}/${sourceKey}`, destBucket, destKey);
  }
}

