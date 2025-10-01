import { createHash } from 'crypto';

// ============================================================================
// Hashing Utilities
// ============================================================================

/**
 * Create a deterministic hash of a string using SHA-256
 * @param input - String to hash
 * @returns 32-bit integer hash
 */
function hashString(input: string): number {
  const hash = createHash('sha256');
  hash.update(input, 'utf8');
  const digest = hash.digest('hex');
  
  // Take first 8 characters (32 bits) and convert to integer
  return parseInt(digest.substring(0, 8), 16);
}

/**
 * Create a 64-bit hash by combining two 32-bit hashes
 * @param input - String to hash
 * @returns 64-bit integer hash
 */
function hashString64(input: string): bigint {
  const hash = createHash('sha256');
  hash.update(input, 'utf8');
  const digest = hash.digest('hex');
  
  // Take first 16 characters (64 bits) and convert to BigInt
  return BigInt('0x' + digest.substring(0, 16));
}

// ============================================================================
// Rendezvous (HRW) Hashing
// ============================================================================

/**
 * Pick the backend index using Rendezvous (Highest Random Weight) hashing
 * @param key - Routing key
 * @param backendIds - Array of backend identifiers
 * @returns Index of the selected backend (0-based)
 */
export function pickIndexHRW(key: string, backendIds: string[]): number {
  if (backendIds.length === 0) {
    throw new Error('No backends available for routing');
  }
  
  if (backendIds.length === 1) {
    return 0;
  }
  
  let maxScore = 0n;
  let selectedIndex = 0;
  
  for (let i = 0; i < backendIds.length; i++) {
    const backendId = backendIds[i];
    const combinedKey = `${key}|${backendId}`;
    const score = hashString64(combinedKey);
    
    if (score > maxScore) {
      maxScore = score;
      selectedIndex = i;
    }
  }
  
  return selectedIndex;
}

/**
 * Pick the backend index using 32-bit HRW hashing (faster, less collision-resistant)
 * @param key - Routing key
 * @param backendIds - Array of backend identifiers
 * @returns Index of the selected backend (0-based)
 */
export function pickIndexHRW32(key: string, backendIds: string[]): number {
  if (backendIds.length === 0) {
    throw new Error('No backends available for routing');
  }
  
  if (backendIds.length === 1) {
    return 0;
  }
  
  let maxScore = 0;
  let selectedIndex = 0;
  
  for (let i = 0; i < backendIds.length; i++) {
    const backendId = backendIds[i];
    const combinedKey = `${key}|${backendId}`;
    const score = hashString(combinedKey);
    
    if (score > maxScore) {
      maxScore = score;
      selectedIndex = i;
    }
  }
  
  return selectedIndex;
}

// ============================================================================
// Jump Consistent Hashing (Optional)
// ============================================================================

/**
 * Jump consistent hash implementation
 * @param key - Routing key
 * @param numBuckets - Number of buckets (backends)
 * @returns Bucket index (0-based)
 */
export function jumpHash(key: string, numBuckets: number): number {
  if (numBuckets <= 0) {
    throw new Error('Number of buckets must be positive');
  }
  
  if (numBuckets === 1) {
    return 0;
  }
  
  // Create a numeric key from the string
  const keyHash = hashString(key);
  const keyNum = Math.abs(keyHash);
  
  let b = -1;
  let j = 0;
  
  while (j < numBuckets) {
    b = j;
    const r = (keyNum * (j + 1)) >>> 32; // 32-bit unsigned right shift
    j = Math.floor(((b + 1) * (1 << 31)) / (r + 1));
  }
  
  return b;
}

// ============================================================================
// Routing Key Generation
// ============================================================================

/**
 * Generate a routing key from context using the default strategy
 * @param context - Routing context
 * @returns Generated routing key
 */
export function generateRoutingKey(context: {
  tenantId?: string;
  dbName: string;
  collection: string;
  objectId?: string;
}): string {
  // Default priority: tenantId > dbName > collection:objectId
  if (context.tenantId) {
    return context.tenantId;
  }
  
  if (context.dbName) {
    return context.dbName;
  }
  
  return `${context.collection}:${context.objectId ?? ''}`;
}

/**
 * Parse a routing key DSL string and generate key from context
 * @param dsl - DSL string like "tenantId|dbName|collection:objectId"
 * @param context - Routing context
 * @returns Generated routing key
 */
export function generateRoutingKeyFromDSL(
  dsl: string,
  context: {
    tenantId?: string;
    dbName: string;
    collection: string;
    objectId?: string;
  }
): string {
  const parts = dsl.split('|');
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    switch (trimmed) {
      case 'tenantId':
        if (context.tenantId) return context.tenantId;
        break;
      case 'dbName':
        if (context.dbName) return context.dbName;
        break;
      case 'collection:objectId':
        return `${context.collection}:${context.objectId ?? ''}`;
      case 'collection':
        if (context.collection) return context.collection;
        break;
      case 'objectId':
        if (context.objectId) return context.objectId;
        break;
      default:
        // Custom field access (e.g., "user.tenantId")
        if (trimmed.includes('.')) {
          const [obj, field] = trimmed.split('.', 2);
          // This would need to be implemented based on your context structure
          // For now, just use the field name
          if (context[field as keyof typeof context]) {
            return String(context[field as keyof typeof context]);
          }
        }
        break;
    }
  }
  
  // Fallback to default strategy
  return generateRoutingKey(context);
}

// ============================================================================
// Distribution Analysis (for testing)
// ============================================================================

/**
 * Analyze distribution of keys across backends
 * @param keys - Array of routing keys
 * @param backendIds - Array of backend identifiers
 * @param hashFunction - Hash function to use (default: pickIndexHRW)
 * @returns Distribution analysis
 */
export function analyzeDistribution(
  keys: string[],
  backendIds: string[],
  hashFunction: (key: string, backendIds: string[]) => number = pickIndexHRW
): {
  totalKeys: number;
  backendCount: number;
  distribution: Record<number, number>;
  minKeys: number;
  maxKeys: number;
  avgKeys: number;
  stdDev: number;
  isBalanced: boolean;
} {
  const distribution: Record<number, number> = {};
  
  // Initialize distribution
  for (let i = 0; i < backendIds.length; i++) {
    distribution[i] = 0;
  }
  
  // Distribute keys
  for (const key of keys) {
    const index = hashFunction(key, backendIds);
    distribution[index]++;
  }
  
  const counts = Object.values(distribution);
  const totalKeys = keys.length;
  const backendCount = backendIds.length;
  const minKeys = Math.min(...counts);
  const maxKeys = Math.max(...counts);
  const avgKeys = totalKeys / backendCount;
  
  // Calculate standard deviation
  const variance = counts.reduce((sum, count) => sum + Math.pow(count - avgKeys, 2), 0) / backendCount;
  const stdDev = Math.sqrt(variance);
  
  // Consider balanced if standard deviation is less than 20% of average
  const isBalanced = stdDev < (avgKeys * 0.2);
  
  return {
    totalKeys,
    backendCount,
    distribution,
    minKeys,
    maxKeys,
    avgKeys,
    stdDev,
    isBalanced,
  };
}
