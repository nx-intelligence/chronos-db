# Change Request CR-002: Correct Database-Level Versioning & Runtime S3 Support

**Status**: In Progress  
**Version**: 2.6.0  
**Date**: 2025-10-09  
**Depends On**: CR-001 (Multi-Bucket Support)

## Summary

Fix architectural mismatch: Remove versioning from Knowledge/Metadata (static data), add S3 and versioning to Runtime (transactional data), and add S3 support to Messaging/Identities (static, no versions).

## Key Changes

### 1. Runtime Database - ADD S3 + Versioning ✅

**Why**: Runtime stores transactional user data that NEEDS:
- Audit trails (who did what when)
- Compliance (GDPR, SOX, HIPAA)
- Rollback capabilities
- Time-travel queries

**Before**: MongoDB-only, no S3, no versions ❌
**After**: Full S3 support with versioning ✅

### 2. Knowledge/Metadata - REMOVE Versioning ✅

**Why**: Static data (facts, config) doesn't need version history
- Changes are infrequent
- Backups are sufficient for disaster recovery
- Versioning wastes storage

**Before**: Has versionsBucket (unnecessary)
**After**: Only recordsBucket, contentBucket, backupsBucket

### 3. Messaging/Identities - ADD S3 Support (No Versions) ✅

**Why**: Like metadata/knowledge - relatively static
- Messaging: Topic config, message metadata
- Identities: Users, roles, permissions
- Changes are managed, not transactional

**Before**: MongoDB-only
**After**: S3 support for scalability (no versions)

### 4. Logs - Keep As-Is ✅

**Why**: Already correct - append-only, optional S3, no versions

## Database Architecture Matrix

| Database    | S3 Support | Versioning | Reasoning                          |
|-------------|------------|------------|------------------------------------|
| Knowledge   | ✅ Yes     | ❌ No      | Static facts, backups sufficient   |
| Metadata    | ✅ Yes     | ❌ No      | Static config, backups sufficient  |
| **Runtime** | ✅ **Yes** | ✅ **YES** | **Transactional, needs audit**     |
| Messaging   | ✅ Yes     | ❌ No      | Static metadata, backups sufficient|
| Identities  | ✅ Yes     | ❌ No      | Static users/roles, backups sufficient |
| Logs        | ✅ Optional| ❌ No      | Append-only, never modified        |

## Configuration Helper

New TypeScript configuration builder for easy setup:

```typescript
import { XronoxConfigBuilder } from 'xronox';

const config = new XronoxConfigBuilder()
  .addMongoConnection('primary', 'mongodb://localhost:27017')
  .addS3Connection('primary', {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY!,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY!,
    buckets: {
      records: 'xronox-records',
      versions: 'xronox-versions',
      content: 'xronox-content',
      backups: 'xronox-backups'
    }
  })
  .addKnowledgeDatabase({
    type: 'generic',
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_knowledge'
    // No versions - knowledge is static
  })
  .addRuntimeDatabase({
    type: 'tenant',
    tenantId: 'tenant-a',
    mongoRef: 'primary',
    s3Ref: 'primary',
    dbName: 'athenix_runtime_tenant_a',
    analyticsDbName: 'athenix_analytics_tenant_a',
    enableVersioning: true  // ✅ CRITICAL for audit trails
  })
  .build();

const xronox = initXronox(config);
```

## Implementation Status

- ✅ Analysis complete
- 🔄 Interface updates in progress
- ⏳ Validation schemas pending
- ⏳ Router updates pending
- ⏳ Documentation pending

