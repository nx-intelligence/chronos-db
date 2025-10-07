# Chronos-DB v2.2 🚀

> **Enterprise-Grade MongoDB Persistence Layer with Embedded Multi-Tenancy & Big Data Architecture**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]() 
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## 🎯 **Built for Enterprise & Big Data**

Chronos-DB v2.2 is designed for **large-scale enterprise applications** requiring **tenant isolation**, **data versioning**, and **complex data relationships**. Built with **embedded multi-tenancy by design** and **tiered architecture** to handle big data workloads efficiently while maintaining **enterprise-grade security and compliance**.

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
- **📈 Big Data Optimization**: Efficient handling of large datasets with S3/Azure integration
- **🎯 Tenant Isolation**: Row-level security with configurable tenant boundaries
- **📊 Integrated Analytics**: Built-in counters and metrics for business intelligence
- **🔗 Entity Relationships**: Automatic entity management with `insertWithEntities` and `getWithEntities`
- **🎯 Tiered Fetching**: `getKnowledge` and `getMetadata` with automatic fallback/merge across tiers
- **🔧 Enrichment API** for incremental updates with deep merge
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
  },
  // Azure Blob Storage (NEW in v2.0.1)
  'azure-primary': {
    endpoint: 'https://myaccount.blob.core.windows.net',
    region: 'us-east-1',  // Not used for Azure but required
    accessKey: process.env.AZURE_ACCOUNT_NAME,
    secretKey: process.env.AZURE_ACCOUNT_KEY
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

### **5. Entity Relationship Management**

**New in v2.0.1!** Automatic management of related entities with referential integrity:

#### **insertWithEntities** - Auto-save Related Entities

Automatically extract and save related entities to their own collections:

```typescript
// Define entity mappings
const entityMappings = [
  {
    property: 'customer',           // Property in main record
    collection: 'customers',        // Target collection
    keyProperty: 'customerId',      // Key field in entity
    databaseType: 'metadata',       // Optional: database tier
    tier: 'tenant'                  // Optional: tier level
  },
  {
    property: 'product',
    collection: 'products',
    keyProperty: 'productId',
    databaseType: 'knowledge',
    tier: 'domain'
  }
];

// Insert order with automatic customer/product management
const result = await ops.insertWithEntities(
  {
    orderId: 'ORD-123',
    customer: {
      customerId: 'CUST-456',
      name: 'John Doe',
      email: 'john@example.com'
    },
    product: {
      productId: 'PROD-789',
      name: 'Widget',
      price: 99.99
    },
    quantity: 2
  },
  entityMappings,
  'order-system',
  'new order created'
);

// Returns:
// {
//   mainRecordId: 'order-123-id',
//   entityResults: Map {
//     'customer' => { id: 'cust-id', operation: 'created' },
//     'product' => { id: 'prod-id', operation: 'unchanged' }
//   }
// }

// What happened:
// 1. Checked if customer CUST-456 exists → Created new customer record
// 2. Checked if product PROD-789 exists → Already existed, no changes
// 3. Created the order record with embedded customer/product objects
```

#### **getWithEntities** - Auto-fetch Related Entities

Fetch a record and automatically retrieve all related entities:

```typescript
// Fetch order with all related entities
const result = await ops.getWithEntities(
  'order-123-id',
  entityMappings,
  { presign: true }  // Optional read options
);

// Returns:
// {
//   mainRecord: { 
//     orderId: 'ORD-123',
//     customer: { customerId: 'CUST-456', ... },
//     product: { productId: 'PROD-789', ... },
//     quantity: 2
//   },
//   entityRecords: Map {
//     'customer' => { customerId: 'CUST-456', name: 'John Doe', ... },
//     'product' => { productId: 'PROD-789', name: 'Widget', price: 99.99, ... }
//   }
// }

// Benefits:
// - Single call to fetch related data
// - Automatic relationship resolution
// - Maintains referential integrity
// - Works across database tiers
```

### **6. Tiered Data Fetching**

**New in v2.0.1!** Fetch data across tiers with automatic fallback or merging:

#### **getKnowledge** - Tiered Knowledge Fetching

Fetch from knowledge database with tier priority (tenant → domain → generic):

```typescript
// Fetch with fallback (returns first found)
const config = await chronos.getKnowledge(
  'app-config',
  { key: 'feature-flags' },
  {
    tenantId: 'tenant-a',
    domain: 'production',
    merge: false  // Return first found
  }
);
// Returns tenant config if exists, otherwise domain, otherwise generic

// Fetch with merge (combines all tiers)
const mergedConfig = await chronos.getKnowledge(
  'app-config',
  { key: 'feature-flags' },
  {
    tenantId: 'tenant-a',
    domain: 'production',
    merge: true,  // Merge all tiers
    mergeOptions: { dedupeArrays: true }
  }
);

// Returns:
// {
//   data: { 
//     // Generic tier settings
//     maxUploadSize: 10485760,
//     // Domain tier settings (production)
//     enableNewFeature: true,
//     // Tenant tier settings (tenant-a overrides)
//     maxUploadSize: 52428800,
//     customField: 'tenant-specific'
//   },
//   tiersFound: ['generic', 'domain', 'tenant'],
//   tierRecords: {
//     generic: { maxUploadSize: 10485760, ... },
//     domain: { enableNewFeature: true, ... },
//     tenant: { maxUploadSize: 52428800, customField: ... }
//   }
// }
```

#### **getMetadata** - Tiered Metadata Fetching

Same functionality for metadata database:

```typescript
// Fetch schema with tier fallback
const schema = await chronos.getMetadata(
  'schemas',
  { entityType: 'user' },
  {
    tenantId: 'tenant-a',
    domain: 'saas',
    merge: true
  }
);

// Merge priority: generic → domain → tenant
// Tenant-specific fields override domain and generic
```

#### **How Tiered Merging Works**

```typescript
// Generic tier (base configuration)
{
  theme: 'light',
  features: ['basic', 'standard'],
  settings: { timeout: 30 }
}

// Domain tier (environment-specific)
{
  features: ['advanced'],
  settings: { maxRetries: 3 }
}

// Tenant tier (customer-specific)
{
  theme: 'dark',
  features: ['premium'],
  settings: { timeout: 60 }
}

// Merged result (with merge: true):
{
  theme: 'dark',                                    // From tenant (overrides)
  features: ['basic', 'standard', 'advanced', 'premium'],  // Union of all
  settings: { timeout: 60, maxRetries: 3 }         // Deep merge
}
```

### **7. Restore Operations**

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

## 📋 **System Fields Structure**

### **Document Structure Overview**

Chronos-DB organizes all system fields under the `_system` property to keep your documents clean and normal-looking. This design ensures that your application data remains separate from Chronos-DB's internal management fields.

### **Complete Document Structure**

```json
{
  "_id": "507f1f77bcf86cd799439011",  // MongoDB's native _id (stays at root)
  "email": "user@example.com",        // Your application data
  "name": "John Doe",                 // Your application data
  "status": "active",                 // Your application data
  "_system": {                        // All Chronos-DB system fields
    "ov": 3,                          // Object version (incremented on each update)
    "cv": 150,                        // Collection version (incremented on each operation)
    "insertedAt": "2024-01-01T00:00:00Z",  // Creation timestamp
    "updatedAt": "2024-01-15T10:30:00Z",   // Last update timestamp
    "deletedAt": null,                // Deletion timestamp (null if not deleted)
    "deleted": false,                 // Deletion status
    "functionIds": ["enricher@v1"],   // Enrichment function IDs that modified this record
    "parentId": "parent-record-id",   // Parent record for lineage tracking
    "parentCollection": "parent-collection", // Parent collection name
    "originId": "root-record-id",     // Original root record ID
    "originCollection": "root-collection"   // Original root collection name
  }
}
```

### **System Fields Explained**

#### **Version Management**
- **`ov` (Object Version)**: Incremented each time this specific record is updated
- **`cv` (Collection Version)**: Incremented each time any record in the collection is modified
- **Purpose**: Enables optimistic locking and time-travel queries

#### **Timestamps**
- **`insertedAt`**: ISO 8601 timestamp when the record was first created
- **`updatedAt`**: ISO 8601 timestamp when the record was last modified
- **`deletedAt`**: ISO 8601 timestamp when the record was logically deleted (null if not deleted)
- **Purpose**: Audit trails and temporal queries

#### **Deletion Status**
- **`deleted`**: Boolean indicating if the record is logically deleted
- **Purpose**: Enables logical delete functionality while maintaining audit trails

#### **Enrichment Tracking**
- **`functionIds`**: Array of enrichment function IDs that have modified this record
- **Purpose**: Tracks data lineage and enrichment provenance

#### **Lineage Tracking**
- **`parentId`**: ID of the parent record (for hierarchical data)
- **`parentCollection`**: Collection name of the parent record
- **`originId`**: ID of the original root record (preserved throughout lineage)
- **`originCollection`**: Collection name of the original root record
- **Purpose**: Complete data lineage tracking for compliance and debugging

### **What Chronos-DB Manages Automatically**

Chronos-DB automatically manages all `_system` fields. **Your application should NOT modify these fields directly.**

#### **Automatic Management**
- ✅ **Version Increments**: `ov` and `cv` are automatically incremented
- ✅ **Timestamp Updates**: `insertedAt`, `updatedAt`, `deletedAt` are automatically set
- ✅ **Deletion Status**: `deleted` flag is automatically managed
- ✅ **Enrichment Tracking**: `functionIds` are automatically updated during enrichment
- ✅ **Lineage Tracking**: Parent and origin fields are automatically set when provided

#### **What Your App Should Do**
- ✅ **Read `_system` fields**: Use them for optimistic locking, audit trails, etc.
- ✅ **Provide lineage context**: Pass `parentRecord` or `origin` when creating records
- ✅ **Use version fields**: Pass `expectedOv` for updates to prevent conflicts

#### **What Your App Should NOT Do**
- ❌ **Modify `_system` fields**: Never directly set or change these fields
- ❌ **Depend on specific values**: Don't assume specific version numbers or timestamps
- ❌ **Bypass system fields**: Always use Chronos-DB APIs for data operations

### **Usage Examples**

#### **Creating Records with Lineage**
```typescript
// Create a child record with parent lineage
const childRecord = await ops.create({
  name: 'Child Record',
  data: 'some data'
}, 'system', 'child creation', {
  parentRecord: {
    id: 'parent-record-id',
    collection: 'parent_items',
  }
});

// The _system field will automatically include:
// {
//   parentId: 'parent-record-id',
//   parentCollection: 'parent_items',
//   originId: 'parent-record-id',        // Derived from parent
//   originCollection: 'parent_items'    // Derived from parent
// }
```

#### **Creating Records with Explicit Origin**
```typescript
// Create a record with explicit origin (e.g., from external system)
const importedRecord = await ops.create({
  customerId: 'ext-123',
  name: 'Imported Customer'
}, 'system', 'import', {
  origin: {
    id: 'stripe_cus_123',
    collection: 'customers',
    system: 'stripe'  // Optional external system name
  }
});

// The _system field will automatically include:
// {
//   originId: 'stripe_cus_123',
//   originCollection: 'stripe:customers'  // Includes system prefix
// }
```

#### **Using System Fields for Optimistic Locking**
```typescript
// Get current record
const current = await ops.getLatest('record-id');

// Update with optimistic locking
const updated = await ops.update('record-id', {
  name: 'Updated Name'
}, current._system.ov, 'user', 'name-update');

// Chronos-DB automatically:
// - Increments ov from 3 to 4
// - Updates updatedAt timestamp
// - Prevents conflicts if another process updated the record
```

#### **Time-Travel Queries**
```typescript
// Get record as it was at a specific time
const historical = await ops.getAsOf('record-id', '2024-01-01T00:00:00Z');

// Get specific version
const v2 = await ops.getVersion('record-id', 2);

// Both return the same structure with _system fields showing:
// - ov: 2 (version at that time)
// - updatedAt: timestamp when that version was created
// - All other _system fields as they were at that time
```

### **Benefits of This Design**

#### **Clean Application Data**
- Your application data remains clean and normal-looking
- No system fields mixed with business data
- Easy to understand and maintain

#### **Complete Audit Trail**
- Every change is tracked with timestamps
- Full lineage from origin to current state
- Enrichment provenance is preserved

#### **Optimistic Locking**
- Built-in conflict prevention
- Version-based concurrency control
- No need for external locking mechanisms

#### **Time-Travel Capabilities**
- Access any version of any record
- Point-in-time queries
- Complete historical data preservation

#### **Compliance Ready**
- GDPR compliance with logical delete
- SOX compliance with immutable audit trails
- HIPAA compliance with complete data lineage

### **Migration from Other Systems**

If you're migrating from a system that stores version/timestamp fields at the root level:

```typescript
// OLD WAY (don't do this):
{
  "_id": "123",
  "name": "John",
  "version": 5,           // ❌ Don't store at root
  "createdAt": "...",     // ❌ Don't store at root
  "updatedAt": "..."      // ❌ Don't store at root
}

// NEW WAY (Chronos-DB):
{
  "_id": "123",
  "name": "John",         // ✅ Clean application data
  "_system": {            // ✅ All system fields organized
    "ov": 5,
    "insertedAt": "...",
    "updatedAt": "..."
  }
}
```

### **Enhanced Analytics with Unique Counting**

Chronos-DB v2.0.1 includes sophisticated analytics capabilities with unique counting support.

#### **Counter Rules with Unique Counting**
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

#### **Analytics Results**
```typescript
// Get analytics for a tenant
const metrics = await chronos.counters.getTotals({
  dbName: 'chronos_runtime_tenant_a',
  collection: 'events',
});

console.log('Analytics:', metrics);
// Output:
// {
//   _id: "tenant:tenant-a|db:chronos_runtime_tenant_a|coll:events",
//   created: 1000,              // Total occurrences
//   updated: 500,
//   deleted: 50,
//   rules: {
//     user_logins: {
//       created: 150,           // Total logins
//       unique: {
//         sessionId: 45         // Unique sessions
//       }
//     },
//     product_views: {
//       created: 800,           // Total views
//       unique: {
//         productId: 150,       // Unique products viewed
//         category: 25,         // Unique categories viewed
//         brand: 12             // Unique brands viewed
//       }
//     },
//     premium_purchases: {
//       created: 200,           // Total premium purchases
//       unique: {
//         productId: 75,        // Unique products purchased
//         category: 15          // Unique categories purchased
//       }
//     }
//   },
//   lastAt: "2024-01-15T10:30:00Z"
// }
```

#### **Why Unique Counting is Important**

**Business Intelligence**: Understand user behavior patterns
- How many unique users visited today?
- How many unique products were viewed this month?
- What's the conversion rate from views to purchases?

**Performance Optimization**: Identify bottlenecks
- Which products are most popular?
- Which categories drive the most engagement?
- What's the user retention rate?

**Compliance Reporting**: Meet regulatory requirements
- Unique user counts for GDPR compliance
- Unique transaction counts for financial reporting
- Unique data access counts for audit trails

#### **Advanced Analytics Use Cases**

**E-commerce Analytics**
```typescript
// Track unique customers per day
{
  name: 'daily_unique_customers',
  on: ['CREATE'],
  scope: 'meta',
  when: { event: 'purchase' },
  countUnique: ['customerId']
}

// Track unique products per category
{
  name: 'category_product_diversity',
  on: ['CREATE'],
  scope: 'meta',
  when: { action: 'view' },
  countUnique: ['productId', 'category']
}
```

**User Engagement Analytics**
```typescript
// Track unique sessions per user
{
  name: 'user_session_activity',
  on: ['CREATE'],
  scope: 'meta',
  when: { action: 'login' },
  countUnique: ['sessionId', 'userId']
}

// Track unique features used per user
{
  name: 'feature_adoption',
  on: ['CREATE'],
  scope: 'meta',
  when: { event: 'feature_used' },
  countUnique: ['featureId', 'userId']
}
```

**Financial Analytics**
```typescript
// Track unique accounts per transaction type
{
  name: 'transaction_diversity',
  on: ['CREATE'],
  scope: 'meta',
  when: { 
    event: 'transaction',
    amount: { $gte: 1000 }
  },
  countUnique: ['accountId', 'transactionType']
}
```

#### **Analytics Database Structure**

Each tenant gets its own analytics database with the following collections:

**`cnt_total` Collection**
```json
{
  "_id": "tenant:tenant-a|db:chronos_runtime_tenant_a|coll:events",
  "tenant": "tenant-a",
  "dbName": "chronos_runtime_tenant_a",
  "collection": "events",
  "created": 1000,
  "updated": 500,
  "deleted": 50,
  "rules": {
    "user_logins": {
      "created": 150,
      "unique": {
        "sessionId": ["sess1", "sess2", "sess3", ...]  // Stored as arrays
      }
    }
  },
  "lastAt": "2024-01-15T10:30:00Z"
}
```

**Key Features**:
- **Automatic Deduplication**: MongoDB's `$addToSet` ensures unique values
- **Efficient Storage**: Arrays are converted to counts when retrieved
- **Real-time Updates**: Counters are updated with every operation
- **Tenant Isolation**: Each tenant has separate analytics

#### **Analytics Best Practices**

**1. Choose Meaningful Properties**
```typescript
// Good: Track business-relevant unique values
countUnique: ['userId', 'productId', 'sessionId']

// Avoid: Tracking too many properties
countUnique: ['userId', 'productId', 'sessionId', 'ipAddress', 'userAgent', 'timestamp']
```

**2. Use Appropriate Conditions**
```typescript
// Good: Specific conditions for meaningful analytics
when: { 
  userTier: 'premium',
  action: 'purchase',
  amount: { $gte: 100 }
}

// Avoid: Too broad conditions
when: { action: 'view' }  // Might be too noisy
```

**3. Monitor Performance**
```typescript
// Use indexes on frequently queried fields
collectionMaps: {
  events: {
    indexedProps: ['userId', 'action', 'timestamp', 'userTier']
  }
}
```

**4. Regular Cleanup**
```typescript
// Set appropriate retention policies
retention: {
  counters: {
    days: 30,    // Keep daily counts for 30 days
    weeks: 12,   // Keep weekly counts for 12 weeks
    months: 6    // Keep monthly counts for 6 months
}
```

---

## 🔧 **Worker Integration**

Chronos-DB provides advanced analytics capabilities that are designed to work with external workers. **Important**: The worker itself is NOT included in Chronos-DB - you need to implement your own worker system.

### **Time-Based Analytics Rules**

Time-based analytics rules are designed to be executed by external workers on a schedule (hourly, daily, monthly).

#### **Configuration**

```typescript
analytics: {
  // Standard counter rules (real-time)
  counterRules: [
    {
      name: 'user_logins',
      on: ['CREATE'],
      scope: 'meta',
      when: { action: 'login' },
      countUnique: ['sessionId']
    }
  ],
  
  // Time-based analytics rules (worker-driven)
  timeBasedRules: [
    {
      name: 'daily_revenue',
      collection: 'transactions',
      query: { status: 'completed' },
      operation: 'sum',
      field: 'amount',
      saveMode: 'timeframe',
      timeframe: 'daily'
    },
    {
      name: 'hourly_active_users',
      collection: 'events',
      query: { action: 'page_view' },
      operation: 'count',
      saveMode: 'timeframe',
      timeframe: 'hourly',
      relativeTime: {
        newerThan: 'PT1H'  // Last hour
      }
    },
    {
      name: 'monthly_unique_customers',
      collection: 'orders',
      query: { status: 'completed' },
      operation: 'count',
      saveMode: 'timeframe',
      timeframe: 'monthly',
      arguments: ['customerId']  // Foreign key filtering
    }
  ],
  
  // Cross-tenant analytics rules
  crossTenantRules: [
    {
      name: 'global_active_tenants',
      collection: 'events',
      query: { action: 'user_activity' },
      mode: 'boolean',
      masterTenantId: 'master-tenant',
      slaveTenantIds: ['tenant-a', 'tenant-b', 'tenant-c'],
      relativeTime: {
        newerThan: 'P1D'  // Last 24 hours
      }
    }
  ],
  
  // List of all tenants for cross-tenant operations
  tenants: ['tenant-a', 'tenant-b', 'tenant-c', 'master-tenant']
}
```

#### **Worker Implementation Example**

```typescript
import { AdvancedAnalytics } from 'chronos-db';
import { MongoClient } from 'mongodb';

class AnalyticsWorker {
  private analytics: AdvancedAnalytics;
  
  constructor(mongoUri: string, analyticsDbName: string, config: any) {
    const mongoClient = new MongoClient(mongoUri);
    this.analytics = new AdvancedAnalytics(mongoClient, analyticsDbName, config);
  }
  
  // Execute time-based rules
  async executeTimeBasedRules() {
    const rules = this.config.analytics.timeBasedRules || [];
    
    for (const rule of rules) {
      try {
        const result = await this.analytics.executeTimeBasedRule(rule);
        console.log(`Executed rule ${rule.name}:`, result.value);
      } catch (error) {
        console.error(`Failed to execute rule ${rule.name}:`, error);
      }
    }
  }
  
  // Execute cross-tenant rules
  async executeCrossTenantRules() {
    const rules = this.config.analytics.crossTenantRules || [];
    
    for (const rule of rules) {
      try {
        const result = await this.analytics.executeCrossTenantRule(rule);
        console.log(`Executed cross-tenant rule ${rule.name}:`, result.value);
      } catch (error) {
        console.error(`Failed to execute cross-tenant rule ${rule.name}:`, error);
      }
    }
  }
  
  // Cleanup TTL data
  async cleanupTTLData() {
    // Clean up old analytics data
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    // Clean up time-based results older than 30 days
    await this.analytics.analyticsDb.collection('timeBasedResults')
      .deleteMany({ timestamp: { $lt: cutoffDate } });
    
    // Clean up cross-tenant results older than 30 days
    await this.analytics.analyticsDb.collection('crossTenantResults')
      .deleteMany({ timestamp: { $lt: cutoffDate } });
    
    console.log('TTL cleanup completed');
  }
}

// Worker scheduling (example with node-cron)
import cron from 'node-cron';

const worker = new AnalyticsWorker(
  'mongodb://localhost:27017',
  'analytics_db',
  config
);

// Run time-based analytics every hour
cron.schedule('0 * * * *', async () => {
  console.log('Running hourly analytics...');
  await worker.executeTimeBasedRules();
});

// Run cross-tenant analytics daily at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily cross-tenant analytics...');
  await worker.executeCrossTenantRules();
});

// Cleanup TTL data weekly
cron.schedule('0 0 * * 0', async () => {
  console.log('Running weekly TTL cleanup...');
  await worker.cleanupTTLData();
});
```

### **Analytics Results Structure**

#### **Time-Based Results**

```json
{
  "_id": "daily_revenue_1704067200000_abc123",
  "ruleName": "daily_revenue",
  "collection": "transactions",
  "operation": "sum",
  "field": "amount",
  "value": 15420.50,
  "timeframe": "daily",
  "timestamp": "2024-01-01T00:00:00Z",
  "arguments": null
}
```

#### **Cross-Tenant Results**

```json
{
  "_id": "global_active_tenants_1704067200000_def456",
  "ruleName": "global_active_tenants",
  "collection": "events",
  "mode": "boolean",
  "value": 3,
  "timestamp": "2024-01-01T00:00:00Z",
  "masterTenantId": "master-tenant",
  "slaveResults": [
    { "tenantId": "tenant-a", "value": 1 },
    { "tenantId": "tenant-b", "value": 1 },
    { "tenantId": "tenant-c", "value": 1 }
  ]
}
```

### **Worker Integration Points**

#### **1. Analytics Execution**

```typescript
// Get analytics results
const timeBasedResults = await analytics.getTimeBasedResults({
  ruleName: 'daily_revenue',
  timeframe: 'daily',
  limit: 30
});

const crossTenantResults = await analytics.getCrossTenantResults({
  ruleName: 'global_active_tenants',
  masterTenantId: 'master-tenant',
  limit: 7
});
```

#### **2. TTL Cleanup**

Chronos-DB requires external workers to handle TTL cleanup for:

- **Analytics Data**: Old time-based and cross-tenant results
- **Version Data**: Old document versions (if retention policies are set)
- **Counter Data**: Old counter totals (if retention policies are set)
- **Fallback Queue**: Dead letter queue cleanup

#### **3. Error Handling**

```typescript
// Robust worker with error handling
class RobustAnalyticsWorker {
  async executeWithRetry(operation: () => Promise<any>, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  async executeTimeBasedRules() {
    const rules = this.config.analytics.timeBasedRules || [];
    
    for (const rule of rules) {
      await this.executeWithRetry(async () => {
        const result = await this.analytics.executeTimeBasedRule(rule);
        console.log(`Executed rule ${rule.name}:`, result.value);
      });
    }
  }
}
```

### **Production Considerations**

#### **1. Worker Scaling**

```typescript
// Multiple workers for high-volume analytics
const workers = [
  new AnalyticsWorker(mongoUri1, 'analytics_db_1', config),
  new AnalyticsWorker(mongoUri2, 'analytics_db_2', config),
  new AnalyticsWorker(mongoUri3, 'analytics_db_3', config)
];

// Distribute rules across workers
const rulesPerWorker = Math.ceil(timeBasedRules.length / workers.length);
workers.forEach((worker, index) => {
  const startIndex = index * rulesPerWorker;
  const endIndex = Math.min(startIndex + rulesPerWorker, timeBasedRules.length);
  const workerRules = timeBasedRules.slice(startIndex, endIndex);
  
  // Execute worker-specific rules
  worker.executeRules(workerRules);
});
```

#### **2. Monitoring and Alerting**

```typescript
// Worker health monitoring
class MonitoredAnalyticsWorker {
  async executeTimeBasedRules() {
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    
    try {
      const rules = this.config.analytics.timeBasedRules || [];
      
      for (const rule of rules) {
        try {
          await this.analytics.executeTimeBasedRule(rule);
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(`Rule ${rule.name} failed:`, error);
          
          // Send alert for critical rules
          if (rule.critical) {
            await this.sendAlert(`Critical analytics rule failed: ${rule.name}`);
          }
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`Analytics execution completed: ${successCount} success, ${errorCount} errors, ${duration}ms`);
      
      // Send metrics to monitoring system
      await this.sendMetrics({
        successCount,
        errorCount,
        duration,
        timestamp: new Date()
      });
      
    } catch (error) {
      console.error('Analytics worker failed:', error);
      await this.sendAlert('Analytics worker failed completely');
    }
  }
}
```

#### **3. Data Consistency**

```typescript
// Ensure data consistency across workers
class ConsistentAnalyticsWorker {
  async executeCrossTenantRules() {
    // Use MongoDB transactions for consistency
    const session = this.analytics.mongoClient.startSession();
    
    try {
      await session.withTransaction(async () => {
        const rules = this.config.analytics.crossTenantRules || [];
        
        for (const rule of rules) {
          const result = await this.analytics.executeCrossTenantRule(rule);
          
          // Verify result consistency
          await this.verifyCrossTenantResult(result);
        }
      });
    } finally {
      await session.endSession();
    }
  }
  
  async verifyCrossTenantResult(result: CrossTenantResult) {
    // Verify that slave results sum correctly
    const expectedValue = result.slaveResults.reduce((sum, slave) => sum + slave.value, 0);
    
    if (result.value !== expectedValue) {
      throw new Error(`Cross-tenant result inconsistency: expected ${expectedValue}, got ${result.value}`);
    }
  }
}
```

---

## 🔐 **Production Deployment**

### **MongoDB Setup**

Chronos-DB works with **any MongoDB setup** - standalone instances, replica sets, or sharded clusters.

**Recommended for Production:**
- **Replica Set** (3+ nodes) for high availability and transaction support
- **Standalone MongoDB** works perfectly for development and smaller deployments

```bash
# Option 1: Standalone MongoDB (works out of the box)
mongodb://localhost:27017/dbname

# Option 2: Replica Set (recommended for production)
mongodb://mongo1:27017,mongo2:27017,mongo3:27017/dbname?replicaSet=rs0
```

**Transaction Support:**
- **Replica Sets**: Full transaction support with ACID guarantees
- **Standalone**: Automatic fallback to non-transactional operations
- **Auto-detection**: Chronos-DB automatically detects MongoDB capabilities

```bash
# Example docker-compose.yml for replica set (optional)
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

### **Storage Providers**

Tested with:
- ✅ **AWS S3**
- ✅ **Azure Blob Storage** (NEW in v2.0.1)
- ✅ **DigitalOcean Spaces**
- ✅ **MinIO**
- ✅ **Cloudflare R2**

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

### **Q: What's new in v2.2.0?**
**A:** Chronos-DB v2.2.0 introduces major new features and improvements:
- **Entity Relationships**: `insertWithEntities` and `getWithEntities` for automatic entity management
- **Tiered Fetching**: `getKnowledge` and `getMetadata` with automatic fallback/merge across tiers
- **Deep Merge Utility**: Smart merging of records from multiple tiers with array union
- **Azure Storage Support**: Native support for Azure Blob Storage alongside S3-compatible providers
- **Enhanced Analytics**: Unique counting, time-based rules, and cross-tenant analytics
- **Worker Integration**: Comprehensive worker integration documentation
- **Connection Reuse**: Define MongoDB/S3/Azure connections once, reference everywhere (95% reuse)
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