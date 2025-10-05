# DigitalOcean Spaces Credential Troubleshooting Guide

## 🚨 Current Issue: Access Denied (HTTP 403)

Based on your root cause analysis, the issue is with DigitalOcean Spaces credentials/permissions, not chronos-db configuration.

---

## ✅ Step-by-Step Resolution

### **Step 1: Verify DigitalOcean Spaces Account**

1. **Log into DigitalOcean Dashboard**
   - Go to https://cloud.digitalocean.com/
   - Navigate to **Spaces** section

2. **Check Account Status**
   - ✅ Verify Spaces quota is available
   - ✅ Check if account is active (not suspended)
   - ✅ Ensure you're in the correct region (`fra1`)

### **Step 2: Check API Key Permissions**

1. **Navigate to API Section**
   - Go to **API** → **Spaces Keys**
   - Find your API key: `DO801ZZ3F2GRUCX79KA6`

2. **Verify Required Permissions**
   ```
   ✅ Spaces:Read
   ✅ Spaces:Write  
   ✅ Spaces:Full Control (recommended)
   ```

3. **Check Key Status**
   - ✅ Key is active (not expired)
   - ✅ Key has correct permissions
   - ✅ Key is not rate-limited

### **Step 3: Regenerate API Key (if needed)**

If permissions are insufficient:

1. **Create New API Key**
   - Go to **API** → **Generate New Key**
   - Select **Spaces** with **Full Control**
   - Copy the new access key and secret key

2. **Update Environment Variables**
   ```bash
   # Update your .env file
   DO_SPACES_ACCESS_KEY=DO_NEW_ACCESS_KEY_HERE
   DO_SPACES_SECRET_KEY=your_new_secret_key_here
   ```

### **Step 4: Create Required Buckets**

1. **Manual Creation (Recommended)**
   - Go to **Spaces** → **Create a Space**
   - Create these three spaces:
     - `chronos-backups`
     - `chronos-json`  
     - `chronos-content`
   - Set region to `fra1`
   - Set permissions to **Private** (recommended)

2. **Programmatic Creation (Alternative)**
   ```bash
   # Using AWS CLI configured for DigitalOcean
   aws configure set aws_access_key_id DO801ZZ3F2GRUCX79KA6
   aws configure set aws_secret_access_key your_secret_key
   aws configure set default.region fra1
   
   # Create buckets
   aws s3 mb s3://chronos-backups --endpoint-url https://fra1.digitaloceanspaces.com
   aws s3 mb s3://chronos-json --endpoint-url https://fra1.digitaloceanspaces.com
   aws s3 mb s3://chronos-content --endpoint-url https://fra1.digitaloceanspaces.com
   ```

---

## 🧪 Testing After Fix

### **Quick Test Script**

```javascript
// test-credentials.js
import { initUnifiedDataManager } from 'chronos-db';

const config = {
  mongoUris: ['mongodb://localhost:27017'],
  spacesConns: [{
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    accessKey: process.env.DO_SPACES_ACCESS_KEY,
    secretKey: process.env.DO_SPACES_SECRET_KEY,
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
    backupsBucket: 'chronos-backups',
    forcePathStyle: false,
  }],
  // ... rest of config
};

async function testCredentials() {
  const udm = initUnifiedDataManager(config);
  
  // Test connectivity
  const result = await udm.admin.testS3Connectivity({
    dbName: 'test',
    collection: 'test'
  });
  
  if (result.success) {
    console.log('✅ Credentials working!');
    console.log('Available buckets:', result.buckets);
  } else {
    console.log('❌ Still failing:', result.error);
  }
  
  await udm.admin.shutdown();
}

testCredentials();
```

### **Run the Test**

```bash
# Set your credentials
export DO_SPACES_ACCESS_KEY="DO801ZZ3F2GRUCX79KA6"
export DO_SPACES_SECRET_KEY="your_secret_key"

# Run test
node test-credentials.js
```

---

## 🔍 Common Issues & Solutions

### **Issue: "Access Denied" persists**

**Possible Causes:**
1. **Wrong API Key Type**: Using Droplet API key instead of Spaces API key
2. **Insufficient Permissions**: Key lacks Spaces permissions
3. **Expired Key**: API key has expired
4. **Rate Limiting**: Too many requests (wait 1 hour)

**Solutions:**
1. ✅ Create new Spaces-specific API key
2. ✅ Ensure key has Full Control permissions
3. ✅ Check key expiration date
4. ✅ Wait and retry if rate-limited

### **Issue: "Bucket does not exist"**

**Solution:**
```javascript
// Enable auto-creation
const result = await udm.admin.ensureBucketsExist(
  { dbName: 'myapp', collection: 'users' },
  { 
    confirm: true,
    createIfMissing: true,
    dryRun: false 
  }
);
```

### **Issue: "Region mismatch"**

**Solution:**
```javascript
// Ensure region matches endpoint
spacesConns: [{
  endpoint: 'https://fra1.digitaloceanspaces.com',
  region: 'fra1',  // Must match endpoint region
  // ... rest of config
}]
```

---

## 📞 Support Resources

### **DigitalOcean Support**
- **Documentation**: https://docs.digitalocean.com/products/spaces/
- **API Reference**: https://docs.digitalocean.com/products/spaces/reference/s3-api/
- **Status Page**: https://status.digitalocean.com/

### **chronos-db Support**
- **GitHub Issues**: https://github.com/nx-intelligence/chronos-db/issues
- **Documentation**: https://github.com/nx-intelligence/chronos-db#readme
- **DigitalOcean Guide**: [docs/DIGITALOCEAN_SPACES.md](./docs/DIGITALOCEAN_SPACES.md)

---

## 🎯 Next Steps

1. **✅ COMPLETED**: Identify root cause (credential/permission issue)
2. **🔄 IN PROGRESS**: Fix DigitalOcean Spaces credentials/permissions
3. **⏳ PENDING**: Create required buckets (manual or programmatic)
4. **⏳ PENDING**: Test integration with fixed credentials
5. **⏳ PENDING**: Run comprehensive test suite

---

**Once credentials are fixed, run the comprehensive test:**
```bash
node examples/digitalocean-spaces-test.js
```

This will test all chronos-db features with DigitalOcean Spaces integration! 🚀
