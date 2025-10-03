import { ObjectId, ClientSession, MongoClient } from 'mongodb';
import { Repos } from './repos.js';
import type { RouteContext } from '../config.js';

// ============================================================================
// Transaction Lock Types
// ============================================================================

export interface TransactionLock {
  _id: ObjectId;
  itemId: ObjectId;
  collection: string;
  dbName: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  lockedAt: Date;
  expiresAt: Date;
  serverId: string;
  requestId?: string;
}

export interface LockOptions {
  /** Server/process identifier */
  serverId: string;
  /** Request ID for tracking */
  requestId?: string;
  /** Lock timeout in milliseconds (default: 30000 = 30 seconds) */
  timeoutMs?: number;
}

export interface LockResult {
  success: boolean;
  lockId?: string;
  existingLock?: TransactionLock;
  error?: string;
}

// ============================================================================
// Transaction Lock Manager
// ============================================================================

export class TransactionLockManager {
  private mongoClient: MongoClient;
  private dbName: string;
  private collection: string;
  private repos: Repos;

  constructor(mongoClient: MongoClient, dbName: string, collection: string) {
    this.mongoClient = mongoClient;
    this.dbName = dbName;
    this.collection = collection;
    this.repos = new Repos(mongoClient.db(dbName), collection);
  }

  /**
   * Acquire a transaction lock for an item
   * @param itemId - Item ID to lock
   * @param operation - Operation type
   * @param opts - Lock options
   * @returns Lock result
   */
  async acquireLock(
    itemId: ObjectId,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    opts: LockOptions
  ): Promise<LockResult> {
    const { serverId, requestId, timeoutMs = 30000 } = opts;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMs);

    // Clean up expired locks first
    await this.cleanupExpiredLocks();

    const lockId = new ObjectId();
    const lockDoc: TransactionLock = {
      _id: lockId,
      itemId,
      collection: this.collection,
      dbName: this.dbName,
      operation,
      lockedAt: now,
      expiresAt,
      serverId,
      requestId,
    };

    try {
      // Try to insert the lock (will fail if item is already locked)
      await this.repos.insertTransactionLock(lockDoc);
      
      return {
        success: true,
        lockId: lockId.toHexString(),
      };
    } catch (error) {
      // Check if it's a duplicate key error (item already locked)
      if (this.isDuplicateKeyError(error)) {
        // Get the existing lock
        const existingLock = await this.repos.getTransactionLock(itemId);
        
        return {
          success: false,
          existingLock: existingLock || undefined,
          error: `Item ${itemId.toHexString()} is already locked by another transaction`,
        };
      }
      
      throw error;
    }
  }

  /**
   * Release a transaction lock
   * @param lockId - Lock ID to release
   * @returns Success status
   */
  async releaseLock(lockId: string): Promise<boolean> {
    try {
      const result = await this.repos.deleteTransactionLock(new ObjectId(lockId));
      return result.deletedCount > 0;
    } catch (error) {
      console.warn(`Failed to release lock ${lockId}:`, error);
      return false;
    }
  }

  /**
   * Release lock by item ID (useful for cleanup)
   * @param itemId - Item ID to release lock for
   * @returns Success status
   */
  async releaseLockByItemId(itemId: ObjectId): Promise<boolean> {
    try {
      const result = await this.repos.deleteTransactionLockByItemId(itemId);
      return result.deletedCount > 0;
    } catch (error) {
      console.warn(`Failed to release lock for item ${itemId.toHexString()}:`, error);
      return false;
    }
  }

  /**
   * Check if an item is currently locked
   * @param itemId - Item ID to check
   * @returns Lock information or null if not locked
   */
  async isLocked(itemId: ObjectId): Promise<TransactionLock | null> {
    return await this.repos.getTransactionLock(itemId);
  }

  /**
   * Clean up expired locks
   * @returns Number of locks cleaned up
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const result = await this.repos.deleteExpiredTransactionLocks();
      return result.deletedCount;
    } catch (error) {
      console.warn('Failed to cleanup expired locks:', error);
      return 0;
    }
  }

  /**
   * Get all locks for a specific server
   * @param serverId - Server ID
   * @returns Array of locks
   */
  async getLocksByServer(serverId: string): Promise<TransactionLock[]> {
    return await this.repos.getTransactionLocksByServer(serverId);
  }

  /**
   * Force release all locks for a server (for cleanup on shutdown)
   * @param serverId - Server ID
   * @returns Number of locks released
   */
  async releaseAllLocksForServer(serverId: string): Promise<number> {
    try {
      const result = await this.repos.deleteTransactionLocksByServer(serverId);
      return result.deletedCount;
    } catch (error) {
      console.warn(`Failed to release all locks for server ${serverId}:`, error);
      return 0;
    }
  }

  /**
   * Check if error is a duplicate key error
   * @param error - Error to check
   * @returns True if duplicate key error
   */
  private isDuplicateKeyError(error: any): boolean {
    return error?.code === 11000 || 
           error?.codeName === 'DuplicateKey' ||
           (error?.message && error.message.includes('duplicate key'));
  }
}

// ============================================================================
// Transaction Lock Wrapper
// ============================================================================

/**
 * Execute a function with a transaction lock
 * @param lockManager - Transaction lock manager
 * @param itemId - Item ID to lock
 * @param operation - Operation type
 * @param opts - Lock options
 * @param fn - Function to execute while locked
 * @returns Function result
 */
export async function withTransactionLock<T>(
  lockManager: TransactionLockManager,
  itemId: ObjectId,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  opts: LockOptions,
  fn: () => Promise<T>
): Promise<T> {
  const lockResult = await lockManager.acquireLock(itemId, operation, opts);
  
  if (!lockResult.success) {
    throw new Error(`Failed to acquire lock: ${lockResult.error}`);
  }

  try {
    const result = await fn();
    return result;
  } finally {
    if (lockResult.lockId) {
      await lockManager.releaseLock(lockResult.lockId);
    }
  }
}

// ============================================================================
// Queue Recovery
// ============================================================================

/**
 * Recover failed transactions by returning records to queue
 * This should be run periodically to clean up orphaned locks
 */
export class TransactionRecoveryManager {
  private lockManager: TransactionLockManager;
  private fallbackQueue: any; // Will be injected

  constructor(lockManager: TransactionLockManager, fallbackQueue?: any) {
    this.lockManager = lockManager;
    this.fallbackQueue = fallbackQueue;
  }

  /**
   * Recover orphaned locks and return items to queue
   * @param serverId - Server ID to recover for
   * @returns Recovery statistics
   */
  async recoverOrphanedLocks(serverId: string): Promise<{
    locksReleased: number;
    itemsReturnedToQueue: number;
    errors: string[];
  }> {
    const stats = {
      locksReleased: 0,
      itemsReturnedToQueue: 0,
      errors: [] as string[],
    };

    try {
      // Get all locks for this server
      const locks = await this.lockManager.getLocksByServer(serverId);
      
      for (const lock of locks) {
        try {
          // Check if lock is expired
          if (lock.expiresAt < new Date()) {
            // Release the lock
            await this.lockManager.releaseLock(lock._id.toHexString());
            stats.locksReleased++;

            // If we have a fallback queue, return the item to queue
            if (this.fallbackQueue) {
              await this.returnItemToQueue(lock);
              stats.itemsReturnedToQueue++;
            }
          }
        } catch (error) {
          const errorMsg = `Failed to recover lock ${lock._id.toHexString()}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          stats.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
    } catch (error) {
      const errorMsg = `Failed to recover orphaned locks: ${error instanceof Error ? error.message : 'Unknown error'}`;
      stats.errors.push(errorMsg);
      console.error(errorMsg);
    }

    return stats;
  }

  /**
   * Return an item to the fallback queue
   * @param lock - Lock information
   */
  private async returnItemToQueue(lock: TransactionLock): Promise<void> {
    if (!this.fallbackQueue) {
      return;
    }

    // Create a fallback operation to retry the locked item
    const fallbackOp = {
      _id: new ObjectId(),
      itemId: lock.itemId,
      collection: lock.collection,
      dbName: lock.dbName,
      operation: lock.operation,
      lockedAt: lock.lockedAt,
      serverId: lock.serverId,
      requestId: lock.requestId,
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: new Date(Date.now() + 5000), // Retry in 5 seconds
      createdAt: new Date(),
    };

    await this.fallbackQueue.insertFallbackOp(fallbackOp);
  }
}
