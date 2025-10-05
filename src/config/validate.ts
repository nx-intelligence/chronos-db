import { z } from 'zod';
import type { UdmConfig } from '../config.js';

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

export const ChronosConfigSchema = z.object({
  mongoUris: z.array(z.string().min(1, 'MongoDB URI cannot be empty')).min(1, 'At least one MongoDB URI is required').max(10, 'Maximum 10 MongoDB URIs allowed'),
  spacesConns: z.array(SpacesConnSchema).min(1, 'At least one S3 connection is required').max(10, 'Maximum 10 S3 connections allowed'),
  counters: z.object({ 
    mongoUri: z.string().min(1, 'Counters MongoDB URI is required'), 
    dbName: z.string().min(1, 'Counters database name is required') 
  }),
  routing: RoutingSchema.default({ hashAlgo: 'rendezvous' }),
  retention: RetentionSchema.default({}),
  rollup: z.any().optional(),
  collectionMaps: z.record(CollectionMapSchema).min(1, 'At least one collection map is required'),
  counterRules: CountersRulesSchema.optional(),
  devShadow: z.object({
    enabled: z.boolean(),
    ttlHours: z.number().int().positive('TTL hours must be positive'),
    maxBytesPerDoc: z.number().int().positive('Max bytes per document must be positive').optional(),
  }).optional(),
  hardDeleteEnabled: z.boolean().optional(),
}).superRefine((cfg, ctx) => {
  if (cfg.mongoUris.length !== cfg.spacesConns.length) {
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
 * Validate UDM configuration with enhanced error messages
 * @param cfg - Configuration to validate
 * @returns Validated configuration
 * @throws Error with redacted secrets if validation fails
 */
export function validateConfig(cfg: unknown): UdmConfig {
  try {
    return UdmConfigSchema.parse(cfg);
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
