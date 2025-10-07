import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import type { StorageAdapter } from './interface.js';

// ============================================================================
// Azure Blob Storage Adapter
// ============================================================================

/**
 * Azure Blob Storage adapter that implements StorageAdapter interface
 * Works with Azure Blob Storage accounts
 */
export class AzureBlobStorageAdapter implements StorageAdapter {
  private readonly blobServiceClient: BlobServiceClient;

  constructor(
    accountName: string,
    accountKey: string,
    endpoint?: string
  ) {
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    
    // Use custom endpoint if provided, otherwise use default Azure endpoint
    const url = endpoint || `https://${accountName}.blob.core.windows.net`;
    
    this.blobServiceClient = new BlobServiceClient(url, credential);
  }

  async putJSON(
    bucket: string,
    key: string,
    data: any
  ): Promise<{ size: number | null; sha256: string | null }> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    
    const jsonString = JSON.stringify(data);
    const buffer = Buffer.from(jsonString, 'utf-8');
    
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType: 'application/json'
      }
    });

    return {
      size: buffer.length,
      sha256: null // Azure doesn't provide SHA256 in response
    };
  }

  async putRaw(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array,
    contentType?: string
  ): Promise<{ size: number | null; sha256: string | null }> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType: contentType || 'application/octet-stream'
      }
    });

    return {
      size: buffer.length,
      sha256: null // Azure doesn't provide SHA256 in response
    };
  }

  async getJSON(bucket: string, key: string): Promise<Record<string, unknown>> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    
    const downloadResponse = await blockBlobClient.download();
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Failed to download blob: ${key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.from(chunk));
    }
    
    const buffer = Buffer.concat(chunks);
    const jsonString = buffer.toString('utf-8');
    
    return JSON.parse(jsonString);
  }

  async getRaw(bucket: string, key: string): Promise<Buffer> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    
    const downloadResponse = await blockBlobClient.download();
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error(`Failed to download blob: ${key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.from(chunk));
    }
    
    return Buffer.concat(chunks);
  }

  async head(bucket: string, key: string): Promise<{ exists: boolean; size?: number }> {
    try {
      const containerClient = this.blobServiceClient.getContainerClient(bucket);
      const blockBlobClient = containerClient.getBlockBlobClient(key);
      
      const properties = await blockBlobClient.getProperties();
      
      return {
        exists: true,
        size: properties.contentLength
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  async del(bucket: string, key: string): Promise<void> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    
    await blockBlobClient.delete();
  }

  async presignGet(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    
    const expiresOn = new Date(Date.now() + ttlSeconds * 1000);
    
    const url = await blockBlobClient.generateSasUrl({
      permissions: 'r', // read permission
      expiresOn
    });
    
    return url;
  }

  async list(
    bucket: string,
    prefix: string,
    opts?: { maxKeys?: number; continuationToken?: string }
  ): Promise<{ keys: string[]; nextToken?: string }> {
    const containerClient = this.blobServiceClient.getContainerClient(bucket);
    
    const listOptions: any = {
      prefix
    };
    
    if (opts?.maxKeys) {
      listOptions.maxPageSize = opts.maxKeys;
    }
    
    if (opts?.continuationToken) {
      listOptions.continuationToken = opts.continuationToken;
    }
    
    const iterator = containerClient.listBlobsFlat(listOptions);
    const keys: string[] = [];
    let nextToken: string | undefined;
    
    for await (const blob of iterator) {
      keys.push(blob.name);
      
      // Azure returns continuation token in the iterator
      if (iterator.continuationToken) {
        nextToken = iterator.continuationToken;
      }
    }
    
    return { keys, nextToken };
  }

  async copy(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<void> {
    const sourceContainerClient = this.blobServiceClient.getContainerClient(sourceBucket);
    const destContainerClient = this.blobServiceClient.getContainerClient(destBucket);
    
    const sourceBlobClient = sourceContainerClient.getBlockBlobClient(sourceKey);
    const destBlobClient = destContainerClient.getBlockBlobClient(destKey);
    
    // Generate SAS URL for source blob
    const sourceUrl = await sourceBlobClient.generateSasUrl({
      permissions: 'r', // read permission
      expiresOn: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });
    
    // Copy from source to destination
    await destBlobClient.syncCopyFromURL(sourceUrl);
  }
}
