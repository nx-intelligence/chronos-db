import { MongoClient } from 'mongodb';

/**
 * Check if MongoDB instance supports transactions (replica set or mongos)
 * @param uri - MongoDB connection URI
 * @returns Promise<boolean> - true if transactions are supported
 */
export async function isReplicaSetAvailable(uri: string): Promise<boolean> {
  let client: MongoClient | null = null;
  
  try {
    client = new MongoClient(uri);
    await client.connect();
    
    const admin = client.db().admin();
    
    try {
      // Try to get replica set status
      const status = await admin.replSetGetStatus();
      
      // Check if we have a valid replica set with members
      return status && 
             status.members && 
             Array.isArray(status.members) && 
             status.members.length > 0;
    } catch (replError: any) {
      // replSetGetStatus fails on standalone MongoDB
      // Check error message to confirm it's a standalone instance
      const errorMessage = replError?.message || '';
      
      if (errorMessage.includes('not running with --replSet') ||
          errorMessage.includes('not running with replica set') ||
          errorMessage.includes('not a replica set')) {
        return false; // Confirmed standalone MongoDB
      }
      
      // For other errors, assume standalone (safer default)
      return false;
    }
  } catch (error) {
    // Connection error or other issues - assume standalone (safer default)
    return false;
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Check if transactions should be used based on configuration and MongoDB support
 * @param config - Transaction configuration
 * @param mongoUri - MongoDB connection URI
 * @returns Promise<boolean> - true if transactions should be used
 */
export async function shouldUseTransactions(
  config: { enabled?: boolean; autoDetect?: boolean },
  mongoUri: string
): Promise<boolean> {
  // If transactions are explicitly disabled, don't use them
  if (config.enabled === false) {
    return false;
  }
  
  // If auto-detect is disabled and transactions are enabled, use them
  if (config.autoDetect === false && config.enabled === true) {
    return true;
  }
  
  // If auto-detect is enabled (default), check if MongoDB supports transactions
  if (config.autoDetect !== false) {
    const hasReplicaSet = await isReplicaSetAvailable(mongoUri);
    
    // Only use transactions if MongoDB supports them
    return hasReplicaSet;
  }
  
  // Default to enabled if explicitly set
  return config.enabled === true;
}
