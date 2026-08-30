import { and, count, desc, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import { codReadinessBlockers, evaluateCodRoomReadiness, type CodReadinessIssue } from "./cod-room-readiness";
import { codCredentialDenialMessage, decideCodCredentialAccess } from "./cod-credential-access";
import { arenaGameConfig, isArenaGame, isOfficialInviteUrl, type ArenaGame } from "./arena-games";
import { db } from "@/db";
import {
  affiliateAttributions,
  affiliateCommissionEvents,
  affiliateCommissionShares,
  codPlayerRanks,
  codRoomAuditEvents,
  codRoomEntries,
  codRoomEvidence,
  codRoomLobbyChecks,
  codRoomPenalties,
  codRoomReports,
  codRooms,
  codRoomSettlements,
  codRoomStaff,
  mediaPartners,
  notifications,
  players,
  transactions,
  users,
  wallets,
} from "@/db/schema";
import {
  COD_BR_TEAM_MODES,
  COD_REGIONS,
  COD_ROOM_STATUSES,
  calculateCodEntryReward,
  canTransitionCodRoomStatus,
  codRankPointsForResult,
  codRankTier,
  codReferralCommissionRial,
  estimateCodRoomMaximumLiability,
  codKillBudgetScaleBps,
  codPrizeScaleBps,
  normalizeCodBannerUrl,
  normalizeCodPrizeScaling,
  projectCodPrizeTable,
  normalizeCodFaq,
  normalizeCodMatchSettings,
  isOfficialCodMobileInviteUrl,
  normalizeCodRewardConfig,
  shouldRevealCodRoomCredentials,
  type CodBrTeamMode,
  type CodRegion,
  type CodRoomStatus,
} from "@/lib/cod-room-policy";
import { checkAgeGate } from "@/lib/age-gate";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { safeParseAIJson } from "@/lib/ai-utils";
import { affiliateAccrualLiveForUsers, ensureAffiliateSchema, AFFILIATE_HOLD_HOURS } from "@/lib/affiliate-service";
import { ensureWalletMoneySchema, updateWalletBalanceSafely } from "@/lib/wallet-balance-service";
import { runtimeSchemaDdlEnabled } from "@/lib/runtime-schema-guard";
import { bigIntFromText } from "@/lib/money";

export const COD_ARENA_REFERRAL_DEFAULT_BPS = 2000;
export const COD_ARENA_DAILY_REFERRAL_ENTRY_CAP = 3;

export function codArenaFinanceState() {
  // Two independent switches prevent an accidental Render toggle from moving
  // private-beta entries or rewards. Legal/finance approval must be explicit.
  const liveSwitch = process.env.COD_ARENA_LIVE === "true";
  const financeApproved = process.env.COD_ARENA_FINANCE_APPROVED === "true";
  const live = liveSwitch && financeApproved;
  return {
    live,
    privateBeta: !live,
    mode: live ? "live" : "shadow",
    liveSwitch,
    financeApproved,
    entryDebitsEnabled: live,
    prizePayoutsEnabled: live,
    referralAccrualEnabled: live,
  };
}

export function codArenaLive() {
  return codArenaFinanceState().live;
}

let codSchemaPromise: Promise<void> | null = null;

async function createCodArenaSchema(client: any) {
  await ensureAffiliateSchema(client);
  await client.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cod_mobile_region varchar(16) NOT NULL DEFAULT 'global'`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(180) NOT NULL, description text,
    region varchar(16) NOT NULL DEFAULT 'global', map varchar(40) NOT NULL DEFAULT 'isolated',
    team_mode varchar(16) NOT NULL DEFAULT 'solo', perspective varchar(8) NOT NULL DEFAULT 'tpp',
    status varchar(24) NOT NULL DEFAULT 'draft', is_published boolean NOT NULL DEFAULT false,
    capacity integer NOT NULL DEFAULT 40, entry_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
    service_fee_rial numeric(20,0) NOT NULL DEFAULT 0, prize_budget_rial numeric(20,0) NOT NULL DEFAULT 0,
    referral_rate_bps integer NOT NULL DEFAULT 2000, reward_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    min_rank_points integer NOT NULL DEFAULT 0, rules text, rules_version varchar(40) NOT NULL DEFAULT 'cod-beta-1',
    requires_recording boolean NOT NULL DEFAULT true, room_code varchar(100), room_password varchar(100),
    official_join_url text, check_in_opens_at timestamp, check_in_closes_at timestamp,
    credentials_reveal_at timestamp, starts_at timestamp NOT NULL, ends_at timestamp,
    created_by_id uuid REFERENCES users(id), created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
  )`));
  const constraints = [
    `DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_cod_mobile_region_check CHECK (cod_mobile_region IN ('global','garena')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    // Union of every supported game's regions and team modes (migration 0044).
    // Per-game validity lives in arena-games.ts.
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_region_check CHECK (region IN ('global','garena','eu','nae','naw','me','asia','oce','brazil')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_team_mode_check CHECK (team_mode IN ('solo','duo','trio','squad')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_perspective_check CHECK (perspective IN ('fpp','tpp')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_capacity_check CHECK (capacity BETWEEN 2 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_money_check CHECK (entry_fee_rial >= 0 AND service_fee_rial >= 0 AND prize_budget_rial >= 0 AND service_fee_rial <= entry_fee_rial); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_referral_bps_check CHECK (referral_rate_bps BETWEEN 0 AND 10000); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ];
  for (const statement of constraints) await client.execute(sql.raw(statement));
  // Presentation columns (migration 0042): key art, shelf grouping, struck-through
  // price, in-game level gate, structured settings and FAQ.
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS banner_image_url text`));
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS category varchar(60)`));
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS original_entry_fee_rial numeric(20,0)`));
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS min_cod_level integer NOT NULL DEFAULT 0`));
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS match_settings jsonb NOT NULL DEFAULT '{}'::jsonb`));
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb`));
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS prize_scaling jsonb NOT NULL DEFAULT '{}'::jsonb`));
  await client.execute(sql.raw(`ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS game varchar(24) NOT NULL DEFAULT 'cod_mobile'`));
  await client.execute(sql.raw(`ALTER TABLE cod_room_entries ADD COLUMN IF NOT EXISTS game varchar(24) NOT NULL DEFAULT 'cod_mobile'`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_rooms_category_start_idx ON cod_rooms(category,starts_at) WHERE is_published = true`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_rooms_status_start_idx ON cod_rooms(status,starts_at)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_rooms_region_published_idx ON cod_rooms(region,is_published)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    user_id uuid NOT NULL REFERENCES users(id), role varchar(20) NOT NULL, assigned_at timestamp NOT NULL DEFAULT now(),
    UNIQUE(room_id,user_id,role)
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_staff ADD CONSTRAINT cod_room_staff_role_check CHECK (role IN ('roomer','spectator','judge')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_staff_user_idx ON cod_room_staff(user_id)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    user_id uuid NOT NULL REFERENCES users(id), player_id uuid REFERENCES players(id), team_id uuid REFERENCES teams(id),
    cod_uid_snapshot varchar(100) NOT NULL, cod_username_snapshot varchar(100) NOT NULL, region varchar(16) NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'registered', payment_mode varchar(16) NOT NULL DEFAULT 'shadow',
    entry_fee_rial numeric(20,0) NOT NULL DEFAULT 0, service_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
    payment_transaction_id uuid REFERENCES transactions(id), rules_version varchar(40) NOT NULL,
    rules_accepted_at timestamp NOT NULL, checked_in_at timestamp, joined_at timestamp, kills integer, placement integer,
    reward_rial numeric(20,0) NOT NULL DEFAULT 0, result_status varchar(24) NOT NULL DEFAULT 'pending',
    settled_at timestamp, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
    UNIQUE(room_id,user_id)
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_entries ADD CONSTRAINT cod_room_entries_region_check CHECK (region IN ('global','garena')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_entries ADD CONSTRAINT cod_room_entries_money_check CHECK (entry_fee_rial >= 0 AND service_fee_rial >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_entries_room_status_idx ON cod_room_entries(room_id,status)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_entries_user_created_idx ON cod_room_entries(user_id,created_at)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    entry_id uuid REFERENCES cod_room_entries(id), uploaded_by_id uuid NOT NULL REFERENCES users(id),
    kind varchar(24) NOT NULL, file_url text NOT NULL, content_hash varchar(64),
    status varchar(20) NOT NULL DEFAULT 'pending', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_evidence ADD CONSTRAINT cod_room_evidence_kind_check CHECK (kind IN ('profile','scoreboard','recording','lobby_recording','dispute')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_evidence_room_kind_idx ON cod_room_evidence(room_id,kind)`));
  await client.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS cod_room_evidence_room_hash_unique ON cod_room_evidence(room_id,content_hash) WHERE content_hash IS NOT NULL`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    entry_id uuid NOT NULL REFERENCES cod_room_entries(id), kills integer NOT NULL DEFAULT 0, placement integer,
    kill_reward_rial numeric(20,0) NOT NULL DEFAULT 0, placement_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
    participation_reward_rial numeric(20,0) NOT NULL DEFAULT 0, total_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
    status varchar(20) NOT NULL DEFAULT 'shadow', reward_transaction_id uuid REFERENCES transactions(id),
    verified_by_id uuid REFERENCES users(id), verified_at timestamp, created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(), UNIQUE(room_id,entry_id)
  )`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_settlements_status_idx ON cod_room_settlements(status)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_player_ranks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), region varchar(16) NOT NULL,
    points integer NOT NULL DEFAULT 0, tier varchar(20) NOT NULL DEFAULT 'rookie', verified_rooms integer NOT NULL DEFAULT 0,
    total_kills integer NOT NULL DEFAULT 0, wins integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now(), UNIQUE(user_id,region)
  )`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_player_ranks_region_points_idx ON cod_player_ranks(region,points DESC)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    actor_id uuid REFERENCES users(id), event_type varchar(40) NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_audit_room_created_idx ON cod_room_audit_events(room_id,created_at)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    reporter_id uuid NOT NULL REFERENCES users(id), accused_entry_id uuid REFERENCES cod_room_entries(id),
    accused_user_id uuid REFERENCES users(id), accused_cod_username varchar(100), category varchar(32) NOT NULL,
    description text NOT NULL, evidence_url text, status varchar(24) NOT NULL DEFAULT 'pending',
    resolution varchar(40), admin_note text, reviewed_by_id uuid REFERENCES users(id), reviewed_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_reports ADD CONSTRAINT cod_room_reports_category_check CHECK (category IN ('cheat','teaming','no_recording','banned_item','toxic_behavior','wrong_result','no_show','other')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_reports ADD CONSTRAINT cod_room_reports_status_check CHECK (status IN ('pending','in_review','resolved','rejected')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_reports_room_status_idx ON cod_room_reports(room_id,status,created_at DESC)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_reports_reporter_idx ON cod_room_reports(reporter_id,created_at DESC)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_reports_accused_user_idx ON cod_room_reports(accused_user_id,created_at DESC) WHERE accused_user_id IS NOT NULL`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_penalties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid REFERENCES cod_rooms(id), report_id uuid REFERENCES cod_room_reports(id),
    entry_id uuid REFERENCES cod_room_entries(id), user_id uuid NOT NULL REFERENCES users(id), type varchar(24) NOT NULL,
    reason text NOT NULL, fine_rial numeric(20,0) NOT NULL DEFAULT 0, status varchar(20) NOT NULL DEFAULT 'active',
    starts_at timestamp NOT NULL DEFAULT now(), ends_at timestamp, created_by_id uuid REFERENCES users(id),
    created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_penalties ADD CONSTRAINT cod_room_penalties_type_check CHECK (type IN ('warning','fine','temp_ban','permanent_ban','result_void')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_penalties ADD CONSTRAINT cod_room_penalties_status_check CHECK (status IN ('active','paid','reversed','expired')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_penalties ADD CONSTRAINT cod_room_penalties_fine_check CHECK (fine_rial >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_penalties_user_active_idx ON cod_room_penalties(user_id,status,starts_at DESC)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_penalties_room_idx ON cod_room_penalties(room_id,created_at DESC) WHERE room_id IS NOT NULL`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_penalties_report_idx ON cod_room_penalties(report_id) WHERE report_id IS NOT NULL`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_lobby_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    uploaded_by_id uuid NOT NULL REFERENCES users(id), telegram_file_id text, telegram_file_unique_id text,
    source_kind varchar(24) NOT NULL DEFAULT 'telegram_photo', status varchar(24) NOT NULL DEFAULT 'manual_review',
    extracted_usernames jsonb NOT NULL DEFAULT '[]'::jsonb, matched_usernames jsonb NOT NULL DEFAULT '[]'::jsonb,
    unauthorized_usernames jsonb NOT NULL DEFAULT '[]'::jsonb, missing_checked_in_usernames jsonb NOT NULL DEFAULT '[]'::jsonb,
    matched_count integer NOT NULL DEFAULT 0, unauthorized_count integer NOT NULL DEFAULT 0, missing_checked_in_count integer NOT NULL DEFAULT 0,
    confidence integer NOT NULL DEFAULT 0, ai_provider varchar(30), ai_model varchar(120), raw_ai_response text,
    operator_note text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_lobby_checks ADD CONSTRAINT cod_room_lobby_checks_status_check CHECK (status IN ('verified','flagged','manual_review','failed')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_lobby_checks ADD CONSTRAINT cod_room_lobby_checks_counts_check CHECK (matched_count >= 0 AND unauthorized_count >= 0 AND missing_checked_in_count >= 0 AND confidence BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_lobby_checks_room_created_idx ON cod_room_lobby_checks(room_id,created_at DESC)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_lobby_checks_status_idx ON cod_room_lobby_checks(status,created_at DESC)`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ALTER COLUMN match_id DROP NOT NULL`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ADD COLUMN IF NOT EXISTS source_type varchar(30) NOT NULL DEFAULT 'clash_match'`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ADD COLUMN IF NOT EXISTS source_id varchar(100)`));
  await client.execute(sql.raw(`UPDATE affiliate_commission_events SET source_type='clash_match',source_id=match_id::text WHERE source_id IS NULL AND match_id IS NOT NULL`));
  await client.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commission_events_source_unique_idx ON affiliate_commission_events(source_type,source_id) WHERE source_id IS NOT NULL`));
}

export function ensureCodArenaSchema(client: any = db) {
  if (client !== db) return createCodArenaSchema(client);

  // The COD engine schema ships as reviewed migrations (0036/0037/0038).
  // Running the same DDL from a request handler would take ACCESS EXCLUSIVE
  // locks on the paid join/settlement path, so it is off in production.
  // See runtime-schema-guard.ts.
  if (!runtimeSchemaDdlEnabled()) return Promise.resolve();

  if (!codSchemaPromise) {
    codSchemaPromise = createCodArenaSchema(client).catch((error) => {
      codSchemaPromise = null;
      throw error;
    });
  }
  return codSchemaPromise;
}

function moneyString(value: unknown, field: string) {
  const text = String(value ?? "0").trim();
  if (!/^\d+$/.test(text)) throw new Error(`${field} باید مبلغ صحیح و غیرمنفی باشد`);
  return BigInt(text).toString();
}

function dateValue(value: unknown, field: string, required = false) {
  if (!value) {
    if (required) throw new Error(`${field} الزامی است`);
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${field} معتبر نیست`);
  return date;
}

export function normalizeCodRoomInput(raw: Record<string, unknown>) {
  const title = String(raw.title || "").trim();
  if (title.length < 3 || title.length > 180) throw new Error("عنوان روم باید بین ۳ تا ۱۸۰ کاراکتر باشد");
  const game = (isArenaGame(raw.game) ? raw.game : "cod_mobile") as ArenaGame;
  const gameConfig = arenaGameConfig(game);
  const region = String(raw.region || gameConfig.defaults.region) as CodRegion;
  const teamMode = String(raw.teamMode || gameConfig.defaults.teamMode) as CodBrTeamMode;
  const status = String(raw.status || "draft") as CodRoomStatus;
  if (!gameConfig.regions.includes(region)) throw new Error(`ریجن برای ${gameConfig.label} معتبر نیست`);
  if (!gameConfig.teamModes.includes(teamMode)) throw new Error("حالت تیم معتبر نیست");
  if (!(COD_ROOM_STATUSES as readonly string[]).includes(status)) throw new Error("وضعیت روم معتبر نیست");
  const capacity = Number(raw.capacity ?? 40);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 100) throw new Error("ظرفیت روم باید بین ۲ تا ۱۰۰ باشد");
  const perspective = String(raw.perspective || "tpp").toLowerCase();
  if (!["fpp", "tpp"].includes(perspective)) throw new Error("زاویه دید معتبر نیست");
  const entryFeeRial = moneyString(raw.entryFeeRial, "ورودی");
  const serviceFeeRial = moneyString(raw.serviceFeeRial, "کارمزد خدمات");
  const prizeBudgetRial = moneyString(raw.prizeBudgetRial, "بودجه جایزه");
  if (BigInt(serviceFeeRial) > BigInt(entryFeeRial)) throw new Error("کارمزد خدمات نمی‌تواند از ورودی بیشتر باشد");
  const referralRateBps = Number(raw.referralRateBps ?? COD_ARENA_REFERRAL_DEFAULT_BPS);
  if (!Number.isInteger(referralRateBps) || referralRateBps < 0 || referralRateBps > 10_000) throw new Error("درصد معرفی معتبر نیست");
  const minRankPoints = Number(raw.minRankPoints || 0);
  if (!Number.isInteger(minRankPoints) || minRankPoints < 0 || minRankPoints > 1_000_000) throw new Error("حداقل امتیاز رنک معتبر نیست");
  const startsAt = dateValue(raw.startsAt, "زمان شروع", true)!;
  const checkInOpensAt = dateValue(raw.checkInOpensAt, "شروع Check-in") || new Date(startsAt.getTime() - 45 * 60_000);
  const checkInClosesAt = dateValue(raw.checkInClosesAt, "پایان Check-in") || new Date(startsAt.getTime() + 5 * 60_000);
  const credentialsRevealAt = dateValue(raw.credentialsRevealAt, "زمان نمایش اطلاعات") || new Date(startsAt.getTime() - 15 * 60_000);
  const endsAt = dateValue(raw.endsAt, "زمان پایان");
  if (checkInOpensAt >= checkInClosesAt) throw new Error("بازه Check-in معتبر نیست");
  if (credentialsRevealAt > startsAt) throw new Error("اطلاعات ورود باید قبل از شروع روم منتشر شود");
  if (endsAt && endsAt <= startsAt) throw new Error("زمان پایان باید بعد از شروع باشد");
  const rewardConfig = normalizeCodRewardConfig(raw.rewardConfig);
  const maximumLiability = estimateCodRoomMaximumLiability(rewardConfig, capacity, teamMode);
  const isPublished = Boolean(raw.isPublished);
  if (isPublished && status === "draft") throw new Error("روم Draft قبل از انتشار باید وارد وضعیت ثبت‌نام شود");
  if (isPublished && maximumLiability > BigInt(prizeBudgetRial)) {
    throw new Error(`بودجه جایزه برای حداکثر تعهد کافی نیست؛ حداقل ${maximumLiability.toString()} USD لازم است`);
  }
  const officialJoinUrl = raw.officialJoinUrl ? String(raw.officialJoinUrl).trim() : null;
  if (officialJoinUrl && !isOfficialInviteUrl(game, officialJoinUrl)) {
    throw new Error(gameConfig.inviteLink
      ? `فقط لینک رسمی دعوت ${gameConfig.label} پذیرفته می‌شود`
      : `${gameConfig.label} لینک دعوت رسمی ندارد؛ از کد روم استفاده کن`);
  }
  const minCodLevel = Number(raw.minCodLevel || 0);
  if (!Number.isInteger(minCodLevel) || minCodLevel < 0 || minCodLevel > 500) throw new Error("حداقل لول کالاف معتبر نیست");
  const bannerImageUrl = normalizeCodBannerUrl(raw.bannerImageUrl);
  const originalEntryFeeRial = raw.originalEntryFeeRial == null || String(raw.originalEntryFeeRial).trim() === ""
    ? null
    : moneyString(raw.originalEntryFeeRial, "قیمت قبل از تخفیف");
  if (originalEntryFeeRial && BigInt(originalEntryFeeRial) <= BigInt(entryFeeRial)) {
    throw new Error("قیمت قبل از تخفیف باید از ورودی فعلی بیشتر باشد");
  }
  const matchSettings = normalizeCodMatchSettings(raw.matchSettings);
  const prizeScaling = normalizeCodPrizeScaling(raw.prizeScaling);
  const faq = normalizeCodFaq(raw.faq);
  return {
    game,
    title,
    description: raw.description ? String(raw.description).trim().slice(0, 3000) : null,
    region,
    map: String(raw.map || "isolated").trim().slice(0, 40),
    teamMode,
    perspective,
    status,
    isPublished,
    capacity,
    entryFeeRial,
    serviceFeeRial,
    prizeBudgetRial,
    referralRateBps,
    rewardConfig,
    minRankPoints,
    minCodLevel,
    bannerImageUrl,
    category: raw.category ? String(raw.category).trim().slice(0, 60) : null,
    originalEntryFeeRial,
    matchSettings,
    prizeScaling,
    faq,
    rules: raw.rules ? String(raw.rules).trim().slice(0, 12_000) : null,
    rulesVersion: String(raw.rulesVersion || "cod-beta-1").trim().slice(0, 40),
    requiresRecording: raw.requiresRecording !== false,
    roomCode: raw.roomCode ? String(raw.roomCode).trim().slice(0, 100) : null,
    roomPassword: raw.roomPassword ? String(raw.roomPassword).trim().slice(0, 100) : null,
    officialJoinUrl,
    checkInOpensAt,
    checkInClosesAt,
    credentialsRevealAt,
    startsAt,
    endsAt,
    maximumLiabilityRial: maximumLiability.toString(),
  };
}

export async function listCodRooms(input: { includeUnpublished?: boolean; region?: string | null; game?: string | null; limit?: number } = {}) {
  await ensureCodArenaSchema();
  const conditions = [];
  if (!input.includeUnpublished) {
    conditions.push(eq(codRooms.isPublished, true));
    conditions.push(inArray(codRooms.status, ["registration", "check_in", "lobby_open", "in_progress", "settling"]));
  }
  if (input.region) conditions.push(eq(codRooms.region, input.region));
  if (isArenaGame(input.game)) conditions.push(eq(codRooms.game, input.game));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
  return db.select({
    id: codRooms.id,
    game: codRooms.game,
    title: codRooms.title,
    description: codRooms.description,
    region: codRooms.region,
    map: codRooms.map,
    teamMode: codRooms.teamMode,
    perspective: codRooms.perspective,
    status: codRooms.status,
    isPublished: codRooms.isPublished,
    capacity: codRooms.capacity,
    entryFeeRial: codRooms.entryFeeRial,
    serviceFeeRial: codRooms.serviceFeeRial,
    prizeBudgetRial: codRooms.prizeBudgetRial,
    rewardConfig: codRooms.rewardConfig,
    minRankPoints: codRooms.minRankPoints,
    minCodLevel: codRooms.minCodLevel,
    bannerImageUrl: codRooms.bannerImageUrl,
    category: codRooms.category,
    originalEntryFeeRial: codRooms.originalEntryFeeRial,
    matchSettings: codRooms.matchSettings,
    prizeScaling: codRooms.prizeScaling,
    requiresRecording: codRooms.requiresRecording,
    checkInOpensAt: codRooms.checkInOpensAt,
    checkInClosesAt: codRooms.checkInClosesAt,
    credentialsRevealAt: codRooms.credentialsRevealAt,
    startsAt: codRooms.startsAt,
    endsAt: codRooms.endsAt,
    createdAt: codRooms.createdAt,
    registeredCount: count(codRoomEntries.id),
  }).from(codRooms)
    .leftJoin(codRoomEntries, eq(codRoomEntries.roomId, codRooms.id))
    .where(where)
    .groupBy(codRooms.id)
    .orderBy(codRooms.startsAt)
    .limit(Math.min(Math.max(input.limit || 100, 1), 300));
}

export async function getCodRoomDetail(roomId: string, viewerId?: string | null, isAdmin = false) {
  await ensureCodArenaSchema();
  const [room] = await db.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
  if (!room) return null;
  const entries = await db.select({
    id: codRoomEntries.id,
    userId: codRoomEntries.userId,
    status: codRoomEntries.status,
    checkedInAt: codRoomEntries.checkedInAt,
    kills: codRoomEntries.kills,
    placement: codRoomEntries.placement,
    paymentTransactionId: codRoomEntries.paymentTransactionId,
    paymentMode: codRoomEntries.paymentMode,
    rewardRial: codRoomEntries.rewardRial,
    resultStatus: codRoomEntries.resultStatus,
    codUsername: codRoomEntries.codUsernameSnapshot,
    displayName: users.displayName,
    rankPoints: codPlayerRanks.points,
    rankTier: codPlayerRanks.tier,
  }).from(codRoomEntries)
    .innerJoin(users, eq(codRoomEntries.userId, users.id))
    .leftJoin(codPlayerRanks, and(eq(codPlayerRanks.userId, codRoomEntries.userId), eq(codPlayerRanks.region, room.region)))
    .where(eq(codRoomEntries.roomId, roomId))
    .orderBy(codRoomEntries.createdAt);
  const myEntry = viewerId ? entries.find((entry) => entry.userId === viewerId) : undefined;
  const [staff] = viewerId ? await db.select({ role: codRoomStaff.role }).from(codRoomStaff)
    .where(and(eq(codRoomStaff.roomId, roomId), eq(codRoomStaff.userId, viewerId))).limit(1) : [];
  const privileged = isAdmin || Boolean(staff);
  if (!room.isPublished && !privileged && !myEntry) return { forbidden: true as const };
  // Payment is now an explicit condition, not something inferred from the
  // existence of an entry row.
  const credentialAccess = decideCodCredentialAccess({
    isPrivileged: privileged,
    entry: myEntry ? {
      status: myEntry.status,
      checkedInAt: myEntry.checkedInAt,
      paymentTransactionId: myEntry.paymentTransactionId,
      paymentMode: myEntry.paymentMode,
    } : null,
    entryFeeRial: room.entryFeeRial,
    revealAt: room.credentialsRevealAt,
    status: room.status as CodRoomStatus,
  });
  const reveal = credentialAccess.allowed;
  const [evidenceRow] = privileged ? await db.select({ value: count() }).from(codRoomEvidence).where(eq(codRoomEvidence.roomId, roomId)) : [{ value: 0 }];
  const [latestLobbyCheck] = privileged ? await db.select({
    id: codRoomLobbyChecks.id,
    status: codRoomLobbyChecks.status,
    matchedCount: codRoomLobbyChecks.matchedCount,
    unauthorizedCount: codRoomLobbyChecks.unauthorizedCount,
    missingCheckedInCount: codRoomLobbyChecks.missingCheckedInCount,
    confidence: codRoomLobbyChecks.confidence,
    unauthorizedUsernames: codRoomLobbyChecks.unauthorizedUsernames,
    missingCheckedInUsernames: codRoomLobbyChecks.missingCheckedInUsernames,
    createdAt: codRoomLobbyChecks.createdAt,
  }).from(codRoomLobbyChecks).where(eq(codRoomLobbyChecks.roomId, roomId)).orderBy(desc(codRoomLobbyChecks.createdAt)).limit(1) : [null as any];
  return {
    ...room,
    roomCode: reveal ? room.roomCode : null,
    roomPassword: reveal ? room.roomPassword : null,
    officialJoinUrl: reveal ? room.officialJoinUrl : null,
    credentialsVisible: reveal,
    credentialsHiddenReason: reveal ? null : credentialAccess.reason,
    credentialsHiddenMessage: reveal ? null : codCredentialDenialMessage(credentialAccess.reason),
    // What the prize table pays at the room's current occupancy, so a player is
    // never shown a headline they will not actually receive.
    prizeProjection: projectCodPrizeTable({
      rewardConfig: room.rewardConfig,
      scaling: room.prizeScaling,
      registeredCount: entries.length,
      capacity: room.capacity,
      teamMode: room.teamMode as CodBrTeamMode,
    }),
    checkInAvailable: Boolean(myEntry && !myEntry.checkedInAt &&
      (!room.checkInOpensAt || new Date() >= room.checkInOpensAt) &&
      (!room.checkInClosesAt || new Date() <= room.checkInClosesAt)),
    registeredCount: entries.length,
    myEntry: myEntry ? { ...myEntry, userId: undefined } : null,
    staffRole: staff?.role || null,
    evidenceCount: Number(evidenceRow?.value || 0),
    latestLobbyCheck: latestLobbyCheck || null,
    entries: (privileged || myEntry ? entries : []).map((entry) => ({
      id: privileged ? entry.id : undefined,
      displayName: entry.displayName,
      codUsername: entry.codUsername,
      status: entry.status,
      checkedIn: Boolean(entry.checkedInAt),
      rankPoints: Number(entry.rankPoints || 0),
      rankTier: entry.rankTier || "rookie",
      ...(privileged || entry.userId === viewerId ? { kills: entry.kills, placement: entry.placement, rewardRial: entry.rewardRial, resultStatus: entry.resultStatus } : {}),
    })),
  };
}

export async function joinCodRoom(input: { roomId: string; userId: string; rulesAccepted: boolean; ip?: string }) {
  await Promise.all([ensureCodArenaSchema(), ensureWalletMoneySchema()]);
  if (!input.rulesAccepted) throw new Error("COD_RULES_REQUIRED");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${input.roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, input.roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    if (room.status !== "registration") throw new Error("COD_REGISTRATION_CLOSED");
    if (room.startsAt <= new Date()) throw new Error("COD_REGISTRATION_CLOSED");
    const [account] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!account) throw new Error("COD_USER_NOT_FOUND");
    const [activeBan] = await tx.select({ id: codRoomPenalties.id, type: codRoomPenalties.type, endsAt: codRoomPenalties.endsAt }).from(codRoomPenalties).where(and(
      eq(codRoomPenalties.userId, account.id),
      eq(codRoomPenalties.status, "active"),
      inArray(codRoomPenalties.type, ["temp_ban", "permanent_ban"]),
      sql`(${codRoomPenalties.endsAt} IS NULL OR ${codRoomPenalties.endsAt} > now())`,
    )).limit(1);
    if (activeBan) throw new Error(activeBan.type === "permanent_ban" ? "COD_USER_PERMANENT_BANNED" : "COD_USER_TEMP_BANNED");
    if (!room.isPublished && account.role !== "admin" && account.role !== "super_admin") {
      const [betaStaff] = await tx.select({ id: codRoomStaff.id }).from(codRoomStaff)
        .where(and(eq(codRoomStaff.roomId, room.id), eq(codRoomStaff.userId, account.id))).limit(1);
      if (!betaStaff) throw new Error("COD_ROOM_NOT_FOUND");
    }
    // Each game keeps its own in-game identity on `users`; check the one this
    // room is actually for.
    const roomGameConfig = arenaGameConfig(room.game);
    const profile = account as unknown as Record<string, string | null>;
    const playerGameId = profile[roomGameConfig.profileFields.id];
    const playerGameName = profile[roomGameConfig.profileFields.username];
    if (!playerGameId || !playerGameName) throw new Error("COD_PROFILE_REQUIRED");
    // Only games that partition players by region enforce a region match.
    if (roomGameConfig.profileFields.region) {
      const playerRegion = profile[roomGameConfig.profileFields.region];
      if (playerRegion !== room.region) throw new Error("COD_REGION_MISMATCH");
    }
    const [existing] = await tx.select({ id: codRoomEntries.id }).from(codRoomEntries)
      .where(and(eq(codRoomEntries.roomId, room.id), eq(codRoomEntries.userId, account.id))).limit(1);
    if (existing) throw new Error("COD_ALREADY_JOINED");
    const [sameCodUid] = await tx.select({ id: codRoomEntries.id }).from(codRoomEntries).where(and(
      eq(codRoomEntries.roomId, room.id),
      eq(codRoomEntries.codUidSnapshot, playerGameId),
      sql`${codRoomEntries.status} NOT IN ('cancelled','refunded')`,
    )).limit(1);
    if (sameCodUid) throw new Error("COD_UID_ALREADY_JOINED");
    const [{ value: registered }] = await tx.select({ value: count() }).from(codRoomEntries).where(eq(codRoomEntries.roomId, room.id));
    if (Number(registered || 0) >= room.capacity) throw new Error("COD_ROOM_FULL");
    const [rank] = await tx.select().from(codPlayerRanks)
      .where(and(eq(codPlayerRanks.userId, account.id), eq(codPlayerRanks.region, room.region))).limit(1);
    if (Number(rank?.points || 0) < room.minRankPoints) throw new Error("COD_RANK_TOO_LOW");
    const live = codArenaLive();
    const entryFee = bigIntFromText(room.entryFeeRial);
    // A paid room while the arena is in shadow mode would admit everybody free
    // and still advertise a price. Refuse the join rather than quietly giving
    // the seat away: flipping COD_ARENA_LIVE off must not turn paid rooms into
    // free ones.
    if (!live && entryFee > BigInt(0)) throw new Error("COD_PAID_ROOM_NOT_LIVE");
    // A free room that still pays cash prizes has the same integrity
    // requirements as a paid one: a minor must not win money, and an
    // unverified game ID cannot be matched against the scoreboard at
    // settlement. Gating on `entryFee > 0` alone let a free prize room admit
    // both.
    const paysPrizes = bigIntFromText(room.prizeBudgetRial) > BigInt(0);
    if (entryFee > BigInt(0) || paysPrizes) {
      const gate = checkAgeGate({ birthDate: account.birthDate, nationalId: account.nationalId });
      if (!gate.ok) throw new Error("COD_AGE_GATE_BLOCKED");
      if (profile[roomGameConfig.profileFields.status] !== "verified") throw new Error("COD_PROFILE_NOT_VERIFIED");
    }

    let paymentTransactionId: string | null = null;
    if (live && entryFee > BigInt(0)) {
      let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, account.id)).limit(1);
      if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: account.id, balance: "0", currency: "RIAL" }).returning();
      const debited = await updateWalletBalanceSafely(tx, wallet.id, entryFee, "decrease");
      if (!debited) throw new Error("COD_INSUFFICIENT_BALANCE");
      const [payment] = await tx.insert(transactions).values({
        walletId: wallet.id,
        amount: entryFee.toString(),
        type: "entry_fee",
        status: "completed",
        referenceId: `cod-room-entry-${room.id}-${account.id}`,
        metadata: { kind: "cod_room_entry", roomId: room.id, userId: account.id, serviceFeeRial: room.serviceFeeRial },
      }).returning();
      paymentTransactionId = payment.id;
    }
    let [player] = await tx.select().from(players).where(eq(players.visibleUserId, account.id)).limit(1);
    if (!player) {
      [player] = await tx.insert(players).values({
        visibleUserId: account.id,
        username: account.username || account.flexaId,
        displayName: account.displayName,
        email: account.email,
        avatarUrl: account.avatarUrl,
      }).returning();
    }
    const [entry] = await tx.insert(codRoomEntries).values({
      roomId: room.id,
      userId: account.id,
      playerId: player.id,
      game: room.game,
      codUidSnapshot: playerGameId,
      codUsernameSnapshot: playerGameName,
      region: room.region,
      status: "registered",
      paymentMode: live ? "live" : "shadow",
      entryFeeRial: room.entryFeeRial,
      serviceFeeRial: room.serviceFeeRial,
      paymentTransactionId,
      rulesVersion: room.rulesVersion,
      rulesAcceptedAt: new Date(),
    }).returning();
    await tx.insert(codRoomAuditEvents).values({
      roomId: room.id,
      actorId: account.id,
      eventType: "entry_joined",
      payload: { entryId: entry.id, paymentMode: entry.paymentMode, ip: input.ip || null },
    });
    const entryFeeToman = entryFee > BigInt(0) ? (entryFee / BigInt(10)).toLocaleString("fa-IR") : "۰";
    await tx.insert(notifications).values({
      userId: account.id,
      type: "cod_room_joined",
      title: "عضویت COD Arena ثبت شد",
      message: entryFee > BigInt(0)
        ? `عضویت شما در ${room.title} ثبت شد و ورودی ${entryFeeToman} USDT از کیف پول کسر شد.`
        : `عضویت شما در ${room.title} ثبت شد.`,
      link: `/cod-arena/${room.id}`,
    });
    return { entry, roomTitle: room.title, live };
  });
}

export async function checkInCodRoom(roomId: string, userId: string) {
  await ensureCodArenaSchema();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    if (!["registration", "check_in", "lobby_open"].includes(room.status)) throw new Error("COD_CHECKIN_CLOSED");
    const now = new Date();
    if (room.checkInOpensAt && now < room.checkInOpensAt) throw new Error("COD_CHECKIN_NOT_OPEN");
    if (room.checkInClosesAt && now > room.checkInClosesAt) throw new Error("COD_CHECKIN_CLOSED");
    // Check-in is the step that unlocks the room code, so it is the right place
    // to insist the seat was actually paid for. Previously it only checked that
    // an entry existed, which trusted joinCodRoom to be the only way one could
    // appear.
    const [existing] = await tx.select({
      id: codRoomEntries.id,
      paymentMode: codRoomEntries.paymentMode,
      paymentTransactionId: codRoomEntries.paymentTransactionId,
    }).from(codRoomEntries).where(and(
      eq(codRoomEntries.roomId, roomId),
      eq(codRoomEntries.userId, userId),
      inArray(codRoomEntries.status, ["registered", "checked_in"]),
    )).limit(1);
    if (!existing) throw new Error("COD_ENTRY_NOT_FOUND");

    let roomIsPaid = false;
    try { roomIsPaid = BigInt(room.entryFeeRial || "0") > BigInt(0); } catch { roomIsPaid = false; }
    if (roomIsPaid && (existing.paymentMode !== "live" || !existing.paymentTransactionId)) {
      throw new Error("COD_ENTRY_NOT_PAID");
    }

    const [entry] = await tx.update(codRoomEntries).set({
      status: "checked_in",
      checkedInAt: now,
      updatedAt: now,
    }).where(eq(codRoomEntries.id, existing.id)).returning();
    if (!entry) throw new Error("COD_ENTRY_NOT_FOUND");
    await tx.insert(codRoomAuditEvents).values({ roomId, actorId: userId, eventType: "entry_checked_in", payload: { entryId: entry.id } });
    return entry;
  });
}

const EVIDENCE_KINDS = ["profile", "scoreboard", "recording", "lobby_recording", "dispute"];

export async function addCodRoomEvidence(input: {
  roomId: string;
  userId: string;
  isAdmin: boolean;
  kind: string;
  fileUrl: string;
  contentHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ensureCodArenaSchema();
  const kind = String(input.kind || "");
  if (!EVIDENCE_KINDS.includes(kind)) throw new Error("COD_EVIDENCE_KIND_INVALID");
  const fileUrl = normalizeEvidenceUrl(input.fileUrl, "COD_EVIDENCE_URL");
  if (!fileUrl) throw new Error("COD_EVIDENCE_URL_INVALID");
  const hash = input.contentHash ? input.contentHash.toLowerCase() : null;
  if (hash && !/^[a-f0-9]{64}$/.test(hash)) throw new Error("COD_EVIDENCE_HASH_INVALID");
  const [entry] = await db.select().from(codRoomEntries)
    .where(and(eq(codRoomEntries.roomId, input.roomId), eq(codRoomEntries.userId, input.userId))).limit(1);
  const [staff] = await db.select().from(codRoomStaff)
    .where(and(eq(codRoomStaff.roomId, input.roomId), eq(codRoomStaff.userId, input.userId))).limit(1);
  const privileged = input.isAdmin || Boolean(staff);
  if (!entry && !privileged) throw new Error("COD_ENTRY_NOT_FOUND");
  if (kind === "lobby_recording" && !privileged) throw new Error("COD_EVIDENCE_FORBIDDEN");
  try {
    const [created] = await db.insert(codRoomEvidence).values({
      roomId: input.roomId,
      entryId: entry?.id || null,
      uploadedById: input.userId,
      kind,
      fileUrl,
      contentHash: hash,
      metadata: input.metadata || {},
    }).returning();
    await db.insert(codRoomAuditEvents).values({ roomId: input.roomId, actorId: input.userId, eventType: "evidence_added", payload: { evidenceId: created.id, kind } });
    return created;
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code || (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") throw new Error("COD_EVIDENCE_DUPLICATE");
    throw error;
  }
}


/**
 * Refuses to publish a room that cannot actually be played. Reads staff and
 * reward state that `normalizeCodRoomInput` cannot see on its own.
 */
async function assertCodRoomPublishable(
  client: any,
  roomId: string | null,
  values: ReturnType<typeof normalizeCodRoomInput>,
  options: { assumeRoomer?: boolean } = {},
) {
  if (!values.isPublished) return;
  let hasRoomer = Boolean(options.assumeRoomer);
  if (roomId) {
    const [roomer] = await client.select({ id: codRoomStaff.id }).from(codRoomStaff)
      .where(and(eq(codRoomStaff.roomId, roomId), eq(codRoomStaff.role, "roomer"))).limit(1);
    hasRoomer = Boolean(roomer);
  }
  const reward = values.rewardConfig;
  const hasAnyReward = reward.placementRules.length > 0
    || BigInt(reward.perKillRial || "0") > BigInt(0)
    || BigInt(reward.participationRial || "0") > BigInt(0)
    || Boolean(reward.killLadder);
  const blockers = codReadinessBlockers(evaluateCodRoomReadiness({
    game: values.game,
    status: values.status,
    isPublished: values.isPublished,
    roomCode: values.roomCode,
    roomPassword: values.roomPassword,
    officialJoinUrl: values.officialJoinUrl,
    bannerImageUrl: values.bannerImageUrl,
    faq: values.faq,
    rules: values.rules,
    hasRoomer,
    startsAt: values.startsAt,
    credentialsRevealAt: values.credentialsRevealAt,
    entryFeeRial: values.entryFeeRial,
    hasAnyReward,
  }));
  if (blockers.length > 0) {
    throw new Error(`روم آماده انتشار نیست: ${blockers.map((b: CodReadinessIssue) => b.message).join(" ")}`);
  }
}

export async function createCodRoom(raw: Record<string, unknown>, adminId: string) {
  await ensureCodArenaSchema();
  const values = normalizeCodRoomInput(raw);
  if (values.startsAt.getTime() <= Date.now() + 5 * 60_000) throw new Error("زمان شروع روم جدید باید حداقل ۵ دقیقه در آینده باشد");
  await assertCodRoomPublishable(db, null, values, { assumeRoomer: true });
  const { maximumLiabilityRial, ...databaseValues } = values;
  const [created] = await db.insert(codRooms).values({ ...databaseValues, createdById: adminId }).returning();
  // Whoever creates a room is its operator until someone else is assigned.
  // Without this a solo admin can never satisfy the "needs a roomer" check from
  // the create form, which is the only place they are told about it.
  await db.insert(codRoomStaff)
    .values({ roomId: created.id, userId: adminId, role: "roomer" })
    .onConflictDoNothing();
  await db.insert(codRoomAuditEvents).values({ roomId: created.id, actorId: adminId, eventType: "room_created", payload: { maximumLiabilityRial } });
  return { ...created, maximumLiabilityRial };
}

export async function updateCodRoom(roomId: string, raw: Record<string, unknown>, adminId: string) {
  await Promise.all([ensureCodArenaSchema(), ensureWalletMoneySchema()]);
  const values = normalizeCodRoomInput(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${roomId} FOR UPDATE`);
    const [before] = await tx.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
    if (!before) throw new Error("COD_ROOM_NOT_FOUND");
    if (!canTransitionCodRoomStatus(before.status as CodRoomStatus, values.status)) throw new Error("COD_STATUS_TRANSITION_INVALID");
    await assertCodRoomPublishable(tx, roomId, values);
    const [{ value: entryCount }] = await tx.select({ value: count() }).from(codRoomEntries).where(eq(codRoomEntries.roomId, roomId));
    if (Number(entryCount || 0) > 0) {
      const commercialTermsChanged = before.entryFeeRial !== values.entryFeeRial ||
        before.serviceFeeRial !== values.serviceFeeRial ||
        before.prizeBudgetRial !== values.prizeBudgetRial ||
        before.referralRateBps !== values.referralRateBps ||
        before.region !== values.region ||
        before.teamMode !== values.teamMode ||
        before.perspective !== values.perspective ||
        before.map !== values.map ||
        before.rulesVersion !== values.rulesVersion ||
        before.rules !== values.rules ||
        JSON.stringify(before.rewardConfig) !== JSON.stringify(values.rewardConfig);
      if (commercialTermsChanged) throw new Error("COD_LOCKED_AFTER_REGISTRATION");
      if (values.capacity < Number(entryCount || 0)) throw new Error("COD_CAPACITY_BELOW_REGISTRATIONS");
    }
    let refunds = 0;
    if (before.status !== "cancelled" && values.status === "cancelled") {
      const entries = await tx.select().from(codRoomEntries).where(and(
        eq(codRoomEntries.roomId, roomId),
        ne(codRoomEntries.status, "refunded"),
      ));
      for (const entry of entries) {
        const amount = bigIntFromText(entry.entryFeeRial);
        if (entry.paymentMode === "live" && amount > BigInt(0)) {
          let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, entry.userId)).limit(1);
          if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: entry.userId, balance: "0", currency: "RIAL" }).returning();
          await updateWalletBalanceSafely(tx, wallet.id, amount, "increase");
          await tx.insert(transactions).values({
            walletId: wallet.id,
            amount: amount.toString(),
            type: "refund",
            status: "completed",
            referenceId: `cod-room-refund-${roomId}-${entry.id}`,
            metadata: { kind: "cod_room_refund", roomId, entryId: entry.id, userId: entry.userId },
          });
          refunds += 1;
        }
        await tx.update(codRoomEntries).set({
          status: entry.paymentMode === "live" && amount > BigInt(0) ? "refunded" : "cancelled",
          resultStatus: "cancelled",
          updatedAt: new Date(),
        }).where(eq(codRoomEntries.id, entry.id));
      }
    }
    let latestLobbyCheck: { id: string; status: string } | null = null;
    if (before.status !== "in_progress" && values.status === "in_progress") {
      [latestLobbyCheck] = await tx.select({ id: codRoomLobbyChecks.id, status: codRoomLobbyChecks.status })
        .from(codRoomLobbyChecks)
        .where(eq(codRoomLobbyChecks.roomId, roomId))
        .orderBy(desc(codRoomLobbyChecks.createdAt))
        .limit(1);
      if (latestLobbyCheck?.status !== "verified" && !Boolean(raw.lobbyOverrideConfirmed)) {
        throw new Error("COD_LOBBY_START_CONFIRMATION_REQUIRED");
      }
    }
    const { maximumLiabilityRial, ...databaseValues } = values;
    const [updated] = await tx.update(codRooms).set({ ...databaseValues, updatedAt: new Date() }).where(eq(codRooms.id, roomId)).returning();
    await tx.insert(codRoomAuditEvents).values({ roomId, actorId: adminId, eventType: "room_updated", payload: { fromStatus: before.status, toStatus: updated.status, maximumLiabilityRial, refunds, lobbyOverrideConfirmed: Boolean(raw.lobbyOverrideConfirmed), latestLobbyCheckId: latestLobbyCheck?.id || null } });
    return { ...updated, maximumLiabilityRial };
  });
}

export async function deleteCodRoom(roomId: string, adminId: string) {
  await ensureCodArenaSchema();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    const [{ value }] = await tx.select({ value: count() }).from(codRoomEntries).where(eq(codRoomEntries.roomId, roomId));
    if (Number(value || 0) > 0 || room.status !== "draft") throw new Error("COD_ROOM_DELETE_FORBIDDEN");
    await tx.delete(codRoomEvidence).where(eq(codRoomEvidence.roomId, roomId));
    await tx.delete(codRoomStaff).where(eq(codRoomStaff.roomId, roomId));
    await tx.delete(codRoomAuditEvents).where(eq(codRoomAuditEvents.roomId, roomId));
    await tx.delete(codRooms).where(eq(codRooms.id, roomId));
    return { deleted: true, adminId };
  });
}

async function createCodReferralShadow(client: any, input: {
  roomId: string;
  entryId: string;
  userId: string;
  serviceFeeRial: bigint;
  referralRateBps: number;
}) {
  const amount = codReferralCommissionRial(input.serviceFeeRial, input.referralRateBps);
  if (amount <= BigInt(0)) return { created: false as const, reason: "zero_commission" as const };
  const [existing] = await client.select({ id: affiliateCommissionEvents.id }).from(affiliateCommissionEvents)
    .where(and(eq(affiliateCommissionEvents.sourceType, "cod_room_entry"), eq(affiliateCommissionEvents.sourceId, input.entryId))).limit(1);
  if (existing) return { created: false as const, reason: "already_exists" as const };
  const [attribution] = await client.select({
    partnerId: affiliateAttributions.partnerId,
    ownerId: mediaPartners.userId,
  }).from(affiliateAttributions)
    .innerJoin(mediaPartners, eq(affiliateAttributions.partnerId, mediaPartners.id))
    .where(and(
      eq(affiliateAttributions.userId, input.userId),
      eq(affiliateAttributions.status, "active"),
      gt(affiliateAttributions.expiresAt, new Date()),
      eq(mediaPartners.status, "active"),
      ne(mediaPartners.userId, input.userId),
    )).limit(1);
  if (!attribution) return { created: false as const, reason: "no_active_attribution" as const };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [daily] = await client.select({ value: count() }).from(affiliateCommissionEvents).where(and(
    eq(affiliateCommissionEvents.sourceType, "cod_room_entry"),
    gte(affiliateCommissionEvents.createdAt, since),
    sql`${affiliateCommissionEvents.risk}->>'referredUserId' = ${input.userId}`,
    sql`${affiliateCommissionEvents.status} <> 'reversed'`,
  ));
  if (Number(daily?.value || 0) >= COD_ARENA_DAILY_REFERRAL_ENTRY_CAP) {
    return { created: false as const, reason: "daily_cap" as const };
  }
  const status = codArenaLive() && await affiliateAccrualLiveForUsers(client, [input.userId]) ? "pending" : "shadow";
  const [event] = await client.insert(affiliateCommissionEvents).values({
    matchId: null,
    sourceType: "cod_room_entry",
    sourceId: input.entryId,
    totalAmountRial: amount.toString(),
    status,
    availableAt: new Date(Date.now() + AFFILIATE_HOLD_HOURS * 60 * 60 * 1000),
    risk: {
      game: "cod_mobile",
      source: "service_fee_percentage",
      roomId: input.roomId,
      entryId: input.entryId,
      referredUserId: input.userId,
      serviceFeeRial: input.serviceFeeRial.toString(),
      referralRateBps: input.referralRateBps,
      mode: status,
    },
  }).onConflictDoNothing().returning();
  if (!event) return { created: false as const, reason: "concurrent_duplicate" as const };
  await client.insert(affiliateCommissionShares).values({
    eventId: event.id,
    partnerId: attribution.partnerId,
    referredUserId: input.userId,
    amountRial: amount.toString(),
    status,
  });
  return { created: true as const, amountRial: amount, status };
}

export interface CodSettlementResultInput {
  entryId: string;
  kills: number;
  placement?: number | null;
}

/**
 * The reward each checked-in entry is owed, as a pure function of the room
 * configuration and the operator's submitted results.
 *
 * Extracted from `settleCodRoom` so the money maths is testable without a
 * database: the transaction around it is plumbing, this is the part that
 * decides what people get paid.
 */
export function computeCodSettlementRewards<T extends { id: string }>(input: {
  room: { rewardConfig: unknown; prizeScaling: unknown; capacity: number };
  entries: T[];
  results: CodSettlementResultInput[];
  /**
   * Everyone who held a seat, including no-shows. This is the occupancy players
   * saw on the room page, so it is what the advertised prize table scales
   * against -- a no-show should not shrink the prize for those who turned up.
   */
  advertisedEntryCount: number;
}) {
  const byEntry = new Map(input.results.map((row) => [row.entryId, row]));
  // A placement prize is a squad prize by default, so count how many settled
  // players share each placement before splitting it between them.
  const sharersByPlacement = new Map<number, number>();
  for (const entry of input.entries) {
    const placement = byEntry.get(entry.id)?.placement;
    if (placement == null) continue;
    sharersByPlacement.set(placement, (sharersByPlacement.get(placement) || 0) + 1);
  }
  // Prizes are advertised for a full lobby. If the room did not fill, the whole
  // table scales down by the same ratio so the operator's margin survives a
  // quiet night.
  const scaleBps = codPrizeScaleBps(
    normalizeCodPrizeScaling(input.room.prizeScaling),
    input.advertisedEntryCount,
    input.room.capacity,
  );
  // The room-wide kill cap is part of the advertised budget, so it has to bind
  // at settlement too -- not just in the pre-publish estimate. A lobby that
  // produces more scoring kills than the cap pays the same total, spread over
  // more kills, instead of blowing through the budget.
  const rewardConfig = normalizeCodRewardConfig(input.room.rewardConfig);
  const recordedKills = input.entries.reduce((sum, entry) => {
    const kills = byEntry.get(entry.id)?.kills;
    return sum + Math.min(Math.max(0, Math.floor(Number(kills) || 0)), rewardConfig.maxKillsPerEntry);
  }, 0);
  const killBudgetBps = codKillBudgetScaleBps(rewardConfig.maxTotalKills, recordedKills);
  const killScaleBps = Math.floor((scaleBps * killBudgetBps) / 10_000);

  return input.entries.map((entry) => {
    const result = byEntry.get(entry.id) || { entryId: entry.id, kills: 0, placement: null };
    const placementSharers = result.placement == null ? 1 : sharersByPlacement.get(result.placement) || 1;
    const full = calculateCodEntryReward(input.room.rewardConfig, result.kills, result.placement, {
      placementSharers,
      scaleBps,
    });
    if (killBudgetBps >= 10_000) return { entry, reward: full };
    // Recompute only the kill component under the tightened budget; placement
    // and participation prizes are unaffected by a kill overshoot.
    const capped = calculateCodEntryReward(input.room.rewardConfig, result.kills, result.placement, {
      placementSharers,
      scaleBps: killScaleBps,
    });
    return {
      entry,
      reward: {
        ...full,
        killRewardRial: capped.killRewardRial,
        killBudgetBps,
        totalRewardRial: capped.killRewardRial + full.placementRewardRial + full.participationRewardRial,
      },
    };
  });
}

export async function settleCodRoom(input: {
  roomId: string;
  adminId: string;
  results: CodSettlementResultInput[];
  evidenceConfirmed: boolean;
  lobbyOverrideConfirmed?: boolean;
}) {
  await Promise.all([ensureCodArenaSchema(), ensureWalletMoneySchema()]);
  if (!input.evidenceConfirmed) throw new Error("COD_EVIDENCE_CONFIRMATION_REQUIRED");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${input.roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, input.roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    if (!canTransitionCodRoomStatus(room.status as CodRoomStatus, "settling") || room.status === "completed") throw new Error("COD_SETTLEMENT_STATUS_INVALID");
    if (room.requiresRecording) {
      const [evidence] = await tx.select({ value: count() }).from(codRoomEvidence).where(and(
        eq(codRoomEvidence.roomId, room.id),
        inArray(codRoomEvidence.kind, ["scoreboard", "recording", "lobby_recording"]),
      ));
      if (Number(evidence?.value || 0) === 0) throw new Error("COD_SETTLEMENT_EVIDENCE_REQUIRED");
    }
    const [latestLobbyCheck] = await tx.select({
      id: codRoomLobbyChecks.id,
      status: codRoomLobbyChecks.status,
      unauthorizedCount: codRoomLobbyChecks.unauthorizedCount,
      missingCheckedInCount: codRoomLobbyChecks.missingCheckedInCount,
      confidence: codRoomLobbyChecks.confidence,
    }).from(codRoomLobbyChecks).where(eq(codRoomLobbyChecks.roomId, room.id)).orderBy(desc(codRoomLobbyChecks.createdAt)).limit(1);
    if (latestLobbyCheck?.status === "flagged" && !input.lobbyOverrideConfirmed) {
      throw new Error("COD_LOBBY_FLAGGED_CONFIRMATION_REQUIRED");
    }
    const allEntries = await tx.select().from(codRoomEntries)
      .where(and(eq(codRoomEntries.roomId, room.id), ne(codRoomEntries.status, "refunded"), ne(codRoomEntries.status, "cancelled")))
      .orderBy(codRoomEntries.createdAt);
    for (const absent of allEntries.filter((entry) => !entry.checkedInAt || entry.status === "no_show")) {
      await tx.update(codRoomEntries).set({ status: "no_show", resultStatus: "no_show", rewardRial: "0", updatedAt: new Date() })
        .where(eq(codRoomEntries.id, absent.id));
    }
    const entries = allEntries.filter((entry) => Boolean(entry.checkedInAt) && entry.status !== "no_show");
    if (!entries.length) throw new Error("COD_SETTLEMENT_EMPTY");
    const byEntry = new Map(input.results.map((row) => [row.entryId, row]));
    if (input.results.some((row) => !entries.some((entry) => entry.id === row.entryId))) throw new Error("COD_SETTLEMENT_ENTRY_INVALID");
    if (room.teamMode === "solo") {
      const placements = input.results.map((row) => row.placement).filter((value): value is number => value != null);
      if (new Set(placements).size !== placements.length) throw new Error("COD_SETTLEMENT_DUPLICATE_PLACEMENT");
    }
    const calculated = computeCodSettlementRewards({
      room: {
        rewardConfig: room.rewardConfig,
        prizeScaling: room.prizeScaling,
        capacity: room.capacity,
      },
      entries,
      results: input.results,
      advertisedEntryCount: allEntries.length,
    });
    const totalReward = calculated.reduce((sum, row) => sum + row.reward.totalRewardRial, BigInt(0));
    if (totalReward > bigIntFromText(room.prizeBudgetRial)) throw new Error("COD_SETTLEMENT_OVER_BUDGET");
    await tx.update(codRooms).set({ status: "settling", updatedAt: new Date() }).where(eq(codRooms.id, room.id));
    const live = codArenaLive();
    const referralEvents: Array<{ created: boolean; amountRial?: bigint; status?: string }> = [];
    for (const row of calculated) {
      let rewardTransactionId: string | null = null;
      if (live && row.reward.totalRewardRial > BigInt(0)) {
        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, row.entry.userId)).limit(1);
        if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: row.entry.userId, balance: "0", currency: "RIAL" }).returning();
        await updateWalletBalanceSafely(tx, wallet.id, row.reward.totalRewardRial, "increase");
        const [rewardTransaction] = await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: row.reward.totalRewardRial.toString(),
          type: "tournament_win",
          status: "completed",
          referenceId: `cod-room-reward-${room.id}-${row.entry.id}`,
          metadata: { kind: "cod_room_reward", roomId: room.id, entryId: row.entry.id, kills: row.reward.kills, placement: row.reward.placement },
        }).returning();
        rewardTransactionId = rewardTransaction.id;
      }
      await tx.insert(codRoomSettlements).values({
        roomId: room.id,
        entryId: row.entry.id,
        kills: row.reward.kills,
        placement: row.reward.placement,
        killRewardRial: row.reward.killRewardRial.toString(),
        placementRewardRial: row.reward.placementRewardRial.toString(),
        participationRewardRial: row.reward.participationRewardRial.toString(),
        totalRewardRial: row.reward.totalRewardRial.toString(),
        status: live ? "paid" : "shadow",
        rewardTransactionId,
        verifiedById: input.adminId,
        verifiedAt: new Date(),
      }).onConflictDoUpdate({
        target: [codRoomSettlements.roomId, codRoomSettlements.entryId],
        set: {
          kills: row.reward.kills,
          placement: row.reward.placement,
          killRewardRial: row.reward.killRewardRial.toString(),
          placementRewardRial: row.reward.placementRewardRial.toString(),
          participationRewardRial: row.reward.participationRewardRial.toString(),
          totalRewardRial: row.reward.totalRewardRial.toString(),
          status: live ? "paid" : "shadow",
          rewardTransactionId,
          verifiedById: input.adminId,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await tx.update(codRoomEntries).set({
        status: "settled",
        kills: row.reward.kills,
        placement: row.reward.placement,
        rewardRial: row.reward.totalRewardRial.toString(),
        resultStatus: "verified",
        settledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(codRoomEntries.id, row.entry.id));
      const gained = codRankPointsForResult(row.reward.kills, row.reward.placement);
      const [rank] = await tx.select().from(codPlayerRanks).where(and(
        eq(codPlayerRanks.userId, row.entry.userId),
        eq(codPlayerRanks.region, room.region),
      )).for("update").limit(1);
      const nextPoints = Number(rank?.points || 0) + gained;
      if (rank) {
        await tx.update(codPlayerRanks).set({
          points: nextPoints,
          tier: codRankTier(nextPoints),
          verifiedRooms: rank.verifiedRooms + 1,
          totalKills: rank.totalKills + row.reward.kills,
          wins: rank.wins + (row.reward.placement === 1 ? 1 : 0),
          updatedAt: new Date(),
        }).where(eq(codPlayerRanks.id, rank.id));
      } else {
        await tx.insert(codPlayerRanks).values({
          userId: row.entry.userId,
          region: room.region,
          points: nextPoints,
          tier: codRankTier(nextPoints),
          verifiedRooms: 1,
          totalKills: row.reward.kills,
          wins: row.reward.placement === 1 ? 1 : 0,
        });
      }
      const rewardToman = (row.reward.totalRewardRial / BigInt(10)).toLocaleString("fa-IR");
      await tx.insert(notifications).values({
        userId: row.entry.userId,
        type: "cod_room_result",
        title: "نتیجه COD Arena تأیید شد",
        message: `نتیجه شما در ${room.title}: ${row.reward.kills} Kill${row.reward.placement ? `، جایگاه ${row.reward.placement}` : ""}، جایزه ${rewardToman} USDT.`,
        link: `/cod-arena/${room.id}`,
      });
      if (bigIntFromText(row.entry.entryFeeRial) > BigInt(0)) {
        referralEvents.push(await createCodReferralShadow(tx, {
          roomId: room.id,
          entryId: row.entry.id,
          userId: row.entry.userId,
          serviceFeeRial: bigIntFromText(row.entry.serviceFeeRial),
          referralRateBps: room.referralRateBps,
        }));
      }
    }
    await tx.update(codRooms).set({ status: "completed", endsAt: room.endsAt || new Date(), updatedAt: new Date() }).where(eq(codRooms.id, room.id));
    await tx.insert(codRoomAuditEvents).values({
      roomId: room.id,
      actorId: input.adminId,
      eventType: "room_settled",
      payload: { live, totalRewardRial: totalReward.toString(), entryCount: entries.length, referralEventsCreated: referralEvents.filter((row) => row.created).length, lobbyOverrideConfirmed: Boolean(input.lobbyOverrideConfirmed), latestLobbyCheckId: latestLobbyCheck?.id || null }, 
    });
    return {
      live,
      roomId: room.id,
      entryCount: entries.length,
      totalRewardRial: totalReward.toString(),
      referralEventsCreated: referralEvents.filter((row) => row.created).length,
      participants: calculated.map((row) => ({
        userId: row.entry.userId,
        kills: row.reward.kills,
        placement: row.reward.placement,
        rewardRial: row.reward.totalRewardRial.toString(),
      })),
    };
  });
}

export const COD_ROOM_REPORT_CATEGORIES = [
  "cheat",
  "teaming",
  "no_recording",
  "banned_item",
  "toxic_behavior",
  "wrong_result",
  "no_show",
  "other",
] as const;

export const COD_ROOM_REPORT_STATUSES = ["pending", "in_review", "resolved", "rejected"] as const;
export const COD_ROOM_PENALTY_TYPES = ["warning", "fine", "temp_ban", "permanent_ban", "result_void"] as const;

function normalizeCodReportCategory(value: unknown) {
  const category = String(value || "other").trim();
  if (!(COD_ROOM_REPORT_CATEGORIES as readonly string[]).includes(category)) throw new Error("COD_REPORT_CATEGORY_INVALID");
  return category;
}

function normalizeCodReportStatus(value: unknown) {
  const status = String(value || "pending").trim();
  if (!(COD_ROOM_REPORT_STATUSES as readonly string[]).includes(status)) throw new Error("COD_REPORT_STATUS_INVALID");
  return status;
}

function normalizeCodPenaltyType(value: unknown) {
  const type = String(value || "warning").trim();
  if (!(COD_ROOM_PENALTY_TYPES as readonly string[]).includes(type)) throw new Error("COD_PENALTY_TYPE_INVALID");
  return type;
}

function normalizeEvidenceUrl(value: unknown, field: string) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length > 1500) throw new Error(`${field}_INVALID`);
  if (/^telegram_file:[A-Za-z0-9_-]{10,300}$/.test(text)) return text;
  let parsed: URL;
  try { parsed = new URL(text); } catch { throw new Error(`${field}_INVALID`); }
  if (parsed.protocol !== "https:" || text.length > 1500) throw new Error(`${field}_INVALID`);
  return text;
}

export async function reportCodRoomIssue(input: {
  roomId: string;
  reporterId: string;
  isAdmin?: boolean;
  category: string;
  description: string;
  accusedEntryId?: string | null;
  accusedCodUsername?: string | null;
  evidenceUrl?: string | null;
}) {
  await ensureCodArenaSchema();
  const category = normalizeCodReportCategory(input.category);
  const description = String(input.description || "").trim();
  if (description.length < 10 || description.length > 2000) throw new Error("COD_REPORT_DESCRIPTION_INVALID");
  const evidenceUrl = normalizeEvidenceUrl(input.evidenceUrl, "COD_REPORT_EVIDENCE_URL");
  const [room] = await db.select({ id: codRooms.id, status: codRooms.status }).from(codRooms).where(eq(codRooms.id, input.roomId)).limit(1);
  if (!room) throw new Error("COD_ROOM_NOT_FOUND");
  const [reporterEntry] = await db.select().from(codRoomEntries)
    .where(and(eq(codRoomEntries.roomId, input.roomId), eq(codRoomEntries.userId, input.reporterId))).limit(1);
  const [staff] = await db.select({ id: codRoomStaff.id }).from(codRoomStaff)
    .where(and(eq(codRoomStaff.roomId, input.roomId), eq(codRoomStaff.userId, input.reporterId))).limit(1);
  const privileged = Boolean(input.isAdmin || staff);
  if (!reporterEntry && !privileged) throw new Error("COD_REPORT_FORBIDDEN");

  let accusedEntry = null as null | typeof reporterEntry;
  if (input.accusedEntryId) {
    [accusedEntry] = await db.select().from(codRoomEntries)
      .where(and(eq(codRoomEntries.roomId, input.roomId), eq(codRoomEntries.id, input.accusedEntryId))).limit(1);
    if (!accusedEntry) throw new Error("COD_REPORT_ACCUSED_INVALID");
  }
  const usernameText = String(input.accusedCodUsername || "").trim().slice(0, 100);
  if (!accusedEntry && usernameText) {
    const entries = await db.select().from(codRoomEntries).where(eq(codRoomEntries.roomId, input.roomId));
    accusedEntry = entries.find((entry) => entry.codUsernameSnapshot.toLowerCase() === usernameText.toLowerCase()) || null;
  }

  const [created] = await db.insert(codRoomReports).values({
    roomId: input.roomId,
    reporterId: input.reporterId,
    accusedEntryId: accusedEntry?.id || null,
    accusedUserId: accusedEntry?.userId || null,
    accusedCodUsername: accusedEntry?.codUsernameSnapshot || usernameText || null,
    category,
    description,
    evidenceUrl,
  }).returning();
  await db.insert(codRoomAuditEvents).values({
    roomId: input.roomId,
    actorId: input.reporterId,
    eventType: "report_created",
    payload: { reportId: created.id, category, accusedEntryId: accusedEntry?.id || null },
  });
  return created;
}

export async function listCodRoomReports(input: { status?: string | null; roomId?: string | null; limit?: number } = {}) {
  await ensureCodArenaSchema();
  const limit = Math.min(Math.max(Number(input.limit || 100), 1), 300);
  const status = input.status ? normalizeCodReportStatus(input.status) : null;
  const rows = await db.execute(sql`
    SELECT
      r.id, r.room_id AS "roomId", r.category, r.description, r.evidence_url AS "evidenceUrl",
      r.status, r.resolution, r.admin_note AS "adminNote", r.accused_cod_username AS "accusedCodUsername",
      r.created_at AS "createdAt", r.updated_at AS "updatedAt", r.reviewed_at AS "reviewedAt",
      room.title AS "roomTitle", room.status AS "roomStatus",
      reporter.display_name AS "reporterName", reporter.flexa_id AS "reporterFlexaId",
      accused.display_name AS "accusedName", accused.flexa_id AS "accusedFlexaId",
      reviewer.display_name AS "reviewerName"
    FROM cod_room_reports r
    INNER JOIN cod_rooms room ON room.id = r.room_id
    INNER JOIN users reporter ON reporter.id = r.reporter_id
    LEFT JOIN users accused ON accused.id = r.accused_user_id
    LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by_id
    WHERE (${status}::text IS NULL OR r.status = ${status})
      AND (${input.roomId || null}::uuid IS NULL OR r.room_id = ${input.roomId || null}::uuid)
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `);
  return (rows as unknown as { rows?: unknown[] }).rows || rows;
}

export async function resolveCodRoomReport(input: {
  reportId: string;
  adminId: string;
  status: string;
  resolution?: string | null;
  adminNote?: string | null;
  penalty?: {
    type: string;
    reason?: string | null;
    fineRial?: string | null;
    durationHours?: number | null;
  } | null;
}) {
  await ensureCodArenaSchema();
  const status = normalizeCodReportStatus(input.status);
  if (!["in_review", "resolved", "rejected"].includes(status)) throw new Error("COD_REPORT_STATUS_INVALID");
  return db.transaction(async (tx) => {
    const [report] = await tx.select().from(codRoomReports).where(eq(codRoomReports.id, input.reportId)).for("update").limit(1);
    if (!report) throw new Error("COD_REPORT_NOT_FOUND");
    const now = new Date();
    const [updated] = await tx.update(codRoomReports).set({
      status,
      resolution: input.resolution ? String(input.resolution).trim().slice(0, 40) : null,
      adminNote: input.adminNote ? String(input.adminNote).trim().slice(0, 2000) : null,
      reviewedById: input.adminId,
      reviewedAt: now,
      updatedAt: now,
    }).where(eq(codRoomReports.id, report.id)).returning();

    let penalty: any = null;
    if (input.penalty && status === "resolved") {
      if (!report.accusedUserId) throw new Error("COD_REPORT_ACCUSED_REQUIRED_FOR_PENALTY");
      const type = normalizeCodPenaltyType(input.penalty.type);
      const fineRial = moneyString(input.penalty.fineRial || "0", "جریمه");
      if (type !== "fine" && BigInt(fineRial) > BigInt(0)) throw new Error("COD_PENALTY_FINE_ONLY_FOR_FINE");
      const durationHours = Number(input.penalty.durationHours || 0);
      const endsAt = type === "temp_ban"
        ? new Date(now.getTime() + Math.max(1, Math.min(24 * 30, durationHours || 72)) * 60 * 60_000)
        : null;
      const reason = String(input.penalty.reason || input.adminNote || report.description).trim().slice(0, 2000);
      if (reason.length < 3) throw new Error("COD_PENALTY_REASON_INVALID");
      [penalty] = await tx.insert(codRoomPenalties).values({
        roomId: report.roomId,
        reportId: report.id,
        entryId: report.accusedEntryId || null,
        userId: report.accusedUserId,
        type,
        reason,
        fineRial,
        status: "active",
        startsAt: now,
        endsAt,
        createdById: input.adminId,
        metadata: { category: report.category, accusedCodUsername: report.accusedCodUsername },
      }).returning();
    }

    await tx.insert(codRoomAuditEvents).values({
      roomId: report.roomId,
      actorId: input.adminId,
      eventType: "report_resolved",
      payload: { reportId: report.id, status, penaltyId: penalty?.id || null },
    });
    return { report: updated, penalty };
  });
}

function normalizeCodLobbyName(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u200c\u200d\u200e\u200f]/g, "")
    .replace(/[\s._\-•丨|:：'"`´،,؛;()[\]{}<>]/g, "")
    .trim();
}

function parseLobbyNamesFromText(text: string) {
  return [...new Set(String(text || "")
    .split(/[\n،,;؛]+/)
    .map((line) => line.replace(/^[-*#\d.\s]+/, "").trim())
    .filter((line) => line.length >= 2 && line.length <= 100)
    .slice(0, 120))];
}

interface LobbyAiJson {
  usernames?: string[];
  confidence?: number;
  notes?: string;
}

export async function verifyCodLobbyFromImage(input: {
  roomId: string;
  userId: string;
  isAdmin?: boolean;
  telegramFileId?: string | null;
  telegramFileUniqueId?: string | null;
  sourceKind?: string | null;
  imageDataUrl?: string | null;
  operatorNote?: string | null;
}) {
  await ensureCodArenaSchema();
  const [room] = await db.select().from(codRooms).where(eq(codRooms.id, input.roomId)).limit(1);
  if (!room) throw new Error("COD_ROOM_NOT_FOUND");
  const [staff] = await db.select({ role: codRoomStaff.role }).from(codRoomStaff)
    .where(and(eq(codRoomStaff.roomId, input.roomId), eq(codRoomStaff.userId, input.userId))).limit(1);
  const privileged = Boolean(input.isAdmin || staff);
  if (!privileged) throw new Error("COD_LOBBY_CHECK_FORBIDDEN");

  const entries = await db.select({
    id: codRoomEntries.id,
    userId: codRoomEntries.userId,
    status: codRoomEntries.status,
    checkedInAt: codRoomEntries.checkedInAt,
    codUsername: codRoomEntries.codUsernameSnapshot,
    codUid: codRoomEntries.codUidSnapshot,
    paymentMode: codRoomEntries.paymentMode,
    entryFeeRial: codRoomEntries.entryFeeRial,
  }).from(codRoomEntries).where(and(
    eq(codRoomEntries.roomId, input.roomId),
    sql`${codRoomEntries.status} NOT IN ('cancelled','refunded')`,
  ));

  const authorized = entries.map((entry) => ({
    username: entry.codUsername,
    normalized: normalizeCodLobbyName(entry.codUsername),
    checkedIn: Boolean(entry.checkedInAt),
    status: entry.status,
  })).filter((entry) => entry.normalized);
  const checkedIn = authorized.filter((entry) => entry.checkedIn);
  const authorizedNames = authorized.map((entry) => entry.username);

  let extracted: string[] = [];
  let confidence = 0;
  let aiProvider: string | null = null;
  let aiModel: string | null = null;
  let rawAiResponse: string | null = null;

  if (input.imageDataUrl) {
    const prompt = [
      "Extract every visible Call of Duty Mobile custom room lobby player username from this screenshot.",
      "Return ONLY valid JSON with this shape:",
      "{\"usernames\":[\"exact visible username\"],\"confidence\":0-100,\"notes\":\"short Persian note\"}",
      "Do not invent names. Keep symbols and mixed Persian/Latin text as visible. Ignore UI labels, buttons, rank labels and map names.",
      "Registered/paid reference list for comparison only, not extraction:",
      JSON.stringify(authorizedNames.slice(0, 120)),
    ].join("\n");
    const systemPrompt = "You are Flexa COD Arena lobby OCR. You only extract visible player usernames from COD Mobile lobby screenshots and respond in strict JSON.";
    const ai = await fetchAIResponse(prompt, systemPrompt, input.imageDataUrl).catch(() => null);
    if (ai?.content) {
      rawAiResponse = ai.content.slice(0, 4000);
      aiProvider = ai.provider;
      aiModel = ai.model || null;
      const parsed = safeParseAIJson<LobbyAiJson>(ai.content);
      extracted = Array.isArray(parsed?.usernames) ? parsed!.usernames.map(String).map((x) => x.trim()).filter(Boolean) : [];
      confidence = Math.max(0, Math.min(100, Number(parsed?.confidence || 0)));
    }
  }

  if (!extracted.length && input.operatorNote) extracted = parseLobbyNamesFromText(input.operatorNote);
  extracted = [...new Set(extracted.map((name) => name.trim()).filter((name) => name.length >= 2 && name.length <= 100))].slice(0, 120);

  const authorizedByNorm = new Map(authorized.map((entry) => [entry.normalized, entry.username]));
  const checkedInByNorm = new Map(checkedIn.map((entry) => [entry.normalized, entry.username]));
  const matched: string[] = [];
  const unauthorized: string[] = [];
  for (const name of extracted) {
    const normalized = normalizeCodLobbyName(name);
    if (!normalized) continue;
    const exact = authorizedByNorm.get(normalized);
    if (exact) matched.push(name);
    else unauthorized.push(name);
  }
  const extractedNorms = new Set(extracted.map(normalizeCodLobbyName));
  const missingCheckedIn = [...checkedInByNorm.entries()]
    .filter(([normalized]) => !extractedNorms.has(normalized))
    .map(([, username]) => username);

  const status = extracted.length === 0
    ? "manual_review"
    : unauthorized.length > 0
      ? "flagged"
      : confidence >= 55
        ? "verified"
        : "manual_review";

  const [created] = await db.insert(codRoomLobbyChecks).values({
    roomId: input.roomId,
    uploadedById: input.userId,
    telegramFileId: input.telegramFileId || null,
    telegramFileUniqueId: input.telegramFileUniqueId || null,
    sourceKind: String(input.sourceKind || "telegram_photo").slice(0, 24),
    status,
    extractedUsernames: extracted,
    matchedUsernames: matched,
    unauthorizedUsernames: unauthorized,
    missingCheckedInUsernames: missingCheckedIn,
    matchedCount: matched.length,
    unauthorizedCount: unauthorized.length,
    missingCheckedInCount: missingCheckedIn.length,
    confidence,
    aiProvider,
    aiModel,
    rawAiResponse,
    operatorNote: input.operatorNote ? String(input.operatorNote).slice(0, 2000) : null,
  }).returning();
  await db.insert(codRoomAuditEvents).values({
    roomId: input.roomId,
    actorId: input.userId,
    eventType: "lobby_ai_checked",
    payload: { lobbyCheckId: created.id, status, matched: matched.length, unauthorized: unauthorized.length, missingCheckedIn: missingCheckedIn.length, confidence },
  });
  return created;
}
