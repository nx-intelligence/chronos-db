/**
 * Field Projection Utilities
 * 
 * Handles field filtering based on projection specs and hidden fields configuration.
 * Similar to how operating systems handle hidden files - they exist but are hidden by default.
 */

import type { ProjectionSpec, CollectionMap, XronoxConfig } from '../config.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Projection Resolution
// ============================================================================

/**
 * Resolve projection spec from collection map and options
 */
export function resolveProjectionSpec(
  collectionName: string,
  config: XronoxConfig,
  options?: {
    includeHidden?: boolean;
    projectionSpec?: string | ProjectionSpec;
  }
): ProjectionSpec | null {
  const collMap = config.collectionMaps?.[collectionName];
  if (!collMap) {
    logger.debug('No collection map found', { collectionName });
    return null;
  }

  let spec: ProjectionSpec | null = null;

  // 1. Determine base projection spec
  if (options?.projectionSpec) {
    // Use explicit projection from options
    if (typeof options.projectionSpec === 'string') {
      // Named projection
      const namedProjection = collMap.projection?.[options.projectionSpec];
      if (namedProjection) {
        spec = { ...namedProjection };
        logger.debug('Using named projection', { 
          collectionName, 
          projectionName: options.projectionSpec 
        });
      } else {
        logger.warn('Named projection not found, using default', { 
          collectionName, 
          projectionName: options.projectionSpec 
        });
        spec = collMap.projection?.default ? { ...collMap.projection.default } : null;
      }
    } else {
      // Custom projection spec
      spec = { ...options.projectionSpec };
      logger.debug('Using custom projection spec', { collectionName });
    }
  } else {
    // Use default projection from collection map
    spec = collMap.projection?.default ? { ...collMap.projection.default } : null;
    logger.debug('Using default projection', { collectionName, hasDefault: !!spec });
  }

  // 2. Handle hidden fields
  if (collMap.hiddenFields && collMap.hiddenFields.length > 0) {
    if (!spec) {
      // No projection spec, create one to handle hidden fields
      spec = {
        include: '*',
        exclude: options?.includeHidden ? [] : [...collMap.hiddenFields],
      };
      logger.debug('Created projection spec for hidden fields', { 
        collectionName, 
        hiddenFields: collMap.hiddenFields,
        includeHidden: options?.includeHidden 
      });
    } else {
      // Modify existing spec to respect includeHidden flag
      if (options?.includeHidden) {
        // Remove hidden fields from exclude list
        if (spec.exclude) {
          spec.exclude = spec.exclude.filter(
            field => !collMap.hiddenFields!.includes(field)
          );
        }
        logger.debug('Including hidden fields in projection', { 
          collectionName, 
          hiddenFields: collMap.hiddenFields 
        });
      } else {
        // Add hidden fields to exclude list (if not already there)
        const currentExclude = spec.exclude || [];
        const hiddenToAdd = collMap.hiddenFields.filter(
          field => !currentExclude.includes(field)
        );
        if (hiddenToAdd.length > 0) {
          spec.exclude = [...currentExclude, ...hiddenToAdd];
          logger.debug('Excluding hidden fields from projection', { 
            collectionName, 
            addedExclusions: hiddenToAdd 
          });
        }
      }
    }
  }

  return spec;
}

// ============================================================================
// Projection Application
// ============================================================================

/**
 * Apply projection spec to a document
 */
export function applyProjection(doc: any, spec: ProjectionSpec | null): any {
  if (!spec) {
    // No projection, return document as-is
    return doc;
  }

  const result: any = {};

  // 1. Handle include
  if (spec.include === '*') {
    // Include all fields
    Object.assign(result, doc);
  } else if (Array.isArray(spec.include)) {
    // Include specific fields
    spec.include.forEach(field => {
      if (field in doc) {
        result[field] = doc[field];
      }
    });
  }

  // 2. Handle exclude (applied after include)
  if (spec.exclude && Array.isArray(spec.exclude)) {
    spec.exclude.forEach(field => {
      delete result[field];
    });
  }

  return result;
}

/**
 * Apply projection to multiple documents
 */
export function applyProjectionToMany(
  docs: any[],
  spec: ProjectionSpec | null
): any[] {
  if (!spec || docs.length === 0) {
    return docs;
  }

  return docs.map(doc => applyProjection(doc, spec));
}

// ============================================================================
// Projection Validation
// ============================================================================

/**
 * Validate projection spec
 */
export function validateProjectionSpec(spec: ProjectionSpec): void {
  if (spec.include !== '*' && !Array.isArray(spec.include)) {
    throw new Error('ProjectionSpec.include must be "*" or an array of field names');
  }

  if (Array.isArray(spec.include) && spec.include.length === 0) {
    throw new Error('ProjectionSpec.include array cannot be empty');
  }

  if (spec.exclude !== undefined && !Array.isArray(spec.exclude)) {
    throw new Error('ProjectionSpec.exclude must be an array of field names');
  }

  if (Array.isArray(spec.include) && spec.include.some(f => typeof f !== 'string')) {
    throw new Error('All fields in ProjectionSpec.include must be strings');
  }

  if (spec.exclude && spec.exclude.some(f => typeof f !== 'string')) {
    throw new Error('All fields in ProjectionSpec.exclude must be strings');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a projection spec that includes all fields
 */
export function includeAllProjection(): ProjectionSpec {
  return { include: '*', exclude: [] };
}

/**
 * Create a projection spec that excludes specific fields
 */
export function excludeFieldsProjection(fields: string[]): ProjectionSpec {
  return { include: '*', exclude: fields };
}

/**
 * Create a projection spec that includes only specific fields
 */
export function includeOnlyProjection(fields: string[]): ProjectionSpec {
  return { include: fields, exclude: [] };
}

