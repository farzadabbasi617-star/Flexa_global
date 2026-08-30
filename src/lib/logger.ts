import pino from 'pino';
import { getRequestContext } from '@/lib/request-context';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  /**
   * Without serializers pino writes a bare Error as `{}`, because message and
   * stack are non-enumerable. Production logs were full of `"error":{}` lines
   * that named the failing URL but not the failure, which made a hard timeout
   * indistinguishable from a parse bug.
   *
   * pino serializes a key named `err` by default; most of this codebase logs
   * `error`, so map both.
   */
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  /**
   * Stamp every line with the current request's correlation id.
   *
   * Doing it here rather than at each call site means the ~270 existing
   * logger.error/warn/info calls gain traceability without being touched, and
   * new code cannot forget to include it.
   *
   * Outside a request (boot, cron, scripts) there is no context and the fields
   * are simply absent.
   */
  mixin() {
    const context = getRequestContext();
    if (!context) return {};
    return {
      requestId: context.requestId,
      ...(context.userId ? { userId: context.userId } : {}),
    };
  },
  transport: process.env.NODE_ENV !== 'production' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      } 
    : undefined,
});

export default logger;
