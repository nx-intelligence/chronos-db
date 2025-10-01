import { ObjectId } from 'mongodb';
import type { RouteContext } from '../config.js';

// ============================================================================
// Fallback Queue Schemas
// ============================================================================

export interface FallbackOp {
  _id: ObjectId;
  type: 'CREATE' | 'UPDATE' | 'DELETE' | 'ENRICH' | 'RESTORE';
  ctx: {
    dbName: string;
    collection: string;
    tenantId?: string;
    forcedIndex?: number;
  };
  payload: any;              // full record/enrichment payload
  opts: any;                 // operation options (actor, reason, etc.)
  requestId: string;         // idempotency key
  attempt: number;           // how many times retried
  nextAttemptAt: Date;       // scheduled retry time
  lastError?: string;        // last failure message
  createdAt: Date;           // enqueued timestamp
}

export interface DeadLetterOp extends FallbackOp {
  finalError: string;        // final error that caused permanent failure
  failedAt: Date;           // when it was moved to dead letter
}

// ============================================================================
// Fallback Queue Operations
// ============================================================================

export interface FallbackQueueOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds for exponential backoff */
  maxDelayMs: number;
  /** Dead letter collection name */
  deadLetterCollection: string;
}

export interface EnqueueOptions {
  /** Request ID for idempotency */
  requestId: string;
  /** Operation type */
  type: FallbackOp['type'];
  /** Route context */
  ctx: RouteContext;
  /** Operation payload */
  payload: any;
  /** Operation options */
  opts?: any;
  /** Immediate retry (skip delay) */
  immediate?: boolean;
}

export interface RetryResult {
  success: boolean;
  error?: string;
  shouldRetry: boolean;
  nextAttemptAt?: Date;
}

// ============================================================================
// Validation Functions
// ============================================================================

export function isValidFallbackOp(op: any): op is FallbackOp {
  return (
    op &&
    typeof op === 'object' &&
    op._id instanceof ObjectId &&
    typeof op.type === 'string' &&
    ['CREATE', 'UPDATE', 'DELETE', 'ENRICH', 'RESTORE'].includes(op.type) &&
    op.ctx &&
    typeof op.ctx.dbName === 'string' &&
    typeof op.ctx.collection === 'string' &&
    typeof op.requestId === 'string' &&
    typeof op.attempt === 'number' &&
    op.nextAttemptAt instanceof Date &&
    op.createdAt instanceof Date
  );
}

export function isValidDeadLetterOp(op: any): op is DeadLetterOp {
  return (
    isValidFallbackOp(op) &&
    typeof (op as DeadLetterOp).finalError === 'string' &&
    (op as DeadLetterOp).failedAt instanceof Date
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate next retry time with exponential backoff and jitter
 */
export function calculateNextAttempt(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): Date {
  // Exponential backoff: 2^attempt * baseDelay
  const delay = Math.min(
    Math.pow(2, attempt) * baseDelayMs,
    maxDelayMs
  );
  
  // Add jitter: ±10%
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  const finalDelay = Math.max(0, delay + jitter);
  
  return new Date(Date.now() + finalDelay);
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if an operation should be retried
 */
export function shouldRetry(
  attempt: number,
  maxAttempts: number,
  lastError?: string
): boolean {
  if (attempt >= maxAttempts) {
    return false;
  }
  
  // Don't retry certain permanent errors
  if (lastError) {
    const permanentErrors = [
      'ValidationError',
      'NotFoundError',
      'OptimisticLockError'
    ];
    
    if (permanentErrors.some(err => lastError.includes(err))) {
      return false;
    }
  }
  
  return true;
}

