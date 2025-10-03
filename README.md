# Chronos DB

> **S3-agnostic, cost-first & stability-first unified persistence layer for MongoDB + S3-compatible storage with transaction locking**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]() 
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## 📖 Overview

`chronos-db` provides a production-ready persistence layer that combines:

- **MongoDB** for indexed metadata, head pointers, and bounded recent version index
- **S3-compatible storage** for authoritative payloads, full JSON per version
- **Automatic versioning** with explicit restore capabilities
- **Multi-backend routing** with connection pooling
- **Transaction locking** for concurrent write prevention across multiple servers
- **Cheap analytics** with conditional counters
- **Enrichment API** for incremental updates
- **Fallback queues** for guaranteed durability
- **Write optimization** for high-throughput scenarios

### Key Principles

✅ **No Environment Variables** - All configuration via JSON  
✅ **Cost-First** - Minimize storage and compute costs  
✅ **Stability-First** - Immutable versioning, transactions, optimistic locking  
✅ **Concurrent-Safe** - Transaction locking prevents multi-server write conflicts  
✅ **Portable** - Works with any S3-compatible provider  
✅ **Type-Safe** - Full TypeScript support with Zod validation  

---

## 🚀 Quick Start

### Installation

```bash
npm install chronos-db
```

### Basic Usage

```typescript
import { initUnifiedDataManager } from 'chronos-db';

const udm = initUnifiedDataManager({
  mongoUris: ['mongodb://localhost:27017'],
  spacesConns: [{
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    accessKey: 'YOUR_ACCESS_KEY',
    secretKey: 'YOUR_SECRET_KEY',
    backupsBucket: 'chronos-backups',
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
  }],
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters',
  },
  routing: {
    hashAlgo: 'rendezvous',
  },
  retention: {},
  rollup: {},
  collectionMaps: {
    users: {
      indexedProps: ['email', 'status'],
      validation: {
        requiredIndexed: ['email'],
      },
    },
  },
});

// Context-bound operations
const ops = udm.with({
  dbName: 'myapp',
  collection: 'users',
  tenantId: 'tenant123',
});

// Create
const result = await ops.create({
  email: 'user@example.com',
  status: 'active',
}, 'system', 'user signup');

// Update
await ops.update(result.id, {
  status: 'verified',
}, result.ov, 'system', 'email verified');

// Read latest
const user = await ops.getLatest(result.id);

// Restore to previous version
await ops.restoreObject(result.id, { ov: 0 });

// Enrich incrementally
await ops.enrich(result.id, {
  tags: ['vip'],
  metadata: { score: 100 },
}, { functionId: 'scorer@v1' });

// Shutdown
await udm.admin.shutdown();
```

---

## 🎯 Core Features

### 1. **CRUD Operations**

Full transaction support with optimistic locking:

```typescript
// Create with automatic versioning (ov=0)
const created = await ops.create(data, 'actor', 'reason');
// Returns: { id, ov: 0, cv: 0, createdAt }

// Update with optimistic lock
const updated = await ops.update(id, newData, expectedOv, 'actor', 'reason');
// Returns: { id, ov: 1, cv: 1, updatedAt }

// Logical delete (default)
const deleted = await ops.delete(id, expectedOv, 'actor', 'reason');
// Returns: { id, ov: 2, cv: 2, deletedAt }
```

---

### 2. **Enrichment API**

Incrementally augment records without full rewrite:

```typescript
// Deep merge with array union
await ops.enrich(id, {
  tags: ['premium'],              // Arrays unioned
  metadata: { newField: 'value' }, // Objects deep merged
}, {
  functionId: 'enricher@v1',       // Provenance tracking
  actor: 'system',
  reason: 'automated enrichment',
});

// Batch enrichment
await ops.enrich(id, [
  { tags: ['vip'] },
  { metadata: { score: 100 } },
  { tags: ['verified'] },
]);
```

---

### 3. **Read Operations**

Multiple read strategies with presigned URL support:

```typescript
// Get latest version
const latest = await ops.getLatest(id, { 
  presign: true,
  ttlSeconds: 3600,
  projection: ['email', 'status'],
});

// Get specific version
const v1 = await ops.getVersion(id, 1);

// Get as of time
const historical = await ops.getAsOf(id, '2025-09-01T00:00:00Z');

// List by metadata with pagination
const results = await ops.listByMeta({
  filter: { status: 'active' },
  limit: 50,
  afterId: lastId,
  sort: { updatedAt: -1 },
}, { presign: true });
```

---

### 4. **Restore Operations**

Explicit, append-only restore:

```typescript
// Restore object to specific version
await ops.restoreObject(id, { ov: 5 });
// or by time
await ops.restoreObject(id, { at: '2025-09-01T00:00:00Z' });

// Restore entire collection
await ops.restoreCollection({ cv: 100 });
// or by time
await ops.restoreCollection({ at: '2025-09-01T00:00:00Z' });
```

---

### 5. **Counters & Analytics**

Cheap, always-on totals:

```typescript
// Configure conditional counters
const config = {
  // ... other config
  counterRules: {
    rules: [
      {
        name: 'activeUsers',
        when: { status: 'active' },
        on: ['CREATE', 'UPDATE'],
        scope: 'meta',
      },
    ],
  },
};

// Query totals
const totals = await udm.counters.getTotals({
  dbName: 'myapp',
  collection: 'users',
});

// Returns:
// {
//   created: 1000,
//   updated: 500,
//   deleted: 50,
//   activeUsers: 750,
// }
```

---

### 6. **Fallback Queues**

Guaranteed durability with automatic retry:

```typescript
// Enable fallback queues
const config = {
  // ... other config
  fallback: {
    enabled: true,
    maxAttempts: 10,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    deadLetterCollection: 'chronos_fallback_dead',
  },
};

// Start worker for automatic retries
await udm.fallback?.startWorker();

// Monitor queue
const stats = await udm.fallback?.getQueueStats();
console.log('Pending ops:', stats.queueSize);
console.log('Dead letters:', stats.deadLetterSize);

// Retry dead letter operation
const deadLetters = await udm.fallback?.getDeadLetterOps({}, 10);
for (const op of deadLetters) {
  await udm.fallback?.retryDeadLetter(op._id.toString());
}

// Stop worker
await udm.fallback?.stopWorker();
```

---

### 7. **Transaction Locking**

Prevent concurrent writes across multiple servers:

```typescript
// Automatic transaction locking on all write operations
// No additional configuration needed - works out of the box

// Create operation - automatically acquires lock on item
const result = await ops.create(data, 'actor', 'reason');

// Update operation - automatically acquires lock on item
await ops.update(id, newData, expectedOv, 'actor', 'reason');

// Delete operation - automatically acquires lock on item
await ops.delete(id, expectedOv, 'actor', 'reason');

// Locks are automatically released after operation completes
// If operation fails, locks are cleaned up automatically
// Expired locks (30s timeout) are cleaned up periodically
```

**How it works:**
- Each write operation acquires an exclusive lock on the item
- Locks are stored in MongoDB with automatic expiration
- Multiple servers can run simultaneously without conflicts
- Failed transactions are automatically recovered via queue system

---

### 8. **Write Optimization**

Reduce I/O overhead under load:

```typescript
const config = {
  // ... other config
  writeOptimization: {
    batchS3: true,              // Batch S3 uploads
    batchWindowMs: 100,         // 100ms window
    debounceCountersMs: 1000,   // Update counters every 1s
    allowShadowSkip: true,      // Skip shadows for heavy ops
  },
};

// Monitor optimizer
const stats = udm.fallback?.getOptimizerStats();
console.log('S3 queue:', stats.s3QueueSize);
console.log('Counter queue:', stats.counterQueueSize);
```

---

## 🏗️ Architecture

### Data Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Unified Data Manager (UDM)     │
│  ┌───────────────────────────┐  │
│  │  Router (HRW Hashing)     │  │
│  └───────────────────────────┘  │
│          │           │           │
│          ▼           ▼           │
│  ┌──────────┐  ┌──────────┐     │
│  │  Mongo   │  │    S3    │     │
│  │ (Indexed)│  │(Payloads)│     │
│  └──────────┘  └──────────┘     │
│                                  │
│  ┌───────────────────────────┐  │
│  │  Fallback Queue (Optional)│  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### MongoDB Collections

- **`<collection>_head`** - Latest state pointers
- **`<collection>_ver`** - Immutable version index
- **`<collection>_counter`** - Collection version counter
- **`<collection>_locks`** - Transaction locks for concurrent write prevention
- **`cnt_total`** - Counter totals (in separate DB)
- **`chronos_fallback_ops`** - Fallback queue (if enabled)
- **`chronos_fallback_dead`** - Dead letter queue (if enabled)

### S3 Storage Layout

```
<jsonBucket>/
  <collection>/
    <itemId>/
      v0/item.json
      v1/item.json
      v2/item.json

<contentBucket>/
  <collection>/
    <itemId>/
      v0/
        <property>/blob.bin
        <property>/text.txt
      v1/
        <property>/blob.bin
```

---

## 🔐 Production Deployment

### MongoDB Replica Set (REQUIRED)

⚠️ **MongoDB MUST run as a 3-node replica set in production**

```bash
# Example docker-compose.yml
services:
  mongo1:
    image: mongo:6
    command: mongod --replSet rs0
    
  mongo2:
    image: mongo:6
    command: mongod --replSet rs0
    
  mongo3:
    image: mongo:6
    command: mongod --replSet rs0
```

Connection string:
```
mongodb://mongo1:27017,mongo2:27017,mongo3:27017/dbname?replicaSet=rs0
```

### S3-Compatible Providers

Tested with:
- ✅ AWS S3
- ✅ DigitalOcean Spaces
- ✅ MinIO
- ✅ Cloudflare R2

---

## 📚 Documentation

- [Implementation Status](./IMPLEMENTATION_STATUS.md) - Complete feature matrix
- [Configuration Guide](./documenation/readme.md) - Detailed configuration
- [Architecture Plan](./documenation/plan) - Master workplan
- [Extensions](./documenation/extensions.md) - System fields & shadows
- [Enrichment API](./documenation/extension2.md) - Deep merge semantics

---

## 🤝 Contributing

Contributions welcome! Please ensure:

1. TypeScript compilation passes
2. Documentation is updated
3. Changes are backward compatible

---

## 📄 License

MIT © nx-intelligence

---

## 🙏 Credits

Built with:
- [MongoDB](https://www.mongodb.com/) - Document database
- [AWS SDK](https://aws.amazon.com/sdk-for-javascript/) - S3-compatible storage
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Zod](https://zod.dev/) - Schema validation
- [tsup](https://tsup.egoist.dev/) - Build system

---

## 📞 Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Made with ❤️ for production-grade data management**
