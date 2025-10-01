import { describe, it, expect } from '@jest/globals';
import {
  pickIndexHRW,
  pickIndexHRW32,
  jumpHash,
  generateRoutingKey,
  generateRoutingKeyFromDSL,
  analyzeDistribution,
} from '../../src/router/hash.js';

describe('Hash Functions', () => {
  const backendIds = ['backend-1', 'backend-2', 'backend-3'];
  const testKeys = ['key1', 'key2', 'key3', 'key4', 'key5'];

  describe('pickIndexHRW', () => {
    it('should return valid indices', () => {
      for (const key of testKeys) {
        const index = pickIndexHRW(key, backendIds);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(backendIds.length);
      }
    });

    it('should be deterministic', () => {
      for (const key of testKeys) {
        const index1 = pickIndexHRW(key, backendIds);
        const index2 = pickIndexHRW(key, backendIds);
        expect(index1).toBe(index2);
      }
    });

    it('should handle single backend', () => {
      const singleBackend = ['backend-1'];
      for (const key of testKeys) {
        const index = pickIndexHRW(key, singleBackend);
        expect(index).toBe(0);
      }
    });

    it('should throw error for empty backends', () => {
      expect(() => pickIndexHRW('key', [])).toThrow('No backends available for routing');
    });
  });

  describe('pickIndexHRW32', () => {
    it('should return valid indices', () => {
      for (const key of testKeys) {
        const index = pickIndexHRW32(key, backendIds);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(backendIds.length);
      }
    });

    it('should be deterministic', () => {
      for (const key of testKeys) {
        const index1 = pickIndexHRW32(key, backendIds);
        const index2 = pickIndexHRW32(key, backendIds);
        expect(index1).toBe(index2);
      }
    });
  });

  describe('jumpHash', () => {
    it('should return valid indices', () => {
      for (const key of testKeys) {
        const index = jumpHash(key, backendIds.length);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(backendIds.length);
      }
    });

    it('should be deterministic', () => {
      for (const key of testKeys) {
        const index1 = jumpHash(key, backendIds.length);
        const index2 = jumpHash(key, backendIds.length);
        expect(index1).toBe(index2);
      }
    });

    it('should handle single bucket', () => {
      for (const key of testKeys) {
        const index = jumpHash(key, 1);
        expect(index).toBe(0);
      }
    });

    it('should throw error for invalid bucket count', () => {
      expect(() => jumpHash('key', 0)).toThrow('Number of buckets must be positive');
      expect(() => jumpHash('key', -1)).toThrow('Number of buckets must be positive');
    });
  });

  describe('generateRoutingKey', () => {
    it('should prioritize tenantId', () => {
      const context = {
        tenantId: 'tenant-123',
        dbName: 'database',
        collection: 'users',
        objectId: 'user-456',
      };
      const key = generateRoutingKey(context);
      expect(key).toBe('tenant-123');
    });

    it('should fallback to dbName when no tenantId', () => {
      const context = {
        dbName: 'database',
        collection: 'users',
        objectId: 'user-456',
      };
      const key = generateRoutingKey(context);
      expect(key).toBe('database');
    });

    it('should fallback to collection:objectId when no tenantId or dbName', () => {
      const context = {
        collection: 'users',
        objectId: 'user-456',
      };
      const key = generateRoutingKey(context);
      expect(key).toBe('users:user-456');
    });

    it('should handle missing objectId', () => {
      const context = {
        collection: 'users',
      };
      const key = generateRoutingKey(context);
      expect(key).toBe('users:');
    });
  });

  describe('generateRoutingKeyFromDSL', () => {
    it('should handle tenantId|dbName DSL', () => {
      const dsl = 'tenantId|dbName';
      const context = {
        tenantId: 'tenant-123',
        dbName: 'database',
        collection: 'users',
        objectId: 'user-456',
      };
      const key = generateRoutingKeyFromDSL(dsl, context);
      expect(key).toBe('tenant-123');
    });

    it('should fallback through DSL chain', () => {
      const dsl = 'tenantId|dbName|collection:objectId';
      const context = {
        dbName: 'database',
        collection: 'users',
        objectId: 'user-456',
      };
      const key = generateRoutingKeyFromDSL(dsl, context);
      expect(key).toBe('database');
    });

    it('should handle collection:objectId DSL', () => {
      const dsl = 'collection:objectId';
      const context = {
        collection: 'users',
        objectId: 'user-456',
      };
      const key = generateRoutingKeyFromDSL(dsl, context);
      expect(key).toBe('users:user-456');
    });

    it('should handle individual fields', () => {
      const dsl = 'collection|objectId';
      const context = {
        collection: 'users',
        objectId: 'user-456',
      };
      const key = generateRoutingKeyFromDSL(dsl, context);
      expect(key).toBe('users');
    });
  });

  describe('analyzeDistribution', () => {
    it('should analyze distribution correctly', () => {
      const analysis = analyzeDistribution(testKeys, backendIds);
      
      expect(analysis.totalKeys).toBe(testKeys.length);
      expect(analysis.backendCount).toBe(backendIds.length);
      expect(analysis.minKeys).toBeGreaterThanOrEqual(0);
      expect(analysis.maxKeys).toBeLessThanOrEqual(testKeys.length);
      expect(analysis.avgKeys).toBeCloseTo(testKeys.length / backendIds.length, 1);
    });

    it('should calculate standard deviation', () => {
      const analysis = analyzeDistribution(testKeys, backendIds);
      expect(analysis.stdDev).toBeGreaterThanOrEqual(0);
    });

    it('should determine if distribution is balanced', () => {
      const analysis = analyzeDistribution(testKeys, backendIds);
      expect(typeof analysis.isBalanced).toBe('boolean');
    });

    it('should show distribution per backend', () => {
      const analysis = analyzeDistribution(testKeys, backendIds);
      expect(Object.keys(analysis.distribution)).toHaveLength(backendIds.length);
      
      const totalDistributed = Object.values(analysis.distribution).reduce((sum, count) => sum + count, 0);
      expect(totalDistributed).toBe(testKeys.length);
    });
  });
});
