/**
 * Deep merge utility for Chronos-DB record objects
 * Merges data properties from multiple tiers (generic -> domain -> tenant)
 */

export interface RecordMergeOptions {
  /** When true, remove duplicates from arrays. Default: true */
  dedupeArrays?: boolean;
  /** When true, preserve existing values and only add new properties. Default: false */
  preserveExisting?: boolean;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && 
  typeof v === 'object' && 
  !Array.isArray(v) &&
  Object.prototype.toString.call(v) === "[object Object]";

/** 
 * Union arrays while preserving first-seen order 
 */
function unionArrays(a: unknown[], b: unknown[], dedupe: boolean): unknown[] {
  if (!dedupe) return [...a, ...b];
  
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  
  const pushIfNew = (x: unknown) => {
    // For objects and arrays, use JSON serialization for comparison
    const key = (typeof x === 'object' && x !== null) ? JSON.stringify(x) : x;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(x);
    }
  };
  
  a.forEach(pushIfNew);
  b.forEach(pushIfNew);
  return out;
}

/**
 * Deep merge two record objects
 * Designed for merging data across tiers in Chronos-DB
 * 
 * @param target - The base record object (from lower priority tier)
 * @param source - The record object to merge from (from higher priority tier)  
 * @param opts - Merge configuration options
 * @returns Merged record object
 * 
 * @example
 * // Merge generic -> domain -> tenant
 * const generic = { name: "Default", settings: { theme: "light" }, tags: ["base"] };
 * const domain = { settings: { language: "en" }, tags: ["domain"] };
 * const tenant = { settings: { notifications: true }, tags: ["tenant"] };
 * 
 * let result = deepMerge(generic, domain);
 * result = deepMerge(result, tenant);
 * // Result: {
 * //   name: "Default",
 * //   settings: { theme: "light", language: "en", notifications: true },
 * //   tags: ["base", "domain", "tenant"]
 * // }
 */
export function deepMergeRecords(
  target: Record<string, any> | null | undefined,
  source: Record<string, any> | null | undefined,
  opts: RecordMergeOptions = {}
): Record<string, any> {
  const { dedupeArrays = true, preserveExisting = false } = opts;

  // Handle null/undefined cases
  if (!target && !source) return {};
  if (!target) return { ...source };
  if (!source) return { ...target };

  // Start with a copy of target
  const result: Record<string, any> = { ...target };

  // Merge each property from source
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key];

    // Skip if preserving existing and target has this key
    if (preserveExisting && targetValue !== undefined) {
      continue;
    }

    // Both are arrays - union them
    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      result[key] = unionArrays(targetValue, sourceValue, dedupeArrays);
    }
    // Both are plain objects - deep merge them
    else if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      result[key] = deepMergeRecords(targetValue, sourceValue, opts);
    }
    // Otherwise, source value overwrites (or adds new property)
    else {
      result[key] = sourceValue;
    }
  }

  return result;
}

// Export as default name for backward compatibility
export const deepMerge = deepMergeRecords;

