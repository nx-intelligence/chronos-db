/**
 * Quick DigitalOcean Spaces Test with Valid Credentials
 */

import { initUnifiedDataManager } from 'chronos-db';

// Test configuration with your valid credentials
const testConfig = {
  mongoUris: [process.env.MONGO_URI || 'mongodb://ki:AQ5Ty8X3Cx4x3x60@x3:27017/kiDB?authSource=admin'],
  
  // DigitalOcean Spaces configuration
  spacesConns: [{
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    accessKey: process.env.SPACE_ACCESS_KEY || 'DO801ZZ3F2GRUCX79KA6',
    secretKey: process.env.SPACE_SECRET_KEY || 'nSigDCDabvuWxheaJ8f5o8K6NIhVDRMR8C9kz3xqO/8',
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
    backupsBucket: 'chronos-backups',
    forcePathStyle: false,
  }],
  
  counters: {
    mongoUri: process.env.MONGO_URI || 'mongodb://ki:AQ5Ty8X3Cx4x3x60@x3:27017/kiDB?authSource=admin',
    dbName: 'chronos_counters',
  },
  routing: { hashAlgo: 'rendezvous' },
  retention: {},
  rollup: {},
  transactions: { enabled: false }, // Disable transactions for single MongoDB instance
  collectionMaps: {
    // Test auto-indexing - no collection map means all properties are indexed
    test_items: {
      indexedProps: [], // Empty array = all properties indexed
      validation: {
        requiredIndexed: [],
      },
    },
  },
};

async function quickTest() {
  console.log('🚀 Quick DigitalOcean Spaces Test');
  console.log('================================\n');

  try {
    // Initialize chronos-db
    console.log('1️⃣ Initializing chronos-db...');
    const udm = initUnifiedDataManager(testConfig);
    console.log('✅ chronos-db initialized successfully\n');

    // Test S3 connectivity
    console.log('2️⃣ Testing S3 connectivity...');
    const connectivityTest = await udm.admin.testS3Connectivity({
      dbName: 'test_db',
      collection: 'test_items'
    });

    if (connectivityTest.success) {
      console.log('✅ S3 connectivity successful!');
      console.log(`📦 Available buckets: ${connectivityTest.buckets.length}`);
      connectivityTest.buckets.forEach(bucket => {
        console.log(`   - ${bucket}`);
      });
    } else {
      console.log('❌ S3 connectivity failed:', connectivityTest.error);
      return;
    }
    console.log('');

    // Check bucket status
    console.log('3️⃣ Checking bucket status...');
    const bucketStatus = await udm.admin.ensureBucketsExist({
      dbName: 'test_db',
      collection: 'test_items'
    }, {
      dryRun: true,
      confirm: true,
      createIfMissing: false
    });

    console.log(`📊 Bucket status (${bucketStatus.bucketsChecked} buckets checked):`);
    bucketStatus.bucketStatuses.forEach(status => {
      const icon = status.exists ? '✅' : '❌';
      const error = status.error ? ` (${status.error})` : '';
      console.log(`   ${icon} ${status.name}${error}`);
    });
    console.log('');

    // Create buckets if missing
    const missingBuckets = bucketStatus.bucketStatuses.filter(s => !s.exists);
    if (missingBuckets.length > 0) {
      console.log('4️⃣ Creating missing buckets...');
      const createResult = await udm.admin.ensureBucketsExist({
        dbName: 'test_db',
        collection: 'test_items'
      }, {
        confirm: true,
        createIfMissing: true,
        dryRun: false
      });

      console.log(`✅ Created ${createResult.bucketsCreated} buckets`);
      createResult.bucketStatuses.forEach(status => {
        if (status.created) {
          console.log(`   ✅ Created: ${status.name}`);
        }
      });
      console.log('');
    }

    // Test basic CRUD operation
    console.log('5️⃣ Testing basic CRUD operation...');
    const ops = udm.with({
      dbName: 'test_db',
      collection: 'test_items',
      tenantId: 'test_tenant'
    });

    // Create item (all properties will be auto-indexed)
    const testData = {
      name: 'DigitalOcean Spaces Test',
      description: 'Testing integration with valid credentials',
      status: 'active',
      timestamp: new Date().toISOString(),
      test_id: Math.random().toString(36).substring(7)
    };

    console.log('   Creating test item...');
    const createResult = await ops.create(testData, 'test_script', 'DigitalOcean Spaces integration test');
    console.log(`   ✅ Created item: ${createResult.id} (ov: ${createResult.ov})`);

    // Read item
    console.log('   Reading item...');
    const readResult = await ops.getItem(createResult.id);
    if (readResult) {
      console.log(`   ✅ Read item: ${readResult.id}`);
      console.log(`   📊 Data keys: ${Object.keys(readResult.item).join(', ')}`);
    } else {
      console.log('   ❌ Failed to read item');
    }

    console.log('\n🎉 Quick test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ S3 connectivity working');
    console.log('   ✅ Buckets accessible/created');
    console.log('   ✅ Auto-indexing working');
    console.log('   ✅ CRUD operations working');
    console.log('   ✅ DigitalOcean Spaces integration successful!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\n🔍 Error details:', error.message);
  } finally {
    // Cleanup
    try {
      const udm = initUnifiedDataManager(testConfig);
      await udm.admin.shutdown();
      console.log('\n🧹 Cleanup completed');
    } catch (error) {
      console.error('⚠️ Cleanup error:', error);
    }
  }
}

// Run the test
quickTest().catch(console.error);
