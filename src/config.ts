import { isReplicaSetAvailable } from './utils/replicaSet.js';
import { logger } from './utils/logger.js';
import { ChronosConfigSchema } from './config/validate.js';

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
 * S3-compatible storage connection configuration
 */
export interface SpacesConnConfig {
  /** S3 endpoint URL */
  endpoint: string;
  /** AWS region */
  region: string;
  /** Access key */
  accessKey: string;
  /** Secret key */
  secretKey: string;
  /** Bucket for backups */
  backupsBucket: string;
  /** Bucket for JSON data */
  jsonBucket: string;
  /** Bucket for content */
  contentBucket: string;
  /** Force path style (for MinIO) */
  forcePathStyle?: boolean;
}

/**
 * Database connection configuration
 */
export interface DatabaseConnection {
  /** Globally unique identifier for direct routing */
  key: string;
  /** MongoDB connection URI */
  mongoUri: string;
  /** Database name */
  dbName: string;
  /** Optional external identifier for mapping */
  extIdentifier?: string;
}

/**
 * Database type configuration (metadata, knowledge, runtime)
 */
export interface DatabaseTypeConfig {
  /** Generic tier (shared across all tenants) */
  generic?: DatabaseConnection;
  /** Domain tier (shared within a domain) */
  domains?: DatabaseConnection[];
  /** Tenant tier (isolated per tenant) */
  tenants?: DatabaseConnection[];
}

/**
 * Counters configuration
 */
export interface CountersConfig {
  /** MongoDB URI for counters */
  mongoUri: string;
  /** Database name for counters */
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
 * Transaction configuration
 */
export interface TransactionConfig {
  /** Whether transactions are enabled */
  enabled: boolean;
  /** Whether to auto-detect transaction support */
  autoDetect?: boolean;
}

/**
 * Main Chronos configuration interface
 */
export interface ChronosConfig {
  /** Database configuration - can have empty sections */
  databases: {
    metadata?: DatabaseTypeConfig;
    knowledge?: DatabaseTypeConfig;
    runtime?: DatabaseTypeConfig;
  };
  /** 1-10 S3-compatible storage connections (optional if using localStorage) */
  spacesConns?: SpacesConnConfig[] | undefined;
  /** Local filesystem storage (for development/testing, NOT recommended for production) */
  localStorage?: LocalStorageConfig | undefined;
  /** Separate MongoDB connection for counters */
  counters: CountersConfig;
  /** How to route requests across backends */
  routing: RoutingConfig;
  /** Retention policies for versions and counters (optional, defaults to disabled) */
  retention?: RetentionConfig | undefined;
  /** Roll-up configuration for moving old data to manifests (optional, defaults to disabled) */
  rollup?: RollupConfig | undefined;
  /** Collection definitions with indexing and externalization rules */
  collectionMaps: Record<string, CollectionMap>;
  /** Optional counter rules for conditional totals */
  counterRules?: CountersRulesConfig | undefined;
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
  /** Tenant ID */
  tenantId?: string;
  /** Forced index for admin override */
  forcedIndex?: number;
  /** Key for direct routing */
  key?: string;
  /** Database type */
  databaseType?: 'metadata' | 'knowledge' | 'runtime';
  /** Tier */
  tier?: 'generic' | 'domain' | 'tenant';
  /** External identifier */
  extIdentifier?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates transaction configuration against MongoDB capabilities
 * @param config - Configuration to validate
 * @throws Error if transaction configuration is invalid
 */
export async function validateTransactionConfig(config: Partial<ChronosConfig>): Promise<void> {
  logger.debug('Starting transaction configuration validation', {
    transactionsEnabled: config.transactions?.enabled,
    autoDetect: config.transactions?.autoDetect,
    databasesCount: Object.keys(config.databases || {}).length
  });

  if (config.transactions?.enabled === true) {
    // Check if MongoDB supports transactions
    // Get first available MongoDB URI from databases
    let mongoUri: string | undefined;
    if (config.databases?.metadata?.generic) {
      mongoUri = config.databases.metadata.generic.mongoUri;
    } else if (config.databases?.knowledge?.generic) {
      mongoUri = config.databases.knowledge.generic.mongoUri;
    } else if (config.databases?.runtime?.generic) {
      mongoUri = config.databases.runtime.generic.mongoUri;
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
 * Validates a Chronos configuration object
 * @param config - Configuration object to validate
 * @returns Validated configuration with defaults applied
 * @throws ZodError if validation fails
 */
export function validateChronosConfig(config: unknown): ChronosConfig {
  logger.debug('Starting Chronos configuration validation');
  
  try {
    const validated = ChronosConfigSchema.parse(config);
    const resolved = resolveConfigDefaults(validated);
    
    logger.debug('Chronos configuration validation completed successfully', {
      databasesCount: Object.keys(resolved.databases).length,
      hasSpacesConns: !!resolved.spacesConns && resolved.spacesConns.length > 0,
      localStorageEnabled: resolved.localStorage?.enabled,
      transactionsEnabled: resolved.transactions?.enabled,
      collectionsCount: Object.keys(resolved.collectionMaps).length
    });
    
    return resolved;
  } catch (error) {
    logger.error('Chronos configuration validation failed', {}, error as Error);
    throw error;
  }
}

/**
 * Resolves configuration defaults
 * @param config - Validated configuration
 * @returns Configuration with defaults applied
 */
function resolveConfigDefaults(config: any): ChronosConfig {
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
  } as ChronosConfig;
}

/**
 * Checks if an object is a valid Chronos configuration
 * @param obj - Object to check
 * @returns True if valid configuration
 */
export function isValidChronosConfig(obj: unknown): obj is ChronosConfig {
  return ChronosConfigSchema.safeParse(obj).success;
}

// ============================================================================
// Global Configuration Management
// ============================================================================

let globalConfig: ChronosConfig | null = null;

/**
 * Sets the global configuration
 * @param config - Configuration to set globally
 */
export function setGlobalConfig(config: ChronosConfig): void {
  globalConfig = config;
}

/**
 * Gets the global configuration
 * @returns Global configuration or null if not set
 */
export function getGlobalConfig(): ChronosConfig | null {
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
}