import { MongoClient } from 'mongodb';
import { BridgeRouter } from '../router/router.js';
import type { ChronosConfig, RouteContext } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export interface HealthReport {
  timestamp: string;
  router: {
    backends: Array<{ index: number; mongoUri: string; s3Endpoint: string }>;
  };
  mongoBackends: Array<{ index: number; ok: boolean; pingMs?: number; error?: string }>;
  s3Backends: Array<{ index: number; ok: boolean; error?: string }>;
  countersDb: { ok: boolean; pingMs?: number; error?: string } | null; // Made optional
}

export interface BackendInfo {
  index: number;
  mongoUri: string;
  s3Endpoint: string;
}

// ============================================================================
// Admin Functions
// ============================================================================

/**
 * Check health of all backends
 * @param router - Bridge router instance
 * @param config - Chronos configuration
 * @returns Health report
 */
export async function health(router: BridgeRouter, config: ChronosConfig): Promise<HealthReport> {
  const timestamp = new Date().toISOString();
  
  // Get all MongoDB URIs
  const mongoUris = router.getAllMongoUris();
  
  // Check MongoDB backends
  const mongoBackends = await Promise.all(
    mongoUris.map(async (mongoUri, index) => {
      try {
        const start = Date.now();
        const mongoClient = await router.getMongoClient(mongoUri);
        await mongoClient.db('admin').admin().ping();
        const pingMs = Date.now() - start;
        return { index, ok: true, pingMs };
      } catch (error) {
        return { 
          index, 
          ok: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    })
  );

  // Check storage backends (simplified - just check if we can get spaces)
  const s3Backends = await Promise.all(
    Object.keys(config.spacesConnections).map(async (_, index) => {
      try {
        // Create a test context to get storage
        const testCtx: RouteContext = {
          dbName: 'test',
          collection: 'test',
          databaseType: 'runtime',
          tenantId: 'test'
        };
        
        await router.getSpaces(testCtx);
        return { index, ok: true };
      } catch (error) {
        return { 
          index, 
          ok: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    })
  );

  // Check analytics databases (if configured in runtime)
  let countersDb: { ok: boolean; pingMs?: number; error?: string } | null = null;
  if (config.databases.runtime?.tenantDatabases) {
    try {
      const start = Date.now();
      // Check the first analytics database as a representative
      const firstTenantDb = config.databases.runtime.tenantDatabases[0];
      if (firstTenantDb) {
        const dbConn = config.dbConnections[firstTenantDb.dbConnRef];
        if (dbConn) {
          const countersClient = new MongoClient(dbConn.mongoUri);
          await countersClient.connect();
          await countersClient.db('admin').admin().ping();
          const pingMs = Date.now() - start;
          await countersClient.close();
          countersDb = { ok: true, pingMs };
        }
      }
    } catch (error) {
      countersDb = { 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  return {
    timestamp,
    router: { 
      backends: mongoUris.map((mongoUri, index) => ({
        index,
        mongoUri,
        s3Endpoint: Object.values(config.spacesConnections)[index]?.endpoint || 'unknown'
      }))
    },
    mongoBackends,
    s3Backends,
    countersDb,
  };
}

/**
 * Shutdown all connections
 * @param router - Bridge router instance
 * @param config - Chronos configuration
 */
export async function shutdown(router: BridgeRouter, _config: ChronosConfig): Promise<void> {
  // Shutdown router (closes all MongoDB connections)
  await router.shutdown();
  
  // Analytics databases are managed by the router, so no additional cleanup needed
}
