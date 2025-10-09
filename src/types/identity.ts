/**
 * Standard Identity Types for Attribution and Audit Trails
 * 
 * These types provide a consistent way to track WHO created or modified data
 * across the entire xronox ecosystem. All frameworks building on xronox should
 * use these interfaces for consistency.
 */

// ============================================================================
// Core Identity Interface
// ============================================================================

/**
 * Standard Identity interface for attribution and audit trails
 * 
 * Use this to track WHO created or modified data across the xronox ecosystem.
 * All frameworks building on xronox should use this interface for consistency.
 * 
 * @example
 * const userIdentity: Identity = {
 *   type: 'user',
 *   identifier: 'user-123',
 *   name: 'John Doe',
 *   metadata: { email: 'john@example.com' }
 * };
 * 
 * @example
 * const agentIdentity: Identity = {
 *   type: 'agent',
 *   identifier: 'research-agent-v2',
 *   name: 'Research Agent',
 *   metadata: { version: '2.0.0', model: 'gpt-4' }
 * };
 */
export interface Identity {
  /** Type of identity: 'user' | 'agent' | 'system' | 'api' | custom */
  type: string;

  /** Unique identifier for this identity */
  identifier: string;

  /** Human-readable name (optional) */
  name?: string;

  /** Additional metadata about the identity (optional) */
  metadata?: Record<string, any>;
}

/**
 * Common identity types (for convenience)
 */
export type IdentityType =
  | 'user'      // Human user
  | 'agent'     // AI agent / automated system
  | 'system'    // Internal system process
  | 'api'       // External API integration
  | 'service'   // Microservice
  | 'job'       // Background job / worker
  | 'cron'      // Scheduled task
  | 'webhook'   // Webhook trigger
  | string;     // Custom types allowed

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an identity object
 * 
 * @param type - Type of identity
 * @param identifier - Unique identifier
 * @param name - Human-readable name (optional)
 * @param metadata - Additional metadata (optional)
 * @returns Identity object
 * 
 * @example
 * const identity = createIdentity('user', 'user-123', 'John Doe', {
 *   email: 'john@example.com',
 *   role: 'admin'
 * });
 */
export function createIdentity(
  type: IdentityType,
  identifier: string,
  name?: string,
  metadata?: Record<string, any>
): Identity {
  return {
    type,
    identifier,
    ...(name && { name }),
    ...(metadata && { metadata }),
  };
}

/**
 * Create a user identity
 * 
 * @param userId - User identifier
 * @param name - User name (optional)
 * @param metadata - Additional user metadata (optional)
 * @returns User identity
 * 
 * @example
 * const user = createUserIdentity('user-123', 'John Doe', {
 *   email: 'john@example.com',
 *   role: 'admin'
 * });
 */
export function createUserIdentity(
  userId: string,
  name?: string,
  metadata?: Record<string, any>
): Identity {
  return createIdentity('user', userId, name, metadata);
}

/**
 * Create an agent identity
 * 
 * @param agentId - Agent identifier
 * @param name - Agent name (optional)
 * @param metadata - Agent metadata (optional)
 * @returns Agent identity
 * 
 * @example
 * const agent = createAgentIdentity('research-agent', 'Research Agent', {
 *   version: '2.0.0',
 *   model: 'gpt-4'
 * });
 */
export function createAgentIdentity(
  agentId: string,
  name?: string,
  metadata?: Record<string, any>
): Identity {
  return createIdentity('agent', agentId, name, metadata);
}

/**
 * Create a system identity
 * 
 * @param systemId - System identifier
 * @param name - System name (optional)
 * @param metadata - System metadata (optional)
 * @returns System identity
 * 
 * @example
 * const system = createSystemIdentity('background-processor', 'Background Processor', {
 *   hostname: 'worker-01',
 *   pid: 12345
 * });
 */
export function createSystemIdentity(
  systemId: string,
  name?: string,
  metadata?: Record<string, any>
): Identity {
  return createIdentity('system', systemId, name, metadata);
}

/**
 * Create an API identity
 * 
 * @param apiKey - API key or identifier
 * @param name - API name (optional)
 * @param metadata - API metadata (optional)
 * @returns API identity
 * 
 * @example
 * const api = createAPIIdentity('stripe-integration', 'Stripe Integration', {
 *   version: 'v1',
 *   environment: 'production'
 * });
 */
export function createAPIIdentity(
  apiKey: string,
  name?: string,
  metadata?: Record<string, any>
): Identity {
  return createIdentity('api', apiKey, name, metadata);
}

// ============================================================================
// Identity Validation
// ============================================================================

/**
 * Validate an identity object
 * 
 * @param identity - Identity to validate
 * @throws Error if identity is invalid
 */
export function validateIdentity(identity: any): asserts identity is Identity {
  if (!identity || typeof identity !== 'object') {
    throw new Error('Identity must be an object');
  }

  if (typeof identity.type !== 'string' || identity.type.trim() === '') {
    throw new Error('Identity.type must be a non-empty string');
  }

  if (typeof identity.identifier !== 'string' || identity.identifier.trim() === '') {
    throw new Error('Identity.identifier must be a non-empty string');
  }

  if (identity.name !== undefined && typeof identity.name !== 'string') {
    throw new Error('Identity.name must be a string if provided');
  }

  if (identity.metadata !== undefined && (typeof identity.metadata !== 'object' || Array.isArray(identity.metadata))) {
    throw new Error('Identity.metadata must be an object if provided');
  }
}

/**
 * Check if an object is a valid identity
 * 
 * @param obj - Object to check
 * @returns True if valid identity
 */
export function isIdentity(obj: any): obj is Identity {
  try {
    validateIdentity(obj);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Identity Serialization
// ============================================================================

/**
 * Convert identity to string representation
 * 
 * @param identity - Identity to serialize
 * @returns String representation
 * 
 * @example
 * identityToString({ type: 'user', identifier: 'user-123', name: 'John' })
 * // Returns: "user:user-123 (John)"
 */
export function identityToString(identity: Identity): string {
  const base = `${identity.type}:${identity.identifier}`;
  return identity.name ? `${base} (${identity.name})` : base;
}

/**
 * Parse identity from string representation
 * 
 * @param str - String to parse
 * @returns Identity object or null if invalid
 * 
 * @example
 * parseIdentityString("user:user-123 (John)")
 * // Returns: { type: 'user', identifier: 'user-123', name: 'John' }
 */
export function parseIdentityString(str: string): Identity | null {
  const match = str.match(/^(\w+):([^\s(]+)(?:\s*\(([^)]+)\))?$/);
  if (!match || !match[1] || !match[2]) return null;

  return {
    type: match[1],
    identifier: match[2],
    ...(match[3] && { name: match[3] }),
  };
}

