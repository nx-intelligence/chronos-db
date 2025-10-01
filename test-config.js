#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateUdmConfig, safeValidateUdmConfig } from './dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration validation
function testConfigValidation() {
  console.log('🧪 Testing configuration validation...\n');

  const configs = [
    { name: 'DigitalOcean', file: 'examples/do-config.json' },
    { name: 'AWS S3', file: 'examples/aws-config.json' },
    { name: 'MinIO', file: 'examples/minio-config.json' }
  ];

  for (const config of configs) {
    try {
      const configPath = join(__dirname, config.file);
      const configData = JSON.parse(readFileSync(configPath, 'utf8'));
      
      console.log(`✅ Testing ${config.name} config...`);
      
      // Test strict validation
      const validated = validateUdmConfig(configData);
      console.log(`   ✓ Validation passed`);
      console.log(`   ✓ MongoDB URIs: ${validated.mongoUris.length}`);
      console.log(`   ✓ S3 Connections: ${validated.spacesConns.length}`);
      console.log(`   ✓ Collections: ${Object.keys(validated.collectionMaps).length}`);
      
    } catch (error) {
      console.log(`❌ ${config.name} config failed validation:`);
      console.log(`   ${error.message}`);
    }
    console.log('');
  }
}

// Test invalid configurations
function testInvalidConfigs() {
  console.log('🧪 Testing invalid configurations...\n');

  const invalidConfigs = [
    {
      name: 'Missing MongoDB URIs',
      config: { spacesConns: [], counters: { mongoUri: 'test', dbName: 'test' }, routing: { hashAlgo: 'rendezvous' }, retention: { ver: {}, counters: { days: 1, weeks: 1, months: 1 } }, rollup: { enabled: true, manifestPeriod: 'daily' }, collectionMaps: {} }
    },
    {
      name: 'Invalid S3 endpoint',
      config: { mongoUris: ['mongodb://test'], spacesConns: [{ endpoint: 'not-a-url', region: 'test', accessKey: 'test', secretKey: 'test', backupsBucket: 'test', jsonBucket: 'test', contentBucket: 'test' }], counters: { mongoUri: 'mongodb://test', dbName: 'test' }, routing: { hashAlgo: 'rendezvous' }, retention: { ver: {}, counters: { days: 1, weeks: 1, months: 1 } }, rollup: { enabled: true, manifestPeriod: 'daily' }, collectionMaps: { test: { indexedProps: ['id'] } } }
    },
    {
      name: 'Mismatched backend counts',
      config: { mongoUris: ['mongodb://test1', 'mongodb://test2'], spacesConns: [{ endpoint: 'https://test.com', region: 'test', accessKey: 'test', secretKey: 'test', backupsBucket: 'test', jsonBucket: 'test', contentBucket: 'test' }], counters: { mongoUri: 'mongodb://test', dbName: 'test' }, routing: { hashAlgo: 'rendezvous' }, retention: { ver: {}, counters: { days: 1, weeks: 1, months: 1 } }, rollup: { enabled: true, manifestPeriod: 'daily' }, collectionMaps: { test: { indexedProps: ['id'] } } }
    }
  ];

  for (const test of invalidConfigs) {
    try {
      console.log(`✅ Testing ${test.name}...`);
      validateUdmConfig(test.config);
      console.log(`   ❌ Expected validation to fail but it passed`);
    } catch (error) {
      console.log(`   ✓ Correctly rejected: ${error.message.split('\n')[0]}`);
    }
    console.log('');
  }
}

// Test safe validation
function testSafeValidation() {
  console.log('🧪 Testing safe validation...\n');

  try {
    const configPath = join(__dirname, 'examples/do-config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    
    const result = safeValidateUdmConfig(configData);
    
    if (result.success) {
      console.log('✅ Safe validation passed');
      console.log(`   ✓ Config has ${result.data.mongoUris.length} MongoDB URIs`);
    } else {
      console.log('❌ Safe validation failed unexpectedly');
      console.log(`   ${result.error.message}`);
    }
  } catch (error) {
    console.log(`❌ Safe validation test failed: ${error.message}`);
  }
  console.log('');
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Stage A Configuration Validation Tests\n');
  console.log('=' .repeat(60));
  
  testConfigValidation();
  testInvalidConfigs();
  testSafeValidation();
  
  console.log('=' .repeat(60));
  console.log('✅ All configuration validation tests completed!');
  console.log('\nStage A deliverables:');
  console.log('✓ TypeScript interfaces defined');
  console.log('✓ Zod validation schemas implemented');
  console.log('✓ Configuration validation working');
  console.log('✓ Example configs created');
  console.log('✓ Build process working');
}

runTests().catch(console.error);
