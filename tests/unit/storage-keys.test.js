import { describe, it, expect } from '@jest/globals';
import {
  jsonKey,
  propBlobKey,
  propTextKey,
  manifestKey,
  parseJsonKey,
  parseBlobKey,
  parseManifestKey,
  itemPrefix,
  collectionPrefix,
  manifestPrefix,
  manifestPeriodPrefix,
} from '../../src/storage/keys.js';

describe('Storage Keys', () => {
  describe('jsonKey', () => {
    it('should build correct JSON key', () => {
      const key = jsonKey('documents', '64f0a1c2e3b4d5f60718293a', 3);
      expect(key).toBe('documents/64f0a1c2e3b4d5f60718293a/v3/item.json');
    });

    it('should lowercase collection name', () => {
      const key = jsonKey('DOCUMENTS', '64f0a1c2e3b4d5f60718293a', 3);
      expect(key).toBe('documents/64f0a1c2e3b4d5f60718293a/v3/item.json');
    });

    it('should lowercase ID', () => {
      const key = jsonKey('documents', '64F0A1C2E3B4D5F60718293A', 3);
      expect(key).toBe('documents/64f0a1c2e3b4d5f60718293a/v3/item.json');
    });

    it('should handle version 0', () => {
      const key = jsonKey('documents', '64f0a1c2e3b4d5f60718293a', 0);
      expect(key).toBe('documents/64f0a1c2e3b4d5f60718293a/v0/item.json');
    });

    it('should throw error for invalid inputs', () => {
      expect(() => jsonKey('', '64f0a1c2e3b4d5f60718293a', 3)).toThrow('Collection and ID must be non-empty strings');
      expect(() => jsonKey('documents', '', 3)).toThrow('Collection and ID must be non-empty strings');
      expect(() => jsonKey('documents', '64f0a1c2e3b4d5f60718293a', -1)).toThrow('Object version must be a non-negative integer');
      expect(() => jsonKey('documents', '64f0a1c2e3b4d5f60718293a', 3.5)).toThrow('Object version must be a non-negative integer');
    });
  });

  describe('propBlobKey', () => {
    it('should build correct blob key', () => {
      const key = propBlobKey('documents', 'content', '64f0a1c2e3b4d5f60718293a', 3);
      expect(key).toBe('documents/content/64f0a1c2e3b4d5f60718293a/v3/blob.bin');
    });

    it('should lowercase all components', () => {
      const key = propBlobKey('DOCUMENTS', 'CONTENT', '64F0A1C2E3B4D5F60718293A', 3);
      expect(key).toBe('documents/content/64f0a1c2e3b4d5f60718293a/v3/blob.bin');
    });

    it('should throw error for invalid inputs', () => {
      expect(() => propBlobKey('', 'content', '64f0a1c2e3b4d5f60718293a', 3)).toThrow('Collection, property, and ID must be non-empty strings');
      expect(() => propBlobKey('documents', '', '64f0a1c2e3b4d5f60718293a', 3)).toThrow('Collection, property, and ID must be non-empty strings');
      expect(() => propBlobKey('documents', 'content', '', 3)).toThrow('Collection, property, and ID must be non-empty strings');
    });
  });

  describe('propTextKey', () => {
    it('should build correct text key', () => {
      const key = propTextKey('documents', 'content', '64f0a1c2e3b4d5f60718293a', 3);
      expect(key).toBe('documents/content/64f0a1c2e3b4d5f60718293a/v3/text.txt');
    });
  });

  describe('manifestKey', () => {
    it('should build correct manifest key', () => {
      const key = manifestKey('documents', 2024, 3, 123);
      expect(key).toBe('__manifests__/documents/2024/03/snapshot-123.json.gz');
    });

    it('should pad month with zero', () => {
      const key = manifestKey('documents', 2024, 12, 123);
      expect(key).toBe('__manifests__/documents/2024/12/snapshot-123.json.gz');
    });

    it('should throw error for invalid inputs', () => {
      expect(() => manifestKey('', 2024, 3, 123)).toThrow('Collection must be a non-empty string');
      expect(() => manifestKey('documents', 99, 3, 123)).toThrow('Year must be a 4-digit number');
      expect(() => manifestKey('documents', 2024, 0, 123)).toThrow('Month must be an integer between 1 and 12');
      expect(() => manifestKey('documents', 2024, 13, 123)).toThrow('Month must be an integer between 1 and 12');
      expect(() => manifestKey('documents', 2024, 3, -1)).toThrow('Collection version must be a non-negative integer');
    });
  });

  describe('parseJsonKey', () => {
    it('should parse valid JSON key', () => {
      const result = parseJsonKey('documents/64f0a1c2e3b4d5f60718293a/v3/item.json');
      expect(result).toEqual({
        collection: 'documents',
        id: '64f0a1c2e3b4d5f60718293a',
        ov: 3,
      });
    });

    it('should return null for invalid key', () => {
      expect(parseJsonKey('invalid-key')).toBeNull();
      expect(parseJsonKey('documents/64f0a1c2e3b4d5f60718293a/v-1/item.json')).toBeNull();
      expect(parseJsonKey('documents/64f0a1c2e3b4d5f60718293a/v3.5/item.json')).toBeNull();
    });
  });

  describe('parseBlobKey', () => {
    it('should parse valid blob key', () => {
      const result = parseBlobKey('documents/content/64f0a1c2e3b4d5f60718293a/v3/blob.bin');
      expect(result).toEqual({
        collection: 'documents',
        prop: 'content',
        id: '64f0a1c2e3b4d5f60718293a',
        ov: 3,
      });
    });

    it('should return null for invalid key', () => {
      expect(parseBlobKey('invalid-key')).toBeNull();
      expect(parseBlobKey('documents/content/64f0a1c2e3b4d5f60718293a/v3/blob.txt')).toBeNull();
    });
  });

  describe('parseManifestKey', () => {
    it('should parse valid manifest key', () => {
      const result = parseManifestKey('__manifests__/documents/2024/03/snapshot-123.json.gz');
      expect(result).toEqual({
        collection: 'documents',
        year: 2024,
        month: 3,
        cv: 123,
      });
    });

    it('should return null for invalid key', () => {
      expect(parseManifestKey('invalid-key')).toBeNull();
      expect(parseManifestKey('__manifests__/documents/2024/13/snapshot-123.json.gz')).toBeNull();
      expect(parseManifestKey('__manifests__/documents/99/snapshot-123.json.gz')).toBeNull();
    });
  });

  describe('prefix functions', () => {
    it('should build item prefix', () => {
      const prefix = itemPrefix('documents', '64f0a1c2e3b4d5f60718293a');
      expect(prefix).toBe('documents/64f0a1c2e3b4d5f60718293a/');
    });

    it('should build collection prefix', () => {
      const prefix = collectionPrefix('documents');
      expect(prefix).toBe('documents/');
    });

    it('should build manifest prefix', () => {
      const prefix = manifestPrefix('documents');
      expect(prefix).toBe('__manifests__/documents/');
    });

    it('should build manifest period prefix', () => {
      const prefix = manifestPeriodPrefix('documents', 2024, 3);
      expect(prefix).toBe('__manifests__/documents/2024/03/');
    });
  });
});
