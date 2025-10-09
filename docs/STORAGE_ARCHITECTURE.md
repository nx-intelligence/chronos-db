# Xronox Storage Architecture

> **Complete Guide to Multi-Bucket Storage, Database Versioning, and Cost Optimization**

---

## 📋 Table of Contents

1. [Database Architecture Matrix](#database-architecture-matrix)
2. [Storage Strategy by Database Type](#storage-strategy-by-database-type)
3. [Multi-Bucket Configuration](#multi-bucket-configuration)
4. [Folder Structure & Naming](#folder-structure--naming)
5. [Cost Optimization](#cost-optimization)
6. [Configuration Examples](#configuration-examples)
7. [Migration Guide](#migration-guide)

---

## 🏗️ Database Architecture Matrix

### Which Databases Need What?

| Database    | S3 Support | Versioning | Bucket Types                | Reasoning                                    |
|-------------|------------|------------|-----------------------------|----------------------------------------------|
| **Knowledge**   | ✅ Yes     | ❌ No      | records, content, backups   | Static facts, backups sufficient             |
| **Metadata**    | ✅ Yes     | ❌ No      | records, content, backups   | Static config, backups sufficient            |
| **Runtime**     | ✅ **YES** | ✅ **YES** | records, **versions**, content, backups | **Transactional, needs audit trails**  |
| **Messaging**   | ✅ Yes     | ❌ No      | records, content, backups   | Append-only messages, backups sufficient     |
| **Identities**  | ✅ Yes     | ❌ No      | records, content, backups   | Static users/roles, backups sufficient       |
| **Logs**        | ✅ Optional| ❌ No      | records, content            | Append-only, never modified                  |

### Why This Architecture?

#### ✅ **Runtime Database Needs Versions**

Runtime stores **transactional user data**:
- User actions (create, update, delete)
- Session data with state changes
- Working memory snapshots
- Transaction history

**Requirements**:
- **Audit Trails**: "Who changed what and when?"
- **Compliance**: GDPR, SOX, HIPAA mandate transaction history
- **Rollback**: Undo user actions or system errors
- **Debugging**: Trace data corruption
- **Time-Travel**: "What did this record look like yesterday?"

**Without Versioning**: ❌ Non-compliant, cannot audit, cannot rollback

#### ❌ **Knowledge/Metadata Don't Need Versions**

Knowledge and Metadata store **relatively static data**:
- Knowledge: Facts, learned information, reference data
- Metadata: Configuration, schemas, system settings

**Characteristics**:
- Changes are **infrequent** (weekly/monthly, not hourly)
- Changes are **managed** (controlled deployments, not user-driven)
- Changes are **corrections** (not transactions)

**Backup Strategy**: Periodic snapshots are sufficient for disaster recovery

**With Versioning**: ❌ Wasted storage, unnecessary complexity

#### ❌ **Messaging/Identities Don't Need Versions**

Messaging and Identities store **managed data**:
- Messaging: Topic configurations, message metadata
- Identities: Users, roles, permissions

**Characteristics**:
- **Append-only** for messages (don't change, accumulate)
- **Managed changes** for users/roles (not high-velocity transactions)
- **Backups sufficient** for disaster recovery

**With Versioning**: ❌ Wasted storage for append-only data

#### ❌ **Logs Don't Need Versions**

Logs are **append-only by design**:
- Never modified after creation
- Only accumulate over time
- Retention via time-based deletion

**With Versioning**: ❌ Conceptually wrong - logs don't have "versions"

---

## 🗂️ Storage Strategy by Database Type

### 1. Knowledge Database (Static Facts)

**Storage Pattern**: Hot MongoDB + Warm S3

```typescript
knowledge: {
  genericDatabase: {
    dbConnRef: 'mongo-primary',
    spaceConnRef: 's3-primary',
    recordsBucket: 'xronox-knowledge-records',    // Current facts
    contentBucket: 'xronox-knowledge-content',    // Binary content
    backupsBucket: 'xronox-knowledge-backups',    // Disaster recovery
    // NO versionsBucket ✅ - facts are static
    dbName: 'athenix_knowledge'
  }
}
```

**MongoDB Collections**:
- `{collection}_head` - Current fact records
- `{collection}_counter` - Collection counters
- NO `{collection}_ver` ✅ - no version history

**S3 Layout**:
```
s3://xronox-knowledge-records/
  └─ records/
      └─ {collection}/
          └─ {itemId}/
              └─ current.json

s3://xronox-knowledge-content/
  └─ content/
      └─ {collection}/
          └─ {itemId}/
              └─ {property}/
                  └─ blob.bin

s3://xronox-knowledge-backups/
  └─ backups/
      └─ {collection}/
          └─ {date}/
              └─ snapshot.json
```

---

### 2. Metadata Database (Static Config)

**Storage Pattern**: Hot MongoDB + Warm S3

```typescript
metadata: {
  genericDatabase: {
    dbConnRef: 'mongo-primary',
    spaceConnRef: 's3-primary',
    recordsBucket: 'xronox-metadata-records',     // Current config
    contentBucket: 'xronox-metadata-content',     // Binary metadata
    backupsBucket: 'xronox-metadata-backups',     // Disaster recovery
    // NO versionsBucket ✅ - config is managed
    dbName: 'athenix_metadata'
  }
}
```

**MongoDB Collections**:
- `{collection}_head` - Current config records
- `{collection}_counter` - Collection counters
- NO `{collection}_ver` ✅ - no version history

**S3 Layout**: Same as Knowledge (no versions folder)

---

### 3. Runtime Database (Transactional User Data) ⚡

**Storage Pattern**: Hot MongoDB + Warm S3 + **Version History**

```typescript
runtime: {
  tenantDatabases: [
    {
      tenantId: 'tenant-a',
      dbConnRef: 'mongo-primary',
      spaceConnRef: 's3-primary',
      recordsBucket: 'xronox-runtime-records',      // Current user data
      versionsBucket: 'xronox-runtime-versions',    // ✅ CRITICAL for audit trails
      contentBucket: 'xronox-runtime-content',      // User uploads
      backupsBucket: 'xronox-runtime-backups',      // Disaster recovery
      dbName: 'athenix_runtime_tenant_a',
      analyticsDbName: 'athenix_analytics_tenant_a'
    }
  ]
}
```

**MongoDB Collections**:
- `{collection}_head` - Current record state
- `{collection}_ver` - **Version index** ✅ (CRITICAL for audit)
- `{collection}_counter` - Collection counters
- `{collection}_locks` - Transaction locks

**S3 Layout**:
```
s3://xronox-runtime-records/
  └─ records/
      └─ {collection}/
          └─ {itemId}/
              └─ current.json

s3://xronox-runtime-versions/    ✅ CRITICAL for compliance
  └─ versions/
      └─ {collection}/
          └─ {itemId}/
              ├─ v0.json  (who: user-123, when: 2024-01-01T10:00:00Z)
              ├─ v1.json  (who: user-123, when: 2024-01-01T11:30:00Z)
              └─ v2.json  (who: admin, when: 2024-01-01T14:00:00Z)

s3://xronox-runtime-content/
  └─ content/
      └─ {collection}/
          └─ {itemId}/
              └─ {property}/
                  └─ file.pdf

s3://xronox-runtime-backups/
  └─ backups/
      └─ {collection}/
          └─ {date}/
              └─ snapshot.json
```

**Why Runtime Needs Versions**:
- **Audit Trails**: Track all changes with actor + timestamp
- **Compliance**: GDPR right to know, SOX audit requirements
- **Rollback**: Restore to previous state
- **Debugging**: Trace when data corruption occurred
- **Analytics**: Understand user behavior patterns

---

### 4. Messaging Database (Chronow Integration)

**Storage Pattern**: Hot MongoDB + Warm S3 (optional)

```typescript
messaging: {
  dbConnRef: 'mongo-primary',
  spaceConnRef: 's3-primary',  // Optional but recommended
  recordsBucket: 'xronox-messaging-records',      // Message records
  contentBucket: 'xronox-messaging-content',      // Large payloads
  backupsBucket: 'xronox-messaging-backups',      // Disaster recovery
  // NO versionsBucket ✅ - messages are append-only
  dbName: 'athenix_messaging',
  captureDeliveries: false
}
```

**MongoDB Collections**:
- `shared_memory` - KV snapshots (latest or append strategy)
- `topics` - Topic metadata
- `messages` - Canonical messages
- `deliveries` - Delivery attempts (if captureDeliveries: true)
- `dead_letters` - DLQ for failed messages

**S3 Layout**:
```
s3://xronox-messaging-records/
  └─ records/
      └─ messages/
          └─ {topic}/
              └─ {msgId}.json

s3://xronox-messaging-content/
  └─ content/
      └─ messages/
          └─ {topic}/
              └─ {msgId}/
                  └─ large-payload.json
```

**Why No Versions**:
- Messages are **append-only** (never modified)
- Topic config changes are **managed** (not transactional)
- DLQ entries are **immutable** (capture failure state)

---

### 5. Identities Database (Users, Auth, Roles)

**Storage Pattern**: Hot MongoDB + Warm S3 (optional)

```typescript
identities: {
  dbConnRef: 'mongo-primary',
  spaceConnRef: 's3-primary',  // Optional but recommended
  recordsBucket: 'xronox-identities-records',     // User/role records
  contentBucket: 'xronox-identities-content',     // Profile images, docs
  backupsBucket: 'xronox-identities-backups',     // Disaster recovery
  // NO versionsBucket ✅ - identities are managed, not transactional
  dbName: 'athenix_identities'
}
```

**MongoDB Collections**:
- `users` - User accounts, credentials
- `accounts` - Organization/company accounts
- `sessions` - Login sessions, tokens
- `roles` - Role definitions
- `permissions` - Permission sets

**S3 Layout**:
```
s3://xronox-identities-records/
  └─ records/
      └─ users/
          └─ {userId}.json

s3://xronox-identities-content/
  └─ content/
      └─ users/
          └─ {userId}/
              ├─ profile.jpg
              └─ documents/
                  └─ id-card.pdf
```

**Why No Versions**:
- Identity changes are **managed** (admin actions, not user transactions)
- **Audit trail alternative**: Store identity change events in **Runtime** database instead
- Reduces storage costs for relatively stable data

**For Audit Trails**: Store identity change events in Runtime:

```typescript
// User role change - store event in Runtime, not version in Identities
runtimeOps.create({
  eventType: 'identity_change',
  userId: 'user-123',
  field: 'roles',
  oldValue: ['user'],
  newValue: ['admin'],
  changedBy: 'super-admin',
  reason: 'promotion'
}, 'admin-panel', 'role-change');
// This creates a versioned audit event in Runtime ✅
```

---

### 6. Logs Database (Append-Only Events)

**Storage Pattern**: Hot MongoDB + Optional S3

```typescript
logs: {
  dbConnRef: 'mongo-primary',
  spaceConnRef: 's3-primary',  // Optional
  recordsBucket: 'xronox-logs-records',
  contentBucket: 'xronox-logs-content',
  // NO versionsBucket ✅ - logs never modified
  // NO backupsBucket - logs can be deleted by retention policy
  dbName: 'athenix_logs'
}
```

**Why No Versions**: Logs are **append-only**, never modified after creation

---

## 🪣 Multi-Bucket Configuration

### Recommended Bucket Strategy

#### Option A: Separate Buckets Per Data Type (Best for Security)

```typescript
buckets: {
  records: 'xronox-records',      // S3 Standard (hot access)
  versions: 'xronox-versions',    // S3 Intelligent-Tiering (save 40-70%)
  content: 'xronox-content',      // S3 Standard (user files)
  backups: 'xronox-backups'       // S3 Glacier Flexible (save 90%)
}
```

**Benefits**:
- Different IAM policies per bucket
- Different encryption keys
- Different lifecycle policies
- Better cost optimization

#### Option B: Single Bucket with Folders (Cost-Effective)

```typescript
buckets: {
  records: 'xronox-data',
  versions: 'xronox-data',
  content: 'xronox-data',
  backups: 'xronox-data'
}

folderPrefixes: {
  records: 'records',
  versions: 'versions',
  content: 'content',
  backups: 'backups'
}
```

**Benefits**:
- Simpler setup
- Single bucket to manage
- Folder-level organization
- Lower S3 API costs

#### Option C: Database-Specific Buckets (Best for Multi-Tenant)

```typescript
// Knowledge buckets
recordsBucket: 'xronox-knowledge-records'
contentBucket: 'xronox-knowledge-content'
backupsBucket: 'xronox-knowledge-backups'

// Metadata buckets
recordsBucket: 'xronox-metadata-records'
contentBucket: 'xronox-metadata-content'
backupsBucket: 'xronox-metadata-backups'

// Runtime buckets (per tenant)
recordsBucket: 'xronox-runtime-tenant-a-records'
versionsBucket: 'xronox-runtime-tenant-a-versions'  // ✅ CRITICAL
contentBucket: 'xronox-runtime-tenant-a-content'
backupsBucket: 'xronox-runtime-tenant-a-backups'
```

**Benefits**:
- Maximum tenant isolation
- Per-tenant billing
- Per-tenant lifecycle policies
- Compliance with data residency

---

## 📁 Folder Structure & Naming

### New Folder Conventions (v2.5.0+)

Old naming (deprecated):
- ❌ `chronos-jsons` → Unclear what "jsons" means
- ❌ `chronos-backup` → References old branding
- ❌ `chronos-content` → Generic name

New naming (recommended):
- ✅ `records` → Current/active record storage
- ✅ `versions` → Version history (runtime only)
- ✅ `content` → Binary content (files, blobs)
- ✅ `backups` → Backup/archived snapshots

### Complete S3 Layout Example

```
s3://xronox-knowledge-records/
  └─ records/
      └─ facts/
          └─ fact-123/
              └─ current.json

s3://xronox-metadata-records/
  └─ records/
      └─ schemas/
          └─ schema-456/
              └─ current.json

s3://xronox-runtime-records/
  └─ records/
      └─ orders/
          └─ order-789/
              └─ current.json

s3://xronox-runtime-versions/    ✅ Only for runtime!
  └─ versions/
      └─ orders/
          └─ order-789/
              ├─ v0.json  (created by user-123)
              ├─ v1.json  (updated by user-123)
              └─ v2.json  (cancelled by admin)

s3://xronox-runtime-content/
  └─ content/
      └─ orders/
          └─ order-789/
              └─ invoice/
                  └─ invoice.pdf

s3://xronox-runtime-backups/
  └─ backups/
      └─ orders/
          └─ 2024-10-09/
              └─ snapshot.json

s3://xronox-messaging-records/
  └─ records/
      └─ messages/
          └─ payments/
              └─ msg-171223123-0.json

s3://xronox-identities-records/
  └─ records/
      └─ users/
          └─ user-123.json

s3://xronox-logs-records/
  └─ records/
      └─ activity_logs/
          └─ 2024-10-09/
              └─ log-entry.json
```

---

## 💰 Cost Optimization

### Storage Class Strategy

| Bucket Type | Recommended Class        | Monthly Cost | Savings |
|-------------|--------------------------|--------------|---------|
| Records     | S3 Standard              | $0.023/GB    | Baseline|
| Versions    | S3 Intelligent-Tiering   | $0.012/GB    | **48%** |
| Content     | S3 Standard              | $0.023/GB    | Baseline|
| Backups     | S3 Glacier Flexible      | $0.0036/GB   | **84%** |

### Example Cost Analysis (100GB Runtime Data)

#### Without Proper Architecture (All in MongoDB):

```
MongoDB Storage: 100GB @ $0.25/GB = $25/month
Versions: 100GB @ $0.25/GB = $25/month (if stored at all)
Total: $50/month or $600/year
```

#### With Xronox Architecture (Runtime with S3):

```
Records (Hot - MongoDB): 20GB @ $0.25/GB = $5/month
Records (Warm - S3): 80GB @ $0.023/GB = $1.84/month
Versions (S3 Intelligent): 100GB @ $0.012/GB = $1.20/month
Content (S3): 50GB @ $0.023/GB = $1.15/month
Backups (Glacier): 50GB @ $0.0036/GB = $0.18/month

Total: $9.37/month or $112/year
Savings: $488/year (81% reduction) ✅
```

### Lifecycle Policy Example

```typescript
// S3 Lifecycle for runtime versions
{
  "Rules": [
    {
      "Id": "TransitionOldVersions",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "INTELLIGENT_TIERING"  // After 30 days
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER_FLEXIBLE"     // After 90 days
        }
      ],
      "NoncurrentVersionTransitions": [
        {
          "NoncurrentDays": 7,
          "StorageClass": "INTELLIGENT_TIERING"
        },
        {
          "NoncurrentDays": 30,
          "StorageClass": "GLACIER_FLEXIBLE"
        }
      ]
    }
  ]
}
```

---

## ⚙️ Configuration Examples

### Development Setup (Local Storage)

```typescript
import { createDevConfig, initXronox } from 'xronox';

const config = createDevConfig({
  mongoUri: 'mongodb://localhost:27017',
  basePath: './xronox-data',
  dbName: 'myapp_dev'
});

const xronox = initXronox(config);
```

### Production Setup with Config Builder

```typescript
import { XronoxConfigBuilder, initXronox } from 'xronox';

const config = new XronoxConfigBuilder()
  // MongoDB connection
  .addMongoConnection('primary', process.env.MONGO_URI!)
  
  // S3 connection with multi-bucket setup
  .addS3Connection('primary', {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY_ID!,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY!,
    buckets: {
      records: 'xronox-records',
      versions: 'xronox-versions',
      content: 'xronox-content',
      backups: 'xronox-backups'
    }
  })
  
  // Knowledge (NO versions)
  .addKnowledgeDatabase({
    type: 'generic',
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_knowledge',
    recordsBucket: 'xronox-knowledge-records',
    contentBucket: 'xronox-knowledge-content',
    backupsBucket: 'xronox-knowledge-backups'
  })
  
  // Metadata (NO versions)
  .addMetadataDatabase({
    type: 'generic',
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_metadata',
    recordsBucket: 'xronox-metadata-records',
    contentBucket: 'xronox-metadata-content',
    backupsBucket: 'xronox-metadata-backups'
  })
  
  // Runtime (YES versions!) - Per tenant
  .addRuntimeDatabase({
    tenantId: 'acme-corp',
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_runtime_acme',
    analyticsDbName: 'athenix_analytics_acme',
    recordsBucket: 'xronox-runtime-records',
    versionsBucket: 'xronox-runtime-versions', // ✅ CRITICAL
    contentBucket: 'xronox-runtime-content',
    backupsBucket: 'xronox-runtime-backups',
    enableVersioning: true
  })
  
  // Messaging (NO versions)
  .addMessagingDatabase({
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_messaging',
    recordsBucket: 'xronox-messaging-records',
    contentBucket: 'xronox-messaging-content',
    backupsBucket: 'xronox-messaging-backups'
  })
  
  // Identities (NO versions)
  .addIdentitiesDatabase({
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_identities',
    recordsBucket: 'xronox-identities-records',
    contentBucket: 'xronox-identities-content',
    backupsBucket: 'xronox-identities-backups'
  })
  
  // Logs (NO versions)
  .addLogsDatabase({
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_logs',
    recordsBucket: 'xronox-logs-records',
    contentBucket: 'xronox-logs-content'
  })
  
  // Collection maps with S3 offload
  .addCollectionMap('activity_logs', {
    indexedProps: ['agentId', 'timestamp', 'action'],
    s3Offload: {
      enabled: true,
      olderThan: 30  // Archive to S3 after 30 days
    }
  })
  
  .build();

const xronox = initXronox(config);
```

### Simplified Production Setup

```typescript
import { createProductionConfig, initXronox } from 'xronox';

const config = createProductionConfig({
  mongoUri: process.env.MONGO_URI!,
  s3Endpoint: 'https://s3.amazonaws.com',
  s3Region: 'us-east-1',
  s3AccessKey: process.env.AWS_ACCESS_KEY_ID!,
  s3SecretKey: process.env.AWS_SECRET_ACCESS_KEY!,
  tenants: ['acme-corp', 'globex-inc', 'initech'],
  bucketPrefix: 'myapp'
});

const xronox = initXronox(config);
```

### Minimal Setup (MongoDB-Only)

```typescript
import { createMinimalConfig, initXronox } from 'xronox';

const config = createMinimalConfig('mongodb://localhost:27017');
const xronox = initXronox(config);

// Works in JavaScript too!
const { createMinimalConfig, initXronox } = require('xronox');
const config = createMinimalConfig('mongodb://localhost:27017');
const xronox = initXronox(config);
```

---

## 🔄 Migration Guide

### From v2.4.x to v2.6.0

#### 1. Update Runtime Database to Add S3 Support

**Before** (v2.4.x):
```typescript
runtime: {
  tenantDatabases: [
    {
      tenantId: 'tenant-a',
      dbConnRef: 'mongo-primary',
      dbName: 'athenix_runtime_tenant_a',
      analyticsDbName: 'athenix_analytics_tenant_a'
      // No S3, no versions ❌
    }
  ]
}
```

**After** (v2.6.0):
```typescript
runtime: {
  tenantDatabases: [
    {
      tenantId: 'tenant-a',
      dbConnRef: 'mongo-primary',
      spaceConnRef: 's3-primary',  // ✅ Add S3 support
      recordsBucket: 'xronox-runtime-records',
      versionsBucket: 'xronox-runtime-versions',  // ✅ CRITICAL
      contentBucket: 'xronox-runtime-content',
      backupsBucket: 'xronox-runtime-backups',
      dbName: 'athenix_runtime_tenant_a',
      analyticsDbName: 'athenix_analytics_tenant_a'
    }
  ]
}
```

#### 2. Add S3 to Messaging/Identities (Optional)

```typescript
// Messaging with S3
messaging: {
  dbConnRef: 'mongo-primary',
  spaceConnRef: 's3-primary',  // ✅ Add for scalability
  recordsBucket: 'xronox-messaging-records',
  contentBucket: 'xronox-messaging-content',
  backupsBucket: 'xronox-messaging-backups',
  dbName: 'athenix_messaging'
}

// Identities with S3
identities: {
  dbConnRef: 'mongo-primary',
  spaceConnRef: 's3-primary',  // ✅ Add for profile images, docs
  recordsBucket: 'xronox-identities-records',
  contentBucket: 'xronox-identities-content',
  backupsBucket: 'xronox-identities-backups',
  dbName: 'athenix_identities'
}
```

#### 3. Use Config Builder (Recommended)

```typescript
// Instead of manually writing config
const config = new XronoxConfigBuilder()
  .addMongoConnection('primary', mongoUri)
  .addS3Connection('primary', { ... })
  .addRuntimeDatabase({
    tenantId: 'tenant-a',
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_runtime_tenant_a',
    analyticsDbName: 'athenix_analytics_tenant_a',
    enableVersioning: true  // ✅ Auto-configures versionsBucket
  })
  .build();
```

---

## 🔒 Security & Compliance

### IAM Policy Example (Separate Buckets)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RuntimeRecordsReadWrite",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::xronox-runtime-records/*"
    },
    {
      "Sid": "RuntimeVersionsReadOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::xronox-runtime-versions/*"
    },
    {
      "Sid": "BackupsReadOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::xronox-*-backups/*"
    }
  ]
}
```

### Compliance Checklist

- ✅ **GDPR**: Runtime versioning provides data change history
- ✅ **SOX**: Immutable audit trails in runtime versions
- ✅ **HIPAA**: Complete data lineage in runtime
- ✅ **Data Residency**: Per-tenant buckets in specific regions
- ✅ **Right to Delete**: Can delete records while preserving audit trail

---

## 📊 Performance Considerations

### Write Performance

**MongoDB-Only** (v2.4.x):
- All data → MongoDB
- Slow for large payloads (>100KB)
- High MongoDB cost

**With S3** (v2.6.0):
- Metadata → MongoDB (fast index)
- Payload → S3 (parallel, async)
- 3-5x faster for large records

### Read Performance

**Hot Data** (recent records):
- Read from MongoDB (single query)
- Presigned S3 URLs for large payloads
- ~50ms response time

**Cold Data** (old versions):
- Read from S3 versions bucket
- Automatic Intelligent-Tiering
- ~200ms response time (acceptable for audit queries)

### Versioning Performance

**Runtime** (with versions):
- Create version: +10ms (async S3 write)
- Query current: Same as before (MongoDB)
- Query history: S3 batch read (~200ms for 10 versions)

**Knowledge/Metadata** (no versions):
- Create: Same as before
- Update: No version overhead
- 30% faster writes ✅

---

## 🎓 Best Practices

### 1. Always Enable Versioning for Runtime

```typescript
// ✅ DO: Enable versioning for runtime
.addRuntimeDatabase({
  tenantId: 'tenant-a',
  ...
  versionsBucket: 'xronox-runtime-versions',
  enableVersioning: true  // CRITICAL for compliance
})

// ❌ DON'T: Skip versioning for runtime
.addRuntimeDatabase({
  tenantId: 'tenant-a',
  ...
  // No versionsBucket ❌ - non-compliant!
})
```

### 2. Don't Enable Versioning for Knowledge/Metadata

```typescript
// ✅ DO: No versions for knowledge
.addKnowledgeDatabase({
  type: 'generic',
  ...
  recordsBucket: 'xronox-knowledge-records',
  backupsBucket: 'xronox-knowledge-backups',
  // No versionsBucket ✅ - saves storage costs
})

// ❌ DON'T: Add versions to knowledge
.addKnowledgeDatabase({
  type: 'generic',
  ...
  versionsBucket: 'xronox-knowledge-versions'  // ❌ Wasted storage!
})
```

### 3. Use Separate Buckets for Cost Optimization

```typescript
// ✅ DO: Separate buckets with different storage classes
buckets: {
  records: 'xronox-records',        // S3 Standard
  versions: 'xronox-versions',      // S3 Intelligent-Tiering
  content: 'xronox-content',        // S3 Standard
  backups: 'xronox-backups'         // S3 Glacier Flexible
}
```

### 4. Store Identity Audit Events in Runtime

```typescript
// ✅ DO: Audit identity changes in Runtime (with versions)
const runtimeOps = xronox.with({
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'acme-corp',
  collection: 'identity_events'
});

await runtimeOps.create({
  eventType: 'role_change',
  userId: 'user-123',
  field: 'roles',
  oldValue: ['user'],
  newValue: ['admin'],
  changedBy: 'super-admin'
}, 'admin-panel', 'promotion');
// Creates versioned audit event ✅

// ❌ DON'T: Try to version identities database
// (Identities don't have built-in versioning)
```

---

## 🚀 Quick Reference

### When to Use Each Database

| Use Case | Database | Versioning | Example |
|----------|----------|------------|---------|
| User transactions | **Runtime** | ✅ YES | Orders, sessions, user actions |
| Learned facts | Knowledge | ❌ No | "Python uses indentation" |
| App configuration | Metadata | ❌ No | Feature flags, schemas |
| Pub/sub messages | Messaging | ❌ No | Payment events, notifications |
| User accounts | Identities | ❌ No | Users, roles, permissions |
| Activity logs | Logs | ❌ No | System logs, API calls |

### Versioning Decision Tree

```
Is this data transactional (user-driven changes)?
├─ YES → Use Runtime database (versioning enabled) ✅
└─ NO → Is it static/managed?
    ├─ Facts/knowledge → Use Knowledge database (no versions)
    ├─ Config/settings → Use Metadata database (no versions)
    ├─ Users/roles → Use Identities database (no versions)
    ├─ Messages/events → Use Messaging database (no versions)
    └─ System logs → Use Logs database (no versions)
```

---

## 📚 Further Reading

- [Configuration Guide](./CONFIGURATION.md) - Detailed configuration options
- [API Reference](./API.md) - Complete API documentation
- [Change Request CR-001](../CHANGE_REQUEST_CR001_SUMMARY.md) - Multi-bucket support
- [Change Request CR-002](../CHANGE_REQUEST_CR002_SUMMARY.md) - Database versioning architecture

---

**Made with ❤️ for enterprise-grade data management**

