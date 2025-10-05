import { z } from 'zod';
import type { ChronosConfig, EnhancedChronosConfig, DatabaseConnection, DatabaseTypeConfig, DatabaseTypesConfig } from '../config.js';

// ============================================================================
// Enhanced Validation Schemas
// ============================================================================

export const SpacesConnSchema = z.object({
  endpoint: z.string().url('Invalid S3 endpoint URL'),
  region: z.string().min(1, 'Region is required'),
  accessKey: z.string().min(1, 'Access key is required'),
  secretKey: z.string().min(1, 'Secret key is required'),
  backupsBucket: z.string().min(1, 'Backups bucket is required'),
  jsonBucket: z.string().min(1, 'JSON bucket is required'),
  contentBucket: z.string().min(1, 'Content bucket is required'),
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

// Enhanced Multi-Tenant Validation Schemas
export const DatabaseConnectionSchema = z.object({
  key: z.string().min(1, 'Database connection key is required'),
  mongoUri: z.string().min(1, 'MongoDB URI is required'),
  dbName: z.string().min(1, 'Database name is required'),
  extIdentifier: z.string().optional(),
});

export const DatabaseTypeConfigSchema = z.object({
  generic: DatabaseConnectionSchema,
  domains: z.array(DatabaseConnectionSchema).default([]),
  tenants: z.array(DatabaseConnectionSchema).default([]),
});

export const DatabaseTypesConfigSchema = z.object({
  metadata: DatabaseTypeConfigSchema.optional(),
  knowledge: DatabaseTypeConfigSchema.optional(),
  runtime: DatabaseTypeConfigSchema.optional(),
});

export const ChronosConfigSchema = z.object({
  mongoUris: z.array(z.string().min(1, 'MongoDB URI cannot be empty')).min(1, 'At least one MongoDB URI is required').max(10, 'Maximum 10 MongoDB URIs allowed'),
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
  // Validate that either spacesConns or localStorage is provided
  if (!cfg.spacesConns && !cfg.localStorage?.enabled) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'Either spacesConns or localStorage must be configured.' 
    });
  }
  
  // Validate MongoDB URIs and S3 connections length match (if both provided)
  if (cfg.spacesConns && cfg.spacesConns.length > 0 && cfg.mongoUris.length !== cfg.spacesConns.length) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: `MongoDB URIs (${cfg.mongoUris.length}) and S3 connections (${cfg.spacesConns.length}) must have equal length (1–10 backends).` 
    });
  }
});

export const EnhancedChronosConfigSchema = z.object({
  mongoUris: z.array(z.string().min(1, 'MongoDB URI cannot be empty')).min(1, 'At least one MongoDB URI is required').max(10, 'Maximum 10 MongoDB URIs allowed'),
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
  databaseTypes: DatabaseTypesConfigSchema.optional(),
}).superRefine((cfg, ctx) => {
  // Validate that either spacesConns or localStorage is provided
  if (!cfg.spacesConns && !cfg.localStorage?.enabled) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: 'Either spacesConns or localStorage must be configured.' 
    });
  }
  
  // Validate MongoDB URIs and S3 connections length match (if both provided)
  if (cfg.spacesConns && cfg.spacesConns.length > 0 && cfg.mongoUris.length !== cfg.spacesConns.length) {
    ctx.addIssue({ 
      code: z.ZodIssueCode.custom, 
      message: `MongoDB URIs (${cfg.mongoUris.length}) and S3 connections (${cfg.spacesConns.length}) must have equal length (1–10 backends).` 
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
 * Validate Enhanced Chronos configuration with multi-tenant support
 * @param cfg - Configuration to validate
 * @returns Validated configuration
 * @throws Error with redacted secrets if validation fails
 */
export function validateEnhancedConfig(cfg: unknown): EnhancedChronosConfig {
  try {
    return EnhancedChronosConfigSchema.parse(cfg) as EnhancedChronosConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const redactedError = redactSecrets(error);
      throw new Error(`Enhanced configuration validation failed:\n${formatZodError(redactedError)}`);
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

/**
 * Validate database connection configuration
 * @param connection - Database connection to validate
 * @returns Validated database connection
 */
export function validateDatabaseConnection(connection: unknown): DatabaseConnection {
  try {
    return DatabaseConnectionSchema.parse(connection) as DatabaseConnection;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Database connection validation failed:\n${formatZodError(error)}`);
    }
    throw error;
  }
}

/**
 * Validate database type configuration
 * @param dbType - Database type config to validate
 * @returns Validated database type config
 */
export function validateDatabaseTypeConfig(dbType: unknown): DatabaseTypeConfig {
  try {
    return DatabaseTypeConfigSchema.parse(dbType) as DatabaseTypeConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Database type configuration validation failed:\n${formatZodError(error)}`);
    }
    throw error;
  }
}

/**
 * Validate database types configuration
 * @param dbTypes - Database types config to validate
 * @returns Validated database types config
 */
export function validateDatabaseTypesConfig(dbTypes: unknown): DatabaseTypesConfig {
  try {
    return DatabaseTypesConfigSchema.parse(dbTypes) as DatabaseTypesConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Database types configuration validation failed:\n${formatZodError(error)}`);
    }
    throw error;
  }
}
