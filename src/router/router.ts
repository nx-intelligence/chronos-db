import { MongoClient } from 'mongodb';
import type { MongoClientOptions } from 'mongodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { pickIndexHRW, generateRoutingKeyFromDSL } from './hash.js';
import type { SpacesConnConfig, LocalStorageConfig, DatabaseTypeConfig, DatabaseConnection } from '../config.js';
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
  
  // Enhanced multi-tenant routing
  key?: string; // Direct key for enhanced routing
  databaseType?: 'metadata' | 'knowledge' | 'runtime';
  tier?: 'generic' | 'domain' | 'tenant';
  extIdentifier?: string; // External identifier for mapping
}

export interface RouterInitArgs {
  spacesConns?: SpacesConnConfig[] | undefined; // optional if using localStorage
  localStorage?: LocalStorageConfig | undefined; // optional filesystem storage for dev/test
  hashAlgo?: 'rendezvous' | 'jump'; // default "rendezvous"
  chooseKey?: string | ((ctx: RouteContext) => string); // default: tenantId ?? dbName ?? collection+":"+objectId
  
  // Database configuration
  databases: {
    metadata?: DatabaseTypeConfig;
    knowledge?: DatabaseTypeConfig;
    runtime?: DatabaseTypeConfig;
  };
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
  private readonly spacesConns: SpacesConnConfig[] | undefined;
  private readonly localStorage: LocalStorageAdapter | null;
  private readonly hashAlgo: 'rendezvous' | 'jump';
  private readonly chooseKey: string | ((ctx: RouteContext) => string);
  private readonly backendIds: string[];
  private readonly databases: {
    metadata?: DatabaseTypeConfig;
    knowledge?: DatabaseTypeConfig;
    runtime?: DatabaseTypeConfig;
  };
  
  // Connection pools (lazy initialization)
  private mongoClients: Map<number, MongoClient> = new Map();
  private s3Clients: Map<number, S3Client> = new Map();
  
  // Initialization state
  private _isShutdown = false;

  constructor(args: RouterInitArgs) {
    logger.debug('Initializing BridgeRouter', {
      databasesCount: Object.keys(args.databases).length,
      spacesConnsCount: args.spacesConns?.length || 0,
      localStorageEnabled: args.localStorage?.enabled,
      hashAlgo: args.hashAlgo,
      chooseKey: args.chooseKey
    });
    
    this.validateArgs(args);
    
    this.spacesConns = args.spacesConns ? [...args.spacesConns] : undefined;
    this.localStorage = args.localStorage?.enabled 
      ? new LocalStorageAdapter(args.localStorage.basePath) 
      : null;
    this.hashAlgo = args.hashAlgo ?? 'rendezvous';
    this.chooseKey = args.chooseKey ?? 'tenantId|dbName|collection:objectId';
    this.databases = args.databases;
    
    logger.debug('BridgeRouter configuration set', {
      databasesCount: Object.keys(this.databases).length,
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
    // Must have at least one database type configured
    const hasDatabases = args.databases.metadata || args.databases.knowledge || args.databases.runtime;
    if (!hasDatabases) {
      throw new Error('At least one database type (metadata, knowledge, or runtime) must be configured');
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
   * Get all MongoDB URIs from database connections
   */
  private getAllMongoUris(): string[] {
    const uris: string[] = [];
    
    // Collect all MongoDB URIs from all database types
    if (this.databases.metadata) {
      if (this.databases.metadata.generic) uris.push(this.databases.metadata.generic.mongoUri);
      if (this.databases.metadata.domains) uris.push(...this.databases.metadata.domains.map(d => d.mongoUri));
      if (this.databases.metadata.tenants) uris.push(...this.databases.metadata.tenants.map(t => t.mongoUri));
    }
    
    if (this.databases.knowledge) {
      if (this.databases.knowledge.generic) uris.push(this.databases.knowledge.generic.mongoUri);
      if (this.databases.knowledge.domains) uris.push(...this.databases.knowledge.domains.map(d => d.mongoUri));
      if (this.databases.knowledge.tenants) uris.push(...this.databases.knowledge.tenants.map(t => t.mongoUri));
    }
    
    if (this.databases.runtime) {
      if (this.databases.runtime.generic) uris.push(this.databases.runtime.generic.mongoUri);
      if (this.databases.runtime.domains) uris.push(...this.databases.runtime.domains.map(d => d.mongoUri));
      if (this.databases.runtime.tenants) uris.push(...this.databases.runtime.tenants.map(t => t.mongoUri));
    }
    
    return uris;
  }

  /**
   * Generate backend IDs for consistent routing
   */
  private generateBackendIds(): string[] {
    // Collect all database connections from all database types
    const allConnections: DatabaseConnection[] = [];
    
    if (this.databases.metadata) {
      if (this.databases.metadata.generic) allConnections.push(this.databases.metadata.generic);
      if (this.databases.metadata.domains) allConnections.push(...this.databases.metadata.domains);
      if (this.databases.metadata.tenants) allConnections.push(...this.databases.metadata.tenants);
    }
    
    if (this.databases.knowledge) {
      if (this.databases.knowledge.generic) allConnections.push(this.databases.knowledge.generic);
      if (this.databases.knowledge.domains) allConnections.push(...this.databases.knowledge.domains);
      if (this.databases.knowledge.tenants) allConnections.push(...this.databases.knowledge.tenants);
    }
    
    if (this.databases.runtime) {
      if (this.databases.runtime.generic) allConnections.push(this.databases.runtime.generic);
      if (this.databases.runtime.domains) allConnections.push(...this.databases.runtime.domains);
      if (this.databases.runtime.tenants) allConnections.push(...this.databases.runtime.tenants);
    }
    
    return allConnections.map((conn, index) => {
      if (this.localStorage) {
        // For local storage, just use the MongoDB URI
        return `${conn.mongoUri}|localhost|local`;
      }
      
      if (!this.spacesConns || !this.spacesConns[index]) {
        throw new Error(`Backend index ${index} is not available`);
      }
      
      const spacesConn = this.spacesConns[index];
      return `${conn.mongoUri}|${spacesConn.endpoint}|${spacesConn.jsonBucket}`;
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
   * Resolve database connection by key (enhanced multi-tenant routing)
   * @param ctx - Routing context with key or databaseType/tier/extIdentifier
   * @returns Database connection info
   */
  private resolveDatabaseConnection(ctx: RouteContext): { mongoUri: string; dbName: string } | null {
    // Direct key lookup
    if (ctx.key) {
      return this.findConnectionByKey(ctx.key);
    }

    // Resolve by databaseType/tier/extIdentifier
    if (ctx.databaseType && ctx.tier) {
      const dbType = this.databases[ctx.databaseType];
      if (!dbType) {
        return null;
      }

      if (ctx.tier === 'generic' && dbType.generic) {
        return {
          mongoUri: dbType.generic.mongoUri,
          dbName: dbType.generic.dbName
        };
      }

      if (ctx.tier === 'domain' && ctx.extIdentifier && dbType.domains) {
        const domain = dbType.domains.find(d => d.extIdentifier === ctx.extIdentifier);
        if (domain) {
          return {
            mongoUri: domain.mongoUri,
            dbName: domain.dbName
          };
        }
      }

      if (ctx.tier === 'tenant' && ctx.extIdentifier && dbType.tenants) {
        const tenant = dbType.tenants.find(t => t.extIdentifier === ctx.extIdentifier);
        if (tenant) {
          return {
            mongoUri: tenant.mongoUri,
            dbName: tenant.dbName
          };
        }
      }
    }

    return null;
  }

  /**
   * Find database connection by key across all database types
   * @param key - Unique key to search for
   * @returns Database connection info or null
   */
  private findConnectionByKey(key: string): { mongoUri: string; dbName: string } | null {
    for (const dbType of Object.values(this.databases)) {
      if (!dbType) continue;
      
      // Check generic
      if (dbType.generic && dbType.generic.key === key) {
        return {
          mongoUri: dbType.generic.mongoUri,
          dbName: dbType.generic.dbName
        };
      }

      // Check domains
      if (dbType.domains) {
        const domain = dbType.domains.find((d: DatabaseConnection) => d.key === key);
        if (domain) {
          return {
            mongoUri: domain.mongoUri,
            dbName: domain.dbName
          };
        }
      }

      // Check tenants
      if (dbType.tenants) {
        const tenant = dbType.tenants.find((t: DatabaseConnection) => t.key === key);
        if (tenant) {
          return {
            mongoUri: tenant.mongoUri,
            dbName: tenant.dbName
          };
        }
      }
    }

    return null;
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
    
    const mongoUris = this.getAllMongoUris();
    
    // Admin override
    if (ctx.forcedIndex !== undefined) {
      if (ctx.forcedIndex < 0 || ctx.forcedIndex >= mongoUris.length) {
        throw new Error(`Forced index ${ctx.forcedIndex} is out of range (0-${mongoUris.length - 1})`);
      }
      return ctx.forcedIndex;
    }
    
    // Enhanced multi-tenant routing
    const dbConnection = this.resolveDatabaseConnection(ctx);
    if (dbConnection) {
      // Find the backend index for this specific MongoDB URI
      const index = mongoUris.findIndex(uri => uri === dbConnection.mongoUri);
      if (index !== -1) {
        return index;
      }
      // If URI not found, fall back to legacy routing
    }
    
    // Legacy routing fallback
    const key = this.generateKey(ctx);
    
    if (this.hashAlgo === 'jump') {
      // Jump consistent hashing
      const { jumpHash } = require('./hash.js');
      return jumpHash(key, mongoUris.length);
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
    
    const mongoUris = this.getAllMongoUris();
    if (index < 0 || index >= mongoUris.length) {
      throw new Error(`Backend index ${index} is out of range (0-${mongoUris.length - 1})`);
    }
    
    if (this.mongoClients.has(index)) {
      return this.mongoClients.get(index)!;
    }
    
    // Lazy initialization
    const mongoUri = mongoUris[index];
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
    
    const mongoUris = this.getAllMongoUris();
    return mongoUris.map((mongoUri, index) => {
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
    resolvedDbName?: string; // Enhanced: resolved database name
  } {
    const index = this.routeIndex(ctx);
    const backends = this.listBackends();
    const backend = backends[index];
    if (!backend) {
      throw new Error(`Backend at index ${index} is not available`);
    }
    const routingKey = this.generateKey(ctx);
    
    // Enhanced: Resolve database name if using enhanced routing
    const dbConnection = this.resolveDatabaseConnection(ctx);
    const resolvedDbName = dbConnection?.dbName || ctx.dbName;
    
    // VERBOSE: Log routing decision details
    logger.routingDecision('getRouteInfo', {
      ctx,
      index,
      backend,
      routingKey,
      resolvedDbName,
      availableBackends: backends.length
    });
    
    return {
      index,
      backend,
      routingKey,
      resolvedDbName,
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
      totalBackends: this.getAllMongoUris().length,
    };
  }
}
