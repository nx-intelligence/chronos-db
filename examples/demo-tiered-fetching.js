/**
 * Chronos-DB v2.2.0 Demo: Tiered Data Fetching
 * 
 * This demo shows how to use getKnowledge and getMetadata
 * to fetch data across tiers with automatic fallback or merging.
 * 
 * Features demonstrated:
 * - getKnowledge: Fetch from knowledge database tiers
 * - getMetadata: Fetch from metadata database tiers
 * - Fallback mode (merge: false) - Returns first found
 * - Merge mode (merge: true) - Combines all tiers
 * - Deep merging across generic → domain → tenant
 */

const { initChronos } = require('../dist/index.js');
const { join } = require('path');

// Configuration with all three tiers
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
    knowledge: {
      genericDatabase: {
        dbConnRef: 'local-mongo',
        spaceConnRef: 'dummy-storage',
        bucket: 'knowledge-generic',
        dbName: 'chronos_knowledge_generic'
      },
      domainsDatabases: [
        {
          domain: 'production',
          dbConnRef: 'local-mongo',
          spaceConnRef: 'dummy-storage',
          bucket: 'knowledge-domain',
          dbName: 'chronos_knowledge_production'
        }
      ],
      tenantDatabases: [
        {
          tenantId: 'tenant-a',
          dbConnRef: 'local-mongo',
          spaceConnRef: 'dummy-storage',
          bucket: 'knowledge-tenant',
          dbName: 'chronos_knowledge_tenant_a'
        }
      ]
    },
    metadata: {
      genericDatabase: {
        dbConnRef: 'local-mongo',
        spaceConnRef: 'dummy-storage',
        bucket: 'metadata-generic',
        dbName: 'chronos_metadata_generic'
      },
      domainsDatabases: [
        {
          domain: 'production',
          dbConnRef: 'local-mongo',
          spaceConnRef: 'dummy-storage',
          bucket: 'metadata-domain',
          dbName: 'chronos_metadata_production'
        }
      ],
      tenantDatabases: [
        {
          tenantId: 'tenant-a',
          dbConnRef: 'local-mongo',
          spaceConnRef: 'dummy-storage',
          bucket: 'metadata-tenant',
          dbName: 'chronos_metadata_tenant_a'
        }
      ]
    }
  },
  localStorage: {
    enabled: true,
    basePath: join(__dirname, '../test-tiered-demo-data')
  },
  routing: { hashAlgo: 'rendezvous' },
  collectionMaps: {
    'app-config': {
      indexedProps: ['key', 'environment']
    },
    'feature-flags': {
      indexedProps: ['feature', 'enabled']
    }
  }
};

console.log('🚀 Chronos-DB v2.2.0 - Tiered Fetching Demo\n');
console.log('='.repeat(60));

async function runDemo() {
  let chronos;
  
  try {
    // Initialize Chronos-DB
    console.log('\n📦 1. Initializing Chronos-DB...');
    chronos = await initChronos(config);
    console.log('✅ Chronos-DB initialized\n');

    // Set up data in different tiers
    console.log('='.repeat(60));
    console.log('📝 2. Setting up data in different tiers\n');

    // Generic tier data
    const genericOps = chronos.with({
      dbName: 'chronos_knowledge_generic',
      collection: 'app-config',
      databaseType: 'knowledge',
      tier: 'generic'
    });

    await genericOps.create({
      key: 'features',
      maxUploadSize: 10485760,  // 10MB
      features: ['basic', 'standard'],
      settings: { timeout: 30, retries: 3 }
    }, 'setup-system', 'generic tier setup');
    console.log('✅ Created generic tier config');

    // Domain tier data
    const domainOps = chronos.with({
      dbName: 'chronos_knowledge_production',
      collection: 'app-config',
      databaseType: 'knowledge',
      tier: 'domain',
      domain: 'production'
    });

    await domainOps.create({
      key: 'features',
      enableNewFeature: true,
      features: ['advanced', 'analytics'],
      settings: { maxConnections: 100 }
    }, 'setup-system', 'domain tier setup');
    console.log('✅ Created domain tier config');

    // Tenant tier data
    const tenantOps = chronos.with({
      dbName: 'chronos_knowledge_tenant_a',
      collection: 'app-config',
      databaseType: 'knowledge',
      tier: 'tenant',
      tenantId: 'tenant-a'
    });

    await tenantOps.create({
      key: 'features',
      maxUploadSize: 52428800,  // 50MB - override
      features: ['premium', 'priority-support'],
      settings: { timeout: 60 },  // Override
      customTenantField: 'tenant-specific-value'
    }, 'setup-system', 'tenant tier setup');
    console.log('✅ Created tenant tier config\n');

    // Test 3: Fetch with fallback (first found)
    console.log('='.repeat(60));
    console.log('📖 3. Test getKnowledge - Fallback Mode (merge: false)\n');

    const fallbackResult = await chronos.getKnowledge(
      'app-config',
      { key: 'features' },
      {
        tenantId: 'tenant-a',
        domain: 'production',
        merge: false  // Return first found
      }
    );

    console.log('✅ Fallback mode result:');
    console.log('   Tiers found:', fallbackResult.tiersFound);
    console.log('   Data:', JSON.stringify(fallbackResult.data, null, 2));

    // Test 4: Fetch with merge (combine all tiers)
    console.log('\n' + '='.repeat(60));
    console.log('📖 4. Test getKnowledge - Merge Mode (merge: true)\n');

    const mergeResult = await chronos.getKnowledge(
      'app-config',
      { key: 'features' },
      {
        tenantId: 'tenant-a',
        domain: 'production',
        merge: true,  // Merge all tiers
        mergeOptions: { dedupeArrays: true }
      }
    );

    console.log('✅ Merge mode result:');
    console.log('   Tiers found:', mergeResult.tiersFound);
    console.log('   Merged data:', JSON.stringify(mergeResult.data, null, 2));
    console.log('\n   Tier breakdown:');
    if (mergeResult.tierRecords) {
      console.log('   - Generic:', JSON.stringify(mergeResult.tierRecords.generic, null, 2));
      console.log('   - Domain:', JSON.stringify(mergeResult.tierRecords.domain, null, 2));
      console.log('   - Tenant:', JSON.stringify(mergeResult.tierRecords.tenant, null, 2));
    }

    // Test 5: Fetch from tenant that doesn't exist (fallback to domain)
    console.log('\n' + '='.repeat(60));
    console.log('📖 5. Test Tier Fallback - Missing Tenant Data\n');

    const fallbackToDomain = await chronos.getKnowledge(
      'app-config',
      { key: 'non-existent' },  // Doesn't exist in any tier
      {
        tenantId: 'tenant-a',
        domain: 'production',
        merge: false
      }
    );

    console.log('✅ Fallback result for non-existent key:');
    console.log('   Tiers found:', fallbackToDomain.tiersFound);
    console.log('   Data:', fallbackToDomain.data);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 6. Summary\n');
    console.log('✅ Tiered Fetching Demonstrated:');
    console.log('   - Fallback mode: Returns first tier found (tenant → domain → generic)');
    console.log('   - Merge mode: Combines all tiers intelligently');
    console.log('   - Arrays: Unioned without duplicates');
    console.log('   - Objects: Deep merged');
    console.log('   - Tenant values: Override domain and generic');
    console.log('   - Missing data: Graceful fallback handling');

    console.log('\n📈 Merge Results Analysis:');
    console.log('   - maxUploadSize: 52428800 (from tenant, overrides generic)');
    console.log('   - features: [\'basic\', \'standard\', \'advanced\', \'analytics\', \'premium\', \'priority-support\']');
    console.log('     (union from all three tiers)');
    console.log('   - settings: { timeout: 60, retries: 3, maxConnections: 100 }');
    console.log('     (deep merge from all tiers, tenant timeout overrides)');

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

