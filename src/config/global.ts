import type { UdmConfig } from '../config.js';

/**
 * Global configuration storage for access throughout the application
 */
let globalChronosConfig: UdmConfig | null = null;

/**
 * Set the global configuration
 * @param config - Configuration to store globally
 */
export function setGlobalConfig(config: UdmConfig): void {
  globalChronosConfig = config;
}

/**
 * Get the global configuration
 * @returns Current global configuration or null
 */
export function getGlobalConfig(): UdmConfig | null {
  return globalChronosConfig;
}

/**
 * Check if transactions are enabled in the global configuration
 * @returns true if transactions are enabled
 */
export function isTransactionEnabled(): boolean {
  return globalChronosConfig?.transactions?.enabled === true;
}

/**
 * Get transaction configuration from global config
 * @returns Transaction configuration or default
 */
export function getTransactionConfig(): { enabled?: boolean; autoDetect?: boolean } {
  return globalChronosConfig?.transactions || { enabled: true, autoDetect: true };
}

/**
 * Clear the global configuration (useful for testing)
 */
export function clearGlobalConfig(): void {
  globalChronosConfig = null;
}
