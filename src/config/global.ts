import type { XronoxConfig } from '../config.js';

/**
 * Global configuration storage for access throughout the application
 */
let globalXronoxConfig: XronoxConfig | null = null;

/**
 * Set the global configuration
 * @param config - Configuration to store globally
 */
export function setGlobalConfig(config: XronoxConfig): void {
  globalXronoxConfig = config;
}

/**
 * Get the global configuration
 * @returns Current global configuration or null
 */
export function getGlobalConfig(): XronoxConfig | null {
  return globalXronoxConfig;
}

/**
 * Check if transactions are enabled in the global configuration
 * @returns true if transactions are enabled
 */
export function isTransactionEnabled(): boolean {
  return globalXronoxConfig?.transactions?.enabled === true;
}

/**
 * Get transaction configuration from global config
 * @returns Transaction configuration or default
 */
export function getTransactionConfig(): { enabled?: boolean; autoDetect?: boolean } {
  return globalXronoxConfig?.transactions || { enabled: true, autoDetect: true };
}

/**
 * Clear the global configuration (useful for testing)
 */
export function clearGlobalConfig(): void {
  globalXronoxConfig = null;
}
