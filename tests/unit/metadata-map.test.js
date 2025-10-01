import { describe, it, expect } from '@jest/globals';
import {
  extractIndexed,
  validateRequiredIndexed,
  isValidBase64Node,
  validateBase64Properties,
  getBase64Properties,
  isSafeForTextRendition,
  extractTextFromBase64,
} from '../../src/meta/metadataMap.js';

describe('Metadata Map', () => {
  const sampleMap = {
    indexedProps: ['id', 'name', 'address.city', 'tags[]', 'status'],
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
    email: 'john@example.com',
    address: {
      city: 'New York',
      country: 'USA',
    },
    tags: ['user', 'admin'],
    status: 'active',
    content: 'JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDMgMCBSCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDIgMCBSCj4+Cj4+Ci9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9Db250ZW50cyA0IDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2ZXRpY2EKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL0xlbmd0aCA0NAo+PgpzdHJlYW0KQlQKL0YxIDEyIFRmCjcyIDcyMCAgVGQKKEhlbGxvIFdvcmxkKSBUagpFVApFTQplbmRzdHJlYW0KZW5kb2JqCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDMgMCBSCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbMSAwIFJdCj4+CmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYKMDAwMDAwMDAwOSAwMDAwMCBuCjAwMDAwMDAwNzQgMDAwMDAgbgowMDAwMDAwMTIwIDAwMDAwIG4KMDAwMDAwMDE2NSAwMDAwMCBuCnRyYWlsZXIKPDwKL1NpemUgNQovUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMjU0CiUlRU9G',
    avatar: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    description: 'VGhpcyBpcyBhIHRlc3QgZGVzY3JpcHRpb24=',
  };

  describe('extractIndexed', () => {
    it('should extract indexed properties correctly', () => {
      const result = extractIndexed(sampleData, sampleMap);
      
      expect(result).toEqual({
        id: '123',
        name: 'John Doe',
        address: {
          city: 'New York',
        },
        tags: ['user', 'admin'],
        status: 'active',
      });
    });

    it('should handle missing properties gracefully', () => {
      const data = { id: '123' };
      const result = extractIndexed(data, sampleMap);
      
      expect(result).toEqual({
        id: '123',
      });
    });

    it('should handle array notation correctly', () => {
      const data = { tags: ['a', 'b', 'c'] };
      const map = { indexedProps: ['tags[]'] };
      const result = extractIndexed(data, map);
      
      expect(result).toEqual({
        tags: ['a', 'b', 'c'],
      });
    });

    it('should handle nested properties correctly', () => {
      const data = { address: { city: 'Paris', country: 'France' } };
      const map = { indexedProps: ['address.city'] };
      const result = extractIndexed(data, map);
      
      expect(result).toEqual({
        address: {
          city: 'Paris',
        },
      });
    });
  });

  describe('validateRequiredIndexed', () => {
    it('should pass validation when all required fields are present', () => {
      expect(() => validateRequiredIndexed(sampleData, sampleMap)).not.toThrow();
    });

    it('should throw error when required field is missing', () => {
      const data = { name: 'John Doe' }; // missing 'id'
      
      expect(() => validateRequiredIndexed(data, sampleMap)).toThrow('Required indexed field \'id\' is missing or empty');
    });

    it('should throw error when required field is empty', () => {
      const data = { id: '', name: 'John Doe' };
      
      expect(() => validateRequiredIndexed(data, sampleMap)).toThrow('Required indexed field \'id\' is missing or empty');
    });

    it('should not throw when no required fields are configured', () => {
      const map = { indexedProps: ['id', 'name'] };
      const data = { id: '123' };
      
      expect(() => validateRequiredIndexed(data, map)).not.toThrow();
    });
  });

  describe('isValidBase64Node', () => {
    it('should validate correct base64 strings', () => {
      expect(isValidBase64Node('SGVsbG8gV29ybGQ=')).toBe(true);
      expect(isValidBase64Node('')).toBe(true);
      expect(isValidBase64Node('YWJjZGVmZ2hpams=')).toBe(true);
    });

    it('should reject invalid base64 strings', () => {
      expect(isValidBase64Node('Hello World')).toBe(false);
      expect(isValidBase64Node('SGVsbG8gV29ybGQ!')).toBe(false);
      expect(isValidBase64Node('SGVsbG8gV29ybGQ')).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isValidBase64Node(123)).toBe(false);
      expect(isValidBase64Node(null)).toBe(false);
      expect(isValidBase64Node(undefined)).toBe(false);
      expect(isValidBase64Node({})).toBe(false);
    });
  });

  describe('validateBase64Properties', () => {
    it('should pass validation when base64 properties are valid', () => {
      expect(() => validateBase64Properties(sampleData, sampleMap)).not.toThrow();
    });

    it('should throw error when base64 property is invalid', () => {
      const data = { ...sampleData, content: 'invalid base64!' };
      
      expect(() => validateBase64Properties(data, sampleMap)).toThrow('Property \'content\' is not valid base64');
    });

    it('should not throw when base64 property is missing', () => {
      const data = { id: '123', name: 'John' };
      
      expect(() => validateBase64Properties(data, sampleMap)).not.toThrow();
    });

    it('should not throw when no base64 properties are configured', () => {
      const map = { indexedProps: ['id'] };
      const data = { id: '123', content: 'invalid!' };
      
      expect(() => validateBase64Properties(data, map)).not.toThrow();
    });
  });

  describe('getBase64Properties', () => {
    it('should return base64 properties with their configurations', () => {
      const result = getBase64Properties(sampleData, sampleMap);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        path: 'content',
        value: sampleData.content,
        config: { contentType: 'application/pdf' },
      });
      expect(result[1]).toEqual({
        path: 'avatar',
        value: sampleData.avatar,
        config: { contentType: 'image/png', preferredText: true },
      });
    });

    it('should return empty array when no base64 properties are configured', () => {
      const map = { indexedProps: ['id'] };
      const result = getBase64Properties(sampleData, map);
      
      expect(result).toEqual([]);
    });

    it('should skip missing or null properties', () => {
      const data = { id: '123', content: sampleData.content };
      const result = getBase64Properties(data, sampleMap);
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('content');
    });
  });

  describe('isSafeForTextRendition', () => {
    it('should return true for safe text', () => {
      expect(isSafeForTextRendition('Hello World')).toBe(true);
      expect(isSafeForTextRendition('Hello\nWorld')).toBe(true);
      expect(isSafeForTextRendition('Hello\tWorld')).toBe(true);
      expect(isSafeForTextRendition('Hello\r\nWorld')).toBe(true);
    });

    it('should return false for text with too many control characters', () => {
      const textWithControlChars = 'Hello\x00\x01\x02World';
      expect(isSafeForTextRendition(textWithControlChars)).toBe(false);
    });

    it('should return false for empty text', () => {
      expect(isSafeForTextRendition('')).toBe(false);
    });

    it('should respect max control char ratio', () => {
      const text = 'Hello\x00World'; // 1 control char out of 11 chars = ~9%
      expect(isSafeForTextRendition(text, 0.1)).toBe(true);
      expect(isSafeForTextRendition(text, 0.05)).toBe(false);
    });
  });

  describe('extractTextFromBase64', () => {
    it('should extract text from safe base64 content', () => {
      const base64 = Buffer.from('Hello World').toString('base64');
      const result = extractTextFromBase64(base64);
      
      expect(result).toBe('Hello World');
    });

    it('should return null for unsafe content', () => {
      const base64 = Buffer.from('Hello\x00\x01\x02World').toString('base64');
      const result = extractTextFromBase64(base64);
      
      expect(result).toBeNull();
    });

    it('should return null for invalid base64', () => {
      const result = extractTextFromBase64('invalid base64!');
      
      expect(result).toBeNull();
    });

    it('should handle different charsets', () => {
      const text = 'Hello 世界';
      const base64 = Buffer.from(text, 'utf8').toString('base64');
      const result = extractTextFromBase64(base64, 'utf8');
      
      expect(result).toBe(text);
    });
  });
});
