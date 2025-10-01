/**
 * Merge utilities for deep merge with array union
 */

/**
 * Deep merge two objects with array union semantics
 * @param target - Target object to merge into
 * @param patch - Patch object to merge from
 * @returns Merged object
 */
export function deepMergeWithArrayUnion(
  target: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      // Ignore undefined values
      continue;
    }

    if (value === null) {
      // Null values override
      result[key] = null;
      continue;
    }

    const targetValue = result[key];

    if (targetValue === undefined) {
      // Target has no value, set it
      result[key] = value;
      continue;
    }

    if (isPlainObject(targetValue) && isPlainObject(value)) {
      // Both are plain objects, deep merge recursively
      result[key] = deepMergeWithArrayUnion(
        targetValue as Record<string, unknown>,
        value as Record<string, unknown>
      );
      continue;
    }

    if (Array.isArray(targetValue)) {
      // Target is an array
      if (Array.isArray(value)) {
        // Both are arrays, union them
        result[key] = mergeArrayOfObjects(
          targetValue as unknown[],
          value as unknown[]
        );
      } else {
        // Enrichment is single value, treat as one-element array
        result[key] = mergeArrayOfObjects(
          targetValue as unknown[],
          [value]
        );
      }
      continue;
    }

    // Otherwise, override (replace)
    result[key] = value;
  }

  return result;
}

/**
 * Check if value is a plain object
 */
function isPlainObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.constructor === Object
  );
}

/**
 * Union arrays of primitives (string/number/boolean)
 * @param target - Target array
 * @param patch - Patch array
 * @returns Unioned array
 */
export function unionArrayPrimitives(
  target: unknown[],
  patch: unknown[]
): unknown[] {
  const result = [...target];
  
  for (const item of patch) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  
  return result;
}

/**
 * Merge arrays of objects with identity detection
 * @param target - Target array of objects
 * @param patch - Patch array of objects
 * @returns Merged array of objects
 */
export function mergeArrayOfObjects(
  target: unknown[],
  patch: unknown[]
): unknown[] {
  const result = [...target];

  for (const patchItem of patch) {
    if (!isPlainObject(patchItem)) {
      // Not an object, treat as primitive
      if (!result.includes(patchItem)) {
        result.push(patchItem);
      }
      continue;
    }

    const patchObj = patchItem as Record<string, unknown>;
    const identity = getObjectIdentity(patchObj);
    
    if (identity) {
      // Find existing object by identity
      const existingIndex = result.findIndex(item => {
        if (!isPlainObject(item)) return false;
        const itemObj = item as Record<string, unknown>;
        return getObjectIdentity(itemObj) === identity;
      });

      if (existingIndex >= 0) {
        // Found existing object, deep merge
        const existingObj = result[existingIndex] as Record<string, unknown>;
        result[existingIndex] = deepMergeWithArrayUnion(existingObj, patchObj);
      } else {
        // Not found, append
        result.push(patchItem);
      }
    } else {
      // No identity, use deep equality to find match
      const existingIndex = result.findIndex(item => {
        if (!isPlainObject(item)) return false;
        return deepEqual(item as Record<string, unknown>, patchObj);
      });

      if (existingIndex >= 0) {
        // Found existing object, deep merge
        const existingObj = result[existingIndex] as Record<string, unknown>;
        result[existingIndex] = deepMergeWithArrayUnion(existingObj, patchObj);
      } else {
        // Not found, append
        result.push(patchItem);
      }
    }
  }

  return result;
}

/**
 * Get object identity key (id, _id, or null)
 */
function getObjectIdentity(obj: Record<string, unknown>): string | null {
  if (typeof obj.id === 'string') {
    return obj.id;
  }
  if (typeof obj._id === 'string') {
    return obj._id;
  }
  return null;
}

/**
 * Deep equality check for objects
 */
function deepEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key)) {
      return false;
    }

    const valueA = a[key];
    const valueB = b[key];

    if (valueA === valueB) {
      continue;
    }

    if (valueA === null || valueB === null) {
      return false;
    }

    if (typeof valueA !== typeof valueB) {
      return false;
    }

    if (isPlainObject(valueA) && isPlainObject(valueB)) {
      if (!deepEqual(valueA as Record<string, unknown>, valueB as Record<string, unknown>)) {
        return false;
      }
      continue;
    }

    if (Array.isArray(valueA) && Array.isArray(valueB)) {
      if (!arrayDeepEqual(valueA, valueB)) {
        return false;
      }
      continue;
    }

    return false;
  }

  return true;
}

/**
 * Deep equality check for arrays
 */
function arrayDeepEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    const itemB = b[i];

    if (itemA === itemB) {
      continue;
    }

    if (itemA === null || itemB === null) {
      return false;
    }

    if (typeof itemA !== typeof itemB) {
      return false;
    }

    if (isPlainObject(itemA) && isPlainObject(itemB)) {
      if (!deepEqual(itemA as Record<string, unknown>, itemB as Record<string, unknown>)) {
        return false;
      }
      continue;
    }

    if (Array.isArray(itemA) && Array.isArray(itemB)) {
      if (!arrayDeepEqual(itemA, itemB)) {
        return false;
      }
      continue;
    }

    return false;
  }

  return true;
}
