import crypto from "crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clash1v1Challenges,
  clash1v1Entries,
  matches,
  players,
  transactions,
  users,
  wallets,
} from "@/db/schema";
import { activeClash1v1Suspension, CLASH_1V1_CONFIG, ensureClash1v1Schema } from "@/lib/clash-1v1";
import {
  CLASH_DUEL_GAME_MODES,
  challengeCanBeAccepted,
  clashDuelModeLabel,
  clashDuelStakeLabel,
  isClashDuelGameMode,
  type ClashDuelGameMode,
  type ClashDuelStakeMode,
} from "@/lib/clash-duel-policy";
import { bigIntFromText } from "@/lib/money";
import { updateWalletBalanceSafely } from "@/lib/wallet-balance-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { APP_URL } from "../config";
import { sendMessage } from "../transport";
import { getLinkedUserByTelegram } from "../user-service";
import { html } from "../utils";
import {
  ensureClash1v1QueueTournament,
  openClash1v1Queue,
  recordClash1v1RulesAcceptance,
  runClash1v1MatchmakingAndNotify,
  sendClash1v1Rules,
} from "./clash-1v1";
import { isSupportedClashInvite } from "./clash-1v1-policy";
import { serverBotUsername } from "@/lib/telegram-bot-username";

const CHALLENGE_TTL_MS = 15 * 60 * 1000;
const RECENT_INVITE_REUSE_MS = 24 * 60 * 60 * 1000;

function challengeTokenHash(token: string) {
  return crypto.createHash("sha256").update(`flexa-clash-friend:${token}`).digest("hex");
}

function botStartLink(token: string) {
  const username = serverBotUsername();
  return `https://t.me/${username}?start=duel_${encodeURIComponent(token)}`;
}

async function linkedDuelUser(telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return { linked: null, error: "not_linked" as const };
  if (!linked.clashRoyaleId || linked.clashRoyaleStatus !== "verified") {
    return { linked, error: "tag_not_verified" as const };
  }
  return { linked, error: null };
}

async function requireDuelUser(chatId: number, telegramId: string) {
  const result = await linkedDuelUser(telegramId);
  if (result.error === "not_linked") {
    await sendMessage(chatId, "برای بازی با دوست ابتدا حساب تلگرام را به Flexa وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return null;
  }
  if (result.error === "tag_not_verified") {
    await sendMessage(chatId, "برای 1V1 باید Player Tag کلش رویال شما با Supercell API تأیید شده باشد.", {
      inline_keyboard: [[{ text: "⚔️ ثبت و تأیید Player Tag", url: `${APP_URL}/profile/edit` }]],
    });
    return null;
  }
  const suspendedUntil = await activeClash1v1Suspension(telegramId);
  if (suspendedUntil) {
    await sendMessage(chatId, `⛔ دسترسی شما به 1V1 تا <b>${html(suspendedUntil.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }))}</b> تعلیق است.`);
    return null;
  }
  return result.linked!;
}

async function getOrCreatePlayerTx(tx: any, user: {
  userId: string;
  displayName?: string | null;
  username?: string | null;
}) {
  const [existing] = await tx.select().from(players).where(eq(players.visibleUserId, user.userId)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(players).values({
    visibleUserId: user.userId,
    username: user.username || `player_${user.userId.slice(0, 8)}`,
    displayName: user.displayName || user.username || "Flexa Player",
  }).returning();
  return created;
}

async function getOrCreateWalletTx(tx: any, userId: string) {
  const [existing] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(wallets).values({ userId, balance: "0", currency: "RIAL" }).returning();
  return created;
}

async function recentInvite(tx: any, userId: string) {
  const [entry] = await tx
    .select({ inviteLink: clash1v1Entries.inviteLink })
    .from(clash1v1Entries)
    .where(and(
      eq(clash1v1Entries.userId, userId),
      sql`${clash1v1Entries.submittedAt} >= ${new Date(Date.now() - RECENT_INVITE_REUSE_MS)}`,
      sql`${clash1v1Entries.inviteLink} IS NOT NULL`,
    ))
    .orderBy(desc(clash1v1Entries.submittedAt))
    .limit(1);
  return isSupportedClashInvite(entry?.inviteLink) ? entry!.inviteLink! : null;
}

async function loadChallengeById(challengeId: string, client: any = db) {
  const [row] = await client
    .select({
      challenge: clash1v1Challenges,
      challengerName: users.displayName,
      challengerUsername: users.username,
    })
    .from(clash1v1Challenges)
    .innerJoin(users, eq(clash1v1Challenges.challengerUserId, users.id))
    .where(eq(clash1v1Challenges.id, challengeId))
    .limit(1);
  return row || null;
}

function challengeKeyboard(challengeId: string, allowReject = true) {
  const rows: Array<Array<Record<string, string>>> = [
    [{ text: "✅ قبول شرایط و شروع", callback_data: `c1f:accept:${challengeId}` }],
    [{ text: "🔄 پیشنهاد مود دیگر", callback_data: `c1f:modes:${challengeId}` }],
  ];
  if (allowReject) rows.push([{ text: "❌ رد دعوت", callback_data: `c1f:reject:${challengeId}` }]);
  return { inline_keyboard: rows };
}

export async function createClashFriendChallenge(
  chatId: number,
  telegramId: string,
  stakeMode: ClashDuelStakeMode,
  gameMode: ClashDuelGameMode,
) {
  await ensureClash1v1Schema();
  const linked = await requireDuelUser(chatId, telegramId);
  if (!linked) return;
  const limited = await rateLimit(`clash-friend-challenge:${linked.userId}`, 8, 60 * 60 * 1000);
  if (!limited.success) {
    await sendMessage(chatId, "تعداد دعوت‌های ساخته‌شده زیاد است. کمی بعد دوباره تلاش کن.");
    return;
  }
  const active = await db.select({ id: clash1v1Entries.id }).from(clash1v1Entries).where(and(
    eq(clash1v1Entries.userId, linked.userId),
    inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"]),
  )).limit(1);
  if (active.length) return openClash1v1Queue(chatId, telegramId);

  const tournament = await ensureClash1v1QueueTournament();
  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const [challenge] = await db.transaction(async (tx) => {
    await tx.update(clash1v1Challenges).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(and(
      eq(clash1v1Challenges.challengerUserId, linked.userId),
      inArray(clash1v1Challenges.status, ["pending", "countered"]),
    ));
    return tx.insert(clash1v1Challenges).values({
      tokenHash: challengeTokenHash(token),
      tournamentId: tournament.id,
      challengerUserId: linked.userId,
      challengerTelegramId: telegramId,
      proposedByUserId: linked.userId,
      stakeMode,
      gameMode,
      status: "pending",
      proposalVersion: 1,
      expiresAt,
      metadata: { source: "telegram_friend_duel_v1" },
    }).returning();
  });
  const inviteUrl = botStartLink(token);
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(`دعوت خصوصی 1V1 کلش رویال در Flexa — مود ${clashDuelModeLabel(gameMode)}`)}`;
  await sendMessage(chatId, [
    "👥 <b>دعوت خصوصی بازی با دوست ساخته شد</b>",
    "",
    `🎮 مود پیشنهادی: <b>${html(clashDuelModeLabel(gameMode))}</b>`,
    `💳 نوع رقابت: <b>${html(clashDuelStakeLabel(stakeMode))}</b>`,
    ...(stakeMode === "paid" ? [
      `ورودی هر نفر: <b>${html(CLASH_1V1_CONFIG.entryFee)}</b>`,
      `جایزه برنده: <b>${html(CLASH_1V1_CONFIG.prize1st)}</b>`,
    ] : ["این رقابت رایگان است و جایزه مالی ندارد."]),
    "",
    "تا وقتی دوستت همین شرایط را قبول نکند هیچ مبلغی کسر نمی‌شود.",
    "اعتبار دعوت: <b>۱۵ دقیقه</b>",
    "",
    `<code>${html(inviteUrl)}</code>`,
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "📤 ارسال دعوت برای دوست", url: shareUrl }],
      [{ text: "❌ لغو دعوت", callback_data: `c1f:cancel:${challenge.id}` }],
    ],
  });
}

export async function openClashFriendChallenge(chatId: number, telegramId: string, token: string) {
  await ensureClash1v1Schema();
  const linked = await requireDuelUser(chatId, telegramId);
  if (!linked) return;
  const [row] = await db
    .select({
      challenge: clash1v1Challenges,
      challengerName: users.displayName,
      challengerUsername: users.username,
    })
    .from(clash1v1Challenges)
    .innerJoin(users, eq(clash1v1Challenges.challengerUserId, users.id))
    .where(eq(clash1v1Challenges.tokenHash, challengeTokenHash(token)))
    .limit(1);
  if (!row) return sendMessage(chatId, "این دعوت خصوصی معتبر نیست یا قبلاً حذف شده است.");
  const challenge = row.challenge;
  if (challenge.expiresAt <= new Date() && ["pending", "countered"].includes(challenge.status)) {
    await db.update(clash1v1Challenges).set({ status: "expired", updatedAt: new Date() }).where(eq(clash1v1Challenges.id, challenge.id));
    return sendMessage(chatId, "مهلت این دعوت خصوصی تمام شده است. از دوستت بخواه دعوت جدیدی بسازد.");
  }
  if (!["pending", "countered"].includes(challenge.status)) {
    return sendMessage(chatId, challenge.status === "accepted" ? "✅ این دعوت قبلاً پذیرفته و Match ساخته شده است." : "این دعوت دیگر فعال نیست.");
  }
  if (challenge.challengerUserId === linked.userId) {
    return sendMessage(chatId, "این دعوت را خودت ساخته‌ای و منتظر پاسخ دوستت هستی.", {
      inline_keyboard: [[{ text: "❌ لغو دعوت", callback_data: `c1f:cancel:${challenge.id}` }]],
    });
  }
  if (challenge.opponentUserId && challenge.opponentUserId !== linked.userId) {
    return sendMessage(chatId, "این دعوت قبلاً توسط بازیکن دیگری باز شده و برای همان نفر قفل شده است.");
  }
  if (challenge.proposedByUserId === linked.userId) {
    return sendMessage(chatId, "پیشنهاد مود شما ارسال شده و منتظر پاسخ سازنده دعوت است.");
  }
  await sendClash1v1Rules(chatId, telegramId, false);
  await sendMessage(chatId, [
    "⚔️ <b>دعوت خصوصی 1V1 کلش رویال</b>",
    "",
    `دعوت‌کننده: <b>${html(row.challengerName || row.challengerUsername || "بازیکن Flexa")}</b>`,
    `🎮 مود: <b>${html(clashDuelModeLabel(challenge.gameMode))}</b>`,
    `💳 نوع: <b>${html(clashDuelStakeLabel(challenge.stakeMode))}</b>`,
    ...(challenge.stakeMode === "paid" ? [
      `ورودی شما: <b>${html(CLASH_1V1_CONFIG.entryFee)}</b>`,
      `جایزه برنده: <b>${html(CLASH_1V1_CONFIG.prize1st)}</b>`,
    ] : ["این مسابقه رایگان است."]),
    "",
    "می‌توانی همین شرایط را قبول کنی یا مود دیگری پیشنهاد بدهی.",
  ].join("\n"), challengeKeyboard(challenge.id));
}

export async function showFriendChallengeModeMenu(chatId: number, telegramId: string, challengeId: string) {
  const linked = await requireDuelUser(chatId, telegramId);
  if (!linked) return;
  const row = await loadChallengeById(challengeId);
  if (!row || !["pending", "countered"].includes(row.challenge.status)) return sendMessage(chatId, "این دعوت دیگر فعال نیست.");
  const allowed = linked.userId === row.challenge.challengerUserId
    || !row.challenge.opponentUserId
    || linked.userId === row.challenge.opponentUserId;
  if (!allowed) return sendMessage(chatId, "این دعوت برای شما نیست.");
  await sendMessage(chatId, "مود پیشنهادی جدید را انتخاب کن:", {
    inline_keyboard: CLASH_DUEL_GAME_MODES.map((mode) => ([{
      text: `${mode.emoji} ${mode.label}${row.challenge.gameMode === mode.id ? " ✓" : ""}`,
      callback_data: `c1f:mode:${mode.id}:${challengeId}`,
    }])),
  });
}

export async function counterFriendChallengeMode(
  chatId: number,
  telegramId: string,
  challengeId: string,
  gameMode: string,
) {
  if (!isClashDuelGameMode(gameMode)) return sendMessage(chatId, "مود انتخاب‌شده معتبر نیست.");
  const linked = await requireDuelUser(chatId, telegramId);
  if (!linked) return;
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`friend-challenge:${challengeId}`}))`);
    const [challenge] = await tx.select().from(clash1v1Challenges).where(eq(clash1v1Challenges.id, challengeId)).for("update").limit(1);
    if (!challenge || !["pending", "countered"].includes(challenge.status)) return { kind: "closed" as const };
    if (challenge.expiresAt <= new Date()) {
      await tx.update(clash1v1Challenges).set({ status: "expired", updatedAt: new Date() }).where(eq(clash1v1Challenges.id, challenge.id));
      return { kind: "expired" as const };
    }
    const isChallenger = challenge.challengerUserId === linked.userId;
    if (!isChallenger && challenge.opponentUserId && challenge.opponentUserId !== linked.userId) return { kind: "forbidden" as const };
    if (isChallenger && !challenge.opponentUserId) return { kind: "waiting_opponent" as const };
    const opponentUserId = isChallenger ? challenge.opponentUserId : linked.userId;
    const opponentTelegramId = isChallenger ? challenge.opponentTelegramId : telegramId;
    const [updated] = await tx.update(clash1v1Challenges).set({
      opponentUserId,
      opponentTelegramId,
      proposedByUserId: linked.userId,
      gameMode,
      status: "countered",
      proposalVersion: challenge.proposalVersion + 1,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      updatedAt: new Date(),
    }).where(eq(clash1v1Challenges.id, challenge.id)).returning();
    return { kind: "updated" as const, challenge: updated };
  });
  if (outcome.kind !== "updated") {
    const messages: Record<string, string> = {
      closed: "این دعوت دیگر فعال نیست.", expired: "مهلت دعوت تمام شده است.",
      forbidden: "این دعوت برای شما نیست.", waiting_opponent: "هنوز دوستی این دعوت را باز نکرده است.",
    };
    return sendMessage(chatId, messages[outcome.kind]);
  }
  const challenge = outcome.challenge;
  const otherTelegramId = challenge.challengerUserId === linked.userId
    ? challenge.opponentTelegramId
    : challenge.challengerTelegramId;
  await sendMessage(chatId, `🔄 مود <b>${html(clashDuelModeLabel(gameMode))}</b> پیشنهاد شد. تا تأیید طرف مقابل هیچ مبلغی کسر نمی‌شود.`);
  if (otherTelegramId) {
    await sendMessage(Number(otherTelegramId), [
      "🔄 <b>پیشنهاد مود جدید برای دوئل</b>",
      `مود جدید: <b>${html(clashDuelModeLabel(gameMode))}</b>`,
      `نوع رقابت: <b>${html(clashDuelStakeLabel(challenge.stakeMode))}</b>`,
      "",
      "پیشنهاد را قبول کن یا مود دیگری انتخاب کن.",
    ].join("\n"), challengeKeyboard(challenge.id, false));
  }
}

export async function acceptFriendChallenge(chatId: number, telegramId: string, challengeId: string) {
  await ensureClash1v1Schema();
  const actor = await requireDuelUser(chatId, telegramId);
  if (!actor) return;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`friend-challenge:${challengeId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7100171)`);
    const [challenge] = await tx.select().from(clash1v1Challenges).where(eq(clash1v1Challenges.id, challengeId)).for("update").limit(1);
    if (!challenge) return { kind: "missing" as const };
    const policy = challengeCanBeAccepted({
      status: challenge.status,
      expiresAt: challenge.expiresAt,
      challengerUserId: challenge.challengerUserId,
      proposedByUserId: challenge.proposedByUserId,
      opponentUserId: challenge.opponentUserId,
      actorUserId: actor.userId,
    });
    if (!policy.ok) return { kind: policy.reason };
    const opponentUserId = challenge.opponentUserId || actor.userId;
    const opponentTelegramId = challenge.opponentTelegramId || telegramId;
    if (opponentUserId === challenge.challengerUserId) return { kind: "same_user" as const };

    const participantUsers = await tx.select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      clashRoyaleId: users.clashRoyaleId,
      clashRoyaleStatus: users.clashRoyaleStatus,
    }).from(users).where(inArray(users.id, [challenge.challengerUserId, opponentUserId]));
    const challenger = participantUsers.find((user: { id: string }) => user.id === challenge.challengerUserId);
    const opponent = participantUsers.find((user: { id: string }) => user.id === opponentUserId);
    if (!challenger || !opponent) return { kind: "participant_missing" as const };
    if (!challenger.clashRoyaleId || challenger.clashRoyaleStatus !== "verified" || !opponent.clashRoyaleId || opponent.clashRoyaleStatus !== "verified") {
      return { kind: "tag_not_verified" as const };
    }

    const activeEntries = await tx.select({ userId: clash1v1Entries.userId }).from(clash1v1Entries).where(and(
      inArray(clash1v1Entries.userId, [challenger.id, opponent.id]),
      inArray(clash1v1Entries.status, ["waiting_qr", "queued", "matched"]),
    ));
    if (activeEntries.length) return { kind: "participant_busy" as const, busyUserIds: activeEntries.map((entry) => entry.userId) };

    const challengerPlayer = await getOrCreatePlayerTx(tx, { userId: challenger.id, displayName: challenger.displayName, username: challenger.username });
    const opponentPlayer = await getOrCreatePlayerTx(tx, { userId: opponent.id, displayName: opponent.displayName, username: opponent.username });
    const paid = challenge.stakeMode === "paid";
    const feeRial = paid ? BigInt(CLASH_1V1_CONFIG.entryFeeToman) * BigInt(10) : BigInt(0);
    const prizeRial = paid ? BigInt(CLASH_1V1_CONFIG.prizeToman) * BigInt(10) : BigInt(0);
    let challengerWallet: typeof wallets.$inferSelect | null = null;
    let opponentWallet: typeof wallets.$inferSelect | null = null;
    if (paid) {
      challengerWallet = await getOrCreateWalletTx(tx, challenger.id);
      opponentWallet = await getOrCreateWalletTx(tx, opponent.id);
      const locked = await tx.select().from(wallets).where(inArray(wallets.id, [challengerWallet!.id, opponentWallet!.id])).for("update");
      const challengerLocked = locked.find((wallet: { id: string }) => wallet.id === challengerWallet!.id)!;
      const opponentLocked = locked.find((wallet: { id: string }) => wallet.id === opponentWallet!.id)!;
      if (bigIntFromText(challengerLocked.balance) < feeRial) return { kind: "insufficient" as const, userId: challenger.id };
      if (bigIntFromText(opponentLocked.balance) < feeRial) return { kind: "insufficient" as const, userId: opponent.id };
      const firstDebit = await updateWalletBalanceSafely(tx, challengerWallet!.id, feeRial, "decrease");
      const secondDebit = await updateWalletBalanceSafely(tx, opponentWallet!.id, feeRial, "decrease");
      if (!firstDebit || !secondDebit) throw new Error("FRIEND_CHALLENGE_ATOMIC_DEBIT_FAILED");
    }

    const [{ value: matchCount }] = await tx.select({ value: count() }).from(matches).where(eq(matches.tournamentId, challenge.tournamentId));
    const [match] = await tx.insert(matches).values({
      tournamentId: challenge.tournamentId,
      round: 1,
      matchNumber: Number(matchCount || 0) + 1,
      player1Id: challengerPlayer.id,
      player2Id: opponentPlayer.id,
      status: "pending",
      evidence: {
        source: "friend_challenge",
        expectedGameMode: challenge.gameMode,
        stakeMode: challenge.stakeMode,
        challengeId: challenge.id,
      },
    }).returning();
    const [challengerInvite, opponentInvite] = await Promise.all([
      recentInvite(tx, challenger.id),
      recentInvite(tx, opponent.id),
    ]);
    const matchedAt = new Date();
    const insertedEntries = await tx.insert(clash1v1Entries).values([
      {
        tournamentId: challenge.tournamentId,
        userId: challenger.id,
        playerId: challengerPlayer.id,
        telegramId: challenge.challengerTelegramId,
        status: "matched" as const,
        entryFeeRial: feeRial.toString(),
        prizeRial: prizeRial.toString(),
        opponentType: "friend",
        stakeMode: challenge.stakeMode,
        gameMode: challenge.gameMode,
        challengeId: challenge.id,
        inviteLink: challengerInvite,
        submittedAt: challengerInvite ? matchedAt : null,
        matchedMatchId: match.id,
        matchedAt,
        metadata: { source: "telegram_friend_duel_v1", role: "challenger" },
      },
      {
        tournamentId: challenge.tournamentId,
        userId: opponent.id,
        playerId: opponentPlayer.id,
        telegramId: opponentTelegramId,
        status: "matched" as const,
        entryFeeRial: feeRial.toString(),
        prizeRial: prizeRial.toString(),
        opponentType: "friend",
        stakeMode: challenge.stakeMode,
        gameMode: challenge.gameMode,
        challengeId: challenge.id,
        inviteLink: opponentInvite,
        submittedAt: opponentInvite ? matchedAt : null,
        matchedMatchId: match.id,
        matchedAt,
        metadata: { source: "telegram_friend_duel_v1", role: "opponent" },
      },
    ]).returning();

    if (paid && challengerWallet && opponentWallet) {
      await tx.insert(transactions).values([
        {
          walletId: challengerWallet.id,
          amount: feeRial.toString(),
          type: "entry_fee" as const,
          status: "completed" as const,
          referenceId: `clash-friend-entry-${challenge.id}-${challenger.id}`,
          metadata: { kind: "clash_friend_duel_entry", challengeId: challenge.id, matchId: match.id, userId: challenger.id, gameMode: challenge.gameMode },
        },
        {
          walletId: opponentWallet.id,
          amount: feeRial.toString(),
          type: "entry_fee" as const,
          status: "completed" as const,
          referenceId: `clash-friend-entry-${challenge.id}-${opponent.id}`,
          metadata: { kind: "clash_friend_duel_entry", challengeId: challenge.id, matchId: match.id, userId: opponent.id, gameMode: challenge.gameMode },
        },
      ]);
    }
    await tx.update(clash1v1Challenges).set({
      opponentUserId,
      opponentTelegramId,
      status: "accepted",
      matchId: match.id,
      acceptedAt: matchedAt,
      updatedAt: matchedAt,
    }).where(eq(clash1v1Challenges.id, challenge.id));
    return {
      kind: "accepted" as const,
      challenge: { ...challenge, opponentUserId, opponentTelegramId },
      match,
      entries: insertedEntries,
      challenger,
      opponent,
    };
  });

  if (result.kind !== "accepted") {
    const messages: Record<string, string> = {
      missing: "دعوت پیدا نشد.", closed: "این دعوت دیگر فعال نیست.", expired: "مهلت دعوت تمام شده است.",
      own_proposal: "نمی‌توانی پیشنهاد خودت را تأیید کنی؛ طرف مقابل باید آن را بپذیرد.",
      opponent_missing: "طرف مقابل این دعوت را کامل باز نکرده است.", different_opponent: "این دعوت برای بازیکن دیگری قفل شده است.",
      same_user: "نمی‌توانی با حساب خودت مسابقه بسازی.", participant_missing: "اطلاعات یکی از بازیکنان ناقص است.",
      tag_not_verified: "Player Tag هر دو نفر باید با Supercell API تأیید شده باشد.",
      participant_busy: "یکی از بازیکنان هم‌اکنون در صف یا Match دیگری است.",
      insufficient: "موجودی کیف پول یکی از بازیکنان کافی نیست؛ هیچ مبلغی از نفر دیگر کسر نشد.",
    };
    return sendMessage(chatId, messages[result.kind] || "پذیرش دعوت انجام نشد.", {
      inline_keyboard: result.kind === "insufficient" ? [[{ text: "💳 شارژ کیف پول", url: `${APP_URL}/wallet` }]] : undefined,
    });
  }

  const challenge = result.challenge;
  await Promise.allSettled([
    recordClash1v1RulesAcceptance(challenge.challengerTelegramId),
    recordClash1v1RulesAcceptance(challenge.opponentTelegramId!),
  ]);
  const common = [
    "✅ <b>شرایط دوئل تأیید و Match خصوصی ساخته شد</b>",
    `🎮 مود: <b>${html(clashDuelModeLabel(challenge.gameMode))}</b>`,
    `💳 نوع: <b>${html(clashDuelStakeLabel(challenge.stakeMode))}</b>`,
    challenge.stakeMode === "paid"
      ? `ورودی هر نفر ${html(CLASH_1V1_CONFIG.entryFee)} به‌صورت اتمی کسر شد.`
      : "این رقابت رایگان است و مبلغی کسر نشد.",
    "👑 سازنده دعوت، میزبان ارسال درخواست Friendly Battle است.",
  ].join("\n");
  await Promise.allSettled([
    sendMessage(Number(challenge.challengerTelegramId), common, { inline_keyboard: [[{ text: "📦 ادامه و ثبت پیوند", callback_data: "clash1v1:status" }]] }),
    sendMessage(Number(challenge.opponentTelegramId), common, { inline_keyboard: [[{ text: "📦 ادامه و ثبت پیوند", callback_data: "clash1v1:status" }]] }),
  ]);
  await runClash1v1MatchmakingAndNotify();
  await openClash1v1Queue(chatId, telegramId);
}

export async function closeFriendChallenge(
  chatId: number,
  telegramId: string,
  challengeId: string,
  action: "cancel" | "reject",
) {
  const linked = await requireDuelUser(chatId, telegramId);
  if (!linked) return;
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`friend-challenge:${challengeId}`}))`);
    const [challenge] = await tx.select().from(clash1v1Challenges)
      .where(eq(clash1v1Challenges.id, challengeId)).for("update").limit(1);
    if (!challenge || !["pending", "countered"].includes(challenge.status)) return { kind: "closed" as const };
    const isChallenger = challenge.challengerUserId === linked.userId;
    if (action === "cancel" && !isChallenger) return { kind: "not_owner" as const };
    if (action === "reject" && isChallenger) return { kind: "use_cancel" as const };
    if (challenge.opponentUserId && !isChallenger && challenge.opponentUserId !== linked.userId) return { kind: "forbidden" as const };
    const status = action === "cancel" ? "cancelled" : "rejected";
    await tx.update(clash1v1Challenges).set({ status, cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(clash1v1Challenges.id, challenge.id));
    return {
      kind: "closed_now" as const,
      other: isChallenger ? challenge.opponentTelegramId : challenge.challengerTelegramId,
    };
  });
  if (outcome.kind !== "closed_now") {
    const messages = {
      closed: "این دعوت دیگر فعال نیست.",
      not_owner: "فقط سازنده می‌تواند دعوت را لغو کند.",
      use_cancel: "برای لغو دعوت خودت از دکمه لغو استفاده کن.",
      forbidden: "این دعوت برای شما نیست.",
    } as const;
    return sendMessage(chatId, messages[outcome.kind]);
  }
  await sendMessage(chatId, action === "cancel" ? "✅ دعوت خصوصی لغو شد." : "دعوت رد شد.");
  if (outcome.other) await sendMessage(Number(outcome.other), action === "cancel" ? "سازنده، دعوت خصوصی را لغو کرد." : "دوست شما دعوت خصوصی را رد کرد.").catch(() => undefined);
}
