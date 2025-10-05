# Chronos-DB Configuration Examples

This document provides detailed explanations for the example configuration files found in this directory. These examples demonstrate how to set up `chronos-db` for various environments and use cases, including AWS S3, DigitalOcean Spaces, and local MinIO.

---

## 1. AWS S3 Configuration (`aws-config.json`)

This configuration is designed for a production environment using AWS S3 as the object storage backend and MongoDB for data indexing and versioning. It demonstrates a multi-tenant setup with separate metadata and runtime databases.

**File:** `examples/aws-config.json`

### Key Features:
- **Multiple MongoDB Clusters**: Uses separate clusters for different database types
- **Multi-Region S3**: Configured for both US East and EU West regions
- **Tenant Isolation**: Each tenant has its own database and S3 buckets
- **Key-Based Mapping**: Uses `key` fields for unique identification and `spacesConnKey`/`mongoConnKey` for connections

### Configuration Structure:

```json
{
  "mongoConns": [
    {
      "key": "mongo-cluster-a",
      "mongoUri": "mongodb+srv://username:password@cluster-a.mongodb.net?retryWrites=true&w=majority"
    },
    {
      "key": "mongo-cluster-b", 
      "mongoUri": "mongodb+srv://username:password@cluster-b.mongodb.net?retryWrites=true&w=majority"
    }
  ],
  "databases": {
    "metadata": [
      {
        "key": "meta-tenant-a",
        "tenantId": "tenant-a",
        "mongoConnKey": "mongo-cluster-b",
        "dbName": "metadata_tenant_a",
        "spacesConnKey": "aws-us-east-1"
      }
    ],
    "runtime": [
      {
        "key": "runtime-tenant-a",
        "tenantId": "tenant-a",
        "mongoConnKey": "mongo-cluster-b",
        "dbName": "runtime_tenant_a",
        "spacesConnKey": "aws-us-east-1"
      }
    ],
    "logs": {
      "connection": {
        "key": "logs-main",
        "mongoConnKey": "mongo-cluster-a",
        "dbName": "chronos_logs",
        "spacesConnKey": "aws-us-east-1"
      }
    }
  },
  "spacesConns": [
    {
      "key": "aws-us-east-1",
      "endpoint": "https://s3.us-east-1.amazonaws.com",
      "region": "us-east-1",
      "accessKey": "YOUR_AWS_ACCESS_KEY",
      "secretKey": "YOUR_AWS_SECRET_KEY",
      "buckets": {
        "json": "chronos-json-us-east-1",
        "content": "chronos-content-us-east-1",
        "versions": "chronos-versions-us-east-1",
        "backup": "chronos-backups-us-east-1"
      },
      "forcePathStyle": false
    },
    {
      "key": "aws-eu-west-1",
      "endpoint": "https://s3.eu-west-1.amazonaws.com",
      "region": "eu-west-1",
      "accessKey": "YOUR_AWS_ACCESS_KEY_2",
      "secretKey": "YOUR_AWS_SECRET_KEY_2",
      "buckets": {
        "json": "chronos-json-eu-west-1",
        "content": "chronos-content-eu-west-1",
        "versions": "chronos-versions-eu-west-1",
        "backup": "chronos-backups-eu-west-1"
      },
      "forcePathStyle": false
    }
  ]
}
```

### Field Explanations:

- **`mongoConns`**: Array of MongoDB connection configurations, each with a unique `key` for reference
- **`databases.metadata`**: Array of metadata database connections for tenant-specific metadata storage
- **`databases.runtime`**: Array of runtime database connections for application data
- **`databases.logs`**: Single logs database configuration (no tiers)
- **`spacesConns`**: Array of S3-compatible storage connections, each with a unique `key` for reference
- **`key`**: Globally unique identifier for each connection/database
- **`mongoConnKey`**: References a MongoDB connection from the `mongoConns` array
- **`spacesConnKey`**: References an S3 connection from the `spacesConns` array
- **`tenantId`**: External identifier for tenant mapping (not unique across connections)
- **`buckets`**: Object containing all required bucket names (json, content, versions, backup)

---

## 2. DigitalOcean Spaces Configuration (`do-config.json`)

This configuration demonstrates how to use DigitalOcean Spaces as the S3-compatible storage backend with MongoDB Atlas for data persistence.

**File:** `examples/do-config.json`

### Key Features:
- **DigitalOcean Spaces**: S3-compatible object storage with regional endpoints
- **MongoDB Atlas**: Cloud-hosted MongoDB for scalability
- **Simplified Setup**: Single region configuration for easier management
- **Production Ready**: Includes comprehensive retention and rollup policies

### Configuration Structure:

```json
{
  "mongoConns": [
    {
      "key": "mongo-cluster-main",
      "mongoUri": "mongodb+srv://username:password@cluster-name.mongodb.net?retryWrites=true&w=majority"
    }
  ],
  "databases": {
    "runtime": [
      {
        "key": "runtime-tenant-a",
        "tenantId": "tenant-a",
        "mongoConnKey": "mongo-cluster-main",
        "dbName": "runtime_tenant_a",
        "spacesConnKey": "do-spaces-nyc3"
      }
    ],
    "logs": {
      "connection": {
        "key": "logs-main",
        "mongoConnKey": "mongo-cluster-main",
        "dbName": "chronos_logs",
        "spacesConnKey": "do-spaces-nyc3"
      }
    }
  },
  "spacesConns": [
    {
      "key": "do-spaces-nyc3",
      "endpoint": "https://nyc3.digitaloceanspaces.com",
      "region": "nyc3",
      "accessKey": "YOUR_DO_SPACES_ACCESS_KEY",
      "secretKey": "YOUR_DO_SPACES_SECRET_KEY",
      "buckets": {
        "json": "chronos-json-nyc3",
        "content": "chronos-content-nyc3",
        "versions": "chronos-versions-nyc3",
        "backup": "chronos-backups-nyc3"
      },
      "forcePathStyle": false
    }
  ]
}
```

### DigitalOcean Specific Notes:

- **Endpoint Format**: `https://{region}.digitaloceanspaces.com`
- **Region**: Use DigitalOcean region codes (nyc3, sfo3, fra1, etc.)
- **Force Path Style**: Set to `false` for DigitalOcean Spaces
- **Access Keys**: Generate from DigitalOcean Control Panel → API → Spaces Keys

---

## 3. MinIO Local Configuration (`minio-config.json`)

This configuration is perfect for local development and testing using MinIO as a local S3-compatible storage server.

**File:** `examples/minio-config.json`

### Key Features:
- **Local Development**: Perfect for development and testing environments
- **MinIO Server**: Self-hosted S3-compatible object storage
- **Simple Setup**: Single MongoDB instance and MinIO server
- **Development Features**: Includes devShadow for testing TTL behavior

### Configuration Structure:

```json
{
  "mongoConns": [
    {
      "key": "mongo-local",
      "mongoUri": "mongodb://localhost:27017"
    }
  ],
  "databases": {
    "runtime": [
      {
        "key": "runtime-local",
        "mongoConnKey": "mongo-local",
        "tenantId": "local",
        "spacesConnKey": "minio-local",
        "dbName": "runtime_local"
      }
    ],
    "logs": {
      "connection": {
        "key": "logs-local",
        "mongoConnKey": "mongo-local",
        "dbName": "chronos_logs",
        "spacesConnKey": "minio-local"
      }
    }
  },
  "spacesConns": [
    {
      "key": "minio-local",
      "endpoint": "http://localhost:9000",
      "region": "us-east-1",
      "accessKey": "minioadmin",
      "secretKey": "minioadmin",
      "buckets": {
        "json": "chronos-json",
        "content": "chronos-content",
        "versions": "chronos-versions",
        "backup": "chronos-backups"
      },
      "forcePathStyle": true
    }
  ]
}
```

### MinIO Specific Notes:

- **Endpoint**: Usually `http://localhost:9000` for local MinIO
- **Default Credentials**: `minioadmin` / `minioadmin` (change in production!)
- **Force Path Style**: Set to `true` for MinIO compatibility
- **Region**: Can be any valid AWS region name

---

## Key Concepts Explained

### 1. Connection Mapping System

The new configuration uses a **key-based mapping system** that provides several benefits:

- **Reusability**: One MongoDB connection can serve multiple databases
- **Flexibility**: One S3 connection can serve multiple database types
- **Clarity**: Explicit relationships between components
- **Maintainability**: Easy to update connection details in one place

### 2. Database Types

- **`metadata`**: Stores system metadata, indexes, and configuration data
- **`knowledge`**: Stores structured knowledge, documents, and content
- **`runtime`**: Stores application runtime data and user-generated content
- **`logs`**: Stores system logs and audit trails (no tiers, simple structure)

### 3. Bucket Organization

Each S3 connection defines four bucket types:

- **`json`**: Stores JSON data files (chronos-jsons)
- **`content`**: Stores binary content files (images, documents, etc.)
- **`versions`**: Stores version manifests and rollup data
- **`backup`**: Stores backup data (optional, can reuse json bucket)

### 4. Tenant Isolation

Tenants are isolated through:

- **Separate Databases**: Each tenant gets its own MongoDB database
- **Separate Buckets**: Each tenant can use different S3 buckets
- **Tenant ID**: External identifier for mapping and routing
- **Unique Keys**: Globally unique identifiers for direct routing

---

## Migration from Previous Versions

If you're upgrading from a previous version of chronos-db:

1. **Remove `mongoUris` array**: Replace with `mongoConns` array
2. **Add `key` fields**: Each connection needs a unique key
3. **Update database structure**: Use direct arrays instead of nested objects
4. **Add `spacesConnKey`**: Link databases to S3 connections
5. **Update bucket structure**: Use `buckets` object instead of individual fields

### Example Migration:

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
  "spacesConns": [{
    "key": "minio-local",
    "endpoint": "http://localhost:9000",
    "buckets": {
      "json": "chronos-json",
      "content": "chronos-content",
      "versions": "chronos-versions"
    }
  }],
  "databases": {
    "runtime": [{
      "key": "runtime-local",
      "mongoConnKey": "mongo-local",
      "spacesConnKey": "minio-local",
      "dbName": "runtime_local"
    }]
  }
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

---

## Configuration Options Explained

### Logical Delete (`logicalDelete`)
Controls whether delete operations perform logical or hard deletes:

```json
{
  "logicalDelete": {
    "enabled": true  // Default: true (logical delete)
  }
}
```

- **`enabled: true`** (default): Delete operations set `deletedAt` timestamp, records remain in database
- **`enabled: false`**: Delete operations permanently remove records from MongoDB and S3

### Versioning (`versioning`)
Controls whether operations create version documents for time-travel queries:

```json
{
  "versioning": {
    "enabled": true  // Default: true (versioning enabled)
  }
}
```

- **`enabled: true`** (default): All operations create version documents, enabling time-travel queries
- **`enabled: false`**: Only head documents are maintained, no time-travel capability

### Other Configuration Options

- **`devShadow`** - Development shadow storage for full document snapshots in MongoDB
- **`fallback`** - Fallback queue configuration for handling failed operations
- **`transactions`** - Transaction support configuration

---

## Troubleshooting

### Common Issues:

1. **"S3 connection not found"**: Check that `spacesConnKey` matches a `key` in `spacesConns`
2. **"MongoDB connection not found"**: Check that `mongoConnKey` matches a `key` in `mongoConns`
3. **"Bucket does not exist"**: Ensure buckets are created in your S3-compatible storage
4. **"Access denied"**: Verify S3 credentials and permissions
5. **"Invalid endpoint"**: Check endpoint URL format for your S3 provider

### Getting Help:

- Check the main [README.md](../README.md) for detailed configuration options
- Review the [API documentation](../docs/API.md) for usage examples
- See [CONFIGURATION.md](../docs/CONFIGURATION.md) for advanced configuration options