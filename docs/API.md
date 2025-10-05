# Chronos API Reference

Complete API documentation for Chronos.

---

## Initialization

### `initChronos(config)`

Initialize Chronos with configuration.

**Returns:** `Chronos` instance

```javascript
import { initChronos } from 'chronos-db';

const chronos = initChronos(config);
```

See [CONFIGURATION.md](./CONFIGURATION.md) for config options.

---

## Core API

### `chronos.with(context)`

Bind to a specific database and collection.

**Parameters:**
- `context.dbName` (string) - Database name
- `context.collection` (string) - Collection name
- `context.tenantId` (string, optional) - Tenant ID for multi-tenancy

**Returns:** `BoundOps` - Collection-scoped operations

```javascript
const ops = chronos.with({
  dbName: 'myapp',
  collection: 'users',
  tenantId: 'tenant123',  // optional
});
```

---

## CRUD Operations

### `ops.create(data, actor?, reason?, options?)`

Create a new record.

**Parameters:**
- `data` (object) - Record data
- `actor` (string, optional) - Who performed the action
- `reason` (string, optional) - Why the action was performed
- `options` (object, optional):
  - `parentRecord` - Parent lineage
  - `origin` - External origin
  - `devShadowOverride` - Override dev shadow setting

**Returns:** `Promise<CreateResult>`

```javascript
const result = await ops.create({
  email: 'john@example.com',
  name: 'John Doe',
}, 'system', 'user signup');

// Result: { id, ov: 0, cv, createdAt }
```

**With lineage:**

```javascript
await ops.create(data, 'importer', 'stripe import', {
  origin: {
    id: 'stripe_cus_123',
    collection: 'customers',
    system: 'stripe'
  }
});
```

---

### `ops.update(id, data, expectedOv?, actor?, reason?)`

Update an existing record.

**Parameters:**
- `id` (string) - Record ID
- `data` (object) - Updated fields
- `expectedOv` (number, optional) - Expected version (optimistic lock)
- `actor` (string, optional) - Who performed the action
- `reason` (string, optional) - Why

**Returns:** `Promise<UpdateResult>`

```javascript
await ops.update(
  id,
  { status: 'verified' },
  currentOv,  // Optimistic locking
  'system',
  'email verified'
);

// Result: { id, ov: 1, cv, updatedAt }
```

---

### `ops.delete(id, expectedOv?, actor?, reason?)`

Logically delete a record (hidden by default).

**Parameters:**
- `id` (string) - Record ID
- `expectedOv` (number, optional) - Expected version
- `actor` (string, optional) - Who
- `reason` (string, optional) - Why

**Returns:** `Promise<DeleteResult>`

```javascript
await ops.delete(id, currentOv, 'admin', 'user requested');

// Result: { id, ov, cv, deletedAt }
```

---

### `ops.enrich(id, enrichment, options?)`

Incrementally update with deep merge + array union.

**Parameters:**
- `id` (string) - Record ID
- `enrichment` (object | array) - Data to merge
- `options`:
  - `expectedOv` - Optimistic lock
  - `functionId` - Provenance tracking
  - `actor` - Who
  - `reason` - Why

**Returns:** `Promise<EnrichResult>`

```javascript
await ops.enrich(id, {
  tags: ['premium'],
  metadata: { score: 100 }
}, {
  functionId: 'scorer@v1',
  actor: 'enrichment-pipeline'
});

// Arrays unioned, objects deep merged
```

---

### `ops.smartInsert(data, options)`

Create if not exists, merge if exists (by unique keys).

**Parameters:**
- `data` (object) - Record data
- `options`:
  - `uniqueKeys` (string[]) - Fields to check for existing record
  - `functionId` - Provenance
  - `actor` - Who
  - `reason` - Why
  - `parentRecord` - Lineage
  - `origin` - External origin

**Returns:** `Promise<SmartInsertResult>`

```javascript
const result = await ops.smartInsert(
  { email: 'john@example.com', name: 'John' },
  { uniqueKeys: ['email'], functionId: 'importer@v1' }
);

console.log(result.created);  // true = new, false = merged
```

---

## Read Operations

### `ops.getItem(id, options?)`

Get a record (latest by default, or historical with `ov`/`at`).

**Parameters:**
- `id` (string) - Record ID
- `options`:
  - `ov` (number) - Get specific version
  - `at` (string | Date) - Get version as of time
  - `includeMeta` (boolean) - Include `_meta` with ov/cv/at
  - `includeDeleted` (boolean) - Show deleted records
  - `projection` (string[]) - Field whitelist
  - `presign` (boolean) - Generate presigned URLs
  - `ttlSeconds` (number) - Presigned URL TTL

**Returns:** `Promise<ItemView | null>`

```javascript
// Latest (default)
const user = await ops.getItem(id);

// With metadata
const withMeta = await ops.getItem(id, { includeMeta: true });

// Specific version
const v5 = await ops.getItem(id, { ov: 5 });

// Time-travel
const yesterday = await ops.getItem(id, { at: '2025-09-30T00:00:00Z' });

// Include deleted
const deleted = await ops.getItem(id, { includeDeleted: true });

// Projection
const email = await ops.getItem(id, { projection: ['email'] });
```

---

### `ops.query(filter, options?)`

Query a collection (latest by default, or point-in-time with `at`).

**Parameters:**
- `filter` (object) - MongoDB-like filter on indexed fields
- `options`:
  - `at` (string | Date) - Point-in-time query
  - `includeMeta` (boolean) - Include metadata
  - `includeDeleted` (boolean) - Show deleted
  - `limit` (number) - Max results (default 50, max 1000)
  - `pageToken` (string) - Pagination cursor
  - `projection` (string[]) - Field whitelist
  - `presign` (boolean) - Presigned URLs

**Returns:** `Promise<{ items: ItemView[]; pageToken?: string }>`

```javascript
// Query latest
const active = await ops.query({ status: 'active' });

// Point-in-time query
const monthAgo = await ops.query(
  { status: 'active' },
  { at: '2025-09-01T00:00:00Z' }
);

// Pagination
const page1 = await ops.query({}, { limit: 50 });
const page2 = await ops.query({}, { 
  limit: 50, 
  pageToken: page1.pageToken 
});
```

---

## Restore Operations

### `ops.restoreObject(id, to, options?)`

Restore an object to a previous version.

**Parameters:**
- `id` (string) - Record ID
- `to`:
  - `{ ov: number }` - Restore to specific version
  - `{ at: string }` - Restore to version as of time
- `options`:
  - `actor` - Who
  - `reason` - Why

**Returns:** `Promise<RestoreResult>`

```javascript
// Restore to version 5
await ops.restoreObject(id, { ov: 5 });

// Restore to yesterday's state
await ops.restoreObject(id, { at: '2025-09-30T00:00:00Z' });
```

---

### `ops.restoreCollection(to, options?)`

Restore entire collection to a previous state.

**Parameters:**
- `to`:
  - `{ cv: number }` - Restore to collection version
  - `{ at: string }` - Restore to state as of time

**Returns:** `Promise<CollectionRestoreResult>`

```javascript
await ops.restoreCollection({ cv: 1000 });
await ops.restoreCollection({ at: '2025-09-01T00:00:00Z' });
```

---

## Counters API

### `chronos.counters.getTotals(query)`

Get counter totals for a collection.

```javascript
const totals = await chronos.counters.getTotals({
  dbName: 'myapp',
  collection: 'users',
  tenant: 'tenant123',  // optional
});

// Returns:
// {
//   created: 1000,
//   updated: 500,
//   deleted: 50
// }
```

---

## Admin API

### `chronos.admin.health()`

Check health of all backends.

```javascript
const health = await chronos.admin.health();
// {
//   timestamp: "...",
//   mongoBackends: [{ index: 0, ok: true, pingMs: 5 }],
//   s3Backends: [{ index: 0, ok: true }],
//   countersDb: { ok: true, pingMs: 3 }
// }
```

### `chronos.admin.shutdown()`

Gracefully shutdown all connections.

```javascript
await chronos.admin.shutdown();
```

---

## Fallback Queue API (if enabled)

### `chronos.fallback?.startWorker()`

Start background retry worker.

```javascript
await chronos.fallback?.startWorker();
```

### `chronos.fallback?.getQueueStats()`

Get queue statistics.

```javascript
const stats = await chronos.fallback?.getQueueStats();
// {
//   queueSize: 5,
//   deadLetterSize: 2,
//   oldestPending: Date,
//   byType: { CREATE: 3, UPDATE: 2 }
// }
```

---

## TypeScript Support

Chronos is fully typed:

```typescript
import { 
  initChronos,
  type ChronosConfig,
  type EnhancedChronosConfig,
  type CreateResult,
  type ItemView,
  type SmartInsertOptions
} from 'chronos-db';

const config: ChronosConfig = { /* ... */ };
const chronos = initChronos(config);
```

---

## Next Steps

- [Configuration Guide](./CONFIGURATION.md) - All config options
- [Examples](./EXAMPLES.md) - Common use cases
- [Architecture](./ARCHITECTURE.md) - How it works

---

**Happy time-traveling!** ⏰

