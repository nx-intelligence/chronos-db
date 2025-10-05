# Chronos-DB Quick Start Guide

> **Version**: chronos-db@1.5.0+  
> **Last Updated**: January 2025

---

## 🎯 Overview

This guide provides quick setup instructions for the enhanced chronos-db package. The new version (1.5.0+) features **simplified key-based configuration** with explicit connection mapping, making it much easier to manage multi-tenant setups.

### ✅ What's New in v1.5.0

- **Simplified Configuration**: Key-based mapping system for connections
- **Explicit Relationships**: Clear mapping between MongoDB and S3 connections
- **Flexible Structure**: Support for empty database sections
- **No Backward Compatibility**: Clean break from old structure for better maintainability
- **Enhanced Multi-Tenancy**: Simplified tenant management with direct key routing

---

## 📦 Installation & Setup

### 1. Install the Latest Version

```bash
npm install chronos-db@latest
```

### 2. Basic Import

```typescript
import { initChronos } from 'chronos-db';
```

---

## 🚀 Quick Start Configurations

### Minimal Configuration (Recommended)

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // MongoDB connections
  mongoConns: [{
    key: 'mongo-local',
    mongoUri: 'mongodb://localhost:27017'
  }],
  
  // Database configuration
  databases: {
    runtime: [{
      key: 'runtime-local',
      mongoConnKey: 'mongo-local',
      dbName: 'runtime_local'
    }]
  },
  
  // Local storage (no S3 needed!)
  localStorage: {
    enabled: true,
    basePath: './chronos-data'
  },
  
  // Counters
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters'
  },
  
  // Optional: Collection maps
  collectionMaps: {
    users: { indexedProps: ['email'] }
  }
});
```

### Production Configuration (S3 + MongoDB)

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // MongoDB connections
  mongoConns: [{
    key: 'mongo-prod',
    mongoUri: 'mongodb+srv://user:pass@cluster.mongodb.net'
  }],
  
  // Database configuration
  databases: {
    runtime: [{
      key: 'runtime-prod',
      mongoConnKey: 'mongo-prod',
      spacesConnKey: 'aws-prod',
      dbName: 'runtime_prod'
    }],
    logs: {
      connection: {
        key: 'logs-prod',
        mongoConnKey: 'mongo-prod',
        spacesConnKey: 'aws-prod',
        dbName: 'logs_prod'
      }
    }
  },
  
  // S3-compatible storage
  spacesConns: [{
    key: 'aws-prod',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY,
    secretKey: process.env.AWS_SECRET_KEY,
    buckets: {
      json: 'chronos-json-prod',
      content: 'chronos-content-prod',
      versions: 'chronos-versions-prod',
      backup: 'chronos-backups-prod'
    }
  }],
  
  // Counters
  counters: {
    mongoUri: 'mongodb+srv://user:pass@cluster.mongodb.net',
    dbName: 'chronos_counters'
  },
  
  // Collection maps
  collectionMaps: {
    users: { 
      indexedProps: ['email', 'status'],
      validation: { requiredIndexed: ['email'] }
    }
  },
  
  // Fallback queue
  fallback: {
    enabled: true,
    maxRetries: 3
  },
  
  // Transactions
  transactions: {
    enabled: true,
    autoDetect: true
  }
});
```

### Multi-Tenant Configuration

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // MongoDB connections
  mongoConns: [
    { key: 'mongo-cluster-a', mongoUri: 'mongodb+srv://user:pass@cluster-a.mongodb.net' },
    { key: 'mongo-cluster-b', mongoUri: 'mongodb+srv://user:pass@cluster-b.mongodb.net' }
  ],
  
  // Database configuration
  databases: {
    metadata: [
      { key: 'meta-domain1', mongoConnKey: 'mongo-cluster-a', spacesConnKey: 'aws-us-east', tenantId: 'domain1', dbName: 'metadata_domain1' },
      { key: 'meta-tenant-a', mongoConnKey: 'mongo-cluster-b', spacesConnKey: 'aws-us-east', tenantId: 'tenant-a', dbName: 'metadata_tenant_a' }
    ],
    runtime: [
      { key: 'runtime-domain1', mongoConnKey: 'mongo-cluster-a', spacesConnKey: 'aws-us-east', tenantId: 'domain1', dbName: 'runtime_domain1' },
      { key: 'runtime-tenant-a', mongoConnKey: 'mongo-cluster-b', spacesConnKey: 'aws-us-east', tenantId: 'tenant-a', dbName: 'runtime_tenant_a' }
    ],
    logs: {
      connection: { key: 'logs-main', mongoConnKey: 'mongo-cluster-a', spacesConnKey: 'aws-us-east', dbName: 'chronos_logs' }
    }
  },
  
  // S3-compatible storage
  spacesConns: [{
    key: 'aws-us-east',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY,
    secretKey: process.env.AWS_SECRET_KEY,
    buckets: {
      json: 'chronos-json-us-east',
      content: 'chronos-content-us-east',
      versions: 'chronos-versions-us-east',
      backup: 'chronos-backups-us-east'
    }
  }],
  
  // Counters
  counters: {
    mongoUri: 'mongodb+srv://user:pass@cluster-metrics.mongodb.net',
    dbName: 'chronos_counters'
  }
});
```

---

## 🎯 Basic Usage

### 1. Get Operations Context

```typescript
// Option A: Direct key usage (simplest)
const ops = chronos.with({
  key: 'runtime-local',  // Direct lookup, no resolution needed
  collection: 'users'
});

// Option B: Tenant-based routing
const ops2 = chronos.with({
  databaseType: 'runtime',
  tenantId: 'tenant-a',     // Maps to tenant-specific database
  collection: 'users'
});

// Option C: Logs database (no tiers)
const ops3 = chronos.with({
  key: 'logs-main',         // Direct key for logs database
  collection: 'audit'
});
```

### 2. CRUD Operations

```typescript
// Create
const user = await ops.create({
  email: 'user@example.com',
  name: 'John Doe',
  status: 'active'
}, 'system', 'user registration');

console.log('Created user:', user);
// Output: { id: '...', ov: 0, cv: 0, createdAt: '...' }

// Update
const updated = await ops.update(user.id, {
  status: 'verified'
}, user.ov, 'system', 'email verification');

console.log('Updated user:', updated);
// Output: { id: '...', ov: 1, cv: 1, updatedAt: '...' }

// Read latest
const latest = await ops.getLatest(user.id);
console.log('Latest user:', latest);

// Read specific version
const version0 = await ops.getVersion(user.id, { ov: 0 });
console.log('Original user:', version0);

// Delete (logical)
const deleted = await ops.delete(user.id, updated.ov, 'system', 'user deletion');
console.log('Deleted user:', deleted);
```

### 3. Enrichment API

```typescript
// Incremental updates without full rewrite
await ops.enrich(user.id, {
  tags: ['premium'],
  metadata: { score: 100 }
}, {
  functionId: 'enricher@v1',
  actor: 'system',
  reason: 'automated enrichment'
});

// Batch enrichment
await ops.enrich(user.id, [
  { tags: ['vip'] },
  { metadata: { score: 200 } },
  { tags: ['verified'] }
]);
```

---

## 🔧 Configuration Options

### Required Fields

- **`mongoConns`**: Array of MongoDB connection configurations
- **`databases`**: Database configuration with at least one database type
- **`counters`**: Counters database configuration

### Optional Fields

- **`spacesConns`**: S3-compatible storage (if not using localStorage)
- **`localStorage`**: Local filesystem storage (for development)
- **`routing`**: Routing configuration
- **`retention`**: Data retention policies
- **`rollup`**: Data rollup configuration
- **`collectionMaps`**: Collection mapping and validation
- **`devShadow`**: Development shadow storage
- **`fallback`**: Fallback queue configuration
- **`transactions`**: Transaction configuration

### Key-Based Mapping

- **`key`**: Globally unique identifier for direct routing
- **`mongoConnKey`**: References a MongoDB connection from the `mongoConns` array
- **`spacesConnKey`**: References an S3 connection from the `spacesConns` array
- **`tenantId`**: External identifier for tenant mapping

---

## 🏗️ Architecture Benefits

### Key-Based Connection Mapping

The new configuration uses a **key-based mapping system** that provides several benefits:

- **Reusability**: One MongoDB connection can serve multiple databases
- **Flexibility**: One S3 connection can serve multiple database types
- **Clarity**: Explicit relationships between components
- **Maintainability**: Easy to update connection details in one place

### Database Types

- **`metadata`** - System configuration, user settings, application metadata
- **`knowledge`** - Content, documents, knowledge base, static data
- **`runtime`** - User data, transactions, dynamic application data
- **`logs`** - System logs and audit trails (no tiers, simple structure)

---

## 🚨 Migration from Previous Versions

If you're upgrading from a previous version of chronos-db:

1. **Remove `mongoUris` array**: Replace with `mongoConns` array
2. **Add `key` fields**: Each connection needs a unique key
3. **Update database structure**: Use direct arrays instead of nested objects
4. **Add `spacesConnKey`**: Link databases to S3 connections
5. **Update bucket structure**: Use `buckets` object instead of individual fields

### Example Migration

**Before (v1.4.x):**
```json
{
  "mongoUris": ["mongodb://localhost:27017"],
  "spacesConns": [{
    "endpoint": "http://localhost:9000",
    "jsonBucket": "chronos-json",
    "contentBucket": "chronos-content"
  }]
}
```

**After (v1.5.x):**
```json
{
  "mongoConns": [{
    "key": "mongo-local",
    "mongoUri": "mongodb://localhost:27017"
  }],
  "databases": {
    "runtime": [{
      "key": "runtime-local",
      "mongoConnKey": "mongo-local",
      "spacesConnKey": "minio-local",
      "dbName": "runtime_local"
    }]
  },
  "spacesConns": [{
    "key": "minio-local",
    "endpoint": "http://localhost:9000",
    "buckets": {
      "json": "chronos-json",
      "content": "chronos-content",
      "versions": "chronos-versions"
    }
  }]
}
```

---

## 📚 Next Steps

1. **Read the [Configuration Guide](CONFIGURATION.md)** for detailed configuration options
2. **Check the [API Documentation](API.md)** for complete API reference
3. **See [Examples](../examples/)** for real-world configuration examples
4. **Review [Architecture](ARCHITECTURE.md)** for understanding the system design

---

## 🆘 Troubleshooting

### Common Issues

1. **"S3 connection not found"**: Check that `spacesConnKey` matches a `key` in `spacesConns`
2. **"MongoDB connection not found"**: Check that `mongoConnKey` matches a `key` in `mongoConns`
3. **"Bucket does not exist"**: Ensure buckets are created in your S3-compatible storage
4. **"Access denied"**: Verify S3 credentials and permissions
5. **"Invalid endpoint"**: Check endpoint URL format for your S3 provider

### Getting Help

- Check the main [README.md](../README.md) for detailed configuration options
- Review the [API documentation](API.md) for usage examples
- See [examples/](../examples/) for complete configuration examples