import { Db, Collection } from 'mongodb';
import type { CounterRule } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export type CounterOp = 'CREATE' | 'UPDATE' | 'DELETE';

export interface CounterScope {
  tenant?: string;
  dbName: string;
  collection: string;
}

export interface BumpTotalsInput {
  scope: CounterScope;
  op: CounterOp;
  metaIndexed?: Record<string, unknown>;
  payloadTransformed?: Record<string, unknown>;
}

export interface CounterTotalsDoc {
  _id: string;
  tenant?: string;
  dbName: string;
  collection: string;
  created: number;
  updated: number;
  deleted: number;
  rules?: {
    [ruleName: string]: {
      created?: number;
      updated?: number;
      deleted?: number;
    };
  };
  lastAt: Date;
}

export interface GetTotalsQuery {
  dbName: string;
  collection: string;
  tenant?: string;
  includeRules?: boolean;
  rules?: string[];
}

// ============================================================================
// Counter Totals Repository
// ============================================================================

/**
 * Repository for managing counter totals
 */
export class CounterTotalsRepo {
  private readonly collection: Collection<CounterTotalsDoc>;
  private readonly rules: CounterRule[];

  constructor(countersDb: Db, rules: CounterRule[] = []) {
    this.collection = countersDb.collection<CounterTotalsDoc>('cnt_total');
    this.rules = rules;
  }

  /**
   * Ensure indexes are created
   */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex(
      { tenant: 1, dbName: 1, collection: 1 },
      { name: 'idx_tenant_db_collection' }
    );
  }

  /**
   * Generate document ID for a scope
   */
  private generateDocId(scope: CounterScope): string {
    const parts = [];
    if (scope.tenant) {
      parts.push(`tenant:${scope.tenant}`);
    }
    parts.push(`db:${scope.dbName}`);
    parts.push(`coll:${scope.collection}`);
    return parts.join('|');
  }

  /**
   * Evaluate a counter rule against data
   */
  private evaluateRule(rule: CounterRule, data: Record<string, unknown>): boolean {
    if (!rule.on || rule.on.includes(this.currentOp)) {
      return this.evaluatePredicate(rule.when, data);
    }
    return false;
  }

  /**
   * Evaluate a predicate against data
   */
  private evaluatePredicate(predicate: Record<string, any>, data: Record<string, unknown>): boolean {
    for (const [path, condition] of Object.entries(predicate)) {
      const value = this.getNestedValue(data, path);
      
      if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
        // Complex condition with operators
        if (!this.evaluateComplexCondition(value, condition)) {
          return false;
        }
      } else {
        // Simple equality
        if (value !== condition) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && current !== null && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Evaluate complex condition with operators
   */
  private evaluateComplexCondition(value: unknown, condition: Record<string, any>): boolean {
    for (const [operator, expected] of Object.entries(condition)) {
      switch (operator) {
        case '$eq':
          if (value !== expected) return false;
          break;
        case '$ne':
          if (value === expected) return false;
          break;
        case '$in':
          if (!Array.isArray(expected) || !expected.includes(value)) return false;
          break;
        case '$nin':
          if (Array.isArray(expected) && expected.includes(value)) return false;
          break;
        case '$exists':
          if (expected && value === undefined) return false;
          if (!expected && value !== undefined) return false;
          break;
        case '$regex':
          if (typeof value !== 'string' || !new RegExp(expected).test(value)) return false;
          break;
        case '$gt':
          if (typeof value !== 'number' || value <= expected) return false;
          break;
        case '$gte':
          if (typeof value !== 'number' || value < expected) return false;
          break;
        case '$lt':
          if (typeof value !== 'number' || value >= expected) return false;
          break;
        case '$lte':
          if (typeof value !== 'number' || value > expected) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  /**
   * Current operation being processed (for rule evaluation)
   */
  private currentOp: CounterOp = 'CREATE';

  /**
   * Bump totals for an operation
   */
  async bumpTotals(input: BumpTotalsInput): Promise<void> {
    const { scope, op, metaIndexed } = input;
    this.currentOp = op;

    const docId = this.generateDocId(scope);
    const now = new Date();

    // Prepare update operations
    const updateOps: Record<string, any> = {
      $inc: {
        [op.toLowerCase()]: 1,
      },
      $set: {
        lastAt: now,
      },
      $setOnInsert: {
        _id: docId,
        tenant: scope.tenant,
        dbName: scope.dbName,
        collection: scope.collection,
        created: 0,
        updated: 0,
        deleted: 0,
      },
    };

    // Evaluate rules
    const dataToEvaluate = metaIndexed || {};
    const rulesToUpdate: Record<string, any> = {};

    for (const rule of this.rules) {
      const shouldIncrement = this.evaluateRule(rule, dataToEvaluate);
      if (shouldIncrement) {
        const rulePath = `rules.${rule.name}.${op.toLowerCase()}`;
        rulesToUpdate[rulePath] = 1;
      }
    }

    if (Object.keys(rulesToUpdate).length > 0) {
      updateOps['$inc'] = { ...updateOps['$inc'], ...rulesToUpdate };
    }

    try {
      await this.collection.updateOne(
        { _id: docId },
        updateOps,
        { upsert: true }
      );
    } catch (error) {
      // Log error but don't throw - counters should never break CRUD
      console.error('Failed to bump counters:', error);
    }
  }

  /**
   * Get totals for a scope
   */
  async getTotals(query: GetTotalsQuery): Promise<CounterTotalsDoc | null> {
    const { dbName, collection, tenant, includeRules = true, rules } = query;
    const scope: CounterScope = { dbName, collection, ...(tenant && { tenant }) };
    const docId = this.generateDocId(scope);

    const doc = await this.collection.findOne({ _id: docId });
    if (!doc) {
      return null;
    }

    // Filter rules if requested
    if (!includeRules) {
      const { rules: _, ...docWithoutRules } = doc;
      return docWithoutRules;
    }

    if (rules && rules.length > 0) {
      const filteredRules: Record<string, any> = {};
      for (const ruleName of rules) {
        if (doc.rules && doc.rules[ruleName]) {
          filteredRules[ruleName] = doc.rules[ruleName];
        }
      }
      return { ...doc, rules: filteredRules };
    }

    return doc;
  }

  /**
   * Reset totals for a scope (admin operation)
   */
  async resetTotals(query: { dbName: string; collection: string; tenant?: string }): Promise<void> {
    const { dbName, collection, tenant } = query;
    const scope: CounterScope = { dbName, collection, ...(tenant && { tenant }) };
    const docId = this.generateDocId(scope);

    await this.collection.updateOne(
      { _id: docId },
      {
        $set: {
          created: 0,
          updated: 0,
          deleted: 0,
          rules: {},
          lastAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
}
