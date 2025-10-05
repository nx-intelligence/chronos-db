# Chronos-DB Configuration Examples

This document provides detailed explanations for the example configuration files found in this directory. These examples demonstrate how to set up `chronos-db` for various environments and use cases, including AWS S3, DigitalOcean Spaces, and local MinIO.

---

## 1. AWS S3 Configuration (`aws-config.json`)

This configuration is designed for a production environment using AWS S3 as the object storage backend and MongoDB for data indexing and versioning. It demonstrates a multi-tenant setup with separate metadata and runtime databases.

**File:** `examples/aws-config.json`

```json
{
  "databases": {
    "metadata": {
      "generic": {
        "key": "meta-generic",
        "mongoUri": "mongodb+srv://username:password@cluster-a.mongodb.net/metadata?retryWrites=true&w=majority",
        "dbName": "metadata_generic"
      },
      "tenants": [
        {
          "key": "meta-tenant-a",
          "extIdentifier": "tenant-a",
          "mongoUri": "mongodb+srv://username:password@cluster-b.mongodb.net/metadata?retryWrites=true&w=majority",
          "dbName": "metadata_tenant_a"
        }
      ]
    },
    "runtime": {
      "generic": {
        "key": "runtime-generic",
        "mongoUri": "mongodb+srv://username:password@cluster-a.mongodb.net/runtime?retryWrites=true&w=majority",
        "dbName": "runtime_generic"
      },
      "tenants": [
        {
          "key": "runtime-tenant-a",
          "extIdentifier": "tenant-a",
          "mongoUri": "mongodb+srv://username:password@cluster-b.mongodb.net/runtime?retryWrites=true&w=majority",
          "dbName": "runtime_tenant_a"
        }
      ]
    }
  },
  "spacesConns": [
    {
      "endpoint": "https://s3.us-east-1.amazonaws.com",
      "region": "us-east-1",
      "accessKey": "YOUR_AWS_ACCESS_KEY",
      "secretKey": "YOUR_AWS_SECRET_KEY",
      "backupsBucket": "chronos-backups-us-east-1",
      "jsonBucket": "chronos-json-us-east-1",
      "contentBucket": "chronos-content-us-east-1",
      "forcePathStyle": false
    },
    {
      "endpoint": "https://s3.eu-west-1.amazonaws.com",
      "region": "eu-west-1",
      "accessKey": "YOUR_AWS_ACCESS_KEY_2",
      "secretKey": "YOUR_AWS_SECRET_KEY_2",
      "backupsBucket": "chronos-backups-eu-west-1",
      "jsonBucket": "chronos-json-eu-west-1",
      "contentBucket": "chronos-content-eu-west-1",
      "forcePathStyle": false
    }
  ],
  "counters": {
    "mongoUri": "mongodb+srv://username:password@cluster-metrics.mongodb.net/counters?retryWrites=true&w=majority",
    "dbName": "chronos_counters"
  },
  "routing": {
    "hashAlgo": "rendezvous",
    "chooseKey": "tenantId|dbName"
  },
  "retention": {
    "ver": { "days": 60, "maxPerItem": 30 },
    "counters": { "days": 365, "weeks": 260, "months": 120 }
  },
  "rollup": {
    "enabled": true,
    "manifestPeriod": "daily"
  },
  "collectionMaps": {
    "kycDocuments": {
      "indexedProps": ["clientId", "documentType", "issuedCountry"],
      "base64Props": { 
        "fileContent": { 
          "contentType": "application/pdf",
          "preferredText": false
        } 
      },
      "validation": { 
        "requiredIndexed": ["clientId", "documentType"] 
      }
    },
    "profiles": {
      "indexedProps": ["customerId", "preferences.language", "preferences.notifications"],
      "base64Props": { 
        "avatar": { 
          "contentType": "image/png",
          "preferredText": false
        } 
      }
    }
  },
  "devShadow": {
    "enabled": true,
    "ttlHours": 24,
    "maxBytesPerDoc": 1048576
  },
  "fallback": {
    "enabled": true,
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "maxDelayMs": 60000,
    "deadLetterCollection": "chronos_fallback_dead"
  },
  "transactions": {
    "enabled": true,
    "autoDetect": true
  }
}
```

### Key Configuration Sections:

- **`databases`**: The main database configuration object that defines all database connections organized by type and tier.
  ```json
  "databases": {
    "metadata": {
      "generic": { 
        "key": "meta-generic", 
        "mongoUri": "mongodb+srv://username:password@cluster-a.mongodb.net/metadata?retryWrites=true&w=majority", 
        "dbName": "metadata_generic" 
      },
      "tenants": [
        { 
          "key": "meta-tenant-a", 
          "extIdentifier": "tenant-a", 
          "mongoUri": "mongodb+srv://username:password@cluster-b.mongodb.net/metadata?retryWrites=true&w=majority", 
          "dbName": "metadata_tenant_a" 
        }
      ]
    },
    "runtime": {
      "generic": { 
        "key": "runtime-generic", 
        "mongoUri": "mongodb+srv://username:password@cluster-a.mongodb.net/runtime?retryWrites=true&w=majority", 
        "dbName": "runtime_generic" 
      },
      "tenants": [
        { 
          "key": "runtime-tenant-a", 
          "extIdentifier": "tenant-a", 
          "mongoUri": "mongodb+srv://username:password@cluster-b.mongodb.net/runtime?retryWrites=true&w=majority", 
          "dbName": "runtime_tenant_a" 
        }
      ]
    }
  }
  ```
  - **Explanation**: This defines the database connections organized by type (`metadata`, `knowledge`, `runtime`) and tier (`generic`, `domains`, `tenants`). Each connection has a unique `key`, `mongoUri`, `dbName`, and optional `extIdentifier` for mapping.

- **`spacesConns`**: An array of S3-compatible storage connection configurations. Each entry corresponds to a database connection by index.
  ```json
  "spacesConns": [
    {
      "endpoint": "https://s3.us-east-1.amazonaws.com",
      "region": "us-east-1",
      "accessKey": "YOUR_AWS_ACCESS_KEY",
      "secretKey": "YOUR_AWS_SECRET_KEY",
      "backupsBucket": "chronos-backups-us-east-1",
      "jsonBucket": "chronos-json-us-east-1",
      "contentBucket": "chronos-content-us-east-1",
      "forcePathStyle": false
    }
  ]
  ```
  - **Explanation**: These define the connections to your S3 buckets. `endpoint`, `region`, `accessKey`, and `secretKey` are standard S3 credentials. `backupsBucket`, `jsonBucket`, and `contentBucket` specify the names of the buckets used for different types of data storage. `forcePathStyle` is often `false` for AWS S3 but can be `true` for some S3-compatible services like MinIO.

- **`counters`**: Configuration for the dedicated counters database.
  ```json
  "counters": {
    "mongoUri": "mongodb+srv://username:password@cluster-metrics.mongodb.net/counters?retryWrites=true&w=majority",
    "dbName": "chronos_counters"
  }
  ```
  - **Explanation**: `chronos-db` uses a separate MongoDB database for storing counter totals, which can be useful for analytics without impacting primary data operations.

- **`routing`**: Defines how `chronos-db` routes requests to different backends.
  ```json
  "routing": {
    "hashAlgo": "rendezvous",
    "chooseKey": "tenantId|dbName"
  }
  ```
  - **Explanation**: `hashAlgo` specifies the consistent hashing algorithm (`rendezvous` or `jump`). `chooseKey` defines the DSL (Domain Specific Language) for generating the routing key. Here, it uses `tenantId` and `dbName` to determine which backend to use.

- **`retention`**: Policies for data retention.
  ```json
  "retention": {
    "ver": { "days": 60, "maxPerItem": 30 },
    "counters": { "days": 365, "weeks": 260, "months": 120 }
  }
  ```
  - **Explanation**: `ver` defines retention for item versions (e.g., keep versions for 60 days, max 30 versions per item). `counters` defines retention for counter data.

- **`rollup`**: Configuration for data rollup (e.g., daily manifests).
  ```json
  "rollup": {
    "enabled": true,
    "manifestPeriod": "daily"
  }
  ```
  - **Explanation**: If enabled, `chronos-db` can create periodic manifests of data, useful for auditing or data warehousing.

- **`collectionMaps`**: Defines schema and indexing for specific collections.
  ```json
  "collectionMaps": {
    "kycDocuments": {
      "indexedProps": ["clientId", "documentType", "issuedCountry"],
      "base64Props": { 
        "fileContent": { 
          "contentType": "application/pdf",
          "preferredText": false
        } 
      },
      "validation": { 
        "requiredIndexed": ["clientId", "documentType"] 
      }
    }
  }
  ```
  - **Explanation**: For `kycDocuments`, `clientId`, `documentType`, and `issuedCountry` are indexed. `fileContent` is stored as base64 with a specified content type. `clientId` and `documentType` are required indexed fields.

- **`devShadow`**: Configuration for development shadow storage.
  ```json
  "devShadow": {
    "enabled": true,
    "ttlHours": 24,
    "maxBytesPerDoc": 1048576
  }
  ```
  - **Explanation**: Enables a temporary shadow copy of data in MongoDB for a specified TTL, useful for development and debugging.

- **`fallback`**: Configuration for the fallback queue.
  ```json
  "fallback": {
    "enabled": true,
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "maxDelayMs": 60000,
    "deadLetterCollection": "chronos_fallback_dead"
  }
  ```
  - **Explanation**: Ensures durability by retrying failed operations and moving them to a dead-letter queue if retries are exhausted.

- **`transactions`**: Configuration for MongoDB transactions.
  ```json
  "transactions": {
    "enabled": true,
    "autoDetect": true
  }
  ```
  - **Explanation**: Enables MongoDB transactions for atomic operations, with `autoDetect` attempting to determine if the MongoDB instance supports transactions (e.g., a replica set).

---

## 2. DigitalOcean Spaces Configuration (`do-config.json`)

This configuration is tailored for DigitalOcean Spaces, an S3-compatible object storage service. It demonstrates a single-backend setup with runtime database only.

**File:** `examples/do-config.json`

```json
{
  "databases": {
    "runtime": {
      "generic": {
        "key": "runtime-generic",
        "mongoUri": "mongodb+srv://username:password@cluster-name.mongodb.net/runtime?retryWrites=true&w=majority",
        "dbName": "runtime_generic"
      },
      "tenants": [
        {
          "key": "runtime-tenant-a",
          "extIdentifier": "tenant-a",
          "mongoUri": "mongodb+srv://username:password@cluster-name.mongodb.net/runtime?retryWrites=true&w=majority",
          "dbName": "runtime_tenant_a"
        }
      ]
    }
  },
  "spacesConns": [
    {
      "endpoint": "https://nyc3.digitaloceanspaces.com",
      "region": "nyc3",
      "accessKey": "YOUR_DO_SPACES_ACCESS_KEY",
      "secretKey": "YOUR_DO_SPACES_SECRET_KEY",
      "backupsBucket": "chronos-backups-nyc3",
      "jsonBucket": "chronos-json-nyc3",
      "contentBucket": "chronos-content-nyc3",
      "forcePathStyle": false
    }
  ],
  "counters": {
    "mongoUri": "mongodb+srv://username:password@cluster-name.mongodb.net/counters?retryWrites=true&w=majority",
    "dbName": "chronos_counters"
  },
  "routing": {
    "hashAlgo": "rendezvous",
    "chooseKey": "tenantId|dbName"
  },
  "retention": {
    "ver": { "days": 30, "maxPerItem": 10 },
    "counters": { "days": 90, "weeks": 12, "months": 6 }
  },
  "rollup": {
    "enabled": false,
    "manifestPeriod": "daily"
  },
  "collectionMaps": {
    "users": {
      "indexedProps": ["email", "status"],
      "validation": {
        "requiredIndexed": ["email"]
      }
    }
  },
  "devShadow": {
    "enabled": false,
    "ttlHours": 24,
    "maxBytesPerDoc": 1048576
  },
  "fallback": {
    "enabled": true,
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "maxDelayMs": 60000,
    "deadLetterCollection": "chronos_fallback_dead"
  },
  "transactions": {
    "enabled": true,
    "autoDetect": true
  }
}
```

### Key Configuration Sections:

- **`databases`**: Single runtime database configuration.
  ```json
  "databases": {
    "runtime": {
      "generic": {
        "key": "runtime-generic",
        "mongoUri": "mongodb+srv://username:password@cluster-name.mongodb.net/runtime?retryWrites=true&w=majority",
        "dbName": "runtime_generic"
      },
      "tenants": [
        {
          "key": "runtime-tenant-a",
          "extIdentifier": "tenant-a",
          "mongoUri": "mongodb+srv://username:password@cluster-name.mongodb.net/runtime?retryWrites=true&w=majority",
          "dbName": "runtime_tenant_a"
        }
      ]
    }
  }
  ```
  - **Explanation**: This configuration only uses the `runtime` database type, with both generic and tenant-specific connections.

- **`spacesConns`**: Single DigitalOcean Spaces connection.
  ```json
  "spacesConns": [
    {
      "endpoint": "https://nyc3.digitaloceanspaces.com",
      "region": "nyc3",
      "accessKey": "YOUR_DO_SPACES_ACCESS_KEY",
      "secretKey": "YOUR_DO_SPACES_SECRET_KEY",
      "backupsBucket": "chronos-backups-nyc3",
      "jsonBucket": "chronos-json-nyc3",
      "contentBucket": "chronos-content-nyc3",
      "forcePathStyle": false
    }
  ]
  ```
  - **Explanation**: The `endpoint` will be specific to your DigitalOcean Space's region. `forcePathStyle` is typically `false` for DigitalOcean Spaces.

- **Other sections**: `counters`, `routing`, `retention`, `rollup`, `collectionMaps`, `devShadow`, `fallback`, and `transactions` are configured similarly to the AWS example, adapted for a single-backend setup.

---

## 3. MinIO Local Storage Configuration (`minio-config.json`)

This configuration is ideal for local development and testing environments using MinIO, a high-performance, S3-compatible object storage server that can run locally.

**File:** `examples/minio-config.json`

```json
{
  "databases": {
    "runtime": {
      "generic": {
        "key": "runtime-generic",
        "mongoUri": "mongodb://localhost:27017/runtime",
        "dbName": "runtime_generic"
      }
    }
  },
  "spacesConns": [
    {
      "endpoint": "http://localhost:9000",
      "region": "us-east-1",
      "accessKey": "minioadmin",
      "secretKey": "minioadmin",
      "backupsBucket": "chronos-backups",
      "jsonBucket": "chronos-json",
      "contentBucket": "chronos-content",
      "forcePathStyle": true
    }
  ],
  "counters": {
    "mongoUri": "mongodb://localhost:27017/counters",
    "dbName": "chronos_counters"
  },
  "routing": {
    "hashAlgo": "rendezvous",
    "chooseKey": "tenantId|dbName"
  },
  "retention": {
    "ver": { "days": 7, "maxPerItem": 5 },
    "counters": { "days": 30, "weeks": 4, "months": 2 }
  },
  "rollup": {
    "enabled": false,
    "manifestPeriod": "daily"
  },
  "collectionMaps": {
    "testData": {
      "indexedProps": ["name", "category"],
      "validation": {
        "requiredIndexed": ["name"]
      }
    }
  },
  "devShadow": {
    "enabled": true,
    "ttlHours": 2,
    "maxBytesPerDoc": 1048576
  },
  "fallback": {
    "enabled": false,
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "maxDelayMs": 60000,
    "deadLetterCollection": "chronos_fallback_dead"
  },
  "transactions": {
    "enabled": true,
    "autoDetect": true
  }
}
```

### Key Configuration Sections:

- **`databases`**: Single local runtime database configuration.
  ```json
  "databases": {
    "runtime": {
      "generic": {
        "key": "runtime-generic",
        "mongoUri": "mongodb://localhost:27017/runtime",
        "dbName": "runtime_generic"
      }
    }
  }
  ```
  - **Explanation**: Simple local MongoDB setup with a single runtime database.

- **`spacesConns`**: Single MinIO connection.
  ```json
  "spacesConns": [
    {
      "endpoint": "http://localhost:9000",
      "region": "us-east-1",
      "accessKey": "minioadmin",
      "secretKey": "minioadmin",
      "backupsBucket": "chronos-backups",
      "jsonBucket": "chronos-json",
      "contentBucket": "chronos-content",
      "forcePathStyle": true
    }
  ]
  ```
  - **Explanation**: For MinIO running locally, the `endpoint` is typically `http://localhost:9000`. `accessKey` and `secretKey` are often default MinIO credentials. **Crucially, `forcePathStyle` is set to `true` for MinIO** to ensure correct URL resolution.

- **Other sections**: `counters`, `routing`, `retention`, `rollup`, `collectionMaps`, `devShadow`, `fallback`, and `transactions` are configured for a local development environment, often with `enabled: false` or shorter TTLs for `devShadow`.

---

## 🎯 Usage Patterns

### Direct Key Usage (Simplest)
```javascript
const ops = chronos.with({ 
  key: 'runtime-tenant-a',  // Direct lookup
  collection: 'users' 
});
```

### Tier + ExtIdentifier Usage
```javascript
const ops = chronos.with({ 
  databaseType: 'runtime',
  tier: 'tenant',
  extIdentifier: 'tenant-a',  // Maps to 'runtime-tenant-a'
  collection: 'users' 
});
```

### Generic Tier Usage
```javascript
const ops = chronos.with({ 
  databaseType: 'metadata',
  tier: 'generic',
  collection: 'config' 
});
```

---

## 🔧 Configuration Tips

1. **Database Types**: You can omit any database type (`metadata`, `knowledge`, `runtime`) if you don't need it.

2. **Tiers**: Each database type can have `generic`, `domains`, and/or `tenants` tiers. You only need to define the tiers you use.

3. **Keys**: Each database connection must have a unique `key` across all database types and tiers.

4. **ExtIdentifiers**: These are optional external identifiers used for mapping. They don't need to be unique across different tiers.

5. **S3 Compatibility**: All configurations work with any S3-compatible storage (AWS S3, DigitalOcean Spaces, MinIO, etc.).

6. **Local Development**: Use MinIO or localStorage for local development to avoid cloud storage costs.

7. **Production**: Use proper S3-compatible storage with appropriate retention policies and fallback queues enabled.