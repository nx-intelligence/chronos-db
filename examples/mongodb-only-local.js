/**
 * Example: Using UDM with MongoDB only + Local Filesystem Storage
 * 
 * This example shows how to use the Unified Data Manager with just MongoDB
 * and a local folder for storage, making it perfect for testing and development.
 * 
 * NO S3 REQUIRED! Just MongoDB and a folder on disk.
 */

import { initUnifiedDataManager } from '../dist/index.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Configuration - MongoDB Only with Local Storage
// ============================================================================

const config = {
  // Just provide MongoDB connection
  mongoUris: [
    'mongodb+srv://ami2:FI897j20H5EY6Z3V@db-mongodb-ams3-sage0-d8bffabe.mongo.ondigitalocean.com/admin?replicaSet=db-mongodb-ams3-sage0&tls=true&authSource=admin'
  ],

  // Use local filesystem instead of S3 (perfect for testing!)
  localStorage: {
    enabled: true,
    basePath: join(__dirname, '../.udm-storage'), // Store in .udm-storage folder
  },

  // Counters DB (same MongoDB for simplicity)
  counters: {
    mongoUri: 'mongodb+srv://ami2:FI897j20H5EY6Z3V@db-mongodb-ams3-sage0-d8bffabe.mongo.ondigitalocean.com/admin?replicaSet=db-mongodb-ams3-sage0&tls=true&authSource=admin',
    dbName: 'udm_counters',
  },

  // Routing (defaults are fine)
  routing: {
    hashAlgo: 'rendezvous',
  },

  // Retention
  retention: {
    ver: {
      days: 30,
    },
    counters: {
      days: 30,
      weeks: 12,
      months: 6,
    },
  },

  // Rollup
  rollup: {
    enabled: false,
    manifestPeriod: 'daily',
  },

  // Collection maps
  collectionMaps: {
    test_items: {
      indexedProps: ['name', 'status'],
      validation: {
        requiredIndexed: ['name'],
      },
    },
  },
};

// ============================================================================
// Initialize UDM
// ============================================================================

console.log('🚀 Initializing Unified Data Manager (MongoDB + Local Storage)...\n');

const udm = initUnifiedDataManager(config);

// ============================================================================
// Test Operations
// ============================================================================

async function runExample() {
  try {
    console.log('📝 Testing CRUD operations...\n');

    // Context for our operations
    const ctx = {
      dbName: 'test_db',
      collection: 'test_items',
      tenantId: 'test_tenant',
    };

    const ops = udm.with(ctx);

    // 1. CREATE
    console.log('1️⃣  Creating item...');
    const created = await ops.create({
      name: 'Test Item',
      status: 'active',
      description: 'This is a test item',
      tags: ['test', 'example'],
    }, 'system', 'initial creation');

    console.log('   ✅ Created:', created);
    console.log('');

    // 2. READ (latest - MongoDB-like!)
    console.log('2️⃣  Reading item (latest)...');
    const item = await ops.getItem(created.id);
    console.log('   ✅ Got item:', JSON.stringify(item, null, 2));
    console.log('   📌 Notice: Just gets the data, no ov/cv/at exposed!');
    console.log('');

    // 3. READ with metadata
    console.log('3️⃣  Reading item with metadata...');
    const itemWithMeta = await ops.getItem(created.id, { includeMeta: true });
    console.log('   ✅ Got item with meta:', JSON.stringify(itemWithMeta, null, 2));
    console.log('   📌 Notice: Now we see ov, cv, at in _meta!');
    console.log('');

    // 4. UPDATE
    console.log('4️⃣  Updating item...');
    const updated = await ops.update(created.id, {
      status: 'verified',
      lastChecked: new Date().toISOString(),
    }, created.ov, 'system', 'verification');

    console.log('   ✅ Updated:', updated);
    console.log('');

    // 5. ENRICH (incremental update!)
    console.log('5️⃣  Enriching item...');
    const enriched = await ops.enrich(created.id, {
      tags: ['enriched', 'vip'],  // Will be unioned with existing tags
      metadata: { score: 100 },    // Deep merged
    }, { functionId: 'test-enricher@v1' });

    console.log('   ✅ Enriched:', enriched);
    console.log('');

    // 6. READ after enrichment
    console.log('6️⃣  Reading after enrichment...');
    const enrichedItem = await ops.getItem(created.id);
    console.log('   ✅ Item after enrichment:', JSON.stringify(enrichedItem, null, 2));
    console.log('   📌 Notice: tags were unioned, metadata was merged!');
    console.log('');

    // 7. GET HISTORICAL VERSION
    console.log('7️⃣  Getting historical version (v0)...');
    const v0 = await ops.getItem(created.id, { ov: 0, includeMeta: true });
    console.log('   ✅ Version 0:', JSON.stringify(v0, null, 2));
    console.log('   📌 Notice: Original data before updates!');
    console.log('');

    // 8. QUERY
    console.log('8️⃣  Querying collection...');
    const results = await ops.query({ status: 'verified' });
    console.log(`   ✅ Found ${results.items.length} items`);
    console.log('');

    // 9. DELETE (logical)
    console.log('9️⃣  Deleting item (logical)...');
    const deleted = await ops.delete(created.id, enriched.ov);
    console.log('   ✅ Deleted:', deleted);
    console.log('');

    // 10. READ after delete (hidden by default!)
    console.log('🔟 Reading after delete...');
    const notFound = await ops.getItem(created.id);
    console.log('   ✅ Item is hidden:', notFound === null);
    console.log('   📌 Notice: Deleted items are HIDDEN by default (MongoDB-like)!');
    console.log('');

    // 11. READ deleted item explicitly
    console.log('1️⃣1️⃣  Reading deleted item explicitly...');
    const deletedItem = await ops.getItem(created.id, { includeDeleted: true, includeMeta: true });
    console.log('   ✅ Deleted item:', JSON.stringify(deletedItem, null, 2));
    console.log('   📌 Notice: Can still access deleted items if needed!');
    console.log('');

    console.log('✅ All operations completed successfully!');
    console.log('');
    console.log('📁 Storage location:', join(__dirname, '../.udm-storage'));
    console.log('   You can inspect the files to see the versioned JSON!');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    // Shutdown
    console.log('🛑 Shutting down...');
    await udm.admin.shutdown();
    console.log('✅ Shutdown complete');
  }
}

// Run the example
runExample().catch(console.error);

