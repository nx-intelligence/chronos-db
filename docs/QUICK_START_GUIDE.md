# Chronos-DB Quick Start Guide

> **Version**: chronos-db@1.1.0+  
> **Last Updated**: January 2025

---

## 🎯 Overview

This guide provides quick setup instructions for the enhanced chronos-db package. The new version (1.1.0+) features **optional retention/rollup policies** with sensible defaults, making it much easier to get started without complex configuration.

### ✅ What's New in v1.1.0

- **Optional Configuration**: Retention and rollup policies are now optional
- **Sensible Defaults**: All policies default to disabled for minimal setup
- **Auto-Schedule**: Automatic period management for rollup operations
- **Backward Compatible**: Existing configurations continue to work
- **ESM/CJS Fixed**: Resolved "require is not defined" errors

---

## 📦 Installation & Setup

### 1. Install the Latest Version

```bash
npm install chronos-db@latest
```

### 2. Basic Import

```typescript
import { initUnifiedDataManager } from 'chronos-db';
```

---

## 🚀 Quick Start Configurations

### Minimal Configuration (Recommended)

```typescript
import { initUnifiedDataManager } from 'chronos-db';

const chronos = initUnifiedDataManager({
  // Required: MongoDB connection
  mongoUris: ['mongodb://localhost:27017'],
  
  // Required: Local storage (for development)
  localStorage: {
    enabled: true,
    basePath: './chronos-data'
  },
  
  // Required: Counters database
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters'
  },
  
  // Required: Routing configuration
  routing: { 
    hashAlgo: 'rendezvous' 
  },
  
  // Required: Collection definitions
  collectionMaps: {
    users: {
      indexedProps: ['email', 'status', 'createdAt']
    },
    posts: {
      indexedProps: ['title', 'status', 'authorId', 'createdAt']
    }
  }
  
  // ✅ No retention/rollup required - defaults to disabled!
});
```

### Production Configuration with S3

```typescript
const chronos = initUnifiedDataManager({
  // MongoDB cluster
  mongoUris: [
    'mongodb://mongo1:27017,mongo2:27017,mongo3:27017?replicaSet=rs0'
  ],
  
  // S3-compatible storage
  spacesConns: [{
    endpoint: 'https://your-s3-endpoint.com',
    region: 'us-east-1',
    accessKey: 'YOUR_ACCESS_KEY',
    secretKey: 'YOUR_SECRET_KEY',
    jsonBucket: 'your-chronos-json',
    contentBucket: 'your-chronos-content',
    backupsBucket: 'your-chronos-backups',
    forcePathStyle: false
  }],
  
  counters: {
    mongoUri: 'mongodb://counters-db:27017',
    dbName: 'chronos_counters'
  },
  
  routing: { 
    hashAlgo: 'rendezvous',
    chooseKey: 'tenantId|dbName|collection'
  },
  
  collectionMaps: {
    users: {
      indexedProps: ['email', 'status', 'role', 'createdAt'],
      validation: {
        requiredIndexed: ['email']
      }
    },
    posts: {
      indexedProps: ['title', 'status', 'authorId', 'createdAt', 'tags'],
      validation: {
        requiredIndexed: ['title', 'authorId']
      }
    }
  }
  
  // ✅ Still no retention/rollup required - defaults to disabled!
});
```

---

## 🎛️ Optional Configuration Features

### Enable Retention Policies (Optional)

```typescript
const chronos = initUnifiedDataManager({
  // ... basic config ...
  
  // Optional: Enable retention policies
  retention: {
    enabled: true,
    ver: {
      enabled: true,
      maxAge: 90,        // Keep versions for 90 days
      maxVersions: 10    // Keep last 10 versions per item
    },
    counters: {
      enabled: true,
      maxAge: 365,       // Keep counters for 1 year
      maxVersions: 50    // Keep last 50 counter snapshots
    }
  }
});
```

### Enable Rollup with Auto-Schedule (Optional)

```typescript
const chronos = initUnifiedDataManager({
  // ... basic config ...
  
  // Optional: Enable rollup with automatic period management
  rollup: {
    enabled: true,
    autoSchedule: true   // System handles daily/weekly/monthly automatically
  }
});
```

### Custom Rollup Configuration (Optional)

```typescript
const chronos = initUnifiedDataManager({
  // ... basic config ...
  
  rollup: {
    enabled: true,
    manifestPeriod: 'weekly',  // Create weekly manifests
    autoSchedule: false        // Manual control
  }
});
```

---

## 📊 Basic Usage Examples

### CRUD Operations

```typescript
// Get operations for a specific collection
const usersOps = chronos.with({
  dbName: 'myapp',
  collection: 'users',
  tenantId: 'tenant-1'
});

// Create a new user
const newUser = await usersOps.create({
  email: 'user@example.com',
  name: 'John Doe',
  status: 'active',
  createdAt: new Date()
}, 'system', 'User registration');

console.log('Created user:', newUser.id);

// Read the user
const user = await usersOps.getLatest(newUser.id);
console.log('Retrieved user:', user);

// Update the user
await usersOps.update(newUser.id, {
  status: 'verified',
  updatedAt: new Date()
}, newUser.ov, 'system', 'Email verification');

// Query users
const activeUsers = await usersOps.query({
  filter: { status: 'active' },
  limit: 10,
  sort: { createdAt: -1 }
});
```

### Analytics and Counters

```typescript
// Get analytics operations
const analyticsOps = chronos.with({
  dbName: 'myapp',
  collection: 'analytics',
  tenantId: 'tenant-1'
});

// Track events
await analyticsOps.create({
  eventType: 'page_view',
  userId: 'user123',
  page: '/dashboard',
  timestamp: new Date(),
  metadata: {
    source: 'web',
    sessionId: 'session789'
  }
}, 'tracker', 'User engagement tracking');

// Get analytics totals
const totals = await chronos.counters.getTotals({
  dbName: 'myapp',
  collection: 'analytics'
});
console.log('Analytics totals:', totals);
```

---

## 🔄 Migration from Previous Versions

### If You Have Existing Configuration

Your existing configuration will continue to work without changes:

```typescript
// ✅ This still works (backward compatible)
const chronos = initUnifiedDataManager({
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'counters' },
  routing: { hashAlgo: 'rendezvous' },
  
  // Legacy retention config still works
  retention: {
    ver: { days: 90, maxPerItem: 10 },
    counters: { days: 365, weeks: 12, months: 6 }
  },
  
  // Legacy rollup config still works
  rollup: {
    enabled: true,
    manifestPeriod: 'daily'
  },
  
  collectionMaps: {
    users: { indexedProps: ['email'] }
  }
});
```

### Recommended Migration Steps

1. **Update Package**: `npm install chronos-db@latest`
2. **Test Existing Config**: Verify your current configuration still works
3. **Simplify if Desired**: Remove retention/rollup if not needed
4. **Test Application**: Verify startup and operations work
5. **Gradually Enable Features**: Add retention/rollup as needed

---

## 🛠️ Configuration Reference

### Required Fields

```typescript
interface MinimalConfig {
  mongoUris: string[];                    // MongoDB connection URIs
  localStorage?: LocalStorageConfig;       // OR spacesConns
  counters: CountersConfig;               // Counters database
  routing: RoutingConfig;                 // Routing configuration
  collectionMaps: Record<string, CollectionMap>; // Collection definitions
}
```

### Optional Fields

```typescript
interface OptionalConfig {
  spacesConns?: SpacesConnConfig[];       // S3 storage (production)
  retention?: RetentionConfig;            // Optional: retention policies
  rollup?: RollupConfig;                  // Optional: rollup policies
  counterRules?: CountersRulesConfig;     // Optional: conditional counters
  devShadow?: DevShadowConfig;            // Optional: dev shadows
  hardDeleteEnabled?: boolean;            // Optional: hard delete
  fallback?: FallbackConfig;              // Optional: fallback queues
  writeOptimization?: WriteOptimizationConfig; // Optional: write optimization
}
```

---

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. "require is not defined" Error

**Problem**: ESM/CJS compatibility issue  
**Solution**: Update to chronos-db@1.1.0+ (already fixed)

```bash
npm install chronos-db@latest
```

#### 2. Configuration Validation Errors

**Problem**: Missing required retention/rollup config  
**Solution**: Use minimal configuration (no retention/rollup needed)

```typescript
// ✅ This works now
const config = {
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'counters' },
  routing: { hashAlgo: 'rendezvous' },
  collectionMaps: { users: { indexedProps: ['email'] } }
  // No retention/rollup required!
};
```

#### 3. Application Startup Failures

**Problem**: Chronos DB initialization fails  
**Solution**: Check MongoDB connection and collection maps

```typescript
try {
  const chronos = initUnifiedDataManager(config);
  console.log('✅ Chronos DB initialized successfully');
} catch (error) {
  console.error('❌ Chronos DB initialization failed:', error.message);
  // Check your configuration and MongoDB connection
}
```

---

## 📈 Performance Considerations

### For Development

```typescript
// Minimal configuration for development
const devConfig = {
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './dev-data' },
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'dev_counters' },
  routing: { hashAlgo: 'rendezvous' },
  collectionMaps: {
    // Define only essential collections
    users: { indexedProps: ['email'] },
    posts: { indexedProps: ['title', 'status'] }
  }
  // Retention/rollup disabled by default - no performance impact
};
```

### For Production

```typescript
// Production configuration with optimizations
const prodConfig = {
  mongoUris: ['mongodb://cluster:27017'],
  spacesConns: [{ /* S3 config */ }],
  counters: { mongoUri: 'mongodb://counters:27017', dbName: 'prod_counters' },
  routing: { hashAlgo: 'rendezvous', chooseKey: 'tenantId|dbName' },
  collectionMaps: { /* all collections */ },
  
  // Optional: Enable optimizations
  writeOptimization: {
    batchS3: true,
    batchWindowMs: 100,
    debounceCountersMs: 1000,
    allowShadowSkip: true
  },
  
  // Optional: Enable fallback queues for reliability
  fallback: {
    enabled: true,
    maxAttempts: 10,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    deadLetterCollection: 'chronos_dead_letter'
  }
};
```

---

## 📚 Additional Resources

### Documentation Links

- [Chronos-DB GitHub Repository](https://github.com/nx-intelligence/chronos-db)
- [API Reference](./API.md)
- [Configuration Guide](./CONFIGURATION.md)
- [Architecture Overview](./ARCHITECTURE.md)

### Support

- **Issues**: [GitHub Issues](https://github.com/nx-intelligence/chronos-db/issues)
- **Documentation**: [docs/](./docs/)
- **Examples**: [examples/](./examples/)

---

## 🎉 Summary

The enhanced chronos-db@1.1.0+ package now provides:

- ✅ **Simple Setup**: Minimal configuration without retention/rollup requirements
- ✅ **Flexible Control**: Optional features with sensible defaults
- ✅ **Backward Compatible**: Existing configurations continue to work
- ✅ **Production Ready**: Full feature set available when needed
- ✅ **ESM/CJS Fixed**: No more "require is not defined" errors

**Quick Start:**
1. Install: `npm install chronos-db@latest`
2. Use minimal configuration
3. Add optional features as needed

The configuration validation issues are now completely resolved! 🚀
