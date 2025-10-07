# Chronos-DB Getting Started Guide

> **Version**: chronos-db@2.2.0+  
> **Last Updated**: October 2025

---

## 🎯 Overview

This guide provides step-by-step instructions for setting up Chronos-DB v2.2.0 in your application. Chronos-DB is an enterprise-grade MongoDB persistence layer with embedded multi-tenancy, tiered architecture, and big data capabilities.

### ✅ What's New in v2.2.0

- **Enterprise Multi-Tenancy**: Built-in tenant isolation with tiered architecture
- **Connection Reuse**: Define MongoDB/S3 connections once, reference everywhere (95% reuse)
- **Integrated Analytics**: Analytics databases embedded in runtime configuration
- **Azure Storage Support**: Support for Azure Blob Storage alongside S3-compatible providers
- **Enhanced Counter Rules**: Unique counting capabilities for sophisticated analytics
- **System Fields**: All system fields organized under `_system` property
- **Simplified Configuration**: No more nested tenant wrappers

---

## 📦 Installation

### Prerequisites

- Node.js 18.0.0 or higher
- MongoDB (standalone, replica set, or sharded cluster)
- S3-compatible storage (AWS S3, DigitalOcean Spaces, MinIO, Azure Blob Storage) or local filesystem

### Install Chronos-DB

```bash
npm install chronos-db@latest
```

### Import the Package

```typescript
import { initChronos } from 'chronos-db';
```

---

## 🚀 Basic Setup

### Step 1: Minimal Configuration

Start with a minimal configuration for development:

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
```

### Step 2: Create Operations Interface

```typescript
// Create operations interface for a specific tenant and collection
const ops = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'default',
  collection: 'users' 
});
```

### Step 3: Perform Operations

```typescript
// Create a user
const user = await ops.create({
  email: 'user@example.com',
  name: 'John Doe',
  status: 'active'
}, 'system', 'user-creation');

console.log('Created user:', user);
// Output: { id: '507f1f77bcf86cd799439011', ov: 0, cv: 1, createdAt: '2024-01-01T00:00:00Z' }

// Read the user
const readUser = await ops.getLatest(user.id);
console.log('User data:', readUser);
// Output: { id: '507f1f77bcf86cd799439011', email: 'user@example.com', name: 'John Doe', status: 'active', _system: { ... } }

// Update the user
const updatedUser = await ops.update(user.id, {
  status: 'verified'
}, user.ov, 'admin', 'user-verification');

console.log('Updated user:', updatedUser);
// Output: { id: '507f1f77bcf86cd799439011', ov: 1, cv: 2, updatedAt: '2024-01-01T01:00:00Z' }
```

---

## 🏗️ Multi-Tenant Setup

### Step 1: Define Multiple Tenants

```typescript
const chronos = initChronos({
  // Connection definitions (95% reuse as requested)
  dbConnections: {
    'mongo-primary': {
      mongoUri: 'mongodb+srv://user:pass@primary-cluster.mongodb.net/?retryWrites=true&w=majority'
    }
  },
  
  spacesConnections: {
    's3-primary': {
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      accessKey: process.env.AWS_ACCESS_KEY_ID,
      secretKey: process.env.AWS_SECRET_ACCESS_KEY
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
          spaceConnRef: 's3-primary',
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
  }
});
```

### Step 2: Create Tenant-Specific Operations

```typescript
// Tenant A operations
const tenantAOps = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'tenant-a',
  collection: 'users' 
});

// Tenant B operations
const tenantBOps = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'tenant-b',
  collection: 'users' 
});

// Generic operations (no tenant)
const genericOps = chronos.with({ 
  databaseType: 'metadata',
  tier: 'generic',
  collection: 'config' 
});

// Domain operations
const domainOps = chronos.with({ 
  databaseType: 'knowledge',
  tier: 'domain',
  domain: 'healthcare',
  collection: 'articles' 
});
```

### Step 3: Perform Multi-Tenant Operations

```typescript
// Create users in different tenants (completely isolated)
const userA = await tenantAOps.create({
  email: 'user@tenant-a.com',
  name: 'User A',
  tenantId: 'tenant-a'
}, 'system', 'user-creation');

const userB = await tenantBOps.create({
  email: 'user@tenant-b.com',
  name: 'User B',
  tenantId: 'tenant-b'
}, 'system', 'user-creation');

// Create generic configuration
const config = await genericOps.create({
  appName: 'MyApp',
  version: '2.0.1'
}, 'system', 'config-creation');

// Create domain-specific content
const article = await domainOps.create({
  title: 'Healthcare Article',
  content: 'Medical content...',
  domain: 'healthcare'
}, 'system', 'article-creation');
```

---

## 📊 Enhanced Analytics Setup

### Step 1: Configure Counter Rules

```typescript
const chronos = initChronos({
  // ... other configuration
  
  // Enhanced counter rules with unique counting
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
});
```

### Step 2: Track Analytics

```typescript
// Create events that trigger counters
await ops.create({
  userId: 'user123',
  action: 'login',
  sessionId: 'sess456',
  timestamp: new Date()
}, 'system', 'login-event');

await ops.create({
  userId: 'user123',
  action: 'view',
  productId: 'prod789',
  category: 'electronics',
  brand: 'Apple'
}, 'system', 'view-event');

await ops.create({
  userId: 'user123',
  userTier: 'premium',
  action: 'purchase',
  productId: 'prod789',
  category: 'electronics',
  amount: 150
}, 'system', 'purchase-event');
```

### Step 3: Retrieve Analytics

```typescript
// Get analytics for a tenant
const metrics = await chronos.counters.getTotals({
  dbName: 'chronos_runtime_tenant_a',
  collection: 'events',
});

console.log('Analytics:', metrics);
// Output:
// {
//   created: 1000,
//   updated: 500,
//   deleted: 50,
//   activeUsers: 750,
//   uniqueSessions: 200,
//   uniqueProducts: 150,
//   uniqueCategories: 25,
//   uniqueBrands: 12
// }
```

---

## 🔐 Security & Compliance Setup

### Step 1: Enable Security Features

```typescript
const chronos = initChronos({
  // ... other configuration
  
  // Security and compliance
  logicalDelete: { enabled: true },    // GDPR compliance
  versioning: { enabled: true },       // Audit trails
  transactions: { enabled: true },     // Data integrity
});
```

### Step 2: Implement Tenant Isolation

```typescript
// Option A: Complete Isolation (Highest Security)
const secureConfig = {
  tenantDatabases: [
    {
      tenantId: 'healthcare-provider',
      dbConnRef: 'mongo-healthcare',      // Separate MongoDB cluster
      spaceConnRef: 's3-healthcare',      // Separate S3 bucket
      bucket: 'chronos-healthcare',
      dbName: 'chronos_healthcare',
      analyticsDbName: 'chronos_analytics_healthcare'
    }
  ]
};

// Option B: Shared Infrastructure (Cost-Effective)
const costEffectiveConfig = {
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
};
```

### Step 3: Implement Data Lineage Tracking

```typescript
// Create records with parent lineage
const childRecord = await ops.create(childData, 'system', 'child creation', {
  parentRecord: {
    id: parentId,
    collection: 'parent_items',
  }
});

// Create records with explicit origin
const importedRecord = await ops.create(data, 'system', 'import', {
  origin: {
    id: 'external-system-id',
    collection: 'customers',
    system: 'stripe'  // Optional external system name
  }
});
```

---

## 🚀 Storage Provider Setup

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

## 🧪 Testing Your Setup

### Step 1: Basic Functionality Test

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
async function testOperations() {
  try {
    // Test create
    const created = await ops.create({ test: 'data' });
    console.log('✅ Create working:', created);

    // Test read
    const read = await ops.getLatest(created.id);
    console.log('✅ Read working:', read);

    // Test update
    const updated = await ops.update(created.id, { test: 'updated' }, created.ov);
    console.log('✅ Update working:', updated);

    // Test delete
    const deleted = await ops.delete(updated.id, updated.ov);
    console.log('✅ Delete working:', deleted);

    console.log('🎉 All operations successful!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOperations();
```

### Step 2: Multi-Tenant Test

```typescript
async function testMultiTenancy() {
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

  // Create users in different tenants
  const userA = await tenantAOps.create({ email: 'user@tenant-a.com' });
  const userB = await tenantBOps.create({ email: 'user@tenant-b.com' });

  // Verify isolation - userA should not be visible to tenantB
  try {
    await tenantBOps.getLatest(userA.id);
    console.log('❌ Tenant isolation failed!');
  } catch (error) {
    console.log('✅ Tenant isolation working!');
  }

  console.log('🎉 Multi-tenancy test successful!');
}

testMultiTenancy();
```

---

## 🚨 Troubleshooting

### Common Issues

1. **"Database connection not found"**
   - Check that `dbConnRef` matches a key in `dbConnections`
   - Verify MongoDB connection string is correct

2. **"S3 connection not found"**
   - Check that `spaceConnRef` matches a key in `spacesConnections`
   - Verify S3 credentials and endpoint

3. **"Analytics database not found"**
   - Ensure `analyticsDbName` is provided in runtime tenant databases
   - Check that the analytics database exists

4. **"Transaction failed"**
   - Check MongoDB replica set configuration
   - Enable `autoDetect: true` in transaction config

### Validation

```typescript
import { validateChronosConfig } from 'chronos-db';

try {
  validateChronosConfig(config);
  console.log('✅ Configuration is valid');
} catch (error) {
  console.error('❌ Configuration error:', error.message);
}
```

### Health Check

```typescript
const health = await chronos.health();
console.log('Health status:', health);
```

---

## 📚 Next Steps

- [Configuration Guide](./CONFIGURATION.md) - Detailed configuration options
- [API Reference](./API.md) - Complete API documentation
- [Examples](./EXAMPLES.md) - Code examples and patterns
- [Quick Start Guide](./QUICK_START_GUIDE.md) - Fast setup guide

---

**Congratulations! You're now ready to build enterprise-grade applications with Chronos-DB v2.0.1!** 🚀