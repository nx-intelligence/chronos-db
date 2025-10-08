import { MongoClient, Db, Collection } from 'mongodb';
import type { 
  SharedMemoryDoc, 
  TopicDoc, 
  MessageDoc, 
  DeliveryDoc, 
  DeadLetterDoc,
} from './schemas.js';
import { MESSAGING_INDEXES } from './schemas.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// MessagingApi - Simple MongoDB-only messaging operations
// ============================================================================

export interface MessagingApiOptions {
  mongoClient: MongoClient;
  dbName: string;
  tenantId: string;
  captureDeliveries?: boolean;
}

/**
 * Shared memory operations (KV snapshots with versioning)
 */
export interface SharedApi {
  save(opts: {
    namespace: string;
    key: string;
    val: any;
    strategy?: 'append' | 'latest';
  }): Promise<{ id: string; version?: number }>;

  load(opts: {
    namespace: string;
    key: string;
    strategy?: 'append' | 'latest';
    version?: number;
  }): Promise<any | null>;

  tombstone(opts: {
    namespace: string;
    key: string;
    reason?: string;
  }): Promise<void>;
}

/**
 * Topic operations (topic metadata & shard config)
 */
export interface TopicsApi {
  ensure(opts: {
    topic: string;
    shards?: number;
  }): Promise<void>;

  get(opts: {
    topic: string;
  }): Promise<TopicDoc | null>;
}

/**
 * Message operations (canonical messages)
 */
export interface MessagesApi {
  save(opts: {
    topic: string;
    msgId: string;
    headers?: Record<string, string>;
    payload: any;
    firstSeenAt?: Date;
    size?: number;
  }): Promise<void>;

  get(opts: {
    topic: string;
    msgId: string;
  }): Promise<MessageDoc | null>;

  list(opts: {
    topic: string;
    after?: Date;
    limit?: number;
  }): Promise<MessageDoc[]>;
}

/**
 * Delivery operations (optional, controlled by captureDeliveries)
 */
export interface DeliveriesApi {
  append(opts: {
    topic: string;
    subscription: string;
    msgId: string;
    attempt: number;
    status: 'pending' | 'ack' | 'nack' | 'dead';
    consumerId?: string;
    reason?: string;
    ts?: Date;
  }): Promise<void>;

  listByMessage(opts: {
    topic: string;
    subscription?: string;
    msgId: string;
  }): Promise<DeliveryDoc[]>;
}

/**
 * Dead letter operations (DLQ)
 */
export interface DeadLettersApi {
  save(opts: {
    topic: string;
    subscription?: string;
    msgId: string;
    headers?: Record<string, string>;
    payload: any;
    deliveries: number;
    reason?: string;
    failedAt?: Date;
  }): Promise<void>;

  list(opts: {
    topic: string;
    after?: Date;
    limit?: number;
  }): Promise<DeadLetterDoc[]>;
}

/**
 * Main MessagingApi interface
 */
export interface MessagingApi {
  shared: SharedApi;
  topics: TopicsApi;
  messages: MessagesApi;
  deliveries?: DeliveriesApi | undefined;
  deadLetters: DeadLettersApi;
}

// ============================================================================
// Implementation
// ============================================================================

export class MessagingApiImpl implements MessagingApi {
  private db: Db;
  private tenantId: string;
  private captureDeliveries: boolean;
  private indexesEnsured = false;

  constructor(opts: MessagingApiOptions) {
    this.db = opts.mongoClient.db(opts.dbName);
    this.tenantId = opts.tenantId;
    this.captureDeliveries = opts.captureDeliveries ?? false;
  }

  /**
   * Ensure indexes are created (lazy, one-time per instance)
   */
  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;

    try {
      // Create indexes for all collections
      const collections = ['shared_memory', 'topics', 'messages', 'dead_letters'] as const;
      
      for (const collName of collections) {
        const coll = this.db.collection(collName);
        const indexes = MESSAGING_INDEXES[collName];
        
        for (const idx of indexes) {
          try {
            await coll.createIndex(idx.keys as any, idx.options as any);
          } catch (err: any) {
            // Ignore duplicate index errors
            if (err.code !== 85 && err.code !== 86) {
              logger.warn(`Failed to create index on ${collName}`, { error: err.message, index: idx });
            }
          }
        }
      }

      // Create deliveries indexes if enabled
      if (this.captureDeliveries) {
        const deliveriesColl = this.db.collection('deliveries');
        const deliveriesIndexes = MESSAGING_INDEXES.deliveries;
        
        for (const idx of deliveriesIndexes) {
          try {
            await deliveriesColl.createIndex(idx.keys as any, idx.options as any);
          } catch (err: any) {
            if (err.code !== 85 && err.code !== 86) {
              logger.warn('Failed to create index on deliveries', { error: err.message, index: idx });
            }
          }
        }
      }

      this.indexesEnsured = true;
      logger.debug('Messaging indexes ensured', { tenantId: this.tenantId, captureDeliveries: this.captureDeliveries });
    } catch (err) {
      logger.error('Failed to ensure messaging indexes', { error: err });
      throw err;
    }
  }

  /**
   * Shared memory API implementation
   */
  public shared: SharedApi = {
    save: async (opts) => {
      await this.ensureIndexes();
      
      const { namespace, key, val, strategy = 'latest' } = opts;
      const coll: Collection<SharedMemoryDoc> = this.db.collection('shared_memory');
      const now = new Date();

      if (strategy === 'latest') {
        // Upsert: one document per (tenant, namespace, key)
        const doc: SharedMemoryDoc = {
          tenantId: this.tenantId,
          namespace,
          key,
          val,
          strategy: 'latest',
          createdAt: now,
          updatedAt: now,
        };

        const result = await coll.updateOne(
          { tenantId: this.tenantId, namespace, key, strategy: 'latest' },
          { $set: doc, $setOnInsert: { createdAt: now } },
          { upsert: true }
        );

        const id = result.upsertedId?.toString() || 'updated';
        return { id };
      } else {
        // Append: create new versioned document
        // Find max version for this key
        const maxDoc = await coll.findOne(
          { tenantId: this.tenantId, namespace, key, strategy: 'append' },
          { sort: { version: -1 }, projection: { version: 1 } }
        );

        const nextVersion = (maxDoc?.version ?? -1) + 1;

        const doc: SharedMemoryDoc = {
          tenantId: this.tenantId,
          namespace,
          key,
          val,
          strategy: 'append',
          version: nextVersion,
          createdAt: now,
          updatedAt: now,
        };

        const result = await coll.insertOne(doc as any);
        return { id: result.insertedId.toString(), version: nextVersion };
      }
    },

    load: async (opts) => {
      await this.ensureIndexes();
      
      const { namespace, key, strategy = 'latest', version } = opts;
      const coll: Collection<SharedMemoryDoc> = this.db.collection('shared_memory');

      if (strategy === 'latest') {
        const doc = await coll.findOne({ tenantId: this.tenantId, namespace, key, strategy: 'latest' });
        return doc?.val ?? null;
      } else {
        // Append: load specific version or latest
        const filter: any = { tenantId: this.tenantId, namespace, key, strategy: 'append' };
        if (version !== undefined) {
          filter.version = version;
        }

        const doc = await coll.findOne(filter, { sort: { version: -1 } });
        return doc?.val ?? null;
      }
    },

    tombstone: async (opts) => {
      await this.ensureIndexes();
      
      const { namespace, key, reason } = opts;
      const coll: Collection<SharedMemoryDoc> = this.db.collection('shared_memory');

      // Delete all versions (both latest and append)
      await coll.deleteMany({ tenantId: this.tenantId, namespace, key });
      
      logger.info('Shared memory tombstoned', { tenantId: this.tenantId, namespace, key, reason });
    },
  };

  /**
   * Topics API implementation
   */
  public topics: TopicsApi = {
    ensure: async (opts) => {
      await this.ensureIndexes();
      
      const { topic, shards = 1 } = opts;
      const coll: Collection<TopicDoc> = this.db.collection('topics');

      const doc: TopicDoc = {
        tenantId: this.tenantId,
        topic,
        shards,
        createdAt: new Date(),
      };

      await coll.updateOne(
        { tenantId: this.tenantId, topic },
        { $setOnInsert: doc },
        { upsert: true }
      );
    },

    get: async (opts) => {
      await this.ensureIndexes();
      
      const { topic } = opts;
      const coll: Collection<TopicDoc> = this.db.collection('topics');

      return await coll.findOne({ tenantId: this.tenantId, topic });
    },
  };

  /**
   * Messages API implementation
   */
  public messages: MessagesApi = {
    save: async (opts) => {
      await this.ensureIndexes();
      
      const { topic, msgId, headers, payload, firstSeenAt = new Date(), size } = opts;
      const coll: Collection<MessageDoc> = this.db.collection('messages');

      const payloadSize = size ?? JSON.stringify(payload).length;

      const doc: MessageDoc = {
        tenantId: this.tenantId,
        topic,
        msgId,
        ...(headers && { headers }),
        payload,
        firstSeenAt,
        size: payloadSize,
      };

      // Idempotent insert (ignore duplicates)
      try {
        await coll.insertOne(doc as any);
      } catch (err: any) {
        if (err.code === 11000) {
          // Duplicate key - already saved
          logger.debug('Message already saved', { tenantId: this.tenantId, topic, msgId });
        } else {
          throw err;
        }
      }
    },

    get: async (opts) => {
      await this.ensureIndexes();
      
      const { topic, msgId } = opts;
      const coll: Collection<MessageDoc> = this.db.collection('messages');

      return await coll.findOne({ tenantId: this.tenantId, topic, msgId });
    },

    list: async (opts) => {
      await this.ensureIndexes();
      
      const { topic, after, limit = 100 } = opts;
      const coll: Collection<MessageDoc> = this.db.collection('messages');

      const filter: any = { tenantId: this.tenantId, topic };
      if (after) {
        filter.firstSeenAt = { $gt: after };
      }

      return await coll.find(filter).sort({ firstSeenAt: -1 }).limit(limit).toArray();
    },
  };

  /**
   * Deliveries API implementation (optional)
   */
  public get deliveries(): DeliveriesApi | undefined  {
    if (!this.captureDeliveries) return undefined;

    return {
      append: async (opts) => {
        await this.ensureIndexes();
        
        const { topic, subscription, msgId, attempt, status, consumerId, reason, ts = new Date() } = opts;
        const coll: Collection<DeliveryDoc> = this.db.collection('deliveries');

        const doc: DeliveryDoc = {
          tenantId: this.tenantId,
          topic,
          subscription,
          msgId,
          attempt,
          status,
          ...(consumerId && { consumerId }),
          ...(reason && { reason }),
          ts,
        };

        // Idempotent insert
        try {
          await coll.insertOne(doc as any);
        } catch (err: any) {
          if (err.code === 11000) {
            // Duplicate - update status
            const updateFields: any = { status, ts };
            if (consumerId) updateFields.consumerId = consumerId;
            if (reason) updateFields.reason = reason;
            
            await coll.updateOne(
              { tenantId: this.tenantId, topic, subscription, msgId, attempt },
              { $set: updateFields }
            );
          } else {
            throw err;
          }
        }
      },

      listByMessage: async (opts) => {
        await this.ensureIndexes();
        
        const { topic, subscription, msgId } = opts;
        const coll: Collection<DeliveryDoc> = this.db.collection('deliveries');

        const filter: any = { tenantId: this.tenantId, topic, msgId };
        if (subscription) {
          filter.subscription = subscription;
        }

        return await coll.find(filter).sort({ attempt: 1 }).toArray();
      },
    };
  }

  /**
   * Dead letters API implementation
   */
  public deadLetters: DeadLettersApi = {
    save: async (opts) => {
      await this.ensureIndexes();
      
      const { topic, subscription, msgId, headers, payload, deliveries, reason, failedAt = new Date() } = opts;
      const coll: Collection<DeadLetterDoc> = this.db.collection('dead_letters');

      const doc: DeadLetterDoc = {
        tenantId: this.tenantId,
        topic,
        msgId,
        ...(subscription && { subscription }),
        ...(headers && { headers }),
        payload,
        deliveries,
        failedAt,
        ...(reason && { reason }),
      };

      // Idempotent insert (ignore duplicates)
      try {
        await coll.insertOne(doc as any);
      } catch (err: any) {
        if (err.code === 11000) {
          logger.debug('Dead letter already saved', { tenantId: this.tenantId, topic, msgId });
        } else {
          throw err;
        }
      }
    },

    list: async (opts) => {
      await this.ensureIndexes();
      
      const { topic, after, limit = 100 } = opts;
      const coll: Collection<DeadLetterDoc> = this.db.collection('dead_letters');

      const filter: any = { tenantId: this.tenantId, topic };
      if (after) {
        filter.failedAt = { $gt: after };
      }

      return await coll.find(filter).sort({ failedAt: -1 }).limit(limit).toArray();
    },
  };
}

/**
 * Factory function to create MessagingApi instance
 */
export function createMessagingApi(opts: MessagingApiOptions): MessagingApi {
  return new MessagingApiImpl(opts);
}

