/**
 * Dynamic Tenant Support for Xronox
 * 
 * Enables on-demand tenant creation with automatic database naming,
 * eliminating the need to pre-configure all tenants.
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Validation rules for tenant IDs
 */
export interface TenantValidationRules {
  /** Regex pattern for tenant ID */
  pattern?: string;
  /** Minimum length */
  minLength?: number;
  /** Maximum length */
  maxLength?: number;
  /** Allowed characters (regex character class) */
  allowedChars?: string;
}

/**
 * Tier-specific configuration for dynamic tenants
 */
export interface DynamicTenantTierConfig {
  /** MongoDB connection reference */
  dbConnRef: string;
  /** S3/Spaces connection reference */
  spaceConnRef?: string;
  /** Bucket name template with {placeholders} */
  bucketTemplate?: string;
  /** Multi-bucket templates */
  recordsBucketTemplate?: string;
  versionsBucketTemplate?: string;
  contentBucketTemplate?: string;
  backupsBucketTemplate?: string;
  /** Database name template with {placeholders} */
  dbNameTemplate: string;
  /** Analytics database name template (for runtime only) */
  analyticsDbNameTemplate?: string;
}

/**
 * Dynamic tenant configuration
 */
export interface DynamicTenantsConfig extends DynamicTenantTierConfig {
  /** Enable dynamic tenant support */
  enabled: boolean;
  /** Auto-create database on first use (default: true) */
  autoCreate?: boolean;
  /** Cache generated configs for N seconds (default: 3600) */
  cacheExpiry?: number;
  /** Maximum number of cached tenant configs (default: 10000) */
  maxCacheSize?: number;
  /** Tenant tier configurations */
  tiers?: Record<string, DynamicTenantTierConfig>;
  /** Validation rules for tenant IDs */
  validation?: TenantValidationRules;
}

// ============================================================================
// Template Engine
// ============================================================================

export class TemplateEngine {
  /**
   * Resolve template with variables
   * 
   * @example
   * resolveTemplate('xronox-{tier}-{tenantId}', { 
   *   tier: 'premium', 
   *   tenantId: 'customer-123' 
   * })
   * // Returns: 'xronox-premium-customer-123'
   */
  static resolveTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    return template.replace(/\{(\w+)\}/g, (_match, key) => {
      if (!(key in variables)) {
        throw new Error(
          `Template variable {${key}} not provided. Available: ${Object.keys(variables).join(', ')}`
        );
      }
      const value = variables[key];
      if (value === undefined) {
        throw new Error(`Template variable {${key}} is undefined`);
      }
      return value;
    });
  }

  /**
   * Extract template variables from a template string
   */
  static extractTemplateVars(template: string): string[] {
    const vars: string[] = [];
    const regex = /\{(\w+)\}/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      const varName = match[1];
      if (varName && !vars.includes(varName)) {
        vars.push(varName);
      }
    }
    return vars;
  }

  /**
   * Validate tenant ID against rules
   */
  static validateTenantId(
    tenantId: string,
    rules?: TenantValidationRules
  ): void {
    if (!rules) return;

    if (rules.minLength !== undefined && tenantId.length < rules.minLength) {
      throw new Error(
        `Tenant ID '${tenantId}' must be at least ${rules.minLength} characters`
      );
    }

    if (rules.maxLength !== undefined && tenantId.length > rules.maxLength) {
      throw new Error(
        `Tenant ID '${tenantId}' must not exceed ${rules.maxLength} characters`
      );
    }

    if (rules.pattern) {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(tenantId)) {
        throw new Error(
          `Tenant ID '${tenantId}' does not match required pattern: ${rules.pattern}`
        );
      }
    }

    if (rules.allowedChars) {
      const regex = new RegExp(`^[${rules.allowedChars}]+$`);
      if (!regex.test(tenantId)) {
        throw new Error(
          `Tenant ID '${tenantId}' contains invalid characters. Allowed: [${rules.allowedChars}]`
        );
      }
    }
  }

  /**
   * Prepare template variables from context
   */
  static prepareVariables(
    tenantId: string,
    options?: {
      tier?: string;
      meta?: Record<string, string>;
    }
  ): Record<string, string> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timestamp = dateStr ? dateStr.replace(/-/g, '') : ''; // YYYYMMDD

    return {
      tenantId,
      tier: options?.tier || 'default',
      timestamp,
      env: process.env['NODE_ENV'] || 'production',
      region: process.env['AWS_REGION'] || process.env['S3_REGION'] || 'us-east-1',
      ...options?.meta,
    };
  }
}

// ============================================================================
// Tenant Config Cache
// ============================================================================

interface CachedTenantConfig {
  config: any;
  timestamp: number;
}

export class TenantConfigCache {
  private cache: Map<string, CachedTenantConfig> = new Map();
  private readonly maxSize: number;
  private readonly expiryMs: number;

  constructor(maxSize: number = 10000, expirySeconds: number = 3600) {
    this.maxSize = maxSize;
    this.expiryMs = expirySeconds * 1000;
  }

  /**
   * Get cached tenant config
   */
  get(cacheKey: string): any | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    // Check expiry
    const age = Date.now() - cached.timestamp;
    if (age > this.expiryMs) {
      this.cache.delete(cacheKey);
      logger.debug(`Tenant config cache expired: ${cacheKey}`);
      return null;
    }

    logger.debug(`Tenant config cache hit: ${cacheKey}`);
    return cached.config;
  }

  /**
   * Set tenant config in cache
   */
  set(cacheKey: string, config: any): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug(`Evicted oldest tenant config from cache: ${oldestKey}`);
      }
    }

    this.cache.set(cacheKey, {
      config,
      timestamp: Date.now(),
    });

    logger.debug(`Cached tenant config: ${cacheKey}`);
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.expiryMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired tenant configs from cache`);
    }
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug(`Cleared ${size} tenant configs from cache`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// ============================================================================
// Dynamic Tenant Resolver
// ============================================================================

export class DynamicTenantResolver {
  private cache: TenantConfigCache;

  constructor(
    maxCacheSize: number = 10000,
    cacheExpirySeconds: number = 3600
  ) {
    this.cache = new TenantConfigCache(maxCacheSize, cacheExpirySeconds);
  }

  /**
   * Resolve tenant configuration (static or dynamic)
   * 
   * @param tenantId - Tenant identifier
   * @param staticTenants - Pre-configured static tenants
   * @param dynamicConfig - Dynamic tenant configuration
   * @param options - Tenant options (tier, metadata)
   * @returns Resolved tenant configuration
   */
  resolve(
    tenantId: string,
    staticTenants: any[],
    dynamicConfig: DynamicTenantsConfig | undefined,
    options?: {
      tier?: string;
      meta?: Record<string, string>;
    }
  ): any {
    // 1. Check static configuration first (highest priority)
    const staticConfig = staticTenants?.find(t => t.tenantId === tenantId);
    if (staticConfig) {
      logger.debug(`Using static tenant configuration for: ${tenantId}`);
      return staticConfig;
    }

    // 2. Check if dynamic tenants are enabled
    if (!dynamicConfig?.enabled) {
      throw new Error(
        `Tenant '${tenantId}' not found in static configuration ` +
        `and dynamic tenants are not enabled. ` +
        `Either add the tenant to tenantDatabases or enable dynamicTenants.`
      );
    }

    // 3. Check cache
    const cacheKey = `${tenantId}:${options?.tier || 'default'}:${JSON.stringify(options?.meta || {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 4. Validate tenant ID
    TemplateEngine.validateTenantId(tenantId, dynamicConfig.validation);

    // 5. Select tier configuration (use tier if specified, otherwise use default from dynamicConfig)
    const tierConfig = (options?.tier && dynamicConfig.tiers?.[options.tier])
      ? dynamicConfig.tiers[options.tier]
      : dynamicConfig; // DynamicTenantsConfig extends DynamicTenantTierConfig
    
    if (!tierConfig) {
      throw new Error('Tier configuration is required');
    }

    // 6. Prepare template variables
    const variables = TemplateEngine.prepareVariables(tenantId, options);

    // 7. Resolve templates
    const config: any = {
      tenantId,
      dbConnRef: tierConfig.dbConnRef,
    };

    // Add spaceConnRef if provided
    if (tierConfig.spaceConnRef) {
      config.spaceConnRef = tierConfig.spaceConnRef;
    }

    // Resolve bucket templates (legacy single bucket)
    if (tierConfig.bucketTemplate) {
      config.bucket = TemplateEngine.resolveTemplate(tierConfig.bucketTemplate, variables);
    }

    // Resolve multi-bucket templates
    if (tierConfig.recordsBucketTemplate) {
      config.recordsBucket = TemplateEngine.resolveTemplate(tierConfig.recordsBucketTemplate, variables);
    }
    if (tierConfig.versionsBucketTemplate) {
      config.versionsBucket = TemplateEngine.resolveTemplate(tierConfig.versionsBucketTemplate, variables);
    }
    if (tierConfig.contentBucketTemplate) {
      config.contentBucket = TemplateEngine.resolveTemplate(tierConfig.contentBucketTemplate, variables);
    }
    if (tierConfig.backupsBucketTemplate) {
      config.backupsBucket = TemplateEngine.resolveTemplate(tierConfig.backupsBucketTemplate, variables);
    }

    // Resolve database name
    config.dbName = TemplateEngine.resolveTemplate(tierConfig.dbNameTemplate, variables);

    // Resolve analytics database name (for runtime)
    if (tierConfig.analyticsDbNameTemplate) {
      config.analyticsDbName = TemplateEngine.resolveTemplate(
        tierConfig.analyticsDbNameTemplate,
        variables
      );
    }

    logger.info(`Generated dynamic tenant configuration for: ${tenantId}`, {
      tier: options?.tier || 'default',
      dbName: config.dbName,
      cached: false,
    });

    // 8. Cache the generated config
    this.cache.set(cacheKey, config);

    return config;
  }

  /**
   * Clear cache for a specific tenant (e.g., after tenant deletion)
   */
  invalidate(tenantId: string): void {
    let deleted = 0;
    for (const key of this.cache['cache'].keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.cache['cache'].delete(key);
        deleted++;
      }
    }
    logger.debug(`Invalidated ${deleted} cached configs for tenant: ${tenantId}`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    this.cache.cleanup();
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
  }
}

