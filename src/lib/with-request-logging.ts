/**
 * Wraps a route handler so every request produces one structured completion
 * line and all logs inside it share a correlation id.
 *
 * Middleware assigns the id but runs on the edge runtime, where
 * AsyncLocalStorage is not available. The context therefore has to be opened
 * here, in the Node handler, reading the id middleware forwarded.
 *
 * The completion line is what turns "the site is slow" into an answer: it
 * records status and duration per route, so a slow endpoint is visible without
 * an external APM.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  runWithRequestContext,
} from "@/lib/request-context";
import logger from "@/lib/logger";

/**
 * Typed against NextRequest so wrapped handlers keep their real signature and
 * do not need a cast at the call site. A cast would silence genuine mismatches
 * in the very routes that move money.
 */
type Handler<Args extends unknown[]> = (
  request: NextRequest,
  ...args: Args
) => Promise<Response> | Response;

/** Requests slower than this are worth reading even when they succeed. */
const SLOW_REQUEST_MS = 2_000;

export function withRequestLogging<Args extends unknown[]>(
  handler: Handler<Args>,
  routeName?: string
): Handler<Args> {
  return async (request: NextRequest, ...args: Args): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const method = request.method;
    const path = (() => {
      try {
        return new URL(request.url).pathname;
      } catch {
        return routeName;
      }
    })();

    return runWithRequestContext({ requestId, method, path }, async () => {
      const startedAt = Date.now();
      try {
        const response = await handler(request, ...args);
        const durationMs = Date.now() - startedAt;

        // Only 5xx is our fault. A 4xx is the API working as designed, and
        // logging it at error level would bury real faults during a traffic
        // spike, which is exactly when the logs need to stay readable.
        const level =
          response.status >= 500 ? "error" : response.status >= 400 || durationMs > SLOW_REQUEST_MS ? "warn" : "info";

        logger[level](
          { method, path, status: response.status, durationMs },
          "request completed"
        );

        // Echo the id so a user can quote it from their network tab.
        response.headers.set(REQUEST_ID_HEADER, requestId);
        return response;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        logger.error({ error, method, path, durationMs }, "request threw");

        // Surface the id even on failure; it is the only way to find this
        // request's other log lines afterwards.
        return NextResponse.json(
          { error: "خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.", requestId },
          { status: 500, headers: { [REQUEST_ID_HEADER]: requestId } }
        );
      }
    });
  };
}
