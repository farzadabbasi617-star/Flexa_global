/**
 * Edge-safe request id helpers.
 *
 * Kept separate from request-context.ts on purpose: that module imports
 * node:async_hooks, which the edge runtime cannot load. Importing it from
 * middleware pulled the whole Node-only chain (and transitively pg) into the
 * edge bundle and broke the build.
 *
 * Only Web Crypto and string handling are used here, so this is safe in
 * middleware, the edge runtime and Node alike.
 */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Reuse an upstream id when there is one so a trace survives a proxy or CDN
 * hop, otherwise mint one.
 *
 * The value is echoed into a response header and written into logs, so it is
 * length-capped and character-restricted: an unvalidated id could carry CRLF
 * and forge extra response headers.
 */
export function resolveRequestId(incoming?: string | null): string {
  const candidate = (incoming || "").trim();
  if (candidate && /^[A-Za-z0-9._-]{8,64}$/.test(candidate)) return candidate;
  return crypto.randomUUID();
}
