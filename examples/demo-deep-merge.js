/**
 * Chronos-DB v2.2.0 Demo: Deep Merge Utility
 * 
 * This demo shows how the deep merge utility works for combining
 * record data from multiple sources/tiers.
 * 
 * Features demonstrated:
 * - Deep object merging
 * - Array union with deduplication
 * - Nested property merging
 * - Priority-based overriding
 */

const { deepMergeRecords } = require('../dist/index.js');

console.log('🚀 Chronos-DB v2.2.0 - Deep Merge Utility Demo\n');
console.log('='.repeat(60));

function runDemo() {
  try {
    // Test 1: Basic object merging
    console.log('\n📝 1. Basic Object Merging\n');
    
    const base = {
      name: 'Default Product',
      price: 99.99,
      category: 'electronics'
    };

    const override = {
      price: 79.99,  // Override
      discount: 20,  // Add new field
      category: 'electronics'  // Same value
    };

    const result1 = deepMergeRecords(base, override);
    console.log('Base:', JSON.stringify(base, null, 2));
    console.log('Override:', JSON.stringify(override, null, 2));
    console.log('Result:', JSON.stringify(result1, null, 2));

    // Test 2: Array union
    console.log('\n' + '='.repeat(60));
    console.log('📝 2. Array Union with Deduplication\n');

    const target = {
      tags: ['javascript', 'typescript', 'node'],
      categories: [1, 2, 3]
    };

    const source = {
      tags: ['typescript', 'react', 'mongodb'],  // 'typescript' is duplicate
      categories: [3, 4, 5]  // '3' is duplicate
    };

    const result2 = deepMergeRecords(target, source);
    console.log('Target:', JSON.stringify(target, null, 2));
    console.log('Source:', JSON.stringify(source, null, 2));
    console.log('Result:', JSON.stringify(result2, null, 2));
    console.log('   ✓ Arrays unioned without duplicates');

    // Test 3: Deep nested merging
    console.log('\n' + '='.repeat(60));
    console.log('📝 3. Deep Nested Object Merging\n');

    const nested1 = {
      user: {
        name: 'John',
        profile: {
          age: 30,
          city: 'NYC'
        },
        preferences: {
          theme: 'light',
          notifications: true
        }
      },
      settings: {
        language: 'en'
      }
    };

    const nested2 = {
      user: {
        email: 'john@example.com',  // Add new field
        profile: {
          age: 31,  // Override
          country: 'USA'  // Add new field
        },
        preferences: {
          theme: 'dark'  // Override
        }
      },
      settings: {
        timezone: 'America/New_York'  // Add new field
      }
    };

    const result3 = deepMergeRecords(nested1, nested2);
    console.log('Nested 1:', JSON.stringify(nested1, null, 2));
    console.log('\nNested 2:', JSON.stringify(nested2, null, 2));
    console.log('\nResult:', JSON.stringify(result3, null, 2));
    console.log('   ✓ Deep merge preserves all nested properties');
    console.log('   ✓ Source values override target values');

    // Test 4: Tiered merging (generic → domain → tenant)
    console.log('\n' + '='.repeat(60));
    console.log('📝 4. Tiered Merging (Generic → Domain → Tenant)\n');

    const generic = {
      theme: 'light',
      features: ['basic', 'standard'],
      limits: { storage: 1000, users: 10 },
      settings: { timeout: 30 }
    };

    const domain = {
      features: ['advanced', 'analytics'],
      limits: { apiCalls: 10000 },
      settings: { retries: 5 }
    };

    const tenant = {
      theme: 'dark',  // Override
      features: ['premium', 'priority'],
      limits: { storage: 50000 },  // Override
      settings: { timeout: 60 },  // Override
      customField: 'tenant-value'
    };

    // Merge step by step
    let tieredResult = deepMergeRecords(generic, domain);
    console.log('After generic + domain:', JSON.stringify(tieredResult, null, 2));
    
    tieredResult = deepMergeRecords(tieredResult, tenant);
    console.log('\nFinal (after adding tenant):', JSON.stringify(tieredResult, null, 2));

    console.log('\n   ✓ theme: \'dark\' (from tenant, overrides generic)');
    console.log('   ✓ features: [\'basic\', \'standard\', \'advanced\', \'analytics\', \'premium\', \'priority\']');
    console.log('     (union from all three tiers)');
    console.log('   ✓ limits: { storage: 50000, users: 10, apiCalls: 10000 }');
    console.log('     (tenant storage overrides, others merged)');
    console.log('   ✓ settings: { timeout: 60, retries: 5 }');
    console.log('     (tenant timeout overrides, domain retries added)');

    // Test 5: Null/undefined handling
    console.log('\n' + '='.repeat(60));
    console.log('📝 5. Null/Undefined Handling\n');

    const withNull = deepMergeRecords(
      { a: 1, b: 2 },
      null
    );
    console.log('Merge with null:', withNull);

    const withUndefined = deepMergeRecords(
      null,
      { x: 1, y: 2 }
    );
    console.log('Merge from undefined:', withUndefined);

    const bothNull = deepMergeRecords(null, null);
    console.log('Both null:', bothNull);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 6. Summary\n');
    console.log('✅ Deep Merge Utility Features:');
    console.log('   ✓ Deep object merging');
    console.log('   ✓ Array union with deduplication');
    console.log('   ✓ Nested property handling');
    console.log('   ✓ Priority-based overriding');
    console.log('   ✓ Null/undefined safety');
    console.log('   ✓ Perfect for tiered configuration merging');

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

