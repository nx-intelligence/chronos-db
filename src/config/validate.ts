import { z } from 'zod';
import type { XronoxConfig } from '../config.js';

// ============================================================================
// Enhanced Validation Schemas
// ============================================================================

// MongoDB connection schema
export const DbConnectionSchema = z.object({
  mongoUri: z.string().min(1, 'MongoDB URI is required'),
});

// Bucket configuration schema
export const BucketConfigurationSchema = z.object({
  records: z.string().min(1).optional(),
  backups: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  versions: z.string().min(1).optional(),
});

// Folder prefixes schema
export const FolderPrefixesSchema = z.object({
  records: z.string().min(1).optional(),
  backups: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  versions: z.string().min(1).optional(),
});

// S3-compatible storage connection schema
export const SpacesConnectionSchema = z.object({
  endpoint: z.string().url('Invalid S3 endpoint URL'),
  region: z.string().min(1, 'Region is required'),
  accessKey: z.string().min(1, 'Access key is required'),
  secretKey: z.string().min(1, 'Secret key is required'),
  forcePathStyle: z.boolean().optional(),
  bucket: z.string().min(1).optional(), // Legacy single bucket
  buckets: BucketConfigurationSchema.optional(), // Multi-bucket configuration
  folderPrefixes: FolderPrefixesSchema.optional(),
}).refine(
  (data) => data.bucket || data.buckets,
  { message: 'Either bucket or buckets configuration is required' }
);

// Generic database schema
export const GenericDatabaseSchema = z.object({
  dbConnRef: z.string().min(1, 'Database connection reference is required'),
  spaceConnRef: z.string().min(1, 'Spaces connection reference is required'),
  bucket: z.string().min(1).optional(), // Legacy single bucket
  recordsBucket: z.string().min(1).optional(),
  versionsBucket: z.string().min(1).optional(),
  contentBucket: z.string().min(1).optional(),
  backupsBucket: z.string().min(1).optional(),
  dbName: z.string().min(1, 'Database name is required'),
}).refine(
  (data) => data.bucket || data.recordsBucket || data.versionsBucket || data.contentBucket || data.backupsBucket,
  { message: 'At least one bucket configuration is required (bucket or recordsBucket/versionsBucket/contentBucket/backupsBucket)' }
);

// Domain database schema
export const DomainDatabaseSchema = z.object({
  domain: z.string().min(1, 'Domain identifier is required'),
  dbConnRef: z.string().min(1, 'Database connection reference is required'),
  spaceConnRef: z.string().min(1, 'Spaces connection reference is required'),
  bucket: z.string().min(1).optional(), // Legacy single bucket
  recordsBucket: z.string().min(1).optional(),
  versionsBucket: z.string().min(1).optional(),
  contentBucket: z.string().min(1).optional(),
  backupsBucket: z.string().min(1).optional(),
  dbName: z.string().min(1, 'Database name is required'),
}).refine(
  (data) => data.bucket || data.recordsBucket || data.versionsBucket || data.contentBucket || data.backupsBucket,
  { message: 'At least one bucket configuration is required' }
);

// Tenant database schema
export const TenantDatabaseSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
  dbConnRef: z.string().min(1, 'Database connection reference is required'),
  spaceConnRef: z.string().min(1, 'Spaces connection reference is required'),
  bucket: z.string().min(1).optional(), // Legacy single bucket
  recordsBucket: z.string().min(1).optional(),
  versionsBucket: z.string().min(1).optional(),
  contentBucket: z.string().min(1).optional(),
  backupsBucket: z.string().min(1).optional(),
  dbName: z.string().min(1, 'Database name is required'),
}).refine(
  (data) => data.bucket || data.recordsBucket || data.versionsBucket || data.contentBucket || data.backupsBucket,
  { message: 'At least one bucket configuration is required' }
);

// Runtime tenant database schema (includes analytics)
// Runtime database is for TRANSACTIONAL data - S3 is optional for backward compat but HIGHLY RECOMMENDED
export const RuntimeTenantDatabaseSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
  dbConnRef: z.string().min(1, 'Database connection reference is required'),
  spaceConnRef: z.string().min(1).optional(), // Optional for backward compatibility
  bucket: z.string().min(1).optional(), // Legacy single bucket
  recordsBucket: z.string().min(1).optional(),
  versionsBucket: z.string().min(1).optional(), // CRITICAL for audit trails
  contentBucket: z.string().min(1).optional(),
  backupsBucket: z.string().min(1).optional(),
  dbName: z.string().min(1, 'Database name is required'),
  analyticsDbName: z.string().min(1, 'Analytics database name is required'),
});

// Logs database schema (S3 is now optional for logs)
export const LogsDatabaseSchema = z.object({
  dbConnRef: z.string().min(1, 'Database connection reference is required'),
  spaceConnRef: z.string().min(1).optional(), // Optional - enables S3 storage
  bucket: z.string().min(1).optional(), // Legacy single bucket
  recordsBucket: z.string().min(1).optional(), // For log records
  contentBucket: z.string().min(1).optional(), // For log attachments
  dbName: z.string().min(1, 'Database name is required'),
});

// Messaging database schema (simple flat structure, like logs)
// Messaging is relatively static (like metadata) - NO versioning needed
export const MessagingDatabaseSchema = z.object({
  dbConnRef: z.string().min(1, 'Database connection reference is required'),
  spaceConnRef: z.string().min(1).optional(), // Optional S3 support
  bucket: z.string().min(1).optional(), // Legacy single bucket
  recordsBucket: z.string().min(1).optional(), // Message records
  contentBucket: z.string().min(1).optional(), // Large message payloads
  backupsBucket: z.string().min(1).optional(), // Backups
  // NO versionsBucket - messaging data is append-only/static
  dbName: z.string().min(1, 'Database name is required'),
  captureDeliveries: z.boolean().optional(),
});

// Identities database schema (simple flat structure, like logs)
// Identities is relatively static (like metadata) - NO versioning needed
export const IdentitiesDatabaseSchema = z.object({
  dbConnRef: z.string().min(1, 'Database connection reference is required'),
  spaceConnRef: z.string().min(1).optional(), // Optional S3 support
  bucket: z.string().min(1).optional(), // Legacy single bucket
  recordsBucket: z.string().min(1).optional(), // Identity records
  contentBucket: z.string().min(1).optional(), // Profile images, documents
  backupsBucket: z.string().min(1).optional(), // Backups
  // NO versionsBucket - identity data is relatively static
  dbName: z.string().min(1, 'Database name is required'),
});

// Metadata databases schema
export const MetadataDatabasesSchema = z.object({
  genericDatabase: GenericDatabaseSchema,
  domainsDatabases: z.array(DomainDatabaseSchema),
  tenantDatabases: z.array(TenantDatabaseSchema),
});

// Knowledge databases schema
export const KnowledgeDatabasesSchema = z.object({
  genericDatabase: GenericDatabaseSchema,
  domainsDatabases: z.array(DomainDatabaseSchema),
  tenantDatabases: z.array(TenantDatabaseSchema),
});

// Runtime databases schema
export const RuntimeDatabasesSchema = z.object({
  tenantDatabases: z.array(RuntimeTenantDatabaseSchema),
});

// Routing schema
export const RoutingSchema = z.object({
  hashAlgo: z.enum(['rendezvous', 'jump']).default('rendezvous'),
  chooseKey: z.string().optional(),
});

// Retention schema
export const RetentionSchema = z.object({
  ver: z.object({
    days: z.number().int().positive().optional(),
    maxPerItem: z.number().int().positive().optional(),
  }).default({}),
  counters: z.object({
    days: z.number().int().nonnegative().optional(),
    weeks: z.number().int().nonnegative().optional(),
    months: z.number().int().nonnegative().optional(),
  }).partial().default({}),
});

// Counter predicate schema
export const CounterPredicateSchema = z.record(z.any());

// Counter rule schema
export const CounterRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  on: z.array(z.enum(['CREATE', 'UPDATE', 'DELETE'])).optional(),
  scope: z.enum(['meta', 'payload']).default('meta'),
  when: CounterPredicateSchema,
  countUnique: z.array(z.string().min(1, 'Property name cannot be empty')).optional(),
});

// Time-based analytics rule schema
export const TimeBasedRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  collection: z.string().min(1, 'Collection name is required'),
  query: z.record(z.any()),
  operation: z.enum(['count', 'sum', 'average', 'max', 'min', 'median']),
  field: z.string().optional(),
  saveMode: z.enum(['global', 'timeframe']),
  timeframe: z.enum(['hourly', 'daily', 'monthly']).optional(),
  arguments: z.array(z.string()).optional(),
  relativeTime: z.object({
    newerThan: z.string().optional(),
    olderThan: z.string().optional(),
  }).optional(),
});

// Cross-tenant analytics rule schema
export const CrossTenantRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  collection: z.string().min(1, 'Collection name is required'),
  query: z.record(z.any()),
  mode: z.enum(['boolean', 'sum', 'max', 'min', 'median']),
  field: z.string().optional(),
  masterTenantId: z.string().min(1, 'Master tenant ID is required'),
  slaveTenantIds: z.array(z.string().min(1, 'Slave tenant ID cannot be empty')).min(1, 'At least one slave tenant is required'),
  relativeTime: z.object({
    newerThan: z.string().optional(),
    olderThan: z.string().optional(),
  }).optional(),
});

// Analytics configuration schema
export const AnalyticsConfigSchema = z.object({
  counterRules: z.array(CounterRuleSchema).optional(),
  timeBasedRules: z.array(TimeBasedRuleSchema).optional(),
  crossTenantRules: z.array(CrossTenantRuleSchema).optional(),
  tenants: z.array(z.string().min(1, 'Tenant ID cannot be empty')).optional(),
});

// Counters rules schema (deprecated - use AnalyticsConfigSchema instead)
export const CountersRulesSchema = z.object({
  rules: z.array(CounterRuleSchema).optional(),
}).default({});

// S3 offload configuration schema
export const S3OffloadConfigSchema = z.object({
  enabled: z.boolean(),
  olderThan: z.number().int().positive('olderThan must be a positive number of days').optional().default(30),
  archiveBucket: z.string().min(1).optional(),
});

// Collection map schema
export const CollectionMapSchema = z.object({
  indexedProps: z.array(z.string().min(1, 'Indexed property name cannot be empty')),
  base64Props: z.record(z.object({
    contentType: z.string().min(1, 'Content type is required'),
    preferredText: z.boolean().optional(),
    textCharset: z.string().optional(),
  })).optional(),
  validation: z.object({
    requiredIndexed: z.array(z.string().min(1, 'Required indexed property name cannot be empty')).optional(),
  }).optional(),
  s3Offload: S3OffloadConfigSchema.optional(), // NEW: S3 offload configuration
});

// Logical delete configuration schema
export const LogicalDeleteConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

// Versioning configuration schema
export const VersioningConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

// Main configuration schema
export const XronoxConfigSchema = z.object({
  dbConnections: z.record(DbConnectionSchema),
  spacesConnections: z.record(SpacesConnectionSchema),
  databases: z.object({
    metadata: MetadataDatabasesSchema.optional(),
    knowledge: KnowledgeDatabasesSchema.optional(),
    runtime: RuntimeDatabasesSchema.optional(),
    logs: LogsDatabaseSchema.optional(),
    messaging: MessagingDatabaseSchema.optional(),
    identities: IdentitiesDatabaseSchema.optional(),
  }),
  localStorage: z.object({
    basePath: z.string().min(1, 'Base path is required for local storage'),
    enabled: z.boolean(),
  }).optional(),
  routing: RoutingSchema.default({ hashAlgo: 'rendezvous' }),
  retention: RetentionSchema.default({}),
  rollup: z.any().optional(),
  collectionMaps: z.record(CollectionMapSchema).optional(),
  analytics: AnalyticsConfigSchema.optional(),
  devShadow: z.object({
    enabled: z.boolean(),
    ttlHours: z.number().int().positive('TTL hours must be positive'),
    maxBytesPerDoc: z.number().int().positive('Max bytes per document must be positive').optional(),
  }).optional(),
  hardDeleteEnabled: z.boolean().optional(),
  fallback: z.any().optional(),
  writeOptimization: z.any().optional(),
  transactions: z.any().optional(),
  logicalDelete: LogicalDeleteConfigSchema.optional(),
  versioning: VersioningConfigSchema.optional(),
}).superRefine((cfg, ctx) => {
  // Validate that at least one database type is configured
  const hasDatabases = cfg.databases.metadata || cfg.databases.knowledge || cfg.databases.runtime || cfg.databases.logs;
  if (!hasDatabases) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'At least one database type (metadata, knowledge, runtime, or logs) must be configured.' 
    });
  }
  
  // Validate that all referenced connections exist
  const allDbConnRefs = new Set<string>();
  const allSpaceConnRefs = new Set<string>();
  
  // Collect all references
  if (cfg.databases.metadata) {
    allDbConnRefs.add(cfg.databases.metadata.genericDatabase.dbConnRef);
    allSpaceConnRefs.add(cfg.databases.metadata.genericDatabase.spaceConnRef);
    cfg.databases.metadata.domainsDatabases.forEach((db: any) => {
      allDbConnRefs.add(db.dbConnRef);
      allSpaceConnRefs.add(db.spaceConnRef);
    });
    cfg.databases.metadata.tenantDatabases.forEach((db: any) => {
      allDbConnRefs.add(db.dbConnRef);
      allSpaceConnRefs.add(db.spaceConnRef);
    });
  }
  
  if (cfg.databases.knowledge) {
    allDbConnRefs.add(cfg.databases.knowledge.genericDatabase.dbConnRef);
    allSpaceConnRefs.add(cfg.databases.knowledge.genericDatabase.spaceConnRef);
    cfg.databases.knowledge.domainsDatabases.forEach((db: any) => {
      allDbConnRefs.add(db.dbConnRef);
      allSpaceConnRefs.add(db.spaceConnRef);
    });
    cfg.databases.knowledge.tenantDatabases.forEach((db: any) => {
      allDbConnRefs.add(db.dbConnRef);
      allSpaceConnRefs.add(db.spaceConnRef);
    });
  }
  
  if (cfg.databases.runtime) {
    cfg.databases.runtime.tenantDatabases.forEach((db: any) => {
      allDbConnRefs.add(db.dbConnRef);
      allSpaceConnRefs.add(db.spaceConnRef);
    });
  }
  
  if (cfg.databases.logs) {
    allDbConnRefs.add(cfg.databases.logs.dbConnRef);
    allSpaceConnRefs.add(cfg.databases.logs.spaceConnRef);
  }
  
  // Check that all referenced connections exist
  allDbConnRefs.forEach(ref => {
    if (!cfg.dbConnections[ref]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Referenced database connection '${ref}' does not exist in dbConnections.`
      });
    }
  });
  
  allSpaceConnRefs.forEach(ref => {
    if (!cfg.spacesConnections[ref]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Referenced spaces connection '${ref}' does not exist in spacesConnections.`
      });
    }
  });
});


// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate Xronox configuration with enhanced error messages
 * @param cfg - Configuration to validate
 * @returns Validated configuration
 * @throws Error with redacted secrets if validation fails
 */
export function validateConfig(cfg: unknown): XronoxConfig {
  try {
    return XronoxConfigSchema.parse(cfg) as XronoxConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const redactedError = redactSecrets(error);
      throw new Error(`Configuration validation failed:\n${formatZodError(redactedError)}`);
    }
    throw error;
  }
}


/**
 * Redact sensitive information from error messages
 */
function redactSecrets(error: z.ZodError): z.ZodError {
  const redactedIssues = error.issues.map(issue => {
    if (issue.path.includes('accessKey') || issue.path.includes('secretKey')) {
      return {
        ...issue,
        message: issue.message.replace(/'.*'/, '[REDACTED]'),
      };
    }
    if (issue.path.includes('mongoUri')) {
      return {
        ...issue,
        message: issue.message.replace(/mongodb:\/\/[^@]*@/, 'mongodb://[REDACTED]@'),
      };
    }
    return issue;
  });
  
  return new z.ZodError(redactedIssues);
}

/**
 * Format Zod error messages in a readable way
 */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('\n');
}

/**
 * Validate a specific collection map
 * @param collectionName - Name of the collection
 * @param map - Collection map to validate
 * @returns Validated collection map
 */
export function validateCollectionMap(collectionName: string, map: unknown): any {
  try {
    return CollectionMapSchema.parse(map);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const redactedError = redactSecrets(error);
      throw new Error(`Collection map validation failed for '${collectionName}':\n${formatZodError(redactedError)}`);
    }
    throw error;
  }
}

/**
 * Validate counter rules
 * @param rules - Counter rules to validate
 * @returns Validated counter rules
 */
export function validateCounterRules(rules: unknown): any {
  try {
    return CountersRulesSchema.parse(rules);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const redactedError = redactSecrets(error);
      throw new Error(`Counter rules validation failed:\n${formatZodError(redactedError)}`);
    }
    throw error;
  }
}

/**
 * Validate dev shadow configuration
 * @param config - Dev shadow config to validate
 * @returns Validated dev shadow config
 */
export function validateDevShadowConfig(config: unknown): any {
  try {
    return z.object({
      enabled: z.boolean(),
      ttlHours: z.number().int().positive('TTL hours must be positive'),
      maxBytesPerDoc: z.number().int().positive('Max bytes per document must be positive').optional(),
    }).parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Dev shadow configuration validation failed:\n${formatZodError(error)}`);
    }
    throw error;
  }
}

