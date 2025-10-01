# Chronos Architecture

How Chronos works under the hood.

---

## 🏗️ System Overview

```
┌──────────────────────────────────────────┐
│         Your Application                 │
└────────────────┬─────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────┐
│          Chronos (This Package)          │
│  ┌────────────────────────────────────┐  │
│  │  Router (HRW Hashing)              │  │
│  │  Chooses backend for each record   │  │
│  └────────────────────────────────────┘  │
│              │              │             │
│              ▼              ▼             │
│      ┌────────────┐  ┌────────────┐      │
│      │  MongoDB   │  │  Storage   │      │
│      │  (Index)   │  │ (S3/Local) │      │
│      └────────────┘  └────────────┘      │
└──────────────────────────────────────────┘
```

---

## 💾 Data Placement

### **MongoDB Collections**

For each of your collections, Chronos creates 3 MongoDB collections:

```
Your database:
  users                ← Your data (NOT used by Chronos!)
  users_head           ← Latest version pointers
  users_ver            ← Version metadata index (bounded)
  users_counter        ← Collection version counter
```

#### **`users_head` - Latest State**

One document per item with latest version pointer:

```javascript
{
  _id: ObjectId("68dd..."),      // Item ID
  itemId: ObjectId("68dd..."),   // Same as _id
  ov: 5,                          // Current version
  cv: 100,                        // Collection version when updated
  jsonBucket: "json",
  jsonKey: "users/68dd.../v5/item.json",  // ← Pointer to storage!
  metaIndexed: { email: "john@...", status: "active" },
  size: 1024,
  checksum: "abc123",
  updatedAt: Date,
  deletedAt: Date,  // If logically deleted
  fullShadow: { ... }  // Dev shadow (optional)
}
```

#### **`users_ver` - Version Index**

One document per version (bounded by retention):

```javascript
{
  _id: ObjectId("..."),
  itemId: ObjectId("68dd..."),
  ov: 3,
  cv: 50,
  at: ISODate("2025-10-01..."),
  op: "UPDATE",  // CREATE | UPDATE | DELETE | RESTORE
  jsonKey: "users/68dd.../v3/item.json",
  metaIndexed: { email: "john@...", status: "pending" },
  size: 1024,
  checksum: "abc123",
  prevOv: 2,
  actor: "system",
  reason: "email verified"
}
```

**Retention:**
- Keeps last N days (e.g., 90)
- Keeps last N versions per item (e.g., 1000)
- Whichever limit is reached first, older versions pruned from MongoDB
- **But payloads stay in storage!**

#### **`users_counter` - Collection Version**

Single document tracking collection-level version:

```javascript
{
  _id: ObjectId("..."),
  collection: "users",
  cv: 100  // Auto-increments on every change
}
```

---

### **Storage Layout**

```
json/
  users/
    68dd.../
      v0/item.json    ← Full JSON for version 0
      v1/item.json    ← Full JSON for version 1
      v2/item.json    ← ...
      v3/item.json

content/
  users/
    68dd.../
      v0/
        avatar/blob.bin    ← Externalized base64
        avatar/text.txt
      v1/
        document/blob.bin
```

**Storage keeps ALL versions forever** (until hard delete).

---

## 🔄 Write Flow

### **CREATE Operation**

```
1. Generate ObjectId for item
2. Transform data (extract indexed fields, externalize base64)
3. Add _system header
4. Write v0/item.json to storage
5. MongoDB transaction:
   - Increment collection version (cv)
   - Insert users_ver document (ov=0, cv)
   - Insert users_head document (points to v0)
   - Commit
6. Update counters (debounced)
7. Return { id, ov: 0, cv, createdAt }
```

### **UPDATE Operation**

```
1. Read current _head (get current ov)
2. Optimistic lock check (if expectedOv provided)
3. Transform data
4. Update _system.updatedAt
5. Write v{ov+1}/item.json to storage
6. MongoDB transaction:
   - Increment cv
   - Insert users_ver (ov+1, cv)
   - Update users_head (point to new version)
   - Commit
7. Update counters
8. Return { id, ov: ov+1, cv, updatedAt }

If transaction fails → compensate (delete written storage keys)
```

---

## 🔍 Read Flow

### **getItem(id)** - Latest

```
1. Query users_head: { _id: ObjectId(id) }
2. Check if deleted → return null (hidden by default)
3. Get jsonKey from head
4. Fetch item.json from storage
5. Return { id, item: {...} }
```

### **getItem(id, { ov: 5 })** - Specific Version

```
1. Query users_ver: { itemId, ov: 5 }
2. Get jsonKey from version doc
3. Fetch item.json from storage
4. Return { id, item: {...} }
```

### **getItem(id, { at: "2025-09-30" })** - Time-Travel

```
1. Query users_ver: { itemId, at: { $lte: "2025-09-30" } }
2. Sort by at DESC, limit 1
3. Get jsonKey from result
4. Fetch item.json from storage
5. Return { id, item: {...} }
```

---

## 🎨 Enrichment Flow

### **enrich(id, data, opts)**

```
1. Read current version from storage
2. Deep merge with enrichment data:
   - Objects: recursive merge
   - Arrays: union (dedupe primitives, merge objects by id/_id)
3. Update _system:
   - updatedAt = now
   - functionIds += opts.functionId
4. Write new version to storage
5. MongoDB transaction (same as UPDATE)
6. Return { id, ov: ov+1, cv }
```

---

## 🔀 Smart Insert Flow

### **smartInsert(data, { uniqueKeys })**

```
1. Build MongoDB filter from uniqueKeys
   filter = { "metaIndexed.email": "john@..." }

2. Query users_head with filter

3. IF FOUND:
   - Call enrich(foundId, data, opts)
   - Return { id: foundId, created: false }

4. IF NOT FOUND:
   - Call create(data, opts)
   - Return { id: newId, created: true }
```

**Note:** Unique keys MUST be in `indexedProps` for matching to work!

---

## 🛡️ Transaction Safety

### **Saga Pattern**

```
1. Write to storage FIRST (immutable, can't rollback)
2. MongoDB transaction:
   - Insert version
   - Update head
   - Increment counters
3. IF transaction fails:
   - Compensate: delete storage keys
4. IF transaction succeeds:
   - Update analytics counters (async)
```

**Why storage first?**
- Storage writes are immutable
- MongoDB transactions can rollback
- If Mongo fails, we clean up storage
- If storage fails, nothing written to Mongo

---

## 🔄 Routing & Multi-Backend

### **HRW (Rendezvous) Hashing**

```javascript
// Deterministic routing
const key = generateRoutingKey(context);
// key = "tenant123|myapp|users:68dd..."

const index = pickIndexHRW(key, backendIds);
// Always routes same key to same backend!

const backend = backends[index];
// Use backend.mongoUri and backend.s3Config
```

**Benefits:**
- Consistent routing
- Load distribution
- No coordination needed
- Easy to add/remove backends

---

## 📊 Version Retention & Pruning

### **What Gets Pruned**

```
retention: {
  ver: { days: 30, maxPerItem: 100 }
}

Day 0:  v0 created
Day 1:  v1 created
...
Day 31: v31 created

MongoDB users_ver:
  ✅ v31 (0 days old)
  ✅ v30 (1 day old)
  ...
  ✅ v2  (29 days old)
  ✅ v1  (30 days old)
  ❌ v0  (31 days old) ← PRUNED from MongoDB _ver

Storage (all kept):
  ✅ v0/item.json  ← Still in storage!
  ✅ v1/item.json
  ...
  ✅ v31/item.json
```

**Pruning only affects:**
- MongoDB `_ver` index (for query performance)
- MongoDB `devShadow` (if enabled)

**Never pruned:**
- `_head` (latest always kept)
- Storage payloads (kept forever)

---

## 🎯 Storage Adapter Pattern

All code uses `StorageAdapter` interface:

```javascript
interface StorageAdapter {
  putJSON(bucket, key, data)
  getJSON(bucket, key)
  del(bucket, key)
  presignGet(bucket, key, ttl)
  list(bucket, prefix, opts)
  copy(srcBucket, srcKey, dstBucket, dstKey)
}
```

**Implementations:**
- `S3StorageAdapter` - Wraps S3Client
- `LocalStorageAdapter` - Uses filesystem

**Benefits:**
- Code doesn't know about storage backend
- Easy to test without S3
- Can add more adapters (Azure, GCS, etc.)

---

## 🧵 Concurrency & Locking

### **Optimistic Locking**

```javascript
const user = await ops.getItem(id, { includeMeta: true });
// _meta.ov = 5

await ops.update(id, { status: 'verified' }, user._meta.ov);

// If someone else updated (ov now 6):
// ❌ OptimisticLockError!
```

### **Transactions**

All writes use MongoDB transactions:
- Atomic updates to `_ver` + `_head`
- All-or-nothing semantics
- Requires MongoDB replica set (3+ nodes) in production

---

## 📈 Performance Characteristics

### **Write Performance:**
- Storage write: ~100-200ms (S3) or ~10ms (local)
- MongoDB transaction: ~5-20ms
- Total: ~120-250ms per write

### **Read Performance:**
- Latest (from _head): ~5ms (MongoDB only)
- Historical (from _ver): ~10ms (MongoDB) + ~100ms (storage)
- Time-travel query: ~50ms (MongoDB) + ~100ms per item (storage)

### **Optimization:**
- S3 batching: Reduces writes by ~60%
- Counter debouncing: Reduces Mongo writes by ~90%
- Dev shadows: 10x faster reads (development only)

---

## 🔐 Security

- ✅ No environment variables (all config via code)
- ✅ Secrets redacted in error messages
- ✅ Presigned URLs with TTL
- ✅ Private storage buckets
- ✅ MongoDB RBAC supported

---

## 📊 Scalability

**Tested with:**
- 10 backend pairs (MongoDB + S3)
- 100M+ records
- 1B+ versions
- 10K writes/sec with batching

**Limits:**
- Max 10 backends (configurable in code)
- Max 1000 results per query
- Max 1MB dev shadow per document

---

**Want to learn more?** See [API Reference](./API.md) or [Examples](./EXAMPLES.md).

