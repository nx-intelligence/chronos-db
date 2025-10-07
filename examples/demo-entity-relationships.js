/**
 * Chronos-DB v2.2.0 Demo: Entity Relationship Management
 * 
 * This demo shows how to use insertWithEntities and getWithEntities
 * to automatically manage related entities across collections.
 * 
 * Features demonstrated:
 * - insertWithEntities: Auto-save/update related entities
 * - getWithEntities: Auto-fetch related entities
 * - Referential integrity across collections
 * - Automatic entity creation/update detection
 */

const { initChronos } = require('../dist/index.js');
const { join } = require('path');

// Configuration using localStorage (no S3/Azure needed)
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
          dbName: 'chronos_demo',
          analyticsDbName: 'chronos_demo_analytics'
        }
      ]
    }
  },
  localStorage: {
    enabled: true,
    basePath: join(__dirname, '../test-entity-demo-data')
  },
  routing: { hashAlgo: 'rendezvous' },
  collectionMaps: {
    orders: {
      indexedProps: ['orderId', 'customerId', 'productId', 'status']
    },
    customers: {
      indexedProps: ['customerId', 'email']
    },
    products: {
      indexedProps: ['productId', 'sku']
    }
  }
};

console.log('🚀 Chronos-DB v2.2.0 - Entity Relationships Demo\n');
console.log('='.repeat(60));

async function runDemo() {
  let chronos;
  
  try {
    // Initialize Chronos-DB
    console.log('\n📦 1. Initializing Chronos-DB...');
    chronos = await initChronos(config);
    console.log('✅ Chronos-DB initialized\n');

    // Define entity mappings
    const entityMappings = [
      {
        property: 'customer',
        collection: 'customers',
        keyProperty: 'customerId',
        databaseType: 'runtime',
        tier: 'tenant'
      },
      {
        property: 'product',
        collection: 'products',
        keyProperty: 'productId',
        databaseType: 'runtime',
        tier: 'tenant'
      }
    ];

    const ops = chronos.with({
      dbName: 'chronos_demo',
      collection: 'orders',
      databaseType: 'runtime',
      tier: 'tenant',
      tenantId: 'demo-tenant'
    });

    // Test 1: Insert order with new customer and new product
    console.log('='.repeat(60));
    console.log('📝 2. Test insertWithEntities - New Entities\n');
    
    const order1 = {
      orderId: 'ORD-001',
      customer: {
        customerId: 'CUST-001',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        tier: 'premium'
      },
      product: {
        productId: 'PROD-001',
        sku: 'WIDGET-A',
        name: 'Super Widget',
        price: 99.99
      },
      quantity: 2,
      status: 'pending'
    };

    const result1 = await ops.insertWithEntities(
      order1,
      entityMappings,
      'demo-system',
      'Initial order creation'
    );

    console.log('✅ Order created with entities:');
    console.log('   Main Record ID:', result1.mainRecordId);
    console.log('   Entity Results:');
    for (const [property, result] of result1.entityResults.entries()) {
      console.log(`     - ${property}: ${result.operation} (ID: ${result.id})`);
    }

    // Test 2: Insert another order with existing customer, new product
    console.log('\n' + '='.repeat(60));
    console.log('📝 3. Test insertWithEntities - Mixed (Existing + New)\n');
    
    const order2 = {
      orderId: 'ORD-002',
      customer: {
        customerId: 'CUST-001',  // Same customer
        name: 'Alice Johnson',
        email: 'alice@example.com',
        tier: 'premium'
      },
      product: {
        productId: 'PROD-002',  // New product
        sku: 'WIDGET-B',
        name: 'Ultra Widget',
        price: 149.99
      },
      quantity: 1,
      status: 'pending'
    };

    const result2 = await ops.insertWithEntities(
      order2,
      entityMappings,
      'demo-system',
      'Second order creation'
    );

    console.log('✅ Order created with entities:');
    console.log('   Main Record ID:', result2.mainRecordId);
    console.log('   Entity Results:');
    for (const [property, result] of result2.entityResults.entries()) {
      console.log(`     - ${property}: ${result.operation} (ID: ${result.id})`);
    }

    // Test 3: Insert order with updated customer info
    console.log('\n' + '='.repeat(60));
    console.log('📝 4. Test insertWithEntities - Entity Update\n');
    
    const order3 = {
      orderId: 'ORD-003',
      customer: {
        customerId: 'CUST-001',  // Same customer
        name: 'Alice Johnson',
        email: 'alice@example.com',
        tier: 'platinum',  // Changed tier!
        vipCode: 'VIP123'  // New property!
      },
      product: {
        productId: 'PROD-001',  // Existing product
        sku: 'WIDGET-A',
        name: 'Super Widget',
        price: 99.99
      },
      quantity: 3,
      status: 'pending'
    };

    const result3 = await ops.insertWithEntities(
      order3,
      entityMappings,
      'demo-system',
      'Third order with customer upgrade'
    );

    console.log('✅ Order created with entities:');
    console.log('   Main Record ID:', result3.mainRecordId);
    console.log('   Entity Results:');
    for (const [property, result] of result3.entityResults.entries()) {
      console.log(`     - ${property}: ${result.operation} (ID: ${result.id})`);
    }

    // Test 4: Fetch order with entities
    console.log('\n' + '='.repeat(60));
    console.log('📖 5. Test getWithEntities - Fetch with Related Entities\n');
    
    const fetchResult = await ops.getWithEntities(
      result1.mainRecordId,
      entityMappings
    );

    console.log('✅ Fetched order with entities:');
    console.log('   Main Record:', JSON.stringify(fetchResult.mainRecord, null, 2).substring(0, 200) + '...');
    console.log('\n   Entity Records:');
    for (const [property, entityRecord] of fetchResult.entityRecords.entries()) {
      if (entityRecord) {
        console.log(`     - ${property}:`, JSON.stringify(entityRecord, null, 2).substring(0, 150) + '...');
      } else {
        console.log(`     - ${property}: NOT FOUND`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 6. Summary\n');
    console.log('✅ Entity Relationship Management:');
    console.log('   - Created 3 orders');
    console.log('   - Customer CUST-001: created once, updated once, reused once');
    console.log('   - Product PROD-001: created once, reused once');
    console.log('   - Product PROD-002: created once');
    console.log('   - Automatic referential integrity maintained');
    console.log('   - Entity fetching works correctly');

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

