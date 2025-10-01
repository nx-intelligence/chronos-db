# `unified-data-manager`

*(S3-agnostic, cost-first & stability-first)*

## 1) Real Use Cases (end-first, cost/stability focus)

### A) KYC / Compliance Docs (large PDFs/images)

* **Need:** immutable history, audit trails, restore; filter by `clientId`, `documentType`.
* **Cost:** Mongo only stores small indexed metadata + head pointer; big PDFs go to S3 storage.
* **Stability:** Versions are append-only; restores just flip pointers (no re-upload).
* **Outcome:** TBs live in cheap object storage; Mongo remains GB-scale.

**Example payload**

```json
{
  "clientId": "12345",
  "documentType": "passport",
  "issuedCountry": "DE",
  "fileContent": "JVBERi0xLjQKJ..."  // base64 PDF
}
```

### B) Customer Profiles with Media

* **Need:** frequent updates, safe rollbacks, fast “latest”.
* **Cost:** Only searchable fields in Mongo; avatar stored as blob in S3; full JSON (by version) also in S3.
* **Stability:** Optimistic locking + transactional head updates; restore OV=3 if OV=4 broke.

### C) High-volume Event Records (millions/day)

* **Need:** search by `incidentId/severity/timestamp`, immutable history, weekly/monthly stats at low cost.
* **Cost:** Counters DB updates tiny per-bucket docs at write-time → cheap analytics; no large scans.
* **Stability:** Append-only `_ver` for recent horizon; older history rolled into compressed manifests in S3.

---

## 2) What it is

A TypeScript **NPM package** that unifies:

* **MongoDB**: indexed metadata + head pointers + **bounded** recent version index.
* **S3-compatible storage**: authoritative **payloads** and **full JSON** per version.
* **Counters DB** (separate Mongo): daily/weekly/monthly aggregates for cheap analytics.

Key traits:

* **Automatic versioning** (OV per object, CV per collection).
* **Explicit restore** (object by `ov/at`, collection by `cv/at`).
* **Base64 externalization** (big fields leave Mongo).
* **1–10 backend pairs** via deterministic hashing.
* **No env vars**: all config passed to `initUnifiedDataManager(configJson)`.

---

## 3) Core Principles (cost & stability)

1. **Mongo = metadata + pointers + hot history** (bounded).
2. **S3 = the truth for payloads & versioned JSON**.
3. **Versions mandatory**; but **Mongo version index is retained only for a window** (days or N versions). Older index entries are **rolled into S3 manifests**.
4. **Restores switch pointers**; never re-upload.
5. **Counters make big data cheap** (write-time aggregation → tiny reads).
6. **Append-only semantics** + **Mongo transactions** (Spaces-first, compensate on failure).
7. **All configuration via JSON init** (providers, buckets, maps, retention, routing, secrets).

---

## 4) Data Placement & Cost Controls

### Mongo (lean)

* `<coll>_head` — latest pointer + search fields (indexed).
* `<coll>_ver` — append-only **bounded window** (time- or count-based).
* `<coll>_counter` — single CV counter row.

### S3-compatible storage (cheap & durable)

* **jsonBucket:** `<coll>/<id>/v<ov>/item.json` (authoritative JSON per version).
* **contentBucket:** `<coll>/<prop>/<id>/v<ov>/blob.bin` (+ optional `text.txt`).
* **backupsBucket:** manifests/snapshots (e.g., `__manifests__/<coll>/YYYY/MM/snap-<CV>.json.gz`).

> **Enable bucket versioning** on `jsonBucket` and `contentBucket`.

### Counters DB (separate Mongo)

* **Daily** `YYYY-MM-DD`, **Weekly** (Monday anchor, `YYYY-MM-DD`), **Monthly** `YYYY-MM`.
* Fields: `created/updated/deleted/restored`, `bytesJson`, `bytesContent`, `itemsTouched`, `tenant`, `dbName`, `collection`.
* Retention: `days/weeks/months` (configurable).

---

## 5) Versioning & Restore (cost-aware)

* **OV** (per object) starts at **0**; **CV** (collection) starts at **0**.
* **Write path:**

  1. Externalize base64 props to `contentBucket`; write `item.json` to `jsonBucket` at `v<ov>`.
  2. Mongo **transaction**: insert `_ver` **if within horizon**, update `_head`, increment `cv`.
* **Roll-up:** Periodically move old `_ver` rows to **compressed manifests** in `backupsBucket`, then delete those `_ver` rows from Mongo. (Payloads remain in S3; manifests keep indexability.)
* **Restore:**

  * If target version in Mongo `_ver` → use it.
  * If rolled-up → read manifest to resolve `{jsonKey, meta}`, write a new `_ver(op:"RESTORE")` inside horizon, update `_head`.

---

## 6) S3-compatibility stance

We use **AWS SDK v3** against any S3-compatible provider. Differences are **config-only**:

* `endpoint` (e.g., AWS/Spaces/MinIO/R2)
* `region` (e.g., `eu-west-1`, `nyc3`)
* `forcePathStyle` (e.g., `true` for MinIO; typically `false` for AWS/Spaces)
* `accessKey`, `secretKey` (passed via init config)

No provider-specific code paths. Avoid non-portable features (we stick to Put/Get/Head/Delete/List + presigned URLs + multipart + versioning).

---

## 7) Functional Requirements

1. **Init (no envs)**

   * `mongoUris[1..10]`, `spacesConns[1..10]` (each with `{endpoint, region, accessKey, secretKey, backupsBucket, jsonBucket, contentBucket, forcePathStyle?}`),
   * `counters: { mongoUri, dbName }`,
   * `collectionMaps`,
   * `routing: { hashAlgo?, chooseKey? }`,
   * `retention: { ver: { days?, maxPerItem? }, counters: { days, weeks, months } }`,
   * `rollup: { enabled, manifestPeriod: "daily|weekly|monthly" }`.

2. **CRUD** with automatic versioning & externalization.

3. **Reads**: `getLatest`, `getVersion(ov)`, `getAsOf(time)`.

4. **Restore**: object `{ov}` / `{at}`, collection `{cv}` / `{at}` with manifest fallback.

5. **Counters** read APIs: `getSeries`, `getLatest`, `getSummary`.

6. **Admin**: `health()`, `shutdown()`, `rollupNow()`, `pruneNow()`.

---

## 8) Non-Functional Requirements

* **Cost ceiling on Mongo** via retention/roll-up.
* **Stability**: transactions, optimistic locking, idempotency (optional request IDs).
* **Security**: private buckets + presigned access; secrets only in init config; redacted logs.
* **Scalability**: up to 10 backends; connection pools; batch restore.
* **Portability**: any S3-compatible provider.
* **Observability**: counters sufficient for ops dashboards and billing.

---

## 9) Guidelines

* **Big stays out of Mongo.** Keep only searchable bits + pointers.
* **Old moves out of Mongo.** Roll-up `_ver` beyond horizon to S3 manifests.
* **Never overwrite.** Every change = new version.
* **Restore by pointer.** Don’t copy payloads; flip the head.
* **Report by counters.** Cheap, pre-aggregated reads.
* **Everything via config JSONs.** No envs, no hidden state.

---

## 10) Example Configs (S3-agnostic + DigitalOcean example)

### 10.1 S3-agnostic template

```json
{
  "mongoUris": ["mongodb+srv://USER:PASS@cluster-a.mongodb.net", "mongodb+srv://USER:PASS@cluster-b.mongodb.net"],
  "spacesConns": [
    {
      "endpoint": "https://s3.example.com",
      "region": "us-east-1",
      "accessKey": "AKIA...",
      "secretKey": "SECRET...",
      "backupsBucket": "udm-backups-a",
      "jsonBucket": "udm-json-a",
      "contentBucket": "udm-content-a",
      "forcePathStyle": false
    },
    {
      "endpoint": "https://s3.example-b.com",
      "region": "eu-west-1",
      "accessKey": "AKIA2...",
      "secretKey": "SECRET2...",
      "backupsBucket": "udm-backups-b",
      "jsonBucket": "udm-json-b",
      "contentBucket": "udm-content-b",
      "forcePathStyle": false
    }
  ],
  "counters": { "mongoUri": "mongodb+srv://USER:PASS@cluster-metrics.mongodb.net", "dbName": "udm_counters" },
  "routing": { "hashAlgo": "rendezvous", "chooseKey": "tenantId|dbName" },
  "retention": { "ver": { "days": 60, "maxPerItem": 30 }, "counters": { "days": 365, "weeks": 260, "months": 120 } },
  "rollup": { "enabled": true, "manifestPeriod": "daily" },
  "collectionMaps": {
    "kycDocuments": {
      "indexedProps": ["clientId", "documentType", "issuedCountry"],
      "base64Props": { "fileContent": { "contentType": "application/pdf" } },
      "validation": { "requiredIndexed": ["clientId", "documentType"] }
    },
    "profiles": {
      "indexedProps": ["customerId", "preferences.language", "preferences.notifications"],
      "base64Props": { "avatar": { "contentType": "image/png" } }
    }
  }
}
```

### 10.2 DigitalOcean Spaces + MongoDB (concrete)

```json
{
  "mongoUris": ["mongodb+srv://app-user:APP_PASS@do-cluster.mongodb.net/app"],
  "spacesConns": [
    {
      "endpoint": "https://nyc3.digitaloceanspaces.com",
      "region": "nyc3",
      "accessKey": "DOxxxxACCESS",
      "secretKey": "DOxxxxSECRET",
      "backupsBucket": "udm-backups-nyc3",
      "jsonBucket": "udm-json-nyc3",
      "contentBucket": "udm-content-nyc3",
      "forcePathStyle": false
    }
  ],
  "counters": { "mongoUri": "mongodb+srv://metrics:PASS@metrics-cluster.mongodb.net", "dbName": "udm_counters" },
  "routing": { "hashAlgo": "rendezvous", "chooseKey": "tenantId|dbName" },
  "retention": { "ver": { "days": 45, "maxPerItem": 20 }, "counters": { "days": 365, "weeks": 104, "months": 48 } },
  "rollup": { "enabled": true, "manifestPeriod": "daily" },
  "collectionMaps": {
    "documents": {
      "indexedProps": ["clientId", "docType", "country"],
      "base64Props": { "content": { "contentType": "application/pdf" } },
      "validation": { "requiredIndexed": ["clientId", "docType"] }
    }
  }
}
```

> To switch to AWS S3/MinIO/R2, change only the `spacesConns` entries (endpoint/region/keys/forcePathStyle). No code changes.
