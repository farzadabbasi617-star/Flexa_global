/**
 * Per-request correlation id.
 *
 * Every log line used to stand alone:
 *
 *   {"level":50,"msg":"ZarinPal payment request failed","code":-9}
 *
 * With a handful of users that is readable. With a thousand concurrent ones the
 * lines interleave and there is no way to tell which belong to the same
 * request, so "my payment failed" cannot be traced to the errors it produced.
 *
 * AsyncLocalStorage carries the id through awaits without threading it through
 * every function signature, so existing `logger.error({ error }, "...")` calls
 * gain the id for free via the pino mixin in logger.ts.
 */
import { AsyncLocalStorage } from "node:async_hooks";

// Re-exported so Node-side callers have one import site, while middleware
// imports request-id.ts directly and never pulls in node:async_hooks.
export { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

export type RequestContext = {
  requestId: string;
  method?: string;
  path?: string;
  /** Attached after auth resolves, so later lines can be tied to a user. */
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Lets a route tag the current request with the authenticated user once the
 * session is resolved. Mutating the stored object is intentional: it updates
 * the context every later log line in this request will read.
 */
export function setRequestUser(userId: string | null | undefined) {
  const store = storage.getStore();
  if (store && userId) store.userId = userId;
}


