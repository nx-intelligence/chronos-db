/**
 * Logging utility for chronos-db with 5 log levels and logs-gateway integration
 */

import { createLogger, LogsGateway, LoggingConfig } from 'logs-gateway';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
}

class ChronosLogger {
  private currentLevel: LogLevel;
  private readonly levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'];

  constructor() {
    // Default to ERROR level
    this.currentLevel = LogLevel.ERROR;
    
    // Check for CHRONOS_LOG_LEVEL environment variable
    this.loadLogLevelFromEnv();
  }

  private loadLogLevelFromEnv(): void {
    const envLevel = process.env.CHRONOS_LOG_LEVEL?.toUpperCase();
    
    if (envLevel) {
      const levelIndex = this.levelNames.indexOf(envLevel);
      if (levelIndex !== -1) {
        this.currentLevel = levelIndex as LogLevel;
        this.info(`Log level set to ${envLevel} from environment variable CHRONOS_LOG_LEVEL`);
      } else {
        this.warn(`Invalid log level '${envLevel}' in CHRONOS_LOG_LEVEL. Valid levels: ${this.levelNames.join(', ')}`);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.currentLevel;
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): string {
    const timestamp = new Date().toISOString();
    const levelName = this.levelNames[level];
    
    let formatted = `[${timestamp}] [chronos-db] [${levelName}] ${message}`;
    
    if (context && Object.keys(context).length > 0) {
      formatted += ` | Context: ${JSON.stringify(context)}`;
    }
    
    if (error) {
      formatted += ` | Error: ${error.message}`;
      if (error.stack) {
        formatted += `\nStack: ${error.stack}`;
      }
    }
    
    return formatted;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, context, error);
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.DEBUG:
        console.log(formattedMessage);
        break;
      case LogLevel.VERBOSE:
        console.log(formattedMessage);
        break;
    }
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  verbose(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.VERBOSE, message, context);
  }

  // Utility methods for common logging patterns
  operationStart(operation: string, context?: Record<string, unknown>): void {
    this.debug(`Starting operation: ${operation}`, context);
  }

  operationEnd(operation: string, duration: number, context?: Record<string, unknown>): void {
    this.debug(`Completed operation: ${operation}`, { ...context, durationMs: duration });
  }

  operationError(operation: string, error: Error, context?: Record<string, unknown>): void {
    this.error(`Operation failed: ${operation}`, context, error);
  }

  configValidation(configType: string, isValid: boolean, context?: Record<string, unknown>): void {
    if (isValid) {
      this.debug(`Configuration validation passed: ${configType}`, context);
    } else {
      this.error(`Configuration validation failed: ${configType}`, context);
    }
  }

  storageOperationDebug(operation: string, bucket: string, key: string, success: boolean, context?: Record<string, unknown>): void {
    if (success) {
      this.debug(`Storage operation succeeded: ${operation}`, { bucket, key, ...context });
    } else {
      this.error(`Storage operation failed: ${operation}`, { bucket, key, ...context });
    }
  }

  databaseOperation(operation: string, collection: string, success: boolean, context?: Record<string, unknown>): void {
    if (success) {
      this.debug(`Database operation succeeded: ${operation}`, { collection, ...context });
    } else {
      this.error(`Database operation failed: ${operation}`, { collection, ...context });
    }
  }

  transactionOperation(operation: string, useTransactions: boolean, success: boolean, context?: Record<string, unknown>): void {
    if (success) {
      this.debug(`Transaction operation succeeded: ${operation}`, { useTransactions, ...context });
    } else {
      this.error(`Transaction operation failed: ${operation}`, { useTransactions, ...context });
    }
  }

  // VERBOSE level methods for detailed logging
  fullQuery(operation: string, collection: string, query: any, context?: Record<string, unknown>): void {
    this.verbose(`Full query executed: ${operation}`, {
      collection,
      query: JSON.stringify(query, null, 2),
      ...context
    });
  }

  fullData(operation: string, data: any, context?: Record<string, unknown>): void {
    this.verbose(`Full data processed: ${operation}`, {
      data: JSON.stringify(data, null, 2),
      dataSize: JSON.stringify(data).length,
      ...context
    });
  }

  internalOperation(operation: string, details: any, context?: Record<string, unknown>): void {
    this.verbose(`Internal operation: ${operation}`, {
      details: JSON.stringify(details, null, 2),
      ...context
    });
  }

  routingDecision(decision: string, details: any, context?: Record<string, unknown>): void {
    this.verbose(`Routing decision: ${decision}`, {
      details: JSON.stringify(details, null, 2),
      ...context
    });
  }

  storageOperation(operation: string, bucket: string, key: string, data?: any, context?: Record<string, unknown>): void {
    const logContext: Record<string, unknown> = {
      bucket,
      key,
      ...context
    };
    
    if (data !== undefined) {
      logContext.data = JSON.stringify(data, null, 2);
      logContext.dataSize = JSON.stringify(data).length;
    }
    
    this.verbose(`Storage operation: ${operation}`, logContext);
  }

  mongoOperation(operation: string, collection: string, query?: any, update?: any, options?: any, context?: Record<string, unknown>): void {
    const logContext: Record<string, unknown> = {
      collection,
      ...context
    };
    
    if (query !== undefined) {
      logContext.query = JSON.stringify(query, null, 2);
    }
    if (update !== undefined) {
      logContext.update = JSON.stringify(update, null, 2);
    }
    if (options !== undefined) {
      logContext.options = JSON.stringify(options, null, 2);
    }
    
    this.verbose(`MongoDB operation: ${operation}`, logContext);
  }

  // Get current log level (useful for testing)
  getCurrentLevel(): LogLevel {
    return this.currentLevel;
  }

  // Set log level programmatically (useful for testing)
  setLogLevel(level: LogLevel): void {
    this.currentLevel = level;
    this.info(`Log level changed to ${this.levelNames[level]}`);
  }
}

// Create singleton instance
export const logger = new ChronosLogger();

// Export the class for testing
export { ChronosLogger };
