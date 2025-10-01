import { describe, it, expect, jest } from '@jest/globals';
import { S3Client } from '@aws-sdk/client-s3';
import {
  putJSON,
  putRaw,
  head,
  del,
  presignGet,
  list,
  get,
  exists,
  copy,
} from '../../src/storage/s3.js';

// Mock S3Client
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('Storage S3 Operations', () => {
  let mockS3Client;
  let mockSend;

  beforeEach(() => {
    mockSend = jest.fn();
    mockS3Client = {
      send: mockSend,
    };
  });

  describe('putJSON', () => {
    it('should put JSON data successfully', async () => {
      const payload = { name: 'test', value: 123 };
      const expectedResult = {
        ETag: '"abc123"',
      };
      
      mockSend.mockResolvedValue(expectedResult);

      const result = await putJSON(mockS3Client, 'test-bucket', 'test-key', payload);

      expect(result.size).toBeGreaterThan(0);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.etag).toBe('"abc123"');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle custom content type', async () => {
      const payload = { name: 'test' };
      const contentType = 'application/json; charset=utf-8';
      
      mockSend.mockResolvedValue({ ETag: '"abc123"' });

      await putJSON(mockS3Client, 'test-bucket', 'test-key', payload, contentType);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            ContentType: contentType,
          }),
        })
      );
    });

    it('should throw error on S3 failure', async () => {
      const payload = { name: 'test' };
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      await expect(putJSON(mockS3Client, 'test-bucket', 'test-key', payload))
        .rejects.toThrow('Failed to put JSON to S3: S3 error');
    });
  });

  describe('putRaw', () => {
    it('should put Buffer data successfully', async () => {
      const data = Buffer.from('test data');
      const expectedResult = {
        ETag: '"def456"',
      };
      
      mockSend.mockResolvedValue(expectedResult);

      const result = await putRaw(mockS3Client, 'test-bucket', 'test-key', data);

      expect(result.size).toBe(data.length);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.etag).toBe('"def456"');
    });

    it('should put Uint8Array data successfully', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const expectedResult = {
        ETag: '"ghi789"',
      };
      
      mockSend.mockResolvedValue(expectedResult);

      const result = await putRaw(mockS3Client, 'test-bucket', 'test-key', data);

      expect(result.size).toBe(data.length);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw error on S3 failure', async () => {
      const data = Buffer.from('test');
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      await expect(putRaw(mockS3Client, 'test-bucket', 'test-key', data))
        .rejects.toThrow('Failed to put raw data to S3: S3 error');
    });
  });

  describe('head', () => {
    it('should get object metadata successfully', async () => {
      const expectedResult = {
        ContentLength: 1024,
        ContentType: 'application/json',
        LastModified: new Date('2024-01-01T00:00:00Z'),
        ETag: '"abc123"',
        Metadata: { 'sha256': 'def456' },
      };
      
      mockSend.mockResolvedValue(expectedResult);

      const result = await head(mockS3Client, 'test-bucket', 'test-key');

      expect(result.contentLength).toBe(1024);
      expect(result.contentType).toBe('application/json');
      expect(result.lastModified).toEqual(new Date('2024-01-01T00:00:00Z'));
      expect(result.etag).toBe('"abc123"');
      expect(result.metadata).toEqual({ 'sha256': 'def456' });
    });

    it('should throw error for not found', async () => {
      const error = new Error('Not found');
      error.name = 'NotFound';
      
      mockSend.mockRejectedValue(error);

      await expect(head(mockS3Client, 'test-bucket', 'test-key'))
        .rejects.toThrow('Object not found: test-key');
    });

    it('should throw error on S3 failure', async () => {
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      await expect(head(mockS3Client, 'test-bucket', 'test-key'))
        .rejects.toThrow('Failed to head object from S3: S3 error');
    });
  });

  describe('del', () => {
    it('should delete object successfully', async () => {
      mockSend.mockResolvedValue({});

      await del(mockS3Client, 'test-bucket', 'test-key');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error on S3 failure', async () => {
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      await expect(del(mockS3Client, 'test-bucket', 'test-key'))
        .rejects.toThrow('Failed to delete object from S3: S3 error');
    });
  });

  describe('presignGet', () => {
    it('should generate presigned URL successfully', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const expectedUrl = 'https://test-bucket.s3.amazonaws.com/test-key?signature=abc123';
      
      getSignedUrl.mockResolvedValue(expectedUrl);

      const result = await presignGet(mockS3Client, 'test-bucket', 'test-key', 3600);

      expect(result).toBe(expectedUrl);
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('should use default TTL', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      
      getSignedUrl.mockResolvedValue('https://test.com');

      await presignGet(mockS3Client, 'test-bucket', 'test-key');

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(Object),
        { expiresIn: 3600 }
      );
    });

    it('should throw error on failure', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const error = new Error('Presign error');
      
      getSignedUrl.mockRejectedValue(error);

      await expect(presignGet(mockS3Client, 'test-bucket', 'test-key'))
        .rejects.toThrow('Failed to generate presigned URL: Presign error');
    });
  });

  describe('list', () => {
    it('should list objects successfully', async () => {
      const expectedResults = [
        { Contents: [{ Key: 'test1.json' }, { Key: 'test2.json' }] },
        { Contents: [{ Key: 'test3.json' }] },
      ];
      
      mockSend
        .mockResolvedValueOnce(expectedResults[0])
        .mockResolvedValueOnce(expectedResults[1]);

      const keys = [];
      for await (const key of list(mockS3Client, 'test-bucket', 'test-prefix')) {
        keys.push(key);
      }

      expect(keys).toEqual(['test1.json', 'test2.json', 'test3.json']);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should handle empty results', async () => {
      mockSend.mockResolvedValue({ Contents: [] });

      const keys = [];
      for await (const key of list(mockS3Client, 'test-bucket', 'test-prefix')) {
        keys.push(key);
      }

      expect(keys).toEqual([]);
    });

    it('should throw error on S3 failure', async () => {
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      const generator = list(mockS3Client, 'test-bucket', 'test-prefix');
      
      await expect(generator.next()).rejects.toThrow('Failed to list objects from S3: S3 error');
    });
  });

  describe('get', () => {
    it('should get object successfully', async () => {
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('test data'));
          } else if (event === 'end') {
            callback();
          }
        }),
      };
      
      const expectedResult = {
        Body: mockStream,
      };
      
      mockSend.mockResolvedValue(expectedResult);

      const result = await get(mockS3Client, 'test-bucket', 'test-key');

      expect(result).toEqual(Buffer.from('test data'));
    });

    it('should throw error for not found', async () => {
      const error = new Error('No such key');
      error.name = 'NoSuchKey';
      
      mockSend.mockRejectedValue(error);

      await expect(get(mockS3Client, 'test-bucket', 'test-key'))
        .rejects.toThrow('Object not found: test-key');
    });

    it('should throw error on S3 failure', async () => {
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      await expect(get(mockS3Client, 'test-bucket', 'test-key'))
        .rejects.toThrow('Failed to get object from S3: S3 error');
    });
  });

  describe('exists', () => {
    it('should return true if object exists', async () => {
      const expectedResult = {
        ContentLength: 1024,
      };
      
      mockSend.mockResolvedValue(expectedResult);

      const result = await exists(mockS3Client, 'test-bucket', 'test-key');

      expect(result).toBe(true);
    });

    it('should return false if object not found', async () => {
      const error = new Error('Object not found: test-key');
      
      mockSend.mockRejectedValue(error);

      const result = await exists(mockS3Client, 'test-bucket', 'test-key');

      expect(result).toBe(false);
    });

    it('should throw error on other failures', async () => {
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      await expect(exists(mockS3Client, 'test-bucket', 'test-key'))
        .rejects.toThrow('S3 error');
    });
  });

  describe('copy', () => {
    it('should copy object successfully', async () => {
      mockSend.mockResolvedValue({});

      await copy(mockS3Client, 'test-bucket', 'source-key', 'dest-key');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error on S3 failure', async () => {
      const error = new Error('S3 error');
      
      mockSend.mockRejectedValue(error);

      await expect(copy(mockS3Client, 'test-bucket', 'source-key', 'dest-key'))
        .rejects.toThrow('Failed to copy object in S3: S3 error');
    });
  });
});
