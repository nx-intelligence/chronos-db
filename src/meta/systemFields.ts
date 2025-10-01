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
 */
export function createSystemHeader(now: Date, lineage?: LineageInfo): SystemHeader {
  const iso = now.toISOString();
  const header: SystemHeader = {
    insertedAt: iso,
    updatedAt: iso,
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
export function updateSystemHeader(previousSystem: SystemHeader, now: Date): SystemHeader {
  return {
    insertedAt: previousSystem.insertedAt,
    updatedAt: now.toISOString(),
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
  };
}

/**
 * Create system header for RESTORE operation
 */
export function restoreSystemHeader(targetSystem: SystemHeader, now: Date): SystemHeader {
  const header: SystemHeader = {
    insertedAt: targetSystem.insertedAt,
    updatedAt: now.toISOString(),
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
      (sys['deleted'] === undefined || typeof sys['deleted'] === 'boolean')
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
