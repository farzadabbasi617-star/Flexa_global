# Manual migrations

This project historically used `drizzle-kit push` (no migration history), so
these are small, **idempotent** SQL files you apply by hand when the schema
changes. Each uses `IF NOT EXISTS`, so they are safe to run more than once and
safe on an existing database.

## How to apply

Apply everything, in order, with the runner:

```bash
DATABASE_URL="postgresql://..." ./scripts/apply-migrations.sh
```

Preview without touching the database:

```bash
./scripts/apply-migrations.sh --dry-run
```

Resume from a specific migration:

```bash
DATABASE_URL="postgresql://..." ./scripts/apply-migrations.sh --from 0036
```

A single file can still be applied by hand:

```bash
psql "$DATABASE_URL" -f drizzle/manual/0001_add_rate_limits.sql
```

…or paste the file contents into the Neon SQL editor.

> Files are applied in lexical order. Where two share a numeric prefix
> (`0023_add_clash_1v1_entries` then `0023_harden_clash_1v1_queue`), the
> alphabetical tie-break already matches the dependency order.

## Files

| File | What it does |
|------|--------------|
| `0001_add_rate_limits.sql` | Adds the `rate_limits` table used by the distributed (DB-backed) rate limiter in `src/lib/rate-limit.ts`. |
| `0002_add_telegram_pre_registrations.sql` | Adds the `telegram_pre_registrations` table used by the Gament Telegram bot integration and admin console. |
| `0003_add_telegram_bot_sessions.sql` | Adds the `telegram_bot_sessions` table used by the free Telegram webhook running inside the Next.js web service. |
| `0004_add_telegram_account_linking.sql` | Adds `telegram_accounts` and `telegram_link_codes` for linking Telegram accounts to Gament users with one-time codes. |
| `0005_add_telegram_growth_and_notifications.sql` | Adds referral tracking and notification de-duplication for reminders, lobby notices and channel result posts. |
| `0006_add_telegram_marketing_and_waitlist.sql` | Adds campaign analytics, real coupons/redemptions, tournament waiting list and Telegram channel post tracking. |
| `0007_add_classified_ads.sql` | Adds `classified_ads` and `classified_scrape_logs` tables for monitoring Divar/Sheypoor gaming ads. |
| `0008_add_honors.sql` | Adds the persistent `honors` table for the Hall of Fame public page, admin approval flow and AI honor suggestions. |
| `0009_sync_core_schema.sql` | Adds missing core tables/columns for databases created from the early partial migration. |
| `0010_harden_registration_integrity.sql` | Adds unique indexes that prevent duplicate tournament registrations per player/user under concurrent requests. |
| `0011_add_honor_engagement.sql` | Adds `honor_views` / `honor_likes` for per-visitor engagement tracking on Hall of Fame entries. |
| `0012_add_static_honor_engagement.sql` | Adds `honor_content_views` / `honor_content_likes` so statically-defined honor content gets the same engagement tracking. |
| `0013_add_performance_indexes.sql` | Performance-only indexes for high-traffic public pages, wallet/admin panels, Telegram automation and support. Does not modify data. |
| `0014_add_store_marketplace.sql` | Adds the Store/Marketplace: KYC profiles, official + P2P listings, and escrow-based orders. |
| `0015_add_price_estimator.sql` | Adds admin-configurable per-game/per-field unit prices for the account price estimator. |
| `0016_add_store_trust_safety.sql` | Adds store trust & safety: listing warranty window, seller reviews and abuse reports. |
| `0017_add_price_memory.sql` | Adds `price_memory`, a learning cache of account valuations and confirmed real sales. |
| `0018_add_store_offers.sql` | Adds buyer→seller price-negotiation offers on user listings; acceptance creates an escrow order. |
| `0019_add_email_verification.sql` | Adds `users.email_verified_at`, backfilled for existing rows. Required for the email-OTP registration/login flow (see below). |
| `0020_add_first_last_name.sql` | Adds `users.first_name` and `users.last_name`, backfilled by splitting the existing `display_name`. Required for the "first name + last name" registration fields. |
| `0021_add_age_gate_fields.sql` | Adds age-gate identity fields for paid tournament eligibility. |
| `0022_add_registration_game_invites.sql` | Adds per-registration game invite fields for Clash Royale QR/Share Link matchmaking in the Telegram bot. |
| `0023_add_clash_1v1_entries.sql` | Adds a standalone paid Clash Royale 1V1 queue table for repeatable Telegram matchmaking entries. |
| `0023_harden_clash_1v1_queue.sql` | Hardens that queue: adds `qr_file_id`, a partial queue-artifact index, and separates legacy hand-made rooms from automated matchmaking. Runs after `0023_add_clash_1v1_entries`. |
| `0024_add_telegram_reliability.sql` | Adds incoming webhook idempotency leases and the PostgreSQL-backed outgoing Telegram message queue. |
| `0025_repair_wallet_money_types.sql` | Converts legacy text wallet/transaction money columns to `numeric(20,0)` without losing valid balances. |
| `0026_repair_telegram_sent_notifications.sql` | Repairs notification de-duplication for databases that skipped the optional Telegram growth migration. |
| `0027_add_match_result_claims.sql` | Adds independent per-player result claims so Clash Royale 1V1 settles only on agreement. |
| `0028_add_private_tournament_leaderboards.sql` | Adds Clash Royale private-tournament leaderboard OCR results and confirmed standings. |
| `0029_add_private_tournament_attendance.sql` | Adds the attendance / no-show policy tables for paid multiplayer tournaments. |
| `0030_add_clash_ready_and_tournament_end.sql` | Adds the 1V1 ready gate and an end time for scheduled private tournaments. |
| `0031_add_store_order_deadlines.sql` | Adds escrow delivery deadlines and auto-release timers to store orders. |
| `0032_add_clash_duel_modes_and_friend_challenges.sql` | Adds Clash 1V1 duel modes: random/friend opponents, free/paid stakes and negotiated matches. |
| `0033_add_media_affiliate_program.sql` | Adds the audited media-partner affiliate program: 30-day attribution, versioned OTP contracts and one 7,000-Toman commission pool per paid match. |
| `0034_add_personal_referral_program.sql` | Extends that affiliate ledger to ordinary user referrers, sharing the same per-match commission pool. |
| `0035_separate_public_and_legal_names.sql` | One-time privacy migration separating public display names from legal names. Mirrors `ensurePublicIdentitySeparation()` at runtime. |
| `0036_add_cod_mobile_room_engine.sql` | Adds the COD Mobile custom-room engine: rooms, entries, evidence, settlements, ranks and audit trail. |
| `0037_add_cod_room_reports_penalties.sql` | Adds COD room trust/safety reports, admin resolutions, warnings, fines and temporary/permanent bans. |
| `0038_add_cod_lobby_verification.sql` | Adds Telegram-based AI lobby verification records for COD custom rooms. |
| `0039_add_session_and_hot_table_indexes.sql` | Performance-only indexes for previously unindexed hot tables: `sessions` (user_id, expires_at), plus teams, judges, ai_proposals and classified_scrape_logs. |
| `0040_drop_kyc_selfie_requirement.sql` | Makes `kyc_profiles.selfie_image_url` nullable. Seller verification no longer collects a selfie; the column is kept so historical submissions stay readable. |
| `0041_widen_kyc_image_columns.sql` | Converts `kyc_profiles` image columns from `varchar(500)` to `text`. With Cloudinary unconfigured the uploader returns base64 data URLs, which overflowed the old cap and made every real KYC submission fail. |
| `0042_add_cod_room_presentation.sql` | Adds presentation columns to `cod_rooms`: `banner_image_url` (key art), `category` (home-page shelf), `original_entry_fee_rial` (struck-through price), `min_cod_level` (in-game level gate, distinct from Gament rank points), `match_settings` and `faq` (structured JSON instead of free text). Adds a partial index on `(category, starts_at)` for published rooms. |
| `0043_add_cod_prize_scaling.sql` | Adds `cod_rooms.prize_scaling`. A room advertises its prize table for a full lobby; paying those amounts to a half-empty room is a guaranteed loss. `scaled` (the default) pays the same table scaled by occupancy so the margin holds at any turnout, `fixed` keeps the old behaviour for sponsored rooms. Also carries the minimum fill below which a room should be cancelled and refunded. |
| `0044_add_arena_room_game.sql` | Adds `game` to `cod_rooms` and `cod_room_entries`. The room engine is game-agnostic apart from the player identity, region list, team sizes and invite-link format, so one engine now serves Call of Duty Mobile and Fortnite instead of forking ~1900 lines. Existing rows default to `cod_mobile`. |
| `0045_add_web_referral_attribution.sql` | Adds `affiliate_attributions.visitor_key` plus source indexes. Referral attribution was keyed only on `telegram_id` (NOT NULL, UNIQUE), so the Telegram bot was the sole entry point and every invite shared on WhatsApp, Instagram or SMS produced an unattributed signup. Web visitors now get a synthetic `web:<uuid>` key written by `/r/<code>`; existing rows are backfilled to `tg:<telegramId>`. |
| `0046_add_referral_quick_rules.sql` | Splits referral onboarding into two stages. Adds `media_partners.quick_rules_accepted_at` / `quick_rules_version` and makes `national_id` nullable. Getting a referral link previously demanded a valid Iranian national id, a 12-clause contract, six checkboxes, a signer name and an email OTP — seven steps to copy a tracking string, which a third of live users could not even begin. The link now needs only a three-line rules acceptance; the contract, national id and sheba are enforced at cash withdrawal, where they are legally required. Existing personal partners are backfilled to `legacy-full-contract` so nobody is pushed backwards. |
| `0047_add_store_featured_listings.sql` | Adds the storefront promotion columns to `store_listings`: `featured_status` (new `store_featured_status` enum), `featured_until`, `featured_rank` and the review audit fields. Promotion is time-boxed via `featured_until` so a lapsed placement stops showing without a cron having to run, and approval is a separate state from the listing's own status so a paid slot still passes moderation before reaching the front page. Includes a partial index covering the carousel query. |

> **Email verification (required before deploying the email-OTP auth flow):**
> Run `0019_add_email_verification.sql` and set `RESEND_API_KEY` (and
> optionally `RESEND_FROM_EMAIL`) in your environment. Without a configured
> Resend key, `EmailService` still generates and stores the OTP (so nothing
> crashes) but doesn't actually deliver an email — the code is only returned
> to the client in non-production environments for local testing.

> Note: the rate limiter **fails open** — if this table is missing or the DB
> errors, requests are still allowed (and the issue is logged), so forgetting
> to run the migration won't take the site down. But the limiter won't actually
> throttle until the table exists.
