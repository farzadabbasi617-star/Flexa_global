import { and, asc, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { telegramOutbox, telegramWebhookUpdates } from "@/db/schema";
import logger from "@/lib/logger";
import { telegramApi } from "@/lib/telegram-api";
import {
  MAX_TELEGRAM_UPDATE_ATTEMPTS,
  telegramRetryDelaySeconds,
} from "@/lib/telegram-reliability-policy";

const UPDATE_LEASE_MS = 2 * 60 * 1000;
const UPDATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_LEASE_MS = 2 * 60 * 1000;

let ensurePromise: Promise<void> | undefined;

/** Create reliability tables on first use, while keeping a manual migration. */
export function ensureTelegramReliabilitySchema(): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    // This table originally lived in an older optional growth migration, while
    // core webhook/1V1 code depends on it for notification de-duplication.
    // Repair it here so a partially migrated Production database is healed by
    // the same readiness path as the webhook/outbox tables.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS telegram_sent_notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dedupe_key varchar(180) NOT NULL UNIQUE,
        telegram_id varchar(32),
        tournament_id uuid REFERENCES tournaments(id),
        type varchar(50) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS telegram_sent_notifications_dedupe_idx ON telegram_sent_notifications (dedupe_key)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS telegram_sent_notifications_tournament_idx ON telegram_sent_notifications (tournament_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS telegram_sent_notifications_type_idx ON telegram_sent_notifications (type)`));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS telegram_webhook_updates (
        update_id varchar(32) PRIMARY KEY,
        status varchar(20) NOT NULL DEFAULT 'processing',
        attempts integer NOT NULL DEFAULT 1,
        locked_until timestamp NOT NULL,
        last_error text,
        received_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp,
        expires_at timestamp NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS telegram_webhook_updates_status_lock_idx ON telegram_webhook_updates (status, locked_until)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS telegram_webhook_updates_expires_idx ON telegram_webhook_updates (expires_at)`));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS telegram_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dedupe_key varchar(191) UNIQUE,
        chat_id varchar(100) NOT NULL,
        method varchar(50) NOT NULL DEFAULT 'sendMessage',
        payload jsonb NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        priority integer NOT NULL DEFAULT 0,
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 5,
        next_attempt_at timestamp NOT NULL DEFAULT now(),
        locked_until timestamp,
        last_error text,
        telegram_message_id varchar(64),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        sent_at timestamp
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS telegram_outbox_due_idx ON telegram_outbox (status, next_attempt_at, priority)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS telegram_outbox_lock_idx ON telegram_outbox (status, locked_until)`));
  })().catch((error) => {
    ensurePromise = undefined;
    throw error;
  });
  return ensurePromise;
}

export interface TelegramUpdateClaim {
  claimed: boolean;
  attempts: number;
  status: string;
  degraded?: boolean;
}

/** Atomically claim a Telegram update or reject an active/completed duplicate. */
export async function claimTelegramUpdate(updateId: number): Promise<TelegramUpdateClaim> {
  const key = String(updateId);
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + UPDATE_LEASE_MS);
  const expiresAt = new Date(now.getTime() + UPDATE_RETENTION_MS);

  try {
    await ensureTelegramReliabilitySchema();
    const [claimed] = await db
      .insert(telegramWebhookUpdates)
      .values({ updateId: key, status: "processing", attempts: 1, lockedUntil, expiresAt, receivedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: telegramWebhookUpdates.updateId,
        set: {
          status: "processing",
          attempts: sql`${telegramWebhookUpdates.attempts} + 1`,
          lockedUntil,
          lastError: null,
          expiresAt,
          updatedAt: now,
        },
        setWhere: sql`(${telegramWebhookUpdates.status} = 'failed' OR ${telegramWebhookUpdates.lockedUntil} < NOW()) AND ${telegramWebhookUpdates.attempts} < ${MAX_TELEGRAM_UPDATE_ATTEMPTS}`,
      })
      .returning({ status: telegramWebhookUpdates.status, attempts: telegramWebhookUpdates.attempts });

    if (claimed) return { claimed: true, attempts: claimed.attempts, status: claimed.status };

    const [existing] = await db
      .select({ status: telegramWebhookUpdates.status, attempts: telegramWebhookUpdates.attempts })
      .from(telegramWebhookUpdates)
      .where(eq(telegramWebhookUpdates.updateId, key))
      .limit(1);
    return { claimed: false, attempts: existing?.attempts || 0, status: existing?.status || "duplicate" };
  } catch (error) {
    // Reliability must enhance the bot, not take it offline if DDL permissions
    // or a migration are temporarily unavailable. Business handlers already
    // contain their own transaction/idempotency protections.
    logger.error({ error, updateId }, "Telegram update idempotency unavailable; processing in degraded mode");
    return { claimed: true, attempts: 1, status: "degraded", degraded: true };
  }
}

export async function completeTelegramUpdate(updateId: number) {
  try {
    const now = new Date();
    await db
      .update(telegramWebhookUpdates)
      .set({ status: "completed", completedAt: now, lockedUntil: now, lastError: null, updatedAt: now })
      .where(eq(telegramWebhookUpdates.updateId, String(updateId)));
  } catch (error) {
    logger.warn({ error, updateId }, "Failed to mark Telegram update completed");
  }
}

export async function failTelegramUpdate(updateId: number, error: unknown) {
  try {
    const now = new Date();
    const message = error instanceof Error ? error.message : String(error || "unknown");
    await db
      .update(telegramWebhookUpdates)
      .set({ status: "failed", lockedUntil: now, lastError: message.slice(0, 1000), updatedAt: now })
      .where(eq(telegramWebhookUpdates.updateId, String(updateId)));
  } catch (markError) {
    logger.warn({ error: markError, updateId }, "Failed to mark Telegram update failed");
  }
}

export interface EnqueueTelegramOptions {
  dedupeKey?: string;
  priority?: number;
  maxAttempts?: number;
}

export async function enqueueTelegramCall(
  method: string,
  payload: Record<string, unknown>,
  options: EnqueueTelegramOptions = {}
) {
  await ensureTelegramReliabilitySchema();
  const chatId = payload.chat_id;
  if (typeof chatId !== "string" && typeof chatId !== "number") {
    throw new Error("TELEGRAM_OUTBOX_CHAT_ID_REQUIRED");
  }
  // 0 is never a real chat and "" coerces to it, so a misparsed env var used to
  // queue a row that could only ever fail "chat not found" -- five times, every
  // night. Reject it at the door instead of paying for the retries.
  const normalizedChatId = String(chatId).trim();
  if (!normalizedChatId || normalizedChatId === "0") {
    throw new Error("TELEGRAM_OUTBOX_CHAT_ID_REQUIRED");
  }

  const [created] = await db
    .insert(telegramOutbox)
    .values({
      dedupeKey: options.dedupeKey,
      chatId: normalizedChatId,
      method,
      payload,
      priority: options.priority || 0,
      maxAttempts: Math.min(10, Math.max(1, options.maxAttempts || 5)),
      status: "pending",
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (created) return { queued: true, duplicate: false, id: created.id };
  if (options.dedupeKey) {
    const [existing] = await db
      .select({ id: telegramOutbox.id, status: telegramOutbox.status })
      .from(telegramOutbox)
      .where(eq(telegramOutbox.dedupeKey, options.dedupeKey))
      .limit(1);
    return { queued: false, duplicate: true, id: existing?.id, status: existing?.status };
  }
  return { queued: false, duplicate: false };
}

export function enqueueTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: Record<string, unknown>,
  options: EnqueueTelegramOptions = {}
) {
  return enqueueTelegramCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  }, options);
}

export interface TelegramOutboxProcessResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

/** Claim and deliver a bounded batch; safe for concurrent cron invocations. */
export async function processTelegramOutbox(limit = 50): Promise<TelegramOutboxProcessResult> {
  await ensureTelegramReliabilitySchema();
  const boundedLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const now = new Date();

  // A worker can die after incrementing the final attempt but before recording
  // the provider result. Close those expired leases instead of leaving them in
  // `processing` forever.
  await db
    .update(telegramOutbox)
    .set({ status: "failed", lockedUntil: null, lastError: "Worker lease expired after final attempt", updatedAt: now })
    .where(and(
      eq(telegramOutbox.status, "processing"),
      lt(telegramOutbox.lockedUntil, now),
      sql`${telegramOutbox.attempts} >= ${telegramOutbox.maxAttempts}`
    ));

  const candidates = await db
    .select()
    .from(telegramOutbox)
    .where(or(
      and(eq(telegramOutbox.status, "pending"), lte(telegramOutbox.nextAttemptAt, now)),
      and(eq(telegramOutbox.status, "processing"), lt(telegramOutbox.lockedUntil, now))
    ))
    .orderBy(desc(telegramOutbox.priority), asc(telegramOutbox.nextAttemptAt))
    .limit(boundedLimit * 2);

  const result: TelegramOutboxProcessResult = { claimed: 0, sent: 0, retried: 0, failed: 0 };

  for (const candidate of candidates) {
    if (result.claimed >= boundedLimit) break;
    const lockedUntil = new Date(Date.now() + OUTBOX_LEASE_MS);
    const [claimed] = await db
      .update(telegramOutbox)
      .set({
        status: "processing",
        attempts: sql`${telegramOutbox.attempts} + 1`,
        lockedUntil,
        updatedAt: new Date(),
      })
      .where(and(
        eq(telegramOutbox.id, candidate.id),
        or(
          eq(telegramOutbox.status, "pending"),
          and(eq(telegramOutbox.status, "processing"), lt(telegramOutbox.lockedUntil, now))
        ),
        lte(telegramOutbox.nextAttemptAt, now),
        sql`${telegramOutbox.attempts} < ${telegramOutbox.maxAttempts}`
      ))
      .returning();

    if (!claimed) continue;
    result.claimed += 1;

    const response = await telegramApi(claimed.method, claimed.payload as Record<string, unknown>);
    if (response.ok) {
      const messageId = typeof response.result === "object" && response.result && "message_id" in response.result
        ? String((response.result as { message_id: unknown }).message_id)
        : null;
      await db
        .update(telegramOutbox)
        .set({
          status: "sent",
          sentAt: new Date(),
          lockedUntil: null,
          lastError: null,
          telegramMessageId: messageId,
          updatedAt: new Date(),
        })
        .where(eq(telegramOutbox.id, claimed.id));
      result.sent += 1;
      continue;
    }

    const terminal = claimed.attempts >= claimed.maxAttempts;
    const retryDelaySeconds = telegramRetryDelaySeconds(claimed.attempts);
    await db
      .update(telegramOutbox)
      .set({
        status: terminal ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + retryDelaySeconds * 1000),
        lockedUntil: null,
        lastError: response.description.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(telegramOutbox.id, claimed.id));
    if (terminal) result.failed += 1;
    else result.retried += 1;
  }

  return result;
}

export async function retryFailedTelegramOutbox(limit = 50) {
  await ensureTelegramReliabilitySchema();
  const rows = await db
    .select({ id: telegramOutbox.id })
    .from(telegramOutbox)
    .where(eq(telegramOutbox.status, "failed"))
    .orderBy(asc(telegramOutbox.updatedAt))
    .limit(Math.min(100, Math.max(1, Math.floor(limit))));
  if (!rows.length) return { retried: 0 };

  const ids = rows.map((row) => row.id);
  const updated = await db
    .update(telegramOutbox)
    .set({
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedUntil: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(inArray(telegramOutbox.id, ids), eq(telegramOutbox.status, "failed")))
    .returning({ id: telegramOutbox.id });
  return { retried: updated.length };
}

export async function cleanupTelegramReliability() {
  await ensureTelegramReliabilitySchema();
  const now = new Date();
  const outboxCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const deletedUpdates = await db
    .delete(telegramWebhookUpdates)
    .where(lt(telegramWebhookUpdates.expiresAt, now))
    .returning({ id: telegramWebhookUpdates.updateId });
  const deletedOutbox = await db
    .delete(telegramOutbox)
    .where(and(
      inArray(telegramOutbox.status, ["sent", "failed", "cancelled"]),
      lt(telegramOutbox.updatedAt, outboxCutoff)
    ))
    .returning({ id: telegramOutbox.id });
  return { webhookUpdates: deletedUpdates.length, outbox: deletedOutbox.length };
}
