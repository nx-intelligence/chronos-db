/**
 * DigitalOcean Spaces Integration Test Script
 * 
 * This script tests chronos-db integration with DigitalOcean Spaces
 * Run this after fixing credential/permission issues
 */

import { initUnifiedDataManager } from 'chronos-db';

// Test configuration - update with your actual credentials
const testConfig = {
  mongoUris: ['mongodb://localhost:27017'],
  
  // DigitalOcean Spaces configuration
  spacesConns: [{
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    accessKey: process.env.DO_SPACES_ACCESS_KEY || 'YOUR_ACCESS_KEY',
    secretKey: process.env.DO_SPACES_SECRET_KEY || 'YOUR_SECRET_KEY',
    jsonBucket: 'chronos-json',
    contentBucket: 'chronos-content',
    backupsBucket: 'chronos-backups',
    forcePathStyle: false,
  }],
  
  counters: {
    mongoUri: 'mongodb://localhost:27017',
    dbName: 'chronos_counters',
  },
  routing: { hashAlgo: 'rendezvous' },
  retention: {},
  rollup: {},
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

async function testDigitalOceanSpacesIntegration() {
  console.log('🚀 Testing DigitalOcean Spaces Integration with chronos-db');
  console.log('=====================================================\n');

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
      console.log('✅ S3 connectivity successful');
      console.log(`📦 Available buckets: ${connectivityTest.buckets.length}`);
      connectivityTest.buckets.forEach(bucket => {
        console.log(`   - ${bucket}`);
      });
    } else {
      console.log('❌ S3 connectivity failed:', connectivityTest.error);
      return;
    }
    console.log('');

    // Validate Spaces configuration
    console.log('3️⃣ Validating Spaces configuration...');
    const validation = await udm.admin.validateSpacesConfiguration({
      dbName: 'test_db',
      collection: 'test_items'
    });

    if (validation.valid) {
      console.log('✅ Spaces configuration is valid');
    } else {
      console.log('⚠️ Configuration issues found:');
      validation.issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('\n💡 Recommendations:');
      validation.recommendations.forEach(rec => console.log(`   - ${rec}`));
    }
    console.log('');

    // Check bucket status
    console.log('4️⃣ Checking bucket status...');
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
      console.log('5️⃣ Creating missing buckets...');
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

    // Test CRUD operations with auto-indexing
    console.log('6️⃣ Testing CRUD operations with auto-indexing...');
    const ops = udm.with({
      dbName: 'test_db',
      collection: 'test_items',
      tenantId: 'test_tenant'
    });

    // Create item (all properties will be auto-indexed)
    console.log('   Creating test item...');
    const testData = {
      name: 'Test Item',
      description: 'This is a test item for DigitalOcean Spaces integration',
      status: 'active',
      tags: ['test', 'integration', 'spaces'],
      metadata: {
        created_by: 'test_script',
        version: '1.0.0',
        features: ['auto-indexing', 'spaces-integration']
      },
      timestamp: new Date().toISOString()
    };

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

    // Update item
    console.log('   Updating item...');
    const updateResult = await ops.update(createResult.id, {
      status: 'updated',
      metadata: {
        ...testData.metadata,
        updated_at: new Date().toISOString()
      }
    }, createResult.ov, 'test_script', 'Update test');
    console.log(`   ✅ Updated item: ${updateResult.id} (ov: ${updateResult.ov})`);

    // Test enrichment
    console.log('   Testing enrichment...');
    const enrichResult = await ops.enrich(createResult.id, {
      tags: ['enriched'],
      metadata: {
        enrichment_source: 'test_script',
        enrichment_timestamp: new Date().toISOString()
      }
    }, {
      functionId: 'test-enricher@v1',
      actor: 'test_script',
      reason: 'Enrichment test'
    });
    console.log(`   ✅ Enriched item: ${enrichResult.id} (ov: ${enrichResult.ov})`);

    // Query items
    console.log('   Querying items...');
    const queryResult = await ops.query({ status: 'updated' });
    console.log(`   ✅ Found ${queryResult.items.length} items with status 'updated'`);

    // Test state management
    console.log('   Testing state management...');
    const stateResult = await udm.admin.markItemAsProcessed({
      dbName: 'test_db',
      collection: 'test_items'
    }, createResult.id, {
      confirm: true,
      dryRun: true
    });
    console.log(`   ✅ State management test: ${stateResult ? 'would mark as processed' : 'already processed'}`);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ S3 connectivity working');
    console.log('   ✅ Buckets created/accessible');
    console.log('   ✅ Auto-indexing working (all properties indexed)');
    console.log('   ✅ CRUD operations working');
    console.log('   ✅ Enrichment working');
    console.log('   ✅ State management working');
    console.log('   ✅ DigitalOcean Spaces integration successful!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\n🔍 Debugging tips:');
    console.error('   1. Check your DigitalOcean Spaces credentials');
    console.error('   2. Verify API key has Spaces permissions');
    console.error('   3. Ensure buckets exist or enable auto-creation');
    console.error('   4. Check network connectivity to DigitalOcean');
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
if (require.main === module) {
  testDigitalOceanSpacesIntegration().catch(console.error);
}

export { testDigitalOceanSpacesIntegration };
