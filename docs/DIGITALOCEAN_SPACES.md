# DigitalOcean Spaces Integration Guide

Complete guide for setting up chronos-db with DigitalOcean Spaces.

---

## 🚀 Quick Setup

### 1. **Create DigitalOcean Spaces**

In your DigitalOcean dashboard:

1. Go to **Spaces** → **Create a Space**
2. Choose your region (e.g., `fra1`, `nyc3`, `sfo3`)
3. Create **three separate spaces**:
   - `chronos-backups` (for manifests and snapshots)
   - `chronos-json` (for versioned JSON documents)
   - `chronos-content` (for externalized binary content)

### 2. **Get API Credentials**

1. Go to **API** → **Spaces Keys**
2. Generate a new key with **Full Control** permissions
3. Note down:
   - **Access Key** (starts with `DO...`)
   - **Secret Key** (long random string)

### 3. **Configure chronos-db**

```typescript
import { initChronos } from 'chronos-db';

const chronos = initChronos({
  databases: {
    runtime: {
      generic: {
        key: 'runtime-generic',
        mongoUri: 'mongodb://localhost:27017',
        dbName: 'runtime_generic'
      }
    }
  },
  
  // DigitalOcean Spaces configuration
  spacesConns: [{
    endpoint: 'https://fra1.digitaloceanspaces.com',  // Your region
    region: 'fra1',                                   // Must match endpoint
    accessKey: 'DO1234567890ABCDEF',                  // Your access key
    secretKey: 'your-secret-key-here',               // Your secret key
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
    backupsBucket: 'chronos-backups',
    forcePathStyle: false,  // Use virtual-hosted style (recommended)
  }],
  
  // Rest of your configuration...
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters',
  },
  routing: { hashAlgo: 'rendezvous' },
  retention: {},
  rollup: {},
  collectionMaps: {
    users: { indexedProps: ['email'] }
  },
});
```

---

## 🔧 Configuration Options

### **Endpoint Configuration**

```typescript
// Correct format
endpoint: 'https://fra1.digitaloceanspaces.com'

// Common regions:
// fra1 - Frankfurt
// nyc3 - New York
// sfo3 - San Francisco
// sgp1 - Singapore
// ams3 - Amsterdam
```

### **Region Settings**

```typescript
// Option 1: Use actual DigitalOcean region
region: 'fra1'

// Option 2: Use AWS-compatible region (also works)
region: 'us-east-1'
```

### **Path Style Configuration**

```typescript
// Recommended for DigitalOcean Spaces
forcePathStyle: false  // Virtual-hosted style

// Only use true for MinIO or custom S3-compatible services
forcePathStyle: true   // Path style
```

---

## 🛠️ Bucket Management

### **Automatic Bucket Creation**

chronos-db can automatically create missing buckets:

```typescript
// Check and create buckets
const result = await chronos.admin.ensureBucketsExist(
  { dbName: 'myapp', collection: 'users' },
  { 
    confirm: true,
    createIfMissing: true,
    dryRun: false 
  }
);

console.log('Buckets created:', result.bucketsCreated);
console.log('Bucket statuses:', result.bucketStatuses);
```

### **Manual Bucket Creation**

If you prefer to create buckets manually:

1. **Via DigitalOcean Dashboard:**
   - Go to Spaces → Create Space
   - Name: `chronos-json`, `chronos-content`, `chronos-backups`
   - Choose your region

2. **Via API:**
   ```bash
   # Using AWS CLI (configured for DigitalOcean)
   aws s3 mb s3://chronos-json --endpoint-url https://fra1.digitaloceanspaces.com
   aws s3 mb s3://chronos-content --endpoint-url https://fra1.digitaloceanspaces.com
   aws s3 mb s3://chronos-backups --endpoint-url https://fra1.digitaloceanspaces.com
   ```

---

## 🔍 Troubleshooting

### **Common Issues**

#### 1. **Access Denied Error**
```
Error: Access denied to bucket 'chronos-json'
```

**Solutions:**
- Verify your API key has **Full Control** permissions
- Check that bucket names match exactly (case-sensitive)
- Ensure region matches your endpoint

#### 2. **Bucket Not Found**
```
Error: Bucket 'chronos-json' does not exist
```

**Solutions:**
- Create the bucket manually in DigitalOcean dashboard
- Use `ensureBucketsExist()` with `createIfMissing: true`
- Check bucket name spelling

#### 3. **Region Mismatch**
```
Error: Region mismatch: endpoint uses 'fra1' but config specifies 'nyc3'
```

**Solutions:**
- Update your config to match the endpoint region
- Or update the endpoint to match your region

### **Diagnostic Tools**

#### **Test S3 Connectivity**
```typescript
const connectivity = await chronos.admin.testS3Connectivity(
  { dbName: 'myapp', collection: 'users' }
);

if (connectivity.success) {
  console.log('Available buckets:', connectivity.buckets);
} else {
  console.error('Connection failed:', connectivity.error);
}
```

#### **Validate Configuration**
```typescript
const validation = await chronos.admin.validateSpacesConfiguration(
  { dbName: 'myapp', collection: 'users' }
);

if (!validation.valid) {
  console.log('Issues found:', validation.issues);
  console.log('Recommendations:', validation.recommendations);
}
```

#### **Check Bucket Status**
```typescript
const bucketStatus = await chronos.admin.ensureBucketsExist(
  { dbName: 'myapp', collection: 'users' },
  { dryRun: true, confirm: true }
);

bucketStatus.bucketStatuses.forEach(status => {
  console.log(`${status.name}: ${status.exists ? '✅' : '❌'} ${status.error || ''}`);
});
```

---

## 📊 Performance Optimization

### **DigitalOcean Spaces Limits**

- **Rate Limits:** 10,000 requests per hour per space
- **File Size:** Up to 5TB per object
- **Concurrent Connections:** Up to 100 per space

### **Best Practices**

1. **Use Virtual-Hosted Style:**
   ```typescript
   forcePathStyle: false  // Better performance
   ```

2. **Enable Bucket Versioning:**
   - Go to your space → Settings → Versioning
   - Enable versioning for `chronos-json` and `chronos-content`

3. **Configure CORS (if needed):**
   ```json
   {
     "CORSRules": [
       {
         "AllowedOrigins": ["*"],
         "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
         "AllowedHeaders": ["*"],
         "MaxAgeSeconds": 3000
       }
     ]
   }
   ```

---

## 🔒 Security Considerations

### **API Key Security**

1. **Use Environment Variables:**
   ```typescript
   const config = {
     spacesConns: [{
       endpoint: 'https://fra1.digitaloceanspaces.com',
       region: 'fra1',
       accessKey: process.env.DO_SPACES_ACCESS_KEY,
       secretKey: process.env.DO_SPACES_SECRET_KEY,
       // ... rest of config
     }]
   };
   ```

2. **Rotate Keys Regularly:**
   - Generate new keys every 90 days
   - Update your application configuration
   - Delete old keys

### **Bucket Permissions**

1. **Principle of Least Privilege:**
   - Only grant necessary permissions
   - Use separate keys for different environments

2. **Bucket Policies:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::chronos-content/*"
       }
     ]
   }
   ```

---

## 📈 Monitoring & Alerts

### **Key Metrics to Monitor**

1. **Storage Usage:**
   - Monitor space usage in DigitalOcean dashboard
   - Set up alerts for high usage

2. **Request Rates:**
   - Track API calls per hour
   - Monitor for rate limit approaching

3. **Error Rates:**
   - Monitor 4xx/5xx responses
   - Set up alerts for high error rates

### **Health Checks**

```typescript
// Add to your health check endpoint
const healthCheck = async () => {
  try {
    const connectivity = await chronos.admin.testS3Connectivity(
      { dbName: 'myapp', collection: 'users' }
    );
    
    return {
      status: connectivity.success ? 'healthy' : 'unhealthy',
      spaces: connectivity.success ? 'connected' : 'disconnected',
      buckets: connectivity.buckets.length
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      spaces: 'error',
      error: error.message
    };
  }
};
```

---

## 🚀 Production Deployment

### **Environment-Specific Configuration**

```typescript
// config/production.js
export const productionConfig = {
  spacesConns: [{
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    accessKey: process.env.DO_SPACES_ACCESS_KEY_PROD,
    secretKey: process.env.DO_SPACES_SECRET_KEY_PROD,
    jsonBucket: 'chronos-json-prod',
    contentBucket: 'chronos-content-prod',
    backupsBucket: 'chronos-backups-prod',
    forcePathStyle: false,
  }],
  // ... rest of config
};

// config/staging.js
export const stagingConfig = {
  spacesConns: [{
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    accessKey: process.env.DO_SPACES_ACCESS_KEY_STAGING,
    secretKey: process.env.DO_SPACES_SECRET_KEY_STAGING,
    jsonBucket: 'chronos-json-staging',
    contentBucket: 'chronos-content-staging',
    backupsBucket: 'chronos-backups-staging',
    forcePathStyle: false,
  }],
  // ... rest of config
};
```

### **Docker Configuration**

```dockerfile
# Dockerfile
FROM node:18-alpine

# Copy application
COPY . /app
WORKDIR /app

# Install dependencies
RUN npm ci --only=production

# Set environment variables
ENV DO_SPACES_ACCESS_KEY=""
ENV DO_SPACES_SECRET_KEY=""

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
```

---

## 📚 Additional Resources

- [DigitalOcean Spaces Documentation](https://docs.digitalocean.com/products/spaces/)
- [AWS S3 API Compatibility](https://docs.digitalocean.com/products/spaces/reference/s3-api/)
- [chronos-db Configuration Guide](./CONFIGURATION.md)
- [chronos-db API Reference](./API.md)

---

## 🆘 Support

If you encounter issues:

1. **Check the troubleshooting section above**
2. **Run diagnostic tools** (`testS3Connectivity`, `validateSpacesConfiguration`)
3. **Check DigitalOcean Spaces status page**
4. **Open an issue** on the chronos-db GitHub repository

---

**Happy coding with DigitalOcean Spaces! 🚀**
