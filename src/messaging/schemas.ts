import type { ObjectId } from 'mongodb';

// ============================================================================
// Simple Messaging Schemas (NO versioning, NO _system fields, MongoDB only)
// ============================================================================

/**
 * Shared memory snapshot document
 * Stores key-value snapshots with append or latest-wins strategy
 */
export interface SharedMemoryDoc<T = any> {
  _id?: ObjectId;
  tenantId: string;
  namespace: string;   // Logical grouping from Chronow
  key: string;         // Logical key name
  val: T;              // JSON value (keep small, < 256KB recommended)
  strategy: 'append' | 'latest';
  version?: number;    // For 'append' mode only (0, 1, 2, ...)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Topic metadata document
 * Defines topics used in Chronow messaging
 */
export interface TopicDoc {
  _id?: ObjectId;
  tenantId: string;
  topic: string;       // Unique per tenant
  shards: number;      // Parallelism hint for Chronow hot layer
  createdAt: Date;
}

/**
 * Canonical message document
 * Stores published messages for audit and retrieval
 */
export interface MessageDoc<P = any> {
  _id?: ObjectId;
  tenantId: string;
  topic: string;
  msgId: string;              // Redis stream ID or ULID from Chronow
  headers?: Record<string, string>;
  payload: P;                 // Compact JSON (keep < 256KB)
  firstSeenAt: Date;
  size: number;               // Payload bytes (approximate)
}

/**
 * Delivery attempt document (optional, controlled by captureDeliveries flag)
 * Tracks per-subscription delivery attempts
 */
export interface DeliveryDoc {
  _id?: ObjectId;
  tenantId: string;
  topic: string;
  subscription: string;  // Chronow subscription name
  msgId: string;
  attempt: number;       // 1, 2, 3, ...
  status: 'pending' | 'ack' | 'nack' | 'dead';
  consumerId?: string;   // Chronow consumer tag
  reason?: string;       // For nack/dead
  ts: Date;
}

/**
 * Dead letter document
 * Stores terminally failed messages with audit trail
 */
export interface DeadLetterDoc<P = any> {
  _id?: ObjectId;
  tenantId: string;
  topic: string;
  msgId: string;
  subscription?: string;       // Last failed subscription
  headers?: Record<string, string>;
  payload: P;
  deliveries: number;          // Total attempts before failure
  failedAt: Date;
  reason?: string;
}

// ============================================================================
// Index Definitions
// ============================================================================

export const MESSAGING_INDEXES = {
  shared_memory: [
    // Latest strategy: one doc per (tenant, namespace, key)
    { 
      keys: { tenantId: 1, namespace: 1, key: 1, strategy: 1 }, 
      options: { unique: true, partialFilterExpression: { strategy: 'latest' }, name: 'shared_latest_unique' }
    },
    // Append strategy: versioned history
    { 
      keys: { tenantId: 1, namespace: 1, key: 1, version: -1 }, 
      options: { name: 'shared_append_history' }
    },
    // Freshness lookup
    { 
      keys: { updatedAt: -1 }, 
      options: { name: 'shared_updated' }
    }
  ],
  topics: [
    // Unique topic per tenant
    { 
      keys: { tenantId: 1, topic: 1 }, 
      options: { unique: true, name: 'topics_unique' }
    }
  ],
  messages: [
    // Unique message per tenant/topic
    { 
      keys: { tenantId: 1, topic: 1, msgId: 1 }, 
      options: { unique: true, name: 'messages_unique' }
    },
    // Time-based queries
    { 
      keys: { firstSeenAt: -1 }, 
      options: { name: 'messages_time' }
    },
    // Topic lookup
    { 
      keys: { tenantId: 1, topic: 1, firstSeenAt: -1 }, 
      options: { name: 'messages_topic_time' }
    }
  ],
  deliveries: [
    // Unique delivery attempt
    { 
      keys: { tenantId: 1, topic: 1, subscription: 1, msgId: 1, attempt: 1 }, 
      options: { unique: true, name: 'deliveries_unique' }
    },
    // Message lookup
    { 
      keys: { tenantId: 1, topic: 1, msgId: 1 }, 
      options: { name: 'deliveries_msg' }
    },
    // Time-based cleanup
    { 
      keys: { ts: -1 }, 
      options: { name: 'deliveries_time' }
    }
  ],
  dead_letters: [
    // Lookup by message
    { 
      keys: { tenantId: 1, topic: 1, msgId: 1 }, 
      options: { name: 'dlq_lookup' }
    },
    // Time-based queries
    { 
      keys: { failedAt: -1 }, 
      options: { name: 'dlq_time' }
    },
    // Topic analysis
    { 
      keys: { tenantId: 1, topic: 1, failedAt: -1 }, 
      options: { name: 'dlq_topic_time' }
    }
  ]
};

