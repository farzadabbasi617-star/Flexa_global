import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

/**
 * Assign every request a correlation id.
 *
 * Named proxy.ts rather than middleware.ts: Next 16 deprecated the middleware
 * file convention in favour of this one.
 *
 * Middleware runs on the edge runtime, where AsyncLocalStorage and pino are
 * unavailable, so this deliberately does no logging. It only ensures an id
 * exists and is visible in two places:
 *
 *   - forwarded to the Node handler, where instrumentation.ts opens the async
 *     context that the logger reads
 *   - returned on the response, so a user reporting a problem can quote the id
 *     from their network tab and it can be found in the logs directly
 *
 * Reusing an inbound id keeps a trace intact across a proxy or CDN hop.
 */
export default function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  /**
   * Skip static assets and image optimisation: they are served without
   * touching application code, so an id would be noise. _next/static and
   * favicon are excluded for the same reason.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|avatars/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|json)$).*)"],
};
