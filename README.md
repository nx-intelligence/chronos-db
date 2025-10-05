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
import { initChronos } from 'chronos-db';

const chronos = initChronos({
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
const ops = chronos.with({
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
await chronos.admin.shutdown();
```

---

## 🏢 Enhanced Multi-Tenant Usage

For complex multi-tenant architectures with multiple database types and tiers:

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  mongoUris: [
    'mongodb://meta-generic:27017',
    'mongodb://meta-domain1:27017', 
    'mongodb://meta-tenant-a:27017',
    'mongodb://know-generic:27017',
    'mongodb://know-domain1:27017',
    'mongodb://know-tenant-a:27017',
    'mongodb://runtime-generic:27017',
    'mongodb://runtime-domain1:27017',
    'mongodb://runtime-tenant-a:27017'
  ],
  spacesConns: [/* your S3 config */],
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'chronos_counters' },
  routing: { hashAlgo: 'rendezvous' },
  retention: {},
  rollup: {},
  
  // Enhanced multi-tenant configuration
  databaseTypes: {
    metadata: {
      generic: { key: 'meta-generic', mongoUri: 'mongodb://meta-generic:27017', dbName: 'meta_generic' },
      domains: [
        { key: 'meta-domain-1', extIdentifier: 'domain-1', mongoUri: 'mongodb://meta-domain1:27017', dbName: 'meta_domain_1' }
      ],
      tenants: [
        { key: 'meta-tenant-a', extIdentifier: 'tenant-a', mongoUri: 'mongodb://meta-tenant-a:27017', dbName: 'meta_tenant_a' }
      ]
    },
    knowledge: {
      generic: { key: 'know-generic', mongoUri: 'mongodb://know-generic:27017', dbName: 'know_generic' },
      domains: [
        { key: 'know-domain-1', extIdentifier: 'domain-1', mongoUri: 'mongodb://know-domain1:27017', dbName: 'know_domain_1' }
      ],
      tenants: [
        { key: 'know-tenant-a', extIdentifier: 'tenant-a', mongoUri: 'mongodb://know-tenant-a:27017', dbName: 'know_tenant_a' }
      ]
    },
    runtime: {
      generic: { key: 'runtime-generic', mongoUri: 'mongodb://runtime-generic:27017', dbName: 'runtime_generic' },
      domains: [
        { key: 'runtime-domain-1', extIdentifier: 'domain-1', mongoUri: 'mongodb://runtime-domain1:27017', dbName: 'runtime_domain_1' }
      ],
      tenants: [
        { key: 'runtime-tenant-a', extIdentifier: 'tenant-a', mongoUri: 'mongodb://runtime-tenant-a:27017', dbName: 'runtime_tenant_a' }
      ]
    }
  }
});

// Option A: Direct key usage (simplest)
const ops = chronos.with({
  key: 'runtime-tenant-a',  // Unique key, automatically resolves everything
  collection: 'users'
});

// Option B: External identifier usage
const ops2 = chronos.with({
  databaseType: 'runtime',
  tier: 'tenant', 
  extIdentifier: 'tenant-a',  // Maps to 'runtime-tenant-a' key
  collection: 'users'
});

// Option C: Generic tier
const ops3 = chronos.with({
  databaseType: 'metadata',
  tier: 'generic',
  collection: 'config'
});

await ops.create({ email: 'user@example.com' });
await ops2.create({ email: 'user2@example.com' });
await ops3.create({ setting: 'value' });
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
const totals = await chronos.counters.getTotals({
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
await chronos.fallback?.startWorker();

// Monitor queue
const stats = await chronos.fallback?.getQueueStats();
console.log('Pending ops:', stats.queueSize);
console.log('Dead letters:', stats.deadLetterSize);

// Retry dead letter operation
const deadLetters = await chronos.fallback?.getDeadLetterOps({}, 10);
for (const op of deadLetters) {
  await chronos.fallback?.retryDeadLetter(op._id.toString());
}

// Stop worker
await chronos.fallback?.stopWorker();
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

### 8. **System Fields & State Management**

Every record includes comprehensive system tracking:

```typescript
{
  "_system": {
    "insertedAt": "2025-10-01T12:00:00Z",
    "updatedAt": "2025-10-01T12:30:00Z",
    "deletedAt": "2025-10-01T13:00:00Z",
    "deleted": false,
    "functionIds": ["scorer@v1", "enricher@v2"],
    "state": "new"  // NEW: Data sync and TTL state
  }
}
```

**State Values:**
- `"new-not-synched"` - Data exists only in MongoDB record, not synced to JSON storage
- `"new"` - Data is synced to JSON storage but hasn't passed TTL
- `"processed"` - Data has passed TTL, some data may only exist in JSON storage

**State Management:**
```typescript
// Mark items as processed based on TTL expiration
const result = await chronos.admin.markItemsAsProcessedByTTL(
  { dbName: 'myapp', collection: 'users' },
  24, // TTL in hours
  { confirm: true, dryRun: false }
);

// Mark specific item as processed
const marked = await chronos.admin.markItemAsProcessed(
  { dbName: 'myapp', collection: 'users' },
  'item-id',
  { confirm: true }
);
```

---

### 9. **Collection Maps & Auto-Indexing**

chronos-db supports flexible collection mapping with automatic indexing:

```typescript
// Option 1: No collection map - all properties are automatically indexed
const chronos = initChronos({
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  // No collectionMaps defined - all properties are indexed automatically
});

// Option 2: Explicit collection map for specific collections
const chronos = initChronos({
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  collectionMaps: {
    users: {
      indexedProps: ['email', 'status'], // Only these are indexed
      validation: {
        requiredIndexed: ['email'], // Required fields
      },
    },
    // Other collections without maps will auto-index all properties
  },
});
```

**Auto-Indexing Behavior:**
- **No collection map**: All properties are automatically indexed (except `_system`)
- **Empty `indexedProps`**: All properties are indexed
- **Specified `indexedProps`**: Only listed properties are indexed
- **Required fields**: Only validated if explicitly defined

**Benefits:**
- ✅ **Zero configuration** for simple use cases
- ✅ **Gradual adoption** - add maps only when needed
- ✅ **Full control** when required for complex schemas
- ✅ **Performance optimization** - index only what you need

---

### 10. **Admin API & DigitalOcean Spaces Integration**

Comprehensive admin tools for production management:

```typescript
// Test S3 connectivity
const connectivity = await chronos.admin.testS3Connectivity({
  dbName: 'myapp',
  collection: 'users'
});

if (connectivity.success) {
  console.log('Available buckets:', connectivity.buckets);
} else {
  console.log('Connectivity issue:', connectivity.error);
}

// Validate DigitalOcean Spaces configuration
const validation = await chronos.admin.validateSpacesConfiguration({
  dbName: 'myapp',
  collection: 'users'
});

if (!validation.valid) {
  console.log('Issues:', validation.issues);
  console.log('Recommendations:', validation.recommendations);
}

// Ensure required buckets exist (with auto-creation)
const bucketResult = await chronos.admin.ensureBucketsExist(
  { dbName: 'myapp', collection: 'users' },
  {
    confirm: true,
    createIfMissing: true,
    dryRun: false
  }
);

console.log(`Checked ${bucketResult.bucketsChecked} buckets`);
console.log(`Created ${bucketResult.bucketsCreated} buckets`);

// State management for TTL processing
const stateResult = await chronos.admin.markItemsAsProcessedByTTL(
  { dbName: 'myapp', collection: 'users' },
  24, // TTL in hours
  { confirm: true, dryRun: false }
);

console.log(`Processed ${stateResult.itemsProcessed} items`);
```

**Admin Functions:**
- `testS3Connectivity()` - Test S3 credentials and list buckets
- `validateSpacesConfiguration()` - Validate DigitalOcean Spaces setup
- `ensureBucketsExist()` - Check and create required buckets
- `markItemsAsProcessedByTTL()` - Process items based on TTL expiration
- `markItemAsProcessed()` - Mark specific item as processed

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
- [DigitalOcean Spaces Integration](./docs/DIGITALOCEAN_SPACES.md) - Complete setup guide
- [DigitalOcean Troubleshooting](./TROUBLESHOOTING_DIGITALOCEAN.md) - Credential and permission issues

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
