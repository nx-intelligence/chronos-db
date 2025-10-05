/**
 * Logging utility for chronos-db with 5 log levels and environment variable support
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
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
  private readonly levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

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
      case LogLevel.TRACE:
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

  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, context);
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

  storageOperation(operation: string, bucket: string, key: string, success: boolean, context?: Record<string, unknown>): void {
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
