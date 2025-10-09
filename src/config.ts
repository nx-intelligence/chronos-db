import { isReplicaSetAvailable } from './utils/replicaSet.js';
import { logger } from './utils/logger.js';
import { XronoxConfigSchema } from './config/validate.js';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Local filesystem storage configuration (for development/testing)
 */
export interface LocalStorageConfig {
  /** Base path for local storage */
  basePath: string;
  /** Whether to enable this mode */
  enabled: boolean;
}

/**
 * MongoDB connection configuration - define once, reference everywhere
 */
export interface DbConnection {
  /** MongoDB connection URI */
  mongoUri: string;
}

/**
 * Multi-bucket configuration for different data types
 */
export interface BucketConfiguration {
  /** Bucket for current/active records */
  records?: string;
  /** Bucket for backup/archived data */
  backups?: string;
  /** Bucket for binary content (files, blobs) */
  content?: string;
  /** Bucket for version history */
  versions?: string;
}

/**
 * Folder prefix configuration for storage organization
 */
export interface FolderPrefixes {
  /** Folder prefix for records (default: 'records') */
  records?: string;
  /** Folder prefix for backups (default: 'backups') */
  backups?: string;
  /** Folder prefix for content (default: 'content') */
  content?: string;
  /** Folder prefix for versions (default: 'versions') */
  versions?: string;
}

/**
 * S3-compatible storage connection configuration - define once, reference everywhere
 */
export interface SpacesConnection {
  /** S3 endpoint URL */
  endpoint: string;
  /** AWS region */
  region: string;
  /** Access key */
  accessKey: string;
  /** Secret key */
  secretKey: string;
  /** Force path style (for MinIO) */
  forcePathStyle?: boolean;
  
  /** @deprecated Use buckets instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Multi-bucket configuration (recommended) */
  buckets?: BucketConfiguration;
  
  /** Folder prefixes for storage organization */
  folderPrefixes?: FolderPrefixes;
}

/**
 * Generic database configuration (no tenant/domain)
 */
export interface GenericDatabase {
  /** MongoDB connection reference */
  dbConnRef: string;
  /** S3 spaces connection reference */
  spaceConnRef: string;
  
  /** @deprecated Use recordsBucket, versionsBucket, etc. instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Bucket for current/active records */
  recordsBucket?: string;
  /** Bucket for version history */
  versionsBucket?: string;
  /** Bucket for binary content */
  contentBucket?: string;
  /** Bucket for backups/snapshots */
  backupsBucket?: string;
  
  /** MongoDB database name */
  dbName: string;
}

/**
 * Domain-specific database configuration
 */
export interface DomainDatabase {
  /** Domain identifier */
  domain: string;
  /** MongoDB connection reference */
  dbConnRef: string;
  /** S3 spaces connection reference */
  spaceConnRef: string;
  
  /** @deprecated Use recordsBucket, versionsBucket, etc. instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Bucket for current/active records */
  recordsBucket?: string;
  /** Bucket for version history */
  versionsBucket?: string;
  /** Bucket for binary content */
  contentBucket?: string;
  /** Bucket for backups/snapshots */
  backupsBucket?: string;
  
  /** MongoDB database name */
  dbName: string;
}

/**
 * Tenant-specific database configuration
 */
export interface TenantDatabase {
  /** Tenant identifier */
  tenantId: string;
  /** MongoDB connection reference */
  dbConnRef: string;
  /** S3 spaces connection reference */
  spaceConnRef: string;
  
  /** @deprecated Use recordsBucket, versionsBucket, etc. instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Bucket for current/active records */
  recordsBucket?: string;
  /** Bucket for version history */
  versionsBucket?: string;
  /** Bucket for binary content */
  contentBucket?: string;
  /** Bucket for backups/snapshots */
  backupsBucket?: string;
  
  /** MongoDB database name */
  dbName: string;
}

/**
 * Runtime tenant database configuration (includes analytics)
 * 
 * CRITICAL: Runtime database is for TRANSACTIONAL user data and REQUIRES:
 * - S3 storage for scalability (hot MongoDB + warm S3)
 * - Version history (versionsBucket) for:
 *   - Audit trails (who did what when)
 *   - Compliance (GDPR, SOX, HIPAA)
 *   - Rollback capabilities
 *   - Time-travel queries
 * 
 * Unlike Knowledge/Metadata (static), Runtime data is high-velocity and transactional.
 */
export interface RuntimeTenantDatabase {
  /** Tenant identifier */
  tenantId: string;
  /** MongoDB connection reference */
  dbConnRef: string;
  
  /** S3 spaces connection reference (optional for backward compatibility, but HIGHLY RECOMMENDED for production) */
  spaceConnRef?: string;
  
  /** @deprecated Use recordsBucket, versionsBucket, etc. instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Bucket for current/active records (RECOMMENDED) */
  recordsBucket?: string;
  /** Bucket for version history (CRITICAL for audit trails and compliance) */
  versionsBucket?: string;
  /** Bucket for binary content (user uploads, attachments) */
  contentBucket?: string;
  /** Bucket for backups/snapshots */
  backupsBucket?: string;
  
  /** MongoDB database name */
  dbName: string;
  /** Analytics database name */
  analyticsDbName: string;
}

/**
 * Logs database configuration (simple flat structure)
 * Now supports S3/Spaces storage for log offloading and archival
 */
export interface LogsDatabase {
  /** MongoDB connection reference */
  dbConnRef: string;
  
  /** S3 spaces connection reference (optional - enables S3 storage for logs) */
  spaceConnRef?: string;
  
  /** @deprecated Use recordsBucket and contentBucket instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Bucket for log records (optional - only if spaceConnRef is set) */
  recordsBucket?: string;
  /** Bucket for log attachments/content (optional - only if spaceConnRef is set) */
  contentBucket?: string;
  
  /** MongoDB database name */
  dbName: string;
}

/**
 * Messaging database configuration (simple flat structure, like logs)
 * 
 * For Chronow integration: topic metadata, message records, DLQ
 * Nature: Relatively static metadata (like Knowledge/Metadata)
 * - NO versioning needed (topics/messages don't change, they accumulate)
 * - S3 support for scalability (large message payloads)
 * - Backups sufficient for disaster recovery
 */
export interface MessagingDatabase {
  /** MongoDB connection reference */
  dbConnRef: string;
  
  /** S3 spaces connection reference (optional - enables S3 storage for messages) */
  spaceConnRef?: string;
  
  /** @deprecated Use recordsBucket and contentBucket instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Bucket for message records (optional - only if spaceConnRef is set) */
  recordsBucket?: string;
  /** Bucket for large message payloads/content (optional - only if spaceConnRef is set) */
  contentBucket?: string;
  /** Bucket for backups/snapshots (optional - only if spaceConnRef is set) */
  backupsBucket?: string;
  // NO versionsBucket - messaging data is append-only/static
  
  /** MongoDB database name */
  dbName: string;
  /** Capture delivery attempts (default: false to save storage) */
  captureDeliveries?: boolean;
}

/**
 * Identities database configuration (simple flat structure, like logs)
 * 
 * For users, accounts, authentication, permissions, roles
 * Nature: Relatively static (like Knowledge/Metadata)
 * - NO versioning needed (identity changes are managed, not transactional)
 * - S3 support for scalability (profile images, documents)
 * - Backups sufficient for disaster recovery
 * 
 * Note: If you need audit trails for identity changes (e.g., "who changed this user's role"),
 * consider storing those events in the Runtime database instead.
 */
export interface IdentitiesDatabase {
  /** MongoDB connection reference */
  dbConnRef: string;
  
  /** S3 spaces connection reference (optional - enables S3 storage for identity data) */
  spaceConnRef?: string;
  
  /** @deprecated Use recordsBucket and contentBucket instead. Single bucket for all data (legacy) */
  bucket?: string;
  
  /** Bucket for identity records (optional - only if spaceConnRef is set) */
  recordsBucket?: string;
  /** Bucket for identity content like profile images, documents (optional - only if spaceConnRef is set) */
  contentBucket?: string;
  /** Bucket for backups/snapshots (optional - only if spaceConnRef is set) */
  backupsBucket?: string;
  // NO versionsBucket - identity data is relatively static
  
  /** MongoDB database name */
  dbName: string;
}

/**
 * Routing configuration
 */
export interface RoutingConfig {
  /** Hash algorithm for routing */
  hashAlgo: 'rendezvous' | 'jump';
  /** Key selection strategy */
  chooseKey?: string;
}

/**
 * Retention configuration
 */
export interface RetentionConfig {
  /** Version retention settings */
  ver?: {
    /** Days to retain versions */
    days?: number;
    /** Maximum versions per item */
    maxPerItem?: number;
  };
  /** Counter retention settings */
  counters?: {
    /** Days to retain counters */
    days?: number;
    /** Weeks to retain counters */
    weeks?: number;
    /** Months to retain counters */
    months?: number;
  };
}

/**
 * Rollup configuration
 */
export interface RollupConfig {
  /** Whether rollup is enabled */
  enabled: boolean;
  /** Manifest period */
  manifestPeriod?: 'daily' | 'weekly' | 'monthly';
}

/**
 * S3 offload configuration for automatic archival of old records
 */
export interface S3OffloadConfig {
  /** Whether S3 offload is enabled for this collection */
  enabled: boolean;
  /** Number of days before offloading records to S3 (default: 30) */
  olderThan?: number;
  /** Optional archive bucket (overrides default bucket) */
  archiveBucket?: string;
}

/**
 * Collection map configuration
 */
export interface CollectionMap {
  /** Properties to index */
  indexedProps: string[];
  /** Base64 properties configuration */
  base64Props?: Record<string, {
    /** Content type */
    contentType: string;
    /** Whether to prefer text */
    preferredText?: boolean;
    /** Text charset */
    textCharset?: string;
  }>;
  /** Validation rules */
  validation?: {
    /** Required indexed properties */
    requiredIndexed?: string[];
  };
  /** S3 offload configuration for automatic archival */
  s3Offload?: S3OffloadConfig;
}

/**
 * Counter rules configuration
 */
export interface CountersRulesConfig {
  /** Counter rules */
  rules?: Array<{
    /** Rule name */
    name: string;
    /** Events to trigger on */
    on?: ('CREATE' | 'UPDATE' | 'DELETE')[];
    /** Scope */
    scope?: 'meta' | 'payload';
    /** Condition */
    when: Record<string, any>;
  }>;
}

/**
 * Dev shadow configuration
 */
export interface DevShadowConfig {
  /** Whether dev shadow is enabled */
  enabled: boolean;
  /** TTL in hours */
  ttlHours: number;
  /** Maximum bytes per document */
  maxBytesPerDoc?: number;
}

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /** Whether fallback is enabled */
  enabled: boolean;
  /** Maximum attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Dead letter collection name */
  deadLetterCollection: string;
}

/**
 * Write optimization configuration
 */
export interface WriteOptimizationConfig {
  /** Whether to batch S3 writes */
  batchS3: boolean;
  /** Batch window in milliseconds */
  batchWindowMs: number;
  /** Debounce counters in milliseconds */
  debounceCountersMs: number;
  /** Whether to allow shadow skip */
  allowShadowSkip: boolean;
}

/**
 * Logical delete configuration
 */
export interface LogicalDeleteConfig {
  /** Whether logical delete is enabled (default: true) */
  enabled: boolean;
}

/**
 * Versioning configuration
 */
export interface VersioningConfig {
  /** Whether versioning is enabled (default: true) */
  enabled: boolean;
}

/**
 * Transaction configuration
 */
export interface TransactionConfig {
  /** Whether transactions are enabled */
  enabled: boolean;
  /** Whether to auto-detect transaction support */
  autoDetect?: boolean;
}

/**
 * Main Xronox configuration interface
 */
export interface XronoxConfig {
  /** MongoDB connections - define once, reference by key */
  dbConnections: Record<string, DbConnection>;
  /** S3-compatible storage connections - define once, reference by key */
  spacesConnections: Record<string, SpacesConnection>;
  /** Database configuration with tiered structure */
  databases: {
    /** Metadata databases with 3 tiers: generic, domains, tenants */
    metadata?: {
      /** Generic metadata database (no tenant/domain) */
      genericDatabase: GenericDatabase;
      /** Domain-specific metadata databases */
      domainsDatabases: DomainDatabase[];
      /** Tenant-specific metadata databases */
      tenantDatabases: TenantDatabase[];
    };
    /** Knowledge databases with 3 tiers: generic, domains, tenants */
    knowledge?: {
      /** Generic knowledge database (no tenant/domain) */
      genericDatabase: GenericDatabase;
      /** Domain-specific knowledge databases */
      domainsDatabases: DomainDatabase[];
      /** Tenant-specific knowledge databases */
      tenantDatabases: TenantDatabase[];
    };
    /** Runtime databases with tenant tier only */
    runtime?: {
      /** Tenant-specific runtime databases (includes analytics) */
      tenantDatabases: RuntimeTenantDatabase[];
    };
    /** Logs database (simple flat structure) */
    logs?: LogsDatabase;
    /** Messaging database (simple flat structure, for Chronow integration) */
    messaging?: MessagingDatabase;
    /** Identities database (simple flat structure, for users/accounts/auth/permissions) */
    identities?: IdentitiesDatabase;
  };
  /** Local filesystem storage (for development/testing, NOT recommended for production) */
  localStorage?: LocalStorageConfig | undefined;
  /** How to route requests across backends */
  routing: RoutingConfig;
  /** Retention policies for versions and counters (optional, defaults to disabled) */
  retention?: RetentionConfig | undefined;
  /** Roll-up configuration for moving old data to manifests (optional, defaults to disabled) */
  rollup?: RollupConfig | undefined;
  /** Collection definitions with indexing and externalization rules */
  collectionMaps: Record<string, CollectionMap>;
  /** Analytics configuration (counters, time-based, cross-tenant) */
  analytics?: AnalyticsConfig | undefined;
  /** Dev shadow configuration for full snapshots in Mongo */
  devShadow?: DevShadowConfig | undefined;
  /** Enable hard delete functionality */
  hardDeleteEnabled?: boolean | undefined;
  /** Fallback queue configuration */
  fallback?: FallbackConfig | undefined;
  /** Write optimization configuration */
  writeOptimization?: WriteOptimizationConfig | undefined;
  /** Transaction configuration */
  transactions?: TransactionConfig | undefined;
  /** Logical delete configuration */
  logicalDelete?: LogicalDeleteConfig | undefined;
  /** Versioning configuration */
  versioning?: VersioningConfig | undefined;
}

/**
 * Route context for routing decisions
 */
export interface RouteContext {
  /** Database name */
  dbName: string;
  /** Collection name */
  collection: string;
  /** Object ID */
  objectId?: string;
  /** Forced index for admin override */
  forcedIndex?: number;
  /** Key for direct routing */
  key?: string;
  /** Database type */
  databaseType?: 'metadata' | 'knowledge' | 'runtime' | 'logs' | 'messaging' | 'identities';
  /** Tier */
  tier?: 'generic' | 'domain' | 'tenant';
  /** Tenant ID */
  tenantId?: string;
  /** Domain identifier */
  domain?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates transaction configuration against MongoDB capabilities
 * @param config - Configuration to validate
 * @throws Error if transaction configuration is invalid
 */
export async function validateTransactionConfig(config: Partial<XronoxConfig>): Promise<void> {
  logger.debug('Starting transaction configuration validation', {
    transactionsEnabled: config.transactions?.enabled,
    autoDetect: config.transactions?.autoDetect,
    databasesCount: Object.keys(config.databases || {}).length
  });

  if (config.transactions?.enabled === true) {
    // Check if MongoDB supports transactions
    // Get first available MongoDB URI from databases
    let mongoUri: string | undefined;
    
    if (config.databases?.metadata?.genericDatabase && config.dbConnections) {
      const dbConn = config.dbConnections[config.databases.metadata.genericDatabase.dbConnRef];
      if (dbConn) mongoUri = dbConn.mongoUri;
    } else if (config.databases?.knowledge?.genericDatabase && config.dbConnections) {
      const dbConn = config.dbConnections[config.databases.knowledge.genericDatabase.dbConnRef];
      if (dbConn) mongoUri = dbConn.mongoUri;
    } else if (config.databases?.runtime?.tenantDatabases?.[0] && config.dbConnections) {
      const dbConn = config.dbConnections[config.databases.runtime.tenantDatabases[0].dbConnRef];
      if (dbConn) mongoUri = dbConn.mongoUri;
    } else if (config.databases?.logs && config.dbConnections) {
      const dbConn = config.dbConnections[config.databases.logs.dbConnRef];
      if (dbConn) mongoUri = dbConn.mongoUri;
    }

    if (!mongoUri) {
      logger.error('Transaction validation failed: No MongoDB URI available');
      throw new Error('No MongoDB URI available for transaction validation');
    }
    
    logger.debug('Checking MongoDB replica set availability', { mongoUri: mongoUri.replace(/\/\/.*@/, '//***@') });
    const hasReplicaSet = await isReplicaSetAvailable(mongoUri);
    
    logger.debug('MongoDB replica set check completed', { 
      hasReplicaSet, 
      autoDetect: config.transactions.autoDetect,
      mongoUri: mongoUri.replace(/\/\/.*@/, '//***@')
    });
    
    if (!hasReplicaSet && !config.transactions.autoDetect) {
      logger.warn('MongoDB does not support transactions, but transactions are enabled without autoDetect');
      throw new Error('MongoDB does not support transactions. Enable autoDetect or disable transactions.');
    }

    if (!hasReplicaSet && config.transactions.autoDetect) {
      logger.warn('MongoDB does not support transactions, autoDetect will disable transactions');
    }
  }
}

/**
 * Validates a Xronox configuration object
 * @param config - Configuration object to validate
 * @returns Validated configuration with defaults applied
 * @throws ZodError if validation fails
 */
export function validateXronoxConfig(config: unknown): XronoxConfig {
  logger.debug('Starting Xronox configuration validation');
  
  try {
    const validated = XronoxConfigSchema.parse(config);
    const resolved = resolveConfigDefaults(validated);
    
    logger.debug('Xronox configuration validation completed successfully', {
      databasesCount: Object.keys(resolved.databases).length,
      hasSpacesConnections: !!resolved.spacesConnections && Object.keys(resolved.spacesConnections).length > 0,
      localStorageEnabled: resolved.localStorage?.enabled,
      transactionsEnabled: resolved.transactions?.enabled,
      collectionsCount: Object.keys(resolved.collectionMaps).length
    });
    
    return resolved;
  } catch (error) {
    logger.error('Xronox configuration validation failed', {}, error as Error);
    throw error;
  }
}

/**
 * Resolves configuration defaults
 * @param config - Validated configuration
 * @returns Configuration with defaults applied
 */
function resolveConfigDefaults(config: any): XronoxConfig {
  return {
    ...config,
    routing: {
      hashAlgo: 'rendezvous',
      ...config.routing,
    },
    retention: {
      ver: {},
      counters: {},
      ...config.retention,
    },
    rollup: {
      enabled: false,
      manifestPeriod: 'daily',
      ...config.rollup,
    },
    counterRules: {
      rules: [],
      ...config.counterRules,
    },
    transactions: {
      enabled: false,
      autoDetect: true,
      ...config.transactions,
    },
  } as XronoxConfig;
}

/**
 * Checks if an object is a valid Xronox configuration
 * @param obj - Object to check
 * @returns True if valid configuration
 */
export function isValidXronoxConfig(obj: unknown): obj is XronoxConfig {
  return XronoxConfigSchema.safeParse(obj).success;
}

// ============================================================================
// Global Configuration Management
// ============================================================================

let globalConfig: XronoxConfig | null = null;

/**
 * Sets the global configuration
 * @param config - Configuration to set globally
 */
export function setGlobalConfig(config: XronoxConfig): void {
  globalConfig = config;
}

/**
 * Gets the global configuration
 * @returns Global configuration or null if not set
 */
export function getGlobalConfig(): XronoxConfig | null {
  return globalConfig;
}

// Re-export types from other modules
export type { VersionSpec, CollVersionSpec } from './db/restore.js';

// Export counter rule type
export interface CounterRule {
  /** Rule name */
  name: string;
  /** Events to trigger on */
  on?: ('CREATE' | 'UPDATE' | 'DELETE')[];
  /** Scope */
  scope?: 'meta' | 'payload';
  /** Condition */
  when: Record<string, any>;
  /** Properties to count unique values for */
  countUnique?: string[];
}

/**
 * Time-based analytics rule for worker-driven analytics
 */
export interface TimeBasedRule {
  /** Rule name */
  name: string;
  /** Collection to query */
  collection: string;
  /** Query filter */
  query: Record<string, any>;
  /** Aggregation operation */
  operation: 'count' | 'sum' | 'average' | 'max' | 'min' | 'median';
  /** Field to aggregate (for sum, average, max, min, median) */
  field?: string;
  /** Save mode */
  saveMode: 'global' | 'timeframe';
  /** Timeframe granularity (if saveMode is 'timeframe') */
  timeframe?: 'hourly' | 'daily' | 'monthly';
  /** Arguments (record keys for foreign key filtering) */
  arguments?: string[];
  /** Relative time arguments */
  relativeTime?: {
    newerThan?: string; // ISO duration (e.g., 'PT1H', 'P1D')
    olderThan?: string; // ISO duration (e.g., 'PT1H', 'P1D')
  };
}

/**
 * Cross-tenant analytics rule (master-slave aggregation)
 */
export interface CrossTenantRule {
  /** Rule name */
  name: string;
  /** Collection to query across tenants */
  collection: string;
  /** Query filter */
  query: Record<string, any>;
  /** Aggregation mode */
  mode: 'boolean' | 'sum' | 'max' | 'min' | 'median';
  /** Field to aggregate (for sum, max, min, median) */
  field?: string;
  /** Master tenant ID (where results are stored) */
  masterTenantId: string;
  /** Slave tenant IDs (data sources) */
  slaveTenantIds: string[];
  /** Relative time arguments */
  relativeTime?: {
    newerThan?: string; // ISO duration (e.g., 'PT1H', 'P1D')
    olderThan?: string; // ISO duration (e.g., 'PT1H', 'P1D')
  };
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  /** Standard counter rules */
  counterRules?: CounterRule[];
  /** Time-based analytics rules (worker-driven) */
  timeBasedRules?: TimeBasedRule[];
  /** Cross-tenant analytics rules */
  crossTenantRules?: CrossTenantRule[];
  /** List of all tenant IDs for cross-tenant operations */
  tenants?: string[];
}