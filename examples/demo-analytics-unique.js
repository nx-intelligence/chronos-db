/**
 * Chronos-DB v2.2.0 Demo: Enhanced Analytics with Unique Counting
 * 
 * This demo shows the new unique counting feature that creates
 * one row per unique value for sophisticated analytics.
 * 
 * Features demonstrated:
 * - Counter rules with countUnique
 * - One row per unique value tracking
 * - Real-time analytics updates
 * - Business intelligence queries
 */

const { initChronos } = require('../dist/index.js');
const { join } = require('path');

// Configuration with analytics
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
          tenantId: 'analytics-demo',
          dbConnRef: 'local-mongo',
          spaceConnRef: 'dummy-storage',
          bucket: 'analytics-bucket',
          dbName: 'chronos_runtime_analytics',
          analyticsDbName: 'chronos_analytics_demo'
        }
      ]
    }
  },
  localStorage: {
    enabled: true,
    basePath: join(__dirname, '../test-analytics-demo-data')
  },
  routing: { hashAlgo: 'rendezvous' },
  collectionMaps: {
    events: {
      indexedProps: ['userId', 'sessionId', 'productId', 'action', 'timestamp']
    }
  },
  analytics: {
    counterRules: [
      {
        name: 'user_logins',
        on: ['CREATE'],
        scope: 'meta',
        when: { action: 'login' },
        countUnique: ['userId', 'sessionId']
      },
      {
        name: 'product_views',
        on: ['CREATE'],
        scope: 'meta',
        when: { action: 'view' },
        countUnique: ['productId', 'userId']
      },
      {
        name: 'purchases',
        on: ['CREATE'],
        scope: 'meta',
        when: { action: 'purchase' },
        countUnique: ['userId', 'productId']
      }
    ]
  }
};

console.log('🚀 Chronos-DB v2.2.0 - Enhanced Analytics Demo\n');
console.log('='.repeat(60));

async function runDemo() {
  let chronos;
  
  try {
    // Initialize Chronos-DB
    console.log('\n📦 1. Initializing Chronos-DB with Analytics...');
    chronos = await initChronos(config);
    console.log('✅ Chronos-DB initialized\n');

    const ops = chronos.with({
      dbName: 'chronos_runtime_analytics',
      collection: 'events',
      databaseType: 'runtime',
      tier: 'tenant',
      tenantId: 'analytics-demo'
    });

    // Test 1: Create login events
    console.log('='.repeat(60));
    console.log('📝 2. Creating Login Events\n');

    const loginEvents = [
      { userId: 'user-1', sessionId: 'session-a', action: 'login', timestamp: new Date() },
      { userId: 'user-1', sessionId: 'session-b', action: 'login', timestamp: new Date() },
      { userId: 'user-2', sessionId: 'session-c', action: 'login', timestamp: new Date() },
      { userId: 'user-3', sessionId: 'session-d', action: 'login', timestamp: new Date() },
      { userId: 'user-1', sessionId: 'session-a', action: 'login', timestamp: new Date() },  // Duplicate
    ];

    for (const event of loginEvents) {
      await ops.create(event, 'event-system', 'user login');
    }
    console.log(`✅ Created ${loginEvents.length} login events`);

    // Test 2: Create product view events
    console.log('\n' + '='.repeat(60));
    console.log('📝 3. Creating Product View Events\n');

    const viewEvents = [
      { userId: 'user-1', productId: 'prod-100', action: 'view', timestamp: new Date() },
      { userId: 'user-1', productId: 'prod-101', action: 'view', timestamp: new Date() },
      { userId: 'user-2', productId: 'prod-100', action: 'view', timestamp: new Date() },
      { userId: 'user-3', productId: 'prod-102', action: 'view', timestamp: new Date() },
      { userId: 'user-1', productId: 'prod-100', action: 'view', timestamp: new Date() },  // Duplicate
    ];

    for (const event of viewEvents) {
      await ops.create(event, 'event-system', 'product view');
    }
    console.log(`✅ Created ${viewEvents.length} view events`);

    // Test 3: Create purchase events
    console.log('\n' + '='.repeat(60));
    console.log('📝 4. Creating Purchase Events\n');

    const purchaseEvents = [
      { userId: 'user-1', productId: 'prod-100', action: 'purchase', amount: 99.99, timestamp: new Date() },
      { userId: 'user-2', productId: 'prod-101', action: 'purchase', amount: 149.99, timestamp: new Date() },
      { userId: 'user-3', productId: 'prod-100', action: 'purchase', amount: 99.99, timestamp: new Date() },
    ];

    for (const event of purchaseEvents) {
      await ops.create(event, 'event-system', 'purchase');
    }
    console.log(`✅ Created ${purchaseEvents.length} purchase events\n`);

    // Test 4: Get total analytics
    console.log('='.repeat(60));
    console.log('📊 5. Fetching Analytics Totals\n');

    const totals = await chronos.counters.getTotals({
      dbName: 'chronos_runtime_analytics',
      collection: 'events',
      tenant: 'analytics-demo'
    });

    console.log('✅ Analytics Totals:');
    console.log(JSON.stringify(totals, null, 2));

    // Test 5: Get unique analytics for user logins
    console.log('\n' + '='.repeat(60));
    console.log('📊 6. Fetching Unique Analytics - User Logins\n');

    const uniqueUsers = await chronos.counters.getUniqueAnalytics({
      dbName: 'chronos_runtime_analytics',
      collection: 'events',
      tenant: 'analytics-demo',
      ruleName: 'user_logins',
      propertyName: 'userId',
      limit: 100
    });

    console.log(`✅ Found ${uniqueUsers.length} unique users who logged in:`);
    uniqueUsers.forEach(doc => {
      console.log(`   - User ${doc.propertyValue}: ${doc.created} logins`);
    });

    const uniqueSessions = await chronos.counters.getUniqueAnalytics({
      dbName: 'chronos_runtime_analytics',
      collection: 'events',
      tenant: 'analytics-demo',
      ruleName: 'user_logins',
      propertyName: 'sessionId',
      limit: 100
    });

    console.log(`\n✅ Found ${uniqueSessions.length} unique sessions:`);
    uniqueSessions.forEach(doc => {
      console.log(`   - Session ${doc.propertyValue}: ${doc.created} occurrences`);
    });

    // Test 6: Get unique analytics for product views
    console.log('\n' + '='.repeat(60));
    console.log('📊 7. Fetching Unique Analytics - Product Views\n');

    const uniqueProducts = await chronos.counters.getUniqueAnalytics({
      dbName: 'chronos_runtime_analytics',
      collection: 'events',
      tenant: 'analytics-demo',
      ruleName: 'product_views',
      propertyName: 'productId',
      limit: 100
    });

    console.log(`✅ Found ${uniqueProducts.length} unique products viewed:`);
    uniqueProducts.forEach(doc => {
      console.log(`   - Product ${doc.propertyValue}: ${doc.created} views`);
    });

    // Test 7: Get unique analytics for purchases
    console.log('\n' + '='.repeat(60));
    console.log('📊 8. Fetching Unique Analytics - Purchases\n');

    const uniquePurchases = await chronos.counters.getUniqueAnalytics({
      dbName: 'chronos_runtime_analytics',
      collection: 'events',
      tenant: 'analytics-demo',
      ruleName: 'purchases',
      limit: 100
    });

    console.log(`✅ Found ${uniquePurchases.length} unique purchase combinations:`);
    uniquePurchases.forEach(doc => {
      console.log(`   - ${doc.propertyName}=${doc.propertyValue}: ${doc.created} purchases`);
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 9. Analytics Summary\n');
    console.log('✅ Enhanced Analytics Demonstrated:');
    console.log(`   - Total events created: ${totals.created}`);
    console.log(`   - Unique users (logins): ${uniqueUsers.length}`);
    console.log(`   - Unique sessions: ${uniqueSessions.length}`);
    console.log(`   - Unique products viewed: ${uniqueProducts.length}`);
    console.log(`   - Total purchase records: ${uniquePurchases.length}`);

    console.log('\n✨ Key Features:');
    console.log('   ✓ One row per unique value (not just counts)');
    console.log('   ✓ Track multiple properties simultaneously');
    console.log('   ✓ Conditional counting with "when" rules');
    console.log('   ✓ Real-time updates with every operation');

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
