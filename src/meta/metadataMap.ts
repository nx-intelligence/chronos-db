import type { CollectionMap } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export interface ValidationError extends Error {
  code: 'VALIDATION_ERROR';
  field?: string;
  value?: unknown;
}

// ============================================================================
// Metadata Extraction
// ============================================================================

/**
 * Extract indexed properties from data according to collection map
 * @param data - Input data object
 * @param map - Collection map configuration
 * @returns Object containing only indexed properties
 */
export function extractIndexed(
  data: Record<string, unknown>,
  map: CollectionMap
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const propPath of map.indexedProps) {
    const value = getNestedValue(data, propPath);
    if (value !== undefined) {
      setNestedValue(result, propPath, value);
    }
  }
  
  return result;
}

/**
 * Validate that required indexed fields are present
 * @param data - Input data object
 * @param map - Collection map configuration
 * @throws ValidationError if required fields are missing
 */
export function validateRequiredIndexed(
  data: Record<string, unknown>,
  map: CollectionMap
): void {
  if (!map.validation?.requiredIndexed) {
    return;
  }
  
  for (const requiredPath of map.validation.requiredIndexed) {
    const value = getNestedValue(data, requiredPath);
    if (value === undefined || value === null || value === '') {
      const error = new Error(`Required indexed field '${requiredPath}' is missing or empty`) as ValidationError;
      error.code = 'VALIDATION_ERROR';
      error.field = requiredPath;
      error.value = value;
      throw error;
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get nested value from object using dot notation or array notation
 * @param obj - Source object
 * @param path - Property path (e.g., "address.city" or "tags[]")
 * @returns Value at path or undefined
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = parsePath(path);
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object' || !part) {
      return undefined;
    }
    
    if (Array.isArray(current)) {
      if (part === '[]') {
        // Return the array itself for array notation
        return current;
      } else {
        // Access array element by index
        const index = parseInt(part, 10);
        if (isNaN(index)) {
          return undefined;
        }
        current = current[index];
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  
  return current;
}

/**
 * Set nested value in object using dot notation
 * @param obj - Target object
 * @param path - Property path (e.g., "address.city" or "tags[]")
 * @param value - Value to set
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = parsePath(path);
  let current: Record<string, unknown> = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    if (!part || part === '[]') {
      // This shouldn't happen in the middle of a path
      continue;
    }
    
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    
    current = current[part] as Record<string, unknown>;
  }
  
  const lastPart = parts[parts.length - 1];
  if (lastPart === '[]') {
    // For array notation, set the value directly
    current[path.replace('[]', '')] = value;
  } else if (lastPart) {
    current[lastPart] = value;
  }
}

/**
 * Parse property path into parts
 * @param path - Property path string
 * @returns Array of path parts
 */
function parsePath(path: string): string[] {
  // Handle array notation (e.g., "tags[]" -> ["tags", "[]"])
  if (path.endsWith('[]')) {
    const basePath = path.slice(0, -2);
    return basePath ? [...basePath.split('.'), '[]'] : ['[]'];
  }
  
  return path.split('.');
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a value is a valid base64 string
 * @param value - Value to check
 * @returns True if valid base64, false otherwise
 */
export function isValidBase64(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  
  // Check if string is valid base64
  try {
    const decoded = atob(value);
    const encoded = btoa(decoded);
    return encoded === value;
  } catch {
    return false;
  }
}

/**
 * Check if a value is a valid base64 string (Node.js compatible)
 * @param value - Value to check
 * @returns True if valid base64, false otherwise
 */
export function isValidBase64Node(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  
  // Check if string is valid base64
  try {
    const decoded = Buffer.from(value, 'base64');
    const encoded = decoded.toString('base64');
    return encoded === value;
  } catch {
    return false;
  }
}

/**
 * Validate base64 properties according to collection map
 * @param data - Input data object
 * @param map - Collection map configuration
 * @throws ValidationError if base64 properties are invalid
 */
export function validateBase64Properties(
  data: Record<string, unknown>,
  map: CollectionMap
): void {
  if (!map.base64Props) {
    return;
  }
  
  for (const [propPath] of Object.entries(map.base64Props)) {
    const value = getNestedValue(data, propPath);
    
    if (value !== undefined && value !== null) {
      if (!isValidBase64Node(value)) {
        const error = new Error(`Property '${propPath}' is not valid base64`) as ValidationError;
        error.code = 'VALIDATION_ERROR';
        error.field = propPath;
        error.value = value;
        throw error;
      }
    }
  }
}

/**
 * Get all base64 properties from data according to collection map
 * @param data - Input data object
 * @param map - Collection map configuration
 * @returns Object containing base64 properties and their configurations
 */
export function getBase64Properties(
  data: Record<string, unknown>,
  map: CollectionMap
): Array<{
  path: string;
  value: string;
  config: { contentType: string; preferredText?: boolean; textCharset?: string };
}> {
  if (!map.base64Props) {
    return [];
  }
  
  const result: Array<{
    path: string;
    value: string;
    config: { contentType: string; preferredText?: boolean; textCharset?: string };
  }> = [];
  
  for (const [propPath, config] of Object.entries(map.base64Props)) {
    const value = getNestedValue(data, propPath);
    
    if (value !== undefined && value !== null && typeof value === 'string') {
      result.push({
        path: propPath,
        value,
        config,
      });
    }
  }
  
  return result;
}

/**
 * Check if a string is safe for text rendition
 * @param text - Text to check
 * @param maxControlCharRatio - Maximum ratio of control characters (default: 0.05)
 * @returns True if safe for text rendition, false otherwise
 */
export function isSafeForTextRendition(
  text: string,
  maxControlCharRatio: number = 0.05
): boolean {
  if (text.length === 0) {
    return false;
  }
  
  let controlCharCount = 0;
  const allowedControlChars = ['\n', '\r', '\t'];
  
  for (const char of text) {
    if (char.charCodeAt(0) < 32 && !allowedControlChars.includes(char)) {
      controlCharCount++;
    }
  }
  
  const controlCharRatio = controlCharCount / text.length;
  return controlCharRatio <= maxControlCharRatio;
}

/**
 * Extract text from base64 content if safe
 * @param base64Value - Base64 encoded content
 * @param charset - Character encoding (default: 'utf-8')
 * @returns Decoded text if safe, null otherwise
 */
export function extractTextFromBase64(
  base64Value: string,
  charset: BufferEncoding = 'utf8'
): string | null {
  try {
    const buffer = Buffer.from(base64Value, 'base64');
    const text = buffer.toString(charset);
    
    if (isSafeForTextRendition(text)) {
      return text;
    }
    
    return null;
  } catch {
    return null;
  }
}
