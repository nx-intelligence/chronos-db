import { describe, it, expect, jest } from '@jest/globals';
import { S3Client } from '@aws-sdk/client-s3';
import {
  externalizeBase64,
  validateRequiredFields,
  hasBase64Properties,
  getBase64PropertiesSize,
  createRefObject,
} from '../../src/meta/externalize.js';

// Mock S3Client
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
}));

// Mock storage modules
jest.mock('../../src/storage/keys.js', () => ({
  propBlobKey: jest.fn((collection, prop, id, ov) => `${collection}/${prop}/${id}/v${ov}/blob.bin`),
  propTextKey: jest.fn((collection, prop, id, ov) => `${collection}/${prop}/${id}/v${ov}/text.txt`),
}));

jest.mock('../../src/storage/s3.js', () => ({
  putRaw: jest.fn(),
}));

describe('Metadata Externalize', () => {
  let mockS3Client;
  let mockPutRaw;

  beforeEach(() => {
    mockPutRaw = jest.fn();
    mockS3Client = {};
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mock behavior
    mockPutRaw.mockResolvedValue({ size: 1024, sha256: 'abc123' });
  });

  const sampleMap = {
    indexedProps: ['id', 'name', 'address.city'],
    base64Props: {
      'content': { contentType: 'application/pdf' },
      'avatar': { contentType: 'image/png', preferredText: true },
      'description': { contentType: 'text/plain; charset=utf-8', preferredText: true },
    },
    validation: {
      requiredIndexed: ['id', 'name'],
    },
  };

  const sampleData = {
    id: '123',
    name: 'John Doe',
    address: {
      city: 'New York',
    },
    content: 'JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDIgMCBSCj4+Cj4+Ci9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9Db250ZW50cyA0IDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2ZXRpY2EKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA0NAo+PgpzdHJlYW0KQlQKL0YxIDEyIFRmCjcyIDcyMCAgVGQKKEhlbGxvIFdvcmxkKSBUagpFVApFTQplbmRzdHJlYW0KZW5kb2JqCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDMgMCBSCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbMSAwIFJdCj4+CmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYKMDAwMDAwMDAwOSAwMDAwMCBuCjAwMDAwMDAwNzQgMDAwMDAgbgowMDAwMDAwMTIwIDAwMDAwIG4KMDAwMDAwMDE2NSAwMDAwMCBuCnRyYWlsZXIKPDwKL1NpemUgNQovUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMjU0CiUlRU9G',
    avatar: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    description: 'VGhpcyBpcyBhIHRlc3QgZGVzY3JpcHRpb24=',
  };

  describe('externalizeBase64', () => {
    it('should externalize base64 properties successfully', async () => {
      const { putRaw } = await import('../../src/storage/s3.js');
      putRaw.mockImplementation(mockPutRaw);

      const options = {
        s3: mockS3Client,
        contentBucket: 'test-bucket',
        collection: 'documents',
        idHex: '64f0a1c2e3b4d5f60718293a',
        ov: 3,
        data: sampleData,
        map: sampleMap,
      };

      const result = await externalizeBase64(options);

      expect(result.transformed).toHaveProperty('content');
      expect(result.transformed.content).toEqual({
        ref: {
          contentBucket: 'test-bucket',
          blobKey: 'documents/content/64f0a1c2e3b4d5f60718293a/v3/blob.bin',
        },
      });

      expect(result.transformed).toHaveProperty('avatar');
      expect(result.transformed.avatar).toEqual({
        ref: {
          contentBucket: 'test-bucket',
          blobKey: 'documents/avatar/64f0a1c2e3b4d5f60718293a/v3/blob.bin',
          textKey: 'documents/avatar/64f0a1c2e3b4d5f60718293a/v3/text.txt',
        },
      });

      expect(result.metaIndexed).toEqual({
        id: '123',
        name: 'John Doe',
        address: {
          city: 'New York',
        },
      });

      expect(result.writtenKeys).toHaveLength(4); // 2 blobs + 2 text files
      expect(result.bytesContent).toBeGreaterThan(0);
    });

    it('should handle data without base64 properties', async () => {
      const data = { id: '123', name: 'John Doe' };
      const map = { indexedProps: ['id', 'name'] };

      const options = {
        s3: mockS3Client,
        contentBucket: 'test-bucket',
        collection: 'documents',
        idHex: '64f0a1c2e3b4d5f60718293a',
        ov: 3,
        data,
        map,
      };

      const result = await externalizeBase64(options);

      expect(result.transformed).toEqual(data);
      expect(result.metaIndexed).toEqual({
        id: '123',
        name: 'John Doe',
      });
      expect(result.writtenKeys).toEqual([]);
      expect(result.bytesContent).toBe(0);
    });

    it('should throw error for invalid base64', async () => {
      const data = { ...sampleData, content: 'invalid base64!' };

      const options = {
        s3: mockS3Client,
        contentBucket: 'test-bucket',
        collection: 'documents',
        idHex: '64f0a1c2e3b4d5f60718293a',
        ov: 3,
        data,
        map: sampleMap,
      };

      await expect(externalizeBase64(options)).rejects.toThrow('Property \'content\' is not valid base64');
    });

    it('should cleanup on failure', async () => {
      const { putRaw } = await import('../../src/storage/s3.js');
      putRaw
        .mockResolvedValueOnce({ size: 1024, sha256: 'abc123' }) // First call succeeds
        .mockRejectedValueOnce(new Error('S3 error')); // Second call fails

      const options = {
        s3: mockS3Client,
        contentBucket: 'test-bucket',
        collection: 'documents',
        idHex: '64f0a1c2e3b4d5f60718293a',
        ov: 3,
        data: sampleData,
        map: sampleMap,
      };

      await expect(externalizeBase64(options)).rejects.toThrow('Failed to externalize base64 property');
    });
  });

  describe('validateRequiredFields', () => {
    it('should pass validation when all required fields are present', () => {
      expect(() => validateRequiredFields(sampleData, sampleMap)).not.toThrow();
    });

    it('should throw error when required field is missing', () => {
      const data = { name: 'John Doe' }; // missing 'id'

      expect(() => validateRequiredFields(data, sampleMap)).toThrow('Required indexed field \'id\' is missing or empty');
    });

    it('should not throw when no required fields are configured', () => {
      const map = { indexedProps: ['id', 'name'] };
      const data = { id: '123' };

      expect(() => validateRequiredFields(data, map)).not.toThrow();
    });
  });

  describe('hasBase64Properties', () => {
    it('should return true when data has base64 properties', () => {
      expect(hasBase64Properties(sampleData, sampleMap)).toBe(true);
    });

    it('should return false when data has no base64 properties', () => {
      const data = { id: '123', name: 'John Doe' };
      expect(hasBase64Properties(data, sampleMap)).toBe(false);
    });

    it('should return false when no base64 properties are configured', () => {
      const map = { indexedProps: ['id', 'name'] };
      expect(hasBase64Properties(sampleData, map)).toBe(false);
    });
  });

  describe('getBase64PropertiesSize', () => {
    it('should calculate correct size for base64 properties', () => {
      const size = getBase64PropertiesSize(sampleData, sampleMap);
      expect(size).toBeGreaterThan(0);
    });

    it('should return 0 when no base64 properties', () => {
      const data = { id: '123', name: 'John Doe' };
      const size = getBase64PropertiesSize(data, sampleMap);
      expect(size).toBe(0);
    });

    it('should return 0 when no base64 properties are configured', () => {
      const map = { indexedProps: ['id', 'name'] };
      const size = getBase64PropertiesSize(sampleData, map);
      expect(size).toBe(0);
    });
  });

  describe('createRefObject', () => {
    it('should create reference object with blob key only', () => {
      const result = createRefObject('test-bucket', 'path/to/blob.bin');
      
      expect(result).toEqual({
        ref: {
          contentBucket: 'test-bucket',
          blobKey: 'path/to/blob.bin',
        },
      });
    });

    it('should create reference object with blob and text keys', () => {
      const result = createRefObject('test-bucket', 'path/to/blob.bin', 'path/to/text.txt');
      
      expect(result).toEqual({
        ref: {
          contentBucket: 'test-bucket',
          blobKey: 'path/to/blob.bin',
          textKey: 'path/to/text.txt',
        },
      });
    });
  });
});
