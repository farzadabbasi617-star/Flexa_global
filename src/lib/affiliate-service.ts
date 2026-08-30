import crypto from "crypto";
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  affiliateAttributions,
  affiliateClicks,
  affiliateCommissionEvents,
  affiliateCommissionShares,
  affiliatePayouts,
  clash1v1Entries,
  codRoomEntries,
  codRooms,
  disputes,
  matches,
  mediaPartnerAgreements,
  mediaPartners,
  mediaProperties,
  telegramAccounts,
  transactions,
  users,
  wallets,
} from "@/db/schema";
import { updateWalletBalanceSafely } from "@/lib/wallet-balance-service";
import { serverBotUsername } from "@/lib/telegram-bot-username";
import { REFERRAL_QUICK_RULES_VERSION, hasUsableNationalId } from "@/lib/referral-onboarding";

export const AFFILIATE_ATTRIBUTION_DAYS = 30;
export const AFFILIATE_COMMISSION_TOMAN = 7_000;
export const AFFILIATE_COMMISSION_RIAL = BigInt(AFFILIATE_COMMISSION_TOMAN * 10);
export const AFFILIATE_HOLD_HOURS = 72;
export const AFFILIATE_MINIMUM_PAYOUT_TOMAN = 300_000;
export const AFFILIATE_MINIMUM_PAYOUT_RIAL = BigInt(AFFILIATE_MINIMUM_PAYOUT_TOMAN * 10);
export const PERSONAL_REFERRAL_MINIMUM_PAYOUT_TOMAN = 200_000;
export const PERSONAL_REFERRAL_MINIMUM_PAYOUT_RIAL = BigInt(PERSONAL_REFERRAL_MINIMUM_PAYOUT_TOMAN * 10);
export const AFFILIATE_DAILY_MATCH_CAP_PER_USER = 3;

export type AffiliateRolloutMode = "shadow" | "canary" | "public";

export function affiliateProgramLive() {
  return process.env.AFFILIATE_PROGRAM_LIVE === "true"
    && process.env.AFFILIATE_LEGAL_APPROVED === "true"
    && process.env.AFFILIATE_FINANCE_APPROVED === "true";
}

export function affiliateRolloutMode(): AffiliateRolloutMode {
  if (!affiliateProgramLive()) return "shadow";
  return process.env.AFFILIATE_LIVE_ROLLOUT === "public" ? "public" : "canary";
}

export function affiliateCanaryFlexaIds() {
  return [...new Set((process.env.AFFILIATE_CANARY_GAMENT_IDS || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^FLX-[A-Z0-9-]{4,16}$/.test(value)))];
}

export async function affiliateAccrualLiveForUsers(client: any, userIds: string[]) {
  if (affiliateRolloutMode() === "public") return true;
  if (affiliateRolloutMode() !== "canary") return false;
  const allowed = new Set(affiliateCanaryFlexaIds());
  const uniqueUserIds = [...new Set(userIds)];
  if (!allowed.size || !uniqueUserIds.length) return false;
  const rows = await client.select({ id: users.id, flexaId: users.flexaId }).from(users).where(inArray(users.id, uniqueUserIds));
  return rows.length === uniqueUserIds.length && rows.every((row: { flexaId: string }) => allowed.has(row.flexaId.toUpperCase()));
}

export function affiliateAttributionExpiresAt(start: Date, days = AFFILIATE_ATTRIBUTION_DAYS) {
  return new Date(start.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
}

export function allocateAffiliateCommission(
  referrals: Array<{ userId: string; partnerId: string }>,
  totalRial = AFFILIATE_COMMISSION_RIAL,
) {
  const partners = [...new Set(referrals.map((row) => row.partnerId))];
  if (!partners.length || totalRial <= BigInt(0)) return [];
  const base = totalRial / BigInt(partners.length);
  let remainder = totalRial - base * BigInt(partners.length);
  return partners.map((partnerId) => {
    const amountRial = base + (remainder > BigInt(0) ? BigInt(1) : BigInt(0));
    if (remainder > BigInt(0)) remainder -= BigInt(1);
    return {
      partnerId,
      referredUserId: referrals.find((row) => row.partnerId === partnerId)?.userId || null,
      amountRial,
    };
  });
}

let affiliateSchemaReady: Promise<void> | null = null;
async function createAffiliateSchema(client: any) {
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS media_partners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id),
    partner_type varchar(20) NOT NULL DEFAULT 'media', referral_code varchar(24) NOT NULL UNIQUE, legal_name varchar(160) NOT NULL,
    national_id varchar(10) NOT NULL, sheba varchar(26), media_name varchar(160) NOT NULL,
    media_type varchar(30) NOT NULL, media_url varchar(500) NOT NULL, follower_count integer NOT NULL DEFAULT 0,
    ownership_proof_url text, status varchar(30) NOT NULL DEFAULT 'draft',
    commission_rial_per_match numeric(20,0) NOT NULL DEFAULT 70000, attribution_days integer NOT NULL DEFAULT 30,
    minimum_payout_rial numeric(20,0) NOT NULL DEFAULT 3000000, contract_accepted_at timestamp,
    approved_by_id uuid REFERENCES users(id), approved_at timestamp, rejection_reason text,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`ALTER TABLE media_partners ADD COLUMN IF NOT EXISTS partner_type varchar(20) NOT NULL DEFAULT 'media'`));
  await client.execute(sql.raw(`ALTER TABLE media_partners ALTER COLUMN sheba DROP NOT NULL`));
  // Two-stage onboarding (migration 0046): a link needs only the short rules.
  await client.execute(sql.raw(`ALTER TABLE media_partners ADD COLUMN IF NOT EXISTS quick_rules_accepted_at timestamp`));
  await client.execute(sql.raw(`ALTER TABLE media_partners ADD COLUMN IF NOT EXISTS quick_rules_version varchar(60)`));
  await client.execute(sql.raw(`ALTER TABLE media_partners ALTER COLUMN national_id DROP NOT NULL`));
  await client.execute(sql.raw(`UPDATE media_partners SET quick_rules_accepted_at=COALESCE(contract_accepted_at,created_at), quick_rules_version='legacy-full-contract' WHERE quick_rules_accepted_at IS NULL AND partner_type='personal'`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS media_partners_type_status_idx ON media_partners(partner_type,status)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS media_partner_agreements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES media_partners(id),
    user_id uuid NOT NULL REFERENCES users(id), contract_version varchar(60) NOT NULL,
    content_hash varchar(64) NOT NULL, content_snapshot text NOT NULL, signer_name varchar(160) NOT NULL,
    ip_address varchar(45), user_agent varchar(500), otp_verified_at timestamp NOT NULL,
    accepted_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS media_partner_agreements_partner_version_idx ON media_partner_agreements(partner_id, contract_version)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS media_properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES media_partners(id),
    platform varchar(30) NOT NULL, external_id varchar(100), title varchar(200), url varchar(500),
    status varchar(20) NOT NULL DEFAULT 'pending', verified_by_user_id uuid REFERENCES users(id),
    verified_at timestamp, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS media_properties_platform_external_idx ON media_properties(platform, external_id)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS affiliate_attributions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES media_partners(id),
    telegram_id varchar(32) NOT NULL UNIQUE, user_id uuid UNIQUE REFERENCES users(id), campaign_code varchar(60),
    source varchar(30) NOT NULL DEFAULT 'telegram_deep_link', status varchar(30) NOT NULL DEFAULT 'active',
    attributed_at timestamp NOT NULL DEFAULT now(), expires_at timestamp NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamp NOT NULL DEFAULT now()
  )`));
  // Web invite links (/r/<code>) have no Telegram id; see migration 0045.
  await client.execute(sql.raw(`ALTER TABLE affiliate_attributions ADD COLUMN IF NOT EXISTS visitor_key varchar(64)`));
  await client.execute(sql.raw(`UPDATE affiliate_attributions SET visitor_key='tg:'||telegram_id WHERE visitor_key IS NULL`));
  await client.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS affiliate_attributions_visitor_key_idx ON affiliate_attributions (visitor_key) WHERE visitor_key IS NOT NULL`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES media_partners(id),
    telegram_id varchar(32), campaign_code varchar(60), source varchar(30) NOT NULL DEFAULT 'telegram',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS affiliate_commission_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid UNIQUE REFERENCES matches(id),
    source_type varchar(30) NOT NULL DEFAULT 'clash_match', source_id varchar(100),
    total_amount_rial numeric(20,0) NOT NULL DEFAULT 70000, status varchar(20) NOT NULL DEFAULT 'shadow',
    available_at timestamp NOT NULL, paid_at timestamp, reversed_at timestamp, reversal_reason text,
    risk jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ALTER COLUMN match_id DROP NOT NULL`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ADD COLUMN IF NOT EXISTS source_type varchar(30) NOT NULL DEFAULT 'clash_match'`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ADD COLUMN IF NOT EXISTS source_id varchar(100)`));
  await client.execute(sql.raw(`UPDATE affiliate_commission_events SET source_type='clash_match', source_id=match_id::text WHERE source_id IS NULL AND match_id IS NOT NULL`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS affiliate_payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES media_partners(id),
    amount_rial numeric(20,0) NOT NULL, destination varchar(20) NOT NULL DEFAULT 'bank', status varchar(20) NOT NULL DEFAULT 'requested',
    sheba_snapshot varchar(26) NOT NULL, requested_at timestamp NOT NULL DEFAULT now(),
    reviewed_by_id uuid REFERENCES users(id), reviewed_at timestamp, paid_at timestamp,
    reference varchar(120), admin_note text
  )`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_payouts ADD COLUMN IF NOT EXISTS destination varchar(20) NOT NULL DEFAULT 'bank'`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS affiliate_commission_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES affiliate_commission_events(id),
    partner_id uuid NOT NULL REFERENCES media_partners(id), referred_user_id uuid REFERENCES users(id),
    amount_rial numeric(20,0) NOT NULL, status varchar(20) NOT NULL DEFAULT 'shadow',
    payout_id uuid REFERENCES affiliate_payouts(id), created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(), UNIQUE(event_id, partner_id)
  )`));
  const indexes = [
    `CREATE INDEX IF NOT EXISTS media_partners_status_idx ON media_partners(status)`,
    `CREATE INDEX IF NOT EXISTS affiliate_attributions_partner_status_idx ON affiliate_attributions(partner_id,status)`,
    `CREATE INDEX IF NOT EXISTS affiliate_attributions_expires_idx ON affiliate_attributions(status,expires_at)`,
    `CREATE INDEX IF NOT EXISTS affiliate_clicks_partner_created_idx ON affiliate_clicks(partner_id,created_at)`,
    `CREATE INDEX IF NOT EXISTS affiliate_commission_events_status_available_idx ON affiliate_commission_events(status,available_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commission_events_source_unique_idx ON affiliate_commission_events(source_type,source_id) WHERE source_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS affiliate_commission_shares_partner_status_idx ON affiliate_commission_shares(partner_id,status)`,
    `CREATE INDEX IF NOT EXISTS affiliate_payouts_partner_status_idx ON affiliate_payouts(partner_id,status)`,
  ];
  for (const statement of indexes) await client.execute(sql.raw(statement));
}

export async function ensureAffiliateSchema(client: any = db) {
  if (client !== db) return createAffiliateSchema(client);
  if (!affiliateSchemaReady) {
    affiliateSchemaReady = createAffiliateSchema(client).catch((error) => {
      affiliateSchemaReady = null;
      throw error;
    });
  }
  return affiliateSchemaReady;
}

export function normalizeAffiliateCode(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

export function generateAffiliateCode() {
  return `M${crypto.randomBytes(7).toString("base64url").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10)}`;
}

export function normalizeIranSheba(value: unknown) {
  const normalized = String(value || "").toUpperCase().replace(/\s+/g, "");
  if (!/^IR\d{24}$/.test(normalized)) return null;
  const numeric = `${normalized.slice(4)}1827${normalized.slice(2, 4)}`;
  return BigInt(numeric) % BigInt(97) === BigInt(1) ? normalized : null;
}

async function hasRecentPaidMatch(userId: string, referenceDate = new Date()) {
  const threshold = new Date(referenceDate.getTime() - AFFILIATE_ATTRIBUTION_DAYS * 24 * 60 * 60 * 1000);
  const [clashRow] = await db.select({ id: clash1v1Entries.id }).from(clash1v1Entries).where(and(
    eq(clash1v1Entries.userId, userId),
    eq(clash1v1Entries.stakeMode, "paid"),
    eq(clash1v1Entries.status, "completed"),
    gte(clash1v1Entries.completedAt, threshold),
  )).limit(1);
  if (clashRow) return true;
  // COD Arena entries use the same first-touch eligibility principle. Shadow
  // entries deliberately count as activity so a player cannot become "new"
  // again merely because the COD financial switch is still off.
  const [codRow] = await db.select({ id: codRoomEntries.id }).from(codRoomEntries).where(and(
    eq(codRoomEntries.userId, userId),
    gt(codRoomEntries.entryFeeRial, "0"),
    eq(codRoomEntries.status, "settled"),
    gte(codRoomEntries.settledAt, threshold),
  )).limit(1);
  return Boolean(codRow);
}

export async function recordAffiliateStart(input: {
  telegramId: string;
  referralCode: string;
  campaignCode?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureAffiliateSchema();
  const code = normalizeAffiliateCode(input.referralCode);
  const [partner] = await db.select().from(mediaPartners).where(and(
    eq(mediaPartners.referralCode, code),
    eq(mediaPartners.status, "active"),
  )).limit(1);
  if (!partner) return { attributed: false as const, reason: "partner_not_active" as const };
  await db.insert(affiliateClicks).values({
    partnerId: partner.id,
    telegramId: input.telegramId,
    campaignCode: input.campaignCode || null,
    source: input.source || "telegram",
    metadata: input.metadata || {},
  });

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate:${input.telegramId}`}))`);
    const [existing] = await tx.select().from(affiliateAttributions)
      .where(eq(affiliateAttributions.telegramId, input.telegramId)).for("update").limit(1);
    const now = new Date();
    if (existing?.status === "active" && existing.expiresAt > now) {
      return { attributed: false as const, reason: "existing_first_touch" as const, partnerId: existing.partnerId, expiresAt: existing.expiresAt };
    }
    const [account] = await tx.select({ userId: telegramAccounts.userId }).from(telegramAccounts)
      .where(eq(telegramAccounts.telegramId, input.telegramId)).limit(1);
    if (account?.userId === partner.userId) {
      return { attributed: false as const, reason: "self_referral" as const };
    }
    if (account?.userId && await hasRecentPaidMatch(account.userId, now)) {
      if (existing) await tx.update(affiliateAttributions).set({ status: "ineligible_active_user", updatedAt: now }).where(eq(affiliateAttributions.id, existing.id));
      else await tx.insert(affiliateAttributions).values({
        partnerId: partner.id, telegramId: input.telegramId, userId: account.userId,
        campaignCode: input.campaignCode || null, source: input.source || "telegram",
        status: "ineligible_active_user", attributedAt: now,
        expiresAt: affiliateAttributionExpiresAt(now),
        metadata: input.metadata || {},
      });
      return { attributed: false as const, reason: "existing_active_player" as const };
    }
    const expiresAt = affiliateAttributionExpiresAt(now, partner.attributionDays);
    const oldMetadata = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    const oldHistory = Array.isArray(oldMetadata.history) ? oldMetadata.history.slice(-9) : [];
    const history = existing ? [...oldHistory, {
      partnerId: existing.partnerId,
      status: existing.status,
      attributedAt: existing.attributedAt.toISOString(),
      expiresAt: existing.expiresAt.toISOString(),
    }] : oldHistory;
    const values = {
      partnerId: partner.id,
      telegramId: input.telegramId,
      userId: account?.userId || null,
      campaignCode: input.campaignCode || null,
      source: input.source || "telegram",
      status: "active",
      attributedAt: now,
      expiresAt,
      metadata: { ...(input.metadata || {}), ...(history.length ? { history } : {}) },
      updatedAt: now,
    } as const;
    if (existing) await tx.update(affiliateAttributions).set(values).where(eq(affiliateAttributions.id, existing.id));
    else await tx.insert(affiliateAttributions).values(values);
    return { attributed: true as const, partnerId: partner.id, mediaName: partner.mediaName, expiresAt };
  });
}

/**
 * Records a click on a web invite link (`/r/<code>`).
 *
 * The Telegram flow identifies a visitor by their Telegram id. A browser has no
 * such thing, so the caller mints an opaque cookie value and passes it here as
 * `visitorKey`; it is stored in `telegram_id` too (prefixed, so it can never
 * collide with a real numeric Telegram id) because that column is NOT NULL.
 *
 * First touch wins, exactly like the Telegram path: an existing live
 * attribution is never overwritten.
 */
export async function recordWebAffiliateVisit(input: {
  visitorKey: string;
  referralCode: string;
  campaignCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ensureAffiliateSchema();
  const code = normalizeAffiliateCode(input.referralCode);
  const visitorKey = String(input.visitorKey || "").trim().slice(0, 64);
  if (!visitorKey) return { attributed: false as const, reason: "missing_visitor" as const };
  const [partner] = await db.select().from(mediaPartners).where(and(
    eq(mediaPartners.referralCode, code),
    eq(mediaPartners.status, "active"),
  )).limit(1);
  if (!partner) return { attributed: false as const, reason: "partner_not_active" as const };

  await db.insert(affiliateClicks).values({
    partnerId: partner.id,
    telegramId: null,
    campaignCode: input.campaignCode || null,
    source: "web_invite_link",
    metadata: { ...(input.metadata || {}), visitorKey },
  });

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate:${visitorKey}`}))`);
    const now = new Date();
    const [existing] = await tx.select().from(affiliateAttributions)
      .where(eq(affiliateAttributions.visitorKey, visitorKey)).for("update").limit(1);
    if (existing?.status === "active" && existing.expiresAt > now) {
      return { attributed: false as const, reason: "existing_first_touch" as const, partnerId: existing.partnerId };
    }
    const expiresAt = affiliateAttributionExpiresAt(now, partner.attributionDays);
    const values = {
      partnerId: partner.id,
      // NOT NULL column; the prefix keeps it disjoint from real Telegram ids.
      telegramId: visitorKey.slice(0, 32),
      visitorKey,
      campaignCode: input.campaignCode || null,
      source: "web_invite_link",
      status: "active",
      attributedAt: now,
      expiresAt,
      metadata: input.metadata || {},
      updatedAt: now,
    } as const;
    if (existing) await tx.update(affiliateAttributions).set(values).where(eq(affiliateAttributions.id, existing.id));
    else await tx.insert(affiliateAttributions).values(values);
    return { attributed: true as const, partnerId: partner.id, mediaName: partner.mediaName, expiresAt };
  });
}

/**
 * Attaches a freshly registered account to a web attribution captured before
 * signup. Mirrors `bindAffiliateAttribution`, including the self-referral and
 * already-active-player guards.
 */
export async function bindWebAffiliateAttribution(visitorKey: string, userId: string) {
  await ensureAffiliateSchema();
  const key = String(visitorKey || "").trim().slice(0, 64);
  if (!key) return { bound: false as const, reason: "missing_visitor" as const };
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-bind:${userId}`}))`);
    const [attribution] = await tx.select().from(affiliateAttributions)
      .where(eq(affiliateAttributions.visitorKey, key)).for("update").limit(1);
    if (!attribution || attribution.status !== "active" || attribution.expiresAt <= new Date()) return { bound: false as const };
    if (attribution.userId && attribution.userId !== userId) return { bound: false as const, reason: "visitor_already_bound" as const };
    const [owner] = await tx.select({ userId: mediaPartners.userId }).from(mediaPartners)
      .where(eq(mediaPartners.id, attribution.partnerId)).limit(1);
    if (owner?.userId === userId) {
      await tx.update(affiliateAttributions).set({ status: "revoked", updatedAt: new Date() })
        .where(eq(affiliateAttributions.id, attribution.id));
      return { bound: false as const, reason: "self_referral" as const };
    }
    if (await hasRecentPaidMatch(userId, attribution.attributedAt)) {
      await tx.update(affiliateAttributions).set({ status: "ineligible_active_user", userId, updatedAt: new Date() })
        .where(eq(affiliateAttributions.id, attribution.id));
      return { bound: false as const, reason: "existing_active_player" as const };
    }
    const [other] = await tx.select({ id: affiliateAttributions.id }).from(affiliateAttributions)
      .where(and(eq(affiliateAttributions.userId, userId), sql`${affiliateAttributions.id} <> ${attribution.id}`)).limit(1);
    if (other) return { bound: false as const, reason: "user_already_attributed" as const };
    await tx.update(affiliateAttributions).set({ userId, updatedAt: new Date() }).where(eq(affiliateAttributions.id, attribution.id));
    return { bound: true as const, partnerId: attribution.partnerId, expiresAt: attribution.expiresAt };
  });
}

export async function bindAffiliateAttribution(telegramId: string, userId: string) {
  await ensureAffiliateSchema();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-bind:${userId}`}))`);
    const [attribution] = await tx.select().from(affiliateAttributions)
      .where(eq(affiliateAttributions.telegramId, telegramId)).for("update").limit(1);
    if (!attribution || attribution.status !== "active" || attribution.expiresAt <= new Date()) return { bound: false as const };
    const [owner] = await tx.select({ userId: mediaPartners.userId }).from(mediaPartners)
      .where(eq(mediaPartners.id, attribution.partnerId)).limit(1);
    if (owner?.userId === userId) {
      await tx.update(affiliateAttributions).set({ status: "revoked", updatedAt: new Date() })
        .where(eq(affiliateAttributions.id, attribution.id));
      return { bound: false as const, reason: "self_referral" as const };
    }
    if (await hasRecentPaidMatch(userId, attribution.attributedAt)) {
      await tx.update(affiliateAttributions).set({ status: "ineligible_active_user", userId, updatedAt: new Date() })
        .where(eq(affiliateAttributions.id, attribution.id));
      return { bound: false as const, reason: "existing_active_player" as const };
    }
    const [other] = await tx.select({ id: affiliateAttributions.id }).from(affiliateAttributions)
      .where(and(eq(affiliateAttributions.userId, userId), sql`${affiliateAttributions.id} <> ${attribution.id}`)).limit(1);
    if (other) return { bound: false as const, reason: "user_already_attributed" as const };
    await tx.update(affiliateAttributions).set({ userId, updatedAt: new Date() }).where(eq(affiliateAttributions.id, attribution.id));
    return { bound: true as const, partnerId: attribution.partnerId, expiresAt: attribution.expiresAt };
  });
}

async function dailyCommissionCount(client: any, userId: string) {
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await client.select({ value: count() }).from(affiliateCommissionEvents)
    .where(and(
      gte(affiliateCommissionEvents.createdAt, threshold),
      sql`${affiliateCommissionEvents.status} <> 'reversed'`,
      sql`${affiliateCommissionEvents.risk}->'referredUsers' ? ${userId}`,
    ));
  return Number(row?.value || 0);
}

/** Called inside the verified Match settlement transaction. */
export async function createAffiliateCommissionForMatch(client: any, matchId: string) {
  const [existing] = await client.select({ id: affiliateCommissionEvents.id }).from(affiliateCommissionEvents)
    .where(eq(affiliateCommissionEvents.matchId, matchId)).limit(1);
  if (existing) return { created: false as const, reason: "already_exists" as const };
  const entries = await client.select({ userId: clash1v1Entries.userId, stakeMode: clash1v1Entries.stakeMode })
    .from(clash1v1Entries).where(eq(clash1v1Entries.matchedMatchId, matchId));
  if (entries.length !== 2 || entries.some((entry: { stakeMode: string }) => entry.stakeMode !== "paid")) {
    return { created: false as const, reason: "not_paid_duel" as const };
  }
  const userIds = entries.map((entry: { userId: string }) => entry.userId);
  const now = new Date();
  const attributions = await client.select({
    userId: affiliateAttributions.userId,
    partnerId: affiliateAttributions.partnerId,
  }).from(affiliateAttributions).innerJoin(mediaPartners, eq(affiliateAttributions.partnerId, mediaPartners.id)).where(and(
    inArray(affiliateAttributions.userId, userIds),
    eq(affiliateAttributions.status, "active"),
    gt(affiliateAttributions.expiresAt, now),
    eq(mediaPartners.status, "active"),
  ));
  const eligible: Array<{ userId: string; partnerId: string }> = [];
  for (const row of attributions) {
    if (!row.userId) continue;
    if (await dailyCommissionCount(client, row.userId) >= AFFILIATE_DAILY_MATCH_CAP_PER_USER) continue;
    eligible.push({ userId: row.userId, partnerId: row.partnerId });
  }
  if (!eligible.length) return { created: false as const, reason: "no_active_attribution" as const };
  const allocations = allocateAffiliateCommission(eligible);
  const liveAccrual = await affiliateAccrualLiveForUsers(client, eligible.map((row) => row.userId));
  const eventStatus = liveAccrual ? "pending" : "shadow";
  const [event] = await client.insert(affiliateCommissionEvents).values({
    matchId,
    sourceType: "clash_match",
    sourceId: matchId,
    totalAmountRial: AFFILIATE_COMMISSION_RIAL.toString(),
    status: eventStatus,
    availableAt: new Date(now.getTime() + AFFILIATE_HOLD_HOURS * 60 * 60 * 1000),
    risk: {
      mode: eventStatus,
      rollout: affiliateRolloutMode(),
      referredUsers: eligible.map((row) => row.userId),
      partnerCount: allocations.length,
    },
  }).onConflictDoNothing({ target: affiliateCommissionEvents.matchId }).returning();
  if (!event) return { created: false as const, reason: "concurrent_duplicate" as const };
  for (const allocation of allocations) {
    await client.insert(affiliateCommissionShares).values({
      eventId: event.id,
      partnerId: allocation.partnerId,
      referredUserId: allocation.referredUserId,
      amountRial: allocation.amountRial.toString(),
      status: eventStatus,
    });
  }
  return { created: true as const, eventId: event.id, status: eventStatus, partnerCount: allocations.length };
}

async function affiliateEventStillEligible(event: { matchId: string | null; sourceType?: string | null; sourceId?: string | null }) {
  if (event.sourceType === "cod_room_entry") {
    if (!event.sourceId) return false;
    const [entry] = await db.select({ status: codRoomEntries.status, roomStatus: codRooms.status })
      .from(codRoomEntries)
      .innerJoin(codRooms, eq(codRoomEntries.roomId, codRooms.id))
      .where(eq(codRoomEntries.id, event.sourceId)).limit(1);
    const [refund] = await db.select({ id: transactions.id }).from(transactions).where(and(
      eq(transactions.type, "refund"),
      sql`${transactions.metadata}->>'entryId' = ${event.sourceId}`,
    )).limit(1);
    return entry?.status === "settled" && entry.roomStatus === "completed" && !refund;
  }
  const matchId = event.matchId || event.sourceId;
  if (!matchId) return false;
  const [match] = await db.select({ status: matches.status }).from(matches).where(eq(matches.id, matchId)).limit(1);
  const [openDispute] = await db.select({ id: disputes.id }).from(disputes)
    .where(and(eq(disputes.matchId, matchId), eq(disputes.status, "open"))).limit(1);
  const [refund] = await db.select({ id: transactions.id }).from(transactions).where(and(
    eq(transactions.type, "refund"),
    sql`${transactions.metadata}->>'matchId' = ${matchId}`,
  )).limit(1);
  return match?.status === "completed" && !openDispute && !refund;
}

export async function processAffiliateCommissions(limit = 100) {
  await ensureAffiliateSchema();
  const now = new Date();
  await db.delete(affiliateClicks).where(lte(affiliateClicks.createdAt, new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)));
  await db.update(affiliateAttributions).set({ status: "expired", updatedAt: now })
    .where(and(eq(affiliateAttributions.status, "active"), lte(affiliateAttributions.expiresAt, now)));
  const due = await db.select().from(affiliateCommissionEvents).where(and(
    eq(affiliateCommissionEvents.status, "pending"),
    lte(affiliateCommissionEvents.availableAt, now),
  )).limit(limit);
  let available = 0;
  let reversed = 0;
  for (const event of due) {
    const valid = await affiliateEventStillEligible(event);
    await db.transaction(async (tx) => {
      await tx.update(affiliateCommissionEvents).set(valid
        ? { status: "available", updatedAt: now }
        : { status: "reversed", reversedAt: now, reversalReason: "match_not_eligible_after_hold", updatedAt: now }
      ).where(and(eq(affiliateCommissionEvents.id, event.id), eq(affiliateCommissionEvents.status, "pending")));
      await tx.update(affiliateCommissionShares).set(valid
        ? { status: "available", updatedAt: now }
        : { status: "reversed", updatedAt: now }
      ).where(eq(affiliateCommissionShares.eventId, event.id));
    });
    if (valid) available += 1; else reversed += 1;
  }
  const alreadyAvailable = await db.select({
    id: affiliateCommissionEvents.id,
    matchId: affiliateCommissionEvents.matchId,
    sourceType: affiliateCommissionEvents.sourceType,
    sourceId: affiliateCommissionEvents.sourceId,
  }).from(affiliateCommissionEvents).where(eq(affiliateCommissionEvents.status, "available")).limit(limit);
  let invalidatedAvailable = 0;
  for (const event of alreadyAvailable) {
    if (await affiliateEventStillEligible(event)) continue;
    await db.transaction(async (tx) => {
      await tx.update(affiliateCommissionEvents).set({ status: "reversed", reversedAt: now, reversalReason: "match_became_ineligible", updatedAt: now })
        .where(and(eq(affiliateCommissionEvents.id, event.id), eq(affiliateCommissionEvents.status, "available")));
      await tx.update(affiliateCommissionShares).set({ status: "reversed", updatedAt: now })
        .where(and(eq(affiliateCommissionShares.eventId, event.id), eq(affiliateCommissionShares.status, "available"), isNull(affiliateCommissionShares.payoutId)));
    });
    invalidatedAvailable += 1;
  }
  return { checked: due.length + alreadyAvailable.length, available, reversed, invalidatedAvailable };
}

export async function getMediaPartnerDashboard(userId: string) {
  await ensureAffiliateSchema();
  const [partner] = await db.select().from(mediaPartners).where(eq(mediaPartners.userId, userId)).limit(1);
  if (!partner) return { partner: null, stats: null, properties: [], payouts: [] };
  const [clicks, activeAttributions, totalReferrals, matchesCount, amounts, properties, payouts, agreement] = await Promise.all([
    db.select({ value: count() }).from(affiliateClicks).where(eq(affiliateClicks.partnerId, partner.id)),
    db.select({ value: count() }).from(affiliateAttributions).where(and(
      eq(affiliateAttributions.partnerId, partner.id), eq(affiliateAttributions.status, "active"), isNotNull(affiliateAttributions.userId),
    )),
    db.select({ value: count() }).from(affiliateAttributions).where(and(
      eq(affiliateAttributions.partnerId, partner.id), inArray(affiliateAttributions.status, ["active", "expired"]), isNotNull(affiliateAttributions.userId),
    )),
    db.select({ value: count() }).from(affiliateCommissionShares).where(and(eq(affiliateCommissionShares.partnerId, partner.id), inArray(affiliateCommissionShares.status, ["shadow", "pending", "available", "reserved", "paid"]))),
    db.select({ status: affiliateCommissionShares.status, amount: sql<string>`COALESCE(SUM(${affiliateCommissionShares.amountRial}), 0)` })
      .from(affiliateCommissionShares).where(eq(affiliateCommissionShares.partnerId, partner.id)).groupBy(affiliateCommissionShares.status),
    db.select().from(mediaProperties).where(eq(mediaProperties.partnerId, partner.id)).orderBy(desc(mediaProperties.createdAt)),
    db.select().from(affiliatePayouts).where(eq(affiliatePayouts.partnerId, partner.id)).orderBy(desc(affiliatePayouts.requestedAt)).limit(20),
    db.select({ id: mediaPartnerAgreements.id, contractVersion: mediaPartnerAgreements.contractVersion, acceptedAt: mediaPartnerAgreements.acceptedAt })
      .from(mediaPartnerAgreements).where(eq(mediaPartnerAgreements.partnerId, partner.id)).orderBy(desc(mediaPartnerAgreements.acceptedAt)).limit(1),
  ]);
  const totals: Record<string, string> = {};
  for (const row of amounts) totals[row.status] = row.amount;
  return {
    partner,
    agreement: partner.contractAcceptedAt ? agreement[0] || null : null,
    stats: {
      clicks: Number(clicks[0]?.value || 0),
      activeAttributions: Number(activeAttributions[0]?.value || 0),
      totalReferrals: Number(totalReferrals[0]?.value || 0),
      qualifiedMatches: Number(matchesCount[0]?.value || 0),
      totals,
    },
    properties,
    payouts,
  };
}

/**
 * Creates a personal referral account and issues its code.
 *
 * Since the two-stage rework this needs nothing but a logged-in user who has
 * accepted the three short rules. The national id, the full contract and the
 * sheba moved to the cash-withdrawal stage where they are legally required --
 * demanding them here is what kept the programme at 8 clicks and no
 * commissions, and locked out the third of users with no national id on file.
 */
export async function createPersonalReferralAccount(input: {
  userId: string;
  displayName: string;
  nationalId?: string | null;
  quickRulesAccepted?: boolean;
}) {
  await ensureAffiliateSchema();
  if (!input.quickRulesAccepted) {
    return { created: false as const, reason: "quick_rules_required" as const };
  }
  const [existing] = await db.select().from(mediaPartners).where(eq(mediaPartners.userId, input.userId)).limit(1);
  if (existing) {
    if (existing.partnerType !== "personal") {
      return { created: false as const, reason: "media_partner_exists" as const, partner: existing };
    }
    // Someone who started under the old flow and stalled at the contract has a
    // draft row with no link. Accepting the short rules activates it in place.
    if (!existing.quickRulesAcceptedAt) {
      const [upgraded] = await db.update(mediaPartners).set({
        quickRulesAcceptedAt: new Date(),
        quickRulesVersion: REFERRAL_QUICK_RULES_VERSION,
        status: existing.status === "draft" ? "active" : existing.status,
        updatedAt: new Date(),
      }).where(eq(mediaPartners.id, existing.id)).returning();
      return { created: false as const, reason: "already_exists" as const, partner: upgraded || existing };
    }
    return { created: false as const, reason: "already_exists" as const, partner: existing };
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const [partner] = await db.insert(mediaPartners).values({
        userId: input.userId,
        partnerType: "personal",
        referralCode: generateAffiliateCode(),
        legalName: input.displayName,
        nationalId: hasUsableNationalId(input.nationalId) ? input.nationalId : null,
        sheba: null,
        mediaName: input.displayName,
        mediaType: "personal_referrer",
        mediaUrl: "https://www.flexa1.ir/referrals",
        followerCount: 0,
        // Active immediately: the link works from here. Cash withdrawal is
        // gated separately by the contract + identity checks.
        status: "active",
        quickRulesAcceptedAt: new Date(),
        quickRulesVersion: REFERRAL_QUICK_RULES_VERSION,
        attributionDays: AFFILIATE_ATTRIBUTION_DAYS,
        commissionRialPerMatch: AFFILIATE_COMMISSION_RIAL.toString(),
        minimumPayoutRial: PERSONAL_REFERRAL_MINIMUM_PAYOUT_RIAL.toString(),
        settings: { destinationChoice: true },
      }).returning();
      return { created: true as const, partner };
    } catch (error: any) {
      if (error?.code !== "23505" || attempt === 3) throw error;
    }
  }
  throw new Error("PERSONAL_REFERRAL_CODE_GENERATION_FAILED");
}

export async function updatePersonalReferralSheba(userId: string, rawSheba: string) {
  await ensureAffiliateSchema();
  const sheba = normalizeIranSheba(rawSheba);
  if (!sheba) return { updated: false as const, reason: "invalid_sheba" as const };
  const [partner] = await db.update(mediaPartners).set({ sheba, updatedAt: new Date() }).where(and(
    eq(mediaPartners.userId, userId), eq(mediaPartners.partnerType, "personal"), eq(mediaPartners.status, "active"),
  )).returning();
  return partner ? { updated: true as const, partner } : { updated: false as const, reason: "partner_not_active" as const };
}

export async function convertAffiliateBalanceToGamingWallet(userId: string) {
  await ensureAffiliateSchema();
  await processAffiliateCommissions(100);
  if (!affiliateProgramLive()) return { ok: false as const, reason: "shadow_mode" as const };
  return db.transaction(async (tx) => {
    const [partner] = await tx.select().from(mediaPartners).where(eq(mediaPartners.userId, userId)).for("update").limit(1);
    if (!partner || partner.status !== "active" || !partner.contractAcceptedAt) return { ok: false as const, reason: "partner_not_active" as const };
    const shares = await tx.select().from(affiliateCommissionShares).where(and(
      eq(affiliateCommissionShares.partnerId, partner.id), eq(affiliateCommissionShares.status, "available"), isNull(affiliateCommissionShares.payoutId),
    )).for("update");
    const amount = shares.reduce((sum: bigint, share: { amountRial: string }) => sum + BigInt(share.amountRial), BigInt(0));
    if (amount <= BigInt(0)) return { ok: false as const, reason: "no_available_balance" as const };
    let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    if (!wallet) [wallet] = await tx.insert(wallets).values({ userId, balance: "0", currency: "RIAL" }).returning();
    const [payout] = await tx.insert(affiliatePayouts).values({
      partnerId: partner.id,
      amountRial: amount.toString(),
      destination: "gaming_wallet",
      status: "paid",
      shebaSnapshot: "GAMENT_WALLET",
      reviewedAt: new Date(),
      paidAt: new Date(),
      reference: `affiliate-wallet-${Date.now()}`,
      adminNote: "Irreversible conversion to non-withdrawable Flexa gaming credit",
    }).returning();
    const credited = await updateWalletBalanceSafely(tx, wallet.id, amount, "increase");
    if (!credited) throw new Error("AFFILIATE_GAMING_WALLET_CREDIT_FAILED");
    await tx.insert(transactions).values({
      walletId: wallet.id,
      amount: amount.toString(),
      type: "deposit",
      status: "completed",
      referenceId: `affiliate-wallet-credit-${payout.id}`,
      metadata: { kind: "affiliate_gaming_credit", partnerId: partner.id, payoutId: payout.id, withdrawable: false },
    });
    await tx.update(affiliateCommissionShares).set({ status: "paid", payoutId: payout.id, updatedAt: new Date() })
      .where(inArray(affiliateCommissionShares.id, shares.map((share: { id: string }) => share.id)));
    const eventIds = [...new Set(shares.map((share: { eventId: string }) => share.eventId))];
    for (const eventId of eventIds) {
      const [remaining] = await tx.select({ value: count() }).from(affiliateCommissionShares).where(and(
        eq(affiliateCommissionShares.eventId, eventId), sql`${affiliateCommissionShares.status} NOT IN ('paid','reversed')`,
      ));
      if (Number(remaining?.value || 0) === 0) await tx.update(affiliateCommissionEvents).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(affiliateCommissionEvents.id, eventId));
    }
    return { ok: true as const, amountRial: amount.toString(), payoutId: payout.id };
  });
}

export async function requestAffiliatePayout(userId: string) {
  await ensureAffiliateSchema();
  await processAffiliateCommissions(100);
  if (!affiliateProgramLive()) return { ok: false as const, reason: "shadow_mode" as const };
  return db.transaction(async (tx) => {
    const [partner] = await tx.select().from(mediaPartners).where(eq(mediaPartners.userId, userId)).for("update").limit(1);
    if (!partner || partner.status !== "active" || !partner.contractAcceptedAt) return { ok: false as const, reason: "partner_not_active" as const };
    // The national id used to be collected at signup. Now that a link needs no
    // legal identity, cash withdrawal has to check for it explicitly -- this is
    // the point where it is actually required.
    if (!hasUsableNationalId(partner.nationalId)) return { ok: false as const, reason: "identity_required" as const };
    if (!partner.sheba) return { ok: false as const, reason: "sheba_required" as const };
    const [pending] = await tx.select({ id: affiliatePayouts.id }).from(affiliatePayouts).where(and(
      eq(affiliatePayouts.partnerId, partner.id), inArray(affiliatePayouts.status, ["requested", "approved"]),
    )).limit(1);
    if (pending) return { ok: false as const, reason: "payout_already_pending" as const };
    const shares = await tx.select().from(affiliateCommissionShares).where(and(
      eq(affiliateCommissionShares.partnerId, partner.id), eq(affiliateCommissionShares.status, "available"), isNull(affiliateCommissionShares.payoutId),
    )).for("update");
    const amount = shares.reduce((sum: bigint, share: { amountRial: string }) => sum + BigInt(share.amountRial), BigInt(0));
    if (amount < BigInt(partner.minimumPayoutRial || AFFILIATE_MINIMUM_PAYOUT_RIAL.toString())) {
      return { ok: false as const, reason: "below_minimum" as const, amountRial: amount.toString(), minimumRial: partner.minimumPayoutRial };
    }
    const [payout] = await tx.insert(affiliatePayouts).values({
      partnerId: partner.id, amountRial: amount.toString(), destination: "bank", status: "requested", shebaSnapshot: partner.sheba,
    }).returning();
    await tx.update(affiliateCommissionShares).set({ status: "reserved", payoutId: payout.id, updatedAt: new Date() })
      .where(inArray(affiliateCommissionShares.id, shares.map((share: { id: string }) => share.id)));
    return { ok: true as const, payout };
  });
}

export async function connectTelegramMediaGroup(input: {
  referralCode: string;
  telegramUserId: string;
  chatId: string;
  title?: string | null;
}) {
  await ensureAffiliateSchema();
  const code = normalizeAffiliateCode(input.referralCode);
  const [partner] = await db.select().from(mediaPartners).innerJoin(telegramAccounts, eq(mediaPartners.userId, telegramAccounts.userId)).where(and(
    eq(mediaPartners.referralCode, code), eq(mediaPartners.status, "active"), eq(telegramAccounts.telegramId, input.telegramUserId),
  )).limit(1);
  const partnerRow = partner?.media_partners;
  if (!partnerRow) return { connected: false as const, reason: "partner_not_active" as const };
  const [existingProperty] = await db.select({ partnerId: mediaProperties.partnerId }).from(mediaProperties).where(and(
    eq(mediaProperties.platform, "telegram_group"), eq(mediaProperties.externalId, input.chatId),
  )).limit(1);
  if (existingProperty && existingProperty.partnerId !== partnerRow.id) {
    return { connected: false as const, reason: "group_already_connected" as const };
  }
  const [property] = await db.insert(mediaProperties).values({
    partnerId: partnerRow.id, platform: "telegram_group", externalId: input.chatId,
    title: input.title || null, status: "verified", verifiedByUserId: partnerRow.userId, verifiedAt: new Date(),
  }).onConflictDoUpdate({
    target: [mediaProperties.platform, mediaProperties.externalId],
    set: { partnerId: partnerRow.id, title: input.title || null, status: "verified", verifiedByUserId: partnerRow.userId, verifiedAt: new Date(), updatedAt: new Date() },
  }).returning();
  return { connected: true as const, property, partner: partnerRow };
}

export async function affiliatePartnerForTelegramChat(chatId: string) {
  await ensureAffiliateSchema();
  const [row] = await db.select({ referralCode: mediaPartners.referralCode, mediaName: mediaPartners.mediaName })
    .from(mediaProperties).innerJoin(mediaPartners, eq(mediaProperties.partnerId, mediaPartners.id)).where(and(
      eq(mediaProperties.platform, "telegram_group"), eq(mediaProperties.externalId, chatId),
      eq(mediaProperties.status, "verified"), eq(mediaPartners.status, "active"),
    )).limit(1);
  return row || null;
}

export async function adminUpdateMediaPartner(input: {
  partnerId: string;
  action: "approve" | "suspend" | "reject" | "terminate";
  adminId: string;
  reason?: string;
}) {
  await ensureAffiliateSchema();
  const status = input.action === "approve" ? "active" : input.action === "suspend" ? "suspended" : input.action === "reject" ? "rejected" : "terminated";
  const [updated] = await db.update(mediaPartners).set({
    status,
    approvedById: input.action === "approve" ? input.adminId : undefined,
    approvedAt: input.action === "approve" ? new Date() : undefined,
    rejectionReason: input.reason || null,
    updatedAt: new Date(),
  }).where(eq(mediaPartners.id, input.partnerId)).returning();
  return updated || null;
}

export async function adminUpdateAffiliatePayout(input: {
  payoutId: string;
  action: "approve" | "paid" | "reject";
  adminId: string;
  reference?: string;
  note?: string;
}) {
  await ensureAffiliateSchema();
  if (input.action !== "reject") {
    const eventRows = await db.select({
      id: affiliateCommissionEvents.id,
      matchId: affiliateCommissionEvents.matchId,
      sourceType: affiliateCommissionEvents.sourceType,
      sourceId: affiliateCommissionEvents.sourceId,
    }).from(affiliateCommissionShares).innerJoin(affiliateCommissionEvents, eq(affiliateCommissionShares.eventId, affiliateCommissionEvents.id))
      .where(eq(affiliateCommissionShares.payoutId, input.payoutId));
    for (const event of eventRows) {
      if (await affiliateEventStillEligible(event)) continue;
      return db.transaction(async (tx) => {
        await tx.update(affiliateCommissionEvents).set({ status: "reversed", reversedAt: new Date(), reversalReason: "payout_review_match_ineligible", updatedAt: new Date() })
          .where(eq(affiliateCommissionEvents.id, event.id));
        await tx.update(affiliateCommissionShares).set({ status: "reversed", updatedAt: new Date() })
          .where(and(eq(affiliateCommissionShares.payoutId, input.payoutId), eq(affiliateCommissionShares.eventId, event.id)));
        await tx.update(affiliateCommissionShares).set({ status: "available", payoutId: null, updatedAt: new Date() })
          .where(and(eq(affiliateCommissionShares.payoutId, input.payoutId), sql`${affiliateCommissionShares.eventId} <> ${event.id}`));
        const [rejected] = await tx.update(affiliatePayouts).set({ status: "rejected", reviewedById: input.adminId, reviewedAt: new Date(), adminNote: "Auto-rejected: linked Match became ineligible" })
          .where(eq(affiliatePayouts.id, input.payoutId)).returning();
        return rejected || null;
      });
    }
  }
  return db.transaction(async (tx) => {
    const [payout] = await tx.select().from(affiliatePayouts).where(eq(affiliatePayouts.id, input.payoutId)).for("update").limit(1);
    if (!payout || !["requested", "approved"].includes(payout.status)) return null;
    if (input.action === "reject") {
      await tx.update(affiliateCommissionShares).set({ status: "available", payoutId: null, updatedAt: new Date() }).where(eq(affiliateCommissionShares.payoutId, payout.id));
      const [updated] = await tx.update(affiliatePayouts).set({ status: "rejected", reviewedById: input.adminId, reviewedAt: new Date(), adminNote: input.note || null }).where(eq(affiliatePayouts.id, payout.id)).returning();
      return updated;
    }
    if (input.action === "approve") {
      const [updated] = await tx.update(affiliatePayouts).set({ status: "approved", reviewedById: input.adminId, reviewedAt: new Date(), adminNote: input.note || null }).where(eq(affiliatePayouts.id, payout.id)).returning();
      return updated;
    }
    await tx.update(affiliateCommissionShares).set({ status: "paid", updatedAt: new Date() }).where(eq(affiliateCommissionShares.payoutId, payout.id));
    const eventIds = await tx.select({ eventId: affiliateCommissionShares.eventId }).from(affiliateCommissionShares).where(eq(affiliateCommissionShares.payoutId, payout.id));
    for (const eventId of [...new Set(eventIds.map((row) => row.eventId))]) {
      const [remaining] = await tx.select({ value: count() }).from(affiliateCommissionShares).where(and(
        eq(affiliateCommissionShares.eventId, eventId),
        sql`${affiliateCommissionShares.status} NOT IN ('paid','reversed')`,
      ));
      if (Number(remaining?.value || 0) === 0) {
        await tx.update(affiliateCommissionEvents).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(affiliateCommissionEvents.id, eventId));
      }
    }
    const [updated] = await tx.update(affiliatePayouts).set({ status: "paid", reviewedById: input.adminId, reviewedAt: payout.reviewedAt || new Date(), paidAt: new Date(), reference: input.reference || null, adminNote: input.note || null }).where(eq(affiliatePayouts.id, payout.id)).returning();
    return updated;
  });
}

export async function affiliateAdminOverview() {
  await ensureAffiliateSchema();
  const [partners, payouts, events] = await Promise.all([
    db.select().from(mediaPartners).orderBy(desc(mediaPartners.createdAt)).limit(200),
    db.select().from(affiliatePayouts).orderBy(desc(affiliatePayouts.requestedAt)).limit(200),
    db.select().from(affiliateCommissionEvents).orderBy(desc(affiliateCommissionEvents.createdAt)).limit(200),
  ]);
  return { partners, payouts, events, live: affiliateProgramLive(), rollout: affiliateRolloutMode() };
}

export function affiliatePublicLink(referralCode: string, campaignCode?: string) {
  const bot = serverBotUsername();
  const suffix = campaignCode ? `_${normalizeAffiliateCode(campaignCode)}` : "";
  return `https://t.me/${bot}?start=aff_${normalizeAffiliateCode(referralCode)}${suffix}`;
}

export function redactSheba(sheba?: string | null) {
  return sheba && sheba.length >= 8 ? `${sheba.slice(0, 4)}••••••••••••••••${sheba.slice(-4)}` : "—";
}
