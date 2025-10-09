/**
 * Xronox Configuration Builder
 * 
 * Provides a fluent TypeScript API for building Xronox configurations.
 * Makes it easier to set up complex multi-tenant configurations with type safety.
 */

import type {
  XronoxConfig,
  BucketConfiguration,
  FolderPrefixes,
  CollectionMap,
  RoutingConfig,
  RetentionConfig
} from '../config.js';

// ============================================================================
// Configuration Builder
// ============================================================================

export class XronoxConfigBuilder {
  private config: Partial<XronoxConfig> = {
    dbConnections: {},
    spacesConnections: {},
    databases: {},
    collectionMaps: {},
  };

  /**
   * Add a MongoDB connection
   */
  addMongoConnection(name: string, mongoUri: string): this {
    this.config.dbConnections![name] = { mongoUri };
    return this;
  }

  /**
   * Add an S3-compatible storage connection
   */
  addS3Connection(
    name: string,
    options: {
      endpoint: string;
      region: string;
      accessKey: string;
      secretKey: string;
      forcePathStyle?: boolean;
      bucket?: string; // Legacy single bucket
      buckets?: BucketConfiguration; // Multi-bucket
      folderPrefixes?: FolderPrefixes;
    }
  ): this {
    this.config.spacesConnections![name] = options;
    return this;
  }

  /**
   * Add a Knowledge database (NO versioning - static facts)
   */
  addKnowledgeDatabase(options: {
    type: 'generic' | 'domain' | 'tenant';
    mongoRef: string;
    s3Ref: string;
    dbName: string;
    tenantId?: string; // For tenant type
    domain?: string; // For domain type
    bucket?: string; // Legacy
    recordsBucket?: string;
    contentBucket?: string;
    backupsBucket?: string;
    // NO versionsBucket - knowledge is static
  }): this {
    if (!this.config.databases!.knowledge) {
      this.config.databases!.knowledge = {
        genericDatabase: null as any,
        domainsDatabases: [],
        tenantDatabases: [],
      };
    }

    const dbConfig: any = {
      dbConnRef: options.mongoRef,
      spaceConnRef: options.s3Ref,
      dbName: options.dbName,
      ...(options.bucket && { bucket: options.bucket }),
      ...(options.recordsBucket && { recordsBucket: options.recordsBucket }),
      ...(options.contentBucket && { contentBucket: options.contentBucket }),
      ...(options.backupsBucket && { backupsBucket: options.backupsBucket }),
    };

    if (options.type === 'generic') {
      this.config.databases!.knowledge!.genericDatabase = dbConfig;
    } else if (options.type === 'domain') {
      if (!options.domain) throw new Error('domain is required for domain-type database');
      this.config.databases!.knowledge!.domainsDatabases.push({
        ...dbConfig,
        domain: options.domain,
      });
    } else if (options.type === 'tenant') {
      if (!options.tenantId) throw new Error('tenantId is required for tenant-type database');
      this.config.databases!.knowledge!.tenantDatabases.push({
        ...dbConfig,
        tenantId: options.tenantId,
      });
    }

    return this;
  }

  /**
   * Add a Metadata database (NO versioning - static config)
   */
  addMetadataDatabase(options: {
    type: 'generic' | 'domain' | 'tenant';
    mongoRef: string;
    s3Ref: string;
    dbName: string;
    tenantId?: string;
    domain?: string;
    bucket?: string; // Legacy
    recordsBucket?: string;
    contentBucket?: string;
    backupsBucket?: string;
    // NO versionsBucket - metadata is static
  }): this {
    if (!this.config.databases!.metadata) {
      this.config.databases!.metadata = {
        genericDatabase: null as any,
        domainsDatabases: [],
        tenantDatabases: [],
      };
    }

    const dbConfig: any = {
      dbConnRef: options.mongoRef,
      spaceConnRef: options.s3Ref,
      dbName: options.dbName,
      ...(options.bucket && { bucket: options.bucket }),
      ...(options.recordsBucket && { recordsBucket: options.recordsBucket }),
      ...(options.contentBucket && { contentBucket: options.contentBucket }),
      ...(options.backupsBucket && { backupsBucket: options.backupsBucket }),
    };

    if (options.type === 'generic') {
      this.config.databases!.metadata!.genericDatabase = dbConfig;
    } else if (options.type === 'domain') {
      if (!options.domain) throw new Error('domain is required for domain-type database');
      this.config.databases!.metadata!.domainsDatabases.push({
        ...dbConfig,
        domain: options.domain,
      });
    } else if (options.type === 'tenant') {
      if (!options.tenantId) throw new Error('tenantId is required for tenant-type database');
      this.config.databases!.metadata!.tenantDatabases.push({
        ...dbConfig,
        tenantId: options.tenantId,
      });
    }

    return this;
  }

  /**
   * Add a Runtime database (YES versioning - transactional user data)
   * 
   * CRITICAL: Runtime needs:
   * - S3 storage for scalability
   * - versionsBucket for audit trails and compliance
   */
  addRuntimeDatabase(options: {
    tenantId: string;
    mongoRef: string;
    s3Ref?: string; // Optional for backward compat, but HIGHLY RECOMMENDED
    analyticsDbName: string;
    dbName: string;
    bucket?: string; // Legacy
    recordsBucket?: string;
    versionsBucket?: string; // CRITICAL for audit trails
    contentBucket?: string;
    backupsBucket?: string;
    enableVersioning?: boolean; // Helper flag to set versionsBucket = recordsBucket + '-versions'
  }): this {
    if (!this.config.databases!.runtime) {
      this.config.databases!.runtime = {
        tenantDatabases: [],
      };
    }

    const dbConfig: any = {
      tenantId: options.tenantId,
      dbConnRef: options.mongoRef,
      dbName: options.dbName,
      analyticsDbName: options.analyticsDbName,
      ...(options.s3Ref && { spaceConnRef: options.s3Ref }),
      ...(options.bucket && { bucket: options.bucket }),
      ...(options.recordsBucket && { recordsBucket: options.recordsBucket }),
      ...(options.contentBucket && { contentBucket: options.contentBucket }),
      ...(options.backupsBucket && { backupsBucket: options.backupsBucket }),
    };

    // Auto-configure versionsBucket if enableVersioning is true
    if (options.enableVersioning && options.recordsBucket) {
      dbConfig.versionsBucket = options.versionsBucket || `${options.recordsBucket.replace('-records', '')}-versions`;
    } else if (options.versionsBucket) {
      dbConfig.versionsBucket = options.versionsBucket;
    }

    this.config.databases!.runtime!.tenantDatabases.push(dbConfig);

    return this;
  }

  /**
   * Add a Logs database (NO versioning - append-only)
   */
  addLogsDatabase(options: {
    mongoRef: string;
    s3Ref?: string; // Optional S3 support
    dbName: string;
    bucket?: string; // Legacy
    recordsBucket?: string;
    contentBucket?: string;
    // NO versionsBucket - logs are append-only
  }): this {
    this.config.databases!.logs = {
      dbConnRef: options.mongoRef,
      dbName: options.dbName,
      ...(options.s3Ref && { spaceConnRef: options.s3Ref }),
      ...(options.bucket && { bucket: options.bucket }),
      ...(options.recordsBucket && { recordsBucket: options.recordsBucket }),
      ...(options.contentBucket && { contentBucket: options.contentBucket }),
    };
    return this;
  }

  /**
   * Add a Messaging database (NO versioning - static metadata)
   */
  addMessagingDatabase(options: {
    mongoRef: string;
    s3Ref?: string; // Optional S3 support
    dbName: string;
    captureDeliveries?: boolean;
    bucket?: string; // Legacy
    recordsBucket?: string;
    contentBucket?: string;
    backupsBucket?: string;
    // NO versionsBucket - messaging is append-only/static
  }): this {
    this.config.databases!.messaging = {
      dbConnRef: options.mongoRef,
      dbName: options.dbName,
      ...(options.s3Ref && { spaceConnRef: options.s3Ref }),
      ...(options.captureDeliveries !== undefined && { captureDeliveries: options.captureDeliveries }),
      ...(options.bucket && { bucket: options.bucket }),
      ...(options.recordsBucket && { recordsBucket: options.recordsBucket }),
      ...(options.contentBucket && { contentBucket: options.contentBucket }),
      ...(options.backupsBucket && { backupsBucket: options.backupsBucket }),
    };
    return this;
  }

  /**
   * Add an Identities database (NO versioning - static users/roles)
   */
  addIdentitiesDatabase(options: {
    mongoRef: string;
    s3Ref?: string; // Optional S3 support
    dbName: string;
    bucket?: string; // Legacy
    recordsBucket?: string;
    contentBucket?: string;
    backupsBucket?: string;
    // NO versionsBucket - identities are relatively static
  }): this {
    this.config.databases!.identities = {
      dbConnRef: options.mongoRef,
      dbName: options.dbName,
      ...(options.s3Ref && { spaceConnRef: options.s3Ref }),
      ...(options.bucket && { bucket: options.bucket }),
      ...(options.recordsBucket && { recordsBucket: options.recordsBucket }),
      ...(options.contentBucket && { contentBucket: options.contentBucket }),
      ...(options.backupsBucket && { backupsBucket: options.backupsBucket }),
    };
    return this;
  }

  /**
   * Add a collection mapping with optional S3 offload
   */
  addCollectionMap(
    collectionName: string,
    options: {
      indexedProps: string[];
      s3Offload?: {
        enabled: boolean;
        olderThan?: number; // Days
        archiveBucket?: string;
      };
      base64Props?: Record<string, {
        contentType: string;
        preferredText?: boolean;
        textCharset?: string;
      }>;
      validation?: {
        requiredIndexed?: string[];
      };
    }
  ): this {
    this.config.collectionMaps![collectionName] = options as CollectionMap;
    return this;
  }

  /**
   * Set local storage configuration (for development/testing)
   */
  setLocalStorage(basePath: string, enabled: boolean = true): this {
    this.config.localStorage = { basePath, enabled };
    return this;
  }

  /**
   * Set routing configuration
   */
  setRouting(options: Partial<RoutingConfig>): this {
    this.config.routing = options as RoutingConfig;
    return this;
  }

  /**
   * Set retention policies
   */
  setRetention(options: Partial<RetentionConfig>): this {
    this.config.retention = options as RetentionConfig;
    return this;
  }

  /**
   * Build the final configuration object
   */
  build(): XronoxConfig {
    // Ensure required fields are present
    if (!this.config.dbConnections || Object.keys(this.config.dbConnections).length === 0) {
      throw new Error('At least one MongoDB connection is required');
    }

    // Spacesconnections can be empty if using MongoDB-only mode
    if (!this.config.spacesConnections) {
      this.config.spacesConnections = {};
    }

    return this.config as XronoxConfig;
  }
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Create a development configuration (MongoDB + local storage)
 */
export function createDevConfig(options: {
  mongoUri: string;
  basePath: string;
  dbName?: string;
}): XronoxConfig {
  const dbName = options.dbName || 'xronox_dev';
  
  return new XronoxConfigBuilder()
    .addMongoConnection('dev', options.mongoUri)
    .addKnowledgeDatabase({
      type: 'generic',
      mongoRef: 'dev',
      s3Ref: 'dev-storage',
      dbName: `${dbName}_knowledge`,
      recordsBucket: 'dev-records'
    })
    .addMetadataDatabase({
      type: 'generic',
      mongoRef: 'dev',
      s3Ref: 'dev-storage',
      dbName: `${dbName}_metadata`,
      recordsBucket: 'dev-records'
    })
    .addRuntimeDatabase({
      tenantId: 'dev-tenant',
      mongoRef: 'dev',
      s3Ref: 'dev-storage',
      dbName: `${dbName}_runtime`,
      analyticsDbName: `${dbName}_analytics`,
      recordsBucket: 'dev-runtime-records',
      enableVersioning: true, // Enable versioning for runtime
    })
    .addLogsDatabase({
      mongoRef: 'dev',
      dbName: `${dbName}_logs`,
    })
    .setLocalStorage(options.basePath, true)
    .build();
}

/**
 * Create a production multi-tenant configuration
 */
export function createProductionConfig(options: {
  mongoUri: string;
  s3Endpoint: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  tenants: string[];
  bucketPrefix?: string;
}): XronoxConfig {
  const bucketPrefix = options.bucketPrefix || 'xronox';
  const builder = new XronoxConfigBuilder()
    .addMongoConnection('primary', options.mongoUri)
    .addS3Connection('primary', {
      endpoint: options.s3Endpoint,
      region: options.s3Region,
      accessKey: options.s3AccessKey,
      secretKey: options.s3SecretKey,
      buckets: {
        records: `${bucketPrefix}-records`,
        versions: `${bucketPrefix}-versions`,
        content: `${bucketPrefix}-content`,
        backups: `${bucketPrefix}-backups`,
      },
    })
    .addKnowledgeDatabase({
      type: 'generic',
      mongoRef: 'primary',
      s3Ref: 'primary',
      dbName: `${bucketPrefix}_knowledge`,
      recordsBucket: `${bucketPrefix}-knowledge-records`,
      contentBucket: `${bucketPrefix}-knowledge-content`,
      backupsBucket: `${bucketPrefix}-knowledge-backups`,
      // NO versionsBucket - knowledge is static
    })
    .addMetadataDatabase({
      type: 'generic',
      mongoRef: 'primary',
      s3Ref: 'primary',
      dbName: `${bucketPrefix}_metadata`,
      recordsBucket: `${bucketPrefix}-metadata-records`,
      contentBucket: `${bucketPrefix}-metadata-content`,
      backupsBucket: `${bucketPrefix}-metadata-backups`,
      // NO versionsBucket - metadata is static
    })
    .addLogsDatabase({
      mongoRef: 'primary',
      s3Ref: 'primary',
      dbName: `${bucketPrefix}_logs`,
      recordsBucket: `${bucketPrefix}-logs-records`,
      contentBucket: `${bucketPrefix}-logs-content`,
      // NO versionsBucket - logs are append-only
    })
    .addMessagingDatabase({
      mongoRef: 'primary',
      s3Ref: 'primary',
      dbName: `${bucketPrefix}_messaging`,
      recordsBucket: `${bucketPrefix}-messaging-records`,
      contentBucket: `${bucketPrefix}-messaging-content`,
      backupsBucket: `${bucketPrefix}-messaging-backups`,
      // NO versionsBucket - messaging is append-only/static
    })
    .addIdentitiesDatabase({
      mongoRef: 'primary',
      s3Ref: 'primary',
      dbName: `${bucketPrefix}_identities`,
      recordsBucket: `${bucketPrefix}-identities-records`,
      contentBucket: `${bucketPrefix}-identities-content`,
      backupsBucket: `${bucketPrefix}-identities-backups`,
      // NO versionsBucket - identities are relatively static
    });

  // Add runtime databases for each tenant
  options.tenants.forEach((tenantId) => {
    builder.addRuntimeDatabase({
      tenantId,
      mongoRef: 'primary',
      s3Ref: 'primary',
      dbName: `${bucketPrefix}_runtime_${tenantId}`,
      analyticsDbName: `${bucketPrefix}_analytics_${tenantId}`,
      recordsBucket: `${bucketPrefix}-runtime-records`,
      versionsBucket: `${bucketPrefix}-runtime-versions`, // CRITICAL for audit trails
      contentBucket: `${bucketPrefix}-runtime-content`,
      backupsBucket: `${bucketPrefix}-runtime-backups`,
    });
  });

  return builder.build();
}

/**
 * Create a minimal configuration (MongoDB-only, no S3)
 */
export function createMinimalConfig(mongoUri: string): XronoxConfig {
  return new XronoxConfigBuilder()
    .addMongoConnection('default', mongoUri)
    .addRuntimeDatabase({
      tenantId: 'default-tenant',
      mongoRef: 'default',
      dbName: 'xronox_runtime',
      analyticsDbName: 'xronox_analytics',
      // No S3 - MongoDB-only for simplicity
    })
    .addLogsDatabase({
      mongoRef: 'default',
      dbName: 'xronox_logs',
      // No S3 - MongoDB-only
    })
    .build();
}

