import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { BridgeRouter } from '../../src/router/router.js';

describe('Router Integration Tests', () => {
  let router;
  
  // Use the real MongoDB connection from the example config
  const config = {
    mongoUris: ['mongodb://localhost:27017'],
    spacesConns: [{
      endpoint: 'https://nyc3.digitaloceanspaces.com',
      region: 'nyc3',
      accessKey: 'DOxxxxACCESS',
      secretKey: 'DOxxxxSECRET',
      backupsBucket: 'udm-backups-nyc3',
      jsonBucket: 'udm-json-nyc3',
      contentBucket: 'udm-content-nyc3',
      forcePathStyle: false
    }],
    hashAlgo: 'rendezvous',
    chooseKey: 'tenantId|dbName'
  };

  beforeAll(() => {
    router = new BridgeRouter(config);
  });

  afterAll(async () => {
    if (router) {
      await router.shutdown();
    }
  });

  describe('Real MongoDB Connection', () => {
    it('should connect to MongoDB successfully', async () => {
      const mongoClient = await router.getMongo(0);
      expect(mongoClient).toBeDefined();
      
      // Test basic connectivity
      const admin = mongoClient.db().admin();
      const result = await admin.ping();
      expect(result).toBeDefined();
    }, 10000); // 10 second timeout for connection

    it('should reuse MongoDB client', async () => {
      const client1 = await router.getMongo(0);
      const client2 = await router.getMongo(0);
      
      expect(client1).toBe(client2);
    });

    it('should get pool statistics after connection', async () => {
      await router.getMongo(0);
      const stats = router.getPoolStats();
      
      expect(stats.mongoClients).toBe(1);
      expect(stats.s3Clients).toBe(0); // S3 not connected yet
      expect(stats.totalBackends).toBe(1);
    });
  });

  describe('S3 Client Management', () => {
    it('should create S3 client', () => {
      const s3Client = router.getS3(0);
      expect(s3Client).toBeDefined();
    });

    it('should reuse S3 client', () => {
      const client1 = router.getS3(0);
      const client2 = router.getS3(0);
      
      expect(client1).toBe(client2);
    });

    it('should get S3 connection config', () => {
      const config = router.getSpaces(0);
      expect(config).toEqual({
        endpoint: 'https://nyc3.digitaloceanspaces.com',
        region: 'nyc3',
        accessKey: 'DOxxxxACCESS',
        secretKey: 'DOxxxxSECRET',
        backupsBucket: 'udm-backups-nyc3',
        jsonBucket: 'udm-json-nyc3',
        contentBucket: 'udm-content-nyc3',
        forcePathStyle: false
      });
    });
  });

  describe('Routing with Real Backend', () => {
    it('should route consistently', () => {
      const ctx = {
        dbName: 'testdb',
        collection: 'users',
        tenantId: 'tenant-123'
      };
      
      const index1 = router.routeIndex(ctx);
      const index2 = router.routeIndex(ctx);
      
      expect(index1).toBe(index2);
      expect(index1).toBe(0); // Only one backend
    });

    it('should generate correct routing keys', () => {
      const ctx1 = { dbName: 'testdb', collection: 'users', tenantId: 'tenant-123' };
      const ctx2 = { dbName: 'testdb', collection: 'users' };
      
      const routeInfo1 = router.getRouteInfo(ctx1);
      const routeInfo2 = router.getRouteInfo(ctx2);
      
      expect(routeInfo1.routingKey).toBe('tenant-123');
      expect(routeInfo2.routingKey).toBe('testdb');
    });
  });

  describe('Shutdown with Real Connections', () => {
    it('should shutdown gracefully with active connections', async () => {
      // Ensure we have active connections
      await router.getMongo(0);
      router.getS3(0);
      
      const statsBefore = router.getPoolStats();
      expect(statsBefore.mongoClients).toBe(1);
      expect(statsBefore.s3Clients).toBe(1);
      
      await router.shutdown();
      
      expect(router.isShutdown()).toBe(true);
    });
  });
});
