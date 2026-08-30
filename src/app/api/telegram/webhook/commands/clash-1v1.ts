import { and, count, desc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clash1v1Challenges,
  clash1v1Entries,
  matches,
  players,
  telegramSentNotifications,
  transactions,
  tournaments,
  users,
  wallets,
} from "@/db/schema";
import { activeClash1v1Suspension, CLASH_1V1_CONFIG, ensureClash1v1Schema } from "@/lib/clash-1v1";
import { bigIntFromText, formatTomanFromRial } from "@/lib/money";
import logger from "@/lib/logger";
import { updateWalletBalanceSafely } from "@/lib/wallet-balance-service";
import { APP_URL, CANCEL_TEXT } from "../config";
import { mainMenuKeyboard, removeKeyboard, replyKeyboard } from "../keyboards";
import { clearSession, setSession } from "../sessions";
import { sendMessage, sendPhoto } from "../transport";
import { decodeClashFriendQr } from "./clash-qr";
import { getLinkedUserByTelegram } from "../user-service";
import { extractInviteReference, html } from "../utils";
import { isSupportedClashInvite } from "./clash-1v1-policy";
import { getAdminIds } from "../admin-access";
import {
  CLASH_DUEL_GAME_MODES,
  clashDuelModeLabel,
  clashDuelStakeLabel,
  type ClashDuelGameMode,
  type ClashDuelStakeMode,
} from "@/lib/clash-duel-policy";

const QUEUE_LOCK_ID = 7_100_171;
const RECENT_INVITE_REUSE_MS = 24 * 60 * 60 * 1000;
export const CLASH_1V1_RULES_VERSION = "2026-07-paid-random-v1";

function clash1v1RulesAcceptanceKey(telegramId: string) {
  return `clash1v1:rules:${CLASH_1V1_RULES_VERSION}:${telegramId}`;
}

export async function sendClash1v1Rules(chatId: number, telegramId: string, requireAcceptance = true) {
  await sendMessage(chatId, [
    "📜 <b>قوانین رقابت 1V1 کلش رویال</b>",
    "",
    "1) این محصول یک صف خودکار است؛ روم، Room ID، Password یا براکت چندنفره ندارد.",
    "2) ورودی هر نفر ۵۰٬۰۰۰ USDT و جایزه برنده ۸۰٬۰۰۰ USDT است.",
    "3) فقط Player Tag تأییدشده و متعلق به خود بازیکن مجاز است.",
    "4) بعد از پرداخت، Share Link یا عکس QR دوستی رسمی Clash Royale را برای بات بفرست.",
    "5) بات دو بازیکن آماده را خودکار انتخاب می‌کند و پیوند/QR هر نفر را برای حریف می‌فرستد.",
    "6) مسابقه فقط بعد از زدن «آماده‌ام» توسط هر دو نفر و پیام رسمی شروع Match معتبر است.",
    "7) نتیجه با Battle Log بررسی می‌شود؛ گزارش خلاف واقع یا استفاده از حساب دیگر تخلف است.",
    "8) QR یا Share Link فقط برای افزودن حریف است و نباید اطلاعات حساب در چت ارسال شود.",
    "",
    requireAcceptance ? "برای ادامه باید قوانین را بپذیری." : `نسخه قوانین: <code>${CLASH_1V1_RULES_VERSION}</code>`,
  ].join("\n"), requireAcceptance ? {
    inline_keyboard: [
      [{ text: "✅ قوانین را می‌پذیرم", callback_data: "clash1v1:rules:accept" }],
      [{ text: "انصراف", callback_data: "menu:home" }],
    ],
  } : undefined);
}

export async function recordClash1v1RulesAcceptance(telegramId: string) {
  await db.insert(telegramSentNotifications).values({
    dedupeKey: clash1v1RulesAcceptanceKey(telegramId),
    telegramId,
    type: "clash_1v1_rules_acceptance",
  }).onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
}

export async function acceptClash1v1Rules(chatId: number, telegramId: string) {
  await recordClash1v1RulesAcceptance(telegramId);
  await sendMessage(chatId, "✅ پذیرش قوانین ثبت شد. برای ثبت‌نام واقعی و پرداخت ورودی، دکمه زیر را بزن.", {
    inline_keyboard: [
      [{ text: `💳 پرداخت و ورود به صف — ${CLASH_1V1_CONFIG.entryFee}`, callback_data: "clash1v1:quick_register" }],
      [{ text: "📦 وضعیت مسابقه من", callback_data: "clash1v1:status" }],
    ],
  });
}

interface QueueParticipant {
  entryId: string;
  playerId: string;
  userId: string;
  telegramId: string;
  inviteLink: string | null;
  qrFileId: string | null;
  matchedAt: Date | null;
  readyAt: Date | null;
  displayName: string;
  username: string | null;
  gameId: string | null;
  clashRoyaleId: string | null;
  clashRoyaleUsername: string | null;
  opponentType: string;
  stakeMode: string;
  gameMode: string;
  challengeId: string | null;
}

interface QueuePair {
  matchId: string;
  matchNumber: number;
  tournamentId: string;
  tournamentName: string;
  player1: QueueParticipant;
  player2: QueueParticipant;
}

function participantName(player: QueueParticipant) {
  return player.displayName || player.username || player.clashRoyaleUsername || "Flexa Player";
}

function participantTag(player: QueueParticipant) {
  return player.clashRoyaleId || player.gameId || player.clashRoyaleUsername || "ثبت نشده";
}

export async function ensureClash1v1QueueTournament() {
  await ensureClash1v1Schema();
  return db.transaction(async (tx) => {
    // There must be exactly one active system queue even when two Render
    // instances cold-start at the same time.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);
    const [existing] = await tx
      .select()
      .from(tournaments)
      .where(and(
        eq(tournaments.game, CLASH_1V1_CONFIG.game),
        eq(tournaments.status, "registration"),
        eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel)
      ))
      .orderBy(desc(tournaments.createdAt))
      .limit(1);
    if (existing) {
      if (
        existing.description === CLASH_1V1_CONFIG.description &&
        existing.rules === CLASH_1V1_CONFIG.rules &&
        existing.lobbyNotes === CLASH_1V1_CONFIG.lobbyNotes &&
        existing.entryFee === CLASH_1V1_CONFIG.entryFee &&
        existing.prize1st === CLASH_1V1_CONFIG.prize1st &&
        existing.serverSlots === 2 &&
        !existing.roomId &&
        !existing.roomPassword &&
        !existing.roomVisibleAt
      ) return existing;

      // Keep the public system-tournament copy aligned with the current bot
      // flow. This also upgrades existing rows from the old QR wording without
      // requiring a destructive migration.
      const [updated] = await tx
        .update(tournaments)
        .set({
          name: CLASH_1V1_CONFIG.name,
          format: CLASH_1V1_CONFIG.format,
          status: "registration",
          maxPlayers: CLASH_1V1_CONFIG.maxPlayers,
          serverSlots: 2,
          winnersCount: 1,
          entryFee: CLASH_1V1_CONFIG.entryFee,
          prizePool: CLASH_1V1_CONFIG.prizePool,
          prize1st: CLASH_1V1_CONFIG.prize1st,
          prize2nd: null,
          prize3rd: null,
          prize4to10: null,
          gameMode: CLASH_1V1_CONFIG.gameMode,
          mapName: CLASH_1V1_CONFIG.mapName,
          description: CLASH_1V1_CONFIG.description,
          rules: CLASH_1V1_CONFIG.rules,
          lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
          roomId: null,
          roomPassword: null,
          roomVisibleAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, existing.id))
        .returning();
      return updated || existing;
    }

    const [created] = await tx
      .insert(tournaments)
      .values({
        name: CLASH_1V1_CONFIG.name,
        game: CLASH_1V1_CONFIG.game,
        format: CLASH_1V1_CONFIG.format,
        status: CLASH_1V1_CONFIG.status,
        description: CLASH_1V1_CONFIG.description,
        maxPlayers: CLASH_1V1_CONFIG.maxPlayers,
        prizePool: CLASH_1V1_CONFIG.prizePool,
        winnersCount: 1,
        categoryLabel: CLASH_1V1_CONFIG.categoryLabel,
        entryFee: CLASH_1V1_CONFIG.entryFee,
        gameMode: CLASH_1V1_CONFIG.gameMode,
        mapName: CLASH_1V1_CONFIG.mapName,
        serverSlots: 2,
        prize1st: CLASH_1V1_CONFIG.prize1st,
        rules: CLASH_1V1_CONFIG.rules,
        lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
      })
      .returning();
    return created;
  });
}

async function getOrCreatePlayer(userId: string, displayName: string, username?: string | null, client: any = db) {
  const [existing] = await client.select().from(players).where(eq(players.visibleUserId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await client
    .insert(players)
    .values({
      visibleUserId: userId,
      username: username || `player_${userId.slice(0, 8)}`,
      displayName: displayName || username || "Flexa Player",
    })
    .returning();
  return created;
}

async function getActiveEntry(userId: string) {
  await ensureClash1v1Schema();
  const [entry] = await db
    .select()
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.userId, userId),
      inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"])
    ))
    .orderBy(desc(clash1v1Entries.createdAt))
    .limit(1);
  return entry || null;
}

async function queuePosition(entry: {
  id: string;
  submittedAt: Date | null;
  opponentType?: string;
  stakeMode?: string;
  gameMode?: string;
}) {
  if (!entry.submittedAt) return null;
  const [{ value }] = await db
    .select({ value: count() })
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.status, "queued"),
      eq(clash1v1Entries.opponentType, entry.opponentType || "random"),
      eq(clash1v1Entries.stakeMode, entry.stakeMode || "paid"),
      eq(clash1v1Entries.gameMode, entry.gameMode || "normal"),
      lte(clash1v1Entries.submittedAt, entry.submittedAt)
    ));
  return Math.max(1, Number(value || 1));
}

function inviteLinkPrompt(entryId: string) {
  return [
    "🔗 <b>پیوند دوستی کلش رویال را بفرست</b>",
    "",
    "ورودی با موفقیت رزرو شد. برای ورود نهایی به صف:",
    "1) در Clash Royale وارد بخش <b>اجتماعی (Social)</b> شو.",
    "2) روی <b>افزودن دوست (+)</b> بزن.",
    "3) زیر QR روی <b>اشتراک‌گذاری پیوند</b> بزن.",
    "4) پیوند را برای همین بات Share کن یا اینجا Paste کن.",
    "",
    "می‌توانی خودِ عکس QR را بفرستی یا «اشتراک‌گذاری پیوند» را Paste کنی.",
    "بات QR را خودکار می‌خواند؛ اگر قابل‌خواندن نباشد هم تصویر QR تو را برای حریف می‌فرستد.",
    "<code>https://link.clashroyale.com/invite/friend/...</code>",
    "",
    `شناسه صف: <code>${html(entryId.slice(0, 8))}</code>`,
  ].join("\n");
}

export async function sendClashFriendLinkGuide(chatId: number) {
  const steps = [
    {
      photo: `${APP_URL}/guides/clash-friend-link-step-1.jpg`,
      caption: "🖼 <b>مرحله ۱:</b> در بخش «اجتماعی» روی دکمه سبز «افزودن دوست» بزن.",
    },
    {
      photo: `${APP_URL}/guides/clash-friend-link-step-2.jpg`,
      caption: "🖼 <b>مرحله ۲:</b> روی «اشتراک‌گذاری پیوند» بزن و پیوند را برای همین بات بفرست. QR داخل تصویر آموزشی برای حفظ حریم خصوصی پوشانده شده است.",
    },
  ];

  for (const step of steps) {
    try {
      const result = await sendPhoto(chatId, step.photo, step.caption);
      if (!result?.ok) logger.warn({ chatId, photo: step.photo }, "Clash friend-link guide photo was not delivered");
    } catch (err) {
      // The text instructions are sufficient fallback; a transient image/CDN
      // error must never break or roll back the paid queue conversation.
      logger.warn({ err, chatId, photo: step.photo }, "Clash friend-link guide photo send failed");
    }
  }
}

export async function promptClash1v1Qr(chatId: number, telegramId: string, entryId: string) {
  // Keep the legacy function/state name so users already in this conversation
  // survive a rolling deploy; the accepted input is now an invite link only.
  await setSession(telegramId, "clash_1v1_qr_submission", { clash1v1EntryId: entryId });
  const [entry] = await db.select({ gameMode: clash1v1Entries.gameMode, stakeMode: clash1v1Entries.stakeMode })
    .from(clash1v1Entries).where(eq(clash1v1Entries.id, entryId)).limit(1);
  const selection = entry
    ? `\n\n🎮 مود: <b>${html(clashDuelModeLabel(entry.gameMode))}</b>\n💳 نوع: <b>${html(clashDuelStakeLabel(entry.stakeMode))}</b>`
    : "";
  await sendMessage(chatId, `${inviteLinkPrompt(entryId)}${selection}`, replyKeyboard([[CANCEL_TEXT]]));
  await sendClashFriendLinkGuide(chatId);
  // Re-send the player's own QR photo so they can confirm it is the correct one.
  const [sent] = await db.select({ qrFileId: clash1v1Entries.qrFileId }).from(clash1v1Entries).where(eq(clash1v1Entries.id, entryId)).limit(1);
  if (sent?.qrFileId) {
    await sendPhoto(chatId, sent.qrFileId, "🖼 QR دوستی فعلی شما — همین عکس بعداً برای حریف ارسال می‌شود.").catch(() => undefined);
  }
}

async function loadPair(matchId: string): Promise<QueuePair | null> {
  const [match] = await db
    .select({
      id: matches.id,
      matchNumber: matches.matchNumber,
      tournamentId: matches.tournamentId,
      tournamentName: tournaments.name,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
    })
    .from(matches)
    .innerJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match?.player1Id || !match.player2Id) return null;

  const rows = await db
    .select({
      entryId: clash1v1Entries.id,
      playerId: clash1v1Entries.playerId,
      userId: clash1v1Entries.userId,
      telegramId: clash1v1Entries.telegramId,
      inviteLink: clash1v1Entries.inviteLink,
      qrFileId: clash1v1Entries.qrFileId,
      matchedAt: clash1v1Entries.matchedAt,
      readyAt: clash1v1Entries.readyAt,
      displayName: players.displayName,
      username: players.username,
      gameId: players.gameId,
      clashRoyaleId: users.clashRoyaleId,
      clashRoyaleUsername: users.clashRoyaleUsername,
      opponentType: clash1v1Entries.opponentType,
      stakeMode: clash1v1Entries.stakeMode,
      gameMode: clash1v1Entries.gameMode,
      challengeId: clash1v1Entries.challengeId,
    })
    .from(clash1v1Entries)
    .innerJoin(players, eq(clash1v1Entries.playerId, players.id))
    .leftJoin(users, eq(clash1v1Entries.userId, users.id))
    .where(eq(clash1v1Entries.matchedMatchId, matchId));

  const byPlayer = new Map(rows.map((row) => [row.playerId, row as QueueParticipant]));
  const player1 = byPlayer.get(match.player1Id);
  const player2 = byPlayer.get(match.player2Id);
  if (!player1 || !player2) return null;
  return {
    matchId: match.id,
    matchNumber: match.matchNumber,
    tournamentId: match.tournamentId,
    tournamentName: match.tournamentName,
    player1,
    player2,
  };
}

function matchNotificationKey(matchId: string, telegramId: string) {
  return `clash1v1:matched:${matchId}:${telegramId}`;
}

async function hasDeliveredMatchNotification(matchId: string, telegramId: string) {
  const [row] = await db
    .select({ id: telegramSentNotifications.id })
    .from(telegramSentNotifications)
    .where(eq(telegramSentNotifications.dedupeKey, matchNotificationKey(matchId, telegramId)))
    .limit(1);
  return Boolean(row);
}

async function notifyPairSide(pair: QueuePair, me: QueueParticipant, opponent: QueueParticipant) {
  const chatId = Number(me.telegramId);
  if (!Number.isFinite(chatId)) return false;
  try { if (await hasDeliveredMatchNotification(pair.matchId, me.telegramId)) return true; }
  catch (err) { logger.warn({ err, matchId: pair.matchId }, "Clash notification dedupe lookup failed"); }
  const opponentHasLink = isSupportedClashInvite(opponent.inviteLink);
  const opponentHasQr = Boolean(opponent.qrFileId);
  if (!opponentHasLink && !opponentHasQr) {
    await sendMessage(chatId, "⏳ حریف هنوز QR یا پیوند دوستی‌اش را ثبت نکرده است."); return false;
  }
  const keyboard: Array<Array<Record<string, string>>> = [];
  if (opponentHasLink) keyboard.push([{ text: "🔗 باز کردن پیوند دوستی حریف", url: opponent.inviteLink! }]);
  keyboard.push([{ text: me.readyAt ? "✅ آماده‌ام" : "🎮 آماده‌ام", callback_data: `clash1v1:ready:${me.entryId}` }, { text: "🚨 مشکل با حریف", callback_data: `dispute:${pair.matchId}` }]);
  if (opponentHasQr) await sendPhoto(chatId, opponent.qrFileId!, "📷 QR دوستی حریف — آن را داخل Clash Royale اسکن کن.");
  const details = [
    "✅ <b>حریف پیدا شد؛ آماده شوید</b>",
    "",
    `👤 حریف: <b>${html(participantName(opponent))}</b>`,
    `🏷 Player Tag: <code>${html(participantTag(opponent))}</code>`,
    `🎮 مود توافق‌شده: <b>${html(clashDuelModeLabel(me.gameMode || "normal"))}</b>`,
    `💳 نوع رقابت: <b>${html(clashDuelStakeLabel(me.stakeMode || "paid"))}</b>`,
    `👑 میزبان ارسال درخواست بازی: <b>${html(participantName(pair.player1))}</b>`,
    me.playerId === pair.player1.playerId ? "⚠️ شما میزبان هستی و مسئول انتخاب دقیق مود توافق‌شده‌ای." : "⚠️ اگر میزبان مود اشتباه فرستاد، درخواست را قبول نکن و گزارش بده.",
    ...(opponentHasLink ? [`🔗 پیوند دوستی: ${html(opponent.inviteLink!)}`] : ["📷 QR حریف ارسال شد."]),
    "",
    opponentHasLink ? "1) دکمه «باز کردن پیوند دوستی حریف» را بزن." : "1) QR ارسال‌شده را داخل Clash Royale اسکن کن.",
    "2) در Clash Royale حریف را Add Friend کن.",
    "3) وقتی آماده شدی دکمه «آماده‌ام» را بزن.",
    "4) بازی را فقط بعد از پیام رسمی شروع Match آغاز کنید.",
    "5) بعد از بازی، نتیجه را ثبت کن؛ Battle Log نتیجه و مود را بررسی می‌کند.",
    "",
    `Match ID: <code>${html(pair.matchId.slice(0, 8))}</code>`,
  ].filter(Boolean).join("\n");

  let messageResult = await sendMessage(chatId, details, { inline_keyboard: keyboard });
  if (!messageResult?.ok && opponentHasLink) {
    logger.warn({ chatId, matchId: pair.matchId }, "Clash notification URL button failed; retrying actions only");
    messageResult = await sendMessage(chatId, details, {
      inline_keyboard: [[
        { text: "🎮 آماده‌ام", callback_data: `clash1v1:ready:${me.entryId}` },
        { text: "🚨 مشکل با حریف", callback_data: `dispute:${pair.matchId}` },
      ]],
    });
  }
  if (!messageResult?.ok) messageResult = await sendMessage(chatId, details);
  if (!messageResult?.ok) return false;
  try {
    await db.insert(telegramSentNotifications).values({
      dedupeKey: matchNotificationKey(pair.matchId, me.telegramId),
      telegramId: me.telegramId,
      tournamentId: pair.tournamentId,
      type: "clash_1v1_matched",
    }).onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
  } catch (err) {
    logger.warn({ err, matchId: pair.matchId }, "Clash notification dedupe write failed");
  }
  return true;
}

async function notifyPairs(pairs: QueuePair[]) {
  for (const pair of pairs) {
    const results = await Promise.allSettled([
      notifyPairSide(pair, pair.player1, pair.player2),
      notifyPairSide(pair, pair.player2, pair.player1),
    ]);
    results.forEach((result, side) => {
      if (result.status === "rejected") {
        logger.warn({ err: result.reason, matchId: pair.matchId, side }, "Clash 1V1 match notification will be retried");
      }
    });
  }
}

function matchStartedNotificationKey(matchId: string, telegramId: string) {
  return `clash1v1:started:${matchId}:${telegramId}`;
}

async function notifyMatchStartedSide(pair: QueuePair, player: QueueParticipant) {
  const chatId = Number(player.telegramId);
  if (!Number.isFinite(chatId)) return;
  const key = matchStartedNotificationKey(pair.matchId, player.telegramId);
  try {
    const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications)
      .where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
    if (existing) return;
  } catch (err) {
    logger.warn({ err, matchId: pair.matchId }, "1V1 start notification dedupe unavailable");
  }

  const result = await sendMessage(chatId, [
    "🚀 <b>Match شروع شد</b>",
    "",
    "هر دو بازیکن آماده‌اند. همین الان Friendly Battle را آغاز کنید.",
    `🎮 مود اجباری: <b>${html(clashDuelModeLabel(player.gameMode || "normal"))}</b>`,
    `👑 میزبان: <b>${html(participantName(pair.player1))}</b>`,
    "پس از پایان بازی، دکمه «بررسی نتیجه» را بزنید؛ سیستم مستقیم از Battle Log کلش رویال برنده را تشخیص می‌دهد. نیازی به اعلام نتیجه نیست.",
    "",
    `Match ID: <code>${html(pair.matchId.slice(0, 8))}</code>`,
  ].filter(Boolean).join("\n"), {
    inline_keyboard: [
      [{ text: "🔍 بررسی نتیجه", callback_data: `result:verify:${pair.matchId}` }],
      [{ text: "📎 ارسال اسکرین‌شات", callback_data: `evidence:${pair.matchId}` }, { text: "🚨 اعتراض", callback_data: `dispute:${pair.matchId}` }],
    ],
  });
  if (!result?.ok) return;
  await db.insert(telegramSentNotifications).values({
    dedupeKey: key,
    telegramId: player.telegramId,
    tournamentId: pair.tournamentId,
    type: "clash_1v1_started",
  }).onConflictDoNothing({ target: telegramSentNotifications.dedupeKey }).catch(() => undefined);
}

async function startReadyPair(pair: QueuePair) {
  await db.update(matches).set({ status: "in_progress", scheduledAt: new Date() })
    .where(and(eq(matches.id, pair.matchId), eq(matches.status, "pending")));
  await Promise.allSettled([
    notifyMatchStartedSide(pair, pair.player1),
    notifyMatchStartedSide(pair, pair.player2),
  ]);
}

export async function markClash1v1Ready(chatId: number, telegramId: string, entryId: string) {
  await ensureClash1v1QueueTournament();
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return openClash1v1Queue(chatId, telegramId);

  const [entry] = await db.update(clash1v1Entries).set({ readyAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(clash1v1Entries.id, entryId),
      eq(clash1v1Entries.userId, linked.userId),
      eq(clash1v1Entries.status, "matched"),
    ))
    .returning({ matchId: clash1v1Entries.matchedMatchId });
  if (!entry?.matchId) {
    await sendMessage(chatId, "این Match برای حساب شما فعال نیست.");
    return;
  }

  const pair = await loadPair(entry.matchId);
  if (!pair) {
    await sendMessage(chatId, "اطلاعات Match کامل نیست؛ وضعیت را دوباره بررسی کن.");
    return;
  }
  if (pair.player1.readyAt && pair.player2.readyAt) {
    await sendMessage(chatId, "✅ آمادگی هر دو بازیکن تأیید شد؛ Match شروع می‌شود.");
    await startReadyPair(pair);
    return;
  }
  await sendMessage(chatId, "✅ آمادگی شما ثبت شد. منتظر آماده‌شدن حریف هستیم.", {
    inline_keyboard: [[{ text: "🔄 بررسی وضعیت", callback_data: "clash1v1:status" }]],
  });
}

export async function processClash1v1ReadyTimeouts(timeoutMinutes = 10) {
  await ensureClash1v1QueueTournament();
  const cutoff = new Date(Date.now() - Math.max(5, timeoutMinutes) * 60 * 1000);
  const rows = await db.select({ matchId: clash1v1Entries.matchedMatchId })
    .from(clash1v1Entries)
    .innerJoin(matches, eq(clash1v1Entries.matchedMatchId, matches.id))
    .where(and(
      eq(clash1v1Entries.status, "matched"),
      eq(matches.status, "pending"),
      lte(clash1v1Entries.matchedAt, cutoff),
      isNotNull(clash1v1Entries.matchedMatchId),
    ));
  const matchIds = [...new Set(rows.map((row) => row.matchId).filter(Boolean) as string[])];
  let timedOut = 0;

  for (const matchId of matchIds) {
    const pair = await loadPair(matchId);
    if (!pair) continue;
    if (pair.player1.readyAt && pair.player2.readyAt) {
      await startReadyPair(pair);
      continue;
    }
    await db.update(matches).set({ status: "disputed" }).where(and(eq(matches.id, matchId), eq(matches.status, "pending")));
    const missing = [pair.player1, pair.player2].filter((player) => !player.readyAt);
    const ready = [pair.player1, pair.player2].filter((player) => player.readyAt);
    await Promise.allSettled([
      ...missing.map((player) => sendMessage(Number(player.telegramId), "⚠️ مهلت اعلام آمادگی تمام شد و عدم حضور شما برای بررسی ثبت شد.")),
      ...ready.map((player) => sendMessage(Number(player.telegramId), "⚠️ حریف در مهلت مقرر آماده نشد؛ پرونده برای تصمیم Refund/Forfeit به ادمین ارسال شد.")),
      ...getAdminIds().map((adminId) => sendMessage(Number(adminId), `🚨 <b>Ready timeout در 1V1</b>\nMatch: <code>${html(matchId.slice(0, 8))}</code>\nغایب: ${missing.map((player) => html(participantName(player))).join("، ") || "—"}`)),
    ]);
    timedOut += 1;
  }
  return { checked: matchIds.length, timedOut };
}

async function retryPendingMatchNotifications(limit = 50) {
  const rows = await db
    .select({ matchId: clash1v1Entries.matchedMatchId })
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.status, "matched"),
      isNotNull(clash1v1Entries.matchedMatchId)
    ))
    .orderBy(desc(clash1v1Entries.matchedAt))
    .limit(limit * 2);
  const matchIds = [...new Set(rows.map((row) => row.matchId).filter(Boolean) as string[])].slice(0, limit);
  for (const matchId of matchIds) {
    const pair = await loadPair(matchId);
    if (pair) await notifyPairs([pair]);
  }
  return { checkedMatches: matchIds.length };
}

async function showActiveEntry(chatId: number, telegramId: string, entry: Awaited<ReturnType<typeof getActiveEntry>>): Promise<void> {
  if (!entry) return openClash1v1Queue(chatId, telegramId);

  if (entry.status === "waiting_qr") {
    await sendMessage(chatId, "✅ ورودی پرداخت شده؛ برای ورود به صف، QR یا پیوند دوستی کلش رویال را بفرست.", {
      inline_keyboard: [
        [{ text: "📷 ارسال QR / پیوند دوستی", callback_data: `clash1v1:qr:${entry.id}` }],
        [{ text: "❌ لغو و بازگشت وجه", callback_data: `clash1v1:cancel:${entry.id}` }],
      ],
    });
    return promptClash1v1Qr(chatId, telegramId, entry.id);
  }

  if (entry.status === "queued") {
    const position = await queuePosition(entry);
    await sendMessage(chatId, [
      "🔎 <b>در حال جست‌وجوی حریف...</b>",
      "",
      `🎮 مود: <b>${html(clashDuelModeLabel(entry.gameMode || "normal"))}</b>`,
      `💳 نوع: <b>${html(clashDuelStakeLabel(entry.stakeMode || "paid"))}</b>`,
      position ? `جایگاه تقریبی در صف مشابه: <b>${position.toLocaleString("fa-IR")}</b>` : "",
      "فقط با بازیکنی که همین نوع و مود را انتخاب کرده باشد مچ می‌شوی.",
    ].filter(Boolean).join("\n"), {
      inline_keyboard: [
        [{ text: "🔄 بررسی وضعیت", callback_data: "clash1v1:status" }],
        [{ text: "🔁 تغییر پیوند دوستی", callback_data: `clash1v1:qr:${entry.id}` }],
        [{ text: "❌ خروج از صف و بازگشت وجه", callback_data: `clash1v1:cancel:${entry.id}` }],
      ],
    });
    return;
  }

  if (entry.status === "matched" && entry.matchedMatchId) {
    const pair = await loadPair(entry.matchedMatchId);
    if (pair) {
      const me = pair.player1.userId === entry.userId ? pair.player1 : pair.player2;
      const opponent = me === pair.player1 ? pair.player2 : pair.player1;

      // Entries matched by the previous QR-based release may not have a text
      // link. Upgrade them in place instead of throwing a generic bot error.
      if (!isSupportedClashInvite(me.inviteLink)) {
        await sendMessage(chatId, "برای ادامه این مسابقه، پیوند دوستی خودت را با روش جدید ثبت کن.");
        await promptClash1v1Qr(chatId, telegramId, me.entryId);
        return;
      }
      if (!isSupportedClashInvite(opponent.inviteLink)) {
        await sendMessage(chatId, [
          "⏳ پیوند دوستی شما ثبت است.",
          "حریف هنوز پیوند دوستی جدیدش را نفرستاده؛ به محض ثبت، بات اطلاعات مسابقه را ارسال می‌کند.",
        ].join("\n"), mainMenuKeyboard());
        return;
      }

      if (me.readyAt && opponent.readyAt) {
        await startReadyPair(pair);
        return;
      }
      if (me.readyAt) {
        await sendMessage(chatId, "✅ شما آماده‌ای؛ منتظر اعلام آمادگی حریف هستیم.", {
          inline_keyboard: [[{ text: "🔄 بررسی وضعیت", callback_data: "clash1v1:status" }]],
        });
        return;
      }
      await notifyPairSide(pair, me, opponent);
      await sendMessage(chatId, "برای شروع Match، بعد از افزودن حریف آمادگی خودت را ثبت کن.", {
        inline_keyboard: [[{ text: "🎮 آماده‌ام", callback_data: `clash1v1:ready:${me.entryId}` }]],
      });
      return;
    }
  }

  await sendMessage(chatId, "وضعیت صف قابل بازیابی نبود. دوباره /qr را بزن.", mainMenuKeyboard());
}

export async function openClash1v1Queue(chatId: number, telegramId: string, rulesAccepted = false): Promise<void> {
  try {
    await ensureClash1v1QueueTournament();
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await sendMessage(chatId, [
        "🔗 <b>اول حساب تلگرامت رو به Flexa وصل کن</b>",
        "",
        "برای ورود به صف 1V1 کلش رویال (ورودی ۵۰٬۰۰۰ USDT، جایزه ۸۰٬۰۰۰ USDT) این مراحل رو برو:",
        "",
        "۱) روی «🔗 اتصال حساب» بزن تا کد اتصال بگیری.",
        "۲) داخل وب‌اپ وارد حسابت بشو و کد رو وارد کن.",
        "۳) Player Tag کلشت رو از پروفایل تأیید کن.",
        "۴) کیف پولت رو شارژ کن.",
        "۵) اینجا /qr رو بزن تا وارد صف بشی.",
      ].join("\n"), {
        inline_keyboard: [
          [{ text: "🔗 اتصال حساب", callback_data: "menu:link" }],
          [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }],
        ],
      });
      return;
    }

    const active = await getActiveEntry(linked.userId);
    if (active) {
      if (active.status === "queued") await runClash1v1MatchmakingAndNotify();
      const refreshed = await getActiveEntry(linked.userId);
      return showActiveEntry(chatId, telegramId, refreshed || active);
    }

    if (!rulesAccepted) {
      const [acceptance] = await db.select({ id: telegramSentNotifications.id })
        .from(telegramSentNotifications)
        .where(eq(telegramSentNotifications.dedupeKey, clash1v1RulesAcceptanceKey(telegramId)))
        .limit(1);
      if (!acceptance) {
        await sendClash1v1Rules(chatId, telegramId, true);
        return;
      }
    }

    const [pendingChallenge] = await db.select().from(clash1v1Challenges).where(and(
      or(
        eq(clash1v1Challenges.challengerUserId, linked.userId),
        eq(clash1v1Challenges.opponentUserId, linked.userId),
      ),
      inArray(clash1v1Challenges.status, ["pending", "countered"]),
    )).orderBy(desc(clash1v1Challenges.updatedAt)).limit(1);
    if (pendingChallenge && pendingChallenge.expiresAt > new Date()) {
      const myProposal = pendingChallenge.proposedByUserId === linked.userId;
      const isChallenger = pendingChallenge.challengerUserId === linked.userId;
      const keyboard: Array<Array<Record<string, string>>> = [];
      if (!myProposal) {
        keyboard.push([{ text: "✅ قبول شرایط", callback_data: `c1f:accept:${pendingChallenge.id}` }]);
        keyboard.push([{ text: "🔄 پیشنهاد مود دیگر", callback_data: `c1f:modes:${pendingChallenge.id}` }]);
      }
      keyboard.push([{
        text: isChallenger ? "❌ لغو دعوت" : "❌ رد دعوت",
        callback_data: `c1f:${isChallenger ? "cancel" : "reject"}:${pendingChallenge.id}`,
      }]);
      await sendMessage(chatId, [
        "👥 <b>دعوت خصوصی فعال</b>",
        `🎮 مود فعلی: <b>${html(clashDuelModeLabel(pendingChallenge.gameMode))}</b>`,
        `💳 نوع: <b>${html(clashDuelStakeLabel(pendingChallenge.stakeMode))}</b>`,
        myProposal ? "منتظر تأیید طرف مقابل هستیم." : "پیشنهاد طرف مقابل منتظر پاسخ شماست.",
        `⏳ اعتبار تا: <b>${html(new Date(pendingChallenge.expiresAt).toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran" }))}</b>`,
      ].join("\n"), { inline_keyboard: keyboard });
      return;
    }

    await sendMessage(chatId, [
      "⚔️ <b>1V1 کلش رویال</b>",
      "",
      `💳 ورودی هر نفر: <b>${html(CLASH_1V1_CONFIG.entryFee)}</b>`,
      `🏆 جایزه برنده: <b>${html(CLASH_1V1_CONFIG.prize1st)}</b>`,
      "🤖 حریف به‌صورت خودکار از صف بازیکنان آماده انتخاب می‌شود.",
      "🏟 این بخش روم، Room ID، Password یا براکت چندنفره ندارد؛ هر پرداخت فقط یک مسابقه مستقل دو نفره است.",
      "",
      "۱) ثبت‌نام و پرداخت  ۲) ارسال QR/Share Link دوستی  ۳) اتصال خودکار به حریف",
    ].join("\n"), {
      inline_keyboard: [
        [{ text: `💳 ثبت‌نام و پرداخت ${CLASH_1V1_CONFIG.entryFee}`, callback_data: "clash1v1:quick_register" }],
        [{ text: "📦 وضعیت مسابقه من", callback_data: "clash1v1:status" }],
        [{ text: "📜 قوانین 1V1", callback_data: "clash1v1:rules:show" }],
      ],
    });
  } catch (err) {
    logger.error({ err, telegramId }, "Failed to open Clash 1V1 queue");
    await sendMessage(chatId, "⚠️ صف 1V1 موقتاً در دسترس نیست. چند لحظه دیگر دوباره تلاش کن.");
  }
}

export async function showClash1v1StakeMenu(chatId: number, opponentType: "random" | "friend") {
  // The public 1V1 product requested by Flexa is fixed-price and random.
  // Keep friend callbacks backward compatible, while the visible random flow
  // goes directly to the paid mode picker instead of looking like a room form.
  if (opponentType === "random") {
    await sendMessage(chatId, [
      "⚔️ <b>ثبت‌نام 1V1 کلش رویال</b>",
      "",
      `💳 ورودی هر نفر: <b>${html(CLASH_1V1_CONFIG.entryFee)}</b>`,
      `🏆 جایزه نفر اول: <b>${html(CLASH_1V1_CONFIG.prize1st)}</b>`,
      "مود بازی را انتخاب کن؛ در مرحله بعد مبلغ از کیف پول کسر می‌شود.",
    ].join("\n"), {
      inline_keyboard: [
        ...CLASH_DUEL_GAME_MODES.map((mode) => ([{
          text: `${mode.emoji} ${mode.label}`,
          callback_data: `clash1v1:mode:random:paid:${mode.id}`,
        }])),
        [{ text: "⬅️ بازگشت", callback_data: "menu:clash_qr" }],
      ],
    });
    return;
  }

  await sendMessage(chatId, [
    "👥 <b>بازی خصوصی با دوست</b>",
    "",
    "نوع رقابت خصوصی را انتخاب کن:",
    "🆓 رایگان: بدون ورودی و جایزه مالی",
    `💰 پولی: ورودی هر نفر <b>${html(CLASH_1V1_CONFIG.entryFee)}</b> و جایزه برنده <b>${html(CLASH_1V1_CONFIG.prize1st)}</b>`,
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "🆓 رقابت رایگان", callback_data: "clash1v1:stake:friend:free" }],
      [{ text: "💰 رقابت پولی", callback_data: "clash1v1:stake:friend:paid" }],
      [{ text: "⬅️ بازگشت", callback_data: "menu:clash_qr" }],
    ],
  });
}

export async function showClash1v1ModeMenu(
  chatId: number,
  opponentType: "random" | "friend",
  stakeMode: ClashDuelStakeMode,
) {
  await sendMessage(chatId, [
    `نوع رقابت: <b>${html(clashDuelStakeLabel(stakeMode))}</b>`,
    "",
    "مودی را انتخاب کن که باید داخل Friendly Battle اجرا شود:",
  ].join("\n"), {
    inline_keyboard: [
      ...CLASH_DUEL_GAME_MODES.map((mode) => ([{
        text: `${mode.emoji} ${mode.label}`,
        callback_data: `clash1v1:mode:${opponentType}:${stakeMode}:${mode.id}`,
      }])),
      [{ text: "⬅️ بازگشت", callback_data: `clash1v1:opponent:${opponentType}` }],
    ],
  });
}

export async function registerClash1v1Queue(
  chatId: number,
  telegramId: string,
  options: { stakeMode?: ClashDuelStakeMode; gameMode?: ClashDuelGameMode } = {},
) {
  const stakeMode = options.stakeMode || "paid";
  const gameMode = options.gameMode || "normal";
  try {
    await ensureClash1v1QueueTournament();
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) return openClash1v1Queue(chatId, telegramId);

    // A rule acknowledgement is intentionally required before money is
    // debited. The quick-register button is shown again after acceptance.
    const [acceptedRules] = await db.select({ id: telegramSentNotifications.id })
      .from(telegramSentNotifications)
      .where(eq(telegramSentNotifications.dedupeKey, clash1v1RulesAcceptanceKey(telegramId)))
      .limit(1);
    if (!acceptedRules) {
      await sendClash1v1Rules(chatId, telegramId, true);
      return;
    }

    const suspendedUntil = await activeClash1v1Suspension(telegramId);
    if (suspendedUntil) {
      await sendMessage(chatId, `⛔ به‌دلیل جریمه ثبت‌شده، دسترسی شما به 1V1 تا <b>${html(suspendedUntil.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }))}</b> تعلیق است.`);
      return;
    }
    if (!linked.clashRoyaleId || linked.clashRoyaleStatus !== "verified") {
      await sendMessage(chatId, [
        "👑 <b>Player Tag کلش رویال تأیید نشده</b>",
        "",
        "برای ثبت‌نام واقعی 1V1 باید اول تگ بازی تأیید شود:",
        "۱) پروفایل را باز کن.",
        "۲) Player Tag را وارد کن (مثل #2PP؛ داخل پروفایل بازی بالای نام بازیکن است).",
        "۳) ذخیره کن تا از Supercell تأیید شود.",
        "۴) به بات برگرد و «ثبت‌نام و پرداخت» را بزن.",
      ].join("\n"), {
        inline_keyboard: [
          [{ text: "👑 ثبت و تأیید Player Tag", web_app: { url: `${APP_URL}/profile/edit` } }],
          [{ text: "🌐 باز کردن پروفایل در مرورگر", url: `${APP_URL}/profile/edit` }],
          [{ text: "⬅️ بازگشت به 1V1", callback_data: "menu:clash_qr" }],
        ],
      });
      return;
    }

    const active = await getActiveEntry(linked.userId);
    if (active) return openClash1v1Queue(chatId, telegramId);

    const tournament = await ensureClash1v1QueueTournament();
    const feeRial = stakeMode === "paid" ? BigInt(CLASH_1V1_CONFIG.entryFeeToman) * BigInt(10) : BigInt(0);
    const prizeRial = stakeMode === "paid" ? BigInt(CLASH_1V1_CONFIG.prizeToman) * BigInt(10) : BigInt(0);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);

      const [stillActive] = await tx
        .select()
        .from(clash1v1Entries)
        .where(and(
          eq(clash1v1Entries.userId, linked.userId),
          inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"])
        ))
        .limit(1);
      if (stillActive) return { kind: "active" as const, entry: stillActive };

      const player = await getOrCreatePlayer(
        linked.userId,
        linked.displayName || linked.username || "Flexa Player",
        linked.username,
        tx
      );

      let wallet: typeof wallets.$inferSelect | null = null;
      if (feeRial > BigInt(0)) {
        [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
        if (!wallet) {
          [wallet] = await tx
            .insert(wallets)
            .values({ userId: linked.userId, balance: "0", currency: "RIAL" })
            .returning();
        }

        const debited = await updateWalletBalanceSafely(tx, wallet.id, feeRial, "decrease");
        if (!debited) {
          const [current] = await tx.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, wallet.id)).limit(1);
          return { kind: "insufficient" as const, balance: bigIntFromText(current?.balance || "0") };
        }
      }

      const cutoff = new Date(Date.now() - RECENT_INVITE_REUSE_MS);
      const [recentInvite] = await tx
        .select({
          inviteLink: clash1v1Entries.inviteLink,
          submittedAt: clash1v1Entries.submittedAt,
        })
        .from(clash1v1Entries)
        .where(and(
          eq(clash1v1Entries.userId, linked.userId),
          gte(clash1v1Entries.submittedAt, cutoff),
          isNotNull(clash1v1Entries.inviteLink)
        ))
        .orderBy(desc(clash1v1Entries.submittedAt))
        .limit(1);

      const canReuse = Boolean(recentInvite && isSupportedClashInvite(recentInvite.inviteLink));
      const now = new Date();
      const [entry] = await tx
        .insert(clash1v1Entries)
        .values({
          tournamentId: tournament.id,
          userId: linked.userId,
          playerId: player.id,
          telegramId,
          status: canReuse ? "queued" : "waiting_qr",
          entryFeeRial: feeRial.toString(),
          prizeRial: prizeRial.toString(),
          opponentType: "random",
          stakeMode,
          gameMode,
          inviteLink: canReuse ? recentInvite?.inviteLink || null : null,
          qrFileId: null,
          submittedAt: canReuse ? now : null,
          metadata: {
            source: "telegram_queue_v4_modes",
            opponentType: "random",
            stakeMode,
            gameMode,
            reusedInviteLink: canReuse,
          },
        })
        .returning();

      if (wallet && feeRial > BigInt(0)) {
        await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: feeRial.toString(),
          type: "entry_fee",
          status: "completed",
          referenceId: `clash-1v1-entry-${entry.id}`,
          metadata: {
            kind: "clash_1v1_entry_fee",
            entryId: entry.id,
            tournamentId: tournament.id,
            playerId: player.id,
            userId: linked.userId,
            telegramId,
            opponentType: "random",
            stakeMode,
            gameMode,
          },
        });
      }
      return { kind: "created" as const, entry, reusedInviteLink: canReuse };
    });

    if (result.kind === "active") return openClash1v1Queue(chatId, telegramId);
    if (result.kind === "insufficient") {
      await sendMessage(chatId, [
        "💳 <b>موجودی کافی نیست</b>",
        `مبلغ لازم: <b>${html(formatTomanFromRial(feeRial))}</b>`,
        `موجودی شما: <b>${html(formatTomanFromRial(result.balance))}</b>`,
      ].join("\n"), {
        inline_keyboard: [[{ text: "💳 شارژ کیف پول", callback_data: "wallet:deposit" }]],
      });
      return;
    }

    const selectionLine = `\n🎮 مود: <b>${html(clashDuelModeLabel(gameMode))}</b>\n💳 نوع: <b>${html(clashDuelStakeLabel(stakeMode))}</b>`;
    if (result.reusedInviteLink) {
      await clearSession(telegramId);
      const paymentLine = stakeMode === "paid" ? `\n💰 ورودی ${html(CLASH_1V1_CONFIG.entryFee)} کسر شد.` : "\n🆓 این رقابت ورودی مالی ندارد.";
      await sendMessage(chatId, `✅ با پیوند دوستی معتبر قبلی وارد صف شدی.${selectionLine}${paymentLine}\n\nفقط با بازیکن دارای همین نوع و مود مچ می‌شوی.`, removeKeyboard());
      const matchmaking = await runClash1v1MatchmakingAndNotify();
      if (!matchmaking.matchedPairs) await showActiveEntry(chatId, telegramId, result.entry);
      return;
    }

    const paymentLine = stakeMode === "paid"
      ? `مبلغ <b>${html(CLASH_1V1_CONFIG.entryFee)}</b> کسر شد.`
      : "این رقابت رایگان است و مبلغی کسر نشد.";
    await sendMessage(chatId, `✅ ${paymentLine}${selectionLine}\n\nحالا از Clash Royale روی «اشتراک‌گذاری پیوند» بزن و پیوند دوستی را برای بات بفرست.`);
    await promptClash1v1Qr(chatId, telegramId, result.entry.id);
  } catch (err) {
    logger.error({ err, telegramId }, "Clash 1V1 queue registration failed");
    const detail = err instanceof Error && err.message.includes("relation")
      ? "ساختار صف در حال آماده‌سازی است. چند ثانیه دیگر دوباره بزن."
      : "وجه این تلاش کسر نشده یا تراکنش کامل Rollback شده است.";
    await sendMessage(chatId, [
      "⚠️ <b>ثبت‌نام 1V1 انجام نشد</b>",
      detail,
      "از دکمه زیر دوباره امتحان کن؛ اگر ادامه داشت، پشتیبانی را باز کن.",
    ].join("\n"), {
      inline_keyboard: [
        [{ text: "🔁 تلاش دوباره", callback_data: `clash1v1:mode:random:${stakeMode}:${gameMode}` }],
        [{ text: "🎧 پشتیبانی", callback_data: "support:new" }],
      ],
    });
  }
}

export async function submitClash1v1Qr(input: {
  chatId: number;
  telegramId: string;
  entryId: string;
  text?: string;
  qrPhoto?: { buffer: Buffer; contentType: string; fileId: string };
}) {
  const { chatId, telegramId, entryId } = input;
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) throw new Error("CLASH_QUEUE_ACCOUNT_NOT_LINKED");

  const [ownedEntry] = await db.select({ status: clash1v1Entries.status })
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.id, entryId),
      eq(clash1v1Entries.userId, linked.userId),
      inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"]),
    ))
    .limit(1);
  if (!ownedEntry) {
    await clearSession(telegramId);
    await sendMessage(chatId, "این ثبت‌نام فعال نیست. برای شروع دوباره /clash را بزن.", removeKeyboard());
    return;
  }

  const extracted = extractInviteReference(input.text || "");
  let inviteLink = isSupportedClashInvite(extracted) ? extracted : null;
  let qrFileId: string | null = null;
  if (!inviteLink && input.qrPhoto) {
    const decoded = await decodeClashFriendQr(input.qrPhoto.buffer, input.qrPhoto.contentType);
    inviteLink = decoded.inviteLink;
    qrFileId = input.qrPhoto.fileId;
  }
  if (!inviteLink && !qrFileId) {
    await sendMessage(chatId, "❌ QR یا پیوند دوستی معتبر پیدا نشد. عکس QR را بفرست یا Share Link کلش را Paste کن.");
    return;
  }

  const [updated] = await db.update(clash1v1Entries).set({
    status: ownedEntry.status === "matched" ? "matched" : "queued",
    inviteLink,
    qrFileId,
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(clash1v1Entries.id, entryId),
    eq(clash1v1Entries.userId, linked.userId),
    inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"]),
  )).returning();

  if (!updated) {
    await clearSession(telegramId);
    await sendMessage(chatId, "این ورودی فعال نیست. برای وضعیت /clash را بزن.", removeKeyboard());
    return;
  }
  await clearSession(telegramId);

  if (updated.status === "matched" && updated.matchedMatchId) {
    const pair = await loadPair(updated.matchedMatchId);
    if (pair) { await notifyPairs([pair]); return; }
  }

  await sendMessage(chatId, `✅ ${inviteLink ? "پیوند دوستی" : "QR دوستی"} ثبت شد و وارد صف شدی. در حال جست‌وجوی حریف...`, removeKeyboard());
  const matchmaking = await runClash1v1MatchmakingAndNotify();
  if (!matchmaking.matchedPairs) await showActiveEntry(chatId, telegramId, updated);
}

export async function cancelClash1v1Queue(chatId: number, telegramId: string, entryId: string) {
  try {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) return openClash1v1Queue(chatId, telegramId);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);
      const [entry] = await tx
        .select()
        .from(clash1v1Entries)
        .where(and(eq(clash1v1Entries.id, entryId), eq(clash1v1Entries.userId, linked.userId)))
        .limit(1);
      if (!entry) return { kind: "missing" as const };
      if (entry.status === "matched") return { kind: "matched" as const };
      if (entry.status === "cancelled") return { kind: "cancelled" as const };
      if (!["waiting_qr", "queued"].includes(entry.status)) return { kind: "closed" as const };

      const referenceId = `clash-1v1-cancel-refund-${entry.id}`;
      const [existingRefund] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.referenceId, referenceId))
        .limit(1);
      const refundAmount = bigIntFromText(entry.entryFeeRial);
      if (!existingRefund && refundAmount > BigInt(0)) {
        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
        if (!wallet) {
          [wallet] = await tx.insert(wallets).values({ userId: linked.userId, balance: "0", currency: "RIAL" }).returning();
        }
        const refunded = await updateWalletBalanceSafely(tx, wallet.id, refundAmount, "increase");
        if (!refunded) throw new Error("CLASH_QUEUE_REFUND_WALLET_UPDATE_FAILED");
        await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: entry.entryFeeRial,
          type: "refund",
          status: "completed",
          referenceId,
          metadata: { kind: "clash_1v1_queue_cancel_refund", entryId: entry.id, userId: linked.userId },
        });
      }
      await tx
        .update(clash1v1Entries)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(clash1v1Entries.id, entry.id));
      return { kind: "refunded" as const, amount: entry.entryFeeRial };
    });

    await clearSession(telegramId);
    if (result.kind === "matched") {
      await sendMessage(chatId, "حریف پیدا شده و دیگر امکان خروج از صف و بازگشت وجه وجود ندارد. نتیجه را از بخش مسابقات ثبت کن.");
    } else if (result.kind === "refunded") {
      const amount = bigIntFromText(result.amount);
      await sendMessage(
        chatId,
        amount > BigInt(0)
          ? `✅ از صف خارج شدی و <b>${html(formatTomanFromRial(amount))}</b> به کیف پول برگشت.`
          : "✅ از صف رایگان خارج شدی و رقابت لغو شد.",
        mainMenuKeyboard(),
      );
    } else {
      await sendMessage(chatId, "این ورودی قبلاً بسته یا لغو شده است.", mainMenuKeyboard());
    }
  } catch (err) {
    logger.error({ err, telegramId, entryId }, "Failed to cancel Clash 1V1 queue entry");
    await sendMessage(chatId, "لغو صف انجام نشد. دوباره وضعیت را بررسی کن.");
  }
}

export async function runClash1v1Matchmaking(): Promise<QueuePair[]> {
  await ensureClash1v1QueueTournament();
  const pairs = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${QUEUE_LOCK_ID})`);
    const [tournament] = await tx
      .select()
      .from(tournaments)
      .where(and(
        eq(tournaments.game, CLASH_1V1_CONFIG.game),
        eq(tournaments.status, "registration"),
        eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel)
      ))
      .orderBy(desc(tournaments.createdAt))
      .limit(1);
    if (!tournament) return [];

    const queued = await tx
      .select({
        entryId: clash1v1Entries.id,
        playerId: clash1v1Entries.playerId,
        userId: clash1v1Entries.userId,
        telegramId: clash1v1Entries.telegramId,
        inviteLink: clash1v1Entries.inviteLink,
        qrFileId: clash1v1Entries.qrFileId,
        matchedAt: clash1v1Entries.matchedAt,
        readyAt: clash1v1Entries.readyAt,
        displayName: players.displayName,
        username: players.username,
        gameId: players.gameId,
        clashRoyaleId: users.clashRoyaleId,
        clashRoyaleUsername: users.clashRoyaleUsername,
        opponentType: clash1v1Entries.opponentType,
        stakeMode: clash1v1Entries.stakeMode,
        gameMode: clash1v1Entries.gameMode,
        challengeId: clash1v1Entries.challengeId,
      })
      .from(clash1v1Entries)
      .innerJoin(players, eq(clash1v1Entries.playerId, players.id))
      .leftJoin(users, eq(clash1v1Entries.userId, users.id))
      .where(and(
        eq(clash1v1Entries.status, "queued"),
        eq(clash1v1Entries.opponentType, "random"),
        isNotNull(clash1v1Entries.submittedAt),
        or(isNotNull(clash1v1Entries.inviteLink), isNotNull(clash1v1Entries.qrFileId))
      ))
      .orderBy(clash1v1Entries.submittedAt, clash1v1Entries.createdAt)
      .limit(20);

    const candidates = (queued as QueueParticipant[])
      .filter((entry) => isSupportedClashInvite(entry.inviteLink) || Boolean(entry.qrFileId));
    const created: QueuePair[] = [];
    while (candidates.length >= 2) {
      const player1 = candidates.shift()!;
      const opponentIndex = candidates.findIndex((item) =>
        item.userId !== player1.userId
        && item.opponentType === "random"
        && item.stakeMode === player1.stakeMode
        && item.gameMode === player1.gameMode
      );
      if (opponentIndex < 0) continue;
      const [player2] = candidates.splice(opponentIndex, 1);

      const [{ value }] = await tx.select({ value: count() }).from(matches).where(eq(matches.tournamentId, tournament.id));
      const [match] = await tx
        .insert(matches)
        .values({
          tournamentId: tournament.id,
          round: 1,
          matchNumber: Number(value || 0) + 1,
          player1Id: player1.playerId,
          player2Id: player2.playerId,
          status: "pending",
        })
        .returning({ id: matches.id, matchNumber: matches.matchNumber });

      const matchedAt = new Date();
      const first = await tx
        .update(clash1v1Entries)
        .set({ status: "matched", matchedMatchId: match.id, matchedAt, updatedAt: matchedAt })
        .where(and(eq(clash1v1Entries.id, player1.entryId), eq(clash1v1Entries.status, "queued")))
        .returning({ id: clash1v1Entries.id });
      const second = await tx
        .update(clash1v1Entries)
        .set({ status: "matched", matchedMatchId: match.id, matchedAt, updatedAt: matchedAt })
        .where(and(eq(clash1v1Entries.id, player2.entryId), eq(clash1v1Entries.status, "queued")))
        .returning({ id: clash1v1Entries.id });
      if (!first.length || !second.length) throw new Error("CLASH_QUEUE_CLAIM_RACE");

      created.push({
        matchId: match.id,
        matchNumber: match.matchNumber,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        player1,
        player2,
      });
    }
    return created;
  });
  return pairs;
}

export async function runClash1v1MatchmakingAndNotify() {
  const pairs = await runClash1v1Matchmaking();
  await notifyPairs(pairs);
  const notifications = await retryPendingMatchNotifications(50);
  return { matchedPairs: pairs.length, ...notifications };
}
