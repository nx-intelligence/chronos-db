import { Db, Collection, ClientSession, ObjectId } from 'mongodb';
import type { CollectionMap } from '../config.js';
import type { HeadDoc, VerDoc, CounterDoc } from './schemas.js';
import type { TransactionLock } from './transactionLock.js';
import { getCollectionNames, getCollectionIndexes, createMetaQuery } from './schemas.js';

// ============================================================================
// Repos Class
// ============================================================================

export class Repos {
  private readonly collectionName: string;
  private readonly headCol: Collection<HeadDoc>;
  private readonly verCol: Collection<VerDoc>;
  private readonly counterCol: Collection<CounterDoc>;
  private readonly lockCol: Collection<TransactionLock>;
  private indexesEnsured = false;

  constructor(db: Db, collectionName: string) {
    this.collectionName = collectionName;
    
    const names = getCollectionNames(collectionName);
    this.headCol = db.collection<HeadDoc>(names.head);
    this.verCol = db.collection<VerDoc>(names.ver);
    this.counterCol = db.collection<CounterDoc>(names.counter);
    this.lockCol = db.collection<TransactionLock>(`${collectionName}_locks`);
  }

  /**
   * Ensure all required indexes are created (idempotent)
   * @param map - Collection map configuration
   */
  async ensureIndexes(map?: CollectionMap): Promise<void> {
    if (this.indexesEnsured) {
      return;
    }

    const names = getCollectionNames(this.collectionName);
    
    // Ensure head collection indexes
    const headIndexes = getCollectionIndexes(names.head, map || { indexedProps: [] });
    for (const index of headIndexes) {
      const options: any = { name: index.name };
      if (index.unique !== undefined) {
        options.unique = index.unique;
      }
      if (index.partialFilterExpression !== undefined) {
        options.partialFilterExpression = index.partialFilterExpression;
      }
      await this.headCol.createIndex(index.key, options);
    }

    // Ensure version collection indexes
    const verIndexes = getCollectionIndexes(names.ver, map || { indexedProps: [] });
    for (const index of verIndexes) {
      const options: any = { name: index.name };
      if (index.unique !== undefined) {
        options.unique = index.unique;
      }
      if (index.partialFilterExpression !== undefined) {
        options.partialFilterExpression = index.partialFilterExpression;
      }
      await this.verCol.createIndex(index.key, options);
    }

    // Ensure transaction lock indexes
    await this.ensureTransactionLockIndexes();

    this.indexesEnsured = true;
  }

  /**
   * Increment collection version and return new value
   * @param session - MongoDB session (optional)
   * @returns New collection version (0-based)
   */
  async incCv(session?: ClientSession): Promise<number> {
    const result = await this.counterCol.findOneAndUpdate(
      { _id: 'cv' },
      { $inc: { value: 1 } },
      { 
        upsert: true, 
        returnDocument: 'after',
        ...(session && { session }),
      }
    );

    if (!result) {
      throw new Error('Failed to increment collection version');
    }

    return result.value;
  }

  /**
   * Get head document for an item
   * @param id - Item ID
   * @returns Head document or null
   */
  async getHead(id: ObjectId): Promise<HeadDoc | null> {
    return await this.headCol.findOne({ _id: id });
  }

  /**
   * Get head document for an item (with session)
   * @param id - Item ID
   * @param session - MongoDB session
   * @returns Head document or null
   */
  async getHeadWithSession(id: ObjectId, session: ClientSession): Promise<HeadDoc | null> {
    return await this.headCol.findOne({ _id: id }, { session });
  }

  /**
   * Get head document by metadata filter
   * @param filter - Metadata filter
   * @returns Head document or null if not found
   */
  async getHeadByMeta(filter: Record<string, unknown>): Promise<HeadDoc | null> {
    const metaFilter = createMetaQuery(filter);
    return await this.headCol.findOne(metaFilter);
  }

  /**
   * Get head documents by metadata filter
   * @param filter - Metadata filter
   * @returns Array of head documents
   */
  async getHeadByMetaList(filter: Record<string, unknown>): Promise<HeadDoc[]> {
    const metaFilter = createMetaQuery(filter);
    return await this.headCol.find(metaFilter).toArray();
  }

  /**
   * Get count of head documents by metadata filter
   * @param filter - Metadata filter
   * @returns Count of documents
   */
  async getHeadCount(filter: Record<string, unknown>): Promise<number> {
    const metaFilter = createMetaQuery(filter);
    return await this.headCol.countDocuments(metaFilter);
  }

  /**
   * Get version document by OV
   * @param ov - Object version
   * @returns Version document or null if not found
   */
  async getVerByOv(ov: number): Promise<VerDoc | null> {
    return await this.verCol.findOne({ ov });
  }

  /**
   * Get version documents by item ID
   * @param itemId - Item ID
   * @returns Array of version documents
   */
  async getVerByItemId(itemId: ObjectId): Promise<VerDoc[]> {
    return await this.verCol.find({ itemId }).sort({ ov: -1 }).toArray();
  }

  /**
   * Get version documents by collection version
   * @param cv - Collection version
   * @returns Array of version documents
   */
  async getVerByCv(cv: number): Promise<VerDoc[]> {
    return await this.verCol.find({ cv }).sort({ ov: -1 }).toArray();
  }

  /**
   * Get version documents by time range
   * @param startTime - Start time
   * @param endTime - End time
   * @returns Array of version documents
   */
  async getVerByTimeRange(startTime: Date, endTime: Date): Promise<VerDoc[]> {
    return await this.verCol.find({
      at: {
        $gte: startTime,
        $lte: endTime
      }
    }).sort({ at: -1 }).toArray();
  }

  /**
   * Get count of version documents by filter
   * @param filter - Filter object
   * @returns Count of documents
   */
  async getVerCount(filter: Record<string, unknown>): Promise<number> {
    return await this.verCol.countDocuments(filter);
  }

  /**
   * Get counter document
   * @returns Counter document or null if not found
   */
  async getCounter(): Promise<CounterDoc | null> {
    return await this.counterCol.findOne({ _id: 'cv' });
  }

  /**
   * Insert a version document
   * @param verDoc - Version document to insert
   * @param session - MongoDB session
   */
  async insertVersion(verDoc: VerDoc, session: ClientSession): Promise<void> {
    await this.verCol.insertOne(verDoc, { session });
  }

  /**
   * Upsert a head document
   * @param headDoc - Head document to upsert
   * @param session - MongoDB session
   */
  async upsertHead(headDoc: HeadDoc, session: ClientSession): Promise<void> {
    await this.headCol.replaceOne(
      { _id: headDoc._id },
      headDoc,
      { upsert: true, session }
    );
  }

  /**
   * Update head document with optimistic locking
   * @param headDoc - Head document to update
   * @param expectedOv - Expected object version for optimistic locking
   * @param session - MongoDB session
   * @throws OptimisticLockError if expectedOv doesn't match
   */
  async updateHeadWithLock(
    headDoc: HeadDoc, 
    expectedOv: number, 
    session: ClientSession
  ): Promise<void> {
    const result = await this.headCol.replaceOne(
      { _id: headDoc._id, ov: expectedOv },
      headDoc,
      { session }
    );

    if (result.matchedCount === 0) {
      throw new Error(`Optimistic lock failed: expected OV ${expectedOv} not found`);
    }
  }

  /**
   * Get version document for an item and version
   * @param itemId - Item ID
   * @param ov - Object version
   * @returns Version document or null
   */
  async getVersion(itemId: ObjectId, ov: number): Promise<VerDoc | null> {
    return await this.verCol.findOne({ itemId, ov });
  }

  /**
   * Get version document for an item and version (with session)
   * @param itemId - Item ID
   * @param ov - Object version
   * @param session - MongoDB session
   * @returns Version document or null
   */
  async getVersionWithSession(itemId: ObjectId, ov: number, session: ClientSession): Promise<VerDoc | null> {
    return await this.verCol.findOne({ itemId, ov }, { session });
  }

  /**
   * Get latest version of an item as of a specific time
   * @param itemId - Item ID
   * @param asOf - Timestamp
   * @returns Version document or null
   */
  async getAsOf(itemId: ObjectId, asOf: Date): Promise<VerDoc | null> {
    return await this.verCol.findOne(
      { itemId, at: { $lte: asOf } },
      { sort: { at: -1 } }
    );
  }

  /**
   * Get latest version of an item as of a specific collection version
   * @param itemId - Item ID
   * @param cv - Collection version
   * @returns Version document or null
   */
  async getByCv(itemId: ObjectId, cv: number): Promise<VerDoc | null> {
    return await this.verCol.findOne(
      { itemId, cv: { $lte: cv } },
      { sort: { cv: -1 } }
    );
  }


  /**
   * Get all head documents with optional filter
   * @param filter - Optional filter
   * @param limit - Optional limit
   * @param skip - Optional skip
   * @returns Array of head documents
   */
  async listHeads(
    filter: Record<string, unknown> = {},
    limit?: number,
    skip?: number
  ): Promise<HeadDoc[]> {
    let query = this.headCol.find(filter);
    
    if (skip) {
      query = query.skip(skip);
    }
    
    if (limit) {
      query = query.limit(limit);
    }
    
    return await query.toArray();
  }

  /**
   * Get version documents for an item
   * @param itemId - Item ID
   * @param limit - Optional limit
   * @param skip - Optional skip
   * @returns Array of version documents
   */
  async listVersions(
    itemId: ObjectId,
    limit?: number,
    skip?: number
  ): Promise<VerDoc[]> {
    let query = this.verCol.find({ itemId }).sort({ ov: -1 });
    
    if (skip) {
      query = query.skip(skip);
    }
    
    if (limit) {
      query = query.limit(limit);
    }
    
    return await query.toArray();
  }

  /**
   * Get version documents by collection version range
   * @param minCv - Minimum collection version
   * @param maxCv - Maximum collection version
   * @param limit - Optional limit
   * @returns Array of version documents
   */
  async listVersionsByCv(
    minCv: number,
    maxCv: number,
    limit?: number
  ): Promise<VerDoc[]> {
    let query = this.verCol.find({
      cv: { $gte: minCv, $lte: maxCv }
    }).sort({ cv: 1, at: 1 });
    
    if (limit) {
      query = query.limit(limit);
    }
    
    return await query.toArray();
  }

  /**
   * Count head documents
   * @param filter - Optional filter
   * @returns Count of head documents
   */
  async countHeads(filter: Record<string, unknown> = {}): Promise<number> {
    return await this.headCol.countDocuments(filter);
  }

  /**
   * Count version documents
   * @param filter - Optional filter
   * @returns Count of version documents
   */
  async countVersions(filter: Record<string, unknown> = {}): Promise<number> {
    return await this.verCol.countDocuments(filter);
  }

  /**
   * Delete version documents (for cleanup)
   * @param filter - Filter for documents to delete
   * @param session - MongoDB session
   * @returns Number of documents deleted
   */
  async deleteVersions(
    filter: Record<string, unknown>,
    session: ClientSession
  ): Promise<number> {
    const result = await this.verCol.deleteMany(filter, { session });
    return result.deletedCount;
  }

  /**
   * Get collection statistics
   * @returns Statistics object
   */
  async getStats(): Promise<{
    headCount: number;
    verCount: number;
    counterValue: number;
  }> {
    const [headCount, verCount, counterDoc] = await Promise.all([
      this.headCol.countDocuments(),
      this.verCol.countDocuments(),
      this.counterCol.findOne({ _id: 'cv' }),
    ]);

    return {
      headCount,
      verCount,
      counterValue: counterDoc?.value ?? -1,
    };
  }

  /**
   * Get collection names
   * @returns Collection names
   */
  getCollectionNames(): { head: string; ver: string; counter: string } {
    return getCollectionNames(this.collectionName);
  }

  /**
   * Get collection references
   * @returns Collection references
   */
  getCollections(): {
    head: Collection<HeadDoc>;
    ver: Collection<VerDoc>;
    counter: Collection<CounterDoc>;
  } {
    return {
      head: this.headCol,
      ver: this.verCol,
      counter: this.counterCol,
    };
  }

  /**
   * Get heads with dev shadows
   */
  async getHeadsWithDevShadows(): Promise<HeadDoc[]> {
    return await this.headCol.find({ fullShadow: { $exists: true } }).toArray();
  }

  /**
   * Update head document's dev shadow
   */
  async updateHeadShadow(itemId: ObjectId, shadow: any, session?: ClientSession): Promise<void> {
    if (shadow) {
      await this.headCol.updateOne(
        { _id: itemId },
        { $set: { fullShadow: shadow } },
        { ...(session && { session }) }
      );
    } else {
      await this.headCol.updateOne(
        { _id: itemId },
        { $unset: { fullShadow: 1 } },
        { ...(session && { session }) }
      );
    }
  }

  /**
   * Delete a version document
   */
  async deleteVersion(versionId: ObjectId, session?: ClientSession): Promise<void> {
    await this.verCol.deleteOne(
      { _id: versionId },
      { ...(session && { session }) }
    );
  }

  /**
   * Delete a head document
   */
  async deleteHead(itemId: ObjectId, session?: ClientSession): Promise<void> {
    await this.headCol.deleteOne(
      { _id: itemId },
      { ...(session && { session }) }
    );
  }

  /**
   * Get all head documents
   */
  async getAllHeads(): Promise<HeadDoc[]> {
    return await this.headCol.find({}).toArray();
  }

  /**
   * Get deleted head documents
   */
  async getDeletedHeads(limit: number = 100): Promise<HeadDoc[]> {
    return await this.headCol
      .find({ deletedAt: { $exists: true } })
      .limit(limit)
      .toArray();
  }

  // ============================================================================
  // Transaction Lock Methods
  // ============================================================================

  /**
   * Insert a transaction lock
   * @param lock - Transaction lock document
   */
  async insertTransactionLock(lock: TransactionLock): Promise<void> {
    await this.lockCol.insertOne(lock);
  }

  /**
   * Get transaction lock by item ID
   * @param itemId - Item ID
   * @returns Transaction lock or null
   */
  async getTransactionLock(itemId: ObjectId): Promise<TransactionLock | null> {
    return await this.lockCol.findOne({ itemId });
  }

  /**
   * Get transaction locks by server ID
   * @param serverId - Server ID
   * @returns Array of transaction locks
   */
  async getTransactionLocksByServer(serverId: string): Promise<TransactionLock[]> {
    return await this.lockCol.find({ serverId }).toArray();
  }

  /**
   * Delete transaction lock by lock ID
   * @param lockId - Lock ID
   * @returns Delete result
   */
  async deleteTransactionLock(lockId: ObjectId): Promise<{ deletedCount: number }> {
    const result = await this.lockCol.deleteOne({ _id: lockId });
    return { deletedCount: result.deletedCount };
  }

  /**
   * Delete transaction lock by item ID
   * @param itemId - Item ID
   * @returns Delete result
   */
  async deleteTransactionLockByItemId(itemId: ObjectId): Promise<{ deletedCount: number }> {
    const result = await this.lockCol.deleteOne({ itemId });
    return { deletedCount: result.deletedCount };
  }

  /**
   * Delete transaction locks by server ID
   * @param serverId - Server ID
   * @returns Delete result
   */
  async deleteTransactionLocksByServer(serverId: string): Promise<{ deletedCount: number }> {
    const result = await this.lockCol.deleteMany({ serverId });
    return { deletedCount: result.deletedCount };
  }

  /**
   * Delete expired transaction locks
   * @returns Delete result
   */
  async deleteExpiredTransactionLocks(): Promise<{ deletedCount: number }> {
    const result = await this.lockCol.deleteMany({ 
      expiresAt: { $lt: new Date() } 
    });
    return { deletedCount: result.deletedCount };
  }

  /**
   * Ensure transaction lock indexes
   */
  async ensureTransactionLockIndexes(): Promise<void> {
    // Create unique index on itemId to prevent duplicate locks
    await this.lockCol.createIndex(
      { itemId: 1 },
      { unique: true, name: 'itemId_unique' }
    );

    // Create index on expiresAt for cleanup queries
    await this.lockCol.createIndex(
      { expiresAt: 1 },
      { name: 'expiresAt_ttl' }
    );

    // Create index on serverId for server-specific queries
    await this.lockCol.createIndex(
      { serverId: 1 },
      { name: 'serverId_index' }
    );

    // Create compound index for cleanup by server and expiration
    await this.lockCol.createIndex(
      { serverId: 1, expiresAt: 1 },
      { name: 'serverId_expiresAt_compound' }
    );
  }
}
