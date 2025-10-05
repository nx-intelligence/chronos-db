import { z } from 'zod';
import type { ChronosConfig } from '../config.js';

// ============================================================================
// Enhanced Validation Schemas
// ============================================================================

export const SpacesConnSchema = z.object({
  key: z.string().min(1, 'S3 connection key is required'),
  endpoint: z.string().url('Invalid S3 endpoint URL'),
  region: z.string().min(1, 'Region is required'),
  accessKey: z.string().min(1, 'Access key is required'),
  secretKey: z.string().min(1, 'Secret key is required'),
        buckets: z.object({
          json: z.string().min(1, 'JSON bucket is required'),
          content: z.string().min(1, 'Content bucket is required'),
          versions: z.string().min(1, 'Versions bucket is required'),
          backup: z.string().min(1, 'Backup bucket is required').optional(),
        }),
  forcePathStyle: z.boolean().optional(),
});

export const RoutingSchema = z.object({
  hashAlgo: z.enum(['rendezvous', 'jump']).default('rendezvous'),
  chooseKey: z.string().optional(),
});

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

export const CounterPredicateSchema = z.record(z.any());

export const CounterRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  on: z.array(z.enum(['CREATE', 'UPDATE', 'DELETE'])).optional(),
  scope: z.enum(['meta', 'payload']).default('meta'),
  when: CounterPredicateSchema,
});

export const CountersRulesSchema = z.object({
  rules: z.array(CounterRuleSchema).optional(),
}).default({});

export const CollectionMapSchema = z.object({
  indexedProps: z.array(z.string().min(1, 'Indexed property name cannot be empty')), // Allow empty array for auto-indexing
  base64Props: z.record(z.object({
    contentType: z.string().min(1, 'Content type is required'),
    preferredText: z.boolean().optional(),
    textCharset: z.string().optional(),
  })).optional(),
  validation: z.object({
    requiredIndexed: z.array(z.string().min(1, 'Required indexed property name cannot be empty')).optional(),
  }).optional(),
});

// MongoDB connection schema
export const MongoConnSchema = z.object({
  key: z.string().min(1, 'MongoDB connection key is required'),
  mongoUri: z.string().min(1, 'MongoDB URI is required'),
});

// Database connection schema
export const DatabaseConnectionSchema = z.object({
  key: z.string().min(1, 'Database key is required'),
  mongoConnKey: z.string().min(1, 'MongoDB connection key is required'),
  dbName: z.string().min(1, 'Database name is required'),
  tenantId: z.string().optional(),
  spacesConnKey: z.string().optional(),
});

// Logs database schema (no tiers - simple flat structure)
export const LogsDatabaseConfigSchema = z.object({
  connection: DatabaseConnectionSchema,
});

// Main configuration schema
export const ChronosConfigSchema = z.object({
  mongoConns: z.array(MongoConnSchema).min(1, 'At least one MongoDB connection is required'),
  databases: z.object({
    metadata: z.array(DatabaseConnectionSchema).optional(),
    knowledge: z.array(DatabaseConnectionSchema).optional(),
    runtime: z.array(DatabaseConnectionSchema).optional(),
    logs: LogsDatabaseConfigSchema.optional(),
  }),
  spacesConns: z.array(SpacesConnSchema).max(10, 'Maximum 10 S3 connections allowed').optional(),
  localStorage: z.object({
    basePath: z.string().min(1, 'Base path is required for local storage'),
    enabled: z.boolean(),
  }).optional(),
  counters: z.object({ 
    mongoUri: z.string().min(1, 'Counters MongoDB URI is required'), 
    dbName: z.string().min(1, 'Counters database name is required') 
  }),
  routing: RoutingSchema.default({ hashAlgo: 'rendezvous' }),
  retention: RetentionSchema.default({}),
  rollup: z.any().optional(),
  collectionMaps: z.record(CollectionMapSchema).optional(),
  counterRules: CountersRulesSchema.optional(),
  devShadow: z.object({
    enabled: z.boolean(),
    ttlHours: z.number().int().positive('TTL hours must be positive'),
    maxBytesPerDoc: z.number().int().positive('Max bytes per document must be positive').optional(),
  }).optional(),
  hardDeleteEnabled: z.boolean().optional(),
  fallback: z.any().optional(),
  writeOptimization: z.any().optional(),
  transactions: z.any().optional(),
}).superRefine((cfg, ctx) => {
  // Validate that either spacesConns, localStorage, or individual connection spacesConn is provided
  const hasGlobalSpacesConns = cfg.spacesConns && cfg.spacesConns.length > 0;
  const hasLocalStorage = cfg.localStorage?.enabled;
  
  // Check if any database connection has its own S3 config
  const hasIndividualS3Configs = (() => {
    const checkConnection = (conn: any) => conn && conn.spacesConn;
    const checkArray = (arr: any) => arr && arr.some(checkConnection);
    const checkLogs = (logs: any) => logs && logs.connection && logs.connection.spacesConn;
    
    return checkArray(cfg.databases.metadata) ||
           checkArray(cfg.databases.knowledge) ||
           checkArray(cfg.databases.runtime) ||
           checkLogs(cfg.databases.logs);
  })();
  
  if (!hasGlobalSpacesConns && !hasLocalStorage && !hasIndividualS3Configs) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'Either global spacesConns, localStorage, or individual connection spacesConn must be configured.' 
    });
  }
  
  // Validate that at least one database type is configured
  const hasDatabases = cfg.databases.metadata || cfg.databases.knowledge || cfg.databases.runtime || cfg.databases.logs;
  if (!hasDatabases) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'At least one database type (metadata, knowledge, runtime, or logs) must be configured.' 
    });
  }
});


// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate Chronos configuration with enhanced error messages
 * @param cfg - Configuration to validate
 * @returns Validated configuration
 * @throws Error with redacted secrets if validation fails
 */
export function validateConfig(cfg: unknown): ChronosConfig {
  try {
    return ChronosConfigSchema.parse(cfg) as ChronosConfig;
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

