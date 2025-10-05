/**
 * DigitalOcean Spaces Credential Verification Script
 * 
 * This script tests ONLY the S3 credentials without chronos-db
 * to isolate credential issues from configuration issues
 */

import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

async function testCredentials() {
  console.log('🔐 DigitalOcean Spaces Credential Test');
  console.log('=====================================\n');

  const credentials = {
    accessKeyId: process.env.SPACE_ACCESS_KEY || 'DO801ZZ3F2GRUCX79KA6',
    secretAccessKey: process.env.SPACE_SECRET_KEY || 'nSigDCDabvuWxheaJ8f5o8K6NIhVDRMR8C9kz3xqO/8',
  };

  const s3Client = new S3Client({
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    credentials,
    forcePathStyle: false,
  });

  console.log('📋 Configuration:');
  console.log(`   Endpoint: https://fra1.digitaloceanspaces.com`);
  console.log(`   Region: fra1`);
  console.log(`   Access Key: ${credentials.accessKeyId.substring(0, 8)}...`);
  console.log(`   Secret Key: ${credentials.secretAccessKey.substring(0, 8)}...`);
  console.log('');

  try {
    console.log('🔍 Testing credentials with ListBucketsCommand...');
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    
    console.log('✅ SUCCESS! Credentials are valid');
    console.log(`📦 Found ${response.Buckets?.length || 0} buckets:`);
    
    if (response.Buckets) {
      response.Buckets.forEach(bucket => {
        console.log(`   - ${bucket.Name} (created: ${bucket.CreationDate})`);
      });
    }

    // Check for required buckets
    const requiredBuckets = ['chronos-backups', 'chronos-json', 'chronos-content'];
    const existingBuckets = response.Buckets?.map(b => b.Name) || [];
    
    console.log('\n📋 Required bucket status:');
    requiredBuckets.forEach(bucketName => {
      const exists = existingBuckets.includes(bucketName);
      const icon = exists ? '✅' : '❌';
      console.log(`   ${icon} ${bucketName} ${exists ? '(exists)' : '(missing)'}`);
    });

    const missingBuckets = requiredBuckets.filter(name => !existingBuckets.includes(name));
    if (missingBuckets.length > 0) {
      console.log('\n💡 Next steps:');
      console.log('   1. Create missing buckets in DigitalOcean dashboard');
      console.log('   2. Or use chronos-db auto-creation feature');
      console.log(`   Missing: ${missingBuckets.join(', ')}`);
    }

  } catch (error) {
    console.log('❌ FAILED! Credential issue detected');
    console.log(`   Error: ${error.name}`);
    console.log(`   Message: ${error.message}`);
    
    if (error.$metadata) {
      console.log(`   HTTP Status: ${error.$metadata.httpStatusCode}`);
      console.log(`   Request ID: ${error.$metadata.requestId}`);
    }

    console.log('\n🔍 Troubleshooting:');
    
    if (error.name === 'AccessDenied') {
      console.log('   ❌ Access Denied - Check:');
      console.log('      1. API key has Spaces permissions');
      console.log('      2. API key is not expired');
      console.log('      3. Account is active');
      console.log('      4. Using correct endpoint/region');
    } else if (error.name === 'InvalidAccessKeyId') {
      console.log('   ❌ Invalid Access Key - Check:');
      console.log('      1. Access key is correct');
      console.log('      2. No extra spaces/characters');
      console.log('      3. Key is for Spaces (not Droplets)');
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.log('   ❌ Signature Mismatch - Check:');
      console.log('      1. Secret key is correct');
      console.log('      2. No extra spaces/characters');
      console.log('      3. Keys are properly paired');
    } else {
      console.log('   ❌ Other error - Check:');
      console.log('      1. Network connectivity');
      console.log('      2. DigitalOcean status page');
      console.log('      3. Endpoint URL format');
    }
  }
}

// Run the test
testCredentials().catch(console.error);
