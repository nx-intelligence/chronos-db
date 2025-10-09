/**
 * Custom error classes for Xronox configuration loading and validation
 */

// ============================================================================
// Base Error Class
// ============================================================================

export class XronoxError extends Error {
  public readonly code: string;
  public readonly context: Record<string, any> | undefined;

  constructor(code: string, message: string, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

// ============================================================================
// Configuration File Errors
// ============================================================================

/**
 * Thrown when no configuration file is found and no config argument provided
 */
export class XronoxConfigNotFoundError extends XronoxError {
  constructor(searchPaths: string[]) {
    super(
      'XRONOX_CONFIG_NOT_FOUND',
      `No Xronox configuration found. Searched paths: ${searchPaths.join(', ')}. ` +
      `Either provide config to initXronox(config) or create one of: xronox.config.json, .xronox.json`,
      { searchPaths }
    );
  }
}

/**
 * Thrown when config file exists but contains invalid JSON
 */
export class XronoxConfigParseError extends XronoxError {
  constructor(filePath: string, parseError: Error) {
    super(
      'XRONOX_CONFIG_PARSE_ERROR',
      `Failed to parse Xronox configuration file at '${filePath}': ${parseError.message}`,
      { filePath, originalError: parseError.message }
    );
  }
}

/**
 * Thrown when an environment variable referenced in config is missing
 */
export class XronoxEnvVarMissingError extends XronoxError {
  constructor(varName: string, jsonPath: string, filePath?: string) {
    const location = filePath ? ` in file '${filePath}'` : '';
    super(
      'XRONOX_ENV_VAR_MISSING',
      `Environment variable '${varName}' is required but not set${location}. ` +
      `Referenced at JSON path: ${jsonPath}. ` +
      `Please set ${varName} in your environment before starting the application.`,
      { varName, jsonPath, filePath }
    );
  }
}

/**
 * Thrown when configuration fails schema validation
 */
export class XronoxConfigValidationError extends XronoxError {
  constructor(validationErrors: string[], filePath?: string) {
    const location = filePath ? ` from file '${filePath}'` : '';
    super(
      'XRONOX_CONFIG_VALIDATION_ERROR',
      `Xronox configuration validation failed${location}:\n${validationErrors.join('\n')}`,
      { validationErrors, filePath }
    );
  }
}

/**
 * Thrown when config file structure is invalid (missing xronox key)
 */
export class XronoxConfigStructureError extends XronoxError {
  constructor(filePath: string, issue: string) {
    super(
      'XRONOX_CONFIG_STRUCTURE_ERROR',
      `Invalid Xronox configuration file structure at '${filePath}': ${issue}`,
      { filePath, issue }
    );
  }
}

