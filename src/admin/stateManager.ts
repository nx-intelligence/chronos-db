/**
 * State management utilities for _system state transitions
 */

import { ObjectId } from 'mongodb';
import { BridgeRouter } from '../router/router.js';
import { Repos } from '../db/repos.js';
import type { RouteContext } from '../config.js';
import { 
  markAsProcessed, 
  shouldMarkAsProcessed, 
  isProcessed,
  type SystemHeader 
} from '../meta/systemFields.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface StateTransitionOptions {
  /** Dry run - don't actually update state */
  dryRun?: boolean;
  /** Confirm the operation */
  confirm?: boolean;
  /** Maximum number of items to process */
  maxItems?: number;
}

export interface StateTransitionResult {
  /** Collection name */
  collection: string;
  /** Number of items processed */
  itemsProcessed: number;
  /** Number of items marked as processed */
  itemsMarkedAsProcessed: number;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** When the operation was performed */
  processedAt: Date;
}

// ============================================================================
// State Transition Functions
// ============================================================================

/**
 * Mark items as processed based on TTL expiration
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param ttlHours - TTL in hours
 * @param opts - State transition options
 * @returns State transition result
 */
export async function markItemsAsProcessedByTTL(
  router: BridgeRouter,
  ctx: RouteContext,
  ttlHours: number,
  opts: StateTransitionOptions = {}
): Promise<StateTransitionResult> {
  if (!opts.confirm) {
    throw new Error('State transition operation requires explicit confirmation');
  }

  const routeInfo = router.route(ctx);
  const mongoClient = await router.getMongoClient(routeInfo.mongoUri);
  const mongo = mongoClient.db(ctx.dbName);
  
  if (!mongo) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const now = new Date();

  // Get all head documents
  const heads = await repos.getAllHeads();
  
  let itemsProcessed = 0;
  let itemsMarkedAsProcessed = 0;
  const maxItems = opts.maxItems || heads.length;

  logger.debug('Starting state transition by TTL', {
    collection: ctx.collection,
    ttlHours,
    totalHeads: heads.length,
    maxItems,
    dryRun: opts.dryRun || false
  });

  for (const head of heads.slice(0, maxItems)) {
    itemsProcessed++;
    
    // Check if this item should be marked as processed
    if (head.fullShadow?.data?.['_system']) {
      const systemHeader = head.fullShadow.data['_system'] as SystemHeader;
      
      if (!isProcessed(systemHeader) && shouldMarkAsProcessed(systemHeader, ttlHours, now)) {
        itemsMarkedAsProcessed++;
        
        if (!opts.dryRun) {
          // Update the system header state
          const updatedSystemHeader = markAsProcessed(systemHeader);
          const updatedShadowData = {
            ...head.fullShadow.data,
            '_system': updatedSystemHeader
          };
          
          // Update the head document
          await repos.updateHeadShadow(head._id, updatedShadowData);
          
          logger.debug('Marked item as processed', {
            itemId: head._id.toString(),
            collection: ctx.collection,
            previousState: systemHeader.state,
            newState: 'processed'
          });
        } else {
          logger.debug('Would mark item as processed (dry run)', {
            itemId: head._id.toString(),
            collection: ctx.collection,
            currentState: systemHeader.state
          });
        }
      }
    }
  }

  const result: StateTransitionResult = {
    collection: ctx.collection,
    itemsProcessed,
    itemsMarkedAsProcessed,
    dryRun: opts.dryRun || false,
    processedAt: new Date(),
  };

  logger.info('State transition completed', {
    collection: result.collection,
    itemsProcessed: result.itemsProcessed,
    itemsMarkedAsProcessed: result.itemsMarkedAsProcessed,
    dryRun: result.dryRun,
    processedAt: result.processedAt
  });

  return result;
}

/**
 * Mark a specific item as processed
 * @param router - Bridge router instance
 * @param ctx - Route context
 * @param id - Item ID
 * @param opts - State transition options
 * @returns Whether the item was marked as processed
 */
export async function markItemAsProcessed(
  router: BridgeRouter,
  ctx: RouteContext,
  id: string,
  opts: StateTransitionOptions = {}
): Promise<boolean> {
  const routeInfo = router.route(ctx);
  const mongoClient = await router.getMongoClient(routeInfo.mongoUri);
  const mongo = mongoClient.db(ctx.dbName);
  
  if (!mongo) {
    throw new Error('Backend not available');
  }

  const repos = new Repos(mongo, ctx.collection);
  const head = await repos.getHead(new ObjectId(id));
  
  if (!head || !head.fullShadow?.data?.['_system']) {
    return false;
  }

  const systemHeader = head.fullShadow.data['_system'] as SystemHeader;
  
  if (isProcessed(systemHeader)) {
    return false; // Already processed
  }

  if (!opts.dryRun) {
    // Update the system header state
    const updatedSystemHeader = markAsProcessed(systemHeader);
    const updatedShadowData = {
      ...head.fullShadow.data,
      '_system': updatedSystemHeader
    };
    
    // Update the head document
    await repos.updateHeadShadow(head._id, updatedShadowData);
    
    logger.debug('Marked specific item as processed', {
      itemId: id,
      collection: ctx.collection,
      previousState: systemHeader.state,
      newState: 'processed'
    });
  }

  return true;
}
