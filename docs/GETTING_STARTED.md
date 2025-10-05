# Getting Started with Chronos

---

## Installation

```bash
npm install chronos-db
```

---

## Basic Setup (MongoDB Only)

The simplest way to get started - just MongoDB and a local folder:

```javascript
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
    basePath: './chronos-data',
  },
  
  // Counters
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters',
  },
  
  // Routing
  routing: { hashAlgo: 'rendezvous' },
  
  // Retention
  retention: {
    ver: { days: 90, maxPerItem: 1000 },
    counters: { days: 30, weeks: 12, months: 6 },
  },
  
  // Collection maps
  collectionMaps: {
    users: { indexedProps: ['email'] }
  }
});
```

---

## Basic Usage

```javascript
// Get operations for a specific collection
const ops = chronos.with({
  dbName: 'runtime_local',
  collection: 'users'
});

// Create a new user
const user = await ops.create({
  email: 'user@example.com',
  name: 'John Doe',
  status: 'active'
}, 'system', 'user registration');

console.log('Created user:', user);
// Output: { id: '...', ov: 0, cv: 0, createdAt: '...' }

// Update the user
const updated = await ops.update(user.id, {
  status: 'verified'
}, user.ov, 'system', 'email verification');

console.log('Updated user:', updated);
// Output: { id: '...', ov: 1, cv: 1, updatedAt: '...' }

// Read the latest version
const latest = await ops.getLatest(user.id);
console.log('Latest user:', latest);

// Read a specific version
const version0 = await ops.getVersion(user.id, { ov: 0 });
console.log('Original user:', version0);
```

---

## Setup with S3 Storage

For production use with S3-compatible storage:

```javascript
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
    dbName: 'chronos_counters',
  },
  
  // Routing
  routing: { hashAlgo: 'rendezvous' },
  
  // Retention
  retention: {
    ver: { days: 90, maxPerItem: 1000 },
    counters: { days: 30, weeks: 12, months: 6 },
  },
  
  // Collection maps
  collectionMaps: {
    users: { 
      indexedProps: ['email', 'status'],
      validation: { requiredIndexed: ['email'] }
    },
    documents: {
      indexedProps: ['clientId', 'docType'],
      base64Props: { 
        content: { 
          contentType: 'application/pdf',
          preferredText: false
        }
      }
    }
  },
  
  // Fallback queue
  fallback: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000
  },
  
  // Transactions
  transactions: {
    enabled: true,
    autoDetect: true
  }
});
```

---

## Multi-Tenant Setup

For multi-tenant applications:

```javascript
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
    dbName: 'chronos_counters',
  },
  
  // Routing
  routing: { hashAlgo: 'rendezvous' },
  
  // Retention
  retention: {
    ver: { days: 90, maxPerItem: 1000 },
    counters: { days: 30, weeks: 12, months: 6 },
  },
  
  // Collection maps
  collectionMaps: {
    users: { 
      indexedProps: ['email', 'status'],
      validation: { requiredIndexed: ['email'] }
    }
  }
});
```

### Multi-Tenant Usage

```javascript
// Option A: Direct key usage (simplest)
const ops = chronos.with({
  key: 'runtime-tenant-a',  // Direct lookup, no resolution needed
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

// Create users in different tenants
await ops.create({ email: 'user1@tenant-a.com' }, 'system', 'signup');
await ops2.create({ email: 'user2@tenant-a.com' }, 'system', 'signup');
await ops3.create({ event: 'user_login', timestamp: new Date() }, 'system', 'audit');
```

---

## Key Concepts

### Database Types
- **`metadata`** - System configuration, user settings, application metadata
- **`knowledge`** - Content, documents, knowledge base, static data
- **`runtime`** - User data, transactions, dynamic application data
- **`logs`** - System logs and audit trails (no tiers, simple structure)

### Key-Based Connection Mapping
- **`key`** - Globally unique identifier for direct routing
- **`mongoConnKey`** - References a MongoDB connection from the `mongoConns` array
- **`spacesConnKey`** - References an S3 connection from the `spacesConns` array
- **`tenantId`** - External identifier for tenant mapping

### Benefits
- **Reusability**: One MongoDB connection can serve multiple databases
- **Flexibility**: One S3 connection can serve multiple database types
- **Clarity**: Explicit relationships between components
- **Maintainability**: Easy to update connection details in one place

---

## Next Steps

1. **Read the [Configuration Guide](CONFIGURATION.md)** for detailed configuration options
2. **Check the [API Documentation](API.md)** for complete API reference
3. **See [Examples](../examples/)** for real-world configuration examples
4. **Review [Architecture](ARCHITECTURE.md)** for understanding the system design

---

## Troubleshooting

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