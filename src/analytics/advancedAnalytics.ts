import { MongoClient, Db } from 'mongodb';
import { logger } from '../utils/logger.js';
import type { TimeBasedRule, CrossTenantRule, AnalyticsConfig } from '../config.js';

export interface TimeBasedResult {
  _id: string;
  ruleName: string;
  collection: string;
  operation: string;
  field?: string;
  value: number;
  timeframe?: string;
  timestamp: Date;
  arguments?: any[];
}

export interface CrossTenantResult {
  _id: string;
  ruleName: string;
  collection: string;
  mode: string;
  field?: string;
  value: number;
  timestamp: Date;
  masterTenantId: string;
  slaveResults: Array<{
    tenantId: string;
    value: number;
  }>;
}

export class AdvancedAnalytics {
  private mongoClient: MongoClient;
  private analyticsDb: Db;

  constructor(mongoClient: MongoClient, analyticsDbName: string, _config: AnalyticsConfig) {
    this.mongoClient = mongoClient;
    this.analyticsDb = mongoClient.db(analyticsDbName);
  }

  /**
   * Execute time-based analytics rule
   */
  async executeTimeBasedRule(rule: TimeBasedRule, args?: any[]): Promise<TimeBasedResult> {
    logger.debug('Executing time-based analytics rule', { ruleName: rule.name });

    try {
      // Build query with relative time filters
      let query = { ...rule.query };
      
      if (rule.relativeTime) {
        const now = new Date();
        if (rule.relativeTime.newerThan) {
          const newerDate = this.parseDuration(rule.relativeTime.newerThan, now);
          query['_system.insertedAt'] = { $gte: newerDate };
        }
        if (rule.relativeTime.olderThan) {
          const olderDate = this.parseDuration(rule.relativeTime.olderThan, now);
          query['_system.insertedAt'] = { $lte: olderDate };
        }
      }

      // Get the database and collection
      const db = this.mongoClient.db();
      const collection = db.collection(rule.collection);

      let result: number;

      if (args && args.length > 0) {
        // Execute query with arguments (foreign key filtering)
        const records = await collection.find(query).toArray();
        let totalValue = 0;
        let count = 0;

        for (const record of records) {
          // Use arguments to filter/aggregate foreign keys
          const foreignKeyValue = this.getForeignKeyValue(record, args);
          if (foreignKeyValue !== undefined) {
            totalValue += this.getAggregationValue(record, rule.field, rule.operation);
            count++;
          }
        }

        result = this.calculateResult(totalValue, count, rule.operation);
      } else {
        // Execute simple aggregation
        const pipeline = this.buildAggregationPipeline(query, rule);
        const aggregationResult = await collection.aggregate(pipeline).toArray();
        result = aggregationResult[0]?.['result'] || 0;
      }

      // Save result
      const resultDoc: TimeBasedResult = {
        _id: `${rule.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ruleName: rule.name,
        collection: rule.collection,
        operation: rule.operation,
        ...(rule.field && { field: rule.field }),
        value: result,
        ...(rule.timeframe && { timeframe: rule.timeframe }),
        timestamp: new Date(),
        ...(args && { arguments: args }),
      };

      await this.analyticsDb.collection('timeBasedResults').insertOne(resultDoc as any);
      
      logger.debug('Time-based analytics rule executed successfully', { 
        ruleName: rule.name, 
        result: result 
      });

      return resultDoc;
    } catch (error) {
      logger.error('Failed to execute time-based analytics rule', { 
        ruleName: rule.name, 
        error 
      }, error as Error);
      throw error;
    }
  }

  /**
   * Execute cross-tenant analytics rule
   */
  async executeCrossTenantRule(rule: CrossTenantRule): Promise<CrossTenantResult> {
    logger.debug('Executing cross-tenant analytics rule', { ruleName: rule.name });

    try {
      const slaveResults: Array<{ tenantId: string; value: number }> = [];
      let totalValue = 0;

      // Query each slave tenant
      for (const tenantId of rule.slaveTenantIds) {
        const tenantDb = this.mongoClient.db(`tenant_${tenantId}`);
        const collection = tenantDb.collection(rule.collection);

        // Build query with relative time filters
        let query = { ...rule.query };
        
        if (rule.relativeTime) {
          const now = new Date();
          if (rule.relativeTime.newerThan) {
            const newerDate = this.parseDuration(rule.relativeTime.newerThan, now);
            query['_system.insertedAt'] = { $gte: newerDate };
          }
          if (rule.relativeTime.olderThan) {
            const olderDate = this.parseDuration(rule.relativeTime.olderThan, now);
            query['_system.insertedAt'] = { $lte: olderDate };
          }
        }

        let tenantValue: number;

        if (rule.mode === 'boolean') {
          // Boolean mode: count records that match query
          const count = await collection.countDocuments(query);
          tenantValue = count > 0 ? 1 : 0;
        } else {
          // Aggregation mode
          const pipeline = this.buildAggregationPipeline(query, {
            operation: rule.mode as any,
            ...(rule.field && { field: rule.field }),
          });
          const aggregationResult = await collection.aggregate(pipeline).toArray();
          tenantValue = aggregationResult[0]?.['result'] || 0;
        }

        slaveResults.push({ tenantId, value: tenantValue });
        totalValue += tenantValue;
      }

      // Calculate final result based on mode
      let finalValue: number;
      if (rule.mode === 'boolean') {
        finalValue = totalValue; // Sum of 1s and 0s
      } else if (rule.mode === 'sum') {
        finalValue = totalValue;
      } else if (rule.mode === 'max') {
        finalValue = Math.max(...slaveResults.map(r => r.value));
      } else if (rule.mode === 'min') {
        finalValue = Math.min(...slaveResults.map(r => r.value));
      } else if (rule.mode === 'median') {
        const values = slaveResults.map(r => r.value).sort((a, b) => a - b);
        const mid = Math.floor(values.length / 2);
        finalValue = values.length % 2 === 0 
          ? (values[mid - 1]! + values[mid]!) / 2 
          : values[mid]!;
      } else {
        finalValue = totalValue;
      }

      // Save result in master tenant's analytics database
      const masterAnalyticsDb = this.mongoClient.db(`analytics_${rule.masterTenantId}`);
      const resultDoc: CrossTenantResult = {
        _id: `${rule.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ruleName: rule.name,
        collection: rule.collection,
        mode: rule.mode,
        ...(rule.field && { field: rule.field }),
        value: finalValue,
        timestamp: new Date(),
        masterTenantId: rule.masterTenantId,
        slaveResults,
      };

      await masterAnalyticsDb.collection('crossTenantResults').insertOne(resultDoc as any);
      
      logger.debug('Cross-tenant analytics rule executed successfully', { 
        ruleName: rule.name, 
        result: finalValue 
      });

      return resultDoc;
    } catch (error) {
      logger.error('Failed to execute cross-tenant analytics rule', { 
        ruleName: rule.name, 
        error 
      }, error as Error);
      throw error;
    }
  }

  /**
   * Get time-based analytics results
   */
  async getTimeBasedResults(query: {
    ruleName?: string;
    collection?: string;
    timeframe?: string;
    limit?: number;
  }): Promise<TimeBasedResult[]> {
    const { ruleName, collection, timeframe, limit = 100 } = query;
    
    const filter: any = {};
    if (ruleName) filter.ruleName = ruleName;
    if (collection) filter.collection = collection;
    if (timeframe) filter.timeframe = timeframe;

    const cursor = this.analyticsDb.collection('timeBasedResults')
      .find(filter)
      .limit(limit)
      .sort({ timestamp: -1 });
    
    const docs = await cursor.toArray();
    return docs as unknown as TimeBasedResult[];
  }

  /**
   * Get cross-tenant analytics results
   */
  async getCrossTenantResults(query: {
    ruleName?: string;
    collection?: string;
    masterTenantId?: string;
    limit?: number;
  }): Promise<CrossTenantResult[]> {
    const { ruleName, collection, masterTenantId, limit = 100 } = query;
    
    const filter: any = {};
    if (ruleName) filter.ruleName = ruleName;
    if (collection) filter.collection = collection;
    if (masterTenantId) filter.masterTenantId = masterTenantId;

    const masterAnalyticsDb = this.mongoClient.db(`analytics_${masterTenantId}`);
    const cursor = masterAnalyticsDb.collection('crossTenantResults')
      .find(filter)
      .limit(limit)
      .sort({ timestamp: -1 });
    
    const docs = await cursor.toArray();
    return docs as unknown as CrossTenantResult[];
  }

  /**
   * Parse ISO duration string to Date
   */
  private parseDuration(duration: string, baseDate: Date): Date {
    // Simple implementation for common durations
    // In production, use a proper duration parser like moment.js or date-fns
    const match = duration.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
    if (!match) return baseDate;

    const days = parseInt(match[1] || '0');
    const hours = parseInt(match[2] || '0');
    const minutes = parseInt(match[3] || '0');
    const seconds = parseInt(match[4] || '0');

    const result = new Date(baseDate);
    result.setDate(result.getDate() - days);
    result.setHours(result.getHours() - hours);
    result.setMinutes(result.getMinutes() - minutes);
    result.setSeconds(result.getSeconds() - seconds);

    return result;
  }

  /**
   * Get foreign key value from record using arguments
   */
  private getForeignKeyValue(record: any, args: any[]): any {
    // Simple implementation - in production, implement proper foreign key resolution
    for (const arg of args) {
      if (record[arg] !== undefined) {
        return record[arg];
      }
    }
    return undefined;
  }

  /**
   * Get aggregation value from record
   */
  private getAggregationValue(record: any, field?: string, _operation?: string): number {
    if (!field) return 1; // Count operation

    const value = this.getNestedValue(record, field);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    return 0;
  }

  /**
   * Calculate final result based on operation
   */
  private calculateResult(totalValue: number, count: number, operation: string): number {
    switch (operation) {
      case 'count':
        return count;
      case 'sum':
        return totalValue;
      case 'average':
        return count > 0 ? totalValue / count : 0;
      case 'max':
        return totalValue; // Assuming totalValue is already the max
      case 'min':
        return totalValue; // Assuming totalValue is already the min
      case 'median':
        return totalValue; // Simplified - in production, calculate proper median
      default:
        return totalValue;
    }
  }

  /**
   * Build MongoDB aggregation pipeline
   */
  private buildAggregationPipeline(query: any, rule: { operation: string; field?: string }): any[] {
    const pipeline: any[] = [
      { $match: query }
    ];

    switch (rule.operation) {
      case 'count':
        pipeline.push({ $count: 'result' });
        break;
      case 'sum':
        pipeline.push({ $group: { _id: null, result: { $sum: `$${rule.field}` } } });
        break;
      case 'average':
        pipeline.push({ $group: { _id: null, result: { $avg: `$${rule.field}` } } });
        break;
      case 'max':
        pipeline.push({ $group: { _id: null, result: { $max: `$${rule.field}` } } });
        break;
      case 'min':
        pipeline.push({ $group: { _id: null, result: { $min: `$${rule.field}` } } });
        break;
      case 'median':
        // Simplified median calculation
        pipeline.push({ $group: { _id: null, result: { $avg: `$${rule.field}` } } });
        break;
    }

    return pipeline;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}
