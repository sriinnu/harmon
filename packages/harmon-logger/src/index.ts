/**
 * Harmon Logger - Structured logging with Pino
 */

import pino from 'pino';
import type { Logger } from 'pino';

export interface LoggerConfig {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
  prettyPrint?: boolean;
  name?: string;
}

/**
 * Create a structured logger instance with Pino
 *
 * In development: Pretty-printed, colorized logs
 * In production: Structured JSON logs
 *
 * @param config Logger configuration
 * @returns Pino logger instance
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  const isDev = process.env.NODE_ENV !== 'production';
  const defaultLevel = process.env.NODE_ENV === 'test' ? 'silent' : isDev ? 'debug' : 'info';

  return pino({
    level: config.level || process.env.LOG_LEVEL || defaultLevel,
    name: config.name || 'harmon',
    formatters: {
      level: (label) => ({ level: label }),
    },
    // Safety net: nothing logs credentials today, but one careless
    // logger.info({ tokens }) later must not leak them to stdout.
    redact: {
      paths: [
        'token', '*.token', '*.accessToken', '*.refreshToken', '*.secret',
        '*.userToken', '*.developerToken', '*.sp_dc', '*.sp_key',
        'req.headers.authorization',
      ],
      censor: '[redacted]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(config.prettyPrint ?? isDev ? {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    } : {}),
  });
}

export type { Logger };
