# Chronos Configuration Guide

Complete reference for all configuration options.

---

## Minimal Configuration

```javascript
{
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'chronos_counters' },
  routing: { hashAlgo: 'rendezvous' },
  retention: {
    ver: { days: 90, maxPerItem: 1000 },
    counters: { days: 30, weeks: 12, months: 6 }
  },
  rollup: { enabled: false, manifestPeriod: 'daily' },
  collectionMaps: {
    users: { indexedProps: ['email'] }
  }
}
```

---

## Complete Configuration

```javascript
{
  // MongoDB connections (1-10 backends)
  mongoUris: [
    'mongodb://primary:27017',
    'mongodb://secondary:27017'
  ],
  
  // Storage: EITHER spacesConns OR localStorage
  
  // Option A: S3-compatible storage (production)
  spacesConns: [{
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    accessKey: 'YOUR_ACCESS_KEY',
    secretKey: 'YOUR_SECRET_KEY',
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
    backupsBucket: 'chronos-backups',
    forcePathStyle: false  // Set true for MinIO
  }],
  
  // Option B: Local filesystem (development)
  localStorage: {
    enabled: true,
    basePath: './chronos-data'
  },
  
  // Counters database
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters'
  },
  
  // Routing
  routing: {
    hashAlgo: 'rendezvous',  // or 'jump'
    chooseKey: 'tenantId|dbName|collection:objectId'  // optional
  },
  
  // Retention policies
  retention: {
    ver: {
      days: 90,         // Keep version metadata for 90 days
      maxPerItem: 1000  // Keep last 1000 versions per item
    },
    counters: {
      days: 30,
      weeks: 12,
      months: 6
    }
  },
  
  // Rollup (for manifests)
  rollup: {
    enabled: false,
    manifestPeriod: 'daily'  // 'daily' | 'weekly' | 'monthly'
  },
  
  // Collection definitions
  collectionMaps: {
    users: {
      // Fields to index in MongoDB
      indexedProps: ['email', 'status', 'createdAt'],
      
      // Base64 fields to externalize to storage
      base64Props: {
        avatar: {
          contentType: 'image/jpeg'
        }
      },
      
      // Validation
      validation: {
        requiredIndexed: ['email']
      },
      
      // Per-collection version retention (overrides global)
      versionRetention: {
        daysInIndex: 30,        // Keep 30 days in MongoDB
        maxVersionsInIndex: 100  // Keep last 100 versions
      }
    }
  },
  
  // Counter rules (optional)
  counterRules: {
    rules: [{
      name: 'activeUsers',
      when: { status: 'active' },
      on: ['CREATE', 'UPDATE'],
      scope: 'meta'
    }]
  },
  
  // Dev shadows (optional)
  devShadow: {
    enabled: true,
    ttlHours: 24,
    maxBytesPerDoc: 1048576  // 1MB
  },
  
  // Hard delete (optional)
  hardDeleteEnabled: true,
  
  // Fallback queues (optional)
  fallback: {
    enabled: true,
    maxAttempts: 10,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    deadLetterCollection: 'chronos_dead_letter'
  },
  
  // Write optimization (optional)
  writeOptimization: {
    batchS3: true,
    batchWindowMs: 100,
    debounceCountersMs: 1000,
    allowShadowSkip: true
  }
}
```

---

## Configuration Options Reference

### `mongoUris`

**Type:** `string[]`  
**Required:** Yes  
**Range:** 1-10 connections

MongoDB connection URIs for your data.

```javascript
mongoUris: [
  'mongodb://localhost:27017',
  'mongodb://replica2:27017'
]
```

---

### `spacesConns`

**Type:** `SpacesConnConfig[]`  
**Required:** If not using `localStorage`  
**Range:** 1-10 connections (must match `mongoUris` length)

S3-compatible storage connections.

```javascript
spacesConns: [{
  endpoint: string,      // S3 endpoint URL
  region: string,        // AWS region
  accessKey: string,     // Access key
  secretKey: string,     // Secret key
  jsonBucket: string,    // Bucket for JSON payloads
  contentBucket: string, // Bucket for externalized blobs
  backupsBucket: string, // Bucket for manifests
  forcePathStyle: boolean // true for MinIO, false for AWS
}]
```

**Supported providers:**
- AWS S3
- DigitalOcean Spaces
- MinIO
- Cloudflare R2
- Any S3-compatible API

---

### `localStorage`

**Type:** `LocalStorageConfig`  
**Required:** If not using `spacesConns`

Local filesystem storage (development/testing only).

```javascript
localStorage: {
  enabled: true,
  basePath: './chronos-data'  // Where to store files
}
```

**⚠️ NOT recommended for production!** Use S3 instead.

---

### `counters`

**Type:** `CountersConfig`  
**Required:** Yes

Separate MongoDB for analytics counters.

```javascript
counters: {
  mongoUri: 'mongodb://localhost:27017',  // Can be same as main
  dbName: 'chronos_counters'
}
```

---

### `routing`

**Type:** `RoutingConfig`

Configure multi-backend routing.

```javascript
routing: {
  hashAlgo: 'rendezvous',  // 'rendezvous' (default) or 'jump'
  chooseKey: 'tenantId|dbName|collection:objectId'  // Custom routing key
}
```

---

### `retention.ver`

**Type:** `{ days?, maxPerItem? }`

Global version retention policy for MongoDB `_ver` index.

```javascript
retention: {
  ver: {
    days: 90,          // Keep version metadata for 90 days
    maxPerItem: 1000   // Keep last 1000 versions per item
  }
}
```

**Note:** This controls the **MongoDB index**, not storage! Storage keeps all versions forever (until hard delete).

---

### `collectionMaps`

**Type:** `Record<string, CollectionMap>`  
**Required:** Yes

Define collections and their behavior.

```javascript
collectionMaps: {
  users: {
    indexedProps: ['email', 'status'],     // Searchable in MongoDB
    
    base64Props: {                          // Externalize to storage
      avatar: { contentType: 'image/jpeg' },
      document: { contentType: 'application/pdf' }
    },
    
    validation: {
      requiredIndexed: ['email']            // Must be present
    },
    
    versionRetention: {                     // Override global retention
      daysInIndex: 30,
      maxVersionsInIndex: 100
    }
  }
}
```

---

### `counterRules`

**Type:** `CountersRulesConfig`  
**Optional**

Define conditional counters.

```javascript
counterRules: {
  rules: [{
    name: 'activeUsers',
    when: { status: 'active' },        // Condition
    on: ['CREATE', 'UPDATE'],          // Which operations
    scope: 'meta'                       // 'meta' or 'payload'
  }]
}
```

---

### `devShadow`

**Type:** `DevShadowConfig`  
**Optional**

Store full snapshots in MongoDB for faster development.

```javascript
devShadow: {
  enabled: true,
  ttlHours: 24,              // Expire after 24 hours
  maxBytesPerDoc: 1048576    // Max 1MB per shadow
}
```

**⚠️ Development only!** Increases MongoDB storage.

---

### `fallback`

**Type:** `FallbackConfig`  
**Optional**

Enable fallback queues for automatic retry.

```javascript
fallback: {
  enabled: true,
  maxAttempts: 10,
  baseDelayMs: 2000,
  maxDelayMs: 60000,
  deadLetterCollection: 'chronos_dead_letter'
}
```

---

### `writeOptimization`

**Type:** `WriteOptimizationConfig`  
**Optional**

Optimize writes for high throughput.

```javascript
writeOptimization: {
  batchS3: true,              // Batch storage uploads
  batchWindowMs: 100,         // 100ms window
  debounceCountersMs: 1000,   // Update counters every 1s
  allowShadowSkip: true       // Skip shadows for heavy ops
}
```

---

## Environment-Specific Configs

### **Development**

```javascript
{
  mongoUris: ['mongodb://localhost:27017'],
  localStorage: { enabled: true, basePath: './data' },
  counters: { mongoUri: 'mongodb://localhost:27017', dbName: 'counters' },
  devShadow: { enabled: true, ttlHours: 24 },
  // ... minimal settings
}
```

### **Production**

```javascript
{
  mongoUris: [
    'mongodb://mongo1:27017,mongo2:27017,mongo3:27017?replicaSet=rs0'
  ],
  spacesConns: [{
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    jsonBucket: 'prod-chronos-json',
    contentBucket: 'prod-chronos-content',
    backupsBucket: 'prod-chronos-backups'
  }],
  counters: { 
    mongoUri: 'mongodb://counters-db:27017',
    dbName: 'chronos_counters'
  },
  retention: {
    ver: { days: 365, maxPerItem: 5000 }
  },
  fallback: { enabled: true, maxAttempts: 10 },
  writeOptimization: { batchS3: true, debounceCountersMs: 1000 }
}
```

---

## Best Practices

1. **MongoDB Replica Set:** Always use 3-node replica set in production
2. **Separate Counters:** Use dedicated MongoDB for counters
3. **Version Retention:** Set based on compliance needs
4. **Indexed Props:** Only index fields you query on
5. **Storage:** Use S3 in production, local in development

---

## Validation

Chronos validates configuration on init:

```javascript
try {
  const chronos = initUnifiedDataManager(config);
} catch (error) {
  console.error('Config validation failed:', error.message);
  // Clear error messages with secret redaction
}
```

---

See [API Reference](./API.md) for usage documentation.

