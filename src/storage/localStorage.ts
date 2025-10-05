import { promises as fs, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import type { StorageAdapter } from './interface.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Local Filesystem Storage Adapter
// ============================================================================

/**
 * Local storage adapter that implements StorageAdapter interface using the filesystem
 * WARNING: For development/testing only, NOT recommended for production!
 * 
 * This adapter allows you to use UDM with just MongoDB and a local folder,
 * making it easy to test and play with the package without S3.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    logger.debug('Initializing LocalStorageAdapter', { basePath });
    // Ensure base directory and standard subfolders exist on initialization (synchronously)
    this.initializeDirectoriesSync();
  }

  /**
   * Initialize base directory and standard subfolders (synchronous)
   */
  private initializeDirectoriesSync(): void {
    logger.debug('Creating directory structure', { basePath: this.basePath });
    
    // Create base directory
    this.ensureDirSync(this.basePath);
    
    // Create standard subfolders
    const subfolders = [
      'chronos',
      'chronos/backups',
      'chronos/json',
      'chronos/content',
      'manifests',
      'snapshots'
    ];
    
    subfolders.forEach(subfolder => {
      const fullPath = join(this.basePath, subfolder);
      this.ensureDirSync(fullPath);
    });
    
    logger.debug('Directory structure created successfully', { 
      basePath: this.basePath,
      subfolders 
    });
  }

  /**
   * Initialize base directory and standard subfolders
   */
  private async initializeDirectories(): Promise<void> {
    // Create base directory
    await this.ensureDir(this.basePath);
    
    // Create standard subfolders
    await this.ensureDir(join(this.basePath, 'chronos'));
    await this.ensureDir(join(this.basePath, 'chronos', 'backups'));
    await this.ensureDir(join(this.basePath, 'chronos', 'json'));
    await this.ensureDir(join(this.basePath, 'chronos', 'content'));
    await this.ensureDir(join(this.basePath, 'manifests'));
    await this.ensureDir(join(this.basePath, 'snapshots'));
  }

  /**
   * Ensure directory exists (synchronous)
   */
  private ensureDirSync(dir: string): void {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }

  /**
   * Get full path for a key
   */
  private getPath(bucket: string, key: string): string {
    return join(this.basePath, bucket, key);
  }

  /**
   * Put JSON to local storage
   */
  async putJSON(
    bucket: string,
    key: string,
    data: any
  ): Promise<{ size: number | null; sha256: string | null }> {
    const startTime = Date.now();
    logger.debug('Starting putJSON operation', { bucket, key });
    
    const filePath = this.getPath(bucket, key);
    await this.ensureDir(dirname(filePath));

    const jsonString = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonString, 'utf8');

    await fs.writeFile(filePath, buffer);

    // Calculate SHA-256
    const hash = createHash('sha256');
    hash.update(buffer);
    const sha256 = hash.digest('hex');

    const duration = Date.now() - startTime;
    logger.debug('putJSON operation completed successfully', {
      bucket,
      key,
      size: buffer.length,
      sha256,
      durationMs: duration
    });

    return {
      size: buffer.length,
      sha256,
    };
  }

  /**
   * Put raw data to local storage
   */
  async putRaw(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array,
    _contentType?: string
  ): Promise<{ size: number | null; sha256: string | null }> {
    const filePath = this.getPath(bucket, key);
    await this.ensureDir(dirname(filePath));

    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await fs.writeFile(filePath, buffer);

    // Calculate SHA-256
    const hash = createHash('sha256');
    hash.update(buffer);
    const sha256 = hash.digest('hex');

    return {
      size: buffer.length,
      sha256,
    };
  }

  /**
   * Get JSON from local storage
   */
  async getJSON(bucket: string, key: string): Promise<Record<string, unknown>> {
    const filePath = this.getPath(bucket, key);

    try {
      const buffer = await fs.readFile(filePath);
      const jsonString = buffer.toString('utf8');
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error(`Failed to read JSON from local storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get raw data from local storage
   */
  async getRaw(bucket: string, key: string): Promise<Buffer> {
    const filePath = this.getPath(bucket, key);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new Error(`Failed to read from local storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if object exists
   */
  async head(bucket: string, key: string): Promise<{ exists: boolean; size?: number }> {
    const filePath = this.getPath(bucket, key);

    try {
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        size: stats.size,
      };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Delete object from local storage
   */
  async del(bucket: string, key: string): Promise<void> {
    const filePath = this.getPath(bucket, key);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Generate a "presigned" URL (just a file:// URL for local storage)
   */
  async presignGet(
    bucket: string,
    key: string,
    _ttlSeconds: number
  ): Promise<string> {
    const filePath = this.getPath(bucket, key);
    return `file://${filePath}`;
  }

  /**
   * List objects with prefix
   */
  async list(
    bucket: string,
    prefix: string,
    opts?: { maxKeys?: number; continuationToken?: string }
  ): Promise<{ keys: string[]; nextToken?: string }> {
    const bucketPath = join(this.basePath, bucket);
    const prefixPath = join(bucketPath, prefix);

    try {
      const allKeys: string[] = [];
      await this.listRecursive(prefixPath, bucketPath, allKeys);

      const maxKeys = opts?.maxKeys || 1000;
      const startIndex = opts?.continuationToken ? parseInt(opts.continuationToken) : 0;
      const keys = allKeys.slice(startIndex, startIndex + maxKeys);
      const hasMore = startIndex + maxKeys < allKeys.length;

      return { 
        keys, 
        ...(hasMore && { nextToken: String(startIndex + maxKeys) })
      };
    } catch {
      return { keys: [] };
    }
  }

  /**
   * Recursively list files
   */
  private async listRecursive(dir: string, basePath: string, keys: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          await this.listRecursive(fullPath, basePath, keys);
        } else {
          const relativePath = fullPath.substring(basePath.length + 1);
          keys.push(relativePath);
        }
      }
    } catch {
      // Directory doesn't exist or not accessible
    }
  }

  /**
   * Copy object (for restore operations)
   */
  async copy(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<void> {
    const sourcePath = this.getPath(sourceBucket, sourceKey);
    const destPath = this.getPath(destBucket, destKey);

    await this.ensureDir(dirname(destPath));
    await fs.copyFile(sourcePath, destPath);
  }

  /**
   * Initialize local storage (create base directories)
   */
  async initialize(buckets: string[]): Promise<void> {
    for (const bucket of buckets) {
      await this.ensureDir(join(this.basePath, bucket));
    }
  }
}

