import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { isLikelyPostgresUrl, normalizeDatabaseUrl } from "./src/lib/database-url";

/**
 * Drizzle Kit configuration.
 *
 * IMPORTANT: the database connection string is read from the DATABASE_URL
 * environment variable (see .env.example). Never hard-code credentials in
 * this file — it is committed to git.
 */
const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

if (!databaseUrl || !isLikelyPostgresUrl(databaseUrl)) {
  throw new Error(
    "DATABASE_URL is not set or is not a valid PostgreSQL URL. It must start with postgresql://"
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
