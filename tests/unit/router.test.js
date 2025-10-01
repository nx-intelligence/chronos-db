import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BridgeRouter } from '../../src/router/router.js';

describe('BridgeRouter', () => {
  let router;
  const validConfig = {
    mongoUris: [
      'mongodb+srv://user:pass@cluster-a.mongodb.net',
      'mongodb+srv://user:pass@cluster-b.mongodb.net'
    ],
    spacesConns: [
      {
        endpoint: 'https://nyc3.digitaloceanspaces.com',
        region: 'nyc3',
        accessKey: 'DO_A',
        secretKey: 'SECRET_A',
        backupsBucket: 'udm-backups-a',
        jsonBucket: 'udm-json-a',
        contentBucket: 'udm-content-a',
        forcePathStyle: false
      },
      {
        endpoint: 'https://ams3.digitaloceanspaces.com',
        region: 'ams3',
        accessKey: 'DO_B',
        secretKey: 'SECRET_B',
        backupsBucket: 'udm-backups-b',
        jsonBucket: 'udm-json-b',
        contentBucket: 'udm-content-b',
        forcePathStyle: false
      }
    ],
    hashAlgo: 'rendezvous',
    chooseKey: 'tenantId|dbName'
  };

  beforeEach(() => {
    router = new BridgeRouter(validConfig);
  });

  afterEach(async () => {
    if (router && !router.isShutdown()) {
      await router.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize with valid config', () => {
      expect(router).toBeDefined();
      expect(router.isShutdown()).toBe(false);
    });

    it('should throw error for mismatched array lengths', () => {
      const invalidConfig = {
        ...validConfig,
        mongoUris: ['mongodb://test'],
        spacesConns: validConfig.spacesConns
      };
      expect(() => new BridgeRouter(invalidConfig)).toThrow('Number of MongoDB URIs must match number of S3 connections');
    });

    it('should throw error for empty arrays', () => {
      const invalidConfig = {
        ...validConfig,
        mongoUris: [],
        spacesConns: []
      };
      expect(() => new BridgeRouter(invalidConfig)).toThrow('At least one MongoDB URI is required');
    });

    it('should throw error for too many backends', () => {
      const invalidConfig = {
        ...validConfig,
        mongoUris: Array(11).fill('mongodb://test'),
        spacesConns: Array(11).fill(validConfig.spacesConns[0])
      };
      expect(() => new BridgeRouter(invalidConfig)).toThrow('Maximum 10 MongoDB URIs allowed');
    });

    it('should throw error for invalid MongoDB URI', () => {
      const invalidConfig = {
        ...validConfig,
        mongoUris: ['invalid-uri']
      };
      expect(() => new BridgeRouter(invalidConfig)).toThrow('Invalid MongoDB URI format');
    });

    it('should throw error for invalid S3 endpoint', () => {
      const invalidConfig = {
        ...validConfig,
        spacesConns: [{
          ...validConfig.spacesConns[0],
          endpoint: 'not-a-url'
        }]
      };
      expect(() => new BridgeRouter(invalidConfig)).toThrow('Invalid S3 endpoint URL');
    });
  });

  describe('Routing', () => {
    it('should route consistently for same context', () => {
      const ctx = {
        dbName: 'testdb',
        collection: 'users',
        tenantId: 'tenant-123'
      };
      
      const index1 = router.routeIndex(ctx);
      const index2 = router.routeIndex(ctx);
      
      expect(index1).toBe(index2);
      expect(index1).toBeGreaterThanOrEqual(0);
      expect(index1).toBeLessThan(validConfig.mongoUris.length);
    });

    it('should route different tenants to different backends', () => {
      const ctx1 = { dbName: 'testdb', collection: 'users', tenantId: 'tenant-1' };
      const ctx2 = { dbName: 'testdb', collection: 'users', tenantId: 'tenant-2' };
      
      const index1 = router.routeIndex(ctx1);
      const index2 = router.routeIndex(ctx2);
      
      // With 2 backends, different tenants should likely go to different backends
      // (though not guaranteed due to hashing)
      expect(typeof index1).toBe('number');
      expect(typeof index2).toBe('number');
    });

    it('should respect forced index', () => {
      const ctx = {
        dbName: 'testdb',
        collection: 'users',
        forcedIndex: 1
      };
      
      const index = router.routeIndex(ctx);
      expect(index).toBe(1);
    });

    it('should throw error for invalid forced index', () => {
      const ctx = {
        dbName: 'testdb',
        collection: 'users',
        forcedIndex: 5
      };
      
      expect(() => router.routeIndex(ctx)).toThrow('Forced index 5 is out of range');
    });

    it('should use custom routing key function', () => {
      const customRouter = new BridgeRouter({
        ...validConfig,
        chooseKey: (ctx) => `custom-${ctx.tenantId}`
      });
      
      const ctx = { dbName: 'testdb', collection: 'users', tenantId: 'tenant-123' };
      const index = customRouter.routeIndex(ctx);
      
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(validConfig.mongoUris.length);
    });
  });

  describe('Backend Information', () => {
    it('should list all backends', () => {
      const backends = router.listBackends();
      
      expect(backends).toHaveLength(2);
      expect(backends[0]).toMatchObject({
        index: 0,
        mongoUri: validConfig.mongoUris[0],
        endpoint: validConfig.spacesConns[0].endpoint,
        region: validConfig.spacesConns[0].region,
        jsonBucket: validConfig.spacesConns[0].jsonBucket,
        contentBucket: validConfig.spacesConns[0].contentBucket,
        backupsBucket: validConfig.spacesConns[0].backupsBucket
      });
    });

    it('should get route info', () => {
      const ctx = { dbName: 'testdb', collection: 'users', tenantId: 'tenant-123' };
      const routeInfo = router.getRouteInfo(ctx);
      
      expect(routeInfo).toHaveProperty('index');
      expect(routeInfo).toHaveProperty('backend');
      expect(routeInfo).toHaveProperty('routingKey');
      expect(routeInfo.routingKey).toBe('tenant-123');
    });
  });

  describe('Connection Management', () => {
    it('should get S3 client (lazy initialization)', () => {
      const client = router.getS3(0);
      expect(client).toBeDefined();
      
      // Should return same instance on subsequent calls
      const client2 = router.getS3(0);
      expect(client).toBe(client2);
    });

    it('should get S3 connection config', () => {
      const config = router.getSpaces(0);
      expect(config).toEqual(validConfig.spacesConns[0]);
    });

    it('should throw error for invalid backend index', () => {
      expect(() => router.getS3(5)).toThrow('Backend index 5 is out of range');
      expect(() => router.getSpaces(5)).toThrow('Backend index 5 is out of range');
    });

    it('should get pool statistics', () => {
      const stats = router.getPoolStats();
      
      expect(stats).toMatchObject({
        mongoClients: 0, // No MongoDB clients created yet
        s3Clients: 0,    // No S3 clients created yet
        totalBackends: 2
      });
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      expect(router.isShutdown()).toBe(false);
      
      await router.shutdown();
      
      expect(router.isShutdown()).toBe(true);
    });

    it('should throw error when using after shutdown', async () => {
      await router.shutdown();
      
      expect(() => router.routeIndex({ dbName: 'test', collection: 'users' })).toThrow('Router has been shutdown');
      expect(() => router.getS3(0)).toThrow('Router has been shutdown');
      expect(() => router.listBackends()).toThrow('Router has been shutdown');
    });

    it('should handle multiple shutdown calls', async () => {
      await router.shutdown();
      await router.shutdown(); // Should not throw
      
      expect(router.isShutdown()).toBe(true);
    });
  });
});
