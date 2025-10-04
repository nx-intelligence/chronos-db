import { z } from 'zod';
import { isReplicaSetAvailable } from './utils/replicaSet.js';

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
 * Main configuration interface for the unified data manager
 */
export interface UdmConfig {
  /** 1-10 MongoDB connection URIs */
  mongoUris: string[];
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
 * S3-compatible storage connection configuration
 */
export interface SpacesConnConfig {
  /** S3 endpoint URL (e.g., "https://nyc3.digitaloceanspaces.com") */
  endpoint: string;
  /** S3 region (e.g., "nyc3", "us-east-1") */
  region: string;
  /** S3 access key */
  accessKey: string;
  /** S3 secret key */
  secretKey: string;
  /** Bucket for manifests and snapshots */
  backupsBucket: string;
  /** Bucket for versioned JSON documents */
  jsonBucket: string;
  /** Bucket for externalized binary content */
  contentBucket: string;
  /** Whether to use path-style URLs (required for some S3 providers like MinIO) */
  forcePathStyle?: boolean | undefined;
}

/**
 * Counters database configuration
 */
export interface CountersConfig {
  /** MongoDB URI for counters database */
  mongoUri: string;
  /** Database name for counters */
  dbName: string;
}

/**
 * Routing configuration for backend selection
 */
export interface RoutingConfig {
  /** Hashing algorithm for backend selection */
  hashAlgo: 'rendezvous' | 'jump';
  /** Key to use for routing (e.g., "tenantId|dbName") */
  chooseKey?: string | undefined;
}

/**
 * Retention configuration for data lifecycle management
 */
export interface RetentionConfig {
  /** Whether retention is enabled (default: false) */
  enabled?: boolean | undefined;
  /** Version retention settings */
  ver?: {
    /** Whether version retention is enabled (default: false) */
    enabled?: boolean | undefined;
    /** Keep versions for this many days (default: 90) */
    maxAge?: number | undefined;
    /** Maximum versions to keep per item (default: 10) */
    maxVersions?: number | undefined;
    /** @deprecated Use maxAge instead */
    days?: number | undefined;
    /** @deprecated Use maxVersions instead */
    maxPerItem?: number | undefined;
  } | undefined;
  /** Counter retention settings */
  counters?: {
    /** Whether counter retention is enabled (default: false) */
    enabled?: boolean | undefined;
    /** Daily counter documents to retain (default: 365) */
    maxAge?: number | undefined;
    /** Maximum counter versions to keep (default: 50) */
    maxVersions?: number | undefined;
    /** @deprecated Use maxAge instead */
    days?: number | undefined;
    /** @deprecated Use maxVersions instead */
    weeks?: number | undefined;
    /** @deprecated Use maxVersions instead */
    months?: number | undefined;
  } | undefined;
}

/**
 * Roll-up configuration for moving old data to S3 manifests
 */
export interface RollupConfig {
  /** Whether roll-up is enabled (default: false) */
  enabled?: boolean | undefined;
  /** How often to create manifests (default: 'daily') */
  manifestPeriod?: 'daily' | 'weekly' | 'monthly' | undefined;
  /** Whether to automatically handle daily/weekly/monthly operations (default: true) */
  autoSchedule?: boolean | undefined;
}

/**
 * Collection mapping configuration
 */
/**
 * Collection-specific version retention policy (overrides global retention.ver)
 * Controls how many versions are kept in MongoDB _ver index (NOT the data itself!)
 */
export interface CollectionVersionRetention {
  /** Keep version metadata in MongoDB for this many days (older pruned from _ver, but kept in storage) */
  daysInIndex?: number | undefined;
  /** Keep this many versions per item in MongoDB _ver index (older pruned, but kept in storage) */
  maxVersionsInIndex?: number | undefined;
}

export interface CollectionMap {
  /** Fields to index in MongoDB for fast queries */
  indexedProps: string[];
  /** Fields to externalize to S3 as binary content */
  base64Props?: Record<string, { contentType: string }> | undefined;
  /** Validation rules */
  validation?: {
    /** Required indexed fields */
    requiredIndexed?: string[] | undefined;
  } | undefined;
  /** Version retention for this collection (overrides global retention.ver) - controls MongoDB _ver index, NOT storage */
  versionRetention?: CollectionVersionRetention | undefined;
}

/**
 * Counter rule for conditional totals
 */
export interface CounterRule {
  /** Short, unique, stable name (e.g., "highSeverity", "countryDE") */
  name: string;
  /** Operations this rule applies to (default: all) */
  on?: Array<'CREATE' | 'UPDATE' | 'DELETE'> | undefined;
  /** Scope for evaluation (default: "meta") */
  scope?: 'meta' | 'payload' | undefined;
  /** JSON predicate for matching */
  when: CounterPredicate;
}

/**
 * Counter predicate for rule evaluation
 */
export type CounterPredicate = {
  [path: string]:
    | {
        $eq?: any;
        $ne?: any;
        $in?: any[];
        $nin?: any[];
        $exists?: boolean;
        $regex?: string;
        $gt?: number;
        $gte?: number;
        $lt?: number;
        $lte?: number;
      }
    | any; // shorthand equality: { "country": "DE" }
};

/**
 * Counter rules configuration
 */
export interface CountersRulesConfig {
  /** List of counter rules */
  rules?: CounterRule[] | undefined;
}

/**
 * Dev shadow configuration for full snapshots in Mongo
 */
export interface DevShadowConfig {
  /** Enable dev shadow functionality */
  enabled: boolean;
  /** TTL in hours for shadows */
  ttlHours: number;
  /** Maximum bytes per document for shadow storage */
  maxBytesPerDoc?: number | undefined;
}

/**
 * Fallback queue configuration
 */
export interface FallbackConfig {
  /** Enable fallback queue functionality */
  enabled: boolean;
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds for exponential backoff */
  maxDelayMs: number;
  /** Dead letter collection name */
  deadLetterCollection: string;
}

/**
 * Transaction configuration
 */
export interface TransactionConfig {
  /** Whether to enable MongoDB transactions (default: true) */
  enabled?: boolean | undefined;
  /** Whether to automatically detect replica set support (default: true) */
  autoDetect?: boolean | undefined;
}

/**
 * Write optimization configuration
 */
export interface WriteOptimizationConfig {
  /** Enable S3 batching */
  batchS3: boolean;
  /** Batch window in milliseconds */
  batchWindowMs: number;
  /** Debounce counters updates in milliseconds */
  debounceCountersMs: number;
  /** Allow skipping dev shadows for heavy operations */
  allowShadowSkip: boolean;
}

/**
 * Context for routing decisions
 */
export interface RouteContext {
  /** Tenant identifier */
  tenantId?: string;
  /** Database name */
  dbName: string;
  /** Collection name */
  collection: string;
  /** Additional routing data */
  [key: string]: unknown;
}

/**
 * Version specification for restore operations
 */
export interface VersionSpec {
  /** Object version number */
  ov?: number;
  /** Collection version number */
  cv?: number;
  /** Timestamp for "as of" operations */
  at?: Date;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

const spacesConnConfigSchema = z.object({
  endpoint: z.string().url('Invalid S3 endpoint URL'),
  region: z.string().min(1, 'Region is required'),
  accessKey: z.string().min(1, 'Access key is required'),
  secretKey: z.string().min(1, 'Secret key is required'),
  backupsBucket: z.string().min(1, 'Backups bucket name is required'),
  jsonBucket: z.string().min(1, 'JSON bucket name is required'),
  contentBucket: z.string().min(1, 'Content bucket name is required'),
  forcePathStyle: z.boolean().optional(),
});

const countersConfigSchema = z.object({
  mongoUri: z.string().url('Invalid MongoDB URI for counters'),
  dbName: z.string().min(1, 'Counters database name is required'),
});

const routingConfigSchema = z.object({
  hashAlgo: z.enum(['rendezvous', 'jump'], {
    errorMap: () => ({ message: 'Hash algorithm must be "rendezvous" or "jump"' }),
  }),
  chooseKey: z.string().optional(),
});

const retentionConfigSchema = z.object({
  enabled: z.boolean().optional(),
  ver: z.object({
    enabled: z.boolean().optional(),
    maxAge: z.number().int().positive().optional(),
    maxVersions: z.number().int().positive().optional(),
    // Deprecated fields for backward compatibility
    days: z.number().int().positive().optional(),
    maxPerItem: z.number().int().positive().optional(),
  }).optional(),
  counters: z.object({
    enabled: z.boolean().optional(),
    maxAge: z.number().int().positive().optional(),
    maxVersions: z.number().int().positive().optional(),
    // Deprecated fields for backward compatibility
    days: z.number().int().positive().optional(),
    weeks: z.number().int().positive().optional(),
    months: z.number().int().positive().optional(),
  }).optional(),
}).optional();

const rollupConfigSchema = z.object({
  enabled: z.boolean().optional(),
  manifestPeriod: z.enum(['daily', 'weekly', 'monthly'], {
    errorMap: () => ({ message: 'Manifest period must be "daily", "weekly", or "monthly"' }),
  }).optional(),
  autoSchedule: z.boolean().optional(),
}).optional();

const collectionMapSchema = z.object({
  indexedProps: z.array(z.string()).min(1, 'At least one indexed property is required'),
  base64Props: z.record(
    z.string(),
    z.object({
      contentType: z.string().min(1, 'Content type is required'),
    })
  ).optional(),
  validation: z.object({
    requiredIndexed: z.array(z.string()).optional(),
  }).optional(),
});

const counterRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  on: z.array(z.enum(['CREATE', 'UPDATE', 'DELETE'])).optional(),
  scope: z.enum(['meta', 'payload']).optional(),
  when: z.record(z.string(), z.any()), // Flexible predicate validation
});

const countersRulesConfigSchema = z.object({
  rules: z.array(counterRuleSchema).optional(),
}).optional();

const devShadowConfigSchema = z.object({
  enabled: z.boolean(),
  ttlHours: z.number().int().positive('TTL hours must be positive'),
  maxBytesPerDoc: z.number().int().positive('Max bytes per doc must be positive').optional(),
});

const fallbackConfigSchema = z.object({
  enabled: z.boolean(),
  maxAttempts: z.number().int().positive('Max attempts must be positive'),
  baseDelayMs: z.number().int().positive('Base delay must be positive'),
  maxDelayMs: z.number().int().positive('Max delay must be positive'),
  deadLetterCollection: z.string().min(1, 'Dead letter collection name is required'),
});

const transactionConfigSchema = z.object({
  enabled: z.boolean().optional(),
  autoDetect: z.boolean().optional(),
}).optional();

const writeOptimizationConfigSchema = z.object({
  batchS3: z.boolean(),
  batchWindowMs: z.number().int().positive('Batch window must be positive'),
  debounceCountersMs: z.number().int().positive('Debounce counters must be positive'),
  allowShadowSkip: z.boolean(),
});

const localStorageConfigSchema = z.object({
  basePath: z.string().min(1, 'Base path is required for local storage'),
  enabled: z.boolean(),
});

const udmConfigSchema = z.object({
  mongoUris: z.array(z.string().url('Invalid MongoDB URI'))
    .min(1, 'At least one MongoDB URI is required')
    .max(10, 'Maximum 10 MongoDB URIs allowed'),
  spacesConns: z.array(spacesConnConfigSchema)
    .max(10, 'Maximum 10 S3 connections allowed')
    .optional(),
  localStorage: localStorageConfigSchema.optional(),
  counters: countersConfigSchema,
  routing: routingConfigSchema,
  retention: retentionConfigSchema,
  rollup: rollupConfigSchema,
  collectionMaps: z.record(z.string(), collectionMapSchema)
    .refine(
      (maps) => Object.keys(maps).length > 0,
      'At least one collection map is required'
    ),
  counterRules: countersRulesConfigSchema.optional(),
  devShadow: devShadowConfigSchema.optional(),
  hardDeleteEnabled: z.boolean().optional(),
  fallback: fallbackConfigSchema.optional(),
  writeOptimization: writeOptimizationConfigSchema.optional(),
  transactions: transactionConfigSchema,
}).refine(
  (config) => {
    // Must have either spacesConns (with connections) or localStorage
    const hasSpacesConns = config.spacesConns && config.spacesConns.length > 0;
    const hasLocalStorage = config.localStorage && config.localStorage.enabled;
    
    if (!hasSpacesConns && !hasLocalStorage) {
      return false;
    }
    
    // If using spacesConns, must match mongoUris length
    if (hasSpacesConns && config.spacesConns && config.spacesConns.length !== config.mongoUris.length) {
      return false;
    }
    
    return true;
  },
  (config) => {
    const hasSpacesConns = config.spacesConns && config.spacesConns.length > 0;
    const hasLocalStorage = config.localStorage && config.localStorage.enabled;
    
    if (!hasSpacesConns && !hasLocalStorage) {
      return {
        message: 'Must provide either spacesConns (S3) with at least one connection or localStorage configuration',
        path: ['spacesConns', 'localStorage'],
      };
    }
    
    // Only return S3 matching error if we're actually using S3
    if (hasSpacesConns && config.spacesConns && config.spacesConns.length !== config.mongoUris.length) {
      return {
        message: `Number of MongoDB URIs (${config.mongoUris.length}) must match number of S3 connections (${config.spacesConns.length})`,
        path: ['mongoUris', 'spacesConns'],
      };
    }
    
    // If we get here, validation should pass
    return {
      message: 'Configuration validation failed',
      path: [],
    };
  }
);

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a UDM configuration object
 * @param config - Configuration object to validate
 * @returns Validated configuration with defaults applied
 * @throws ZodError if validation fails
 */
/**
 * Validates transaction configuration against MongoDB capabilities
 * @param config - Configuration to validate
 * @throws Error if transaction configuration is invalid
 */
export async function validateTransactionConfig(config: Partial<UdmConfig>): Promise<void> {
  if (config.transactions?.enabled === true) {
    // Check if MongoDB supports transactions
    const mongoUri = config.mongoUris?.[0];
    if (!mongoUri) {
      throw new Error('No MongoDB URI available for transaction validation');
    }
    
    const hasReplicaSet = await isReplicaSetAvailable(mongoUri);
    
    if (!hasReplicaSet && config.transactions.autoDetect !== false) {
      throw new Error(
        'chronos-db: Transactions are enabled but MongoDB is not configured as a replica set. ' +
        'Either disable transactions by setting "transactions.enabled: false" or configure MongoDB as a replica set. ' +
        'See: https://docs.mongodb.com/manual/replication/'
      );
    }
  }
}

export function validateUdmConfig(config: unknown): UdmConfig {
  const validated = udmConfigSchema.parse(config);
  return resolveConfigDefaults(validated);
}

/**
 * Safely validates a UDM configuration object
 * @param config - Configuration object to validate
 * @returns Validation result with success flag and data/error
 */
export function safeValidateUdmConfig(config: unknown): {
  success: true;
  data: UdmConfig;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = udmConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: resolveConfigDefaults(result.data) };
  } else {
    return { success: false, error: result.error };
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an object is a valid UdmConfig
 * @param obj - Object to check
 * @returns True if object is a valid UdmConfig
 */
export function isUdmConfig(obj: unknown): obj is UdmConfig {
  return udmConfigSchema.safeParse(obj).success;
}

/**
 * Type guard to check if an object is a valid SpacesConnConfig
 * @param obj - Object to check
 * @returns True if object is a valid SpacesConnConfig
 */
export function isSpacesConnConfig(obj: unknown): obj is SpacesConnConfig {
  return spacesConnConfigSchema.safeParse(obj).success;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default retention configuration (disabled by default)
 */
export const DEFAULT_RETENTION: RetentionConfig = {
  enabled: false,
  ver: {
    enabled: false,
    maxAge: 90,
    maxVersions: 10,
  },
  counters: {
    enabled: false,
    maxAge: 365,
    maxVersions: 50,
  },
};

/**
 * Default routing configuration
 */
export const DEFAULT_ROUTING: RoutingConfig = {
  hashAlgo: 'rendezvous',
  chooseKey: 'tenantId|dbName',
};

/**
 * Default rollup configuration (disabled by default)
 */
export const DEFAULT_ROLLUP: RollupConfig = {
  enabled: false,
  manifestPeriod: 'daily',
  autoSchedule: true,
};

/**
 * Default transaction configuration (enabled by default)
 */
export const DEFAULT_TRANSACTIONS: TransactionConfig = {
  enabled: true,
  autoDetect: true,
};

// ============================================================================
// Configuration Resolution Functions
// ============================================================================

/**
 * Resolves configuration defaults for retention policies
 */
export function resolveRetentionDefaults(config?: RetentionConfig): RetentionConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_RETENTION.enabled,
    ver: {
      enabled: config?.ver?.enabled ?? DEFAULT_RETENTION.ver?.enabled,
      maxAge: config?.ver?.maxAge ?? config?.ver?.days ?? DEFAULT_RETENTION.ver?.maxAge,
      maxVersions: config?.ver?.maxVersions ?? config?.ver?.maxPerItem ?? DEFAULT_RETENTION.ver?.maxVersions,
    },
    counters: {
      enabled: config?.counters?.enabled ?? DEFAULT_RETENTION.counters?.enabled,
      maxAge: config?.counters?.maxAge ?? config?.counters?.days ?? DEFAULT_RETENTION.counters?.maxAge,
      maxVersions: config?.counters?.maxVersions ?? DEFAULT_RETENTION.counters?.maxVersions,
    },
  };
}

/**
 * Resolves configuration defaults for rollup policies
 */
export function resolveRollupDefaults(config?: RollupConfig): RollupConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_ROLLUP.enabled,
    manifestPeriod: config?.manifestPeriod ?? DEFAULT_ROLLUP.manifestPeriod,
    autoSchedule: config?.autoSchedule ?? DEFAULT_ROLLUP.autoSchedule,
  };
}

/**
 * Resolves configuration defaults for transaction policies
 */
export function resolveTransactionDefaults(config?: TransactionConfig): TransactionConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_TRANSACTIONS.enabled,
    autoDetect: config?.autoDetect ?? DEFAULT_TRANSACTIONS.autoDetect,
  };
}

/**
 * Resolves complete configuration with defaults applied
 */
export function resolveConfigDefaults(config: Partial<UdmConfig>): UdmConfig {
  return {
    ...config,
    retention: resolveRetentionDefaults(config.retention),
    rollup: resolveRollupDefaults(config.rollup),
    transactions: resolveTransactionDefaults(config.transactions),
  } as UdmConfig;
}
