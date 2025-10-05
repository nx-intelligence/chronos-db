# Chronos DB Configuration Examples

This directory contains example configurations for different deployment scenarios and S3-compatible storage providers.

## 📁 Files Overview

### Configuration Files

| File | Purpose | Use Case |
|------|---------|----------|
| `aws-config.json` | AWS S3 production setup | Multi-region production deployment |
| `do-config.json` | DigitalOcean Spaces setup | Cost-effective cloud storage |
| `minio-config.json` | MinIO local development | Local development and testing |

### Demo Files

| File | Purpose | Description |
|------|---------|-------------|
| `mongodb-only-local.js` | Local MongoDB demo | Basic CRUD operations with localStorage |
| `smart-insert-demo.js` | Smart insert demo | Bulk operations and optimization |
| `digitalocean-spaces-test.js` | DO Spaces test | DigitalOcean Spaces connectivity test |

---

## 🚀 Configuration Examples

### 1. AWS S3 Production Configuration (`aws-config.json`)

**Use Case:** Multi-region production deployment with high availability

**Key Features:**
- **Multi-region setup** - US East and EU West regions
- **Production retention** - 60 days version retention, 365 days counter retention
- **KYC document handling** - PDF document storage with validation
- **Profile management** - User profiles with avatar images
- **Full feature set** - Dev shadow, fallback queues, transactions enabled

**Configuration Highlights:**
```json
{
  "mongoUris": [
    "mongodb+srv://username:password@cluster-a.mongodb.net/database?retryWrites=true&w=majority",
    "mongodb+srv://username:password@cluster-b.mongodb.net/database?retryWrites=true&w=majority"
  ],
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
  ],
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
}
```

**Setup Steps:**
1. Create AWS S3 buckets in both regions
2. Configure IAM user with S3 permissions
3. Update MongoDB connection strings
4. Replace placeholder credentials
5. Test connectivity with admin API

---

### 2. DigitalOcean Spaces Configuration (`do-config.json`)

**Use Case:** Cost-effective cloud storage for small to medium applications

**Key Features:**
- **Single region setup** - NYC3 region (cost-effective)
- **Moderate retention** - 45 days version retention
- **Document management** - PDF and image storage
- **Production ready** - Full feature set enabled

**Configuration Highlights:**
```json
{
  "mongoUris": [
    "mongodb+srv://username:password@cluster-name.mongodb.net/database?retryWrites=true&w=majority"
  ],
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
}
```

**Setup Steps:**
1. Create DigitalOcean Spaces in NYC3 region
2. Generate API key with Spaces permissions
3. Create required buckets manually or via admin API
4. Update MongoDB connection string
5. Test with `digitalocean-spaces-test.js`

---

### 3. MinIO Local Development (`minio-config.json`)

**Use Case:** Local development and testing with S3-compatible storage

**Key Features:**
- **Local MinIO server** - http://localhost:9000
- **Development settings** - Shorter retention, smaller limits
- **Testing focused** - Simplified configuration
- **No transactions** - Disabled for development simplicity

**Configuration Highlights:**
```json
{
  "mongoUris": [
    "mongodb://localhost:27017/chronos"
  ],
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
  "devShadow": {
    "enabled": true,
    "ttlHours": 12,
    "maxBytesPerDoc": 524288
  },
  "transactions": {
    "enabled": false,
    "autoDetect": false
  }
}
```

**Setup Steps:**
1. Install and start MinIO server locally
2. Start MongoDB locally
3. Use default MinIO credentials (minioadmin/minioadmin)
4. Run `mongodb-only-local.js` for basic testing

---

## 🧪 Demo Scripts

### 1. MongoDB Only Local Demo (`mongodb-only-local.js`)

**Purpose:** Basic CRUD operations demonstration with localStorage

**Features Demonstrated:**
- Basic chronos-db initialization
- CRUD operations (Create, Read, Update, Delete)
- Version management
- Enrichment API
- Admin operations

**Usage:**
```bash
node examples/mongodb-only-local.js
```

### 2. Smart Insert Demo (`smart-insert-demo.js`)

**Purpose:** Bulk operations and performance optimization

**Features Demonstrated:**
- Bulk insert operations
- Smart insert optimization
- Performance metrics
- Error handling
- Batch processing

**Usage:**
```bash
node examples/smart-insert-demo.js
```

### 3. DigitalOcean Spaces Test (`digitalocean-spaces-test.js`)

**Purpose:** DigitalOcean Spaces connectivity and configuration validation

**Features Demonstrated:**
- S3 connectivity testing
- Configuration validation
- Bucket existence checking
- Error handling
- Admin API usage

**Usage:**
```bash
node examples/digitalocean-spaces-test.js
```

---

## 🔧 Configuration Customization

### Common Customizations

#### 1. **Change Retention Policies**
```json
{
  "retention": {
    "ver": { "days": 30, "maxPerItem": 10 },      // Shorter retention
    "counters": { "days": 90, "weeks": 26, "months": 12 }
  }
}
```

#### 2. **Add Collection Maps**
```json
{
  "collectionMaps": {
    "users": {
      "indexedProps": ["email", "status", "createdAt"],
      "validation": { "requiredIndexed": ["email"] }
    },
    "documents": {
      "indexedProps": ["userId", "type", "category"],
      "base64Props": { 
        "content": { 
          "contentType": "application/pdf",
          "preferredText": false
        } 
      }
    }
  }
}
```

#### 3. **Configure Fallback Queues**
```json
{
  "fallback": {
    "enabled": true,
    "maxRetries": 5,
    "retryDelayMs": 2000,
    "maxDelayMs": 120000,
    "deadLetterCollection": "chronos_fallback_dead"
  }
}
```

#### 4. **Enable Dev Shadow**
```json
{
  "devShadow": {
    "enabled": true,
    "ttlHours": 24,
    "maxBytesPerDoc": 1048576
  }
}
```

---

## 🚨 Security Considerations

### 1. **Credential Management**
- Never commit real credentials to version control
- Use environment variables for sensitive data
- Rotate access keys regularly
- Use IAM roles when possible

### 2. **Bucket Security**
- Enable bucket versioning
- Configure bucket policies
- Use HTTPS endpoints only
- Enable access logging

### 3. **Network Security**
- Use VPC endpoints for AWS S3
- Configure firewall rules
- Enable MongoDB authentication
- Use TLS/SSL connections

---

## 📊 Performance Tuning

### 1. **Connection Pooling**
```json
{
  "mongoUris": [
    "mongodb://host1:27017/db?maxPoolSize=10",
    "mongodb://host2:27017/db?maxPoolSize=10"
  ]
}
```

### 2. **Write Optimization**
```json
{
  "writeOptimization": {
    "batchSize": 100,
    "flushInterval": 1000,
    "maxRetries": 3
  }
}
```

### 3. **S3 Optimization**
```json
{
  "spacesConns": [
    {
      "endpoint": "https://s3.us-east-1.amazonaws.com",
      "region": "us-east-1",
      "forcePathStyle": false,  // Use virtual-hosted-style URLs
      "maxRetries": 3,
      "timeout": 30000
    }
  ]
}
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. **S3 Connection Errors**
- Verify endpoint URL format
- Check access key permissions
- Ensure buckets exist
- Verify region consistency

#### 2. **MongoDB Connection Issues**
- Check connection string format
- Verify authentication credentials
- Ensure replica set configuration
- Check network connectivity

#### 3. **Configuration Validation Errors**
- Use admin API to validate configuration
- Check required fields
- Verify data types
- Review collection map syntax

### Debug Commands

```typescript
// Test S3 connectivity
const connectivity = await chronos.admin.testS3Connectivity({
  dbName: 'myapp',
  collection: 'users'
});

// Validate configuration
const validation = await chronos.admin.validateSpacesConfiguration({
  dbName: 'myapp',
  collection: 'users'
});

// Check health
const health = await chronos.admin.health();
```

---

## 📚 Additional Resources

- [Main README](../README.md) - Complete documentation
- [Configuration Reference](../README.md#-configuration-reference) - All configuration options
- [DigitalOcean Spaces Guide](../docs/DIGITALOCEAN_SPACES.md) - Detailed setup guide
- [Troubleshooting Guide](../TROUBLESHOOTING_DIGITALOCEAN.md) - Common issues and solutions
- [API Documentation](../docs/API.md) - Complete API reference

---

**Need Help?** Open an issue on GitHub or check the troubleshooting guides for common solutions.
