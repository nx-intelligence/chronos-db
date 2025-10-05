import { MongoClient } from 'mongodb';
import { BridgeRouter } from '../router/router.js';
import type { ChronosConfig } from '../config.js';

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
  countersDb: { ok: boolean; pingMs?: number; error?: string };
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
 * @param config - UDM configuration
 * @returns Health report
 */
export async function health(router: BridgeRouter, config: ChronosConfig): Promise<HealthReport> {
  const timestamp = new Date().toISOString();
  const backends = await listBackends(router);
  
  // Check MongoDB backends
  const mongoBackends = await Promise.all(
    backends.map(async (backend) => {
      try {
        const start = Date.now();
        const mongoClient = await router.getMongo(backend.index);
        if (!mongoClient) {
          return { index: backend.index, ok: false, error: 'MongoDB client not available' };
        }
        
        await mongoClient.db('admin').admin().ping();
        const pingMs = Date.now() - start;
        return { index: backend.index, ok: true, pingMs };
      } catch (error) {
        return { 
          index: backend.index, 
          ok: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    })
  );

  // Check storage backends (S3 or LocalStorage)
  const s3Backends = await Promise.all(
    backends.map(async (backend) => {
      try {
        const storage = router.getStorage(backend.index);
        if (!storage) {
          return { index: backend.index, ok: false, error: 'Storage not available' };
        }
        
        const spaces = router.getSpaces(backend.index);
        if (!spaces) {
          return { index: backend.index, ok: false, error: 'Storage config not available' };
        }
        
        // Lightweight check - try to list objects
        await storage.list(spaces.buckets.json, '', { maxKeys: 1 });
        return { index: backend.index, ok: true };
      } catch (error) {
        return { 
          index: backend.index, 
          ok: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    })
  );

  // Check counters database
  let countersDb: { ok: boolean; pingMs?: number; error?: string };
  try {
    const start = Date.now();
    const countersClient = new MongoClient(config.counters.mongoUri);
    await countersClient.connect();
    await countersClient.db('admin').admin().ping();
    const pingMs = Date.now() - start;
    await countersClient.close();
    countersDb = { ok: true, pingMs };
  } catch (error) {
    countersDb = { 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }

  return {
    timestamp,
    router: { backends },
    mongoBackends,
    s3Backends,
    countersDb,
  };
}

/**
 * List all backends
 * @param router - Bridge router instance
 * @returns List of backend information
 */
export async function listBackends(router: BridgeRouter): Promise<BackendInfo[]> {
  const backends = router.listBackends();
  return backends.map((backend, index) => ({
    index,
    mongoUri: backend.mongoUri,
    s3Endpoint: backend.endpoint,
  }));
}

/**
 * Shutdown all connections
 * @param router - Bridge router instance
 * @param config - UDM configuration
 */
export async function shutdown(router: BridgeRouter, config: ChronosConfig): Promise<void> {
  // Shutdown router (closes all MongoDB connections)
  await router.shutdown();
  
  // Close counters database connection
  try {
    const countersClient = new MongoClient(config.counters.mongoUri);
    await countersClient.close();
  } catch (error) {
    // Log but don't throw - shutdown should be best effort
    console.error('Failed to close counters database:', error);
  }
}
