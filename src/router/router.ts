import { MongoClient } from 'mongodb';
import type { MongoClientOptions } from 'mongodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { pickIndexHRW, generateRoutingKeyFromDSL } from './hash.js';
import type { SpacesConnConfig, LocalStorageConfig } from '../config.js';
import { LocalStorageAdapter } from '../storage/localStorage.js';
import { S3StorageAdapter } from '../storage/s3Adapter.js';
import type { StorageAdapter } from '../storage/interface.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface RouteContext {
  dbName: string;
  collection: string;
  objectId?: string;
  tenantId?: string;
  forcedIndex?: number; // admin override for migrations/debug
}

export interface RouterInitArgs {
  mongoUris: string[]; // length 1..10
  spacesConns?: SpacesConnConfig[] | undefined; // optional if using localStorage
  localStorage?: LocalStorageConfig | undefined; // optional filesystem storage for dev/test
  hashAlgo?: 'rendezvous' | 'jump'; // default "rendezvous"
  chooseKey?: string | ((ctx: RouteContext) => string); // default: tenantId ?? dbName ?? collection+":"+objectId
}

export interface BackendInfo {
  index: number;
  mongoUri: string;
  endpoint: string;
  region: string;
  jsonBucket: string;
  contentBucket: string;
  backupsBucket: string;
}

// ============================================================================
// BridgeRouter Class
// ============================================================================

export class BridgeRouter {
  private readonly mongoUris: string[];
  private readonly spacesConns: SpacesConnConfig[] | undefined;
  private readonly localStorage: LocalStorageAdapter | null;
  private readonly hashAlgo: 'rendezvous' | 'jump';
  private readonly chooseKey: string | ((ctx: RouteContext) => string);
  private readonly backendIds: string[];
  
  // Connection pools (lazy initialization)
  private mongoClients: Map<number, MongoClient> = new Map();
  private s3Clients: Map<number, S3Client> = new Map();
  
  // Initialization state
  private _isShutdown = false;

  constructor(args: RouterInitArgs) {
    logger.debug('Initializing BridgeRouter', {
      mongoUrisCount: args.mongoUris.length,
      spacesConnsCount: args.spacesConns?.length || 0,
      localStorageEnabled: args.localStorage?.enabled,
      hashAlgo: args.hashAlgo,
      chooseKey: args.chooseKey
    });
    
    this.validateArgs(args);
    
    this.mongoUris = [...args.mongoUris];
    this.spacesConns = args.spacesConns ? [...args.spacesConns] : undefined;
    this.localStorage = args.localStorage?.enabled 
      ? new LocalStorageAdapter(args.localStorage.basePath) 
      : null;
    this.hashAlgo = args.hashAlgo ?? 'rendezvous';
    this.chooseKey = args.chooseKey ?? 'tenantId|dbName|collection:objectId';
    
    logger.debug('BridgeRouter configuration set', {
      mongoUrisCount: this.mongoUris.length,
      hasSpacesConns: !!this.spacesConns,
      hasLocalStorage: !!this.localStorage,
      hashAlgo: this.hashAlgo,
      chooseKey: this.chooseKey
    });
    
    // Initialize local storage buckets if enabled
    if (this.localStorage) {
      this.localStorage.initialize(['json', 'content', 'backups']).catch(error => {
        logger.error('Failed to initialize local storage', {}, error);
      });
    }
    
    // Generate backend IDs for consistent routing
    this.backendIds = this.generateBackendIds();
    
    logger.debug('BridgeRouter initialization completed', {
      backendIdsCount: this.backendIds.length
    });
  }

  /**
   * Validate initialization arguments
   */
  private validateArgs(args: RouterInitArgs): void {
    if (!args.mongoUris || args.mongoUris.length === 0) {
      throw new Error('At least one MongoDB URI is required');
    }
    
    if (args.mongoUris.length > 10) {
      throw new Error('Maximum 10 MongoDB URIs allowed');
    }
    
    // Must have either spacesConns (with connections) or localStorage
    const hasSpacesConns = args.spacesConns && args.spacesConns.length > 0;
    const hasLocalStorage = args.localStorage && args.localStorage.enabled;
    
    if (!hasSpacesConns && !hasLocalStorage) {
      throw new Error('Must provide either spacesConns (S3) with at least one connection or localStorage configuration');
    }
    
    // If using S3, validate connections
    if (hasSpacesConns && args.spacesConns) {
      if (args.spacesConns.length > 10) {
        throw new Error('Maximum 10 S3 connections allowed');
      }
      
      if (args.mongoUris.length !== args.spacesConns.length) {
        throw new Error('Number of MongoDB URIs must match number of S3 connections');
      }
    }
    
    // Validate MongoDB URIs
    for (let i = 0; i < args.mongoUris.length; i++) {
      const uri = args.mongoUris[i];
      if (!uri || typeof uri !== 'string') {
        throw new Error(`Invalid MongoDB URI at index ${i}`);
      }
      
      try {
        new URL(uri);
      } catch {
        throw new Error(`Invalid MongoDB URI format at index ${i}: ${uri}`);
      }
    }
    
    // Validate S3 connections (if provided)
    if (args.spacesConns) {
      for (let i = 0; i < args.spacesConns.length; i++) {
        const conn = args.spacesConns[i];
        if (!conn || !conn.endpoint || !conn.region || !conn.accessKey || !conn.secretKey) {
          throw new Error(`Invalid S3 connection at index ${i}: missing required fields`);
        }
        
        try {
          new URL(conn.endpoint);
        } catch {
          throw new Error(`Invalid S3 endpoint URL at index ${i}: ${conn.endpoint}`);
        }
      }
    }
  }

  /**
   * Generate backend IDs for consistent routing
   */
  private generateBackendIds(): string[] {
    return this.mongoUris.map((uri, index) => {
      if (this.localStorage) {
        // For local storage, just use the MongoDB URI
        return `${uri}|localhost|local`;
      }
      
      if (!this.spacesConns || !this.spacesConns[index]) {
        throw new Error(`Backend index ${index} is not available`);
      }
      
      const conn = this.spacesConns[index];
      return `${uri}|${conn.endpoint}|${conn.jsonBucket}`;
    });
  }

  /**
   * Generate routing key from context
   */
  private generateKey(ctx: RouteContext): string {
    if (typeof this.chooseKey === 'function') {
      return this.chooseKey(ctx);
    }
    
    return generateRoutingKeyFromDSL(this.chooseKey, ctx);
  }

  /**
   * Route a request to determine which backend to use
   * @param ctx - Routing context
   * @returns Backend index (0-based)
   */
  routeIndex(ctx: RouteContext): number {
    if (this._isShutdown) {
      throw new Error('Router has been shutdown');
    }
    
    // Admin override
    if (ctx.forcedIndex !== undefined) {
      if (ctx.forcedIndex < 0 || ctx.forcedIndex >= this.mongoUris.length) {
        throw new Error(`Forced index ${ctx.forcedIndex} is out of range (0-${this.mongoUris.length - 1})`);
      }
      return ctx.forcedIndex;
    }
    
    const key = this.generateKey(ctx);
    
    if (this.hashAlgo === 'jump') {
      // Jump consistent hashing
      const { jumpHash } = require('./hash.js');
      return jumpHash(key, this.mongoUris.length);
    } else {
      // Rendezvous hashing (default)
      return pickIndexHRW(key, this.backendIds);
    }
  }

  /**
   * Get MongoDB client for a specific backend (lazy initialization)
   * @param index - Backend index
   * @returns MongoDB client
   */
  async getMongo(index: number): Promise<MongoClient> {
    if (this._isShutdown) {
      throw new Error('Router has been shutdown');
    }
    
    if (index < 0 || index >= this.mongoUris.length) {
      throw new Error(`Backend index ${index} is out of range (0-${this.mongoUris.length - 1})`);
    }
    
    if (this.mongoClients.has(index)) {
      return this.mongoClients.get(index)!;
    }
    
    // Lazy initialization
    const mongoUri = this.mongoUris[index];
    if (!mongoUri) {
      throw new Error(`MongoDB URI at index ${index} is not available`);
    }
    const options: MongoClientOptions = {
      maxPoolSize: 15,
      minPoolSize: 3,
      maxIdleTimeMS: 60000, // 60 seconds
      serverSelectionTimeoutMS: 5000, // 5 seconds
      socketTimeoutMS: 45000, // 45 seconds
      retryWrites: true,
    };
    
    try {
      const client = new MongoClient(mongoUri, options);
      await client.connect();
      
      this.mongoClients.set(index, client);
      return client;
    } catch (error) {
      throw new Error(`Failed to connect to MongoDB backend ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get storage adapter for a backend index (unified interface for S3 or LocalStorage)
   * THIS IS THE MAIN METHOD - all code should use this
   */
  getStorage(index: number): StorageAdapter {
    if (this._isShutdown) {
      throw new Error('Router has been shutdown');
    }

    // If using local storage, return the same adapter for all indexes
    if (this.localStorage) {
      return this.localStorage;
    }

    // Otherwise, return S3 adapter for this index
    const s3Client = this.getS3(index);
    return new S3StorageAdapter(s3Client);
  }

  /**
   * Get S3 client for a specific backend (lazy initialization)
   * @deprecated Use getStorage() instead for storage-agnostic code
   */
  getS3(index: number): S3Client {
    if (this._isShutdown) {
      throw new Error('Router has been shutdown');
    }

    if (!this.spacesConns) {
      throw new Error('S3 connections not configured. Use localStorage mode or provide spacesConns.');
    }
    
    if (index < 0 || index >= this.spacesConns.length) {
      throw new Error(`Backend index ${index} is out of range (0-${this.spacesConns.length - 1})`);
    }
    
    if (this.s3Clients.has(index)) {
      return this.s3Clients.get(index)!;
    }
    
    // Lazy initialization
    const conn = this.spacesConns[index];
    if (!conn) {
      throw new Error(`S3 connection at index ${index} is not available`);
    }
    const config: S3ClientConfig = {
      endpoint: conn.endpoint,
      region: conn.region,
      credentials: {
        accessKeyId: conn.accessKey,
        secretAccessKey: conn.secretKey,
      },
      forcePathStyle: conn.forcePathStyle ?? false,
    };
    
    const client = new S3Client(config);
    this.s3Clients.set(index, client);
    return client;
  }

  /**
   * Get S3 connection configuration for a specific backend
   * Returns mock config for localStorage mode
   */
  getSpaces(index: number): SpacesConnConfig | { jsonBucket: string; contentBucket: string; backupsBucket: string } {
    if (this._isShutdown) {
      throw new Error('Router has been shutdown');
    }

    // Return mock bucket names for localStorage mode
    if (this.localStorage) {
      return {
        jsonBucket: 'json',
        contentBucket: 'content',
        backupsBucket: 'backups',
      };
    }

    if (!this.spacesConns) {
      throw new Error('S3 connections not configured');
    }
    
    if (index < 0 || index >= this.spacesConns.length) {
      throw new Error(`Backend index ${index} is out of range (0-${this.spacesConns.length - 1})`);
    }
    
    const conn = this.spacesConns[index];
    if (!conn) {
      throw new Error(`Backend index ${index} is not available`);
    }
    return conn;
  }

  /**
   * List all backends with their information
   * @returns Array of backend information
   */
  listBackends(): BackendInfo[] {
    if (this._isShutdown) {
      throw new Error('Router has been shutdown');
    }
    
    return this.mongoUris.map((mongoUri, index) => {
      if (this.localStorage) {
        return {
          index,
          mongoUri,
          endpoint: 'localhost',
          region: 'local',
          jsonBucket: 'json',
          contentBucket: 'content',
          backupsBucket: 'backups',
        };
      }

      if (!this.spacesConns || !this.spacesConns[index]) {
        throw new Error(`Backend index ${index} is not available`);
      }

      const conn = this.spacesConns[index];
      return {
        index,
        mongoUri,
        endpoint: conn.endpoint,
        region: conn.region,
        jsonBucket: conn.jsonBucket,
        contentBucket: conn.contentBucket,
        backupsBucket: conn.backupsBucket,
      };
    });
  }

  /**
   * Get routing information for a context
   * @param ctx - Routing context
   * @returns Routing information including backend details
   */
  getRouteInfo(ctx: RouteContext): {
    index: number;
    backend: BackendInfo;
    routingKey: string;
  } {
    const index = this.routeIndex(ctx);
    const backends = this.listBackends();
    const backend = backends[index];
    if (!backend) {
      throw new Error(`Backend at index ${index} is not available`);
    }
    const routingKey = this.generateKey(ctx);
    
    return {
      index,
      backend,
      routingKey,
    };
  }

  /**
   * Shutdown all connections gracefully
   */
  async shutdown(): Promise<void> {
    if (this._isShutdown) {
      return;
    }
    
    this._isShutdown = true;
    
    // Close all MongoDB clients
    const closePromises = Array.from(this.mongoClients.values()).map(async (client) => {
      try {
        await client.close();
      } catch (error) {
        console.warn('Error closing MongoDB client:', error);
      }
    });
    
    await Promise.all(closePromises);
    
    // Clear client maps
    this.mongoClients.clear();
    this.s3Clients.clear();
  }

  /**
   * Check if router is shutdown
   */
  isShutdown(): boolean {
    return this._isShutdown;
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): {
    mongoClients: number;
    s3Clients: number;
    totalBackends: number;
  } {
    return {
      mongoClients: this.mongoClients.size,
      s3Clients: this.s3Clients.size,
      totalBackends: this.mongoUris.length,
    };
  }
}
