# Stage Q — Cookbook

## 0) Quick glossary

* **OV**: object version (per item, starts at 0)
* **CV**: collection version (global monotonic counter)
* **metaIndexed**: the small, searchable subset that lives in Mongo `_head`
* **ref**: an externalized field that lives in S3 (we return a `{ref:{...}}` object and can presign URLs)

---

## 1) Multi-tenant setup (2 backends, sticky routing by `tenantId`)

### 1.1 Config (S3-agnostic; example uses DigitalOcean Spaces)

```json
{
  "mongoUris": [
    "mongodb+srv://u:p@cluster-a.mongodb.net",
    "mongodb+srv://u:p@cluster-b.mongodb.net"
  ],
  "spacesConns": [
    {
      "endpoint": "https://nyc3.digitaloceanspaces.com",
      "region": "nyc3",
      "accessKey": "DO_A",
      "secretKey": "SECRET_A",
      "backupsBucket": "udm-backups-a",
      "jsonBucket": "udm-json-a",
      "contentBucket": "udm-content-a"
    },
    {
      "endpoint": "https://ams3.digitaloceanspaces.com",
      "region": "ams3",
      "accessKey": "DO_B",
      "secretKey": "SECRET_B",
      "backupsBucket": "udm-backups-b",
      "jsonBucket": "udm-json-b",
      "contentBucket": "udm-content-b"
    }
  ],
  "counters": { "mongoUri": "mongodb+srv://u:p@metrics.mongodb.net", "dbName": "udm_counters" },
  "routing": { "hashAlgo": "rendezvous", "chooseKey": "tenantId|dbName" },
  "retention": { "ver": {} },
  "collectionMaps": {
    "documents": {
      "indexedProps": ["tenantId", "clientId", "docType", "country"],
      "base64Props": { "content": { "contentType": "application/pdf" } },
      "validation": { "requiredIndexed": ["tenantId", "clientId", "docType"] }
    }
  },
  "counterRules": {
    "rules": [
      { "name": "countryDE", "on": ["CREATE","UPDATE","DELETE"], "scope": "meta", "when": { "country": "DE" } }
    ]
  }
}
```

### 1.2 Init

```ts
import { initUnifiedDataManager } from "unified-data-manager";
import cfg from "./config.json";

const udm = await initUnifiedDataManager(cfg);
```

*Routing behavior:* all requests with the same `tenantId` go to the same backend (good locality, no cross-backend joins).

---

## 2) Create / Update / Delete (with externalized base64)

```ts
const ctx = { dbName: "app", collection: "documents", tenantId: "acme" };

// CREATE (OV=0)
const { id, ov, cv } = await udm.createItem(
  ctx,
  {
    tenantId: "acme",
    clientId: "C-1001",
    docType: "passport",
    country: "DE",
    // externalized base64 (mapped in collectionMaps.base64Props)
    content: Buffer.from("%PDF-1.7 minimal demo\n").toString("base64")
  },
  { actor: "user:42", reason: "KYC onboarding" }
);

// UPDATE (full replacement, OV=1)
await udm.updateItem(
  ctx,
  id,
  {
    tenantId: "acme",
    clientId: "C-1001",
    docType: "passport",
    country: "DE",
    content: Buffer.from("%PDF-1.7 v2\n").toString("base64")
  },
  { expectedOv: ov } // optimistic lock
);

// DELETE (OV=2)
await udm.deleteItem(ctx, id, { expectedOv: 1, reason: "GDPR delete request" });
```

**Notes**

* Update is full-document replacement in v1 (simpler invariants).
* Delete writes a `_ver(op:"DELETE")` and marks `_head.deletedAt` (payloads remain for audit/restore).

---

## 3) Read latest / by version / as-of time (with optional presigned URLs)

```ts
// Latest (head)
const latest = await udm.getLatest(ctx, id, {
  presign: true,
  ttlSeconds: 600, // 10 minutes
  projection: ["tenantId","clientId","docType","country","content"] // keep response slim
});

// Specific OV
const v0 = await udm.getVersion(ctx, id, 0, { presign: false });

// As of time
const asOf = await udm.getAsOf(ctx, id, "2025-09-30T10:00:00.000Z", { presign: true });
```

**What you get:** an `ItemView` with `item` (transformed JSON). Any externalized fields appear as:

```json
"content": {
  "ref": {
    "contentBucket": "udm-content-a",
    "blobKey": "documents/content/<id>/v1/blob.bin"
  }
}
```

When `presign:true`, a `presigned.content.blobUrl` is returned for direct, time-limited access.

---

## 4) Search by metadata (paginated)

```ts
const page1 = await udm.listByMeta(
  ctx,
  {
    filter: { "metaIndexed.clientId": { $eq: "C-1001" }, "metaIndexed.country": "DE" },
    sort: { updatedAt: -1 },
    limit: 50
  },
  { presign: false }
);

const page2 = await udm.listByMeta(
  ctx,
  { filter: { "metaIndexed.country": { $in: ["DE","FR"] } }, afterId: page1.nextAfterId, limit: 50 },
  {}
);
```

**Filters allowed:** `$eq, $ne, $in, $nin, $exists, $gt, $gte, $lt, $lte, $regex` on `metaIndexed.*` (dot paths OK).
**Pagination:** by `_id` cursor (`afterId` from last page).

---

## 5) Conditional counters (totals-only) — rules and queries

### 5.1 Rules (already in config above)

```json
{ "name": "countryDE", "on": ["CREATE","UPDATE","DELETE"], "scope": "meta", "when": { "country": "DE" } }
```

### 5.2 Read totals

```ts
const totals = await udm.counters.getTotals({
  dbName: "app",
  collection: "documents",
  tenant?: "acme",        // optional; omit for all-tenant totals if you track that way
  includeRules: true,
  rules: ["countryDE"]    // optional subset
});
/*
{
  _id: "tenant:acme|db:app|coll:documents",
  created: 123,
  updated: 456,
  deleted: 12,
  rules: { countryDE: { created: 83, updated: 220, deleted: 8 } },
  lastAt: "2025-09-30T12:34:56.789Z"
}
*/
```

> **No buckets.** Counters store **only totals** (created/updated/deleted) plus rule-conditioned totals.

---

## 6) Restore an entire collection (by CV or by time)

### 6.1 Restore by **CV**

```ts
const targetCv = 5000;

const result = await udm.restoreCollection(
  { dbName: "app", collection: "documents", tenantId: "acme" },
  { cv: targetCv },
  { pageSize: 500, parallel: 4, dryRun: false, reason: "rollback: bad release" }
);
/*
{
  target: { cv: 5000, resolvedCv: 5000, resolvedAt: "2025-09-29T21:12:33.000Z" },
  planned: 18340,
  restored: 18340
}
*/
```

**How it works**

* For each item, select the last `_ver` with `cv <= targetCv` and append a new `_ver(op:"RESTORE")`, flipping `_head` to those pointers.
* No S3 uploads; it’s pointer flips.

### 6.2 Restore by **time**

```ts
const result = await udm.restoreCollection(
  { dbName: "app", collection: "documents", tenantId: "acme" },
  { at: "2025-09-29T21:00:00.000Z" },
  { pageSize: 300, parallel: 8, dryRun: true }  // dry-run first!
);
```

* Time is converted to a **resolved CV** via `_ver` (we keep all versions).
* Dry-run shows how many items would change without writing.

---

## 7) Object restore (to OV or time)

```ts
await udm.restoreObject(
  { dbName: "app", collection: "documents", tenantId: "acme" },
  id,
  { ov: 0 },
  { expectedHeadOv: 2, actor: "admin:1", reason: "manual rollback" }
);
```

* Appends `_ver(op:"RESTORE")` with **new ov** (3) pointing at v0’s snapshot; updates `_head`.

---

## 8) Optimistic locking patterns

### 8.1 Safe update loop

```ts
async function safeUpdate(udm, ctx, id, mutate) {
  const head = await udm.getLatest(ctx, id);
  if (!head) throw new Error("NotFound");

  const next = mutate(head.item); // your business logic (pure function)

  return await udm.updateItem(ctx, id, next, { expectedOv: head.ov });
}
```

### 8.2 Conflict handling

```ts
try {
  await udm.updateItem(ctx, id, patch, { expectedOv: knownOv });
} catch (e: any) {
  if (e.code === "OptimisticLock") {
    // re-read, merge, retry or bubble to client with 409 semantics
  } else {
    throw e;
  }
}
```

---

## 9) Projections and presign hygiene

* If your `item.json` has many fields, **use `projection`** to trim:

```ts
await udm.getLatest(ctx, id, { projection: ["clientId","docType","country"] });
```

* Only presign what’s needed (turn it **off** by default; **on** at the edge/API).

---

## 10) Listing “deleted” vs active

```ts
// Only active
const active = await udm.listByMeta(
  ctx,
  { filter: { "deletedAt": { $exists: false } }, limit: 50 },
  {}
);

// Only deleted
const deleted = await udm.listByMeta(
  ctx,
  { filter: { "deletedAt": { $exists: true } }, limit: 50 },
  {}
);
```

*(We expose `deletedAt` from `_head` in ItemView for convenience.)*

---

## 11) Cross-collection example: Profiles with avatar

### 11.1 Map

```json
{
  "indexedProps": ["tenantId","customerId","preferences.language","status"],
  "base64Props": { "avatar": { "contentType": "image/png" } }
}
```

### 11.2 Create + Read avatar URL

```ts
const pctx = { dbName: "app", collection: "profiles", tenantId: "acme" };

// create
const created = await udm.createItem(pctx, {
  tenantId: "acme",
  customerId: "U-2001",
  preferences: { language: "en" },
  status: "active",
  avatar: Buffer.from(/* png bytes */).toString("base64")
});

// read with presign
const profile = await udm.getLatest(pctx, created.id, { presign: true, ttlSeconds: 300 });
const avatarUrl = profile.presigned?.avatar?.blobUrl;
```

---

## 12) Multi-tenant queries

List last 50 German docs for **specific tenant**:

```ts
await udm.listByMeta(
  { dbName: "app", collection: "documents", tenantId: "acme" },
  { filter: { "metaIndexed.country": "DE" }, limit: 50 },
  {}
);
```

> Routing ensures these all hit the same backend (great locality).

---

## 13) Health & admin

```ts
const status = await udm.health();
/*
{
  timestamp: "...",
  router: { backends: [ {index:0, mongoUri:"...", s3Endpoint:"..."}, ... ] },
  mongoBackends: [ {index:0, ok:true, pingMs:4}, ... ],
  s3Backends: [ {index:0, ok:true}, ... ],
  countersDb: { ok:true, pingMs:2 }
}
*/

await udm.shutdown(); // gracefully close Mongo pools
```

---

## 14) Minimal E2E smoke (script you can run)

```ts
// smoke.ts
import { initUnifiedDataManager } from "unified-data-manager";
import cfg from "./config.json";

(async () => {
  const udm = await initUnifiedDataManager(cfg);
  const ctx = { dbName: "app", collection: "documents", tenantId: "acme" };

  const created = await udm.createItem(ctx, {
    tenantId: "acme", clientId: "C-1", docType: "invoice", country: "FR",
    content: Buffer.from("hi").toString("base64")
  });

  await udm.updateItem(ctx, created.id, {
    tenantId: "acme", clientId: "C-1", docType: "invoice", country: "FR",
    content: Buffer.from("hi v2").toString("base64")
  }, { expectedOv: 0 });

  const latest = await udm.getLatest(ctx, created.id, { presign: false });
  console.log({ latestOv: latest?.ov, latestCv: latest?.cv });

  const totals = await udm.counters.getTotals({ dbName: "app", collection: "documents", tenant: "acme", includeRules: true });
  console.log(totals);

  await udm.shutdown();
})();
```

---

## 15) Troubleshooting tips

* **OptimisticLock**: someone updated the item; re-read head, merge, retry.
* **S3 permission errors**: check keys/ACL and bucket names in config; we require private buckets and presigned reads.
* **Search feels slow**: add/adjust indexes via `indexedProps` in your `collectionMaps`; keep filters within the supported subset.
* **Big reads**: use `projection` and keep `limit` reasonable; presign only on-demand.

---

## 16) Patterns to copy

* **Idempotency at API layer**: attach a request ID in your service; retry only when safe.
* **Tenant stickiness**: always include `tenantId` in `metaIndexed` and routing key.
* **Audit trails**: add `actor`/`reason` to CRUD/restore calls—these land in `_ver`.
* **Hard deletes?** avoid; you’d lose restore. Keep logical deletes.
