import { MongoClient } from 'mongodb';
import type { MongoClientOptions } from 'mongodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { pickIndexHRW, generateRoutingKeyFromDSL } from './hash.js';
import type { 
  DbConnection, 
  SpacesConnection, 
  GenericDatabase, 
  DomainDatabase, 
  TenantDatabase, 
  RuntimeTenantDatabase, 
  LogsDatabase,
  LocalStorageConfig,
  RouteContext
} from '../config.js';
import { LocalStorageAdapter } from '../storage/localStorage.js';
import { S3StorageAdapter } from '../storage/s3Adapter.js';
import type { StorageAdapter } from '../storage/interface.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface RouterInitArgs {
  dbConnections: Record<string, DbConnection>;
  spacesConnections: Record<string, SpacesConnection>;
  databases: {
    metadata?: {
      genericDatabase: GenericDatabase;
      domainsDatabases: DomainDatabase[];
      tenantDatabases: TenantDatabase[];
    };
    knowledge?: {
      genericDatabase: GenericDatabase;
      domainsDatabases: DomainDatabase[];
      tenantDatabases: TenantDatabase[];
    };
    runtime?: {
      tenantDatabases: RuntimeTenantDatabase[];
    };
    logs?: LogsDatabase;
  };
  localStorage?: LocalStorageConfig | undefined;
  hashAlgo?: 'rendezvous' | 'jump';
  chooseKey?: string | ((ctx: RouteContext) => string);
}

export interface BackendInfo {
  index: number;
  mongoUri: string;
  endpoint: string;
  region: string;
  bucket: string;
  analyticsDbName?: string;
}

// ============================================================================
// BridgeRouter Class
// ============================================================================

export class BridgeRouter {
  private readonly dbConnections: Record<string, DbConnection>;
  private readonly spacesConnections: Record<string, SpacesConnection>;
  private readonly localStorage: LocalStorageAdapter | null;
  private readonly hashAlgo: 'rendezvous' | 'jump';
  private readonly chooseKey: string | ((ctx: RouteContext) => string);
  private readonly backendIds: string[];
  private readonly databases: {
    metadata?: {
      genericDatabase: GenericDatabase;
      domainsDatabases: DomainDatabase[];
      tenantDatabases: TenantDatabase[];
    };
    knowledge?: {
      genericDatabase: GenericDatabase;
      domainsDatabases: DomainDatabase[];
      tenantDatabases: TenantDatabase[];
    };
    runtime?: {
      tenantDatabases: RuntimeTenantDatabase[];
    };
    logs?: LogsDatabase;
  };
  
  // Connection pools (lazy initialization)
  private mongoClients: Map<number, MongoClient> = new Map();
  private s3Clients: Map<number, S3Client> = new Map();
  
  // Initialization state
  private _isShutdown = false;

  constructor(args: RouterInitArgs) {
    logger.debug('Initializing BridgeRouter', {
      dbConnectionsCount: Object.keys(args.dbConnections).length,
      spacesConnectionsCount: Object.keys(args.spacesConnections).length,
      databasesCount: Object.keys(args.databases).length,
      localStorageEnabled: args.localStorage?.enabled,
      hashAlgo: args.hashAlgo,
      chooseKey: args.chooseKey
    });
    
    this.validateArgs(args);
    
    this.dbConnections = { ...args.dbConnections };
    this.spacesConnections = { ...args.spacesConnections };
    this.localStorage = args.localStorage?.enabled 
      ? new LocalStorageAdapter(args.localStorage.basePath) 
      : null;
    this.hashAlgo = args.hashAlgo ?? 'rendezvous';
    this.chooseKey = args.chooseKey ?? 'tenantId|dbName|collection:objectId';
    this.databases = args.databases;
    
    logger.debug('BridgeRouter configuration set', {
      databasesCount: Object.keys(this.databases).length,
      hasSpacesConnections: Object.keys(this.spacesConnections).length > 0,
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
    const hasDatabases = args.databases.metadata || args.databases.knowledge || args.databases.runtime || args.databases.logs;
    if (!hasDatabases) {
      throw new Error('At least one database type (metadata, knowledge, runtime, or logs) must be configured');
    }
    
    // Must have either spacesConnections or localStorage
    const hasSpacesConnections = Object.keys(args.spacesConnections).length > 0;
    const hasLocalStorage = args.localStorage && args.localStorage.enabled;
    
    if (!hasSpacesConnections && !hasLocalStorage) {
      throw new Error('Must provide either spacesConnections (S3) or localStorage configuration');
    }
    
    // Validate S3 connections (if provided)
    if (hasSpacesConnections) {
      for (const [key, conn] of Object.entries(args.spacesConnections)) {
        if (!conn || !conn.endpoint || !conn.region || !conn.accessKey || !conn.secretKey) {
          throw new Error(`Invalid S3 connection '${key}': missing required fields`);
        }
        
        try {
          new URL(conn.endpoint);
        } catch {
          throw new Error(`Invalid S3 endpoint URL for connection '${key}': ${conn.endpoint}`);
        }
      }
    }
  }

  /**
   * Find database connection by reference
   * @param ref - Database connection reference to search for
   * @returns Database connection config or null
   */
  private findDbConnection(ref: string): DbConnection | null {
    return this.dbConnections[ref] || null;
  }

  /**
   * Find spaces connection by reference
   * @param ref - Spaces connection reference to search for
   * @returns Spaces connection config or null
   */
  private findSpacesConnection(ref: string): SpacesConnection | null {
    return this.spacesConnections[ref] || null;
  }

  /**
   * Get all MongoDB URIs from database connections
   */
  public getAllMongoUris(): string[] {
    const uris: string[] = [];
    
    // Collect all MongoDB URIs from all database types
    if (this.databases.metadata) {
      const dbConn = this.findDbConnection(this.databases.metadata.genericDatabase.dbConnRef);
      if (dbConn) uris.push(dbConn.mongoUri);
      
      this.databases.metadata.domainsDatabases.forEach(db => {
        const dbConn = this.findDbConnection(db.dbConnRef);
        if (dbConn) uris.push(dbConn.mongoUri);
      });
      
      this.databases.metadata.tenantDatabases.forEach(db => {
        const dbConn = this.findDbConnection(db.dbConnRef);
        if (dbConn) uris.push(dbConn.mongoUri);
      });
    }
    
    if (this.databases.knowledge) {
      const dbConn = this.findDbConnection(this.databases.knowledge.genericDatabase.dbConnRef);
      if (dbConn) uris.push(dbConn.mongoUri);
      
      this.databases.knowledge.domainsDatabases.forEach(db => {
        const dbConn = this.findDbConnection(db.dbConnRef);
        if (dbConn) uris.push(dbConn.mongoUri);
      });
      
      this.databases.knowledge.tenantDatabases.forEach(db => {
        const dbConn = this.findDbConnection(db.dbConnRef);
        if (dbConn) uris.push(dbConn.mongoUri);
      });
    }
    
    if (this.databases.runtime) {
      this.databases.runtime.tenantDatabases.forEach(db => {
        const dbConn = this.findDbConnection(db.dbConnRef);
        if (dbConn) uris.push(dbConn.mongoUri);
      });
    }
    
    if (this.databases.logs) {
      const dbConn = this.findDbConnection(this.databases.logs.dbConnRef);
      if (dbConn) uris.push(dbConn.mongoUri);
    }
    
    return [...new Set(uris)]; // Remove duplicates
  }

  /**
   * Generate backend IDs for consistent routing
   */
  private generateBackendIds(): string[] {
    const backendIds: string[] = [];
    
    // Generate backend IDs for all database configurations
    if (this.databases.metadata) {
      backendIds.push(`metadata-generic-${this.databases.metadata.genericDatabase.dbConnRef}-${this.databases.metadata.genericDatabase.spaceConnRef}`);
      
      this.databases.metadata.domainsDatabases.forEach((db, index) => {
        backendIds.push(`metadata-domain-${index}-${db.dbConnRef}-${db.spaceConnRef}`);
      });
      
      this.databases.metadata.tenantDatabases.forEach((db, index) => {
        backendIds.push(`metadata-tenant-${index}-${db.dbConnRef}-${db.spaceConnRef}`);
      });
    }
    
    if (this.databases.knowledge) {
      backendIds.push(`knowledge-generic-${this.databases.knowledge.genericDatabase.dbConnRef}-${this.databases.knowledge.genericDatabase.spaceConnRef}`);
      
      this.databases.knowledge.domainsDatabases.forEach((db, index) => {
        backendIds.push(`knowledge-domain-${index}-${db.dbConnRef}-${db.spaceConnRef}`);
      });
      
      this.databases.knowledge.tenantDatabases.forEach((db, index) => {
        backendIds.push(`knowledge-tenant-${index}-${db.dbConnRef}-${db.spaceConnRef}`);
      });
    }
    
    if (this.databases.runtime) {
      this.databases.runtime.tenantDatabases.forEach((db, index) => {
        backendIds.push(`runtime-tenant-${index}-${db.dbConnRef}-${db.spaceConnRef}`);
      });
    }
    
    if (this.databases.logs) {
      backendIds.push(`logs-${this.databases.logs.dbConnRef}-${this.databases.logs.spaceConnRef}`);
    }
    
    return backendIds;
  }

  /**
   * Resolve database connection based on context
   */
  public resolveDatabaseConnection(ctx: RouteContext): { mongoUri: string; dbName: string; analyticsDbName?: string } | null {
    const { databaseType, tier, tenantId, domain } = ctx;
    
    if (!databaseType) {
      logger.warn('No database type specified in context', { ctx });
      return null;
    }
    
    switch (databaseType) {
      case 'metadata':
        if (!this.databases.metadata) return null;
        
        if (tier === 'generic') {
          const dbConn = this.findDbConnection(this.databases.metadata.genericDatabase.dbConnRef);
          if (!dbConn) return null;
          return { mongoUri: dbConn.mongoUri, dbName: this.databases.metadata.genericDatabase.dbName };
        }
        
        if (tier === 'domain' && domain) {
          const domainDb = this.databases.metadata.domainsDatabases.find(db => db.domain === domain);
          if (!domainDb) return null;
          const dbConn = this.findDbConnection(domainDb.dbConnRef);
          if (!dbConn) return null;
          return { mongoUri: dbConn.mongoUri, dbName: domainDb.dbName };
        }
        
        if (tier === 'tenant' && tenantId) {
          const tenantDb = this.databases.metadata.tenantDatabases.find(db => db.tenantId === tenantId);
          if (!tenantDb) return null;
          const dbConn = this.findDbConnection(tenantDb.dbConnRef);
          if (!dbConn) return null;
          return { mongoUri: dbConn.mongoUri, dbName: tenantDb.dbName };
        }
        break;
        
      case 'knowledge':
        if (!this.databases.knowledge) return null;
        
        if (tier === 'generic') {
          const dbConn = this.findDbConnection(this.databases.knowledge.genericDatabase.dbConnRef);
          if (!dbConn) return null;
          return { mongoUri: dbConn.mongoUri, dbName: this.databases.knowledge.genericDatabase.dbName };
        }
        
        if (tier === 'domain' && domain) {
          const domainDb = this.databases.knowledge.domainsDatabases.find(db => db.domain === domain);
          if (!domainDb) return null;
          const dbConn = this.findDbConnection(domainDb.dbConnRef);
          if (!dbConn) return null;
          return { mongoUri: dbConn.mongoUri, dbName: domainDb.dbName };
        }
        
        if (tier === 'tenant' && tenantId) {
          const tenantDb = this.databases.knowledge.tenantDatabases.find(db => db.tenantId === tenantId);
          if (!tenantDb) return null;
          const dbConn = this.findDbConnection(tenantDb.dbConnRef);
          if (!dbConn) return null;
          return { mongoUri: dbConn.mongoUri, dbName: tenantDb.dbName };
        }
        break;
        
      case 'runtime':
        if (!this.databases.runtime || !tenantId) return null;
        
        const runtimeTenantDb = this.databases.runtime.tenantDatabases.find(db => db.tenantId === tenantId);
        if (!runtimeTenantDb) return null;
        const runtimeDbConn = this.findDbConnection(runtimeTenantDb.dbConnRef);
        if (!runtimeDbConn) return null;
        return { 
          mongoUri: runtimeDbConn.mongoUri, 
          dbName: runtimeTenantDb.dbName,
          analyticsDbName: runtimeTenantDb.analyticsDbName
        };
        
      case 'logs':
        if (!this.databases.logs) return null;
        
        const logsDbConn = this.findDbConnection(this.databases.logs.dbConnRef);
        if (!logsDbConn) return null;
        return { mongoUri: logsDbConn.mongoUri, dbName: this.databases.logs.dbName };
    }
    
    return null;
  }

  /**
   * Get MongoDB client for a specific URI
   */
  public async getMongoClient(mongoUri: string): Promise<MongoClient> {
    if (this._isShutdown) {
      throw new Error('BridgeRouter is shutdown');
    }
    
    // Find existing client or create new one
    const uriHash = this.hashString(mongoUri);
    let client = this.mongoClients.get(uriHash);
    
    if (!client) {
      logger.debug('Creating new MongoDB client', { mongoUri: mongoUri.replace(/\/\/.*@/, '//***@') });
      
      const options: MongoClientOptions = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };
      
      client = new MongoClient(mongoUri, options);
      await client.connect();
      
      this.mongoClients.set(uriHash, client);
      logger.debug('MongoDB client created and connected', { uriHash });
    }
    
    return client;
  }

  /**
   * Get S3 storage adapter for a specific connection
   */
  public async getSpaces(ctx: RouteContext): Promise<{ storage: StorageAdapter; bucket: string; analyticsDbName?: string }> {
    if (this._isShutdown) {
      throw new Error('BridgeRouter is shutdown');
    }
    
    const dbInfo = this.resolveDatabaseConnection(ctx);
    if (!dbInfo) {
      throw new Error(`Cannot resolve database connection for context: ${JSON.stringify(ctx)}`);
    }
    
    // Find the spaces connection for this database
    let spacesConn: SpacesConnection | null = null;
    let bucket = '';
    
    switch (ctx.databaseType) {
      case 'metadata':
        if (!this.databases.metadata) throw new Error('Metadata databases not configured');
        
        if (ctx.tier === 'generic') {
          spacesConn = this.findSpacesConnection(this.databases.metadata.genericDatabase.spaceConnRef);
          bucket = this.databases.metadata.genericDatabase.bucket;
        } else if (ctx.tier === 'domain' && ctx.domain) {
          const domainDb = this.databases.metadata.domainsDatabases.find(db => db.domain === ctx.domain);
          if (!domainDb) throw new Error(`Domain '${ctx.domain}' not found in metadata databases`);
          spacesConn = this.findSpacesConnection(domainDb.spaceConnRef);
          bucket = domainDb.bucket;
        } else if (ctx.tier === 'tenant' && ctx.tenantId) {
          const tenantDb = this.databases.metadata.tenantDatabases.find(db => db.tenantId === ctx.tenantId);
          if (!tenantDb) throw new Error(`Tenant '${ctx.tenantId}' not found in metadata databases`);
          spacesConn = this.findSpacesConnection(tenantDb.spaceConnRef);
          bucket = tenantDb.bucket;
        }
        break;
        
      case 'knowledge':
        if (!this.databases.knowledge) throw new Error('Knowledge databases not configured');
        
        if (ctx.tier === 'generic') {
          spacesConn = this.findSpacesConnection(this.databases.knowledge.genericDatabase.spaceConnRef);
          bucket = this.databases.knowledge.genericDatabase.bucket;
        } else if (ctx.tier === 'domain' && ctx.domain) {
          const domainDb = this.databases.knowledge.domainsDatabases.find(db => db.domain === ctx.domain);
          if (!domainDb) throw new Error(`Domain '${ctx.domain}' not found in knowledge databases`);
          spacesConn = this.findSpacesConnection(domainDb.spaceConnRef);
          bucket = domainDb.bucket;
        } else if (ctx.tier === 'tenant' && ctx.tenantId) {
          const tenantDb = this.databases.knowledge.tenantDatabases.find(db => db.tenantId === ctx.tenantId);
          if (!tenantDb) throw new Error(`Tenant '${ctx.tenantId}' not found in knowledge databases`);
          spacesConn = this.findSpacesConnection(tenantDb.spaceConnRef);
          bucket = tenantDb.bucket;
        }
        break;
        
      case 'runtime':
        if (!this.databases.runtime || !ctx.tenantId) throw new Error('Runtime databases not configured or tenantId missing');
        
        const runtimeTenantDb = this.databases.runtime.tenantDatabases.find(db => db.tenantId === ctx.tenantId);
        if (!runtimeTenantDb) throw new Error(`Tenant '${ctx.tenantId}' not found in runtime databases`);
        spacesConn = this.findSpacesConnection(runtimeTenantDb.spaceConnRef);
        bucket = runtimeTenantDb.bucket;
        break;
        
      case 'logs':
        if (!this.databases.logs) throw new Error('Logs database not configured');
        
        spacesConn = this.findSpacesConnection(this.databases.logs.spaceConnRef);
        bucket = this.databases.logs.bucket;
        break;
    }
    
    if (!spacesConn) {
      throw new Error(`Cannot resolve spaces connection for context: ${JSON.stringify(ctx)}`);
    }
    
    // Use localStorage if enabled, otherwise use S3
    if (this.localStorage) {
      return { 
        storage: this.localStorage, 
        bucket, 
        ...(dbInfo.analyticsDbName && { analyticsDbName: dbInfo.analyticsDbName })
      };
    }
    
    // Create S3 client
    const spacesHash = this.hashString(`${spacesConn.endpoint}-${spacesConn.region}`);
    let s3Client = this.s3Clients.get(spacesHash);
    
    if (!s3Client) {
      logger.debug('Creating new S3 client', { endpoint: spacesConn.endpoint, region: spacesConn.region });
      
      const s3Config: S3ClientConfig = {
        endpoint: spacesConn.endpoint,
        region: spacesConn.region,
        credentials: {
          accessKeyId: spacesConn.accessKey,
          secretAccessKey: spacesConn.secretKey,
        },
        ...(spacesConn.forcePathStyle !== undefined && { forcePathStyle: spacesConn.forcePathStyle }),
      };
      
      s3Client = new S3Client(s3Config);
      this.s3Clients.set(spacesHash, s3Client);
      logger.debug('S3 client created', { spacesHash });
    }
    
    const storage = new S3StorageAdapter(s3Client);
    return { 
      storage, 
      bucket, 
      ...(dbInfo.analyticsDbName && { analyticsDbName: dbInfo.analyticsDbName })
    };
  }

  /**
   * Generate routing key from context
   */
  private generateRoutingKey(ctx: RouteContext): string {
    if (typeof this.chooseKey === 'function') {
      return this.chooseKey(ctx);
    }
    
    const keyTemplate = this.chooseKey || 'tenantId|dbName|collection:objectId';
    return generateRoutingKeyFromDSL(keyTemplate, {
      ...(ctx.tenantId && { tenantId: ctx.tenantId }),
      dbName: ctx.dbName,
      collection: ctx.collection,
      ...(ctx.objectId && { objectId: ctx.objectId }),
    });
  }

  /**
   * Route request to appropriate backend
   */
  public route(ctx: RouteContext): BackendInfo {
    const routingKey = this.generateRoutingKey(ctx);
    const index = pickIndexHRW(routingKey, this.backendIds);
    
    const dbInfo = this.resolveDatabaseConnection(ctx);
    if (!dbInfo) {
      throw new Error(`Cannot resolve database connection for context: ${JSON.stringify(ctx)}`);
    }
    
    // Find spaces connection for bucket info
    let spacesConn: SpacesConnection | null = null;
    let bucket = '';
    
    switch (ctx.databaseType) {
      case 'metadata':
        if (ctx.tier === 'generic') {
          spacesConn = this.findSpacesConnection(this.databases.metadata!.genericDatabase.spaceConnRef);
          bucket = this.databases.metadata!.genericDatabase.bucket;
        } else if (ctx.tier === 'domain' && ctx.domain) {
          const domainDb = this.databases.metadata!.domainsDatabases.find(db => db.domain === ctx.domain);
          if (domainDb) {
            spacesConn = this.findSpacesConnection(domainDb.spaceConnRef);
            bucket = domainDb.bucket;
          }
        } else if (ctx.tier === 'tenant' && ctx.tenantId) {
          const tenantDb = this.databases.metadata!.tenantDatabases.find(db => db.tenantId === ctx.tenantId);
          if (tenantDb) {
            spacesConn = this.findSpacesConnection(tenantDb.spaceConnRef);
            bucket = tenantDb.bucket;
          }
        }
        break;
        
      case 'knowledge':
        if (ctx.tier === 'generic') {
          spacesConn = this.findSpacesConnection(this.databases.knowledge!.genericDatabase.spaceConnRef);
          bucket = this.databases.knowledge!.genericDatabase.bucket;
        } else if (ctx.tier === 'domain' && ctx.domain) {
          const domainDb = this.databases.knowledge!.domainsDatabases.find(db => db.domain === ctx.domain);
          if (domainDb) {
            spacesConn = this.findSpacesConnection(domainDb.spaceConnRef);
            bucket = domainDb.bucket;
          }
        } else if (ctx.tier === 'tenant' && ctx.tenantId) {
          const tenantDb = this.databases.knowledge!.tenantDatabases.find(db => db.tenantId === ctx.tenantId);
          if (tenantDb) {
            spacesConn = this.findSpacesConnection(tenantDb.spaceConnRef);
            bucket = tenantDb.bucket;
          }
        }
        break;
        
      case 'runtime':
        if (ctx.tenantId) {
          const runtimeTenantDb = this.databases.runtime!.tenantDatabases.find(db => db.tenantId === ctx.tenantId);
          if (runtimeTenantDb) {
            spacesConn = this.findSpacesConnection(runtimeTenantDb.spaceConnRef);
            bucket = runtimeTenantDb.bucket;
          }
        }
        break;
        
      case 'logs':
        spacesConn = this.findSpacesConnection(this.databases.logs!.spaceConnRef);
        bucket = this.databases.logs!.bucket;
        break;
    }
    
    if (!spacesConn) {
      throw new Error(`Cannot resolve spaces connection for context: ${JSON.stringify(ctx)}`);
    }
    
    return {
      index,
      mongoUri: dbInfo.mongoUri,
      endpoint: spacesConn.endpoint,
      region: spacesConn.region,
      bucket,
      ...(dbInfo.analyticsDbName && { analyticsDbName: dbInfo.analyticsDbName }),
    };
  }

  /**
   * Hash string for consistent mapping
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Shutdown all connections
   */
  public async shutdown(): Promise<void> {
    if (this._isShutdown) {
      return;
    }
    
    logger.debug('Shutting down BridgeRouter');
    
    this._isShutdown = true;
    
    // Close all MongoDB clients
    const mongoClosePromises = Array.from(this.mongoClients.values()).map(client => 
      client.close().catch(error => logger.error('Error closing MongoDB client', {}, error))
    );
    
    await Promise.all(mongoClosePromises);
    this.mongoClients.clear();
    
    logger.debug('BridgeRouter shutdown completed');
  }

  /**
   * Check if router is shutdown
   */
  public get isShutdown(): boolean {
    return this._isShutdown;
  }
}