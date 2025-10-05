import { MongoClient } from 'mongodb';
import type { MongoClientOptions } from 'mongodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { pickIndexHRW, generateRoutingKeyFromDSL } from './hash.js';
import type { SpacesConnConfig, LocalStorageConfig, DatabaseConnection, LogsDatabaseConfig, MongoConnConfig } from '../config.js';
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
  forcedIndex?: number; // admin override for migrations/debug
  
  // Enhanced multi-tenant routing
  key?: string; // Direct key for enhanced routing
  databaseType?: 'metadata' | 'knowledge' | 'runtime' | 'logs';
  tier?: 'domain' | 'tenant';
  tenantId?: string; // Tenant ID for mapping
}

export interface RouterInitArgs {
  spacesConns?: SpacesConnConfig[] | undefined; // optional if using localStorage
  localStorage?: LocalStorageConfig | undefined; // optional filesystem storage for dev/test
  hashAlgo?: 'rendezvous' | 'jump'; // default "rendezvous"
  chooseKey?: string | ((ctx: RouteContext) => string); // default: tenantId ?? dbName ?? collection+":"+objectId

  // MongoDB connections - define once, reference by key
  mongoConns: MongoConnConfig[];
  // Database configuration
  databases: {
    metadata?: DatabaseConnection[];
    knowledge?: DatabaseConnection[];
    runtime?: DatabaseConnection[];
    logs?: LogsDatabaseConfig;
  };
}

export interface BackendInfo {
  index: number;
  mongoUri: string;
  endpoint: string;
  region: string;
  buckets: {
    json: string;
    content: string;
    backup?: string;
  };
}

// ============================================================================
// BridgeRouter Class
// ============================================================================

export class BridgeRouter {
  private readonly mongoConns: MongoConnConfig[];
  private readonly spacesConns: SpacesConnConfig[] | undefined;
  private readonly localStorage: LocalStorageAdapter | null;
  private readonly hashAlgo: 'rendezvous' | 'jump';
  private readonly chooseKey: string | ((ctx: RouteContext) => string);
  private readonly backendIds: string[];
  private readonly databases: {
    metadata?: DatabaseConnection[];
    knowledge?: DatabaseConnection[];
    runtime?: DatabaseConnection[];
    logs?: LogsDatabaseConfig;
  };
  
  // Connection pools (lazy initialization)
  private mongoClients: Map<number, MongoClient> = new Map();
  private s3Clients: Map<number, S3Client> = new Map();
  
  // Initialization state
  private _isShutdown = false;

  constructor(args: RouterInitArgs) {
    logger.debug('Initializing BridgeRouter', {
      mongoConnsCount: args.mongoConns.length,
      databasesCount: Object.keys(args.databases).length,
      spacesConnsCount: args.spacesConns?.length || 0,
      localStorageEnabled: args.localStorage?.enabled,
      hashAlgo: args.hashAlgo,
      chooseKey: args.chooseKey
    });
    
    this.validateArgs(args);
    
    this.mongoConns = [...args.mongoConns];
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
   * Find MongoDB connection by key
   * @param key - MongoDB connection key to search for
   * @returns MongoDB connection config or null
   */
  private findMongoConnByKey(key: string): MongoConnConfig | null {
    return this.mongoConns.find(conn => conn.key === key) || null;
  }

  /**
   * Get all MongoDB URIs from database connections
   */
  private getAllMongoUris(): string[] {
    const uris: string[] = [];
    
    // Collect all MongoDB URIs from all database types
    if (this.databases.metadata) {
      for (const conn of this.databases.metadata) {
        const mongoConn = this.findMongoConnByKey(conn.mongoConnKey);
        if (mongoConn) uris.push(mongoConn.mongoUri);
      }
    }
    
    if (this.databases.knowledge) {
      for (const conn of this.databases.knowledge) {
        const mongoConn = this.findMongoConnByKey(conn.mongoConnKey);
        if (mongoConn) uris.push(mongoConn.mongoUri);
      }
    }
    
    if (this.databases.runtime) {
      for (const conn of this.databases.runtime) {
        const mongoConn = this.findMongoConnByKey(conn.mongoConnKey);
        if (mongoConn) uris.push(mongoConn.mongoUri);
      }
    }
    
    if (this.databases.logs) {
      const mongoConn = this.findMongoConnByKey(this.databases.logs.connection.mongoConnKey);
      if (mongoConn) uris.push(mongoConn.mongoUri);
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
      allConnections.push(...this.databases.metadata);
    }
    
    if (this.databases.knowledge) {
      allConnections.push(...this.databases.knowledge);
    }
    
    if (this.databases.runtime) {
      allConnections.push(...this.databases.runtime);
    }
    
    if (this.databases.logs) {
      allConnections.push(this.databases.logs.connection);
    }
    
    return allConnections.map((conn) => {
      const mongoConn = this.findMongoConnByKey(conn.mongoConnKey);
      if (!mongoConn) {
        throw new Error(`MongoDB connection not found for key: ${conn.mongoConnKey}`);
      }
      
      if (this.localStorage) {
        // For local storage, just use the MongoDB URI
        return `${mongoConn.mongoUri}|localhost|local`;
      }
      
      // Find the S3 connection for this database connection
      let spacesConn: SpacesConnConfig | null = null;
      if (conn.spacesConnKey) {
        spacesConn = this.findSpacesConnByKey(conn.spacesConnKey);
      }
      
      if (!spacesConn && this.spacesConns && this.spacesConns.length > 0) {
        // Fall back to first available S3 connection
        spacesConn = this.spacesConns[0] || null;
      }
      
      if (!spacesConn) {
        throw new Error(`S3 connection not found for database connection: ${conn.key}`);
      }
      
      return `${mongoConn.mongoUri}|${spacesConn.endpoint}|${spacesConn.buckets.json}`;
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

    // Resolve by databaseType/tier/tenantId
    if (ctx.databaseType && ctx.tier) {
      const dbType = this.databases[ctx.databaseType];
      if (!dbType) {
        return null;
      }

      // Handle logs database type (no tiers)
      if (ctx.databaseType === 'logs' && 'connection' in dbType) {
        const logsDb = dbType as LogsDatabaseConfig;
        const mongoConn = this.findMongoConnByKey(logsDb.connection.mongoConnKey);
        if (mongoConn) {
          return {
            mongoUri: mongoConn.mongoUri,
            dbName: logsDb.connection.dbName
          };
        }
      }

      // Handle other database types (arrays of connections)
      const connections = dbType as DatabaseConnection[];
      
      if (ctx.tier === 'tenant' && ctx.tenantId) {
        const tenant = connections.find((conn: DatabaseConnection) => conn.tenantId === ctx.tenantId);
        if (tenant) {
          const mongoConn = this.findMongoConnByKey(tenant.mongoConnKey);
          if (mongoConn) {
            return {
              mongoUri: mongoConn.mongoUri,
              dbName: tenant.dbName
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Find S3 connection by key
   * @param key - S3 connection key to search for
   * @returns S3 connection config or null
   */
  private findSpacesConnByKey(key: string): SpacesConnConfig | null {
    if (!this.spacesConns) return null;
    return this.spacesConns.find(conn => conn.key === key) || null;
  }

  /**
   * Find database connection by key across all database types
   * @param key - Unique key to search for
   * @returns Database connection info with resolved MongoDB URI or null
   */
  private findConnectionByKey(key: string): { mongoUri: string; dbName: string } | null {
    for (const [dbTypeName, dbType] of Object.entries(this.databases)) {
      if (!dbType) continue;
      
      // Handle logs database type (simple structure)
      if (dbTypeName === 'logs' && 'connection' in dbType) {
        const logsDb = dbType as LogsDatabaseConfig;
        if (logsDb.connection && logsDb.connection.key === key) {
          const mongoConn = this.findMongoConnByKey(logsDb.connection.mongoConnKey);
          if (mongoConn) {
            return {
              mongoUri: mongoConn.mongoUri,
              dbName: logsDb.connection.dbName
            };
          }
        }
        continue;
      }
      
      // Handle other database types (arrays of connections)
      const connections = dbType as DatabaseConnection[];
      const connection = connections.find((conn: DatabaseConnection) => conn.key === key);
      if (connection) {
        const mongoConn = this.findMongoConnByKey(connection.mongoConnKey);
        if (mongoConn) {
          return {
            mongoUri: mongoConn.mongoUri,
            dbName: connection.dbName
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
  getSpaces(index: number, connectionKey?: string): SpacesConnConfig | { buckets: { json: string; content: string; versions: string; backup?: string } } {
    if (this._isShutdown) {
      throw new Error('Router has been shutdown');
    }

    // Return mock bucket names for localStorage mode
    if (this.localStorage) {
      return {
        buckets: {
          json: 'json',
          content: 'content',
          versions: 'versions',
          backup: 'backups',
        },
      };
    }

    // If we have a connection key, try to find its specific S3 config
    if (connectionKey) {
      // Find the full DatabaseConnection object to access spacesConnKey
      let fullConnection: DatabaseConnection | null = null;
      for (const dbType of Object.values(this.databases)) {
        if (!dbType) continue;
        if ('connection' in dbType) { // LogsDatabaseConfig
          if (dbType.connection.key === connectionKey) {
            fullConnection = dbType.connection;
            break;
          }
        } else { // DatabaseConnection[]
          fullConnection = (dbType as DatabaseConnection[]).find(conn => conn.key === connectionKey) || null;
          if (fullConnection) break;
        }
      }
      
      if (fullConnection && fullConnection.spacesConnKey) {
        const spacesConn = this.findSpacesConnByKey(fullConnection.spacesConnKey);
        if (spacesConn) {
          return spacesConn;
        }
      }
    }

    // Fall back to global spacesConns
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
          buckets: {
            json: 'json',
            content: 'content',
            backup: 'backups',
          },
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
        buckets: {
          json: conn.buckets.json,
          content: conn.buckets.content,
          ...(conn.buckets.backup && { backup: conn.buckets.backup }),
        },
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
