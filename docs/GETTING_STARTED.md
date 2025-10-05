# Getting Started with Chronos

---

## Installation

```bash
npm install chronos
```

---

## Basic Setup (MongoDB Only)

The simplest way to get started - just MongoDB and a local folder:

```javascript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // MongoDB connection
  mongoUris: ['mongodb://localhost:27017'],
  
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
  
  // Rollup
  rollup: { enabled: false, manifestPeriod: 'daily' },
  
  // Define collections
  collectionMaps: {
    users: {
      indexedProps: ['email', 'status'],
      validation: {
        requiredIndexed: ['email'],
      },
    },
  },
});
```

---

## Your First Operations

```javascript
// Bind to a collection
const ops = chronos.with({
  dbName: 'myapp',
  collection: 'users',
});

// CREATE - just like MongoDB!
const result = await ops.create({
  email: 'john@example.com',
  name: 'John Doe',
  status: 'active',
});

console.log(result);
// {
//   id: "68dd...",
//   ov: 0,          // Object version
//   cv: 1,          // Collection version  
//   createdAt: Date
// }

// READ - clean and simple
const user = await ops.getItem(result.id);
console.log(user);
// {
//   id: "68dd...",
//   item: {
//     email: "john@example.com",
//     name: "John Doe",
//     status: "active",
//     _system: {
//       insertedAt: "2025-10-01T12:00:00Z",
//       updatedAt: "2025-10-01T12:00:00Z"
//     }
//   }
// }

// UPDATE
await ops.update(result.id, { status: 'verified' }, result.ov);

// QUERY - just like MongoDB find()
const activeUsers = await ops.query({ status: 'active' });
console.log(activeUsers.items.length);

// DELETE (logical - hidden by default)
await ops.delete(result.id);

await ops.getItem(result.id);  // Returns: null ✅

// Shutdown when done
await chronos.admin.shutdown();
```

---

## Production Setup (MongoDB + S3)

```javascript
const chronos = initUnifiedDataManager({
  mongoUris: [
    'mongodb://mongo1:27017',
    'mongodb://mongo2:27017',
  ],
  
  // S3-compatible storage (AWS, DigitalOcean, MinIO, R2)
  spacesConns: [{
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    accessKey: 'YOUR_ACCESS_KEY',
    secretKey: 'YOUR_SECRET_KEY',
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
    backupsBucket: 'chronos-backups',
    forcePathStyle: false,
  }],
  
  // Separate counters DB
  counters: {
    mongoUri: 'mongodb://counters-db:27017',
    dbName: 'chronos_counters',
  },
  
  // ... rest of config
});
```

---

## Next Steps

- [Configuration Guide](./CONFIGURATION.md) - All configuration options
- [API Reference](./API.md) - Complete API documentation
- [Examples](./EXAMPLES.md) - Common patterns and recipes

---

## Requirements

- **Node.js:** >=18.0.0
- **MongoDB:** 4.4+ (Replica set recommended for production)
- **Storage:** S3-compatible provider OR local filesystem

---

## Need Help?

- [GitHub Issues](https://github.com/sagente/chronos/issues)
- [Documentation](./docs/)
- [Examples](../examples/)

---

**Ready to time-travel?** ⏰✨

