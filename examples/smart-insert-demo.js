/**
 * Example: Smart Insert - Upsert with Enrichment Merge Semantics
 * 
 * This demonstrates smartInsert which automatically:
 * - Creates a new record if unique keys don't match
 * - Enriches (deep merges) into existing record if match found
 */

import { initUnifiedDataManager } from '../dist/index.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
  mongoUris: [
    'mongodb+srv://ami2:FI897j20H5EY6Z3V@db-mongodb-ams3-sage0-d8bffabe.mongo.ondigitalocean.com/admin?replicaSet=db-mongodb-ams3-sage0&tls=true&authSource=admin'
  ],
  localStorage: {
    enabled: true,
    basePath: join(__dirname, '../.udm-storage'),
  },
  counters: {
    mongoUri: 'mongodb+srv://ami2:FI897j20H5EY6Z3V@db-mongodb-ams3-sage0-d8bffabe.mongo.ondigitalocean.com/admin?replicaSet=db-mongodb-ams3-sage0&tls=true&authSource=admin',
    dbName: 'udm_counters',
  },
  routing: { hashAlgo: 'rendezvous' },
  retention: {
    ver: { days: 30 },
    counters: { days: 30, weeks: 12, months: 6 },
  },
  rollup: { enabled: false, manifestPeriod: 'daily' },
  collectionMaps: {
    users: {
      indexedProps: ['email', 'username', 'status'],
      validation: {
        requiredIndexed: ['email'],
      },
    },
  },
};

console.log('🚀 Smart Insert Demo\n');

const udm = initUnifiedDataManager(config);

async function runDemo() {
  try {
    const ops = udm.with({
      dbName: 'demo_db',
      collection: 'users',
    });

    // Demo 1: First smartInsert - should CREATE
    console.log('1️⃣  First smartInsert (email: john@example.com)...');
    const result1 = await ops.smartInsert(
      {
        email: 'john@example.com',
        username: 'john',
        name: 'John Doe',
        tags: ['user'],
        metadata: { score: 10 },
      },
      {
        uniqueKeys: ['email'],
        actor: 'importer',
        reason: 'initial import',
        functionId: 'importer@v1',
      }
    );

    console.log('   ✅ Result:', result1);
    console.log('   📌 created:', result1.created, '(should be true - new record)');
    console.log('');

    // Demo 2: Same email again - should MERGE
    console.log('2️⃣  Second smartInsert (same email)...');
    const result2 = await ops.smartInsert(
      {
        email: 'john@example.com',
        tags: ['premium', 'vip'],
        metadata: { level: 5 },
        status: 'verified',
      },
      {
        uniqueKeys: ['email'],
        actor: 'enricher',
        reason: 'data enrichment',
        functionId: 'enricher@v1',
      }
    );

    console.log('   ✅ Result:', result2);
    console.log('   📌 created:', result2.created, '(should be false - merged)');
    console.log('   📌 Same ID:', result1.id === result2.id, '(should be true)');
    console.log('');

    // Demo 3: Read the merged result
    console.log('3️⃣  Reading merged record...');
    const merged = await ops.getItem(result1.id);
    console.log('   ✅ Merged data:', JSON.stringify(merged, null, 2));
    console.log('   📌 Notice:');
    console.log('      - tags: ["user", "premium", "vip"] (union!)');
    console.log('      - metadata: { score: 10, level: 5 } (deep merge!)');
    console.log('      - status: "verified" (added)');
    console.log('');

    // Demo 4: Different email - should CREATE new
    console.log('4️⃣  Third smartInsert (different email)...');
    const result3 = await ops.smartInsert(
      {
        email: 'jane@example.com',
        username: 'jane',
        name: 'Jane Smith',
        tags: ['user'],
      },
      {
        uniqueKeys: ['email'],
        actor: 'importer',
        functionId: 'importer@v1',
      }
    );

    console.log('   ✅ Result:', result3);
    console.log('   📌 created:', result3.created, '(should be true - different email)');
    console.log('   📌 Different ID:', result1.id !== result3.id, '(should be true)');
    console.log('');

    // Demo 5: Query all users
    console.log('5️⃣  Query all users...');
    const allUsers = await ops.query({});
    console.log(`   ✅ Found ${allUsers.items.length} users`);
    for (const user of allUsers.items) {
      console.log(`      - ${user.item.email}`);
    }
    console.log('');

    console.log('✅ Smart Insert Demo Complete!');
    console.log('');
    console.log('💡 Summary:');
    console.log('   - smartInsert checks for existing records by unique keys');
    console.log('   - If found: deep merges (like enrich)');
    console.log('   - If not found: creates new record');
    console.log('   - Perfect for imports, ETL, and data synchronization!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    console.log('\n🛑 Shutting down...');
    await udm.admin.shutdown();
    console.log('✅ Complete');
  }
}

runDemo().catch(console.error);

