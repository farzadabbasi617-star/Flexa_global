import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { sql } from "drizzle-orm";

const PUBLIC_IDENTITY_MIGRATION_KEY = "public_identity_separation_v1";

let migrationPromise: Promise<void> | null = null;

async function runPublicIdentityMigration() {
  await db.transaction(async (tx) => {
    // The marker is inserted in the same transaction as the data migration.
    // This makes the operation safe when several Render instances start at once.
    const inserted = await tx
      .insert(siteSettings)
      .values({
        key: PUBLIC_IDENTITY_MIGRATION_KEY,
        value: new Date().toISOString(),
      })
      .onConflictDoNothing({ target: siteSettings.key })
      .returning({ id: siteSettings.id });

    if (!inserted.length) return;

    // Older registrations used the legal name as the public display name.
    // Replace only that exact legacy default; custom nicknames are untouched.
    await tx.execute(sql.raw(`
      UPDATE users
      SET display_name = username
      WHERE username IS NOT NULL
        AND btrim(username) <> ''
        AND btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))) <> ''
        AND lower(btrim(display_name)) = lower(btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))))
    `));

    // Matchmaking and leaderboards read from players, so keep its public
    // profile snapshot aligned with the users table as part of the migration.
    await tx.execute(sql.raw(`
      UPDATE players AS player
      SET display_name = app_user.display_name,
          avatar_url = app_user.avatar_url
      FROM users AS app_user
      WHERE player.user_id = app_user.id
        AND (
          player.display_name IS DISTINCT FROM app_user.display_name
          OR player.avatar_url IS DISTINCT FROM app_user.avatar_url
        )
    `));
  });
}

/** Idempotent one-time privacy migration for accounts created before this fix. */
export function ensurePublicIdentitySeparation() {
  if (!migrationPromise) {
    migrationPromise = runPublicIdentityMigration().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}
