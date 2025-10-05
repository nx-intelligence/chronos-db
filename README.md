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

## ⚙️ Configuration Reference

### Basic Configuration

```typescript
interface ChronosConfig {
  // Required: MongoDB connections (1-10 URIs)
  mongoUris: string[];
  
  // Optional: S3-compatible storage (if not using localStorage)
  spacesConns?: SpacesConnConfig[];
  
  // Optional: Local filesystem storage (for development/testing)
  localStorage?: {
    basePath: string;
    enabled: boolean;
  };
  
  // Required: Counters database
  counters: {
    mongoUri: string;
    dbName: string;
  };
  
  // Optional: Routing configuration
  routing?: {
    hashAlgo?: 'rendezvous' | 'jump';
    chooseKey?: string | ((ctx: RouteContext) => string);
  };
  
  // Optional: Data retention policies
  retention?: {
    ver?: {
      days?: number;
      maxPerItem?: number;
    };
    counters?: {
      days?: number;
      weeks?: number;
      months?: number;
    };
  };
  
  // Optional: Data rollup configuration
  rollup?: any;
  
  // Optional: Collection mapping and validation
  collectionMaps?: Record<string, {
    indexedProps: string[]; // Empty array = auto-index all properties
    base64Props?: Record<string, {
      contentType: string;
      preferredText?: boolean;
      textCharset?: string;
    }>;
    validation?: {
      requiredIndexed?: string[];
    };
  }>;
  
  // Optional: Counter rules
  counterRules?: {
    rules?: Array<{
      name: string;
      on?: ('CREATE' | 'UPDATE' | 'DELETE')[];
      scope?: 'meta' | 'payload';
      when: Record<string, any>;
    }>;
  };
  
  // Optional: Development shadow storage
  devShadow?: {
    enabled: boolean;
    ttlHours: number;
    maxBytesPerDoc?: number;
  };
  
  // Optional: Hard delete capability
  hardDeleteEnabled?: boolean;
  
  // Optional: Fallback queue configuration
  fallback?: {
    enabled: boolean;
    maxRetries?: number;
    retryDelayMs?: number;
    maxDelayMs?: number;
    deadLetterCollection?: string;
  };
  
  // Optional: Write optimization
  writeOptimization?: any;
  
  // Optional: Transaction configuration
  transactions?: {
    enabled?: boolean;
    autoDetect?: boolean;
  };
}
```

### Enhanced Multi-Tenant Configuration

```typescript
interface EnhancedChronosConfig extends ChronosConfig {
  // Optional: Enhanced multi-tenant database configuration
  databaseTypes?: {
    metadata?: DatabaseTypeConfig;
    knowledge?: DatabaseTypeConfig;
    runtime?: DatabaseTypeConfig;
  };
}

interface DatabaseTypeConfig {
  generic: DatabaseConnection;
  domains: DatabaseConnection[];
  tenants: DatabaseConnection[];
}

interface DatabaseConnection {
  key: string;                    // Unique identifier
  mongoUri: string;               // MongoDB connection URI
  dbName: string;                 // Database name
  extIdentifier?: string;         // External identifier for mapping
}
```

### Multi-Tenant Architecture Explained

#### Database Types
- **`metadata`** - System configuration, user settings, application metadata
- **`knowledge`** - Content, documents, knowledge base, static data
- **`runtime`** - User data, transactions, dynamic application data

#### Tiers
- **`generic`** - Shared across all tenants (system-wide data)
- **`domain`** - Shared within a domain (multi-tenant within domain)
- **`tenant`** - Isolated per tenant (single-tenant data)

#### Keys vs ExtIdentifiers
- **`key`** - Globally unique identifier for direct routing (e.g., `"runtime-tenant-a"`)
- **`extIdentifier`** - External, non-unique identifier for mapping (e.g., `"tenant-a"`)

#### Usage Patterns

**Option A: Direct Key Usage (Simplest)**
```typescript
const ops = chronos.with({
  key: 'runtime-tenant-a',  // Direct lookup, no resolution needed
  collection: 'users'
});
```

**Option B: Tier + ExtIdentifier Usage**
```typescript
const ops = chronos.with({
  databaseType: 'runtime',     // metadata | knowledge | runtime
  tier: 'tenant',              // generic | domain | tenant
  extIdentifier: 'tenant-a',   // Maps to key: 'runtime-tenant-a'
  collection: 'users'
});
```

**Option C: Generic Tier (No ExtIdentifier)**
```typescript
const ops = chronos.with({
  databaseType: 'metadata',
  tier: 'generic',              // No extIdentifier needed
  collection: 'config'
});
```

#### Complete Multi-Tenant Example

```typescript
const chronos = initChronos({
  mongoUris: [
    // Metadata databases
    'mongodb://meta-generic:27017',
    'mongodb://meta-domain1:27017', 
    'mongodb://meta-tenant-a:27017',
    'mongodb://meta-tenant-b:27017',
    
    // Knowledge databases
    'mongodb://know-generic:27017',
    'mongodb://know-domain1:27017',
    'mongodb://know-tenant-a:27017',
    'mongodb://know-tenant-b:27017',
    
    // Runtime databases
    'mongodb://runtime-generic:27017',
    'mongodb://runtime-domain1:27017',
    'mongodb://runtime-tenant-a:27017',
    'mongodb://runtime-tenant-b:27017'
  ],
  spacesConns: [/* S3 config */],
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'chronos_counters' },
  routing: { hashAlgo: 'rendezvous' },
  retention: {},
  rollup: {},
  
  databaseTypes: {
    metadata: {
      generic: { 
        key: 'meta-generic', 
        mongoUri: 'mongodb://meta-generic:27017', 
        dbName: 'meta_generic' 
      },
      domains: [
        { 
          key: 'meta-domain-1', 
          extIdentifier: 'domain-1', 
          mongoUri: 'mongodb://meta-domain1:27017', 
          dbName: 'meta_domain_1' 
        }
      ],
      tenants: [
        { 
          key: 'meta-tenant-a', 
          extIdentifier: 'tenant-a', 
          mongoUri: 'mongodb://meta-tenant-a:27017', 
          dbName: 'meta_tenant_a' 
        },
        { 
          key: 'meta-tenant-b', 
          extIdentifier: 'tenant-b', 
          mongoUri: 'mongodb://meta-tenant-b:27017', 
          dbName: 'meta_tenant_b' 
        }
      ]
    },
    knowledge: {
      generic: { 
        key: 'know-generic', 
        mongoUri: 'mongodb://know-generic:27017', 
        dbName: 'know_generic' 
      },
      domains: [
        { 
          key: 'know-domain-1', 
          extIdentifier: 'domain-1', 
          mongoUri: 'mongodb://know-domain1:27017', 
          dbName: 'know_domain_1' 
        }
      ],
      tenants: [
        { 
          key: 'know-tenant-a', 
          extIdentifier: 'tenant-a', 
          mongoUri: 'mongodb://know-tenant-a:27017', 
          dbName: 'know_tenant_a' 
        },
        { 
          key: 'know-tenant-b', 
          extIdentifier: 'tenant-b', 
          mongoUri: 'mongodb://know-tenant-b:27017', 
          dbName: 'know_tenant_b' 
        }
      ]
    },
    runtime: {
      generic: { 
        key: 'runtime-generic', 
        mongoUri: 'mongodb://runtime-generic:27017', 
        dbName: 'runtime_generic' 
      },
      domains: [
        { 
          key: 'runtime-domain-1', 
          extIdentifier: 'domain-1', 
          mongoUri: 'mongodb://runtime-domain1:27017', 
          dbName: 'runtime_domain_1' 
        }
      ],
      tenants: [
        { 
          key: 'runtime-tenant-a', 
          extIdentifier: 'tenant-a', 
          mongoUri: 'mongodb://runtime-tenant-a:27017', 
          dbName: 'runtime_tenant_a' 
        },
        { 
          key: 'runtime-tenant-b', 
          extIdentifier: 'tenant-b', 
          mongoUri: 'mongodb://runtime-tenant-b:27017', 
          dbName: 'runtime_tenant_b' 
        }
      ]
    }
  }
});

// Usage Examples:

// 1. Direct key usage (fastest)
const tenantAUsers = chronos.with({
  key: 'runtime-tenant-a',
  collection: 'users'
});

// 2. Tier + extIdentifier usage (flexible)
const tenantAUsers2 = chronos.with({
  databaseType: 'runtime',
  tier: 'tenant',
  extIdentifier: 'tenant-a',  // Resolves to 'runtime-tenant-a'
  collection: 'users'
});

// 3. Generic tier (shared data)
const systemConfig = chronos.with({
  databaseType: 'metadata',
  tier: 'generic',
  collection: 'config'
});

// 4. Domain tier (shared within domain)
const domainContent = chronos.with({
  databaseType: 'knowledge',
  tier: 'domain',
  extIdentifier: 'domain-1',  // Resolves to 'know-domain-1'
  collection: 'articles'
});

// Operations work the same regardless of routing method
await tenantAUsers.create({ email: 'user@tenant-a.com' });
await tenantAUsers2.create({ email: 'user2@tenant-a.com' });
await systemConfig.create({ setting: 'global_value' });
await domainContent.create({ title: 'Shared Article' });
```

### S3 Configuration

```typescript
interface SpacesConnConfig {
  endpoint: string;               // S3 endpoint URL
  region: string;                 // S3 region
  accessKey: string;              // Access key
  secretKey: string;              // Secret key
  backupsBucket: string;         // Backups bucket name
  jsonBucket: string;             // JSON storage bucket name
  contentBucket: string;          // Content storage bucket name
  forcePathStyle?: boolean;       // Force path-style URLs
}
```

### Configuration Examples

#### Minimal Configuration (localStorage)
```typescript
const chronos = initChronos({
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'chronos_counters' },
  routing: { hashAlgo: 'rendezvous' },
  retention: {},
  rollup: {},
});
```

#### Production Configuration (S3)
```typescript
const chronos = initChronos({
  mongoUris: ['mongodb://prod1:27017', 'mongodb://prod2:27017'],
  spacesConns: [{
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    accessKey: 'YOUR_ACCESS_KEY',
    secretKey: 'YOUR_SECRET_KEY',
    backupsBucket: 'chronos-backups',
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
  }],
  counters: { mongoUri: 'mongodb://prod1:27017', dbName: 'chronos_counters' },
  routing: { hashAlgo: 'rendezvous' },
  retention: {
    ver: { days: 30, maxPerItem: 100 },
    counters: { days: 7, weeks: 4, months: 12 }
  },
  rollup: {},
  collectionMaps: {
    users: {
      indexedProps: ['email', 'status'],
      validation: { requiredIndexed: ['email'] }
    }
  },
  devShadow: { enabled: true, ttlHours: 24 },
  fallback: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxDelayMs: 60000,
    deadLetterCollection: 'chronos_fallback_dead'
  },
  transactions: { enabled: true, autoDetect: true }
});
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

## 📋 Frequently Asked Questions (FAQs)

### **Q: What's the difference between ChronosConfig and EnhancedChronosConfig?**
**A:** `ChronosConfig` is the basic configuration for single-tenant or simple multi-tenant setups. `EnhancedChronosConfig` extends it with `databaseTypes` for complex multi-tenant architectures with explicit database types (metadata, knowledge, runtime) and tiers (generic, domain, tenant).

### **Q: When should I use direct keys vs tier + extIdentifier?**
**A:** 
- **Direct keys** (`key: 'runtime-tenant-a'`) - Use when you know the exact database connection and want maximum performance
- **Tier + extIdentifier** (`tier: 'tenant', extIdentifier: 'tenant-a'`) - Use when you want flexible mapping and easier configuration management

### **Q: Can I mix different routing methods in the same application?**
**A:** Yes! You can use different routing methods for different operations:
```typescript
// Direct key for critical operations
const criticalOps = chronos.with({ key: 'runtime-tenant-a', collection: 'payments' });

// Tier-based for flexible operations  
const flexibleOps = chronos.with({ 
  databaseType: 'runtime', 
  tier: 'tenant', 
  extIdentifier: 'tenant-a', 
  collection: 'users' 
});
```

### **Q: What happens if I don't provide a collection map?**
**A:** If no collection map is defined, chronos-db automatically indexes **all properties** (except `_system`). This is called "auto-indexing" and is perfect for rapid prototyping and simple use cases.

### **Q: How does the state field work with TTL?**
**A:** The `state` field tracks data lifecycle:
- `"new-not-synched"` - Data exists only in MongoDB record
- `"new"` - Data is synced to JSON storage but hasn't passed TTL
- `"processed"` - Data has passed TTL, some data may only exist in JSON storage

Use `markItemsAsProcessedByTTL()` to transition states based on TTL expiration.

### **Q: Can I use chronos-db without S3?**
**A:** Yes! Use `localStorage` for development/testing:
```typescript
const chronos = initChronos({
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'chronos_counters' },
  routing: { hashAlgo: 'rendezvous' },
  retention: {},
  rollup: {},
});
```

### **Q: How do I handle failed operations?**
**A:** Enable fallback queues for automatic retry:
```typescript
const chronos = initChronos({
  // ... other config
  fallback: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxDelayMs: 60000,
    deadLetterCollection: 'chronos_fallback_dead'
  }
});
```

### **Q: What's the difference between hard delete and soft delete?**
**A:** 
- **Soft delete** (default) - Sets `deleted: true` and `deletedAt` timestamp, data remains recoverable
- **Hard delete** - Permanently removes data from both MongoDB and S3 (enable with `hardDeleteEnabled: true`)

### **Q: How do I monitor chronos-db performance?**
**A:** Use the admin API for monitoring:
```typescript
// Health check
const health = await chronos.admin.health();

// Backend information
const backends = await chronos.admin.listBackends();

// Counter analytics
const totals = await chronos.counters.getTotals({ dbName: 'myapp', collection: 'users' });
```

### **Q: Can I use chronos-db with DigitalOcean Spaces?**
**A:** Yes! DigitalOcean Spaces is S3-compatible. Use the admin API to validate your configuration:
```typescript
const validation = await chronos.admin.validateSpacesConfiguration({
  dbName: 'myapp',
  collection: 'users'
});

if (!validation.valid) {
  console.log('Issues:', validation.issues);
  console.log('Recommendations:', validation.recommendations);
}
```

---

## 📊 Logging & Monitoring with logs-gateway

chronos-db integrates seamlessly with logs-gateway for comprehensive logging and monitoring:

### **Structured Logging**

chronos-db uses structured logging that works perfectly with logs-gateway:

```typescript
import { logger } from 'chronos-db';

// All chronos-db operations automatically log structured data
const result = await ops.create({ email: 'user@example.com' });

// Logs include:
// - Operation type (CREATE, UPDATE, DELETE)
// - Collection and database information
// - Routing decisions
// - Performance metrics
// - Error details (if any)
```

### **Log Categories**

chronos-db generates logs in these categories:

#### **1. Operation Logs**
```json
{
  "level": "info",
  "category": "chronos-operation",
  "operation": "CREATE",
  "collection": "users",
  "dbName": "myapp",
  "tenantId": "tenant-a",
  "duration": 45,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **2. Routing Logs**
```json
{
  "level": "debug",
  "category": "chronos-routing",
  "method": "getRouteInfo",
  "ctx": {
    "dbName": "myapp",
    "collection": "users",
    "key": "runtime-tenant-a"
  },
  "index": 2,
  "backend": "mongodb://runtime-tenant-a:27017",
  "routingKey": "runtime-tenant-a",
  "resolvedDbName": "runtime_tenant_a"
}
```

#### **3. Performance Logs**
```json
{
  "level": "info",
  "category": "chronos-performance",
  "operation": "bulkCreate",
  "itemsCount": 100,
  "duration": 1250,
  "avgPerItem": 12.5,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### **4. Error Logs**
```json
{
  "level": "error",
  "category": "chronos-error",
  "operation": "UPDATE",
  "error": "OptimisticLockError",
  "message": "Version mismatch: expected 5, got 3",
  "collection": "users",
  "itemId": "507f1f77bcf86cd799439011",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### **logs-gateway Integration**

Configure logs-gateway to capture chronos-db logs:

```typescript
// logs-gateway configuration
const logsGateway = new LogsGateway({
  sources: [
    {
      name: 'chronos-db',
      patterns: [
        'chronos-operation:*',
        'chronos-routing:*', 
        'chronos-performance:*',
        'chronos-error:*'
      ],
      processors: [
        'chronos-performance-analyzer',
        'chronos-error-aggregator',
        'chronos-routing-optimizer'
      ]
    }
  ],
  outputs: [
    {
      type: 'elasticsearch',
      index: 'chronos-logs-{YYYY.MM.DD}'
    },
    {
      type: 'grafana',
      dashboard: 'chronos-db-monitoring'
    }
  ]
});
```

### **Custom Logging**

Add custom logging to your chronos-db operations:

```typescript
// Custom operation logging
const ops = chronos.with({
  key: 'runtime-tenant-a',
  collection: 'users'
});

// Wrap operations with custom logging
const createUser = async (userData) => {
  const startTime = Date.now();
  
  try {
    logger.info('chronos-operation:CREATE:START', {
      collection: 'users',
      tenantId: 'tenant-a',
      userData: { email: userData.email } // Don't log sensitive data
    });
    
    const result = await ops.create(userData);
    
    logger.info('chronos-operation:CREATE:SUCCESS', {
      collection: 'users',
      tenantId: 'tenant-a',
      itemId: result.id,
      duration: Date.now() - startTime
    });
    
    return result;
  } catch (error) {
    logger.error('chronos-operation:CREATE:ERROR', {
      collection: 'users',
      tenantId: 'tenant-a',
      error: error.message,
      duration: Date.now() - startTime
    });
    throw error;
  }
};
```

### **Monitoring Dashboards**

Create Grafana dashboards for chronos-db monitoring:

#### **Performance Dashboard**
- Operations per second by collection
- Average operation duration
- Error rates by operation type
- Backend utilization

#### **Routing Dashboard**  
- Routing decisions by tenant
- Backend distribution
- Routing performance metrics
- Multi-tenant usage patterns

#### **Storage Dashboard**
- S3 storage usage
- MongoDB collection sizes
- TTL processing metrics
- State transition statistics

### **Alerting Rules**

Set up alerts for critical chronos-db metrics:

```yaml
# Prometheus alerting rules
groups:
  - name: chronos-db
    rules:
      - alert: ChronosHighErrorRate
        expr: rate(chronos_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in chronos-db operations"
          
      - alert: ChronosSlowOperations
        expr: histogram_quantile(0.95, rate(chronos_operation_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "95th percentile operation duration exceeds 5 seconds"
          
      - alert: ChronosBackendDown
        expr: up{job="chronos-backend"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Chronos backend is down"
```

### **Log Analysis Queries**

Useful queries for analyzing chronos-db logs:

```sql
-- Top collections by operation count
SELECT collection, COUNT(*) as operations
FROM chronos_logs 
WHERE category = 'chronos-operation'
GROUP BY collection
ORDER BY operations DESC;

-- Average operation duration by tenant
SELECT tenantId, AVG(duration) as avg_duration
FROM chronos_logs 
WHERE category = 'chronos-performance'
GROUP BY tenantId;

-- Error rate by operation type
SELECT operation, 
       COUNT(CASE WHEN level = 'error' THEN 1 END) as errors,
       COUNT(*) as total,
       (errors * 100.0 / total) as error_rate
FROM chronos_logs 
WHERE category = 'chronos-operation'
GROUP BY operation;
```

---

## 📞 Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Made with ❤️ for production-grade data management**
