/**
 * Environment Variable Token Resolution
 * 
 * Resolves ENV.VAR_NAME tokens in configuration objects.
 * Throws hard errors for missing variables (no defaults allowed).
 */

import { XronoxEnvVarMissingError } from './errors.js';

// ============================================================================
// ENV Token Pattern
// ============================================================================

const ENV_TOKEN_PATTERN = /^ENV\.([A-Z0-9_]+)$/;

/**
 * Check if a value is an ENV token
 */
function isEnvToken(value: any): boolean {
  return typeof value === 'string' && ENV_TOKEN_PATTERN.test(value);
}

/**
 * Extract environment variable name from token
 */
function extractVarName(token: string): string {
  const match = token.match(ENV_TOKEN_PATTERN);
  if (!match || !match[1]) {
    throw new Error(`Invalid ENV token format: ${token}`);
  }
  return match[1];
}

// ============================================================================
// Secret Detection
// ============================================================================

const SECRET_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /credential/i,
  /auth/i,
];

/**
 * Check if a field name suggests it contains sensitive data
 */
function isSecretField(fieldPath: string): boolean {
  return SECRET_FIELD_PATTERNS.some(pattern => pattern.test(fieldPath));
}

/**
 * Mask a secret value for logging
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '***';
  }
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

// ============================================================================
// ENV Token Resolution
// ============================================================================

export interface EnvResolutionOptions {
  /** Path to config file (for error messages) */
  filePath?: string;
  /** Whether to log resolved tokens (secrets will be masked) */
  verbose?: boolean;
}

export interface EnvResolutionResult {
  /** Resolved configuration object */
  config: any;
  /** List of resolved environment variables */
  resolvedVars: string[];
  /** Warnings (e.g., detected secrets) */
  warnings: string[];
}

/**
 * Recursively resolve ENV tokens in a configuration object
 * 
 * @param obj - Configuration object to resolve
 * @param options - Resolution options
 * @param currentPath - Current JSON path (for error reporting)
 * @returns Resolved configuration with ENV tokens replaced
 * @throws {XronoxEnvVarMissingError} If any ENV variable is missing
 */
export function resolveEnvTokens(
  obj: any,
  options: EnvResolutionOptions = {},
  currentPath: string = '$'
): EnvResolutionResult {
  const resolvedVars: string[] = [];
  const warnings: string[] = [];

  function resolve(value: any, path: string): any {
    // Null or undefined - pass through
    if (value === null || value === undefined) {
      return value;
    }

    // String - check for ENV token
    if (typeof value === 'string') {
      if (isEnvToken(value)) {
        const varName = extractVarName(value);
        if (!varName || varName === '') {
          throw new Error(`Invalid ENV token format: ${value} at path ${path}`);
        }

        const envValue = process.env[varName];
        
        // Strict validation: undefined or empty string both fail
        if (envValue === undefined || envValue === '') {
          throw new XronoxEnvVarMissingError(varName, path, options.filePath);
        }

        // Track resolved variable
        if (!resolvedVars.includes(varName)) {
          resolvedVars.push(varName);
        }

        // Log resolution (with masking for secrets)
        if (options.verbose) {
          const isSecret = isSecretField(path);
          const displayValue = isSecret ? maskSecret(envValue) : envValue;
          console.log(`[xronox] Resolved ENV.${varName} at ${path} = ${displayValue}`);
        }

        // Warn if secret field detected
        if (isSecretField(path)) {
          warnings.push(`Secret detected at ${path} - ensure proper security measures`);
        }

        return envValue;
      }
      
      // Regular string - return as-is
      return value;
    }

    // Array - resolve each element
    if (Array.isArray(value)) {
      return value.map((item, index) => resolve(item, `${path}[${index}]`));
    }

    // Object - resolve each property
    if (typeof value === 'object') {
      const resolved: any = {};
      for (const [key, val] of Object.entries(value)) {
        resolved[key] = resolve(val, `${path}.${key}`);
      }
      return resolved;
    }

    // Primitive types (number, boolean, etc.) - pass through
    return value;
  }

  const resolvedConfig = resolve(obj, currentPath);

  return {
    config: resolvedConfig,
    resolvedVars,
    warnings,
  };
}

/**
 * Validate that all required environment variables are set
 * (useful for pre-flight checks before loading config)
 */
export function validateRequiredEnvVars(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => {
    const value = process.env[varName];
    return value === undefined || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Please set these variables before starting the application.`
    );
  }
}

/**
 * Extract all ENV tokens from a config object (without resolving)
 * Useful for documentation or validation
 */
export function extractEnvTokens(obj: any, currentPath: string = '$'): Array<{ varName: string; path: string }> {
  const tokens: Array<{ varName: string; path: string }> = [];

  function extract(value: any, path: string): void {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'string' && isEnvToken(value)) {
      const varName = extractVarName(value);
      if (varName) {
        tokens.push({ varName, path });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => extract(item, `${path}[${index}]`));
    } else if (typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        extract(val, `${path}.${key}`);
      }
    }
  }

  extract(obj, currentPath);
  return tokens;
}

/**
 * Mask secrets in an object for safe logging
 */
export function maskSecretsInObject(obj: any, currentPath: string = '$'): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return isSecretField(currentPath) ? maskSecret(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) => maskSecretsInObject(item, `${currentPath}[${index}]`));
  }

  if (typeof obj === 'object') {
    const masked: any = {};
    for (const [key, value] of Object.entries(obj)) {
      masked[key] = maskSecretsInObject(value, `${currentPath}.${key}`);
    }
    return masked;
  }

  return obj;
}

