/**
 * Configuration File Discovery and Loading
 * 
 * Discovers and loads Xronox configuration from JSON files with ENV token resolution.
 */

import * as fs from 'fs';
import * as path from 'path';
import { XronoxConfigNotFoundError, XronoxConfigParseError, XronoxConfigStructureError } from './errors.js';
import { resolveEnvTokens, type EnvResolutionOptions } from './envResolver.js';
import { logger } from '../utils/logger.js';
import type { XronoxConfig } from '../config.js';

// ============================================================================
// Configuration File Names
// ============================================================================

const CONFIG_FILE_NAMES = [
  'xronox.config.json',
  '.xronox.json',
];

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Find package.json by walking up directory tree
 * Used for monorepo support
 */
function findPackageRoot(startDir: string): string | null {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Discover configuration file in project
 * 
 * Search order:
 * 1. process.cwd()
 * 2. Nearest package root (for monorepo support)
 * 
 * @returns Path to config file or null if not found
 */
export function discoverConfigFile(): { filePath: string; fileName: string } | null {
  const searchPaths: string[] = [];
  
  // 1. Check current working directory
  const cwd = process.cwd();
  searchPaths.push(cwd);
  
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(cwd, fileName);
    if (fs.existsSync(filePath)) {
      logger.debug(`Found Xronox config file: ${filePath}`);
      return { filePath, fileName };
    }
  }
  
  // 2. Check nearest package root (monorepo support)
  const packageRoot = findPackageRoot(cwd);
  if (packageRoot && packageRoot !== cwd) {
    searchPaths.push(packageRoot);
    
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = path.join(packageRoot, fileName);
      if (fs.existsSync(filePath)) {
        logger.debug(`Found Xronox config file in package root: ${filePath}`);
        return { filePath, fileName };
      }
    }
  }
  
  logger.debug(`No Xronox config file found in search paths: ${searchPaths.join(', ')}`);
  return null;
}

// ============================================================================
// Configuration Loading
// ============================================================================

export interface LoadConfigOptions {
  /** Verbose logging */
  verbose?: boolean;
  /** Validate after loading */
  validate?: boolean;
}

export interface LoadConfigResult {
  /** Loaded and resolved configuration */
  config: XronoxConfig;
  /** Path to the config file that was loaded */
  filePath: string;
  /** List of resolved environment variables */
  resolvedVars: string[];
  /** Warnings generated during loading */
  warnings: string[];
}

/**
 * Load configuration from a specific file
 * 
 * @param filePath - Path to configuration file
 * @param options - Loading options
 * @returns Loaded configuration with ENV tokens resolved
 * @throws {XronoxConfigParseError} If JSON is invalid
 * @throws {XronoxConfigStructureError} If config structure is invalid
 * @throws {XronoxEnvVarMissingError} If ENV variable is missing
 */
export function loadConfigFromFile(
  filePath: string,
  options: LoadConfigOptions = {}
): LoadConfigResult {
  logger.info(`Loading Xronox configuration from: ${filePath}`);

  // 1. Read file
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read config file '${filePath}': ${(error as Error).message}`);
  }

  // 2. Parse JSON
  let rawConfig: any;
  try {
    rawConfig = JSON.parse(fileContent);
  } catch (error) {
    throw new XronoxConfigParseError(filePath, error as Error);
  }

  // 3. Validate structure (must have "xronox" key)
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new XronoxConfigStructureError(
      filePath,
      'Config file must be a JSON object'
    );
  }

  if (!rawConfig.xronox) {
    throw new XronoxConfigStructureError(
      filePath,
      'Config file must have a top-level "xronox" key containing the configuration'
    );
  }

  // 4. Resolve ENV tokens
  const envOptions: EnvResolutionOptions = options.verbose 
    ? { filePath, verbose: true }
    : { filePath };

  const { config: resolvedConfig, resolvedVars, warnings } = resolveEnvTokens(
    rawConfig.xronox,
    envOptions,
    '$.xronox'
  );

  // 5. Log summary
  logger.info('Xronox configuration loaded successfully', {
    filePath,
    resolvedEnvVars: resolvedVars.length,
    warnings: warnings.length,
  });

  if (warnings.length > 0 && options.verbose) {
    warnings.forEach(warning => logger.warn(warning));
  }

  return {
    config: resolvedConfig as XronoxConfig,
    filePath,
    resolvedVars,
    warnings,
  };
}

/**
 * Auto-discover and load configuration file
 * 
 * @param options - Loading options
 * @returns Loaded configuration
 * @throws {XronoxConfigNotFoundError} If no config file found
 */
export function autoLoadConfig(options: LoadConfigOptions = {}): LoadConfigResult {
  const discovered = discoverConfigFile();

  if (!discovered) {
    const cwd = process.cwd();
    const packageRoot = findPackageRoot(cwd);
    const searchPaths = packageRoot && packageRoot !== cwd 
      ? [cwd, packageRoot]
      : [cwd];
    
    throw new XronoxConfigNotFoundError(
      searchPaths.map(p => 
        CONFIG_FILE_NAMES.map(f => path.join(p, f))
      ).flat()
    );
  }

  return loadConfigFromFile(discovered.filePath, options);
}

/**
 * Load configuration from file or use provided config
 * This is the main entry point for configuration loading
 * 
 * @param providedConfig - Optional explicitly provided configuration
 * @param options - Loading options
 * @returns Configuration object and metadata
 */
export function loadConfig(
  providedConfig?: Partial<XronoxConfig>,
  options: LoadConfigOptions = {}
): { config: XronoxConfig; source: 'provided' | 'file'; filePath?: string; resolvedVars?: string[] } {
  // If config provided explicitly, use it
  if (providedConfig) {
    logger.debug('Using explicitly provided Xronox configuration');
    return {
      config: providedConfig as XronoxConfig,
      source: 'provided',
    };
  }

  // Auto-discover and load from file
  logger.debug('No config provided, attempting auto-discovery');
  const result = autoLoadConfig(options);
  
  return {
    config: result.config,
    source: 'file',
    filePath: result.filePath,
    resolvedVars: result.resolvedVars,
  };
}

