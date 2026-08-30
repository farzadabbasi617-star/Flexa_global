export function normalizeDatabaseUrl(rawUrl: string | undefined | null) {
  if (!rawUrl) return undefined;

  let url = rawUrl.trim();

  // Sometimes values are pasted as DATABASE_URL=... into a Render value field.
  if (url.startsWith("DATABASE_URL=")) {
    url = url.slice("DATABASE_URL=".length).trim();
  }

  // Remove wrapping quotes if they were pasted into the Render value field.
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }

  // Browser/Markdown copies may HTML-escape query separators.
  url = url.replaceAll("&amp;", "&");

  // `sslmode=require` currently verifies certificates in node-postgres, but its
  // announced future semantics are weaker. Normalize managed PostgreSQL URLs
  // to the explicit, future-proof verification mode. DB_SSL_NO_VERIFY remains
  // the deliberate escape hatch for a private host with a self-signed cert.
  url = url.replace(/([?&])sslmode=require(?=(&|$))/gi, "$1sslmode=verify-full");

  // Chat apps can turn password@host into markdown mailto links:
  // postgresql://user:[password@host](mailto:password@host)/db?... -> postgresql://user:password@host/db?...
  url = url.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)\[([^\]]+)\]\(mailto:[^)]+\)/i, "$1$2");

  return url;
}

export function isLikelyPostgresUrl(url: string | undefined) {
  return Boolean(url && /^postgres(?:ql)?:\/\//i.test(url));
}
