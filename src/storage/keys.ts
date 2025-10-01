// ============================================================================
// Key Builders for S3 Storage Layout
// ============================================================================

/**
 * Build a JSON key for versioned item storage
 * @param collection - Collection name (will be lowercased)
 * @param idHex - Item ID as hex string
 * @param ov - Object version number
 * @returns S3 key for item.json
 */
export function jsonKey(collection: string, idHex: string, ov: number): string {
  const cleanCollection = collection.toLowerCase().trim();
  const cleanId = idHex.toLowerCase().trim();
  
  if (!cleanCollection || !cleanId) {
    throw new Error('Collection and ID must be non-empty strings');
  }
  
  if (ov < 0 || !Number.isInteger(ov)) {
    throw new Error('Object version must be a non-negative integer');
  }
  
  return `${cleanCollection}/${cleanId}/v${ov}/item.json`;
}

/**
 * Build a blob key for externalized base64 properties
 * @param collection - Collection name (will be lowercased)
 * @param prop - Property name (will be lowercased)
 * @param idHex - Item ID as hex string
 * @param ov - Object version number
 * @returns S3 key for blob.bin
 */
export function propBlobKey(collection: string, prop: string, idHex: string, ov: number): string {
  const cleanCollection = collection.toLowerCase().trim();
  const cleanProp = prop.toLowerCase().trim();
  const cleanId = idHex.toLowerCase().trim();
  
  if (!cleanCollection || !cleanProp || !cleanId) {
    throw new Error('Collection, property, and ID must be non-empty strings');
  }
  
  if (ov < 0 || !Number.isInteger(ov)) {
    throw new Error('Object version must be a non-negative integer');
  }
  
  return `${cleanCollection}/${cleanProp}/${cleanId}/v${ov}/blob.bin`;
}

/**
 * Build a text key for externalized base64 properties (optional text rendition)
 * @param collection - Collection name (will be lowercased)
 * @param prop - Property name (will be lowercased)
 * @param idHex - Item ID as hex string
 * @param ov - Object version number
 * @returns S3 key for text.txt
 */
export function propTextKey(collection: string, prop: string, idHex: string, ov: number): string {
  const cleanCollection = collection.toLowerCase().trim();
  const cleanProp = prop.toLowerCase().trim();
  const cleanId = idHex.toLowerCase().trim();
  
  if (!cleanCollection || !cleanProp || !cleanId) {
    throw new Error('Collection, property, and ID must be non-empty strings');
  }
  
  if (ov < 0 || !Number.isInteger(ov)) {
    throw new Error('Object version must be a non-negative integer');
  }
  
  return `${cleanCollection}/${cleanProp}/${cleanId}/v${ov}/text.txt`;
}

/**
 * Build a manifest key for roll-up snapshots
 * @param collection - Collection name (will be lowercased)
 * @param year - Year (YYYY)
 * @param month - Month (MM, 1-12)
 * @param cv - Collection version number
 * @returns S3 key for manifest snapshot
 */
export function manifestKey(collection: string, year: number, month: number, cv: number): string {
  const cleanCollection = collection.toLowerCase().trim();
  
  if (!cleanCollection) {
    throw new Error('Collection must be a non-empty string');
  }
  
  if (year < 1000 || year > 9999) {
    throw new Error('Year must be a 4-digit number');
  }
  
  if (month < 1 || month > 12 || !Number.isInteger(month)) {
    throw new Error('Month must be an integer between 1 and 12');
  }
  
  if (cv < 0 || !Number.isInteger(cv)) {
    throw new Error('Collection version must be a non-negative integer');
  }
  
  const monthPadded = month.toString().padStart(2, '0');
  return `__manifests__/${cleanCollection}/${year}/${monthPadded}/snapshot-${cv}.json.gz`;
}

/**
 * Parse a JSON key to extract its components
 * @param key - S3 key in format: collection/id/v{ov}/item.json
 * @returns Parsed components or null if invalid
 */
export function parseJsonKey(key: string): {
  collection: string;
  id: string;
  ov: number;
} | null {
  const match = key.match(/^([^/]+)\/([^/]+)\/v(\d+)\/item\.json$/);
  if (!match) {
    return null;
  }
  
  const [, collection, id, ovStr] = match;
  const ov = parseInt(ovStr!, 10);
  
  if (isNaN(ov) || ov < 0) {
    return null;
  }
  
  return { collection: collection!, id: id!, ov };
}

/**
 * Parse a blob key to extract its components
 * @param key - S3 key in format: collection/prop/id/v{ov}/blob.bin
 * @returns Parsed components or null if invalid
 */
export function parseBlobKey(key: string): {
  collection: string;
  prop: string;
  id: string;
  ov: number;
} | null {
  const match = key.match(/^([^/]+)\/([^/]+)\/([^/]+)\/v(\d+)\/blob\.bin$/);
  if (!match) {
    return null;
  }
  
  const [, collection, prop, id, ovStr] = match;
  const ov = parseInt(ovStr!, 10);
  
  if (isNaN(ov) || ov < 0) {
    return null;
  }
  
  return { collection: collection!, prop: prop!, id: id!, ov };
}

/**
 * Parse a manifest key to extract its components
 * @param key - S3 key in format: __manifests__/collection/YYYY/MM/snapshot-{cv}.json.gz
 * @returns Parsed components or null if invalid
 */
export function parseManifestKey(key: string): {
  collection: string;
  year: number;
  month: number;
  cv: number;
} | null {
  const match = key.match(/^__manifests__\/([^/]+)\/(\d{4})\/(\d{2})\/snapshot-(\d+)\.json\.gz$/);
  if (!match) {
    return null;
  }
  
  const [, collection, yearStr, monthStr, cvStr] = match;
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const cv = parseInt(cvStr!, 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(cv) || year < 1000 || year > 9999 || month < 1 || month > 12 || cv < 0) {
    return null;
  }
  
  return { collection: collection!, year, month, cv };
}

/**
 * Get the prefix for all versions of an item
 * @param collection - Collection name
 * @param idHex - Item ID as hex string
 * @returns S3 prefix for all versions of the item
 */
export function itemPrefix(collection: string, idHex: string): string {
  const cleanCollection = collection.toLowerCase().trim();
  const cleanId = idHex.toLowerCase().trim();
  
  if (!cleanCollection || !cleanId) {
    throw new Error('Collection and ID must be non-empty strings');
  }
  
  return `${cleanCollection}/${cleanId}/`;
}

/**
 * Get the prefix for all items in a collection
 * @param collection - Collection name
 * @returns S3 prefix for all items in the collection
 */
export function collectionPrefix(collection: string): string {
  const cleanCollection = collection.toLowerCase().trim();
  
  if (!cleanCollection) {
    throw new Error('Collection must be a non-empty string');
  }
  
  return `${cleanCollection}/`;
}

/**
 * Get the prefix for all manifests of a collection
 * @param collection - Collection name
 * @returns S3 prefix for all manifests of the collection
 */
export function manifestPrefix(collection: string): string {
  const cleanCollection = collection.toLowerCase().trim();
  
  if (!cleanCollection) {
    throw new Error('Collection must be a non-empty string');
  }
  
  return `__manifests__/${cleanCollection}/`;
}

/**
 * Get the prefix for manifests of a collection in a specific year/month
 * @param collection - Collection name
 * @param year - Year (YYYY)
 * @param month - Month (MM, 1-12)
 * @returns S3 prefix for manifests in the specified period
 */
export function manifestPeriodPrefix(collection: string, year: number, month: number): string {
  const cleanCollection = collection.toLowerCase().trim();
  
  if (!cleanCollection) {
    throw new Error('Collection must be a non-empty string');
  }
  
  if (year < 1000 || year > 9999) {
    throw new Error('Year must be a 4-digit number');
  }
  
  if (month < 1 || month > 12 || !Number.isInteger(month)) {
    throw new Error('Month must be an integer between 1 and 12');
  }
  
  const monthPadded = month.toString().padStart(2, '0');
  return `__manifests__/${cleanCollection}/${year}/${monthPadded}/`;
}
