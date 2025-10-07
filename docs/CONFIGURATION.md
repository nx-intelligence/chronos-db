# Chronos-DB Configuration Guide

Complete reference for all configuration options in Chronos-DB v2.2.0.

> **Last Updated**: October 2025

---

## Minimal Configuration

```javascript
{
  // Connection definitions (95% reuse as requested)
  dbConnections: {
    'mongo-local': {
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
        dbConnRef: 'mongo-local',
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
  },
  
  // Optional: Routing configuration
  routing: { 
    hashAlgo: 'rendezvous' 
  },
  
  // Optional: Data retention policies
  retention: {
    ver: { days: 90, maxPerItem: 1000 },
    counters: { days: 30, weeks: 12, months: 6 }
  },
  
  // Optional: Collection mapping and validation
  collectionMaps: {
    users: { 
      indexedProps: ['email', 'tenantId'] 
    }
  },
  
  // Optional: Security and compliance
  logicalDelete: { enabled: true },
  versioning: { enabled: true },
  transactions: { enabled: true }
}
```

---

## Complete Configuration

```javascript
{
  // Required: Connection definitions (95% reuse as requested)
  dbConnections: {
    'mongo-primary': {
      mongoUri: 'mongodb+srv://user:pass@primary-cluster.mongodb.net/?retryWrites=true&w=majority'
    },
    'mongo-analytics': {
      mongoUri: 'mongodb+srv://user:pass@analytics-cluster.mongodb.net/?retryWrites=true&w=majority'
    },
    'mongo-logs': {
      mongoUri: 'mongodb+srv://user:pass@logs-cluster.mongodb.net/?retryWrites=true&w=majority'
    }
  },
  
  spacesConnections: {
    's3-primary': {
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-east-1',
      accessKey: 'YOUR_AWS_ACCESS_KEY_ID',
      secretKey: 'YOUR_AWS_SECRET_ACCESS_KEY'
    },
    's3-analytics': {
      endpoint: 'https://s3.amazonaws.com',
      region: 'us-west-2',
      accessKey: 'YOUR_AWS_ACCESS_KEY_ID',
      secretKey: 'YOUR_AWS_SECRET_ACCESS_KEY'
    },
    'azure-primary': {
      endpoint: 'https://yourstorageaccount.blob.core.windows.net',
      region: 'eastus',
      accessKey: 'YOUR_AZURE_STORAGE_ACCOUNT_NAME',
      secretKey: 'YOUR_AZURE_STORAGE_ACCOUNT_KEY'
    }
  },
  
  // Required: Tiered database configuration
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
        },
        {
          domain: 'finance',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-metadata-finance',
          dbName: 'chronos_metadata_finance'
        }
      ],
      tenantDatabases: [
        {
          tenantId: 'tenant-a',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-metadata-tenant-a',
          dbName: 'chronos_metadata_tenant_a'
        },
        {
          tenantId: 'tenant-b',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-metadata-tenant-b',
          dbName: 'chronos_metadata_tenant_b'
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
      domainsDatabases: [
        {
          domain: 'healthcare',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-knowledge-healthcare',
          dbName: 'chronos_knowledge_healthcare'
        }
      ],
      tenantDatabases: [
        {
          tenantId: 'tenant-a',
          dbConnRef: 'mongo-primary',
          spaceConnRef: 's3-primary',
          bucket: 'chronos-knowledge-tenant-a',
          dbName: 'chronos_knowledge_tenant_a'
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
      dbConnRef: 'mongo-logs',
      spaceConnRef: 's3-primary',
      bucket: 'chronos-logs',
      dbName: 'chronos_logs'
    }
  },
  
  // Optional: Local filesystem storage (for development/testing)
  localStorage: {
    enabled: false,
    basePath: './data'
  },
  
  // Optional: Routing configuration
  routing: {
    hashAlgo: 'rendezvous',
    chooseKey: 'tenantId|dbName'
  },
  
  // Optional: Data retention policies
  retention: {
    ver: {
      days: 90,
      maxPerItem: 1000
    },
    counters: {
      days: 30,
      weeks: 12,
      months: 6
    }
  },
  
  // Optional: Collection mapping and validation
  collectionMaps: {
    users: {
      indexedProps: ['email', 'tenantId', 'status'],
      validation: {
        requiredIndexed: ['email', 'tenantId']
      }
    },
    orders: {
      indexedProps: ['orderId', 'customerId', 'tenantId', 'status', 'amount'],
      validation: {
        requiredIndexed: ['orderId', 'customerId', 'tenantId']
      }
    },
    products: {
      indexedProps: ['productId', 'category', 'tenantId'],
      base64Props: {
        image: {
          contentType: 'image/jpeg',
          preferredText: false
        }
      }
    }
  },
  
  // Optional: Enhanced counter rules with unique counting
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
        name: 'product_views_by_category',
        on: ['CREATE'],
        scope: 'meta',
        when: { 
          action: 'view',
          category: { $in: ['electronics', 'clothing'] }
        },
        countUnique: ['productId', 'brand']
      },
      {
        name: 'daily_unique_users',
        on: ['CREATE'],
        scope: 'meta',
        when: { 
          event: 'purchase',
          amount: { $gte: 100 }
        },
        countUnique: ['userId']
      }
    ]
  },
  
  // Optional: Development shadow storage
  devShadow: {
    enabled: true,
    ttlHours: 24,
    maxBytesPerDoc: 1024 * 1024
  },
  
  // Optional: Security and compliance
  logicalDelete: {
    enabled: true
  },
  versioning: {
    enabled: true
  },
  
  // Optional: Performance optimization
  writeOptimization: {
    batchSize: 1000,
    debounceMs: 100,
    compressionEnabled: true
  },
  
  // Optional: Fallback queue configuration
  fallback: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxDelayMs: 60000,
    deadLetterCollection: 'chronos_fallback_dead'
  },
  
  // Optional: Transaction configuration
  transactions: {
    enabled: true,
    autoDetect: true
  }
}
```

---

## Configuration Reference

### Core Interfaces

```typescript
interface ChronosConfig {
  // Required: Connection definitions
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
  
  // Optional configurations...
}

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
  analyticsDbName: string;
}

interface LogsDatabase {
  dbConnRef: string;
  spaceConnRef: string;
  bucket: string;
  dbName: string;
}
```

---

## Multi-Tenant Architecture

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

## Storage Providers

### AWS S3
```javascript
spacesConnections: {
  's3-primary': {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    accessKey: 'YOUR_AWS_ACCESS_KEY_ID',
    secretKey: 'YOUR_AWS_SECRET_ACCESS_KEY'
  }
}
```

### DigitalOcean Spaces
```javascript
spacesConnections: {
  'do-spaces': {
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    accessKey: 'YOUR_DO_SPACES_KEY',
    secretKey: 'YOUR_DO_SPACES_SECRET'
  }
}
```

### Azure Blob Storage
```javascript
spacesConnections: {
  'azure-primary': {
    endpoint: 'https://yourstorageaccount.blob.core.windows.net',
    region: 'eastus',
    accessKey: 'YOUR_AZURE_STORAGE_ACCOUNT_NAME',
    secretKey: 'YOUR_AZURE_STORAGE_ACCOUNT_KEY'
  }
}
```

### MinIO (Local Development)
```javascript
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
```javascript
localStorage: {
  enabled: true,
  basePath: './data'
}
```

---

## Enhanced Counter Rules

### Basic Counter Rules
```javascript
counterRules: {
  rules: [
    {
      name: 'user_actions',
      on: ['CREATE', 'UPDATE'],
      scope: 'meta',
      when: { userId: { $exists: true } }
    }
  ]
}
```

### Counter Rules with Unique Counting
```javascript
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
```javascript
// Counter document example:
{
  _id: 'user_logins',
  count: 150,              // Total occurrences
  uniqueSessions: 45,      // Unique sessionId values
  uniqueUsers: 25,         // Unique userId values
  lastUpdated: '2024-01-15T10:30:00Z'
}
```

---

## Security and Compliance

### GDPR Compliance
```javascript
logicalDelete: {
  enabled: true  // Default - enables data recovery and audit trails
}
```

### SOX Compliance
```javascript
collectionMaps: {
  financial_records: {
    indexedProps: ['accountId', 'transactionId', 'amount', 'date'],
    validation: {
      requiredIndexed: ['accountId', 'transactionId', 'amount']
    }
  }
}
```

### HIPAA Compliance
```javascript
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

## Performance Optimization

### Write Optimization
```javascript
writeOptimization: {
  batchSize: 1000,           // Batch S3 operations
  debounceMs: 100,          // Debounce counter updates
  compressionEnabled: true   // Compress large payloads
}
```

### Fallback Queues
```javascript
fallback: {
  enabled: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  maxDelayMs: 60000,
  deadLetterCollection: 'chronos_fallback_dead'
}
```

### Development Shadow
```javascript
devShadow: {
  enabled: true,
  ttlHours: 24,              // Cache for 24 hours
  maxBytesPerDoc: 1024 * 1024 // 1MB max per document
}
```

---

## Migration from v1.x

### Key Changes
1. **Connection Structure**: `mongoUris` → `dbConnections`
2. **Database Structure**: Flat arrays → Tiered structure
3. **Analytics Integration**: Separate `counters` → `analyticsDbName` in runtime
4. **Configuration**: Simplified with connection reuse

### Migration Steps
1. Update connection definitions
2. Restructure database configuration
3. Update routing patterns
4. Test thoroughly in staging environment

---

## Troubleshooting

### Common Issues

1. **"Database connection not found"**: Check that `dbConnRef` matches a key in `dbConnections`
2. **"S3 connection not found"**: Check that `spaceConnRef` matches a key in `spacesConnections`
3. **"Analytics database not found"**: Ensure `analyticsDbName` is provided in runtime tenant databases
4. **"Transaction failed"**: Check MongoDB replica set configuration or enable `autoDetect`

### Validation
```javascript
import { validateChronosConfig } from 'chronos-db';

try {
  validateChronosConfig(config);
  console.log('Configuration is valid');
} catch (error) {
  console.error('Configuration error:', error.message);
}
```