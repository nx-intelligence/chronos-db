/**
 * Chronos-DB v2.2.0 Demo #1: Basic CRUD Operations
 * 
 * This demo demonstrates:
 * - CREATE: Creating records with versioning
 * - READ: Fetching latest version
 * - UPDATE: Updating with optimistic locking
 * - DELETE: Logical vs hard delete
 * - Database structure inspection
 * - Storage layout inspection
 */

const { initChronos } = require('../dist/index.js');
const { join } = require('path');
const { MongoClient } = require('mongodb');
const fs = require('fs');

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
          tenantId: 'demo-tenant',
          dbConnRef: 'local-mongo',
          spaceConnRef: 'dummy-storage',
          bucket: 'demo-bucket',
          dbName: 'chronos_demo_crud',
          analyticsDbName: 'chronos_demo_analytics'
        }
      ]
    }
  },
  localStorage: {
    enabled: true,
    basePath: join(__dirname, '../test-demo-01-data')
  },
  routing: { hashAlgo: 'rendezvous' },
  collectionMaps: {
    users: {
      indexedProps: ['email', 'username', 'status']
    }
  },
  logicalDelete: {
    enabled: true  // Logical delete by default
  },
  versioning: {
    enabled: true  // Versioning enabled
  }
};

console.log('🚀 Chronos-DB v2.2.0 - Demo #1: Basic CRUD Operations\n');
console.log('='.repeat(70));

async function inspectDatabase(label) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🔍 DATABASE INSPECTION: ${label}`);
  console.log('─'.repeat(70));
  
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('chronos_demo_crud');
  
  // Inspect head collection
  const headDocs = await db.collection('users_head').find({}).toArray();
  console.log('\n📊 users_head collection:');
  headDocs.forEach(doc => {
    console.log(JSON.stringify(doc, null, 2));
  });
  
  // Inspect version collection
  const verDocs = await db.collection('users_ver').find({}).toArray();
  console.log('\n📊 users_ver collection:');
  verDocs.forEach(doc => {
    console.log(JSON.stringify(doc, null, 2));
  });
  
  // Inspect counter collection
  const counterDoc = await db.collection('users_counter').findOne({});
  console.log('\n📊 users_counter collection:');
  console.log(JSON.stringify(counterDoc, null, 2));
  
  await client.close();
}

async function inspectStorage(label) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🗂️  STORAGE INSPECTION: ${label}`);
  console.log('─'.repeat(70));
  
  const basePath = join(__dirname, '../test-demo-01-data/demo-bucket/users');
  
  if (fs.existsSync(basePath)) {
    const items = fs.readdirSync(basePath);
    console.log(`\n📁 Storage path: ${basePath}`);
    console.log(`📁 Items found: ${items.length}\n`);
    
    items.forEach(itemId => {
      const itemPath = join(basePath, itemId);
      if (fs.statSync(itemPath).isDirectory()) {
        const versions = fs.readdirSync(itemPath);
        console.log(`   📄 ${itemId}/`);
        versions.forEach(version => {
          const versionPath = join(itemPath, version);
          if (fs.statSync(versionPath).isDirectory()) {
            const files = fs.readdirSync(versionPath);
            console.log(`      └─ ${version}/`);
            files.forEach(file => {
              const filePath = join(versionPath, file);
              const size = fs.statSync(filePath).size;
              console.log(`         └─ ${file} (${size} bytes)`);
              
              // Show content of item.json
              if (file === 'item.json') {
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                console.log(`            Content: ${JSON.stringify(content, null, 12).substring(0, 200)}...`);
              }
            });
          }
        });
      }
    });
  } else {
    console.log('   (No storage data yet)');
  }
}

async function runDemo() {
  let chronos;
  
  try {
    // Initialize
    console.log('\n📦 Step 1: Initialize Chronos-DB\n');
    chronos = await initChronos(config);
    console.log('✅ Chronos-DB v2.2.0 initialized');
    console.log('   - Logical delete: ENABLED');
    console.log('   - Versioning: ENABLED');
    console.log('   - Storage: Local filesystem');

    const ops = chronos.with({
      dbName: 'chronos_demo_crud',
      collection: 'users',
      databaseType: 'runtime',
      tier: 'tenant',
      tenantId: 'demo-tenant'
    });

    // CREATE
    console.log('\n' + '='.repeat(70));
    console.log('📝 Step 2: CREATE Operation\n');
    
    const createResult = await ops.create({
      username: 'johndoe',
      email: 'john@example.com',
      status: 'active',
      profile: {
        firstName: 'John',
        lastName: 'Doe',
        age: 30
      },
      tags: ['user', 'verified']
    }, 'admin-user', 'user registration');

    console.log('✅ User created:');
    console.log('   ID:', createResult.id);
    console.log('   OV (Object Version):', createResult.ov);
    console.log('   CV (Collection Version):', createResult.cv);
    console.log('   Created At:', createResult.createdAt);

    await inspectDatabase('After CREATE');
    await inspectStorage('After CREATE');

    // READ
    console.log('\n' + '='.repeat(70));
    console.log('📖 Step 3: READ Operation\n');

    const readResult = await ops.getItem(createResult.id, {
      includeMeta: true  // Include version metadata
    });

    console.log('✅ User fetched:');
    console.log(JSON.stringify(readResult, null, 2));

    // UPDATE
    console.log('\n' + '='.repeat(70));
    console.log('📝 Step 4: UPDATE Operation\n');

    const updateResult = await ops.update(
      createResult.id,
      {
        status: 'premium',
        profile: { age: 31 },  // Partial update
        tags: ['premium']  // Will be merged
      },
      createResult.ov,  // Optimistic locking
      'admin-user',
      'user upgrade'
    );

    console.log('✅ User updated:');
    console.log('   ID:', updateResult.id);
    console.log('   OV:', updateResult.ov, '(incremented from', createResult.ov, ')');
    console.log('   CV:', updateResult.cv);
    console.log('   Updated At:', updateResult.updatedAt);

    await inspectDatabase('After UPDATE');
    await inspectStorage('After UPDATE');

    // READ UPDATED
    console.log('\n' + '='.repeat(70));
    console.log('📖 Step 5: READ Updated Record\n');

    const updatedRecord = await ops.getItem(updateResult.id, { includeMeta: true });
    console.log('✅ Updated user:');
    console.log(JSON.stringify(updatedRecord, null, 2));

    // TIME-TRAVEL: Read previous version
    console.log('\n' + '='.repeat(70));
    console.log('⏰ Step 6: TIME-TRAVEL - Read Previous Version\n');

    const oldVersion = await ops.getItem(createResult.id, {
      ov: 0,  // Original version
      includeMeta: true
    });

    console.log('✅ Original version (ov=0):');
    console.log(JSON.stringify(oldVersion, null, 2));

    // DELETE (Logical)
    console.log('\n' + '='.repeat(70));
    console.log('🗑️  Step 7: DELETE Operation (Logical)\n');

    const deleteResult = await ops.delete(
      updateResult.id,
      updateResult.ov,
      'admin-user',
      'user account closure'
    );

    console.log('✅ User logically deleted:');
    console.log('   ID:', deleteResult.id);
    console.log('   OV:', deleteResult.ov);
    console.log('   Deleted At:', deleteResult.deletedAt);

    await inspectDatabase('After LOGICAL DELETE');
    await inspectStorage('After LOGICAL DELETE');

    // Try to read deleted (should return null by default)
    console.log('\n' + '='.repeat(70));
    console.log('📖 Step 8: READ Deleted Record (Hidden by Default)\n');

    const deletedRead = await ops.getItem(deleteResult.id);
    console.log('✅ Deleted user (hidden):', deletedRead);

    // Read deleted with includeDeleted flag
    console.log('\n' + '='.repeat(70));
    console.log('📖 Step 9: READ Deleted Record (With includeDeleted flag)\n');

    const deletedReadVisible = await ops.getItem(deleteResult.id, {
      includeDeleted: true,
      includeMeta: true
    });
    console.log('✅ Deleted user (visible with flag):');
    console.log(JSON.stringify(deletedReadVisible, null, 2));

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Step 10: Summary\n');
    console.log('✅ CRUD Operations Demonstrated:');
    console.log('   ✓ CREATE: New record with ov=0, cv increments');
    console.log('   ✓ READ: Fetch latest version');
    console.log('   ✓ UPDATE: Increments ov, creates new version');
    console.log('   ✓ DELETE: Logical delete (recoverable)');
    console.log('   ✓ TIME-TRAVEL: Read any previous version');
    console.log('   ✓ VERSIONING: All versions stored immutably');

    console.log('\n📁 Database Collections:');
    console.log('   - users_head: Latest state pointers');
    console.log('   - users_ver: Version index (all versions)');
    console.log('   - users_counter: Collection version counter');

    console.log('\n📁 Storage Layout:');
    console.log('   - users/<itemId>/v0/item.json (original)');
    console.log('   - users/<itemId>/v1/item.json (after update)');
    console.log('   - users/<itemId>/v2/item.json (after delete)');

    console.log('\n✅ Demo completed successfully!');

  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    console.error('\nError details:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (chronos) {
      await chronos.admin.shutdown();
      console.log('\n🛑 Chronos-DB shutdown complete');
    }
  }
}

runDemo();

