# Chronos

> **Time-travel persistence for MongoDB** - Automatic versioning, enrichment, and lineage tracking with MongoDB-like simplicity.

[![npm version](https://img.shields.io/npm/v/chronos.svg)](https://www.npmjs.com/package/chronos)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🎯 What is Chronos?

**Chronos** is a MongoDB persistence layer that adds:

- ✨ **Automatic versioning** - Every change creates an immutable version
- ⏰ **Time-travel queries** - Query data as it was at any point in time  
- 🔗 **Lineage tracking** - Know where every record came from
- 🚀 **Enrichment API** - Incrementally update records with deep merge
- 💾 **Flexible storage** - MongoDB + S3 (production) or MongoDB + local folder (development)
- 🛡️ **Reliability** - Fallback queues, retry logic, transaction safety
- 🎨 **MongoDB-like API** - Hides complexity, just works™

**Like MongoDB, but with superpowers.** ⚡

---

## 📦 Installation

```bash
npm install chronos
```

---

## 🚀 Quick Start

### **Minimal Setup (MongoDB Only)**

```javascript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // MongoDB connections - define once, reference by key
  mongoConns: [
    {
      key: 'mongo-main',
      mongoUri: 'mongodb://localhost:27017'
    }
  ],
  
  // Database configuration - can have empty sections
  databases: {
    metadata: [
      { 
        key: 'meta-tenant-a', 
        tenantId: 'tenant-a', 
        mongoConnKey: 'mongo-main',
        dbName: 'meta_tenant_a' 
      }
    ],
    runtime: [
      { 
        key: 'runtime-tenant-a', 
        tenantId: 'tenant-a', 
        mongoConnKey: 'mongo-main',
        dbName: 'runtime_tenant_a' 
      }
    ],
    logs: {
      connection: {
        key: 'logs-main',
        mongoConnKey: 'mongo-main',
        dbName: 'chronos_logs'
      }
    }
    // Note: knowledge is optional - you can omit it entirely
    // Note: You can also omit metadata, runtime, or logs if you don't need them
  },
  
  // Use local folder for storage (perfect for development)
  localStorage: {
    enabled: true,
    basePath: './data',
  },
  
  // Counters (can use same MongoDB)
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters',
  },
  
  // Simple config
  routing: { hashAlgo: 'rendezvous' },
  retention: {
    ver: { days: 90, maxPerItem: 1000 },
    counters: { days: 30, weeks: 12, months: 6 },
  },
  rollup: { enabled: false, manifestPeriod: 'daily' },
  
  // Define your collections
  collectionMaps: {
    users: {
      indexedProps: ['email', 'status'],
      validation: {
        requiredIndexed: ['email'],
      },
    },
  },
});

// MongoDB-like API!
const ops = chronos.with({ 
  key: 'runtime-tenant-a',  // Direct key usage
  collection: 'users' 
});

// Or use tier-based routing
const ops2 = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  extIdentifier: 'tenant-a',
  collection: 'users' 
});

// Or use generic tier
const ops3 = chronos.with({ 
  databaseType: 'metadata',
  tier: 'generic',
  collection: 'config' 
});

// Create
const user = await ops.create({ 
  email: 'john@example.com', 
  name: 'John' 
});

// Read (clean response!)
const john = await ops.getItem(user.id);
// { id: "...", item: { email: "john@example.com", name: "John", _system: {...} } }

// Update
await ops.update(user.id, { status: 'verified' });

// Time-travel!
const yesterday = await ops.getItem(user.id, { at: '2025-09-30T00:00:00Z' });

// Shutdown
await chronos.admin.shutdown();
```

---

## 🎨 Core Concepts

### **1. MongoDB-Like Simplicity**

Chronos hides complexity by default:

```javascript
// Just like MongoDB findOne()
const user = await ops.getItem(id);
// Returns: { id, item: { your data } }
// ✅ No ov, cv, at, metaIndexed cluttering the response!

// Want metadata? Ask for it
const withMeta = await ops.getItem(id, { includeMeta: true });
// Returns: { id, item: {...}, _meta: { ov, cv, at, ... } }

// Want deleted? Ask for it
const deleted = await ops.getItem(id, { includeDeleted: true });

// Want history? Ask for it  
const v5 = await ops.getItem(id, { ov: 5 });
const yesterday = await ops.getItem(id, { at: '2025-09-30' });
```

### **2. Automatic Versioning**

Every change creates an immutable version:

```javascript
await ops.create({ name: 'John' });        // v0
await ops.update(id, { name: 'John Doe' }); // v1
await ops.update(id, { status: 'active' });  // v2

// Query any version
const original = await ops.getItem(id, { ov: 0 });
const current = await ops.getItem(id);  // Latest
```

### **3. Time-Travel Queries**

Query data as it existed at any point in time:

```javascript
// How did this user look yesterday?
const snapshot = await ops.getItem(id, { 
  at: '2025-09-30T00:00:00Z' 
});

// All active users as of last month
const monthAgo = await ops.query(
  { status: 'active' },
  { at: '2025-09-01T00:00:00Z' }
);
```

### **4. Enrichment API**

Incrementally update records with deep merge + array union:

```javascript
// Original data
{ name: "John", tags: ["user"], metadata: { score: 10 } }

// Enrich
await ops.enrich(id, {
  tags: ["premium"],           // Arrays unioned
  metadata: { level: 5 }        // Objects deep merged
}, { functionId: 'enricher@v1' });

// Result
{
  name: "John",
  tags: ["user", "premium"],              // ✅ Union!
  metadata: { score: 10, level: 5 },     // ✅ Merged!
  _system: {
    functionIds: ["enricher@v1"]          // ✅ Provenance!
  }
}
```

### **5. Smart Insert (Upsert with Merge)**

Create if not exists, merge if exists:

```javascript
// First call - creates new record
await ops.smartInsert(
  { email: 'john@example.com', name: 'John' },
  { uniqueKeys: ['email'] }
);

// Second call - merges into existing!
await ops.smartInsert(
  { email: 'john@example.com', status: 'verified' },
  { uniqueKeys: ['email'], functionId: 'importer@v1' }
);

// Result: One record with merged data
```

### **6. Lineage Tracking**

Track where records came from:

```javascript
// Create with external origin
await ops.create(data, 'importer', 'stripe import', {
  origin: {
    id: 'stripe_cus_12345',
    collection: 'customers',
    system: 'stripe'
  }
});

// _system will have:
// {
//   originId: "stripe_cus_12345",
//   originCollection: "stripe:customers"
// }

// Create with parent
await ops.create(childData, 'system', 'child creation', {
  parentRecord: {
    id: parentId,
    collection: 'parents'
  }
});

// _system will have:
// {
//   parentId: "...",
//   parentCollection: "parents",
//   originId: "...",
//   originCollection: "parents"
// }
```

---

## 📚 Documentation

- [Getting Started](./docs/GETTING_STARTED.md) - Installation and first steps
- [Configuration Guide](./docs/CONFIGURATION.md) - All configuration options
- [API Reference](./docs/API.md) - Complete API documentation
- [Examples](./docs/EXAMPLES.md) - Common use cases
- [Architecture](./docs/ARCHITECTURE.md) - How Chronos works

---

## 🌟 Key Features

### **Storage Flexibility**

```javascript
// Development: MongoDB + Local folder
{ 
  localStorage: { enabled: true, basePath: './data' } 
}

// Production: MongoDB + S3
{
  spacesConns: [{ 
    endpoint: 'https://s3.amazonaws.com',
    accessKey: '...',
    secretKey: '...',
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content'
  }]
}
```

### **System Fields**

Every record gets automatic `_system` fields:

```javascript
{
  _system: {
    insertedAt: "2025-10-01T12:00:00Z",
    updatedAt: "2025-10-01T13:00:00Z",
    deletedAt: "2025-10-01T14:00:00Z",  // If deleted
    deleted: false,
    functionIds: ["enricher@v1"],        // Provenance
    parentId: "parent-id",                // Lineage
    parentCollection: "parents",
    originId: "stripe_cus_123",          // External origin
    originCollection: "stripe:customers"
  }
}
```

### **Deleted Items Hidden by Default**

```javascript
await ops.delete(id);         // Logical delete

await ops.getItem(id);        // Returns: null ✅
await ops.query({});          // Excludes deleted ✅

// Explicit access
await ops.getItem(id, { includeDeleted: true });  // Shows deleted
```

---

## 🎯 Common Use Cases

### **1. Audit Trail**

```javascript
// Every change is versioned automatically
await ops.create({ amount: 100 });     // v0
await ops.update(id, { amount: 200 }); // v1
await ops.update(id, { amount: 150 }); // v2

// See complete history
const v0 = await ops.getItem(id, { ov: 0 }); // amount: 100
const v1 = await ops.getItem(id, { ov: 1 }); // amount: 200
const v2 = await ops.getItem(id, { ov: 2 }); // amount: 150
```

### **2. Data Import with Deduplication**

```javascript
for (const externalRecord of externalData) {
  await ops.smartInsert(
    externalRecord,
    { 
      uniqueKeys: ['externalId'],
      origin: {
        id: externalRecord.externalId,
        collection: 'records',
        system: 'legacy_db'
      }
    }
  );
}
// ✅ Automatically creates or merges
// ✅ Tracks external origin
```

### **3. Compliance & Point-in-Time Recovery**

```javascript
// "Show me all active users as of Dec 31, 2024"
const yearEnd = await ops.query(
  { status: 'active' },
  { at: '2024-12-31T23:59:59Z' }
);

// Restore to previous state
await ops.restoreObject(id, { ov: 5 });
await ops.restoreCollection({ cv: 1000 });
```

### **4. Data Enrichment Pipeline**

```javascript
// Stage 1: Import
await ops.create(rawData, 'importer', 'initial');

// Stage 2: Enrich with AI
await ops.enrich(id, { 
  sentiment: 'positive',
  tags: ['urgent']
}, { functionId: 'ai-analyzer@v2' });

// Stage 3: Enrich with external data
await ops.enrich(id, {
  companyInfo: { revenue: '1M' }
}, { functionId: 'enrichment-api@v1' });

// All provenance tracked in _system.functionIds!
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│         Your Application            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│           Chronos API                │
│  (MongoDB-like, hides complexity)   │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
   ┌─────────┐   ┌──────────┐
   │ MongoDB │   │ Storage  │
   │         │   │ S3/Local │
   ├─────────┤   ├──────────┤
   │ _head   │   │ v0/item  │
   │ _ver    │   │ v1/item  │
   │ _counter│   │ v2/item  │
   └─────────┘   └──────────┘
   Fast Index    Full History
```

**MongoDB:** Searchable metadata + version index  
**Storage:** Immutable JSON payloads

---

## 📖 Learn More

See the [docs/](./docs/) folder for:
- Complete API reference
- Configuration guide
- Examples and recipes
- Architecture details

---

## 📄 License

MIT © Sagente

---

**Chronos - Because time-travel should be simple.** ⏰

