/**
 * System fields utilities for _system lifecycle object
 */

export interface SystemHeader {
  insertedAt: string;     // ISO 8601 (UTC) — time of CREATE ov=0
  updatedAt: string;      // ISO 8601 (UTC) — time of this version's commit
  deletedAt?: string;     // ISO 8601 (UTC) — set on logical DELETE versions
  deleted?: boolean;      // true on logical DELETE head (and its version)
  functionIds?: string[]; // unique set of enrichment sources
  parentId?: string;      // parent record _id (for lineage tracking)
  parentCollection?: string; // parent collection name
  originId?: string;      // original root record _id (preserved throughout lineage)
  originCollection?: string; // original root collection name
  state?: 'new-not-synched' | 'new' | 'processed'; // data sync and TTL state
}

export interface LineageInfo {
  /** Parent record for lineage tracking */
  parentRecord?: {
    id: string;
    collection: string;
    dbName?: string;
  };
  /** Direct origin specification (alternative to deriving from parent) */
  origin?: {
    id: string;           // Origin record ID (can be external system ID)
    collection: string;   // Origin collection/system name
    system?: string;      // Optional: external system name (e.g., "salesforce", "stripe")
  };
}

/**
 * Create system header for CREATE operation
 * @param now - Current timestamp
 * @param lineage - Optional parent/origin information for lineage tracking
 * @param state - Initial state (defaults to 'new-not-synched')
 */
export function createSystemHeader(now: Date, lineage?: LineageInfo, state: 'new-not-synched' | 'new' | 'processed' = 'new-not-synched'): SystemHeader {
  const iso = now.toISOString();
  const header: SystemHeader = {
    insertedAt: iso,
    updatedAt: iso,
    state,
  };

  // Add parent tracking if provided
  if (lineage?.parentRecord) {
    const parent = lineage.parentRecord;
    header.parentId = parent.id;
    header.parentCollection = parent.collection;
    
    // If no explicit origin, derive from parent
    if (!lineage.origin) {
      header.originId = parent.id;
      header.originCollection = parent.collection;
    }
  }

  // Add explicit origin if provided (overrides parent-derived origin)
  if (lineage?.origin) {
    header.originId = lineage.origin.id;
    header.originCollection = lineage.origin.collection;
    // Can also store the system name if provided
    if (lineage.origin.system) {
      header.originCollection = `${lineage.origin.system}:${lineage.origin.collection}`;
    }
  }

  return header;
}

/**
 * Create system header for UPDATE operation
 */
export function updateSystemHeader(previousSystem: SystemHeader, now: Date, newState?: 'new-not-synched' | 'new' | 'processed'): SystemHeader {
  return {
    insertedAt: previousSystem.insertedAt,
    updatedAt: now.toISOString(),
    state: newState || previousSystem.state || 'new-not-synched',
  };
}

/**
 * Create system header for DELETE operation
 */
export function deleteSystemHeader(previousSystem: SystemHeader, now: Date): SystemHeader {
  return {
    insertedAt: previousSystem.insertedAt,
    updatedAt: now.toISOString(),
    deletedAt: now.toISOString(),
    deleted: true,
    state: previousSystem.state || 'new-not-synched',
  };
}

/**
 * Create system header for RESTORE operation
 */
export function restoreSystemHeader(targetSystem: SystemHeader, now: Date): SystemHeader {
  const header: SystemHeader = {
    insertedAt: targetSystem.insertedAt,
    updatedAt: now.toISOString(),
    state: targetSystem.state || 'new-not-synched',
  };
  
  // Preserve deleted fields if target was deleted
  if (targetSystem.deleted && targetSystem.deletedAt) {
    header.deletedAt = targetSystem.deletedAt;
    header.deleted = targetSystem.deleted;
  }
  
  return header;
}

/**
 * Add system header to transformed data
 */
export function addSystemHeader(data: Record<string, unknown>, system: SystemHeader): Record<string, unknown> {
  return {
    ...data,
    _system: system,
  };
}

/**
 * Extract system header from data
 */
export function extractSystemHeader(data: Record<string, unknown>): SystemHeader | null {
  const system = data['_system'];
  if (system && typeof system === 'object' && system !== null) {
    const sys = system as Record<string, unknown>;
    if (
      typeof sys['insertedAt'] === 'string' &&
      typeof sys['updatedAt'] === 'string' &&
      (sys['deletedAt'] === undefined || typeof sys['deletedAt'] === 'string') &&
      (sys['deleted'] === undefined || typeof sys['deleted'] === 'boolean') &&
      (sys['state'] === undefined || ['new-not-synched', 'new', 'processed'].includes(sys['state'] as string))
    ) {
      return sys as unknown as SystemHeader;
    }
  }
  return null;
}

/**
 * Check if data has system header
 */
export function hasSystemHeader(data: Record<string, unknown>): boolean {
  return extractSystemHeader(data) !== null;
}

/**
 * State transition helper functions
 */

/**
 * Mark data as synced to JSON storage
 */
export function markAsSynced(systemHeader: SystemHeader): SystemHeader {
  return {
    ...systemHeader,
    state: 'new',
  };
}

/**
 * Mark data as processed (TTL expired, some data may only exist in JSON)
 */
export function markAsProcessed(systemHeader: SystemHeader): SystemHeader {
  return {
    ...systemHeader,
    state: 'processed',
  };
}

/**
 * Check if data is in 'new-not-synched' state
 */
export function isNotSynced(systemHeader: SystemHeader): boolean {
  return systemHeader.state === 'new-not-synched' || !systemHeader.state;
}

/**
 * Check if data is in 'new' state (synced but not processed)
 */
export function isSynced(systemHeader: SystemHeader): boolean {
  return systemHeader.state === 'new';
}

/**
 * Check if data is in 'processed' state (TTL expired)
 */
export function isProcessed(systemHeader: SystemHeader): boolean {
  return systemHeader.state === 'processed';
}

/**
 * Determine state based on TTL expiration
 * @param systemHeader - Current system header
 * @param ttlHours - TTL in hours
 * @param now - Current timestamp
 */
export function shouldMarkAsProcessed(systemHeader: SystemHeader, ttlHours: number, now: Date): boolean {
  if (systemHeader.state === 'processed') {
    return false; // Already processed
  }
  
  const insertedAt = new Date(systemHeader.insertedAt);
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const elapsedMs = now.getTime() - insertedAt.getTime();
  
  return elapsedMs >= ttlMs;
}
