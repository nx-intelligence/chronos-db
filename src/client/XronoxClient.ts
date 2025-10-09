/**
 * XronoxClient - MongoDB-like Client API
 * 
 * Provides a simplified, MongoDB-compatible API for Xronox operations.
 * This wraps the existing Xronox context-based API with a more familiar interface.
 */

import type { Xronox } from '../index.js';
import type { ProjectionSpec } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export interface XronoxClientConfig {
  /** Default database type */
  databaseType: 'metadata' | 'knowledge' | 'runtime' | 'logs' | 'messaging' | 'identities';
  /** Default tier */
  tier?: 'generic' | 'domain' | 'tenant';
  /** Default tenant ID */
  tenantId?: string;
  /** Default domain */
  domain?: string;
}

export interface InsertOptions {
  tenantId?: string;
}

export interface FindOneOptions {
  tenantId?: string;
  projection?: ProjectionSpec;
  includeHidden?: boolean;
}

export interface FindOptions extends FindOneOptions {
  limit?: number;
  offset?: number;
  sort?: Record<string, 1 | -1>;
}

export interface UpdateOptions {
  tenantId?: string;
}

export interface DeleteOptions {
  tenantId?: string;
}

// ============================================================================
// XronoxClient Class
// ============================================================================

/**
 * MongoDB-like client for Xronox
 * 
 * @example
 * const client = new XronoxClient(xronox, {
 *   databaseType: 'knowledge',
 *   tier: 'tenant',
 *   tenantId: 'default'
 * });
 * 
 * const id = await client.insert('knowledge_items', { topic: 'test', content: {...} });
 * const item = await client.findById('knowledge_items', id);
 */
export class XronoxClient {
  private xronox: Xronox;
  private config: XronoxClientConfig;

  constructor(xronox: Xronox, config: XronoxClientConfig) {
    this.xronox = xronox;
    this.config = config;
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Insert a document and return auto-generated ID
   * 
   * @param collection - Collection name
   * @param item - Item to insert (without id)
   * @param options - Insert options
   * @returns Generated document ID
   * 
   * @example
   * const id = await client.insert('knowledge_items', {
   *   topic: 'quantum-computing',
   *   content: { text: 'Quantum computing...' },
   *   confidence: 0.9
   * });
   */
  async insert<T = any>(
    collection: string,
    item: Omit<T, 'id'>,
    options?: InsertOptions
  ): Promise<string> {
    const context: any = {
      databaseType: this.config.databaseType,
      tier: this.config.tier || 'tenant',
      tenantId: options?.tenantId || this.config.tenantId || 'default',
      collection,
      dbName: '', // Auto-resolved by router
    };
    if (this.config.domain) {
      context.domain = this.config.domain;
    }
    const ops = this.xronox.with(context);

    const result = await ops.create(item, 'system', 'insert');
    return result.id;
  }

  /**
   * Find one document by filter
   * 
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @param options - Query options
   * @returns Document or null
   * 
   * @example
   * const item = await client.findOne('knowledge_items', {
   *   topic: 'quantum-computing'
   * });
   */
  async findOne<T = any>(
    collection: string,
    filter: Record<string, any>,
    options?: FindOneOptions
  ): Promise<T | null> {
    const context: any = {
      databaseType: this.config.databaseType,
      tier: this.config.tier || 'tenant',
      tenantId: options?.tenantId || this.config.tenantId || 'default',
      collection,
      dbName: '', // Auto-resolved by router
    };
    if (this.config.domain) {
      context.domain = this.config.domain;
    }
    const ops = this.xronox.with(context);

    const queryOptions: any = {
      meta: filter,
      limit: 1,
    };
    
    if (options?.includeHidden !== undefined) {
      queryOptions.includeHidden = options.includeHidden;
    }
    if (options?.projection !== undefined) {
      queryOptions.projectionSpec = options.projection;
    }

    const results = await ops.query(queryOptions);

    if (results.items.length === 0) {
      return null;
    }

    return results.items[0]?.item as T;
  }

  /**
   * Find document by ID
   * 
   * @param collection - Collection name
   * @param id - Document ID
   * @param options - Query options
   * @returns Document or null
   * 
   * @example
   * const item = await client.findById('knowledge_items', 'doc-123');
   */
  async findById<T = any>(
    collection: string,
    id: string,
    options?: FindOneOptions
  ): Promise<T | null> {
    const context: any = {
      databaseType: this.config.databaseType,
      tier: this.config.tier || 'tenant',
      tenantId: options?.tenantId || this.config.tenantId || 'default',
      collection,
      dbName: '', // Auto-resolved by router
    };
    if (this.config.domain) {
      context.domain = this.config.domain;
    }
    const ops = this.xronox.with(context);

    const readOptions: any = {};
    if (options?.includeHidden !== undefined) {
      readOptions.includeHidden = options.includeHidden;
    }
    if (options?.projection !== undefined) {
      readOptions.projectionSpec = options.projection;
    }

    const result = await ops.getLatest(id, readOptions);

    if (!result) {
      return null;
    }

    return result.item as T;
  }

  /**
   * Find multiple documents
   * 
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @param options - Query options
   * @returns Array of documents
   * 
   * @example
   * const items = await client.find('knowledge_items', {
   *   state: 'known',
   *   confidence: { $gte: 0.8 }
   * }, {
   *   limit: 10,
   *   projection: { include: ['topic', 'content'], exclude: [] }
   * });
   */
  async find<T = any>(
    collection: string,
    filter: Record<string, any> = {},
    options?: FindOptions
  ): Promise<T[]> {
    const context: any = {
      databaseType: this.config.databaseType,
      tier: this.config.tier || 'tenant',
      tenantId: options?.tenantId || this.config.tenantId || 'default',
      collection,
      dbName: '', // Auto-resolved by router
    };
    if (this.config.domain) {
      context.domain = this.config.domain;
    }
    const ops = this.xronox.with(context);

    const queryOptions: any = {
      meta: filter,
      limit: options?.limit,
    };
    
    if (options?.includeHidden !== undefined) {
      queryOptions.includeHidden = options.includeHidden;
    }
    if (options?.projection !== undefined) {
      queryOptions.projectionSpec = options.projection;
    }

    const results = await ops.query(queryOptions);

    return results.items.map(item => item.item as T);
  }

  /**
   * Update a document by ID
   * 
   * @param collection - Collection name
   * @param id - Document ID
   * @param updates - Partial updates to apply
   * @param options - Update options
   * 
   * @example
   * await client.update('knowledge_items', 'doc-123', {
   *   confidence: 0.95,
   *   state: 'known'
   * });
   */
  async update<T = any>(
    collection: string,
    id: string,
    updates: Partial<T>,
    options?: UpdateOptions
  ): Promise<void> {
    const context: any = {
      databaseType: this.config.databaseType,
      tier: this.config.tier || 'tenant',
      tenantId: options?.tenantId || this.config.tenantId || 'default',
      collection,
      dbName: '', // Auto-resolved by router
    };
    if (this.config.domain) {
      context.domain = this.config.domain;
    }
    const ops = this.xronox.with(context);

    // Get current version for optimistic locking
    const current = await ops.getLatest(id);
    if (!current) {
      throw new Error(`Document not found: ${id}`);
    }

    await ops.update(id, updates, current._meta?.ov || 0, 'system', 'update');
  }

  /**
   * Delete a document by ID
   * 
   * @param collection - Collection name
   * @param id - Document ID
   * @param options - Delete options
   * 
   * @example
   * await client.delete('knowledge_items', 'doc-123');
   */
  async delete(
    collection: string,
    id: string,
    options?: DeleteOptions
  ): Promise<void> {
    const context: any = {
      databaseType: this.config.databaseType,
      tier: this.config.tier || 'tenant',
      tenantId: options?.tenantId || this.config.tenantId || 'default',
      collection,
      dbName: '', // Auto-resolved by router
    };
    if (this.config.domain) {
      context.domain = this.config.domain;
    }
    const ops = this.xronox.with(context);

    // Get current version for optimistic locking
    const current = await ops.getLatest(id);
    if (!current) {
      throw new Error(`Document not found: ${id}`);
    }

    await ops.delete(id, current._meta?.ov || 0, 'system', 'delete');
  }

  /**
   * Delete multiple documents matching filter
   * 
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @returns Number of deleted documents
   * 
   * @example
   * const count = await client.deleteMany('knowledge_items', {
   *   state: 'obsolete'
   * });
   */
  async deleteMany(
    collection: string,
    filter: Record<string, any>
  ): Promise<number> {
    const items = await this.find(collection, filter);
    let deleted = 0;

    for (const item of items) {
      try {
        await this.delete(collection, (item as any).id || (item as any)._id);
        deleted++;
      } catch (error) {
        // Continue on error
        console.warn(`Failed to delete document:`, error);
      }
    }

    return deleted;
  }

  /**
   * Count documents matching filter
   * 
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @returns Document count
   */
  async count(
    collection: string,
    filter: Record<string, any> = {}
  ): Promise<number> {
    const items = await this.find(collection, filter);
    return items.length;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new XronoxClient instance
 * 
 * @param xronox - Xronox instance
 * @param config - Client configuration
 * @returns XronoxClient instance
 * 
 * @example
 * const xronox = await initXronox();
 * const client = createXronoxClient(xronox, {
 *   databaseType: 'knowledge',
 *   tier: 'tenant',
 *   tenantId: 'default'
 * });
 */
export function createXronoxClient(
  xronox: Xronox,
  config: XronoxClientConfig
): XronoxClient {
  return new XronoxClient(xronox, config);
}

