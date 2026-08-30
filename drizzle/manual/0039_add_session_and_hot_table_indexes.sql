-- Performance-only indexes for tables that are read on hot paths but were
-- never indexed. These statements do not modify or delete data.
--
-- NOTE: CREATE INDEX CONCURRENTLY must be run outside an explicit transaction.
-- If your client wraps files in a transaction (some GUIs do), drop the
-- CONCURRENTLY keyword — these tables are small enough for a brief lock.

-- ── sessions ──────────────────────────────────────────────────────────────
-- `token` is already indexed by its UNIQUE constraint, which covers the hot
-- validateSession() lookup. These two cover the remaining access patterns:
--
--   user_id    → GET /api/auth/sessions (the "my devices" list),
--                DELETE-all-sessions on password reset, and admin user delete.
--   expires_at → expired-session cleanup sweeps.
--
-- Without them both degrade into a sequential scan that grows with every
-- login the platform ever performs.
create index concurrently if not exists sessions_user_id_idx
  on sessions (user_id);

create index concurrently if not exists sessions_expires_at_idx
  on sessions (expires_at);

-- Note: site_images.slug and site_settings.key are already covered by their
-- UNIQUE constraints, so no extra index is needed for those lookups.

-- ── teams ─────────────────────────────────────────────────────────────────
-- Owner lookups ("my team") and the created-at ordered team list.
create index concurrently if not exists teams_owner_id_idx
  on teams (owner_id);

create index concurrently if not exists teams_created_at_idx
  on teams (created_at desc);

-- ── judges ────────────────────────────────────────────────────────────────
-- Active-judge lists ordered by creation date.
create index concurrently if not exists judges_is_active_created_at_idx
  on judges (is_active, created_at desc);

create index concurrently if not exists judges_user_id_idx
  on judges (user_id)
  where user_id is not null;

-- ── ai_proposals ──────────────────────────────────────────────────────────
-- Admin review queue filters by status, newest first; target lookups resolve
-- a proposal back to the match/user it refers to.
create index concurrently if not exists ai_proposals_status_created_at_idx
  on ai_proposals (status, created_at desc);

create index concurrently if not exists ai_proposals_target_id_idx
  on ai_proposals (target_id);

-- ── classified_scrape_logs ────────────────────────────────────────────────
-- Only ever read as "most recent runs first".
create index concurrently if not exists classified_scrape_logs_created_at_idx
  on classified_scrape_logs (created_at desc);
