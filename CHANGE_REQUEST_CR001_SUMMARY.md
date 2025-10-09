# Change Request CR-001: Multi-Bucket Support & Improved Storage Organization

**Status**: In Progress  
**Version**: 2.5.0  
**Date**: 2025-10-09  

## Summary

This change request implements multi-bucket support and improved storage organization for Xronox, allowing separate buckets for different data types (records, versions, backups, content) and adding S3/Spaces support to the logs database.

## What's Been Implemented (Phase 1)

### ✅ Core Interfaces Updated

1. **SpacesConnection Interface** (`src/config.ts`):
   - Added `BucketConfiguration` interface for multi-bucket setup
   - Added `FolderPrefixes` interface for customizable folder naming
   - Extended `SpacesConnection` with:
     - `buckets?: BucketConfiguration` - Multi-bucket support
     - `folderPrefixes?: FolderPrefixes` - Customizable folder names
     - `bucket?: string` - Legacy single bucket (deprecated but supported)

2. **Database Interfaces** (`src/config.ts`):
   - Updated `GenericDatabase`, `DomainDatabase`, `TenantDatabase`, `RuntimeTenantDatabase`:
     - Added `recordsBucket`, `versionsBucket`, `contentBucket`, `backupsBucket`
     - Deprecated `bucket` field (but still supported for backward compatibility)
   
3. **LogsDatabase Interface** (`src/config.ts`):
   - Made `spaceConnRef` optional (enables S3 storage for logs)
   - Added `recordsBucket` and `contentBucket` for log storage
   - Deprecated single `bucket` field

4. **CollectionMap Interface** (`src/config.ts`):
   - Added `S3OffloadConfig` interface for automatic archival
   - Added `s3Offload?: S3OffloadConfig` to `CollectionMap`
   - Enables automatic offloading of old records to S3

## What Still Needs to Be Done (Phase 2)

### 🔄 Pending Tasks

1. **Zod Schema Validation** - Update validation schemas to support new configuration options
2. **Router Implementation** - Implement bucket resolution logic and folder prefix handling
3. **Storage Adapters** - Update S3/local storage adapters to use new folder conventions
4. **Backward Compatibility** - Ensure legacy configurations still work
5. **Migration Utilities** - Create helper functions for bucket resolution
6. **Documentation** - Update README and create STORAGE_ARCHITECTURE.md
7. **Testing** - Integration tests for multi-bucket operations

## Configuration Examples

### New Multi-Bucket Configuration (Recommended)

```typescript
import { initXronox } from 'xronox';

const xronox = initXronox({
  dbConnections: {
    'mongo-primary': {
      mongoUri: 'mongodb://localhost:27017'
    }
  },
  
  spacesConnections: {
    's3-primary': {
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.AWS_SECRET_ACCESS_KEY,
      
      // NEW: Multi-bucket configuration
      buckets: {
        records: 'xronox-records',
        versions: 'xronox-versions',
        content: 'xronox-content',
        backups: 'xronox-backups'
      },
      
      // NEW: Custom folder prefixes (optional)
      folderPrefixes: {
        records: 'records',
        versions: 'versions',
        content: 'content',
        backups: 'backups'
      }
    }
  },
  
  databases: {
    knowledge: {
      genericDatabase: {
        dbConnRef: 'mongo-primary',
        spaceConnRef: 's3-primary',
        
        // NEW: Specify bucket per data type
        recordsBucket: 'xronox-records',
        versionsBucket: 'xronox-versions',
        contentBucket: 'xronox-content',
        backupsBucket: 'xronox-backups',
        
        dbName: 'xronox_knowledge'
      }
    },
    
    // NEW: Logs with S3 support
    logs: {
      dbConnRef: 'mongo-primary',
      spaceConnRef: 's3-primary',
      recordsBucket: 'xronox-logs',
      contentBucket: 'xronox-logs-content',
      dbName: 'xronox_logs'
    }
  },
  
  // NEW: S3 offload for logs
  collectionMaps: {
    activity_logs: {
      indexedProps: ['agentId', 'timestamp', 'action'],
      s3Offload: {
        enabled: true,
        olderThan: 30  // Offload to S3 after 30 days
      }
    }
  }
});
```

### Legacy Configuration (Still Supported)

```typescript
// OLD way - still works!
const xronox = initXronox({
  spacesConnections: {
    's3-primary': {
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.AWS_SECRET_ACCESS_KEY,
      bucket: 'xronox-data'  // Single bucket - deprecated but supported
    }
  },
  
  databases: {
    knowledge: {
      genericDatabase: {
        dbConnRef: 'mongo-primary',
        spaceConnRef: 's3-primary',
        bucket: 'xronox-data',  // Single bucket - deprecated but supported
        dbName: 'xronox_knowledge'
      }
    }
  }
});
```

## Storage Organization

### New Folder Structure (Recommended)

```
s3://xronox-records/
  └─ records/
      └─ {collection}/
          └─ {itemId}/
              └─ head.json

s3://xronox-versions/
  └─ versions/
      └─ {collection}/
          └─ {itemId}/
              ├─ v0.json
              ├─ v1.json
              └─ v2.json

s3://xronox-backups/
  └─ backups/
      └─ {collection}/
          └─ {date}/
              └─ snapshot.json

s3://xronox-content/
  └─ content/
      └─ {collection}/
          └─ {itemId}/
              └─ {property}/
                  └─ blob.bin

s3://xronox-logs/
  └─ records/
      └─ {collection}/
          └─ {timestamp}/
              └─ log.json
```

## Benefits

### Cost Savings

- **Records**: S3 Standard (hot data)
- **Versions**: S3 Intelligent-Tiering (40-70% savings)
- **Backups**: S3 Glacier Flexible (90% savings)
- **Logs**: S3 Intelligent-Tiering (95% savings vs MongoDB)

### Security

- Separate IAM policies per bucket type
- Tenant-level bucket isolation
- Different encryption keys per data type

### Scalability

- Distribute load across multiple buckets
- Parallel operations
- Bucket-specific lifecycle policies

## Next Steps

1. Implement Zod validation for new configuration
2. Update router to resolve buckets correctly
3. Update storage adapters for new folder structure
4. Add backward compatibility layer
5. Write integration tests
6. Update documentation
7. Release v2.5.0

## Notes

- All changes are **backward compatible**
- Existing configurations continue to work
- New features are opt-in
- Single bucket mode is deprecated but fully supported
- Developer can use the same bucket for all data types by specifying the same bucket name in all fields

