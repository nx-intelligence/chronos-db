/**
 * Chronos-DB v2.2.0 Demo #3: Configurable Delete & Versioning
 * 
 * This demo demonstrates:
 * - Logical delete (enabled by default)
 * - Hard delete (when logical delete disabled)
 * - Versioning (enabled by default)
 * - No versioning mode (when versioning disabled)
 * - Database structure differences
 */

const { initChronos } = require('../dist/index.js');
const { join } = require('path');
const { MongoClient } = require('mongodb');

console.log('🚀 Chronos-DB v2.2.0 - Demo #3: Configurable Features\n');
console.log('='.repeat(70));

async function testWithConfig(configName, configOptions) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing: ${configName}`);
  console.log('='.repeat(70));

  const config = {
    dbConnections: {
      'local-mongo': {
        mongoUri: 'mongodb://localhost:27017'
      }
    },
    spacesConnections: {
    'dummy-storage': {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      accessKey: 'dummy',
      secretKey: 'dummy'
    }
  },
    databases: {
      runtime: {
        tenantDatabases: [
          {
            tenantId: 'config-demo',
            dbConnRef: 'local-mongo',
            spaceConnRef: 'dummy-storage',
            bucket: 'config-bucket',
            dbName: `chronos_demo_${configName.replace(/\s/g, '_').toLowerCase()}`,
            analyticsDbName: 'chronos_analytics_config'
          }
        ]
      }
    },
    localStorage: {
      enabled: true,
      basePath: join(__dirname, `../test-demo-03-data-${configName.replace(/\s/g, '-').toLowerCase()}`)
    },
    routing: { hashAlgo: 'rendezvous' },
    collectionMaps: {
      items: {
        indexedProps: ['name', 'status']
      }
    },
    ...configOptions
  };

  const chronos = await initChronos(config);
  
  const ops = chronos.with({
    dbName: config.databases.runtime.tenantDatabases[0].dbName,
    collection: 'items',
    databaseType: 'runtime',
    tier: 'tenant',
    tenantId: 'config-demo'
  });

  console.log('\n📝 Configuration:');
  console.log('   - Logical Delete:', config.logicalDelete?.enabled ?? true);
  console.log('   - Versioning:', config.versioning?.enabled ?? true);

  // Create item
  console.log('\n📝 Creating item...');
  const created = await ops.create({
    name: 'Test Item',
    status: 'active',
    value: 100
  }, 'system', 'test creation');

  console.log('✅ Created:');
  console.log('   ID:', created.id);
  console.log('   OV:', created.ov);

  // Update item (test versioning)
  console.log('\n📝 Updating item...');
  const updated = await ops.update(
    created.id,
    { status: 'updated', value: 200 },
    created.ov,
    'system',
    'test update'
  );

  console.log('✅ Updated:');
  console.log('   ID:', updated.id);
  console.log('   OV:', updated.ov);

  // Inspect database before delete
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db(config.databases.runtime.tenantDatabases[0].dbName);
  
  console.log('\n🔍 Database before DELETE:');
  const headBefore = await db.collection('items_head').findOne({ _id: created.id });
  console.log('   Head doc:', JSON.stringify(headBefore, null, 2));
  
  const versBefore = await db.collection('items_ver').find({ _id: created.id }).toArray();
  console.log(`   Version docs: ${versBefore.length} versions`);
  versBefore.forEach(v => {
    console.log('      ', JSON.stringify(v, null, 2));
  });

  // Delete item
  console.log('\n📝 Deleting item...');
  const deleted = await ops.delete(
    updated.id,
    updated.ov,
    'system',
    'test deletion'
  );

  console.log('✅ Deleted:');
  console.log('   ID:', deleted.id);
  console.log('   OV:', deleted.ov);
  if (deleted.deletedAt) {
    console.log('   Deleted At:', deleted.deletedAt, '(LOGICAL DELETE)');
  } else {
    console.log('   (HARD DELETE - no deletedAt)');
  }

  // Inspect database after delete
  console.log('\n🔍 Database after DELETE:');
  const headAfter = await db.collection('items_head').findOne({ _id: created.id });
  if (headAfter) {
    console.log('   Head doc:', JSON.stringify(headAfter, null, 2));
    console.log('   Status: LOGICALLY DELETED (still in database)');
  } else {
    console.log('   Head doc: null');
    console.log('   Status: HARD DELETED (removed from database)');
  }
  
  const versAfter = await db.collection('items_ver').find({ _id: created.id }).toArray();
  console.log(`   Version docs after delete: ${versAfter.length} versions`);

  await client.close();
  await chronos.admin.shutdown();

  return { created, updated, deleted };
}

async function runDemo() {
  try {
    // Test 1: Default (Logical Delete + Versioning ENABLED)
    await testWithConfig('Default (Logical Delete + Versioning)', {
      logicalDelete: { enabled: true },
      versioning: { enabled: true }
    });

    // Test 2: Hard Delete + Versioning ENABLED
    console.log('\n\n' + '='.repeat(70));
    console.log('⏸️  Waiting 2 seconds before next test...');
    console.log('='.repeat(70));
    await new Promise(resolve => setTimeout(resolve, 2000));

    await testWithConfig('Hard Delete + Versioning', {
      logicalDelete: { enabled: false },  // HARD DELETE
      versioning: { enabled: true }
    });

    // Test 3: Logical Delete + NO Versioning
    console.log('\n\n' + '='.repeat(70));
    console.log('⏸️  Waiting 2 seconds before next test...');
    console.log('='.repeat(70));
    await new Promise(resolve => setTimeout(resolve, 2000));

    await testWithConfig('Logical Delete + No Versioning', {
      logicalDelete: { enabled: true },
      versioning: { enabled: false }  // NO VERSIONING
    });

    // Test 4: Hard Delete + NO Versioning
    console.log('\n\n' + '='.repeat(70));
    console.log('⏸️  Waiting 2 seconds before next test...');
    console.log('='.repeat(70));
    await new Promise(resolve => setTimeout(resolve, 2000));

    await testWithConfig('Hard Delete + No Versioning', {
      logicalDelete: { enabled: false },
      versioning: { enabled: false }
    });

    // Summary
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 Summary: Configuration Comparison\n');
    console.log('┌────────────────────┬─────────────────┬──────────────┬─────────────────┐');
    console.log('│ Configuration      │ Logical Delete  │ Versioning   │ Delete Behavior │');
    console.log('├────────────────────┼─────────────────┼──────────────┼─────────────────┤');
    console.log('│ Default            │ ✅ Enabled      │ ✅ Enabled   │ Soft delete     │');
    console.log('│ Hard Delete        │ ❌ Disabled     │ ✅ Enabled   │ Hard delete     │');
    console.log('│ No Versioning      │ ✅ Enabled      │ ❌ Disabled  │ Soft delete     │');
    console.log('│ Minimal            │ ❌ Disabled     │ ❌ Disabled  │ Hard delete     │');
    console.log('└────────────────────┴─────────────────┴──────────────┴─────────────────┘');

    console.log('\n✨ Key Differences:');
    console.log('   ✓ Logical Delete ENABLED: Records marked as deleted, recoverable');
    console.log('   ✓ Logical Delete DISABLED: Records permanently removed');
    console.log('   ✓ Versioning ENABLED: All versions stored, time-travel possible');
    console.log('   ✓ Versioning DISABLED: Only latest version, no history');

    console.log('\n✅ All configuration tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    console.error('\nError details:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

runDemo();

