# Chronos Configuration Guide

Complete reference for all configuration options.

---

## Minimal Configuration

```javascript
{
  mongoConns: [{
    key: 'mongo-local',
    mongoUri: 'mongodb://localhost:27017'
  }],
  databases: {
    runtime: [{
      key: 'runtime-local',
      mongoConnKey: 'mongo-local',
      dbName: 'runtime_local'
    }]
  },
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
  // MongoDB connections - define once, reference by key
  mongoConns: [
    { key: 'mongo-cluster-a', mongoUri: 'mongodb+srv://user:pass@cluster-a.mongodb.net' },
    { key: 'mongo-cluster-b', mongoUri: 'mongodb+srv://user:pass@cluster-b.mongodb.net' }
  ],
  
  // Database configuration - can have empty sections
  databases: {
    metadata: [
      { key: 'meta-domain1', mongoConnKey: 'mongo-cluster-a', spacesConnKey: 'aws-us-east', tenantId: 'domain1', dbName: 'metadata_domain1' },
      { key: 'meta-tenant-a', mongoConnKey: 'mongo-cluster-b', spacesConnKey: 'aws-us-east', tenantId: 'tenant-a', dbName: 'metadata_tenant_a' }
    ],
    knowledge: [
      { key: 'know-domain1', mongoConnKey: 'mongo-cluster-a', spacesConnKey: 'aws-us-east', tenantId: 'domain1', dbName: 'knowledge_domain1' },
      { key: 'know-tenant-a', mongoConnKey: 'mongo-cluster-b', spacesConnKey: 'aws-us-east', tenantId: 'tenant-a', dbName: 'knowledge_tenant_a' }
    ],
    runtime: [
      { key: 'runtime-domain1', mongoConnKey: 'mongo-cluster-a', spacesConnKey: 'aws-us-east', tenantId: 'domain1', dbName: 'runtime_domain1' },
      { key: 'runtime-tenant-a', mongoConnKey: 'mongo-cluster-b', spacesConnKey: 'aws-us-east', tenantId: 'tenant-a', dbName: 'runtime_tenant_a' }
    ],
    logs: {
      connection: { key: 'logs-main', mongoConnKey: 'mongo-cluster-a', spacesConnKey: 'aws-us-east', dbName: 'chronos_logs' }
    }
  },
  
  // S3-compatible storage connections
  spacesConns: [{
    key: 'aws-us-east',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
    accessKey: 'YOUR_AWS_ACCESS_KEY',
    secretKey: 'YOUR_AWS_SECRET_KEY',
    buckets: {
      json: 'chronos-json-us-east',
      content: 'chronos-content-us-east',
      versions: 'chronos-versions-us-east',
      backup: 'chronos-backups-us-east'
    }
  }],
  
  // Local storage (for development/testing)
  localStorage: { enabled: false, basePath: './data' },
  
  // Counters database
  counters: { mongoUri: 'mongodb+srv://user:pass@cluster-metrics.mongodb.net', dbName: 'chronos_counters' },
  
  // Routing configuration
  routing: { 
    hashAlgo: 'rendezvous',
    chooseKey: 'tenantId|dbName'
  },
  
  // Data retention policies
  retention: {
    ver: { days: 90, maxPerItem: 1000 },
    counters: { days: 30, weeks: 12, months: 6 }
  },
  
  // Data rollup configuration
  rollup: { 
    enabled: true, 
    manifestPeriod: 'daily' 
  },
  
  // Collection mapping and validation
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
  
  // Development shadow storage
  devShadow: {
    enabled: true,
    ttlHours: 24,
    maxBytesPerDoc: 1048576
  },
  
  // Fallback queue configuration
  fallback: {
    enabled: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxDelayMs: 60000,
    deadLetterCollection: 'chronos_fallback_dead'
  },
  
  // Transaction configuration
  transactions: {
    enabled: true,
    autoDetect: true
  }
}
```

---

## Configuration Reference

### Core Configuration

#### `mongoConns` (Required)
Array of MongoDB connection configurations.

```typescript
interface MongoConnConfig {
  key: string;           // Unique key for referencing this connection
  mongoUri: string;       // MongoDB connection URI
}
```

**Example:**
```javascript
mongoConns: [
  { key: 'mongo-cluster-a', mongoUri: 'mongodb+srv://user:pass@cluster-a.mongodb.net' },
  { key: 'mongo-cluster-b', mongoUri: 'mongodb+srv://user:pass@cluster-b.mongodb.net' }
]
```

#### `databases` (Required)
Database configuration with optional sections for different database types.

```typescript
interface ChronosConfig {
  databases: {
    metadata?: DatabaseConnection[];    // System configuration, user settings
    knowledge?: DatabaseConnection[];    // Content, documents, knowledge base
    runtime?: DatabaseConnection[];      // User data, transactions, dynamic data
    logs?: LogsDatabaseConfig;          // System logs and audit trails
  };
}
```

**Database Types:**
- **`metadata`** - System configuration, user settings, application metadata
- **`knowledge`** - Content, documents, knowledge base, static data
- **`runtime`** - User data, transactions, dynamic application data
- **`logs`** - System logs and audit trails (no tiers, simple structure)

#### `DatabaseConnection`
Individual database connection configuration.

```typescript
interface DatabaseConnection {
  key: string;            // Globally unique identifier for direct routing
  mongoConnKey: string;   // References a connection in mongoConns array
  dbName: string;         // Database name
  tenantId?: string;      // Optional tenant ID for mapping
  spacesConnKey?: string; // References a connection in spacesConns array
}
```

#### `LogsDatabaseConfig`
Special configuration for logs database (no tiers).

```typescript
interface LogsDatabaseConfig {
  connection: DatabaseConnection; // Single connection for logs
}
```

### Storage Configuration

#### `spacesConns` (Optional)
Array of S3-compatible storage connections.

```typescript
interface SpacesConnConfig {
  key: string;            // Unique key for referencing this S3 connection
  endpoint: string;        // S3 endpoint URL
  region: string;          // AWS region
  accessKey: string;       // Access key
  secretKey: string;       // Secret key
  buckets: {
    json: string;         // Bucket for JSON data (chronos-jsons)
    content: string;      // Bucket for content files
    versions: string;     // Bucket for versions/manifests
    backup?: string;      // Bucket for backups (optional - can reuse json bucket)
  };
  forcePathStyle?: boolean; // Force path style (for MinIO)
}
```

**Example:**
```javascript
spacesConns: [{
  key: 'aws-us-east',
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  accessKey: 'YOUR_AWS_ACCESS_KEY',
  secretKey: 'YOUR_AWS_SECRET_KEY',
  buckets: {
    json: 'chronos-json-us-east',
    content: 'chronos-content-us-east',
    versions: 'chronos-versions-us-east',
    backup: 'chronos-backups-us-east'
  }
}]
```

#### `localStorage` (Optional)
Local filesystem storage for development/testing.

```typescript
interface LocalStorageConfig {
  basePath: string;       // Base path for local storage
  enabled: boolean;       // Whether to enable this mode
}
```

### Other Configuration

#### `counters` (Required)
Counters database configuration.

```typescript
interface CountersConfig {
  mongoUri: string;       // MongoDB URI for counters
  dbName: string;         // Database name for counters
}
```

#### `routing` (Optional)
Routing configuration.

```typescript
interface RoutingConfig {
  hashAlgo?: 'rendezvous' | 'jump';  // Hashing algorithm
  chooseKey?: string | ((ctx: RouteContext) => string); // Key selection strategy
}
```

#### `retention` (Optional)
Data retention policies.

```typescript
interface RetentionConfig {
  ver?: {
    days?: number;        // Days to keep versions
    maxPerItem?: number;  // Maximum versions per item
  };
  counters?: {
    days?: number;        // Days to keep daily counters
    weeks?: number;       // Weeks to keep weekly counters
    months?: number;      // Months to keep monthly counters
  };
}
```

#### `rollup` (Optional)
Data rollup configuration.

```typescript
interface RollupConfig {
  enabled: boolean;       // Whether rollup is enabled
  manifestPeriod: 'daily' | 'weekly' | 'monthly'; // Rollup frequency
}
```

#### `collectionMaps` (Optional)
Collection mapping and validation rules.

```typescript
interface CollectionMaps {
  [collectionName: string]: {
    indexedProps: string[]; // Properties to index (empty = auto-index all)
    base64Props?: Record<string, {
      contentType: string;
      preferredText?: boolean;
      textCharset?: string;
    }>;
    validation?: {
      requiredIndexed?: string[];
    };
  };
}
```

#### `devShadow` (Optional)
Development shadow storage configuration.

```typescript
interface DevShadowConfig {
  enabled: boolean;       // Whether dev shadow is enabled
  ttlHours: number;      // TTL in hours
  maxBytesPerDoc?: number; // Maximum bytes per document
}
```

#### `fallback` (Optional)
Fallback queue configuration.

```typescript
interface FallbackConfig {
  enabled: boolean;       // Whether fallback is enabled
  maxAttempts: number;    // Maximum retry attempts
  baseDelayMs: number;    // Base delay between retries
  maxDelayMs: number;     // Maximum delay
  deadLetterCollection: string; // Dead letter collection name
}
```

#### `transactions` (Optional)
Transaction configuration.

```typescript
interface TransactionConfig {
  enabled: boolean;       // Whether transactions are enabled
  autoDetect?: boolean;   // Whether to auto-detect transaction support
}
```

#### `writeOptimization` (Optional)
Write optimization configuration.

```typescript
interface WriteOptimizationConfig {
  batchS3: boolean;       // Whether to batch S3 writes
  batchWindowMs: number;  // Batch window in milliseconds
  debounceCountersMs: number; // Debounce counters in milliseconds
  allowShadowSkip: boolean; // Whether to allow shadow skip
}
```

#### `counterRules` (Optional)
Counter rules configuration for conditional totals.

```typescript
interface CountersRulesConfig {
  rules?: Array<{
    name: string;         // Rule name
    on?: ('CREATE' | 'UPDATE' | 'DELETE')[]; // Events to trigger on
    scope?: 'meta' | 'payload'; // Scope
    when: Record<string, any>; // Condition
  }>;
}
```

#### `hardDeleteEnabled` (Optional)
Enable hard delete functionality.

```typescript
hardDeleteEnabled?: boolean; // Whether hard delete is enabled
```

### Route Context

The `RouteContext` interface defines the context for routing decisions:

```typescript
interface RouteContext {
  dbName: string;         // Database name
  collection: string;     // Collection name
  objectId?: string;      // Object ID
  forcedIndex?: number;   // Forced index for admin override
  key?: string;           // Key for direct routing
  databaseType?: 'metadata' | 'knowledge' | 'runtime' | 'logs'; // Database type
  tier?: 'domain' | 'tenant'; // Tier
  tenantId?: string;      // Tenant ID
}
```

---

## Multi-Tenant Architecture

### Key-Based Connection Mapping

The new configuration uses a **key-based mapping system** that provides several benefits:

- **Reusability**: One MongoDB connection can serve multiple databases
- **Flexibility**: One S3 connection can serve multiple database types
- **Clarity**: Explicit relationships between components
- **Maintainability**: Easy to update connection details in one place

### Usage Patterns

#### Option A: Direct Key Usage (Simplest)
```typescript
const ops = chronos.with({
  key: 'runtime-tenant-a',  // Direct lookup, no resolution needed
  collection: 'users'
});
```

#### Option B: Tenant-Based Routing
```typescript
const ops = chronos.with({
  databaseType: 'runtime',
  tenantId: 'tenant-a',     // Maps to tenant-specific database
  collection: 'users'
});
```

#### Option C: Logs Database (No Tiers)
```typescript
const ops = chronos.with({
  key: 'logs-main',         // Direct key for logs database
  collection: 'audit'
});
```

### Migration from Previous Versions

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

## Environment-Specific Configs

### Development
```javascript
{
  mongoConns: [{ key: 'mongo-dev', mongoUri: 'mongodb://localhost:27017' }],
  databases: {
    runtime: [{ key: 'runtime-dev', mongoConnKey: 'mongo-dev', dbName: 'dev_runtime' }]
  },
  localStorage: { enabled: true, basePath: './dev-data' },
  devShadow: { enabled: true, ttlHours: 12 }
}
```

### Production
```javascript
{
  mongoConns: [
    { key: 'mongo-primary', mongoUri: 'mongodb+srv://user:pass@cluster.mongodb.net' }
  ],
  databases: {
    metadata: [{ key: 'meta-prod', mongoConnKey: 'mongo-primary', spacesConnKey: 'aws-prod', dbName: 'metadata_prod' }],
    runtime: [{ key: 'runtime-prod', mongoConnKey: 'mongo-primary', spacesConnKey: 'aws-prod', dbName: 'runtime_prod' }],
    logs: { connection: { key: 'logs-prod', mongoConnKey: 'mongo-primary', spacesConnKey: 'aws-prod', dbName: 'logs_prod' } }
  },
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
  fallback: { enabled: true },
  transactions: { enabled: true }
}
```

---

## Best Practices

1. **Use Descriptive Keys**: Make keys meaningful (e.g., `mongo-cluster-prod`, `aws-us-east-1`)
2. **Separate Environments**: Use different configurations for dev/staging/prod
3. **Bucket Naming**: Include environment/region in bucket names
4. **Security**: Never commit real credentials to version control
5. **Testing**: Use MinIO for local development and testing
6. **Monitoring**: Enable logs database for system monitoring
7. **Backups**: Configure rollup and retention policies appropriately
8. **Connection Reuse**: Use the same MongoDB/S3 connections for multiple databases when possible

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