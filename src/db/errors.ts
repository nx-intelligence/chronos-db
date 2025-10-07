// ============================================================================
// CRUD Operation Errors
// ============================================================================

/**
 * Base error class for all CRUD operations
 */
export abstract class CrudError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  
  constructor(
    message: string,
    public readonly op: string,
    public readonly collection: string,
    public readonly id?: string,
    public readonly ov?: number,
    public readonly cv?: number,
    public readonly backendIndex?: number,
    public readonly routingKey?: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Validation error - missing required fields, invalid data
 */
export class ValidationError extends CrudError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  
  constructor(
    message: string,
    op: string,
    collection: string,
    id?: string,
    ov?: number,
    cv?: number,
    backendIndex?: number,
    routingKey?: string
  ) {
    super(message, op, collection, id, ov, cv, backendIndex, routingKey);
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends CrudError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
  
  constructor(
    message: string,
    op: string,
    collection: string,
    id?: string,
    ov?: number,
    cv?: number,
    backendIndex?: number,
    routingKey?: string
  ) {
    super(message, op, collection, id, ov, cv, backendIndex, routingKey);
  }
}

/**
 * Optimistic locking conflict error
 */
export class OptimisticLockError extends CrudError {
  readonly code = 'OPTIMISTIC_LOCK';
  readonly statusCode = 409;
  
  constructor(
    message: string,
    op: string,
    collection: string,
    id?: string,
    ov?: number,
    cv?: number,
    backendIndex?: number,
    routingKey?: string
  ) {
    super(message, op, collection, id, ov, cv, backendIndex, routingKey);
  }
}

/**
 * Route mismatch error - configuration issues
 */
export class RouteMismatchError extends CrudError {
  readonly code = 'ROUTE_MISMATCH';
  readonly statusCode = 500;
  
  constructor(
    message: string,
    op: string,
    collection: string,
    id?: string,
    ov?: number,
    cv?: number,
    backendIndex?: number,
    routingKey?: string
  ) {
    super(message, op, collection, id, ov, cv, backendIndex, routingKey);
  }
}

/**
 * Storage error - S3 operations failed
 */
export class StorageError extends CrudError {
  readonly code = 'STORAGE_ERROR';
  readonly statusCode = 502;
  
  constructor(
    message: string,
    op: string,
    collection: string,
    id?: string,
    ov?: number,
    cv?: number,
    backendIndex?: number,
    routingKey?: string
  ) {
    super(message, op, collection, id, ov, cv, backendIndex, routingKey);
  }
}

/**
 * Transaction error - MongoDB transaction failed
 */
export class TxnError extends CrudError {
  readonly code = 'TXN_ERROR';
  readonly statusCode = 503;
  
  constructor(
    message: string,
    op: string,
    collection: string,
    id?: string,
    ov?: number,
    cv?: number,
    backendIndex?: number,
    routingKey?: string
  ) {
    super(message, op, collection, id, ov, cv, backendIndex, routingKey);
  }
}

/**
 * Externalization error - base64 processing failed
 */
export class ExternalizationError extends CrudError {
  readonly code = 'EXTERNALIZATION_ERROR';
  readonly statusCode = 400;
  
  constructor(
    message: string,
    op: string,
    collection: string,
    id?: string,
    ov?: number,
    cv?: number,
    backendIndex?: number,
    routingKey?: string
  ) {
    super(message, op, collection, id, ov, cv, backendIndex, routingKey);
  }
}

// ============================================================================
// Simple Error Classes for Restore Operations
// ============================================================================

/**
 * Simple error class for restore operations
 */
export class ChronosError extends Error {
  constructor(message: string, public code: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, ChronosError.prototype);
  }
}

/**
 * Simple validation error
 */
export class SimpleValidationError extends ChronosError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, SimpleValidationError.prototype);
  }
}

/**
 * Simple not found error
 */
export class SimpleNotFoundError extends ChronosError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', details);
    Object.setPrototypeOf(this, SimpleNotFoundError.prototype);
  }
}

/**
 * Simple optimistic lock error
 */
export class SimpleOptimisticLockError extends ChronosError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'OPTIMISTIC_LOCK_FAILED', details);
    Object.setPrototypeOf(this, SimpleOptimisticLockError.prototype);
  }
}

/**
 * Simple transaction error
 */
export class SimpleTxnError extends ChronosError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TRANSACTION_ERROR', details);
    Object.setPrototypeOf(this, SimpleTxnError.prototype);
  }
}

/**
 * Simple CRUD error
 */
export class SimpleCrudError extends ChronosError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CRUD_ERROR', details);
    Object.setPrototypeOf(this, SimpleCrudError.prototype);
  }
}
