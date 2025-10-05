# Chronos Examples

Common use cases and patterns.

---

## Example 1: Basic CRUD

```javascript
import { initChronos } from 'chronos-db';

const chronos = initChronos(config);
const ops = chronos.with({ dbName: 'app', collection: 'users' });

// Create
const user = await ops.create({
  email: 'john@example.com',
  name: 'John Doe',
  status: 'pending'
});

// Update
await ops.update(user.id, { status: 'active' });

// Read
const current = await ops.getItem(user.id);

// Delete
await ops.delete(user.id);
```

---

## Example 2: Time-Travel Queries

```javascript
// Create and update a record
const order = await ops.create({ amount: 100, status: 'pending' });
await ops.update(order.id, { amount: 200, status: 'paid' });
await ops.update(order.id, { status: 'shipped' });

// Get original version
const original = await ops.getItem(order.id, { ov: 0 });
// { item: { amount: 100, status: 'pending' } }

// Get as of yesterday
const yesterday = await ops.getItem(order.id, { 
  at: '2025-09-30T00:00:00Z' 
});

// Query all orders as they were last month
const snapshot = await ops.query(
  { status: 'paid' },
  { at: '2025-09-01T00:00:00Z' }
);
```

---

## Example 3: Data Enrichment Pipeline

```javascript
// Stage 1: Import raw data
await ops.create({
  email: 'customer@example.com',
  name: 'Customer'
}, 'importer', 'csv import');

// Stage 2: Enrich with AI analysis
await ops.enrich(id, {
  sentiment: 'positive',
  category: 'enterprise',
  tags: ['high-value']
}, { functionId: 'ai-analyzer@v2' });

// Stage 3: Enrich with external data
await ops.enrich(id, {
  companyInfo: {
    revenue: '10M',
    employees: 500
  },
  tags: ['verified']  // Arrays unioned!
}, { functionId: 'clearbit@v1' });

// Final result has all enrichments merged
// tags: ['high-value', 'verified']
// _system.functionIds: ['ai-analyzer@v2', 'clearbit@v1']
```

---

## Example 4: External Data Import with Deduplication

```javascript
// Import from Stripe
const stripeCustomers = await stripe.customers.list();

for (const customer of stripeCustomers.data) {
  const result = await ops.smartInsert({
    email: customer.email,
    name: customer.name,
    stripeId: customer.id
  }, {
    uniqueKeys: ['email'],  // Dedupe by email
    origin: {
      id: customer.id,
      collection: 'customers',
      system: 'stripe'
    },
    functionId: 'stripe-importer@v1'
  });
  
  if (result.created) {
    console.log('Created:', result.id);
  } else {
    console.log('Merged into existing:', result.id);
  }
}
```

---

## Example 5: Parent-Child Lineage

```javascript
// Create parent
const parent = await ops.create({
  type: 'campaign',
  name: 'Summer Sale'
});

// Create children with lineage
const childOps = chronos.with({ dbName: 'app', collection: 'emails' });

for (const email of emails) {
  await childOps.create({
    subject: email.subject,
    recipient: email.to
  }, 'system', 'campaign email', {
    parentRecord: {
      id: parent.id,
      collection: 'campaigns'
    }
  });
}

// All children have:
// _system.parentId = parent.id
// _system.originId = parent.id
```

---

## Example 6: Audit Trail

```javascript
// All changes are automatically versioned
await ops.create({ balance: 1000 }, 'system', 'account created');
await ops.update(id, { balance: 900 }, ov, 'atm', 'withdrawal');
await ops.update(id, { balance: 1100 }, ov, 'deposit', 'salary');

// Complete audit trail
const allVersions = await getAllVersions(id);  // Custom query
// v0: balance: 1000, actor: "system", reason: "account created"
// v1: balance: 900,  actor: "atm", reason: "withdrawal"
// v2: balance: 1100, actor: "deposit", reason: "salary"
```

---

## Example 7: Compliance - Point-in-Time Reporting

```javascript
// "Show me all active subscriptions as of Dec 31, 2024"
const yearEnd = await ops.query(
  { status: 'active', type: 'subscription' },
  { 
    at: '2024-12-31T23:59:59Z',
    includeMeta: true
  }
);

console.log(`Found ${yearEnd.items.length} active subscriptions on Dec 31`);
```

---

## Example 8: Restore After Accidental Delete

```javascript
// Oops! Accidentally deleted
await ops.delete(importantId);

await ops.getItem(importantId);  // null (hidden)

// Restore to previous version
await ops.restoreObject(importantId, { 
  ov: lastGoodVersion 
});

// Back online!
const restored = await ops.getItem(importantId);
```

---

## Example 9: Batch Operations with Fallback

```javascript
// Enable fallback queues
const chronos = initUnifiedDataManager({
  // ... config
  fallback: {
    enabled: true,
    maxAttempts: 10
  }
});

// Start worker
await chronos.fallback.startWorker();

// Batch operations - failures automatically retried!
for (const item of largeDataset) {
  try {
    await ops.create(item);
  } catch (error) {
    if (error.queued) {
      console.log('Queued for retry:', error.requestId);
    }
  }
}

// Monitor queue
const stats = await chronos.fallback.getQueueStats();
console.log('Pending:', stats.queueSize);
```

---

## Example 10: Multi-Tenant with Routing

```javascript
// Tenant A
const tenantA = chronos.with({
  dbName: 'app',
  collection: 'users',
  tenantId: 'tenant-a'
});

// Tenant B
const tenantB = chronos.with({
  dbName: 'app',
  collection: 'users',
  tenantId: 'tenant-b'
});

// Automatically routed to appropriate backend
await tenantA.create({ email: 'user-a@example.com' });
await tenantB.create({ email: 'user-b@example.com' });
```

---

## Example 11: Metadata and Projection

```javascript
// Get just email
const email = await ops.getItem(id, { 
  projection: ['email'] 
});
// { id, item: { email: "..." } }

// Get with version metadata
const withMeta = await ops.getItem(id, { 
  includeMeta: true 
});
// {
//   id,
//   item: { ... },
//   _meta: { ov: 5, cv: 100, at: "...", metaIndexed: {...} }
// }
```

---

## Example 12: Presigned URLs for Files

```javascript
// Create with base64 image
await ops.create({
  email: 'john@example.com',
  avatar: 'base64-encoded-image-data...'
});

// Get with presigned URL
const user = await ops.getItem(id, { 
  presign: true,
  ttlSeconds: 3600  // 1 hour
});

// user.presigned.avatar.blobUrl = "https://s3.../signed-url"
```

---

## Example 13: Health Monitoring

```javascript
// Check system health
const health = await chronos.admin.health();

if (!health.mongoBackends.every(b => b.ok)) {
  console.error('MongoDB backend down!');
}

if (!health.s3Backends.every(b => b.ok)) {
  console.error('Storage backend down!');
}

// List backends
const backends = await chronos.admin.listBackends();
console.log('Backends:', backends);
```

---

## More Examples

See the [examples/](../examples/) folder for runnable code:
- `mongodb-only-local.js` - Complete CRUD demo
- `smart-insert-demo.js` - Upsert with merge demo

---

**Need more help?** Check the [API Reference](./API.md) or [Configuration Guide](./CONFIGURATION.md).

