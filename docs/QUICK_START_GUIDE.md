# Chronos-DB Quick Start Guide

> **Version**: chronos-db@2.2.0+  
> **Last Updated**: October 2025

---

## 🎯 Overview

This guide provides quick setup instructions for Chronos-DB v2.2.0. The new version features **enterprise-grade multi-tenancy**, **tiered architecture**, and **simplified configuration** with connection reuse.

### ✅ What's New in v2.2.0

- **Enterprise Multi-Tenancy**: Built-in tenant isolation with tiered architecture
- **Connection Reuse**: Define MongoDB/S3 connections once, reference everywhere (95% reuse)
- **Integrated Analytics**: Analytics databases embedded in runtime configuration
- **Azure Storage Support**: Support for Azure Blob Storage alongside S3-compatible providers
- **Enhanced Counter Rules**: Unique counting capabilities for sophisticated analytics
- **System Fields**: All system fields organized under `_system` property
- **Simplified Configuration**: No more nested tenant wrappers

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

### Minimal Configuration (Development)

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // Connection definitions (95% reuse as requested)
  dbConnections: {
    'mongo-dev': {
      mongoUri: 'mongodb://localhost:27017'
    }
  },
  
  spacesConnections: {
    'local-storage': {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      forcePathStyle: true
    }
  },
  
  // Tiered database configuration
  databases: {
    runtime: {
      tenantDatabases: [{
        tenantId: 'default',
        dbConnRef: 'mongo-dev',
        spaceConnRef: 'local-storage',
        bucket: 'chronos-runtime',
        dbName: 'chronos_runtime_default',
        analyticsDbName: 'chronos_analytics_default'
      }]
    }
  },
  
  // Optional: Local filesystem storage (for development/testing)
  localStorage: { 
    enabled: true, 
    basePath: './data' 
  }
});

// Multi-tenant operations
const ops = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'default',
  collection: 'users' 
});

// Create a user
const user = await ops.create({
  email: 'user@example.com',
  name: 'John Doe',
  status: 'active'
}, 'system', 'user-creation');
```

### Production Configuration (Multi-Tenant)

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // Connection definitions (95% reuse as requested)
  dbConnections: {
    'mongo-primary': {
      mongoUri: 'mongodb+srv://user:pass@primary-cluster.mongodb.net/?retryWrites=true&w=majority'
    },
    'mongo-analytics': {
      mongoUri: 'mongodb+srv://user:pass@analytics-cluster.mongodb.net/?retryWrites=true&w=majority'
    }
  },
  
  spacesConnections: {
    's3-primary': {
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    'azure-primary': {
      endpoint: 'https://yourstorageaccount.blob.core.windows.net',
      region: 'eastus',
      accessKey: process.env.AZURE_STORAGE_ACCOUNT_NAME,
      secretKey: process.env.AZURE_STORAGE_ACCOUNT_KEY
    }
  },
  
  // Tiered database configuration
  databases: {
    metadata: {
      genericDatabase: {
        dbConnRef: 'mongo-primary',
        spaceConnRef: 's3-primary',
        bucket: 'chronos-metadata',
        dbName: 'chronos_metadata_generic'
      },
      domainsDatabases: [
        {
          domain: 'healthcare',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-metadata-healthcare',
          dbName: 'chronos_metadata_healthcare'
        }
      ],
      tenantDatabases: [
        {
          tenantId: 'tenant-a',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-metadata-tenant-a',
          dbName: 'chronos_metadata_tenant_a'
        }
      ]
    },
    
    knowledge: {
      genericDatabase: {
        dbConnRef: 'mongo-primary',
        spaceConnRef: 's3-primary',
        bucket: 'chronos-knowledge',
        dbName: 'chronos_knowledge_generic'
      },
      domainsDatabases: [],
      tenantDatabases: []
    },
    
    runtime: {
      tenantDatabases: [
        {
          tenantId: 'tenant-a',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-runtime-tenant-a',
          dbName: 'chronos_runtime_tenant_a',
          analyticsDbName: 'chronos_analytics_tenant_a'
        },
        {
          tenantId: 'tenant-b',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 'azure-primary',
          bucket: 'chronos-runtime-tenant-b',
          dbName: 'chronos_runtime_tenant_b',
          analyticsDbName: 'chronos_analytics_tenant_b'
        }
      ]
    },
    
    logs: {
      dbConnRef: 'mongo-primary',
      spaceConnRef: 's3-primary',
      bucket: 'chronos-logs',
      dbName: 'chronos_logs'
    }
  },
  
  // Enhanced counter rules with unique counting
  counterRules: {
    rules: [
      {
        name: 'user_logins',
        on: ['CREATE'],
        scope: 'meta',
        when: { action: 'login' },
        countUnique: ['sessionId']
      },
      {
        name: 'product_views',
        on: ['CREATE'],
        scope: 'meta',
        when: { action: 'view' },
        countUnique: ['productId', 'category']
      }
    ]
  },
  
  // Security and compliance
  logicalDelete: { enabled: true },
  versioning: { enabled: true },
  transactions: { enabled: true }
});

// Multi-tenant operations
const tenantAOps = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'tenant-a',
  collection: 'users' 
});

const tenantBOps = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'tenant-b',
  collection: 'users' 
});

// Create users in different tenants (completely isolated)
await tenantAOps.create({ email: 'user@tenant-a.com', name: 'User A' });
await tenantBOps.create({ email: 'user@tenant-b.com', name: 'User B' });
```

---

## 🏗️ Multi-Tenant Architecture

### Database Types
- **`metadata`** - System configuration, user settings, application metadata
- **`knowledge`** - Content, documents, knowledge base, static data
- **`runtime`** - User data, transactions, dynamic application data
- **`logs`** - System logs, audit trails, monitoring

### Tiers
- **`generic`** - Shared across all tenants (system-wide data)
- **`domain`** - Shared within a domain (multi-tenant within domain)
- **`tenant`** - Isolated per tenant (single-tenant data)

### Usage Patterns

**Option A: Direct Tier + Tenant ID Usage (Recommended)**
```typescript
const ops = chronos.with({
  databaseType: 'runtime',     // metadata | knowledge | runtime | logs
  tier: 'tenant',              // generic | domain | tenant
  tenantId: 'tenant-a',        // Maps to tenant-specific database
  collection: 'users'
});
```

**Option B: Generic Tier (No Tenant ID)**
```typescript
const ops = chronos.with({
  databaseType: 'metadata',
  tier: 'generic',              // No tenantId needed
  collection: 'config'
});
```

**Option C: Domain Tier**
```typescript
const ops = chronos.with({
  databaseType: 'knowledge',
  tier: 'domain',
  domain: 'healthcare',         // Maps to domain-specific database
  collection: 'articles'
});
```

---

## 📊 System Fields Structure

### Document Structure
All system fields are organized under the `_system` property to keep documents clean:

```json
{
  "_id": "507f1f77bcf86cd799439011",  // MongoDB's native _id (stays at root)
  "email": "user@example.com",
  "name": "John Doe",
  "status": "active",
  "_system": {
    "ov": 3,                          // Object version
    "cv": 150,                        // Collection version  
    "insertedAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z",
    "deletedAt": null,
    "deleted": false,
    "functionIds": ["enricher@v1"],
    "parentId": "parent-record-id",    // Parent record for lineage tracking
    "parentCollection": "parent-collection",
    "originId": "root-record-id",     // Original root record
    "originCollection": "root-collection"
  }
}
```

### Lineage Tracking
Track data lineage with parent and origin information:

```typescript
// Create a child record with parent lineage
await ops.create(childData, 'system', 'child creation', {
  parentRecord: {
    id: parentId,
    collection: 'parent_items',
  }
});

// Create with explicit origin
await ops.create(data, 'system', 'import', {
  origin: {
    id: 'external-system-id',
    collection: 'customers',
    system: 'stripe'  // Optional external system name
  }
});
```

---

## 📈 Enhanced Analytics

### Counter Rules with Unique Counting
Count both total occurrences and unique values:

```typescript
counterRules: {
  rules: [
    {
      name: 'user_logins',
      on: ['CREATE'],
      scope: 'meta',
      when: { action: 'login' },
      countUnique: ['sessionId']  // Count unique sessionId values
    },
    {
      name: 'product_views',
      on: ['CREATE'],
      scope: 'meta',
      when: { action: 'view' },
      countUnique: ['productId', 'category', 'brand']  // Multiple unique counts
    },
    {
      name: 'premium_purchases',
      on: ['CREATE'],
      scope: 'meta',
      when: { 
        userTier: 'premium',
        action: 'purchase',
        amount: { $gte: 100 }
      },
      countUnique: ['productId', 'category']
    }
  ]
}
```

### Counter Collection Structure
```json
{
  "_id": "user_logins",
  "count": 150,              // Total occurrences
  "uniqueSessions": 45,      // Unique sessionId values
  "uniqueUsers": 25,         // Unique userId values
  "lastUpdated": "2024-01-15T10:30:00Z"
}
```

### Analytics Usage
```typescript
// Get analytics for a tenant
const metrics = await chronos.counters.getTotals({
  dbName: 'chronos_runtime_tenant_a',
  collection: 'users',
});

// Returns:
// {
//   created: 1000,
//   updated: 500,
//   deleted: 50,
//   activeUsers: 750,
//   uniqueSessions: 200,
//   uniqueProducts: 150
// }
```

---

## 🔐 Security & Compliance

### Tenant Isolation
Each tenant gets complete data isolation:

```typescript
// Option A: Complete Isolation (Highest Security)
tenantDatabases: [
  {
    tenantId: 'tenant-a',
    dbConnRef: 'mongo-tenant-a',      // Separate MongoDB cluster
    spaceConnRef: 's3-tenant-a',      // Separate S3 bucket
    bucket: 'chronos-tenant-a',
    dbName: 'chronos_tenant_a',
    analyticsDbName: 'chronos_analytics_tenant_a'
  }
]

// Option B: Shared Infrastructure (Cost-Effective)
tenantDatabases: [
  {
    tenantId: 'tenant-a',
    dbConnRef: 'mongo-shared',        // Shared MongoDB cluster
    spaceConnRef: 's3-shared',       // Shared S3 bucket
    bucket: 'chronos-shared',
    dbName: 'chronos_tenant_a',       // Separate database per tenant
    analyticsDbName: 'chronos_analytics_tenant_a'
  }
]
```

### GDPR Compliance
```typescript
// Enable logical delete for GDPR compliance
logicalDelete: {
  enabled: true  // Default - enables data recovery and audit trails
}

// Data deletion with audit trail
await ops.delete(id, expectedOv, 'gdpr-request', 'user-data-deletion');
// Data is logically deleted but remains in audit trail
```

---

## 🚀 Storage Providers

### AWS S3
```typescript
spacesConnections: {
  's3-primary': {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}
```

### Azure Blob Storage
```typescript
spacesConnections: {
  'azure-primary': {
    endpoint: 'https://yourstorageaccount.blob.core.windows.net',
    region: 'eastus',
    accessKey: process.env.AZURE_STORAGE_ACCOUNT_NAME,
    secretKey: process.env.AZURE_STORAGE_ACCOUNT_KEY
  }
}
```

### DigitalOcean Spaces
```typescript
spacesConnections: {
  'do-spaces': {
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    accessKey: process.env.DO_SPACES_KEY,
    secretKey: process.env.DO_SPACES_SECRET
  }
}
```

### MinIO (Local Development)
```typescript
spacesConnections: {
  'minio-local': {
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    forcePathStyle: true
  }
}
```

### Local Filesystem (Development Only)
```typescript
localStorage: {
  enabled: true,
  basePath: './data'
}
```

---

## 🔧 Core Operations

### CRUD Operations
```typescript
// Create with automatic versioning and tenant isolation
const created = await ops.create(data, 'actor', 'reason');
// Returns: { id, ov: 0, cv: 0, createdAt }

// Update with optimistic lock and tenant context
const updated = await ops.update(id, newData, expectedOv, 'actor', 'reason');
// Returns: { id, ov: 1, cv: 1, updatedAt }

// Logical delete (default) - maintains audit trail
const deleted = await ops.delete(id, expectedOv, 'actor', 'reason');
// Returns: { id, ov: 2, cv: 2, deletedAt }
```

### Enrichment API
```typescript
// Deep merge with array union
await ops.enrich(id, {
  tags: ['premium'],              // Arrays unioned
  metadata: { newField: 'value' }, // Objects deep merged
}, {
  functionId: 'enricher@v1',       // Provenance tracking
  actor: 'system',
  reason: 'automated enrichment',
});
```

### Read Operations
```typescript
// Get latest version with presigned URL
const latest = await ops.getLatest(id, { 
  presign: true,
  ttlSeconds: 3600,
  projection: ['email', 'status'],
});

// Get specific version
const v1 = await ops.getVersion(id, 1);

// Get as of time (time-travel)
const historical = await ops.getAsOf(id, '2024-01-01T00:00:00Z');

// List by metadata with pagination
const results = await ops.listByMeta({
  filter: { status: 'active' },
  limit: 50,
  afterId: lastId,
  sort: { updatedAt: -1 },
}, { presign: true });
```

---

## 🧪 Testing

### Basic Test
```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  dbConnections: { 'local': { mongoUri: 'mongodb://localhost:27017' } },
  spacesConnections: {},
  databases: { 
    runtime: {
      tenantDatabases: [{
        tenantId: 'test',
        dbConnRef: 'local',
        spaceConnRef: 'local',
        bucket: 'test-bucket',
        dbName: 'test_runtime',
        analyticsDbName: 'test_analytics'
      }]
    }
  },
  localStorage: { enabled: true, basePath: './test-data' }
});

const ops = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'test',
  collection: 'test' 
});

// Test operations
const created = await ops.create({ test: 'data' });
console.log('Created:', created);

const read = await ops.getLatest(created.id);
console.log('Read:', read);
```

---

## 🚨 Troubleshooting

### Common Issues

1. **"Database connection not found"**: Check that `dbConnRef` matches a key in `dbConnections`
2. **"S3 connection not found"**: Check that `spaceConnRef` matches a key in `spacesConnections`
3. **"Analytics database not found"**: Ensure `analyticsDbName` is provided in runtime tenant databases
4. **"Transaction failed"**: Check MongoDB replica set configuration or enable `autoDetect`

### Validation
```typescript
import { validateChronosConfig } from 'chronos-db';

try {
  validateChronosConfig(config);
  console.log('Configuration is valid');
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

---

## 📚 Next Steps

- [Configuration Guide](./CONFIGURATION.md) - Detailed configuration options
- [API Reference](./API.md) - Complete API documentation
- [Examples](./EXAMPLES.md) - Code examples and patterns
- [Getting Started](./GETTING_STARTED.md) - Step-by-step setup

---

**Ready to build enterprise-grade applications with Chronos-DB v2.0.1!** 🚀