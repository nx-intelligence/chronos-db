/**
 * Chronos-DB v2.2.0 Demo #4: Versioning & Restore
 * 
 * This demo demonstrates:
 * - Automatic versioning on every change
 * - Time-travel queries (read any version)
 * - Point-in-time queries
 * - Restore to previous version
 * - Version storage structure
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
  spacesConnections: {},
  databases: {
    runtime: {
      tenantDatabases: [
        {
          tenantId: 'version-demo',
          dbConnRef: 'local-mongo',
          spaceConnRef: 'local-storage',
          bucket: 'version-bucket',
          dbName: 'chronos_demo_versioning',
          analyticsDbName: 'chronos_demo_version_analytics'
        }
      ]
    }
  },
  localStorage: {
    enabled: true,
    basePath: join(__dirname, '../test-demo-04-data')
  },
  routing: { hashAlgo: 'rendezvous' },
  collectionMaps: {
    documents: {
      indexedProps: ['title', 'status', 'author']
    }
  },
  versioning: { enabled: true }
};

console.log('🚀 Chronos-DB v2.2.0 - Demo #4: Versioning & Restore\n');
console.log('='.repeat(70));

async function inspectVersions(itemId) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log('🔍 VERSION INSPECTION');
  console.log('─'.repeat(70));
  
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('chronos_demo_versioning');
  
  // Get all versions from MongoDB
  const versions = await db.collection('documents_ver').find({ _id: itemId }).sort({ ov: 1 }).toArray();
  console.log(`\n📊 MongoDB versions (documents_ver): ${versions.length} versions\n`);
  
  versions.forEach(ver => {
    console.log(`   Version ${ver.ov}:`);
    console.log(`      - CV: ${ver.cv}`);
    console.log(`      - At: ${ver.at}`);
    console.log(`      - Size: ${ver.size} bytes`);
    console.log(`      - SHA256: ${ver.sha256.substring(0, 16)}...`);
    console.log(`      - JSON Key: ${ver.jsonKey}`);
    if (ver.deletedAt) {
      console.log(`      - Deleted At: ${ver.deletedAt} ⚠️`);
    }
  });
  
  // Check storage
  const basePath = join(__dirname, '../test-demo-04-data/version-bucket/documents', itemId);
  if (fs.existsSync(basePath)) {
    console.log(`\n📁 Storage (${basePath}):\n`);
    const versionDirs = fs.readdirSync(basePath).sort();
    
    versionDirs.forEach(versionDir => {
      const versionPath = join(basePath, versionDir);
      if (fs.statSync(versionPath).isDirectory()) {
        const files = fs.readdirSync(versionPath);
        console.log(`   ${versionDir}/`);
        files.forEach(file => {
          const filePath = join(versionPath, file);
          const size = fs.statSync(filePath).size;
          console.log(`      └─ ${file} (${size} bytes)`);
          
          if (file === 'item.json') {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`         Data snapshot: title="${content.title}", status="${content.status}"`);
            if (content._system) {
              console.log(`         _system.ov=${content._system.ov}, deletedAt=${content._system.deletedAt || 'null'}`);
            }
          }
        });
      }
    });
  }
  
  await client.close();
}

async function runDemo() {
  let chronos;
  
  try {
    console.log('\n📦 Step 1: Initialize Chronos-DB (Versioning ENABLED)\n');
    chronos = await initChronos(config);
    console.log('✅ Chronos-DB initialized');
    console.log('   - Versioning: ENABLED');
    console.log('   - Logical Delete: ENABLED');

    const ops = chronos.with({
      dbName: 'chronos_demo_versioning',
      collection: 'documents',
      databaseType: 'runtime',
      tier: 'tenant',
      tenantId: 'version-demo'
    });

    // CREATE (Version 0)
    console.log('\n' + '='.repeat(70));
    console.log('📝 Step 2: CREATE - Version 0\n');

    const created = await ops.create({
      title: 'Important Document',
      status: 'draft',
      author: 'Alice',
      content: 'Initial draft content'
    }, 'alice@example.com', 'document creation');

    console.log('✅ Document created:');
    console.log('   ID:', created.id);
    console.log('   OV: 0 (original version)');
    console.log('   CV:', created.cv);

    await inspectVersions(created.id);

    // UPDATE 1 (Version 1)
    console.log('\n' + '='.repeat(70));
    console.log('📝 Step 3: UPDATE - Version 1\n');

    const update1 = await ops.update(
      created.id,
      { status: 'review', content: 'Updated content for review' },
      0,  // Expected OV
      'alice@example.com',
      'ready for review'
    );

    console.log('✅ Document updated:');
    console.log('   OV: 1 (incremented)');
    console.log('   CV:', update1.cv);

    await inspectVersions(created.id);

    // UPDATE 2 (Version 2)
    console.log('\n' + '='.repeat(70));
    console.log('📝 Step 4: UPDATE - Version 2\n');

    const update2 = await ops.update(
      created.id,
      { status: 'published', content: 'Final published content' },
      1,  // Expected OV
      'bob@example.com',
      'published after review'
    );

    console.log('✅ Document updated:');
    console.log('   OV: 2 (incremented)');
    console.log('   CV:', update2.cv);

    await inspectVersions(created.id);

    // TIME-TRAVEL: Read different versions
    console.log('\n' + '='.repeat(70));
    console.log('⏰ Step 5: TIME-TRAVEL - Read Different Versions\n');

    const v0 = await ops.getItem(created.id, { ov: 0, includeMeta: true });
    console.log('✅ Version 0 (original):');
    console.log('   Title:', v0.title);
    console.log('   Status:', v0.status);
    console.log('   Content:', v0.content);

    const v1 = await ops.getItem(created.id, { ov: 1, includeMeta: true });
    console.log('\n✅ Version 1 (after first update):');
    console.log('   Title:', v1.title);
    console.log('   Status:', v1.status);
    console.log('   Content:', v1.content);

    const latest = await ops.getItem(created.id, { includeMeta: true });
    console.log('\n✅ Latest version (v2):');
    console.log('   Title:', latest.title);
    console.log('   Status:', latest.status);
    console.log('   Content:', latest.content);

    // DELETE (Version 3)
    console.log('\n' + '='.repeat(70));
    console.log('🗑️  Step 6: DELETE - Version 3 (Logical)\n');

    const deleted = await ops.delete(
      created.id,
      2,  // Expected OV
      'admin@example.com',
      'document archived'
    );

    console.log('✅ Document logically deleted:');
    console.log('   OV: 3 (delete creates a new version)');
    console.log('   Deleted At:', deleted.deletedAt);

    await inspectVersions(created.id);

    // RESTORE
    console.log('\n' + '='.repeat(70));
    console.log('🔄 Step 7: RESTORE - Back to Version 1\n');

    const restored = await ops.restoreObject(created.id, { ov: 1 });

    console.log('✅ Document restored to version 1:');
    console.log('   New OV: 4 (restore creates new version)');
    console.log('   Restored from OV: 1');

    await inspectVersions(created.id);

    const restoredData = await ops.getItem(created.id, { includeMeta: true });
    console.log('\n✅ Current data after restore:');
    console.log('   Title:', restoredData.title);
    console.log('   Status:', restoredData.status);
    console.log('   Content:', restoredData.content);
    console.log('   (Matches version 1!)');

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Step 8: Version History Summary\n');
    console.log('✅ Complete Version History:');
    console.log('   v0: Initial draft');
    console.log('   v1: Ready for review');
    console.log('   v2: Published');
    console.log('   v3: Deleted (logical)');
    console.log('   v4: Restored from v1');

    console.log('\n✨ Versioning Features:');
    console.log('   ✓ Every change creates immutable version');
    console.log('   ✓ Read any previous version');
    console.log('   ✓ Restore to any point in history');
    console.log('   ✓ Complete audit trail');
    console.log('   ✓ Storage: One JSON file per version');
    console.log('   ✓ MongoDB: Lightweight version index');

    console.log('\n✅ Demo completed successfully!');

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

