# Chronos-DB v2.0 🚀

> **Enterprise-Grade MongoDB Persistence Layer with Embedded Multi-Tenancy & Big Data Architecture**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]() 
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## 🎯 **Built for Enterprise & Big Data**

Chronos-DB v2.0 is designed for **large-scale enterprise applications** requiring **tenant isolation**, **data versioning**, and **complex data relationships**. Built with **embedded multi-tenancy by design** and **tiered architecture** to handle big data workloads efficiently while maintaining **enterprise-grade security and compliance**.

### 🏢 **Enterprise Features**

- **🏢 Embedded Multi-Tenancy**: Built-in tenant isolation with configurable database tiers
- **📊 Tiered Architecture**: Separate metadata, knowledge, runtime, and logs databases  
- **⚡ Big Data Ready**: Optimized for high-volume operations with S3 integration
- **🔄 Time-Travel Queries**: Full historical data access and point-in-time recovery
- **🔒 Enterprise Security**: Row-level security with tenant-based data isolation
- **📈 Scalable Design**: Horizontal scaling across multiple MongoDB clusters
- **🛡️ Compliance Ready**: Built-in audit trails, data lineage, and regulatory compliance features

---

## 📖 **Architecture Overview**

Chronos-DB v2.0 provides a production-ready persistence layer designed for **enterprise applications** and **big data projects** that combines:

- **🏢 Multi-Tenant Architecture**: Built-in tenant isolation with configurable database tiers (metadata, knowledge, runtime, logs)
- **📊 MongoDB** for indexed metadata, head pointers, and bounded recent version index
- **☁️ S3-compatible storage** for authoritative payloads, full JSON per version
- **🔄 Automatic versioning** with explicit restore capabilities and time-travel queries
- **⚡ Multi-backend routing** with connection pooling for horizontal scaling
- **🔒 Transaction locking** for concurrent write prevention across multiple servers
- **📈 Big Data Optimization**: Efficient handling of large datasets with S3 integration
- **🎯 Tenant Isolation**: Row-level security with configurable tenant boundaries
- **📊 Integrated Analytics**: Built-in counters and metrics for business intelligence
- **🔧 Enrichment API** for incremental updates
- **🔄 Fallback queues** for guaranteed durability
- **⚡ Write optimization** for high-throughput scenarios

### **Key Principles**

✅ **No Environment Variables** - All configuration via JSON  
✅ **Cost-First** - Minimize storage and compute costs  
✅ **Stability-First** - Immutable versioning, transactions, optimistic locking  
✅ **Concurrent-Safe** - Transaction locking prevents multi-server write conflicts  
✅ **Portable** - Works with any S3-compatible provider  
✅ **Type-Safe** - Full TypeScript support with Zod validation  
✅ **Security-First** - Built-in tenant isolation and data protection  
✅ **Compliance-Ready** - Audit trails, data lineage, and regulatory features  

---

## 🏢 **Multi-Tenant Architecture & Security**

### **🔒 Security-First Design**

Chronos-DB v2.0 implements **enterprise-grade security** with multiple layers of protection:

#### **1. Tenant Isolation**
- **Complete Data Separation**: Each tenant's data is stored in separate databases
- **Network-Level Isolation**: Different MongoDB clusters per tenant (optional)
- **Storage Isolation**: Separate S3 buckets or prefixes per tenant
- **Access Control**: Tenant-based routing prevents cross-tenant data access

#### **2. Row-Level Security**
- **Tenant Context**: Every operation requires explicit tenant context
- **Automatic Filtering**: Queries automatically filter by tenant
- **Audit Trails**: All operations logged with tenant information
- **Data Lineage**: Complete tracking of data flow and transformations

#### **3. Compliance Features**
- **GDPR Compliance**: Built-in data deletion and anonymization
- **SOX Compliance**: Immutable audit trails and data integrity
- **HIPAA Compliance**: Encrypted data storage and access controls
- **SOC 2**: Comprehensive logging and monitoring capabilities

### **🏗️ Tiered Database Architecture**

Chronos-DB uses a **sophisticated tiered approach** to optimize for different data types and security requirements:

```typescript
// Multi-tier database configuration with security considerations
databases: {
  metadata: {
    genericDatabase: {     // System-wide metadata (no tenant isolation needed)
      dbConnRef: 'mongo-primary',
      spaceConnRef: 's3-primary',
      bucket: 'chronos-metadata',
      dbName: 'chronos_metadata_generic'
    },
    domainsDatabases: [    // Domain-level metadata (shared within domain)
      {
        domain: 'healthcare',
        dbConnRef: 'mongo-healthcare',
        spaceConnRef: 's3-healthcare',
        bucket: 'chronos-metadata-healthcare',
        dbName: 'chronos_metadata_healthcare'
      }
    ],
    tenantDatabases: [    // Tenant-specific metadata (isolated per tenant)
      {
        tenantId: 'tenant-a',
        dbConnRef: 'mongo-tenant-a',
        spaceConnRef: 's3-tenant-a',
        bucket: 'chronos-metadata-tenant-a',
        dbName: 'chronos_metadata_tenant_a'
      }
    ]
  },
  knowledge: {
    genericDatabase: {     // Shared knowledge base
      dbConnRef: 'mongo-primary',
      spaceConnRef: 's3-primary',
      bucket: 'chronos-knowledge',
      dbName: 'chronos_knowledge_generic'
    },
    domainsDatabases: [    // Domain-specific knowledge
      {
        domain: 'finance',
        dbConnRef: 'mongo-finance',
        spaceConnRef: 's3-finance',
        bucket: 'chronos-knowledge-finance',
        dbName: 'chronos_knowledge_finance'
      }
    ],
    tenantDatabases: [    // Tenant-specific knowledge
      {
        tenantId: 'tenant-b',
        dbConnRef: 'mongo-tenant-b',
        spaceConnRef: 's3-tenant-b',
        bucket: 'chronos-knowledge-tenant-b',
        dbName: 'chronos_knowledge_tenant_b'
      }
    ]
  },
  runtime: {
    tenantDatabases: [    // Runtime data (always tenant-isolated)
      {
        tenantId: 'tenant-a',
        dbConnRef: 'mongo-tenant-a',
        spaceConnRef: 's3-tenant-a',
        bucket: 'chronos-runtime-tenant-a',
        dbName: 'chronos_runtime_tenant_a',
        analyticsDbName: 'chronos_analytics_tenant_a'  // Integrated analytics
      }
    ]
  },
  logs: {                 // System logs (centralized)
    dbConnRef: 'mongo-logs',
    spaceConnRef: 's3-logs',
    bucket: 'chronos-logs',
    dbName: 'chronos_logs'
  }
}
```

### **🔐 Security Best Practices**

#### **1. Connection Reuse & Security**
```typescript
// Define connections once, reference everywhere (95% reuse as requested)
dbConnections: {
  'mongo-primary': {
    mongoUri: 'mongodb+srv://user:pass@primary-cluster.mongodb.net/?retryWrites=true&w=majority'
  },
  'mongo-tenant-a': {
    mongoUri: 'mongodb+srv://user:pass@tenant-a-cluster.mongodb.net/?retryWrites=true&w=majority'
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
  's3-tenant-a': {
    endpoint: 'https://tenant-a-bucket.s3.amazonaws.com',
    region: 'us-east-1',
    accessKey: process.env.TENANT_A_ACCESS_KEY,
    secretKey: process.env.TENANT_A_SECRET_KEY
  }
}
```

#### **2. Tenant Isolation Strategies**

**Option A: Complete Isolation (Highest Security)**
```typescript
// Each tenant gets separate MongoDB cluster and S3 bucket
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
```

**Option B: Shared Infrastructure (Cost-Effective)**
```typescript
// Multiple tenants share infrastructure but with strict isolation
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

#### **3. Compliance Configuration**

**GDPR Compliance**
```typescript
// Enable logical delete for GDPR compliance
logicalDelete: {
  enabled: true  // Default - enables data recovery and audit trails
},

// Enable versioning for data lineage
versioning: {
  enabled: true  // Default - enables time-travel queries and audit trails
}
```

**SOX Compliance**
```typescript
// Enable comprehensive audit trails
collectionMaps: {
  financial_records: {
    indexedProps: ['accountId', 'transactionId', 'amount', 'date'],
    validation: {
      requiredIndexed: ['accountId', 'transactionId', 'amount']
    }
  }
},

// Enable transaction logging
transactions: {
  enabled: true,
  autoDetect: true
}
```

---

## 📊 **Big Data Architecture & Performance**

### **🚀 Big Data Optimization**

Chronos-DB v2.0 is specifically designed for **big data scenarios** with enterprise-grade performance:

#### **1. Horizontal Scaling**
```typescript
// Distribute load across multiple MongoDB clusters
dbConnections: {
  'mongo-cluster-1': { mongoUri: 'mongodb://cluster-1:27017' },
  'mongo-cluster-2': { mongoUri: 'mongodb://cluster-2:27017' },
  'mongo-cluster-3': { mongoUri: 'mongodb://cluster-3:27017' }
},

// S3 storage across multiple regions
spacesConnections: {
  's3-us-east': {
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1'
  },
  's3-eu-west': {
    endpoint: 'https://s3.eu-west-1.amazonaws.com',
    region: 'eu-west-1'
  }
}
```

#### **2. High-Throughput Operations**
```typescript
// Optimized for millions of operations per day
const chronos = initChronos({
  // ... configuration
  writeOptimization: {
    batchSize: 1000,           // Batch S3 operations
    debounceMs: 100,          // Debounce counter updates
    compressionEnabled: true   // Compress large payloads
  },
  
  // Fallback queues for guaranteed durability
  fallback: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxDelayMs: 60000
  }
});
```

#### **3. Analytics Integration**
```typescript
// Built-in analytics for each tenant
runtime: {
  tenantDatabases: [
    {
      tenantId: 'tenant-a',
      dbConnRef: 'mongo-tenant-a',
      spaceConnRef: 's3-tenant-a',
      bucket: 'chronos-runtime-tenant-a',
      dbName: 'chronos_runtime_tenant_a',
      analyticsDbName: 'chronos_analytics_tenant_a'  // Integrated analytics
    }
  ]
}
```

### **📈 Big Data Use Cases**

#### **1. IoT Data Ingestion**
```typescript
// High-volume IoT data processing
const iotOps = chronos.with({
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'iot-platform',
  collection: 'sensor-data'
});

// Batch processing for millions of sensor readings
const batchSize = 10000;
const sensorData = Array.from({ length: batchSize }, (_, i) => ({
  deviceId: `sensor-${i % 1000}`,
  timestamp: new Date(),
  temperature: Math.random() * 100,
  humidity: Math.random() * 100,
  location: { lat: Math.random() * 90, lng: Math.random() * 180 }
}));

// Efficient batch insertion
for (let i = 0; i < sensorData.length; i += 100) {
  const batch = sensorData.slice(i, i + 100);
  await Promise.all(batch.map(data => 
    iotOps.create(data, 'iot-ingestion', 'sensor-data')
  ));
}
```

#### **2. Financial Transaction Processing**
```typescript
// High-frequency trading data
const tradingOps = chronos.with({
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'trading-firm',
  collection: 'transactions'
});

// Process thousands of transactions per second
const processTransaction = async (transaction) => {
  const result = await tradingOps.create({
    symbol: transaction.symbol,
    price: transaction.price,
    quantity: transaction.quantity,
    timestamp: transaction.timestamp,
    traderId: transaction.traderId
  }, 'trading-system', 'market-transaction');
  
  // Analytics automatically tracked in analyticsDbName
  return result;
};
```

#### **3. E-commerce Analytics**
```typescript
// Multi-tenant e-commerce platform
const ecommerceOps = chronos.with({
  databaseType: 'runtime',
  tier: 'tenant',
  tenantId: 'ecommerce-store',
  collection: 'orders'
});

// Process orders with automatic analytics
const createOrder = async (orderData) => {
  const result = await ecommerceOps.create({
    customerId: orderData.customerId,
    items: orderData.items,
    total: orderData.total,
    status: 'pending'
  }, 'ecommerce-system', 'order-creation');
  
  // Analytics automatically tracked:
  // - Order count per customer
  // - Revenue per day/month
  // - Product popularity
  // - Customer behavior patterns
  
  return result;
};
```

### **⚡ Performance Optimizations**

#### **1. Connection Pooling**
```typescript
// Efficient MongoDB connection management
const router = new BridgeRouter({
  dbConnections: {
    'mongo-primary': { mongoUri: 'mongodb://primary:27017' }
  },
  // ... other config
});

// Automatic connection pooling per MongoDB URI
// Reuses connections across operations
// Handles connection failures gracefully
```

#### **2. S3 Optimization**
```typescript
// Optimized S3 operations
spacesConnections: {
  's3-optimized': {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    // Automatic retry and exponential backoff
    // Connection pooling for S3 operations
    // Batch operations for multiple files
  }
}
```

#### **3. Caching Strategy**
```typescript
// Dev shadow for frequently accessed data
devShadow: {
  enabled: true,
  ttlHours: 24,              // Cache for 24 hours
  maxBytesPerDoc: 1024 * 1024 // 1MB max per document
}
```

---

## 🚀 **Quick Start**

### **Installation**

```bash
npm install chronos-db@^2.0.0
```

### **Enterprise Multi-Tenant Setup**

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  // Connection definitions (95% reuse as requested)
  dbConnections: {
    'mongo-primary': {
      mongoUri: 'mongodb+srv://user:pass@primary-cluster.mongodb.net'
    },
    'mongo-analytics': {
      mongoUri: 'mongodb+srv://user:pass@analytics-cluster.mongodb.net'
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
  
  // Tiered database architecture
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
  
  // Enterprise configuration
  routing: { hashAlgo: 'rendezvous' },
  retention: { ver: { days: 90 }, counters: { days: 30 } },
  collectionMaps: {
    users: { indexedProps: ['email', 'tenantId'] },
    orders: { indexedProps: ['orderId', 'customerId', 'tenantId'] }
  },
  
  // Security and compliance
  logicalDelete: { enabled: true },    // GDPR compliance
  versioning: { enabled: true },       // Audit trails
  transactions: { enabled: true },     // Data integrity
  
  // Performance optimization
  writeOptimization: {
    batchSize: 1000,
    debounceMs: 100
  },
  fallback: {
    enabled: true,
    maxRetries: 3
  }
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

## ⚙️ **Configuration Reference**

### **Core Configuration**

```typescript
interface ChronosConfig {
  // Required: Connection definitions (95% reuse)
  dbConnections: Record<string, DbConnection>;
  spacesConnections: Record<string, SpacesConnection>;
  
  // Required: Tiered database configuration
  databases: {
    metadata?: {
      genericDatabase: GenericDatabase;
      domainsDatabases: DomainDatabase[];
      tenantDatabases: TenantDatabase[];
    };
    knowledge?: {
      genericDatabase: GenericDatabase;
      domainsDatabases: DomainDatabase[];
      tenantDatabases: TenantDatabase[];
    };
    runtime?: {
      tenantDatabases: RuntimeTenantDatabase[];
    };
    logs?: LogsDatabase;
  };
  
  // Optional: Local filesystem storage (for development/testing)
  localStorage?: {
    basePath: string;
    enabled: boolean;
  };
  
  // Optional: Routing configuration
  routing?: {
    hashAlgo?: 'rendezvous' | 'jump';
    chooseKey?: string | ((ctx: RouteContext) => string);
  };
  
  // Optional: Data retention policies
  retention?: {
    ver?: {
      days?: number;
      maxPerItem?: number;
    };
    counters?: {
      days?: number;
      weeks?: number;
      months?: number;
    };
  };
  
  // Optional: Collection mapping and validation
  collectionMaps?: Record<string, {
    indexedProps: string[]; // Empty array = auto-index all properties
    base64Props?: Record<string, {
      contentType: string;
      preferredText?: boolean;
      textCharset?: string;
    }>;
    validation?: {
      requiredIndexed?: string[];
    };
  }>;
  
  // Optional: Counter rules for analytics
  counterRules?: {
    rules?: Array<{
      name: string;
      on?: ('CREATE' | 'UPDATE' | 'DELETE')[];
      scope?: 'meta' | 'payload';
      when: Record<string, any>;
    }>;
  };
  
  // Optional: Development shadow storage
  devShadow?: {
    enabled: boolean;
    ttlHours: number;
    maxBytesPerDoc?: number;
  };
  
  // Optional: Security and compliance
  logicalDelete?: {
    enabled: boolean;  // Default: true (GDPR compliance)
  };
  versioning?: {
    enabled: boolean;  // Default: true (audit trails)
  };
  
  // Optional: Performance optimization
  writeOptimization?: {
    batchSize?: number;
    debounceMs?: number;
    compressionEnabled?: boolean;
  };
  
  // Optional: Fallback queue configuration
  fallback?: {
    enabled: boolean;
    maxRetries?: number;
    retryDelayMs?: number;
    maxDelayMs?: number;
    deadLetterCollection?: string;
  };
  
  // Optional: Transaction configuration
  transactions?: {
    enabled?: boolean;
    autoDetect?: boolean;
  };
}

// Connection interfaces
interface DbConnection {
  mongoUri: string;
}

interface SpacesConnection {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle?: boolean;
}

// Database interfaces
interface GenericDatabase {
  dbConnRef: string;
  spaceConnRef: string;
  bucket: string;
  dbName: string;
}

interface DomainDatabase {
  domain: string;
  dbConnRef: string;
  spaceConnRef: string;
  bucket: string;
  dbName: string;
}

interface TenantDatabase {
  tenantId: string;
  dbConnRef: string;
  spaceConnRef: string;
  bucket: string;
  dbName: string;
}

interface RuntimeTenantDatabase {
  tenantId: string;
  dbConnRef: string;
  spaceConnRef: string;
  bucket: string;
  dbName: string;
  analyticsDbName: string;  // Integrated analytics
}

interface LogsDatabase {
  dbConnRef: string;
  spaceConnRef: string;
  bucket: string;
  dbName: string;
}
```

### **Multi-Tenant Architecture Explained**

#### **Database Types**
- **`metadata`** - System configuration, user settings, application metadata
- **`knowledge`** - Content, documents, knowledge base, static data
- **`runtime`** - User data, transactions, dynamic application data
- **`logs`** - System logs, audit trails, monitoring

#### **Tiers**
- **`generic`** - Shared across all tenants (system-wide data)
- **`domain`** - Shared within a domain (multi-tenant within domain)
- **`tenant`** - Isolated per tenant (single-tenant data)

#### **Usage Patterns**

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

## 🎯 **Core Features**

### **1. CRUD Operations with Security**

Full transaction support with optimistic locking and tenant isolation:

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

### **2. Enrichment API**

Incrementally augment records without full rewrite:

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

// Batch enrichment
await ops.enrich(id, [
  { tags: ['vip'] },
  { metadata: { score: 100 } },
  { tags: ['verified'] },
]);
```

### **3. Read Operations with Presigned URLs**

Multiple read strategies with security:

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

### **4. Integrated Analytics**

Built-in analytics for each tenant:

```typescript
// Analytics automatically tracked in analyticsDbName
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
// }
```

### **5. Restore Operations**

Explicit, append-only restore with audit trails:

```typescript
// Restore object to specific version
await ops.restoreObject(id, { ov: 5 });
// or by time
await ops.restoreObject(id, { at: '2024-01-01T00:00:00Z' });

// Restore entire collection
await ops.restoreCollection({ cv: 100 });
// or by time
await ops.restoreCollection({ at: '2024-01-01T00:00:00Z' });
```

---

## 🔐 **Security & Compliance**

### **GDPR Compliance**

```typescript
// Enable logical delete for GDPR compliance
logicalDelete: {
  enabled: true  // Default - enables data recovery and audit trails
},

// Enable versioning for data lineage
versioning: {
  enabled: true  // Default - enables time-travel queries and audit trails
}

// Data deletion with audit trail
await ops.delete(id, expectedOv, 'gdpr-request', 'user-data-deletion');
// Data is logically deleted but remains in audit trail
```

### **SOX Compliance**

```typescript
// Enable comprehensive audit trails
collectionMaps: {
  financial_records: {
    indexedProps: ['accountId', 'transactionId', 'amount', 'date'],
    validation: {
      requiredIndexed: ['accountId', 'transactionId', 'amount']
    }
  }
},

// Enable transaction logging
transactions: {
  enabled: true,
  autoDetect: true
}
```

### **HIPAA Compliance**

```typescript
// Separate infrastructure per tenant for healthcare data
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
```

---

## 🏗️ **Architecture**

### **Data Flow**

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Chronos-DB v2.0               │
│  ┌───────────────────────────┐  │
│  │  Router (HRW Hashing)     │  │
│  │  + Tenant Resolution      │  │
│  └───────────────────────────┘  │
│          │           │           │
│          ▼           ▼           │
│  ┌──────────┐  ┌──────────┐     │
│  │  Mongo   │  │    S3    │     │
│  │ (Indexed)│  │(Payloads)│     │
│  └──────────┘  └──────────┘     │
│                                  │
│  ┌───────────────────────────┐  │
│  │  Analytics (Integrated)   │  │
│  └───────────────────────────┘  │
│                                  │
│  ┌───────────────────────────┐  │
│  │  Fallback Queue (Optional)│  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### **MongoDB Collections**

- **`<collection>_head`** - Latest state pointers
- **`<collection>_ver`** - Immutable version index
- **`<collection>_counter`** - Collection version counter
- **`<collection>_locks`** - Transaction locks for concurrent write prevention
- **`cnt_total`** - Counter totals (in analytics database)
- **`chronos_fallback_ops`** - Fallback queue (if enabled)
- **`chronos_fallback_dead`** - Dead letter queue (if enabled)

### **S3 Storage Layout**

```
<jsonBucket>/
  <collection>/
    <itemId>/
      v0/item.json
      v1/item.json
      v2/item.json

<contentBucket>/
  <collection>/
    <itemId>/
      v0/
        <property>/blob.bin
        <property>/text.txt
      v1/
        <property>/blob.bin
```

---

## 🔐 **Production Deployment**

### **MongoDB Replica Set (REQUIRED)**

⚠️ **MongoDB MUST run as a 3-node replica set in production**

```bash
# Example docker-compose.yml
services:
  mongo1:
    image: mongo:6
    command: mongod --replSet rs0
    
  mongo2:
    image: mongo:6
    command: mongod --replSet rs0
    
  mongo3:
    image: mongo:6
    command: mongod --replSet rs0
```

Connection string:
```
mongodb://mongo1:27017,mongo2:27017,mongo3:27017/dbname?replicaSet=rs0
```

### **S3-Compatible Providers**

Tested with:
- ✅ AWS S3
- ✅ DigitalOcean Spaces
- ✅ MinIO
- ✅ Cloudflare R2

---

## 📚 **Documentation**

- [Configuration Guide](./docs/CONFIGURATION.md) - Detailed configuration
- [API Reference](./docs/API.md) - Complete API documentation
- [Examples](./docs/EXAMPLES.md) - Code examples and patterns
- [Getting Started](./docs/GETTING_STARTED.md) - Step-by-step setup
- [Quick Start Guide](./docs/QUICK_START_GUIDE.md) - Fast setup guide

---

## 🤝 **Contributing**

Contributions welcome! Please ensure:

1. TypeScript compilation passes
2. Documentation is updated
3. Security considerations are addressed
4. Tests are included

---

## 📄 **License**

MIT © nx-intelligence

---

## 🙏 **Credits**

Built with:
- [MongoDB](https://www.mongodb.com/) - Document database
- [AWS SDK](https://aws.amazon.com/sdk-for-javascript/) - S3-compatible storage
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Zod](https://zod.dev/) - Schema validation
- [tsup](https://tsup.egoist.dev/) - Build system

---

## 📋 **Frequently Asked Questions (FAQs)**

### **Q: What's new in v2.0.0?**
**A:** Chronos-DB v2.0.0 introduces a completely new architecture:
- **Connection Reuse**: Define MongoDB/S3 connections once, reference everywhere (95% reuse)
- **Tiered Architecture**: Proper separation of generic, domain, and tenant tiers
- **Integrated Analytics**: Analytics databases embedded in runtime configuration
- **Simplified Configuration**: No more nested tenant wrappers
- **Enhanced Security**: Built-in tenant isolation and compliance features

### **Q: How does tenant isolation work?**
**A:** Chronos-DB v2.0.0 provides multiple levels of tenant isolation:
- **Database Level**: Each tenant can have separate databases
- **Infrastructure Level**: Each tenant can have separate MongoDB clusters and S3 buckets
- **Network Level**: Complete network isolation between tenants
- **Access Control**: Tenant context required for all operations

### **Q: What are the security best practices?**
**A:** 
- **Use separate infrastructure** for high-security tenants
- **Enable logical delete** for GDPR compliance
- **Enable versioning** for audit trails
- **Use connection reuse** to reduce attack surface
- **Implement proper access controls** at the application level

### **Q: How do I handle big data scenarios?**
**A:** Chronos-DB v2.0.0 is optimized for big data:
- **Horizontal scaling** across multiple MongoDB clusters
- **S3 integration** for large datasets
- **Batch operations** with write optimization
- **Integrated analytics** for business intelligence
- **Connection pooling** for high throughput

### **Q: How do I migrate from v1.x to v2.0.0?**
**A:** v2.0.0 is a breaking change. You'll need to:
1. Update your configuration structure
2. Update your routing patterns
3. Update your analytics configuration
4. Test thoroughly in a staging environment

### **Q: Can I use chronos-db without S3?**
**A:** Yes! Use `localStorage` for development/testing:
```typescript
const chronos = initChronos({
  dbConnections: { 'local': { mongoUri: 'mongodb://localhost:27017' } },
  spacesConnections: {},
  databases: { /* your config */ },
  localStorage: { enabled: true, basePath: './data' }
});
```

---

**Made with ❤️ for enterprise-grade data management**