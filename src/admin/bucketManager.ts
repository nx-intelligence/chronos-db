/**
 * Bucket management utilities for S3-compatible storage providers
 * Handles automatic bucket creation, validation, and health checks
 */

import { S3Client, CreateBucketCommand, HeadBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { BridgeRouter } from '../router/router.js';
import type { RouteContext } from '../router/router.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface BucketManagerOptions {
  /** Dry run - don't actually create buckets */
  dryRun?: boolean;
  /** Confirm the operation */
  confirm?: boolean;
  /** Create buckets if they don't exist */
  createIfMissing?: boolean;
  /** Validate bucket permissions */
  validatePermissions?: boolean;
}

export interface BucketStatus {
  /** Bucket name */
  name: string;
  /** Whether bucket exists */
  exists: boolean;
  /** Whether bucket is accessible */
  accessible: boolean;
  /** Error message if bucket is not accessible */
  error?: string;
  /** Whether bucket was created during this operation */
  created?: boolean;
}

export interface BucketManagerResult {
  /** Collection name */
  collection: string;
  /** Number of buckets checked */
  bucketsChecked: number;
  /** Number of buckets created */
  bucketsCreated: number;
  /** Bucket status details */
  bucketStatuses: BucketStatus[];
  /** Whether this was a dry run */
  dryRun: boolean;
  /** When the operation was performed */
  processedAt: Date;
}

// ============================================================================
// Bucket Management Functions
// ============================================================================

/**
 * Check and create required buckets for a collection
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param opts - Bucket manager options
 * @returns Bucket manager result
 */
export async function ensureBucketsExist(
  router: BridgeRouter,
  ctx: RouteContext,
  opts: BucketManagerOptions = {}
): Promise<BucketManagerResult> {
  if (!opts.confirm && !opts.dryRun) {
    throw new Error('Bucket management operation requires explicit confirmation or dry run');
  }

  const routeInfo = router.getRouteInfo(ctx);
  const s3Client = router.getS3(routeInfo.index);
  const spaces = router.getSpaces(routeInfo.index);
  
  if (!s3Client || !spaces) {
    throw new Error('S3 client or spaces configuration not available');
  }

  // Ensure we have a proper SpacesConnConfig with all required properties
  const spacesConfig = spaces as any; // Type assertion for SpacesConnConfig
  if (!spacesConfig.endpoint || !spacesConfig.region) {
    throw new Error('Invalid spaces configuration - missing endpoint or region');
  }

  const requiredBuckets = [
    { name: spaces.jsonBucket, purpose: 'JSON documents' },
    { name: spaces.contentBucket, purpose: 'Binary content' },
    { name: spaces.backupsBucket, purpose: 'Backups and manifests' },
  ];

  let bucketsChecked = 0;
  let bucketsCreated = 0;
  const bucketStatuses: BucketStatus[] = [];

  logger.debug('Starting bucket management', {
    collection: ctx.collection,
    requiredBuckets: requiredBuckets.map(b => b.name),
    dryRun: opts.dryRun || false,
    createIfMissing: opts.createIfMissing || false
  });

  for (const bucket of requiredBuckets) {
    bucketsChecked++;
    const status = await checkBucketStatus(s3Client, bucket.name, opts);
    bucketStatuses.push(status);

    if (!status.exists && opts.createIfMissing && !opts.dryRun) {
        try {
          await createBucket(s3Client, bucket.name, spacesConfig.region);
          status.created = true;
          status.exists = true;
          status.accessible = true;
          bucketsCreated++;
          
          logger.info('Created bucket', {
            bucketName: bucket.name,
            purpose: bucket.purpose,
            region: spacesConfig.region
          });
      } catch (error) {
        status.error = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to create bucket', {
          bucketName: bucket.name,
          error: status.error
        });
      }
    }
  }

  const result: BucketManagerResult = {
    collection: ctx.collection,
    bucketsChecked,
    bucketsCreated,
    bucketStatuses,
    dryRun: opts.dryRun || false,
    processedAt: new Date(),
  };

  logger.info('Bucket management completed', {
    collection: ctx.collection,
    bucketsChecked,
    bucketsCreated,
    dryRun: opts.dryRun || false
  });

  return result;
}

/**
 * Check the status of a specific bucket
 * @param s3Client - S3 client instance
 * @param bucketName - Bucket name to check
 * @param opts - Options for validation
 * @returns Bucket status
 */
async function checkBucketStatus(
  s3Client: S3Client,
  bucketName: string,
  _opts: BucketManagerOptions
): Promise<BucketStatus> {
  const status: BucketStatus = {
    name: bucketName,
    exists: false,
    accessible: false,
  };

  try {
    // Check if bucket exists and is accessible
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    status.exists = true;
    status.accessible = true;
    
    logger.debug('Bucket exists and is accessible', { bucketName });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchBucket') {
        status.exists = false;
        status.error = 'Bucket does not exist';
        logger.debug('Bucket does not exist', { bucketName });
      } else if (error.name === 'AccessDenied') {
        status.exists = true; // Bucket exists but we can't access it
        status.accessible = false;
        status.error = 'Access denied - check permissions';
        logger.warn('Bucket access denied', { bucketName });
      } else {
        status.exists = false;
        status.accessible = false;
        status.error = error.message;
        logger.error('Error checking bucket', { bucketName, error: error.message });
      }
    } else {
      status.exists = false;
      status.accessible = false;
      status.error = 'Unknown error';
      logger.error('Unknown error checking bucket', { bucketName });
    }
  }

  return status;
}

/**
 * Create a bucket
 * @param s3Client - S3 client instance
 * @param bucketName - Bucket name to create
 * @param region - AWS region
 */
async function createBucket(s3Client: S3Client, bucketName: string, region: string): Promise<void> {
  try {
    const command = new CreateBucketCommand({
      Bucket: bucketName,
      ...(region !== 'us-east-1' && { 
        CreateBucketConfiguration: { 
          LocationConstraint: region as any // Type assertion for DigitalOcean regions
        } 
      }),
    });
    
    await s3Client.send(command);
    logger.info('Successfully created bucket', { bucketName, region });
  } catch (error) {
    logger.error('Failed to create bucket', { bucketName, region, error });
    throw error;
  }
}

/**
 * Test S3 connectivity and list available buckets
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @returns List of available buckets
 */
export async function testS3Connectivity(
  router: BridgeRouter,
  ctx: RouteContext
): Promise<{ success: boolean; buckets: string[]; error?: string }> {
  try {
    const routeInfo = router.getRouteInfo(ctx);
    const s3Client = router.getS3(routeInfo.index);
    
    if (!s3Client) {
      return { success: false, buckets: [], error: 'S3 client not available' };
    }

    const command = new ListBucketsCommand({});
    const result = await s3Client.send(command);
    
    const buckets = result.Buckets?.map(bucket => bucket.Name || '').filter(Boolean) || [];
    
    logger.info('S3 connectivity test successful', {
      collection: ctx.collection,
      bucketsFound: buckets.length
    });

    return { success: true, buckets };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('S3 connectivity test failed', {
      collection: ctx.collection,
      error: errorMessage
    });

    return { success: false, buckets: [], error: errorMessage };
  }
}

/**
 * Validate S3 configuration for DigitalOcean Spaces
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @returns Validation result
 */
export async function validateSpacesConfiguration(
  router: BridgeRouter,
  ctx: RouteContext
): Promise<{
  valid: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];

  try {
    const routeInfo = router.getRouteInfo(ctx);
    const spaces = router.getSpaces(routeInfo.index);
    
    if (!spaces) {
      issues.push('Spaces configuration not available');
      return { valid: false, issues, recommendations };
    }

    // Check if we have a proper SpacesConnConfig
    const spacesConfig = spaces as any; // Type assertion for SpacesConnConfig
    if (!spacesConfig.endpoint || !spacesConfig.region) {
      issues.push('Invalid spaces configuration - missing endpoint or region');
      return { valid: false, issues, recommendations };
    }

    // Check endpoint format
    if (!spacesConfig.endpoint.includes('digitaloceanspaces.com')) {
      issues.push('Endpoint does not appear to be DigitalOcean Spaces');
      recommendations.push('Use endpoint format: https://<region>.digitaloceanspaces.com');
    }

    // Check region consistency
    const endpointRegion = spacesConfig.endpoint.match(/https:\/\/([^.]+)\.digitaloceanspaces\.com/)?.[1];
    if (endpointRegion && endpointRegion !== spacesConfig.region) {
      issues.push(`Region mismatch: endpoint uses '${endpointRegion}' but config specifies '${spacesConfig.region}'`);
      recommendations.push('Ensure region matches the endpoint region');
    }

    // Check forcePathStyle setting
    if (spacesConfig.forcePathStyle === true) {
      recommendations.push('Consider using forcePathStyle: false for DigitalOcean Spaces (virtual-hosted style)');
    }

    // Test connectivity
    const connectivityTest = await testS3Connectivity(router, ctx);
    if (!connectivityTest.success) {
      issues.push(`S3 connectivity failed: ${connectivityTest.error}`);
      recommendations.push('Check credentials and network connectivity');
    }

    // Check required buckets
    const bucketTest = await ensureBucketsExist(router, ctx, { 
      dryRun: true, 
      confirm: true,
      createIfMissing: false 
    });
    
    const missingBuckets = bucketTest.bucketStatuses.filter(s => !s.exists);
    if (missingBuckets.length > 0) {
      issues.push(`Missing buckets: ${missingBuckets.map(b => b.name).join(', ')}`);
      recommendations.push('Create missing buckets or enable auto-creation');
    }

    const valid = issues.length === 0;
    
    logger.info('Spaces configuration validation completed', {
      collection: ctx.collection,
      valid,
      issuesCount: issues.length,
      recommendationsCount: recommendations.length
    });

    return { valid, issues, recommendations };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    issues.push(`Validation error: ${errorMessage}`);
    
    logger.error('Spaces configuration validation failed', {
      collection: ctx.collection,
      error: errorMessage
    });

    return { valid: false, issues, recommendations };
  }
}
