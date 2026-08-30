import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { classifiedAds, classifiedScrapeLogs, clash1v1Entries, couponRedemptions, coupons, disputes, matchEvidence, matchResultClaims, matches, players, registrations, telegramAccounts, telegramCampaignEvents, telegramLinkCodes, telegramPreRegistrations, telegramReferrals, telegramSentNotifications, tickets, ticketMessages, tournamentWaitlist, tournaments, transactions, users, wallets, honors, honorLikes, honorViews } from "@/db/schema";
import { normalizeDigits, normalizePhoneNumber } from "@/lib/phone";
import { getTelegramChannelChatId, notifyLinkedUserOnTelegram, publishHonorToTelegramChannel, publishTournamentToTelegramChannel, telegramApi } from "@/lib/telegram";
import { getGameIdGuide, gameGuideKeyboard } from "./guide";
import { bigIntFromText, formatTomanFromRial, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { getEntryFeeRial } from "@/lib/tournament-finance";
import { createWalletReference, sanitizeWalletNote, validateDepositAmountRial } from "@/lib/wallet-security";
import { getCryptoPaymentConfiguration } from "@/lib/cryptopayment";
import { startCryptoPaymentDeposit } from "@/lib/cryptopayment-deposit";
import { checkAgeGate } from "@/lib/age-gate";
import { evaluateUserAchievements, achievementProgressForUser } from "@/lib/achievement-service";
import { LevelingService } from "@/lib/leveling-service";
import { CLASH_1V1_CONFIG, ensureClash1v1Schema, finalizeMatchResult, refundClash1v1Match, suspendClash1v1Telegram } from "@/lib/clash-1v1";
import { clashVerdictMessage, decideClashVerdict } from "@/lib/clash-api-verdict";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";
import {
  ensurePrivateTournamentAttendanceSchema,
  privateCancellationKeepsEntryFee,
  PRIVATE_NO_SHOW_POLICY_TEXT,
} from "@/lib/private-tournament-attendance";
import {
  ClashRoyaleApiError,
  getClashRoyaleApiConfiguration,
  normalizeClashRoyaleTag,
  verifyClashRoyaleHeadToHead,
} from "@/lib/clash-royale-api";
import { rateLimit } from "@/lib/rate-limit";
import { addCodRoomEvidence, reportCodRoomIssue, verifyCodLobbyFromImage } from "@/lib/cod-room-service";
import logger from "@/lib/logger";
import type { SessionData, TelegramCallbackQuery, TelegramMessage, TelegramUpdate, TelegramUser } from "./types";
import { APP_URL, CANCEL_TEXT, CHANNEL_URL, DEFAULT_RULES, GAMENT_ID_REQUIRED, PLATFORM_OPTIONS, SKIP_TEXT } from "./config";
import { validateWebhookSecret } from "./security";
import { extractInviteReference, gameLabel, gamePrompt, generateLinkCode, html, isValidFlexaId, linkCodeHash, normalizeGame, normalizeFlexaId } from "./utils";
import { accountMenuKeyboard, confirmKeyboard, earnMenuKeyboard, gameHubKeyboard, gameKeyboard, helpMenuKeyboard, mainMenuKeyboard, platformKeyboard, removeKeyboard, replyKeyboard, roomsKeyboard } from "./keyboards";
import { findGameHub, parseGameCallback, type GameHub } from "./menu-model";
import { answerCallback, editMessage, sendDocument, sendMessage, sendPhoto } from "./transport";
import { clearSession, getSession, registrationSummary, setSession } from "./sessions";
import { ensureFeatureEnabled, telegramFeatureEnabled } from "./settings";
import { checkChannelMembership, isChannelMember, promptChannelMembership } from "./membership";
import { getLinkedUserByTelegram } from "./user-service";
import { aiCommand } from "./commands/ai";
import {
  acceptClash1v1Rules,
  cancelClash1v1Queue,
  ensureClash1v1QueueTournament,
  openClash1v1Queue,
  promptClash1v1Qr,
  registerClash1v1Queue,
  markClash1v1Ready,
  runClash1v1MatchmakingAndNotify,
  showClash1v1ModeMenu,
  showClash1v1StakeMenu,
  sendClash1v1Rules,
  sendClashFriendLinkGuide,
  submitClash1v1Qr,
} from "./commands/clash-1v1";
import { isSupportedClashInvite } from "./commands/clash-1v1-policy";
import {
  acceptFriendChallenge,
  closeFriendChallenge,
  counterFriendChallengeMode,
  createClashFriendChallenge,
  openClashFriendChallenge,
  showFriendChallengeModeMenu,
} from "./commands/clash-friend-duel";
import {
  clashBattleMatchesExpectedMode,
  clashDuelModeLabel,
  isClashDuelGameMode,
  isClashDuelOpponentType,
  isClashDuelStakeMode,
} from "@/lib/clash-duel-policy";
import { getAdminIds, hasAdminAccess } from "./admin-access";
import { downloadTelegramPhotoAsDataUrl, downloadTelegramQrPhoto } from "./files";
import { parseTelegramCommand } from "./command-router";
import {
  claimTelegramUpdate,
  completeTelegramUpdate,
  ensureTelegramReliabilitySchema,
  failTelegramUpdate,
  type TelegramUpdateClaim,
} from "@/lib/telegram-reliability";
import { shouldRetryTelegramUpdate } from "@/lib/telegram-reliability-policy";
import { serverBotUsername } from "@/lib/telegram-bot-username";
import {
  affiliatePartnerForTelegramChat,
  affiliatePublicLink,
  connectTelegramMediaGroup,
  ensureAffiliateSchema,
  getMediaPartnerDashboard,
  normalizeAffiliateCode,
  recordAffiliateStart,
} from "@/lib/affiliate-service";

export const dynamic = "force-dynamic";

function isFreeEntryFee(entryFee?: string | null) {
  const value = normalizeDigits(entryFee || "").trim().toLowerCase();
  if (!value || value === "0") return true;
  return ["رایگان", "free", "مجانی"].some((word) => value.includes(word));
}

async function getOrCreateUserPlayer(userId: string, fallbackName: string, username?: string | null) {
  const [existing] = await db.select().from(players).where(eq(players.visibleUserId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(players)
    .values({
      visibleUserId: userId,
      username: username || fallbackName || `player_${userId.slice(0, 6)}`,
      displayName: fallbackName || username || "Flexa Player",
    })
    .returning();
  return created;
}

async function getOrCreateWallet(userId: string, tx: any = db) {
  const [existing] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(wallets).values({ userId, balance: "0", currency: "RIAL" }).returning();
  return created;
}


async function notifyAdminsOnWalletDeposit(user: TelegramUser, userId: string, amountRial: bigint, txId: string) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;
  const username = user.username ? `@${user.username}` : "—";
  const text = [
    "💳 <b>فیش واریز جدید از ربات</b>",
    "",
    `مبلغ: <b>${html(formatTomanFromRial(amountRial))}</b>`,
    `Telegram: <code>${html(user.id)}</code> | ${html(username)}`,
    `User ID: <code>${html(userId)}</code>`,
    `Transaction: <code>${html(txId)}</code>`,
    "",
    "برای مشاهده فیش و تأیید/رد وارد پنل کیف پول شو.",
  ].join("\n");
  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, { inline_keyboard: [[{ text: "پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
  }
}

// Card-to-card top-up is retired in favour of the payment gateway, which
// credits instantly. Kept as a handler (rather than deleted) so /deposit and
// any old inline button still land somewhere that explains the change instead
// of silently doing nothing.
async function startWalletDeposit(chatId: number, telegramId: string) {
  await sendMessage(chatId, "💳 شارژ کارت‌به‌کارت غیرفعال شده است.\n\nحالا می‌توانی مستقیم و آنی از درگاه بانکی شارژ کنی.", {
    inline_keyboard: [[{ text: "🏦 شارژ آنلاین (آنی)", callback_data: "wallet:online_deposit" }]],
  });
}

/**
 * Online top-up from the bot. Telegram accounts are already bound to a Flexa
 * user, so the payer is known without a web login: the deposit is created here
 * and the user is handed a one-tap gateway link.
 *
 * The pending row and gateway request go through the same shared service the
 * web wallet uses, so the single callback route settles both identically.
 */
async function startWalletOnlineDeposit(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای شارژ آنلاین، اول حساب تلگرامت را با /link به Flexa وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }

  if (!getCryptoPaymentConfiguration().live) {
    await sendMessage(chatId, "شارژ کیف پول موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کن یا با پشتیبانی تماس بگیر.", {
      inline_keyboard: [[{ text: "🎧 پشتیبانی", url: `${APP_URL}/support` }]],
    });
    return;
  }

  await setSession(telegramId, "wallet_online_amount", {});
  await sendMessage(
    chatId,
    "🏦 <b>شارژ آنلاین کیف پول</b>\n\n⚠️ <b>قبل از پرداخت، فیلترشکن (VPN) خود را حتماً خاموش کن.</b> درگاه‌های بانکی ایران با آی‌پی خارجی کار نمی‌کنند.\n\n💻 ترجیحاً پرداخت را از داخل سایت انجام بده.\n\nمبلغ مورد نظر را به USDT وارد کن. مثال: <code>50000</code>\n\nحداقل ۱٬۰۰۰ USDT.",
    replyKeyboard([[CANCEL_TEXT]])
  );
}

async function rewardUserXP(userId: string, amount: number, reason: string) {
  try {
    const result = await db.transaction(async (tx) => LevelingService.addXP(tx, userId, amount));
    return `\n🎁 +${amount} XP (${reason}) — Level ${result.level}`;
  } catch (err) {
    logger.warn({ err, userId, amount, reason }, "Failed to reward XP");
    return "";
  }
}

async function findLinkedUserId(flexaId: string | undefined, phoneNumber: string) {
  const conditions = [];
  if (flexaId) conditions.push(eq(users.flexaId, flexaId));
  if (/^09\d{9}$/.test(phoneNumber)) conditions.push(eq(users.phoneNumber, phoneNumber));
  if (!conditions.length) return null;

  const [linkedUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1);

  return linkedUser?.id || null;
}

async function savePreRegistration(user: TelegramUser, data: SessionData) {
  const phoneNumber = normalizePhoneNumber(data.phoneNumber || "");
  const flexaId = data.flexaId ? normalizeFlexaId(data.flexaId) : null;
  const linkedUserId = await findLinkedUserId(flexaId || undefined, phoneNumber);
  const values = {
    telegramId: String(user.id),
    telegramUsername: user.username || null,
    telegramFirstName: user.first_name || null,
    telegramLastName: user.last_name || null,
    linkedUserId,
    flexaId,
    fullName: (data.fullName || "").slice(0, 100),
    phoneNumber,
    game: normalizeGame(data.game),
    platform: data.platform || null,
    gamerTag: (data.gamerTag || "").slice(0, 100),
    city: data.city || null,
    teamName: data.teamName || null,
    status: "new",
    source: "telegram_webhook",
    rawPayload: { source: "telegram_webhook", data, telegramUser: user },
    updatedAt: new Date(),
  };

  await db
    .insert(telegramPreRegistrations)
    .values(values)
    .onConflictDoUpdate({
      target: telegramPreRegistrations.telegramId,
      set: values,
    });

  await notifyAdminsOnPreRegistration(user, data, linkedUserId).catch((err) => {
    logger.warn({ err, telegramId: user.id }, "Failed to notify Telegram admins about pre-registration");
  });
}

async function recordReferralIfNeeded(user: TelegramUser, startPayload?: string) {
  if (!startPayload) return;
  const payload = startPayload.trim().slice(0, 100);
  const referredTelegramId = String(user.id);

  if (payload.startsWith("ref_")) {
    const referrerTelegramId = payload.replace("ref_", "").trim();
    if (/^\d+$/.test(referrerTelegramId) && referrerTelegramId !== referredTelegramId) {
      const [created] = await db
        .insert(telegramReferrals)
        .values({
          referrerTelegramId,
          referredTelegramId,
          referredUsername: user.username || null,
        })
        .onConflictDoNothing({ target: telegramReferrals.referredTelegramId })
        .returning({ id: telegramReferrals.id });
      if (created) {
        const referrer = await getLinkedUserByTelegram(referrerTelegramId);
        if (referrer?.userId) {
          const key = `referral:first:${referrerTelegramId}:${referredTelegramId}`;
          const [existingReward] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
          if (!existingReward) {
            await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId: referrerTelegramId, type: "referral_reward" });
            const xpText = await rewardUserXP(referrer.userId, 30, "دعوت کاربر جدید");
            const chatId = Number(referrerTelegramId);
            if (Number.isFinite(chatId)) await sendMessage(chatId, `🎉 یک نفر با لینک دعوت شما وارد ربات شد.${xpText}`);
          }
        }
      }
    }
    return;
  }

  if (payload.startsWith("campaign_") || payload.startsWith("streamer_") || payload.startsWith("utm_")) {
    await db.insert(telegramCampaignEvents).values({
      campaign: payload,
      telegramId: referredTelegramId,
      telegramUsername: user.username || null,
      eventType: "start",
      rawPayload: { firstName: user.first_name || null, lastName: user.last_name || null },
    });
  }
}


function normalizeStartPayload(value?: string) {
  return decodeURIComponent(value || "").trim().slice(0, 120).replace(/\s+/g, "_");
}

function deepLinkKeyboard(url: string, label = "باز کردن در Flexa") {
  return {
    inline_keyboard: [
      [{ text: label, web_app: { url } }],
      [{ text: "باز کردن در مرورگر", url }],
      [{ text: "منوی اصلی ربات", callback_data: "menu:home" }],
    ],
  };
}

async function handleStartPayload(chatId: number, telegramId: string, user: TelegramUser, rawPayload?: string) {
  const payload = normalizeStartPayload(rawPayload);
  if (!payload || payload.startsWith("ref_") || payload.startsWith("campaign_") || payload.startsWith("streamer_") || payload.startsWith("utm_")) return false;

  const affiliatePayload = payload.match(/^aff_([A-Za-z0-9]{6,24})(?:_([A-Za-z0-9]{2,24}))?$/);
  if (affiliatePayload) {
    const result = await recordAffiliateStart({
      telegramId,
      referralCode: affiliatePayload[1],
      campaignCode: affiliatePayload[2] || null,
      source: "telegram_deep_link",
      metadata: { telegramUsername: user.username || null },
    });
    if (result.attributed) {
      await sendMessage(chatId, `✅ ورود شما از طرف رسانه <b>${html(result.mediaName || "همکار Flexa")}</b> ثبت شد و تا ۳۰ روز معتبر است.`);
    }
    await startCommand(chatId);
    return true;
  }

  if (["wallet", "wallet_deposit", "deposit", "charge"].includes(payload)) {
    if (payload === "deposit" || payload === "wallet_deposit" || payload === "charge") {
      await startWalletDeposit(chatId, telegramId);
      return true;
    }
    await walletCommand(chatId, telegramId);
    return true;
  }

  if (["clash", "clash_1v1", "duel"].includes(payload)) {
    await openClash1v1Queue(chatId, telegramId);
    return true;
  }
  if (payload === "profile") {
    await profileCommand(chatId, telegramId);
    return true;
  }
  if (payload === "register") {
    await registerStart(chatId, telegramId);
    return true;
  }
  if (payload === "rooms" || payload === "tournaments") {
    await roomsCommand(chatId);
    return true;
  }
  if (payload === "missions") {
    await missionsCommand(chatId, telegramId);
    return true;
  }
  if (payload === "invite") {
    await inviteCommand(chatId, telegramId);
    return true;
  }

  if (payload === "honors" || payload === "honor_latest") {
    const [latest] = await db.select({ id: honors.id, title: honors.title, type: honors.type }).from(honors).where(eq(honors.status, "approved")).orderBy(desc(honors.publishedAt), desc(honors.createdAt)).limit(1);
    const url = latest ? `${APP_URL}/honors/${latest.id}` : `${APP_URL}/honors`;
    await sendMessage(
      chatId,
      latest ? `🏛 <b>آخرین خبر/افتخار Flexa</b>\n\n${html(latest.title)}` : "🏛 تالار افتخارات Flexa",
      deepLinkKeyboard(url, latest ? "مشاهده آخرین خبر" : "مشاهده تالار افتخارات")
    );
    return true;
  }

  if (payload === "link") {
    await linkCommand(chatId, user);
    return true;
  }

  const friendDuelToken = payload.match(/^duel_([A-Za-z0-9_-]{20,40})$/)?.[1];
  if (friendDuelToken) {
    await openClashFriendChallenge(chatId, telegramId, friendDuelToken);
    return true;
  }

  // Match-evidence deep link from the website. Screenshots live in Telegram's
  // own file storage and we keep only the file_id, so the site never has to
  // accept, store or serve an image upload for this.
  const evidenceMatchId = payload.match(/^ev_([0-9a-f-]{36})$/i)?.[1];
  if (evidenceMatchId) {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await sendMessage(
        chatId,
        "برای ارسال مدرک، اول باید حساب تلگرامت را به Flexa وصل کنی.",
        { inline_keyboard: [[{ text: "اتصال حساب", callback_data: "menu:link" }]] },
      );
      return true;
    }
    await startEvidenceUpload(chatId, telegramId, evidenceMatchId);
    return true;
  }

  const qrTournamentId = payload.match(/^qr_([0-9a-f-]{36})$/i)?.[1];
  if (qrTournamentId) {
    // Legacy deep-link path. The system 1V1 queue is a single global product,
    // so always route to the atomic queue instead of the dead registration flow.
    await openClash1v1Queue(chatId, telegramId);
    return true;
  }

  const codLobbyPayload = payload.match(/^codL_([0-9a-f-]{36})$/i);
  if (codLobbyPayload) {
    await startCodLobbyCheck(chatId, telegramId, codLobbyPayload[1]);
    return true;
  }

  const codEvidencePayload = payload.match(/^codE_([0-9a-f-]{36})_(scoreboard|recording|lobby_recording|dispute)$/i);
  if (codEvidencePayload) {
    await startCodEvidenceUpload(chatId, telegramId, codEvidencePayload[1], codEvidencePayload[2].toLowerCase());
    return true;
  }

  const codReportPayload = payload.match(/^codR_([0-9a-f-]{36})_([a-z_]{3,32})$/i);
  if (codReportPayload) {
    await startCodReportUpload(chatId, telegramId, codReportPayload[1], codReportPayload[2].toLowerCase());
    return true;
  }

  const tournamentId = payload.match(/^(?:tournament|t)_([0-9a-f-]{36})$/i)?.[1];
  if (tournamentId) {
    const [tournament] = await db.select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, status: tournaments.status, entryFee: tournaments.entryFee, startDate: tournaments.startDate }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
    const url = `${APP_URL}/tournaments/${tournamentId}`;
    await sendMessage(
      chatId,
      tournament
        ? `🏆 <b>${html(tournament.name)}</b>\n\n🎮 ${html(gameLabel(tournament.game))}\nوضعیت: <b>${html(tournament.status)}</b>\nورودی: <b>${html(tournament.entryFee || "رایگان")}</b>${tournament.startDate ? `\nشروع: <b>${new Date(tournament.startDate).toLocaleString("fa-IR")}</b>` : ""}`
        : "🏆 این تورنومنت در Flexa باز می‌شود.",
      deepLinkKeyboard(url, tournament?.status === "registration" ? "ثبت‌نام / مشاهده تورنومنت" : "مشاهده تورنومنت")
    );
    return true;
  }

  const honorId = payload.match(/^(?:honor|h)_([a-zA-Z0-9-]{3,80})$/)?.[1];
  if (honorId) {
    const uuidLike = /^[0-9a-f-]{36}$/i.test(honorId);
    const row = uuidLike ? (await db.select({ id: honors.id, title: honors.title, type: honors.type, game: honors.game }).from(honors).where(eq(honors.id, honorId)).limit(1))[0] : null;
    const url = `${APP_URL}/honors/${honorId}`;
    await sendMessage(
      chatId,
      row
        ? `🏛 <b>${html(row.title)}</b>\n\nنوع: <b>${html(row.type)}</b>${row.game ? `\nبازی: <b>${html(row.game)}</b>` : ""}\n\nبرای خواندن کامل، لایک و مشاهده آمار وارد Flexa شو.`
        : "🏛 این خبر/افتخار در تالار افتخارات Flexa باز می‌شود.",
      deepLinkKeyboard(url, "مشاهده خبر / افتخار")
    );
    return true;
  }

  await sendMessage(chatId, "لینک ورودی را متوجه نشدم؛ منوی اصلی را باز کردم.", mainMenuKeyboard());
  return true;
}

function telegramStartLink(payload: string) {
  const username = serverBotUsername();
  return `https://t.me/${username}?start=${encodeURIComponent(payload)}`;
}

async function deepLinksCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = [
    ["کیف پول", telegramStartLink("wallet")],
    ["ثبت فیش", telegramStartLink("deposit")],
    ["تورنومنت‌ها", telegramStartLink("tournaments")],
    ["تالار افتخارات", telegramStartLink("honor_latest")],
    ["مأموریت‌ها", telegramStartLink("missions")],
    ["اتصال حساب", telegramStartLink("link")],
  ];
  await sendMessage(chatId, ["🔗 <b>Deep Linkهای آماده ربات</b>", "", ...rows.map(([label, link]) => `<b>${label}</b>\n<code>${html(link)}</code>`)].join("\n\n"));
}

async function startCommand(chatId: number) {
  await sendMessage(
    chatId,
    `سلام 👋\nبه <b>Flexa — پلتفرم تورنومنت گیمینگ</b> خوش آمدی.\n\nاز اینجا می‌تونی روم‌های فعال رو ببینی، پیش‌ثبت‌نام کنی و لینک‌های مهم Flexa رو دریافت کنی.\n\nثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی و داوری نهایی از داخل وب‌اپ انجام می‌شود.`,
    mainMenuKeyboard()
  );
}

/** Hub screen for one game — its rooms, tournaments and own features. */
async function gameHubCommand(chatId: number, hub: GameHub) {
  await sendMessage(
    chatId,
    [
      `${hub.emoji} <b>${html(hub.title)}</b>`,
      "",
      "از این بخش می‌تونی روم‌های فعال و تورنومنت‌های این بازی رو با ورودی و جایزه ببینی و ثبت‌نام کنی.",
    ].join("\n"),
    gameHubKeyboard(hub),
  );
}

async function accountMenuCommand(chatId: number) {
  await sendMessage(
    chatId,
    "👤 <b>حساب من</b>\n\nپروفایل، کیف پول، تورنومنت‌ها و مسابقات خودت رو از اینجا ببین.",
    accountMenuKeyboard(),
  );
}

async function earnMenuCommand(chatId: number) {
  await sendMessage(
    chatId,
    "🎁 <b>کسب درآمد</b>\n\nمأموریت‌ها، کوییز روزانه، معرفی دوستان و همکاری رسانه‌ای.",
    earnMenuKeyboard(),
  );
}

async function helpMenuCommand(chatId: number) {
  await sendMessage(
    chatId,
    "ℹ️ <b>راهنما و پشتیبانی</b>\n\nقوانین پلتفرم رو بخون یا با پشتیبانی در ارتباط باش.",
    helpMenuKeyboard(),
  );
}

async function linksCommand(chatId: number) {
  const rows: Array<Array<Record<string, string>>> = [
    [{ text: "⚡ وب‌اپ Flexa", url: APP_URL }],
    [{ text: "🏟 تورنومنت‌ها", url: `${APP_URL}/tournaments` }],
    [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }],
    [{ text: "👤 پروفایل", url: `${APP_URL}/profile` }],
  ];
  if (CHANNEL_URL) rows.push([{ text: "📣 کانال Flexa Games", url: CHANNEL_URL }]);
  await sendMessage(chatId, "🔗 لینک‌های مهم Flexa:", { inline_keyboard: rows });
}

async function channelCommand(chatId: number) {
  if (!CHANNEL_URL) {
    await sendMessage(chatId, "لینک کانال هنوز تنظیم نشده است.", mainMenuKeyboard());
    return;
  }
  await sendMessage(chatId, "📣 کانال رسمی Flexa Games:", {
    inline_keyboard: [[{ text: "ورود به کانال", url: CHANNEL_URL }]],
  });
}

async function rulesCommand(chatId: number) {
  await sendMessage(chatId, html(DEFAULT_RULES) + `\n\n🏟 روم‌ها: ${html(`${APP_URL}/tournaments`)}`, mainMenuKeyboard());
}

async function registerStart(chatId: number, telegramId: string) {
  if (!(await isChannelMember(telegramId))) {
    await promptChannelMembership(chatId);
    return;
  }
  await setSession(telegramId, "idle", {});
  await sendMessage(
    chatId,
    "🎮 <b>پیش‌ثبت‌نام تلگرامی Flexa</b>\n\nبازی موردنظر را انتخاب کن.\n\nبرای مسابقه <b>1V1 کلش رویال</b> ثبت‌نام و پرداخت واقعی مستقیم از همین بات انجام می‌شود؛ از دکمه ⚔️ 1V1 کلش رویال در منوی اصلی یا دستور /clash استفاده کن.",
    gameKeyboard()
  );
}

/**
 * Pre-registration started from inside a game hub.
 *
 * The user already picked the game by entering the hub, so skip the game
 * picker and go straight to platform selection.
 */
async function registerStartForGame(chatId: number, telegramId: string, hub: GameHub) {
  if (!(await isChannelMember(telegramId))) {
    await promptChannelMembership(chatId);
    return;
  }
  await setSession(telegramId, "idle", { game: hub.id });
  await sendMessage(
    chatId,
    `🎮 <b>پیش‌ثبت‌نام ${html(hub.title)}</b>\n\nحالا پلتفرم را انتخاب کن:`,
    platformKeyboard(),
  );
}

async function roomsCommand(chatId: number, gameFilter?: string) {
  const game = normalizeGame(gameFilter);
  const where = game ? and(eq(tournaments.status, "registration"), eq(tournaments.game, game as "cod_mobile" | "fortnite" | "clash_royale")) : eq(tournaments.status, "registration");
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      game: tournaments.game,
      gameMode: tournaments.gameMode,
      maxPlayers: tournaments.maxPlayers,
      prizePool: tournaments.prizePool,
      entryFee: tournaments.entryFee,
      status: tournaments.status,
      categoryLabel: tournaments.categoryLabel,
      registeredCount: count(registrations.id),
    })
    .from(tournaments)
    .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
    .where(where)
    .groupBy(tournaments.id)
    .orderBy(desc(tournaments.createdAt))
    .limit(10);

  const visibleRows = rows.filter((row) => row.categoryLabel !== CLASH_1V1_CONFIG.categoryLabel);
  if (!visibleRows.length) {
    await sendMessage(chatId, "فعلاً روم فعالی پیدا نشد. از وب‌اپ هم می‌تونی آخرین وضعیت رو ببینی:", {
      inline_keyboard: [[{ text: "🏟 مشاهده روم‌ها", url: `${APP_URL}/tournaments` }]],
    });
    return;
  }

  const text = [
    "🏟 <b>روم‌های فعال Flexa</b>",
    "",
    ...visibleRows.map((row, index) => [
      `<b>${index + 1}. ${html(row.name || "روم Flexa")}</b>`,
      `🎮 ${html(gameLabel(row.game))} | ${html(row.gameMode || "مود اعلام نشده")}`,
      `👥 ظرفیت: <b>${row.registeredCount}/${row.maxPlayers}</b>`,
      `💳 ورودی: <b>${html(row.entryFee || "رایگان")}</b>`,
      `🏆 جایزه: <b>${html(row.prizePool || "اعلام نشده")}</b>`,
    ].join("\n")),
    "",
    "برای ثبت‌نام قطعی وارد وب‌اپ شو.",
  ].join("\n\n");

  await sendMessage(chatId, text, roomsKeyboard(visibleRows));
}

/**
 * All tournaments for one game — open, running and recently finished —
 * each with its entry fee and prize pool.
 */
async function gameTournamentsCommand(chatId: number, hub: GameHub) {
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      game: tournaments.game,
      gameMode: tournaments.gameMode,
      maxPlayers: tournaments.maxPlayers,
      prizePool: tournaments.prizePool,
      entryFee: tournaments.entryFee,
      status: tournaments.status,
      categoryLabel: tournaments.categoryLabel,
      registeredCount: count(registrations.id),
    })
    .from(tournaments)
    .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
    .where(eq(tournaments.game, hub.id))
    .groupBy(tournaments.id)
    .orderBy(desc(tournaments.createdAt))
    .limit(10);

  const visibleRows = rows.filter((row) => row.categoryLabel !== CLASH_1V1_CONFIG.categoryLabel);

  if (!visibleRows.length) {
    await sendMessage(
      chatId,
      `${hub.emoji} فعلاً تورنومنتی برای <b>${html(hub.title)}</b> ثبت نشده.\n\nبه‌محض باز شدن روم جدید در کانال اطلاع‌رسانی می‌شود.`,
      gameHubKeyboard(hub),
    );
    return;
  }

  const statusLabel: Record<string, string> = {
    registration: "🟢 ثبت‌نام باز",
    in_progress: "🔴 در حال برگزاری",
    completed: "🏁 پایان‌یافته",
    cancelled: "⛔ لغو شده",
  };

  const text = [
    `${hub.emoji} <b>تورنومنت‌های ${html(hub.title)}</b>`,
    "",
    ...visibleRows.map((row, index) =>
      [
        `<b>${index + 1}. ${html(row.name || "تورنومنت Flexa")}</b>`,
        `${statusLabel[row.status] || row.status} | ${html(row.gameMode || "مود اعلام نشده")}`,
        `👥 ظرفیت: <b>${row.registeredCount}/${row.maxPlayers}</b>`,
        `💳 ورودی: <b>${html(row.entryFee || "رایگان")}</b>`,
        `🏆 جایزه: <b>${html(row.prizePool || "اعلام نشده")}</b>`,
      ].join("\n"),
    ),
  ].join("\n\n");

  const keyboard: Array<Array<Record<string, string>>> = [];
  for (const row of visibleRows.slice(0, 5)) {
    const title = (row.name || "تورنومنت").slice(0, 28);
    if (row.status === "registration") {
      const isFull =
        typeof row.registeredCount === "number" &&
        typeof row.maxPlayers === "number" &&
        row.registeredCount >= row.maxPlayers;
      keyboard.push([
        {
          text: isFull ? `ظرفیت تکمیل: ${title}` : `✅ ثبت‌نام: ${title}`,
          callback_data: `join:${row.id}`,
        },
      ]);
    } else {
      keyboard.push([{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${row.id}` }]);
    }
  }
  keyboard.push([{ text: `⬅️ بازگشت به ${hub.title}`, callback_data: `game:${hub.id}` }]);

  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function clashPrivateTournamentsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      maxPlayers: tournaments.maxPlayers,
      entryFee: tournaments.entryFee,
      prizePool: tournaments.prizePool,
      gameMode: tournaments.gameMode,
      startDate: tournaments.startDate,
      registeredCount: count(registrations.id),
    })
    .from(tournaments)
    .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
    .where(and(
      eq(tournaments.categoryLabel, CLASH_PRIVATE_DRAFT_CATEGORY),
      inArray(tournaments.status, ["registration", "in_progress"]),
    ))
    .groupBy(tournaments.id)
    .orderBy(desc(tournaments.createdAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "فعلاً مسابقه چندنفره فعال کلش رویال نداریم.", {
      inline_keyboard: [[{ text: "🌐 مشاهده تورنمنت‌ها", url: `${APP_URL}/tournaments?game=clash_royale` }]],
    });
    return;
  }

  const myRegistrations = linked?.userId
    ? await db.select({ tournamentId: registrations.tournamentId, id: registrations.id, checkedInAt: registrations.checkedInAt })
        .from(registrations).where(eq(registrations.visibleUserId, linked.userId))
    : [];
  const registrationByTournament = new Map(myRegistrations.map((registration) => [registration.tournamentId, registration]));

  const text = [
    "🏅 <b>مسابقات چندنفره کلش رویال</b>",
    "",
    "🃏 مود: انتخاب کارت (Draft)",
    "⚖️ سطح کارت‌ها: Tournament Standard و برابر برای همه",
    "🏆 رتبه‌بندی: Leaderboard داخل Clash Royale",
    "",
    ...rows.map((row, index) => {
      const registration = registrationByTournament.get(row.id);
      const state = registration ? (registration.checkedInAt ? "✅ چک‌این‌شده" : "🎟 ثبت‌نام‌شده")
        : Number(row.registeredCount) >= row.maxPlayers ? "🔴 تکمیل ظرفیت" : "🟢 ثبت‌نام باز";
      return [
        `<b>${index + 1}) ${html(row.name)}</b>`,
        `👥 ${Number(row.registeredCount).toLocaleString("fa-IR")}/${row.maxPlayers.toLocaleString("fa-IR")} | ${state}`,
        `💳 ورودی: <b>${html(row.entryFee || "رایگان")}</b>`,
        `🎁 جایزه: <b>${html(row.prizePool || "طبق تعداد ثبت‌نام")}</b>`,
        row.startDate ? `⏰ شروع: <b>${html(new Date(row.startDate).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }))}</b>` : "⏰ زمان شروع: اعلام می‌شود",
      ].join("\n");
    }),
  ].join("\n\n");

  const keyboard: Array<Array<Record<string, string>>> = [];
  for (const row of rows) {
    const registration = registrationByTournament.get(row.id);
    const title = row.name.slice(0, 28);
    if (registration) {
      keyboard.push([
        { text: registration.checkedInAt ? `✅ ${title}` : `✅ چک‌این: ${title}`, callback_data: `checkin:${registration.id}` },
        { text: "🏟 ورود/رمز", callback_data: `mylobby:${row.id}` },
      ]);
    } else if (row.status === "registration" && Number(row.registeredCount) < row.maxPlayers) {
      keyboard.push([{ text: `🎟 ثبت‌نام: ${title}`, callback_data: `join:${row.id}` }]);
    }
    keyboard.push([{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${row.id}` }]);
  }
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function joinTournamentFromTelegram(chatId: number, telegramId: string, tournamentId: string, privatePolicyAccepted = false) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت‌نام مستقیم، اول حساب تلگرامت را با /link به Flexa وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }], [{ text: "ورود به پروفایل", url: `${APP_URL}/profile` }]],
    });
    return;
  }

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد یا حذف شده است.");
    return;
  }

  // Legacy room/channel buttons for the system Clash queue used `join:<id>`.
  // Route them into the dedicated atomic queue instead of the generic
  // tournament/coupon registration path.
  if (
    tournament.game === CLASH_1V1_CONFIG.game &&
    (tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel || tournament.name === CLASH_1V1_CONFIG.name)
  ) {
    await openClash1v1Queue(chatId, telegramId);
    return;
  }

  if (tournament.status !== "registration") {
    await sendMessage(chatId, "ثبت‌نام این تورنومنت در حال حاضر باز نیست.");
    return;
  }
  if (
    tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY &&
    (!linked.clashRoyaleId || linked.clashRoyaleStatus !== "verified")
  ) {
    await sendMessage(chatId, "برای مسابقه چندنفره کلش باید Player Tag شما توسط Supercell API تأیید شده باشد.", {
      inline_keyboard: [[{ text: "⚔️ ثبت و تأیید Player Tag", url: `${APP_URL}/profile/edit` }]],
    });
    return;
  }
  if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && !privatePolicyAccepted) {
    await sendMessage(chatId, `⚠️ <b>تأیید قانون مالی مسابقه</b>\n\n${html(PRIVATE_NO_SHOW_POLICY_TEXT)}`, {
      inline_keyboard: [
        [{ text: "✅ می‌پذیرم و ثبت‌نام می‌کنم", callback_data: `joinprivate:confirm:${tournament.id}` }],
        [{ text: "انصراف", callback_data: "menu:clash_private" }],
      ],
    });
    return;
  }

  await ensurePrivateTournamentAttendanceSchema();
  const entryFeeRial = getEntryFeeRial(tournament.entryFee);
  const isPaid = entryFeeRial > BigInt(0);
  const player = await getOrCreateUserPlayer(linked.userId, linked.displayName || linked.username || "Flexa Player", linked.username);

  const result = await db.transaction(async (tx) => {
    const [{ value: registeredCount }] = await tx.select({ value: count() }).from(registrations).where(eq(registrations.tournamentId, tournamentId));
    if (registeredCount >= tournament.maxPlayers) return { ok: false as const, code: "FULL" };

    const [existing] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.visibleUserId, linked.userId)))
      .limit(1);
    if (existing) return { ok: false as const, code: "DUPLICATE" };

    let paymentText = "";
    let finalEntryFeeRial = entryFeeRial;
    let couponRedemptionId: string | null = null;
    let couponId: string | null = null;
    let discountRial = BigInt(0);

      if (isPaid) {
        const [activeCoupon] = await tx
          .select({
            redemptionId: couponRedemptions.id,
            couponId: coupons.id,
            code: coupons.code,
            discountPercent: coupons.discountPercent,
            expiresAt: coupons.expiresAt,
            game: coupons.game,
            couponTournamentId: coupons.tournamentId,
            maxUses: coupons.maxUses,
            usedCount: coupons.usedCount,
          })
          .from(couponRedemptions)
          .innerJoin(coupons, eq(couponRedemptions.couponId, coupons.id))
          .where(and(eq(couponRedemptions.userId, linked.userId), eq(couponRedemptions.status, "active"), eq(coupons.isActive, true)))
          .orderBy(desc(couponRedemptions.createdAt))
          .limit(1);

        const couponValid = activeCoupon
          && (!activeCoupon.expiresAt || new Date(activeCoupon.expiresAt) > new Date())
          && (!activeCoupon.game || activeCoupon.game === tournament.game)
          && (!activeCoupon.couponTournamentId || activeCoupon.couponTournamentId === tournament.id)
          && (!activeCoupon.maxUses || activeCoupon.usedCount < activeCoupon.maxUses)
          && activeCoupon.discountPercent > 0;

        if (couponValid) {
          couponRedemptionId = activeCoupon.redemptionId;
          couponId = activeCoupon.couponId;
          discountRial = (entryFeeRial * BigInt(activeCoupon.discountPercent)) / BigInt(100);
          finalEntryFeeRial = entryFeeRial - discountRial;
          paymentText += `\n🎟 کوپن <code>${html(activeCoupon.code)}</code>: <b>${activeCoupon.discountPercent}% تخفیف</b>`;
        }

        const wallet = await getOrCreateWallet(linked.userId, tx);
        
        // ATOMIC UPDATE: Use WHERE balance >= finalEntryFeeRial to prevent over-spending
        const updateResult = await tx.update(wallets)
          .set({ 
            balance: sql`${wallets.balance} - ${finalEntryFeeRial.toString()}`, 
            updatedAt: new Date() 
          })
          .where(and(
            eq(wallets.id, wallet.id),
            sql`${wallets.balance} >= ${finalEntryFeeRial.toString()}`
          ));

        if (updateResult.rowCount === 0) {
          // Fetch actual balance only on failure to show the user
          const [currentWallet] = await tx.select().from(wallets).where(eq(wallets.id, wallet.id)).limit(1);
          const actualBalance = currentWallet ? bigIntFromText(currentWallet.balance) : BigInt(0);
          
          return { 
            ok: false as const, 
            code: "INSUFFICIENT", 
            balance: actualBalance, 
            finalEntryFeeRial 
          };
        }

        if (couponRedemptionId && couponId) {
          await tx.update(couponRedemptions).set({ status: "used", tournamentId: tournament.id, discountRial: discountRial.toString(), usedAt: new Date() }).where(eq(couponRedemptions.id, couponRedemptionId));
          await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, couponId));
        }
        await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: finalEntryFeeRial.toString(),
          type: "entry_fee",
          status: "completed",
          referenceId: `telegram-entry-${tournamentId}-${linked.userId}-${Date.now()}`,
          metadata: {
            kind: "telegram_entry_fee",
            tournamentId,
            tournamentName: tournament.name,
            playerId: player.id,
            playerName: player.displayName,
            userId: linked.userId,
            telegramId,
            originalEntryFeeRial: entryFeeRial.toString(),
            discountRial: discountRial.toString(),
            couponRedemptionId,
          },
        });
        paymentText += `\n💳 ورودی از کیف پول کسر شد: <b>${html(formatTomanFromRial(finalEntryFeeRial))}</b>`;
      }

    const [registration] = await tx.insert(registrations).values({
      tournamentId,
      playerId: player.id,
      visibleUserId: linked.userId,
      attendanceStatus: "registered",
      cancellationPolicyAcceptedAt: tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? new Date() : null,
    }).returning();
    return { ok: true as const, paymentText, registrationId: registration.id };
  });

  if (!result.ok) {
    if (result.code === "FULL") {
      if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
        return sendMessage(chatId, "ظرفیت این مسابقه چندنفره تکمیل شده است. طبق قانون این مود، جایگزینی پس از غیبت انجام نمی‌شود.");
      }
      return sendMessage(chatId, "ظرفیت این تورنومنت تکمیل شده است. می‌خواهی در لیست انتظار قرار بگیری؟", {
        inline_keyboard: [[{ text: "🕒 ورود به لیست انتظار", callback_data: `waitlist:${tournament.id}` }]],
      });
    }
    if (result.code === "DUPLICATE") {
      if (tournament.game === "clash_royale" && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel) {
        // The 1V1 product uses its own atomic queue, not registrations. Route
        // to the queue status flow instead of the dead legacy QR flow.
        return openClash1v1Queue(chatId, telegramId);
      }
      return sendMessage(chatId, "شما قبلاً در این تورنومنت ثبت‌نام کرده‌اید.", {
        inline_keyboard: [[{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
      });
    }
    if (result.code === "INSUFFICIENT") {
      return sendMessage(chatId, `موجودی کیف پول کافی نیست.\nمبلغ لازم: <b>${html(formatTomanFromRial(result.finalEntryFeeRial || entryFeeRial))}</b>\nموجودی شما: <b>${html(formatTomanFromRial(result.balance || BigInt(0)))}</b>`, {
        inline_keyboard: [
          // Instant top-up first: this is the exact moment the user is blocked,
          // so a receipt that waits on manual approval loses the registration.
          ...(getCryptoPaymentConfiguration().live
            ? [[{ text: "🏦 شارژ آنلاین (آنی)", callback_data: "wallet:online_deposit" }]]
            : []),
          [{ text: "شارژ کیف پول در وب‌اپ", url: `${APP_URL}/wallet` }],
          [{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }],
        ],
      });
    }
    return sendMessage(chatId, "ثبت‌نام انجام نشد.");
  }

  await evaluateUserAchievements(linked.userId).catch(() => undefined);
  const xpText = await rewardUserXP(linked.userId, isPaid ? 25 : 15, isPaid ? "ثبت‌نام پولی" : "ثبت‌نام تورنومنت");

  const needsClashQr = tournament.game === "clash_royale"
    && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel
    && isPaid;
  const qrLine = needsClashQr ? "\n\n⚔️ مرحله بعد: از Clash Royale روی «اشتراک‌گذاری پیوند» بزن و پیوند دوستی را برای بات بفرست." : "";
  await sendMessage(chatId, `✅ ثبت‌نام شما در تورنومنت انجام شد.

🏆 <b>${html(tournament.name)}</b>
🎮 ${html(gameLabel(tournament.game))}${result.paymentText}${xpText}${qrLine}`, {
    inline_keyboard: [
      ...(needsClashQr ? [[{ text: "⚔️ 1V1 کلش رویال", callback_data: `qr:${tournament.id}` }]] : []),
      [{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }],
    ],
  });

  if (needsClashQr) {
    // The 1V1 queue is owned by the atomic bot flow; route there instead of
    // the legacy registration-based QR submission.
    return openClash1v1Queue(chatId, telegramId);
  }
}

async function joinWaitlist(chatId: number, telegramId: string, tournamentId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای لیست انتظار، اول حساب را با /link وصل کن.");
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) return sendMessage(chatId, "تورنومنت پیدا نشد.");
  if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
    return sendMessage(chatId, "برای مسابقات چندنفره کلش جایگزینی پس از غیبت انجام نمی‌شود؛ لیست انتظار این مود غیرفعال است.");
  }
  const [existing] = await db
    .select({ id: tournamentWaitlist.id })
    .from(tournamentWaitlist)
    .where(and(eq(tournamentWaitlist.tournamentId, tournamentId), eq(tournamentWaitlist.userId, linked.userId), eq(tournamentWaitlist.status, "waiting")))
    .limit(1);
  if (!existing) {
    await db.insert(tournamentWaitlist).values({ tournamentId, userId: linked.userId, telegramId, status: "waiting" });
  }
  await sendMessage(chatId, `✅ شما در لیست انتظار <b>${html(tournament.name)}</b> قرار گرفتید. اگر ظرفیت آزاد شود اطلاع می‌دهیم.`);
}

async function notifyWaitlistSpot(tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament || tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) return;
  const [{ value }] = await db.select({ value: count() }).from(registrations).where(eq(registrations.tournamentId, tournamentId));
  if (value >= tournament.maxPlayers) return;
  const [waiting] = await db
    .select()
    .from(tournamentWaitlist)
    .where(and(eq(tournamentWaitlist.tournamentId, tournamentId), eq(tournamentWaitlist.status, "waiting")))
    .orderBy(tournamentWaitlist.createdAt)
    .limit(1);
  if (!waiting?.telegramId) return;
  await db.update(tournamentWaitlist).set({ status: "notified", notifiedAt: new Date() }).where(eq(tournamentWaitlist.id, waiting.id));
  await sendMessage(Number(waiting.telegramId), `🎟 یک ظرفیت در تورنومنت <b>${html(tournament.name)}</b> آزاد شد.`, {
    inline_keyboard: [[{ text: "ثبت‌نام سریع", callback_data: `join:${tournament.id}` }]],
  });
}

async function statusCommand(chatId: number, telegramId: string) {
  const [row] = await db
    .select()
    .from(telegramPreRegistrations)
    .where(eq(telegramPreRegistrations.telegramId, telegramId))
    .limit(1);

  if (!row) {
    await sendMessage(chatId, "هنوز پیش‌ثبت‌نامی برای شما ثبت نشده است.", mainMenuKeyboard());
    return;
  }

  await sendMessage(
    chatId,
    [
      "👤 <b>وضعیت پیش‌ثبت‌نام شما</b>",
      "",
      `نام: <b>${html(row.fullName)}</b>`,
      `بازی: <b>${html(gameLabel(row.game))}</b>`,
      `آیدی بازی: <b>${html(row.gamerTag)}</b>`,
      row.flexaId ? `Flexa ID: <code>${html(row.flexaId)}</code>` : "Flexa ID: ثبت نشده",
      `وضعیت پیگیری: <b>${html(row.status)}</b>`,
    ].join("\n"),
    mainMenuKeyboard()
  );
}

async function linkCommand(chatId: number, user: TelegramUser) {
  const telegramId = String(user.id);
  const [existing] = await db
    .select({
      telegramId: telegramAccounts.telegramId,
      telegramUsername: telegramAccounts.telegramUsername,
      linkedAt: telegramAccounts.linkedAt,
      displayName: users.displayName,
      flexaId: users.flexaId,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(telegramLinkCodes).values({
    telegramId,
    codeHash: linkCodeHash(code),
    telegramUsername: user.username || null,
    telegramFirstName: user.first_name || null,
    telegramLastName: user.last_name || null,
    expiresAt,
  });

  const alreadyLinked = existing?.flexaId
    ? `\n\nاکنون به حساب <b>${html(existing.displayName || "Flexa")}</b> با Flexa ID <code>${html(existing.flexaId)}</code> لینک هستی. اگر کد جدید را در حساب دیگری وارد کنی، اتصال منتقل می‌شود.`
    : "";

  await sendMessage(
    chatId,
    [
      "🔗 <b>اتصال حساب تلگرام به Flexa</b>",
      "",
      "کد زیر را داخل سایت Flexa، صفحه پروفایل، بخش «اتصال تلگرام» وارد کن:",
      "",
      `<code>${code}</code>`,
      "",
      "⏳ اعتبار کد: ۱۰ دقیقه",
      alreadyLinked,
      "",
      "اگر هنوز حساب Flexa نداری، اول ثبت‌نام کن و بعد همین کد را وارد کن.",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "👤 ورود به پروفایل و وارد کردن کد", url: `${APP_URL}/profile` }],
        [{ text: "🆕 ساخت حساب Flexa", url: `${APP_URL}/register` }],
      ],
    }
  );
}

async function profileCommand(chatId: number, telegramId: string) {
  const [linked] = await db
    .select({
      telegramUsername: telegramAccounts.telegramUsername,
      linkedAt: telegramAccounts.linkedAt,
      displayName: users.displayName,
      username: users.username,
      userFlexaId: users.flexaId,
      level: users.level,
      rankPoints: users.rankPoints,
      clashRoyaleUsername: users.clashRoyaleUsername,
      codMobileUsername: users.codMobileUsername,
      fortniteUsername: users.fortniteUsername,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);

  if (linked?.userFlexaId) {
    const lines = [
      "👤 <b>پروفایل Flexa شما</b>",
      "",
      "✅ حساب تلگرام به حساب وب‌اپ لینک شده است.",
      `نام: <b>${html(linked.displayName || "—")}</b>`,
      `Username: <b>${html(linked.username || "—")}</b>`,
      `Flexa ID: <code>${html(linked.userFlexaId)}</code>`,
      `Level: <b>${linked.level}</b> | RP: <b>${linked.rankPoints}</b>`,
      linked.codMobileUsername ? `COD: <b>${html(linked.codMobileUsername)}</b>` : "",
      linked.clashRoyaleUsername ? `Clash Royale: <b>${html(linked.clashRoyaleUsername)}</b>` : "",
      linked.fortniteUsername ? `Fortnite: <b>${html(linked.fortniteUsername)}</b>` : "",
      "",
      "برای انتقال اتصال به حساب دیگر، در آن حساب وب‌اپ کد جدید /link را وارد کن.",
    ].filter(Boolean).join("\n");

    await sendMessage(chatId, lines, {
      inline_keyboard: [
        [{ text: "👤 باز کردن پروفایل در وب‌اپ", url: `${APP_URL}/profile` }],
        [{ text: "🏟 روم‌های فعال", url: `${APP_URL}/tournaments` }],
      ],
    });
    return;
  }

  const [row] = await db
    .select({
      preFullName: telegramPreRegistrations.fullName,
      preGame: telegramPreRegistrations.game,
      preGamerTag: telegramPreRegistrations.gamerTag,
      preFlexaId: telegramPreRegistrations.flexaId,
      preStatus: telegramPreRegistrations.status,
      linkedUserId: telegramPreRegistrations.linkedUserId,
      displayName: users.displayName,
      username: users.username,
      userFlexaId: users.flexaId,
      level: users.level,
      rankPoints: users.rankPoints,
      clashRoyaleUsername: users.clashRoyaleUsername,
      codMobileUsername: users.codMobileUsername,
      fortniteUsername: users.fortniteUsername,
    })
    .from(telegramPreRegistrations)
    .leftJoin(users, eq(telegramPreRegistrations.linkedUserId, users.id))
    .where(eq(telegramPreRegistrations.telegramId, telegramId))
    .limit(1);

  if (!row) {
    await sendMessage(
      chatId,
      "هنوز حساب تلگرام شما در Flexa شناسایی نشده است. اول /register را بزن یا در وب‌اپ حساب بساز.",
      mainMenuKeyboard()
    );
    return;
  }

  const lines = [
    "👤 <b>پروفایل Flexa شما</b>",
    "",
    row.linkedUserId ? "✅ حساب تلگرام به حساب وب‌اپ لینک شده است." : "⚠️ حساب وب‌اپ هنوز کامل لینک نشده؛ با Flexa ID/شماره مشابه در سایت ثبت‌نام کن.",
    `نام: <b>${html(row.displayName || row.preFullName)}</b>`,
    `Username: <b>${html(row.username || "—")}</b>`,
    `Flexa ID: <code>${html(row.userFlexaId || row.preFlexaId || "—")}</code>`,
    row.linkedUserId ? `Level: <b>${row.level}</b> | RP: <b>${row.rankPoints}</b>` : "",
    "",
    `آخرین بازی ثبت‌شده: <b>${html(gameLabel(row.preGame))}</b>`,
    `آیدی بازی: <b>${html(row.preGamerTag)}</b>`,
    `وضعیت پیش‌ثبت‌نام: <b>${html(row.preStatus)}</b>`,
    row.codMobileUsername ? `COD: <b>${html(row.codMobileUsername)}</b>` : "",
    row.clashRoyaleUsername ? `Clash Royale: <b>${html(row.clashRoyaleUsername)}</b>` : "",
    row.fortniteUsername ? `Fortnite: <b>${html(row.fortniteUsername)}</b>` : "",
  ].filter(Boolean).join("\n");

  const keyboardRows: Array<Array<Record<string, string>>> = [
    [{ text: "👤 باز کردن پروفایل در وب‌اپ", url: `${APP_URL}/profile` }],
    [{ text: "🏟 روم‌های فعال", url: `${APP_URL}/tournaments` }],
  ];
  if (CHANNEL_URL) keyboardRows.push([{ text: "📣 کانال Flexa Games", url: CHANNEL_URL }]);
  await sendMessage(chatId, lines, { inline_keyboard: keyboardRows });
}

async function unregisterCommand(chatId: number, telegramId: string) {
  await db
    .update(telegramPreRegistrations)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(telegramPreRegistrations.telegramId, telegramId));
  await clearSession(telegramId);
  await sendMessage(chatId, "پیش‌ثبت‌نام تلگرامی شما لغو/آرشیو شد.", mainMenuKeyboard());
}

async function notifyAdminsOnPreRegistration(user: TelegramUser, data: SessionData, linkedUserId: string | null) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;

  const username = user.username ? `@${user.username}` : "—";
  const text = [
    "🆕 <b>پیش‌ثبت‌نام جدید Flexa</b>",
    "",
    registrationSummary(data),
    "",
    `Telegram: <code>${html(user.id)}</code> | ${html(username)}`,
    linkedUserId ? "✅ حساب وب‌اپ شناسایی/لینک شد" : "⚠️ حساب وب‌اپ هنوز لینک نشده",
  ].join("\n");

  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, {
      inline_keyboard: [[{ text: "مشاهده پنل ادمین", url: `${APP_URL}/admin` }]],
    });
  }
}


async function notifyAdminsOnSupportTicket(telegramUser: TelegramUser, userId: string, ticketId: string, subject: string, message: string) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;
  const username = telegramUser.username ? `@${telegramUser.username}` : "—";
  const text = [
    "🎧 <b>تیکت پشتیبانی جدید از تلگرام</b>",
    "",
    `موضوع: <b>${html(subject)}</b>`,
    `Telegram: <code>${html(telegramUser.id)}</code> | ${html(username)}`,
    `User ID: <code>${html(userId)}</code>`,
    "",
    `پیام: ${html(message.slice(0, 700))}`,
  ].join("\n");
  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, { inline_keyboard: [[{ text: "مشاهده تیکت", url: `${APP_URL}/admin/support?ticketId=${ticketId}` }]] });
  }
}

async function adminCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const [total] = await db.select({ value: count() }).from(telegramPreRegistrations);
  const [newItems] = await db.select({ value: count() }).from(telegramPreRegistrations).where(eq(telegramPreRegistrations.status, "new"));
  const [walletPending] = await db.select({ value: count() }).from(transactions).where(and(inArray(transactions.type, ["deposit", "withdrawal"]), eq(transactions.status, "pending")));
  const [openDisputes] = await db.select({ value: count() }).from(disputes).where(eq(disputes.status, "open"));
  const [pendingHonors] = await db.select({ value: count() }).from(honors).where(eq(honors.status, "pending"));
  const [openSupport] = await db.select({ value: count() }).from(tickets).where(eq(tickets.status, "open"));
  const [activeTournaments] = await db.select({ value: count() }).from(tournaments).where(inArray(tournaments.status, ["registration", "in_progress"]));

  await sendMessage(
    chatId,
    [
      "🛠 <b>داشبورد ادمین Flexa</b>",
      "",
      `تورنومنت‌های فعال: <b>${activeTournaments.value}</b>`,
      `کیف پول pending: <b>${walletPending.value}</b>`,
      `اعتراض‌های باز: <b>${openDisputes.value}</b>`,
      `تیکت‌های باز: <b>${openSupport.value}</b>`,
      `افتخارات pending: <b>${pendingHonors.value}</b>`,
      `پیش‌ثبت‌نام تلگرام: <b>${total.value}</b> | جدید: <b>${newItems.value}</b>`,
      "",
      "/players — آخرین پیش‌ثبت‌نام‌ها",
      "/pending_wallets — شارژ/برداشت‌های در انتظار",
      "/pending_disputes — اعتراض‌های باز",
      "/pending_support — تیکت‌های باز پشتیبانی",
      "/pending_honors — محتوای تالار افتخارات در انتظار",
      "/honor_stats — آمار بازدید و لایک خبرها",
      "/manage — مدیریت سریع تورنومنت‌ها",
      "/announce متن — ارسال اطلاعیه به کاربران ربات",
      "/post_latest — انتشار آخرین تورنومنت فعال در کانال",
      "/deep_links — لینک‌های آماده برای کانال/کمپین",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "💳 کیف پول‌ها", callback_data: "admin:wallets" }, { text: "🚨 اعتراض‌ها", callback_data: "admin:disputes" }],
        [{ text: "🎧 پشتیبانی", callback_data: "admin:support" }],
        [{ text: "🏛 افتخارات", callback_data: "admin:honors" }, { text: "📊 آمار خبرها", callback_data: "admin:honor_stats" }],
        [{ text: "🧩 تورنومنت‌ها", callback_data: "admin:tournaments" }],
        [{ text: "ورود به پنل ادمین", url: `${APP_URL}/admin` }],
      ],
    }
  );
}

async function pendingWalletsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      status: transactions.status,
      createdAt: transactions.createdAt,
      displayName: users.displayName,
      username: users.username,
      phoneNumber: users.phoneNumber,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .leftJoin(users, eq(wallets.userId, users.id))
    .where(and(inArray(transactions.type, ["deposit", "withdrawal"]), eq(transactions.status, "pending")))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "✅ درخواست pending کیف پول وجود ندارد.", { inline_keyboard: [[{ text: "پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
    return;
  }

  const text = [
    "💳 <b>درخواست‌های pending کیف پول</b>",
    "",
    ...rows.map((row, index) => {
      const type = row.type === "deposit" ? "شارژ" : "برداشت";
      return `${index + 1}) <b>${type}</b> — <b>${html(formatTomanFromRial(bigIntFromText(row.amount)))}</b>\n👤 ${html(row.displayName || "—")} ${row.username ? `(@${html(row.username)})` : ""}\n📞 ${html(row.phoneNumber || "—")} | ${new Date(row.createdAt).toLocaleString("fa-IR")}`;
    }),
  ].join("\n\n");

  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "بررسی در پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
}



async function pendingSupportCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db
    .select({ id: tickets.id, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt, displayName: users.displayName, username: users.username, phoneNumber: users.phoneNumber })
    .from(tickets)
    .leftJoin(users, eq(tickets.userId, users.id))
    .where(eq(tickets.status, "open"))
    .orderBy(desc(tickets.createdAt))
    .limit(10);

  if (!rows.length) return sendMessage(chatId, "✅ تیکت باز وجود ندارد.", { inline_keyboard: [[{ text: "پنل پشتیبانی", url: `${APP_URL}/admin/support` }]] });
  const text = [
    "🎧 <b>تیکت‌های باز پشتیبانی</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.subject)}</b>\n👤 ${html(row.displayName || row.username || "—")} | 📞 ${html(row.phoneNumber || "—")}\n⏱ ${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => [{ text: `مشاهده تیکت ${i + 1}`, url: `${APP_URL}/admin/support?ticketId=${row.id}` }]),
      [{ text: "پنل پشتیبانی", url: `${APP_URL}/admin/support` }],
    ],
  });
}

async function myTicketsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای مشاهده تیکت‌ها، اول حساب را با /link وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
  const rows = await db.select().from(tickets).where(eq(tickets.userId, linked.userId)).orderBy(desc(tickets.createdAt)).limit(8);
  if (!rows.length) return sendMessage(chatId, "هنوز تیکتی ثبت نکرده‌ای. برای ساخت تیکت /support را بزن.");
  await sendMessage(chatId, [
    "🎧 <b>تیکت‌های من</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.subject)}</b> — ${html(row.status || "open")}\n${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n"), { inline_keyboard: [[{ text: "مرکز پشتیبانی", url: `${APP_URL}/support` }]] });
}

async function pendingDisputesCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db
    .select({
      id: disputes.id,
      reason: disputes.reason,
      status: disputes.status,
      createdAt: disputes.createdAt,
      matchId: matches.id,
      round: matches.round,
      matchNumber: matches.matchNumber,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      playerName: players.displayName,
      playerUsername: players.username,
    })
    .from(disputes)
    .innerJoin(matches, eq(disputes.matchId, matches.id))
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .leftJoin(players, eq(disputes.raisedById, players.id))
    .where(eq(disputes.status, "open"))
    .orderBy(desc(disputes.createdAt))
    .limit(10);

  if (!rows.length) return sendMessage(chatId, "✅ اعتراض باز وجود ندارد.", { inline_keyboard: [[{ text: "پنل اعتراض‌ها", url: `${APP_URL}/admin/disputes` }]] });
  const text = [
    "🚨 <b>اعتراض‌های باز</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.tournamentName || "تورنومنت")}</b> | R${row.round}-${row.matchNumber}\n👤 ${html(row.playerName || row.playerUsername || "بازیکن")}\n📝 ${html(row.reason.slice(0, 160))}\n⏱ ${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => [{ text: `مشاهده اعتراض ${i + 1}`, url: `${APP_URL}/admin/disputes?matchId=${row.matchId}` }]),
      [{ text: "پنل اعتراض‌ها", url: `${APP_URL}/admin/disputes` }],
    ],
  });
}

async function honorStatsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");

  const topViews = await db
    .select({ title: honors.title, id: honors.id, count: sql<number>`count(${honorViews.id})::int` })
    .from(honorViews)
    .innerJoin(honors, eq(honorViews.honorId, honors.id))
    .where(eq(honors.status, "approved"))
    .groupBy(honors.id, honors.title)
    .orderBy(desc(sql`count(${honorViews.id})`))
    .limit(5);
  const topLikes = await db
    .select({ title: honors.title, id: honors.id, count: sql<number>`count(${honorLikes.id})::int` })
    .from(honorLikes)
    .innerJoin(honors, eq(honorLikes.honorId, honors.id))
    .where(eq(honors.status, "approved"))
    .groupBy(honors.id, honors.title)
    .orderBy(desc(sql`count(${honorLikes.id})`))
    .limit(5);

  const views = topViews.length ? topViews.map((row, i) => `${i + 1}) <b>${html(row.title)}</b> — ${Number(row.count).toLocaleString("fa-IR")} سین`).join("\n") : "داده‌ای ثبت نشده.";
  const likes = topLikes.length ? topLikes.map((row, i) => `${i + 1}) <b>${html(row.title)}</b> — ${Number(row.count).toLocaleString("fa-IR")} لایک`).join("\n") : "داده‌ای ثبت نشده.";
  await sendMessage(chatId, ["🏛 <b>آمار تالار افتخارات</b>", "", "👁 پربازدیدترین‌ها", views, "", "♥️ محبوب‌ترین‌ها", likes].join("\n"), {
    inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]],
  });
}

async function pendingHonorsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db.select().from(honors).where(eq(honors.status, "pending")).orderBy(desc(honors.createdAt)).limit(10);
  if (!rows.length) return sendMessage(chatId, "✅ محتوای pending تالار افتخارات وجود ندارد.", { inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]] });
  const text = [
    "🏛 <b>تالار افتخارات — در انتظار بررسی</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.title)}</b>\nنوع: <b>${html(row.type)}</b> | بازی: <b>${html(row.game || "عمومی")}</b>\n${html(row.description.slice(0, 180))}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => ([
        { text: `✅ تأیید ${i + 1}`, callback_data: `honor:approve:${row.id}` },
        { text: `❌ رد ${i + 1}`, callback_data: `honor:reject:${row.id}` },
      ])),
      [{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }],
    ],
  });
}

async function reviewHonorFromTelegram(chatId: number, telegramId: string, honorId: string, decision: "approve" | "reject") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const status = decision === "approve" ? "approved" : "rejected";
  const [updated] = await db.update(honors).set({ status, publishedAt: status === "approved" ? new Date() : null, updatedAt: new Date() }).where(eq(honors.id, honorId)).returning();
  if (!updated) return sendMessage(chatId, "محتوا پیدا نشد.");
  if (status === "approved") {
    await publishHonorToTelegramChannel({ id: updated.id, title: updated.title, description: updated.description, type: updated.type, game: updated.game, imageUrl: updated.imageUrl, highlight: updated.highlight }).catch(() => undefined);
  }
  await sendMessage(chatId, status === "approved" ? `✅ منتشر شد: <b>${html(updated.title)}</b>` : `❌ رد شد: <b>${html(updated.title)}</b>`, { inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]] });
}

async function playersCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const rows = await db
    .select({
      fullName: telegramPreRegistrations.fullName,
      game: telegramPreRegistrations.game,
      gamerTag: telegramPreRegistrations.gamerTag,
      flexaId: telegramPreRegistrations.flexaId,
      telegramUsername: telegramPreRegistrations.telegramUsername,
      status: telegramPreRegistrations.status,
      updatedAt: telegramPreRegistrations.updatedAt,
    })
    .from(telegramPreRegistrations)
    .orderBy(desc(telegramPreRegistrations.updatedAt))
    .limit(12);

  if (!rows.length) {
    await sendMessage(chatId, "هنوز پیش‌ثبت‌نامی ثبت نشده است.");
    return;
  }

  const text = [
    "👥 <b>آخرین پیش‌ثبت‌نام‌های تلگرام</b>",
    "",
    ...rows.map((row, index) => {
      const username = row.telegramUsername ? `@${row.telegramUsername}` : "—";
      return `${index + 1}) <b>${html(row.fullName)}</b> | ${html(gameLabel(row.game))}\n🏷 ${html(row.gamerTag)} | 🆔 ${html(row.flexaId || "—")} | ${html(username)} | ${html(row.status)}`;
    }),
  ].join("\n\n");

  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "پنل کامل", url: `${APP_URL}/admin` }]] });
}

async function announceCommand(chatId: number, telegramId: string, text: string, gameFilter?: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const message = text.trim();
  if (!message) {
    await sendMessage(chatId, "متن اطلاعیه را وارد کن. مثال:\n<code>/announce امشب روم کلش ساعت ۹ فعال است.</code>");
    return;
  }

  const normalizedGame = gameFilter ? normalizeGame(gameFilter) : "";
  const rows = await db
    .select({ telegramId: telegramPreRegistrations.telegramId, status: telegramPreRegistrations.status, game: telegramPreRegistrations.game })
    .from(telegramPreRegistrations)
    .orderBy(desc(telegramPreRegistrations.updatedAt))
    .limit(500);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "archived") {
      skipped += 1;
      continue;
    }
    if (normalizedGame && normalizeGame(row.game) !== normalizedGame) {
      skipped += 1;
      continue;
    }
    const numericId = Number(row.telegramId);
    if (!Number.isFinite(numericId)) {
      failed += 1;
      continue;
    }
    try {
      await sendMessage(numericId, `📢 <b>اطلاعیه Flexa</b>\n\n${html(message)}`, mainMenuKeyboard());
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  await sendMessage(chatId, `ارسال اطلاعیه تمام شد.\n✅ موفق: ${sent}\n⏭ ردشده: ${skipped}\n❌ ناموفق: ${failed}`);
}

async function postLatestTournamentCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const [latest] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.status, "registration"))
    .orderBy(desc(tournaments.createdAt))
    .limit(1);

  if (!latest) {
    await sendMessage(chatId, "تورنومنت فعالی برای انتشار در کانال پیدا نشد.");
    return;
  }

  const result = await publishTournamentToTelegramChannel(latest);
  if (result.ok) {
    await sendMessage(chatId, `✅ آخرین تورنومنت در کانال منتشر شد:\n<b>${html(latest.name)}</b>`);
  } else {
    await sendMessage(chatId, `❌ انتشار در کانال انجام نشد.\n${html(result.description || "خطای نامشخص")}`);
  }
}

async function myTournamentsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده تورنومنت‌های خودت، اول حساب را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const rows = await db
    .select({
      registrationId: registrations.id,
      checkedInAt: registrations.checkedInAt,
      tournamentId: tournaments.id,
      name: tournaments.name,
      game: tournaments.game,
      status: tournaments.status,
      entryFee: tournaments.entryFee,
      categoryLabel: tournaments.categoryLabel,
      startDate: tournaments.startDate,
      roomId: tournaments.roomId,
      roomVisibleAt: tournaments.roomVisibleAt,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(eq(registrations.visibleUserId, linked.userId))
    .orderBy(desc(registrations.registeredAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "هنوز در تورنومنتی ثبت‌نام نکرده‌ای.", {
      inline_keyboard: [[{ text: "🏟 مشاهده روم‌ها", callback_data: "menu:rooms" }]],
    });
    return;
  }

  const text = [
    "🎮 <b>تورنومنت‌های من</b>",
    "",
    ...rows.map((row, index) => `${index + 1}) <b>${html(row.name)}</b>\n🎮 ${html(gameLabel(row.game))} | وضعیت: <b>${html(row.status)}</b> | چک‌این: ${row.checkedInAt ? "✅" : "⬜"}`),
  ].join("\n\n");
  const keyboard = rows.flatMap((row) => {
    const result: Array<Array<Record<string, string>>> = [
      [{ text: `جزئیات: ${row.name.slice(0, 28)}`, url: `${APP_URL}/tournaments/${row.tournamentId}` }],
      [
        { text: "✅ چک‌این", callback_data: `checkin:${row.registrationId}` },
        { text: "🏟 لابی", callback_data: `mylobby:${row.tournamentId}` },
        { text: "لغو", callback_data: `cancelreg:${row.registrationId}` },
      ],
    ];
    if (row.game === "clash_royale" && row.categoryLabel === CLASH_1V1_CONFIG.categoryLabel && !isFreeEntryFee(row.entryFee)) {
      result.push([{ text: "⚔️ 1V1 کلش رویال", callback_data: `qr:${row.tournamentId}` }]);
    }
    return result;
  });
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function showMyLobby(chatId: number, telegramId: string, tournamentId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "حساب لینک نیست.");
  const [row] = await db
    .select({
      roomId: tournaments.roomId,
      roomPassword: tournaments.roomPassword,
      lobbyNotes: tournaments.lobbyNotes,
      roomVisibleAt: tournaments.roomVisibleAt,
      startDate: tournaments.startDate,
      categoryLabel: tournaments.categoryLabel,
      checkedInAt: registrations.checkedInAt,
      name: tournaments.name,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.visibleUserId, linked.userId), eq(tournaments.id, tournamentId)))
    .limit(1);
  if (!row) return sendMessage(chatId, "شما در این تورنومنت ثبت‌نام نکرده‌اید.");
  if (row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && !row.checkedInAt) {
    return sendMessage(chatId, "برای دریافت نام و رمز مسابقه خصوصی، ابتدا باید چک‌این کنی.");
  }
  const revealAt = row.roomVisibleAt
    ? new Date(row.roomVisibleAt).getTime()
    : row.startDate ? new Date(row.startDate).getTime() - 30 * 60 * 1000 : Number.POSITIVE_INFINITY;
  if (!row.roomId || Date.now() < revealAt) {
    return sendMessage(chatId, "اطلاعات ورود هنوز منتشر نشده است؛ حداکثر ۳۰ دقیقه قبل از شروع نمایش داده می‌شود.");
  }
  const roomLabel = row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? "نام/برچسب مسابقه" : "Room ID";
  await sendMessage(chatId, `🏟 <b>ورود به ${html(row.name)}</b>\n\n${roomLabel}: <code>${html(row.roomId)}</code>\nPassword: <code>${html(row.roomPassword || "بدون رمز")}</code>\n\n${html(row.lobbyNotes || "به‌موقع وارد شوید.")}`);
}

async function cancelRegistrationCommand(chatId: number, telegramId: string, registrationId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "حساب لینک نیست.");
  const [row] = await db
    .select({
      registrationId: registrations.id,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      status: tournaments.status,
      categoryLabel: tournaments.categoryLabel,
      startDate: tournaments.startDate,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.id, registrationId), eq(registrations.visibleUserId, linked.userId)))
    .limit(1);
  if (!row) return sendMessage(chatId, "ثبت‌نام پیدا نشد.");
  if (row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && privateCancellationKeepsEntryFee(row.startDate)) {
    await ensurePrivateTournamentAttendanceSchema();
    await db.update(registrations).set({ attendanceStatus: "no_show", noShowAt: new Date() }).where(eq(registrations.id, registrationId));
    await sendMessage(chatId, "⚠️ انصراف شما بعد از بازشدن چک‌این به‌عنوان No-show ثبت شد. طبق قانونی که هنگام پرداخت پذیرفتی، ورودی بازگردانده نمی‌شود و داخل استخر جایزه باقی می‌ماند.");
    return;
  }
  if (row.status === "in_progress" || row.status === "completed") return sendMessage(chatId, "بعد از شروع/پایان تورنومنت امکان لغو از ربات نیست.");

  const refundText = await db.transaction(async (tx) => {
    await tx.delete(registrations).where(eq(registrations.id, registrationId));
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
    if (!wallet) return "";
    const [entry] = await tx
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(sql`${transactions.type} = 'entry_fee' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'tournamentId' = ${row.tournamentId} AND ${transactions.metadata}->>'userId' = ${linked.userId}`)
      .limit(1);
    if (!entry) return "";
    const [existingRefund] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.referenceId, `telegram-cancel-refund-${entry.id}`)).limit(1);
    if (existingRefund) return "";
    const amount = bigIntFromText(entry.amount);
    if (amount <= BigInt(0)) return "";
        await tx.update(wallets).set({ balance: sql`${wallets.balance} + ${amount.toString()}`, updatedAt: new Date() }).where(eq(wallets.id, wallet.id));
    await tx.insert(transactions).values({
      walletId: wallet.id,
      amount: amount.toString(),
      type: "refund",
      status: "completed",
      referenceId: `telegram-cancel-refund-${entry.id}`,
      metadata: { kind: "telegram_cancel_refund", tournamentId: row.tournamentId, userId: linked.userId, originalTransactionId: entry.id },
    });
    return `\n💳 مبلغ ${html(formatTomanFromRial(amount))} به کیف پول برگشت.`;
  });

  await sendMessage(chatId, `✅ ثبت‌نام شما در <b>${html(row.tournamentName)}</b> لغو شد.${refundText}`);
  await notifyWaitlistSpot(row.tournamentId).catch(() => undefined);
}

async function walletCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده کیف پول، اول حساب تلگرامت را با /link به Flexa وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const wallet = await getOrCreateWallet(linked.userId);
  const balance = bigIntFromText(wallet.balance);
  const txRows = await db.select().from(transactions).where(eq(transactions.walletId, wallet.id)).orderBy(desc(transactions.createdAt)).limit(5);
  const recent = txRows.length
    ? txRows.map((tx) => `• ${html(tx.type)}: <b>${html(formatTomanFromRial(bigIntFromText(tx.amount)))}</b> — ${html(tx.status)}`).join("\n")
    : "هنوز تراکنشی ندارید.";
  // Online top-up is offered first when the gateway is live, since it credits
  // instantly; the manual receipt flow stays available either way.
  const onlineLive = getCryptoPaymentConfiguration().live;
  const walletButtons = [
    ...(onlineLive ? [[{ text: "🏦 شارژ آنلاین (آنی)", callback_data: "wallet:online_deposit" }]] : []),
    [{ text: "تراکنش‌ها", url: `${APP_URL}/wallet` }],
  ];
  await sendMessage(chatId, `💳 <b>کیف پول Flexa</b>\n\nموجودی: <b>${html(formatTomanFromRial(balance))}</b>\n\nآخرین تراکنش‌ها:\n${recent}`, {
    inline_keyboard: walletButtons,
  });
}

async function achievementsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده دستاوردها، اول حساب را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const progress = await achievementProgressForUser(linked.userId);
  type AchievementProgressItem = Awaited<ReturnType<typeof achievementProgressForUser>>[number];
  const unlocked = progress.filter((item: AchievementProgressItem) => item.unlocked).slice(0, 8);
  const locked = progress.filter((item: AchievementProgressItem) => !item.unlocked).slice(0, 5);
  const text = [
    "🏅 <b>دستاوردهای Flexa</b>",
    "",
    unlocked.length ? "✅ بازشده:" : "هنوز دستاوردی باز نشده.",
    ...unlocked.map((item: AchievementProgressItem) => `${item.icon} <b>${html(item.nameFA)}</b> — +${item.points} XP`),
    "",
    locked.length ? "⬜ بعدی‌ها:" : "",
    ...locked.map((item: AchievementProgressItem) => `${item.icon} ${html(item.nameFA)} — ${item.progress}/${item.requirement}`),
  ].filter(Boolean).join("\n");
  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "مشاهده در وب‌اپ", url: `${APP_URL}/achievements` }]] });
}

async function supportStartCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت تیکت پشتیبانی، اول حساب تلگرامت را با /link به Flexa وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  await setSession(telegramId, "support_subject", {});
  await sendMessage(chatId, "🎧 موضوع تیکت پشتیبانی را بنویس:", replyKeyboard([[CANCEL_TEXT]]));
}

async function userMatchRows(telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return { linked: null, rows: [] as Array<{ id: string; status: string; round: number; matchNumber: number; tournamentName: string | null; playerId: string | null }> };
  const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
  const playerIds = myPlayers.map((p) => p.id);
  if (!playerIds.length) return { linked, rows: [] };
  const rows = await db
    .select({
      id: matches.id,
      status: matches.status,
      round: matches.round,
      matchNumber: matches.matchNumber,
      tournamentName: tournaments.name,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(or(inArray(matches.player1Id, playerIds), inArray(matches.player2Id, playerIds)))
    .orderBy(desc(matches.createdAt))
    .limit(10);
  return { linked, rows: rows.map((row) => ({ ...row, playerId: playerIds.includes(row.player1Id || "") ? row.player1Id : row.player2Id })) };
}

interface MatchResultParticipantContext {
  id: string;
  userId: string | null;
  name: string | null;
  username: string | null;
  clashRoyaleTag: string | null;
}

async function loadMatchResultContext(matchId: string, client: any = db) {
  const [match] = await client
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      tournamentName: tournaments.name,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
      winnerId: matches.winnerId,
      status: matches.status,
      scheduledAt: matches.scheduledAt,
      evidence: matches.evidence,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match?.player1Id || !match.player2Id) return null;

  const participantRows = await client
    .select({
      id: players.id,
      userId: players.visibleUserId,
      name: players.displayName,
      username: players.username,
      clashRoyaleTag: users.clashRoyaleId,
    })
    .from(players)
    .leftJoin(users, eq(players.visibleUserId, users.id))
    .where(inArray(players.id, [match.player1Id, match.player2Id]));
  const byId = new Map<string, MatchResultParticipantContext>(
    (participantRows as MatchResultParticipantContext[]).map((player) => [player.id, player]),
  );
  const player1 = byId.get(match.player1Id);
  const player2 = byId.get(match.player2Id);
  if (!player1?.userId || !player2?.userId) return null;
  const [duelEntry] = await client
    .select({
      stakeMode: clash1v1Entries.stakeMode,
      gameMode: clash1v1Entries.gameMode,
      opponentType: clash1v1Entries.opponentType,
      prizeRial: clash1v1Entries.prizeRial,
    })
    .from(clash1v1Entries)
    .where(eq(clash1v1Entries.matchedMatchId, matchId))
    .limit(1);
  return {
    ...match,
    player1,
    player2,
    duel: duelEntry || { stakeMode: "paid", gameMode: "normal", opponentType: "random", prizeRial: "800000" },
  };
}

async function notifyResultAdmins(matchId: string, message: string, customKeyboard?: Record<string, unknown>) {
  const keyboard = customKeyboard || {
    inline_keyboard: [[
      { text: "⚖️ مشاهده ادعا و مدارک", callback_data: `judge:info:${matchId}` },
      { text: "🏆 بازیکن ۱ برنده", callback_data: `judge:p1:${matchId}` },
      { text: "🏆 بازیکن ۲ برنده", callback_data: `judge:p2:${matchId}` },
    ]],
  };
  const roleRecipients = await db
    .select({ telegramId: telegramAccounts.telegramId })
    .from(telegramAccounts)
    .innerJoin(users, eq(telegramAccounts.userId, users.id))
    .where(inArray(users.role, ["judge", "moderator", "admin", "super_admin"]));
  const recipients = new Set([
    ...getAdminIds(),
    ...roleRecipients.map((row) => row.telegramId).filter(Boolean),
  ]);
  await Promise.allSettled([...recipients].map((adminId) => {
    const chatId = Number(adminId);
    return Number.isFinite(chatId) ? sendMessage(chatId, message, keyboard) : Promise.resolve();
  }));
}

async function notifyFinalMatchResult(matchId: string, winnerId: string, prizePaid: boolean) {
  const context = await loadMatchResultContext(matchId);
  if (!context) return;
  const winner = context.player1.id === winnerId ? context.player1 : context.player2;
  const loser = winner === context.player1 ? context.player2 : context.player1;
  const prizeLine = context.duel.stakeMode === "free"
    ? "\n🆓 این رقابت رایگان بود و جایزه مالی ندارد."
    : prizePaid
      ? `\n💰 جایزه <b>${html(CLASH_1V1_CONFIG.prize1st)}</b> به کیف پول شما واریز شد.`
      : "\n💰 وضعیت جایزه در سوابق کیف پول قابل پیگیری است.";

  await Promise.allSettled([
    evaluateUserAchievements(winner.userId),
    evaluateUserAchievements(loser.userId),
    notifyLinkedUserOnTelegram(winner.userId, [
      "🏆 <b>نتیجه نهایی مسابقه</b>",
      `شما برنده مسابقه مقابل <b>${html(loser.name || loser.username || "حریف")}</b> شدی.${prizeLine}`,
    ].join("\n\n"), {
      inline_keyboard: [[{ text: "💳 مشاهده کیف پول", url: `${APP_URL}/wallet` }]],
    }),
    notifyLinkedUserOnTelegram(loser.userId, [
      "🎮 <b>نتیجه نهایی مسابقه</b>",
      `برنده مسابقه: <b>${html(winner.name || winner.username || "حریف")}</b>`,
      "برای مسابقه بعدی آماده باش 💪",
    ].join("\n\n"), {
      inline_keyboard: [[{ text: "⚔️ مسابقات من", callback_data: "menu:matches" }]],
    }),
  ]);
}

type ClashApiSettlementResult =
  | { state: "completed"; winnerId: string; prizePaid: boolean }
  | { state: "pending_api" }
  | { state: "missing_tags" }
  | { state: "api_error"; reason: string }
  | { state: "disputed"; reason: string }
  | { state: "no_consensus" };

/**
 * Reads the Clash Royale Battle Log and settles the match from it.
 *
 * Players no longer self-report. The Battle Log names the winner by crown
 * count, so asking "did you win?" only ever added a way to lie or to deadlock.
 * The dispute button is untouched: the API is authoritative about the score,
 * not about fairness.
 *
 * Idempotent -- pressing the button twice on a settled match returns the
 * existing result rather than paying twice.
 */
async function verifyMatchFromBattleLog(matchId: string): Promise<ClashApiSettlementResult> {
  const context = await loadMatchResultContext(matchId);
  if (!context) return { state: "no_consensus" };

  const apiConfig = getClashRoyaleApiConfiguration();
  const player1Tag = normalizeClashRoyaleTag(context.player1.clashRoyaleTag);
  const player2Tag = normalizeClashRoyaleTag(context.player2.clashRoyaleTag);

  if (!apiConfig.configured || !player1Tag || !player2Tag) {
    const verdict = decideClashVerdict({
      battle: null,
      player1Tag,
      player2Tag,
      apiConfigured: apiConfig.configured,
    });
    return verdict.state === "missing_tags"
      ? { state: "missing_tags" }
      : { state: "api_error", reason: verdict.reason || "not_configured" };
  }

  try {
    const battle = await verifyClashRoyaleHeadToHead({
      player1Tag,
      player2Tag,
      notBefore: new Date(new Date(context.scheduledAt || context.createdAt).getTime() - 30_000),
    });

    const expectedMode = context.duel.gameMode || "normal";
    const modeMatters = isClashDuelGameMode(expectedMode);
    const verdict = decideClashVerdict({
      battle: battle && {
        battleTime: battle.battleTime,
        winnerTag: battle.winnerTag,
        player1Tag: battle.player1Tag,
        player2Tag: battle.player2Tag,
        player1Crowns: battle.player1Crowns,
        player2Crowns: battle.player2Crowns,
      },
      player1Tag,
      player2Tag,
      apiConfigured: true,
      modeMatches: battle && modeMatters ? clashBattleMatchesExpectedMode(expectedMode, battle) : undefined,
    });

    if (verdict.state === "pending_api") return { state: "pending_api" };

    if (verdict.state === "mode_mismatch") {
      await db.update(matches).set({
        status: "disputed",
        evidence: {
          source: "clash_api_mode_mismatch",
          expectedGameMode: expectedMode,
          actualGameMode: battle?.gameMode ?? null,
          actualBattleType: battle?.battleType ?? null,
          actualDeckSelection: battle?.raw.deckSelection || null,
          battleTime: verdict.battleTime,
          responsiblePlayerId: context.player1.id,
          responsibleRole: "host",
          stakeMode: context.duel.stakeMode,
          action: "admin_penalty_required",
        },
      }).where(eq(matches.id, matchId));
      return { state: "disputed", reason: "api_mode_mismatch" };
    }

    if (verdict.state === "draw") {
      // Equal crowns. There is no winner to pay, and refunding automatically
      // would be a money decision made without a human, so it goes to judging.
      await db.update(matches).set({
        status: "disputed",
        evidence: {
          source: "clash_api_draw",
          battleTime: verdict.battleTime,
          player1Crowns: verdict.player1Crowns,
          player2Crowns: verdict.player2Crowns,
          stakeMode: context.duel.stakeMode,
        },
      }).where(eq(matches.id, matchId));
      return { state: "disputed", reason: "api_draw" };
    }

    const winnerId = verdict.winnerTag === player1Tag ? context.player1.id : context.player2.id;
    await ensureAffiliateSchema();
    const finalized = await db.transaction(async (tx) => finalizeMatchResult(tx, matchId, winnerId, { affiliateEligible: true }));
    if (!finalized.completed) return { state: "api_error", reason: finalized.reason };
    return {
      state: "completed",
      winnerId: finalized.winnerId,
      prizePaid: Boolean(finalized.prize?.paid),
    };
  } catch (error) {
    const reason = error instanceof ClashRoyaleApiError ? error.reason || error.message : "network_error";
    logger.warn({ error, matchId, reason }, "Clash API result verification failed");
    return { state: "api_error", reason };
  }
}

async function notifyApiVerificationPending(matchId: string, context: Awaited<ReturnType<typeof loadMatchResultContext>>) {
  if (!context) return;
  const text = "⏳ گزارش‌های دو طرف با هم موافق است، اما Battle Log هنوز در Clash Royale API دیده نشد. کمی بعد دوباره بررسی کن؛ تا زمان تأیید API جایزه پرداخت نمی‌شود.";
  const keyboard = { inline_keyboard: [[{ text: "🔄 بررسی دوباره نتیجه", callback_data: `result:verify:${matchId}` }]] };
  await Promise.allSettled([
    notifyLinkedUserOnTelegram(context.player1.userId, text, keyboard),
    notifyLinkedUserOnTelegram(context.player2.userId, text, keyboard),
  ]);
}

async function matchesCommand(chatId: number, telegramId: string) {
  const { linked, rows } = await userMatchRows(telegramId);
  if (!linked) {
    await sendMessage(chatId, "برای مشاهده مسابقات، اول حساب تلگرامت را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  if (!rows.length) {
    await sendMessage(chatId, "فعلاً مسابقه‌ای برای حساب شما پیدا نشد.", mainMenuKeyboard());
    return;
  }
  const keyboard = rows.slice(0, 6).flatMap((match, index) => [
    [{ text: `${index + 1}) ${match.tournamentName || "مسابقه"} | R${match.round}-${match.matchNumber}`, callback_data: `match:${match.id}` }],
  ]);
  await sendMessage(chatId, "⚔️ مسابقات اخیر شما؛ یکی را انتخاب کن:", { inline_keyboard: keyboard });
}

async function handleMatchAction(chatId: number, telegramId: string, matchId: string) {
  const { linked, rows } = await userMatchRows(telegramId);
  const match = rows.find((row) => row.id === matchId);
  if (!linked || !match) {
    await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
    return;
  }
  await sendMessage(chatId, `⚔️ <b>${html(match.tournamentName || "مسابقه")}</b>\nوضعیت: <b>${html(match.status)}</b>\n\nنتیجه یا عملیات را انتخاب کن:`, {
    inline_keyboard: [
      [{ text: "🔍 بررسی نتیجه", callback_data: `result:verify:${matchId}` }],
      [{ text: "📎 ارسال اسکرین‌شات", callback_data: `evidence:${matchId}` }],
      [{ text: "🚨 اعتراض دارم", callback_data: `dispute:${matchId}` }],
    ],
  });
}

/**
 * Records that a Battle Log lookup came back empty.
 *
 * The cron sweep (`verifyPendingClash1v1Results`) already re-checks every
 * in-progress 1V1 match on each cycle, so this does not need its own queue --
 * it stamps the match so the attempt count is visible in the admin evidence
 * view and in logs, and so a match that never resolves is findable.
 */
async function scheduleClashVerdictRetry(matchId: string) {
  try {
    const [row] = await db.select({ evidence: matches.evidence }).from(matches).where(eq(matches.id, matchId)).limit(1);
    const previous = row?.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
      ? row.evidence as Record<string, unknown>
      : {};
    const attempts = Number(previous.verificationAttempts || 0) + 1;
    await db.update(matches).set({
      evidence: {
        ...previous,
        source: "clash_api_awaiting_battle_log",
        verificationAttempts: attempts,
        lastVerificationAt: new Date().toISOString(),
      },
    }).where(eq(matches.id, matchId));
  } catch (error) {
    // Never let bookkeeping break the player's flow.
    logger.warn({ error, matchId }, "Recording Clash verification attempt failed");
  }
}

/**
 * The single result action a player has: ask the system to read the Battle Log.
 *
 * Replaces the old "✅ بردم / ❌ باختم" pair. Any participant can press it, at
 * any time, as often as they like -- the outcome depends on Supercell's data,
 * not on who pressed first, so there is nothing to race and nothing to game.
 */
async function verifyTelegramResult(chatId: number, telegramId: string, matchId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای بررسی نتیجه، ابتدا حساب تلگرام را به Flexa وصل کن.");
    return;
  }

  const context = await loadMatchResultContext(matchId);
  if (!context) {
    await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
    return;
  }
  const isParticipant = [context.player1.userId, context.player2.userId].includes(linked.userId);
  if (!isParticipant) {
    await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
    return;
  }
  if (context.status === "completed") {
    await sendMessage(chatId, "✅ نتیجه این مسابقه قبلاً نهایی شده است.");
    return;
  }
  if (context.status === "pending") {
    await sendMessage(chatId, "بررسی نتیجه هنوز فعال نیست. هر دو بازیکن باید ابتدا دکمه «آماده‌ام» را بزنند تا Match رسمی شروع شود.");
    return;
  }

  await sendMessage(chatId, "🔍 در حال بررسی Battle Log کلش رویال...");
  const settlement = await verifyMatchFromBattleLog(matchId);
  await announceClashSettlement(chatId, matchId, settlement, context);
}

/**
 * Turns a settlement into player and admin messages.
 *
 * Shared by the manual button and the automatic retry sweep so both report the
 * same thing; the retry path passes `chatId = null` because it has nobody to
 * reply to.
 */
async function announceClashSettlement(
  chatId: number | null,
  matchId: string,
  settlement: ClashApiSettlementResult,
  context: Awaited<ReturnType<typeof loadMatchResultContext>>,
) {
  if (settlement.state === "completed") {
    await notifyFinalMatchResult(matchId, settlement.winnerId, settlement.prizePaid);
    if (chatId) await sendMessage(chatId, clashVerdictMessage("decided"));
    return;
  }

  if (settlement.state === "disputed") {
    const isDraw = settlement.reason === "api_draw";
    const isMode = settlement.reason === "api_mode_mismatch";
    const playerText = isDraw
      ? clashVerdictMessage("draw")
      : isMode
        ? `🚨 مود بازی انجام‌شده با مود توافق‌شده «${html(clashDuelModeLabel(context?.duel.gameMode || "normal"))}» مطابقت ندارد و برای داوری ارسال شد.`
        : "🚨 نتیجه با Battle Log کلش رویال قابل تأیید نبود و برای داوری ارسال شد.";
    if (context) {
      await Promise.allSettled([
        notifyLinkedUserOnTelegram(context.player1.userId, playerText),
        notifyLinkedUserOnTelegram(context.player2.userId, playerText),
      ]);
    }
    const adminKeyboard = isMode ? {
      inline_keyboard: [
        [{ text: "⚠️ باخت فنی میزبان", callback_data: `judge:mode_forfeit:${matchId}` }],
        [{ text: "🔁 تکرار مسابقه", callback_data: `judge:mode_replay:${matchId}` }, { text: "💳 بازپرداخت", callback_data: `judge:mode_refund:${matchId}` }],
        [{ text: "⛔ تعلیق ۲۴ ساعته میزبان", callback_data: `judge:mode_suspend:${matchId}` }],
        [{ text: "⚖️ جزئیات و مدارک", callback_data: `judge:info:${matchId}` }],
      ],
    } : isDraw ? {
      inline_keyboard: [
        [{ text: "💳 بازپرداخت هر دو", callback_data: `judge:mode_refund:${matchId}` }],
        [{ text: "🔁 تکرار مسابقه", callback_data: `judge:mode_replay:${matchId}` }],
        [{ text: "⚖️ جزئیات و مدارک", callback_data: `judge:info:${matchId}` }],
      ],
    } : undefined;
    const heading = isDraw ? "🤝 <b>تساوی در Battle Log</b>" : "🚨 <b>اختلاف با Clash Royale API</b>";
    await notifyResultAdmins(
      matchId,
      `${heading}\nMatch: <code>${html(matchId.slice(0, 8))}</code>\nReason: <code>${html(settlement.reason)}</code>${isMode ? `\nمیزبان مسئول: <b>${html(context?.player1.name || context?.player1.username || "بازیکن ۱")}</b>` : ""}`,
      adminKeyboard,
    );
    if (chatId) await sendMessage(chatId, playerText);
    return;
  }

  if (settlement.state === "missing_tags") {
    const text = `⚠️ برای بررسی خودکار، هر دو بازیکن باید Player Tag تأییدشده داشته باشند. از پروفایل Flexa ثبتش کنید: ${html(`${APP_URL}/profile/edit`)}`;
    if (context) {
      await Promise.allSettled([
        notifyLinkedUserOnTelegram(context.player1.userId, text),
        notifyLinkedUserOnTelegram(context.player2.userId, text),
      ]);
    }
    if (chatId) await sendMessage(chatId, text);
    return;
  }

  // pending_api / api_error / no_consensus: the Battle Log may still appear, so
  // schedule automatic retries and leave a manual button for the impatient.
  await scheduleClashVerdictRetry(matchId);
  if (chatId) {
    await sendMessage(
      chatId,
      clashVerdictMessage(settlement.state === "api_error" ? "api_error" : "pending_api"),
      { inline_keyboard: [[{ text: "🔄 بررسی دوباره", callback_data: `result:verify:${matchId}` }]] },
    );
  }
}

async function startDispute(chatId: number, telegramId: string, matchId: string) {
  await setSession(telegramId, "dispute_reason", { disputeMatchId: matchId });
  await sendMessage(chatId, "🚨 دلیل اعتراض را بنویس. اگر مدرک داری، توضیح بده کجا قابل بررسی است:", replyKeyboard([[CANCEL_TEXT]]));
}

async function startEvidenceUpload(chatId: number, telegramId: string, matchId: string) {
  await setSession(telegramId, "evidence_upload", { evidenceMatchId: matchId });
  await sendMessage(chatId, "📎 لطفاً اسکرین‌شات نتیجه را به‌صورت عکس ارسال کن. کپشن اختیاری است.", replyKeyboard([[CANCEL_TEXT]]));
}

const COD_REPORT_CATEGORY_LABELS: Record<string, string> = {
  cheat: "چیت / هک",
  teaming: "تیم‌آپ",
  no_recording: "نداشتن رکورد",
  banned_item: "آیتم ممنوع",
  toxic_behavior: "رفتار/فحاشی",
  wrong_result: "نتیجه اشتباه",
  no_show: "No-show",
  other: "سایر",
};

const COD_EVIDENCE_KIND_LABELS: Record<string, string> = {
  profile: "پروفایل",
  scoreboard: "Scoreboard",
  recording: "رکورد بازیکن",
  lobby_recording: "رکورد Lobby",
  dispute: "مدرک اعتراض",
};

async function startCodEvidenceUpload(chatId: number, telegramId: string, roomId: string, kind: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای ارسال مدرک COD ابتدا حساب تلگرام را با /link به Flexa وصل کن.", {
    inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }], [{ text: "مشاهده روم", url: `${APP_URL}/cod-arena/${roomId}` }]],
  });
  await setSession(telegramId, "cod_evidence_upload", { codRoomId: roomId, codEvidenceKind: kind });
  await sendMessage(chatId, [
    "📎 <b>ارسال مدرک COD Arena</b>",
    "",
    `نوع مدرک: <b>${html(COD_EVIDENCE_KIND_LABELS[kind] || kind)}</b>`,
    "عکس، ویدیو یا فایل مدرک را همینجا ارسال کن. فایل داخل تلگرام می‌ماند و Flexa فقط شناسه فایل تلگرام را ذخیره می‌کند.",
    "کپشن اختیاری است.",
  ].join("\n"), replyKeyboard([[CANCEL_TEXT]]));
}

async function startCodReportUpload(chatId: number, telegramId: string, roomId: string, category: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای ثبت گزارش COD ابتدا حساب تلگرام را با /link به Flexa وصل کن.", {
    inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }], [{ text: "مشاهده روم", url: `${APP_URL}/cod-arena/${roomId}` }]],
  });
  await setSession(telegramId, "cod_report_upload", { codRoomId: roomId, codReportCategory: category });
  await sendMessage(chatId, [
    "🚨 <b>ثبت گزارش تخلف COD Arena</b>",
    "",
    `نوع گزارش: <b>${html(COD_REPORT_CATEGORY_LABELS[category] || category)}</b>`,
    "عکس/ویدیو/فایل مدرک را ارسال کن و در کپشن حداقل ۱۰ کاراکتر توضیح بده چه اتفاقی افتاده است.",
    "اگر مدرک نداری، فقط متن توضیح گزارش را ارسال کن.",
  ].join("\n"), replyKeyboard([[CANCEL_TEXT]]));
}

async function startCodLobbyCheck(chatId: number, telegramId: string, roomId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای بررسی لابی COD ابتدا حساب تلگرام را با /link به Flexa وصل کن.", {
    inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }], [{ text: "مشاهده روم", url: `${APP_URL}/cod-arena/${roomId}` }]],
  });
  await setSession(telegramId, "cod_lobby_check", { codRoomId: roomId });
  await sendMessage(chatId, [
    "🤖 <b>بررسی هوشمند Lobby COD Arena</b>",
    "",
    "Roomer/Spectator باید اسکرین‌شات واضح از لیست بازیکنان داخل لابی کالاف را به صورت <b>عکس</b> ارسال کند.",
    "AI نام‌های داخل لابی را استخراج و با لیست کاربران ثبت‌نام/پرداخت‌شده Flexa مقایسه می‌کند.",
    "اگر اسم غیرمجاز یا اکانت تکراری دیده شود، به ادمین هشدار داده می‌شود.",
    "",
    "اگر عکس واضح نداری، می‌توانی لیست نام‌ها را خط‌به‌خط به صورت متن ارسال کنی تا بررسی دستی/نیمه‌خودکار انجام شود.",
  ].join("\n"), replyKeyboard([[CANCEL_TEXT]]));
}

function telegramMediaReference(message: TelegramMessage) {
  const photos = message.photo || [];
  const bestPhoto = photos[photos.length - 1];
  if (bestPhoto) return {
    fileUrl: `telegram_file:${bestPhoto.file_id}`,
    fileType: "photo",
    fileId: bestPhoto.file_id,
    fileUniqueId: bestPhoto.file_unique_id,
    fileSize: bestPhoto.file_size || null,
  };
  if (message.video) return {
    fileUrl: `telegram_file:${message.video.file_id}`,
    fileType: "video",
    fileId: message.video.file_id,
    fileUniqueId: message.video.file_unique_id,
    fileSize: message.video.file_size || null,
    fileName: message.video.file_name || null,
    mimeType: message.video.mime_type || null,
    duration: message.video.duration || null,
  };
  if (message.document) return {
    fileUrl: `telegram_file:${message.document.file_id}`,
    fileType: "document",
    fileId: message.document.file_id,
    fileUniqueId: message.document.file_unique_id,
    fileSize: message.document.file_size || null,
    fileName: message.document.file_name || null,
    mimeType: message.document.mime_type || null,
  };
  return null;
}

async function notifyCodAdminsWithTelegramMedia(media: ReturnType<typeof telegramMediaReference>, caption: string, roomId: string) {
  if (!media) return;
  const keyboard = { inline_keyboard: [[{ text: "مشاهده روم در سایت", url: `${APP_URL}/cod-arena/${roomId}` }], [{ text: "پنل گزارش‌های COD", url: `${APP_URL}/admin/cod-reports` }]] };
  await Promise.allSettled(getAdminIds().map(async (adminId) => {
    const chatId = Number(adminId);
    if (!Number.isFinite(chatId)) return;
    if (media.fileType === "photo") return sendPhoto(chatId, media.fileId, caption, keyboard);
    if (media.fileType === "video") return telegramApi("sendVideo", { chat_id: chatId, video: media.fileId, caption, parse_mode: "HTML", reply_markup: keyboard });
    return telegramApi("sendDocument", { chat_id: chatId, document: media.fileId, caption, parse_mode: "HTML", reply_markup: keyboard });
  }));
}

async function affiliateCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای همکاری رسانه‌ای ابتدا حساب را با /link به Flexa وصل کن.", {
    inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
  });
  const dashboard = await getMediaPartnerDashboard(linked.userId);
  if (!dashboard.partner) return sendMessage(chatId, [
    "📣 <b>همکاری رسانه‌ای با Flexa</b>",
    "",
    "اگر کانال، گروه یا رسانه فعال داری، می‌توانی برای هر Match پولی واجد شرایط از استخر کمیسیون ۷ هزار USDTی سهم بگیری.",
    "درخواست، احراز هویت و قرارداد OTPشده فقط داخل سایت انجام می‌شوند.",
  ].join("\n"), { inline_keyboard: [[{ text: "📝 ثبت درخواست همکاری", url: `${APP_URL}/media-partners` }]] });
  const partner = dashboard.partner;
  if (partner.partnerType === "personal") return sendMessage(chatId, "حساب شما در طرح معرفی کاربران فعال است؛ آمار و لینک را از بخش درآمد معرفی ببین.", {
    inline_keyboard: [[{ text: "🎁 داشبورد معرفی", url: `${APP_URL}/referrals` }], [{ text: "📤 نمایش لینک در بات", callback_data: "mission:invite" }]],
  });
  const totals = dashboard.stats?.totals || {};
  const available = formatTomanFromRial(BigInt(totals.available || "0"));
  const pending = formatTomanFromRial(BigInt(totals.pending || "0"));
  const rows: Array<Array<Record<string, string>>> = [[{ text: "📊 داشبورد کامل", url: `${APP_URL}/media-partners` }]];
  if (partner.status === "active") rows.unshift([{ text: "📤 اشتراک لینک اختصاصی", url: `https://t.me/share/url?url=${encodeURIComponent(affiliatePublicLink(partner.referralCode))}` }]);
  await sendMessage(chatId, [
    "📣 <b>داشبورد رسانه Flexa</b>",
    `رسانه: <b>${html(partner.mediaName)}</b>`,
    `وضعیت: <b>${html(partner.status)}</b>`,
    partner.status === "active" ? `کد معرفی: <code>${html(partner.referralCode)}</code>` : "",
    "",
    `کلیک‌ها: <b>${Number(dashboard.stats?.clicks || 0).toLocaleString("fa-IR")}</b>`,
    `Matchهای واجد: <b>${Number(dashboard.stats?.qualifiedMatches || 0).toLocaleString("fa-IR")}</b>`,
    `در انتظار: <b>${html(pending)}</b>`,
    `قابل برداشت: <b>${html(available)}</b>`,
  ].filter(Boolean).join("\n"), { inline_keyboard: rows });
}

async function connectMediaGroupCommand(chatId: number, chatTitle: string | undefined, telegramId: string, referralCode: string) {
  const normalized = normalizeAffiliateCode(referralCode);
  if (!normalized) return sendMessage(chatId, "کد رسانه را وارد کن: <code>/connect_media CODE</code>");
  const admins = await telegramApi<Array<{ user?: { id?: number } }>>("getChatAdministrators", { chat_id: chatId });
  const isAdmin = Boolean(admins.ok && admins.result?.some((item) => String(item.user?.id || "") === telegramId));
  if (!isAdmin) return sendMessage(chatId, "فقط مدیر همین گروه می‌تواند رسانه را به Flexa متصل کند.");
  const result = await connectTelegramMediaGroup({ referralCode: normalized, telegramUserId: telegramId, chatId: String(chatId), title: chatTitle || null });
  if (!result.connected) return sendMessage(chatId, result.reason === "group_already_connected"
    ? "این گروه قبلاً به رسانه دیگری متصل شده است؛ انتقال فقط پس از بررسی ادمین Flexa انجام می‌شود."
    : "کد رسانه فعال و متعلق به حساب شما پیدا نشد.");
  return sendMessage(chatId, `✅ گروه <b>${html(chatTitle || String(chatId))}</b> به رسانه <b>${html(result.partner.mediaName)}</b> متصل شد. از این پس لینک‌های Flexa در این گروه با کد همین رسانه ساخته می‌شوند.`);
}

async function inviteCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای دریافت لینک معرفی درآمدزا، ابتدا حساب را با /link به Flexa وصل کن.", {
    inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
  });
  const dashboard = await getMediaPartnerDashboard(linked.userId);
  if (!dashboard.partner) return sendMessage(chatId, [
    "🎁 <b>درآمد از معرفی کاربران</b>",
    "",
    "با فعال‌سازی رایگان، یک لینک اختصاصی می‌گیری. برای هر Match پولی واجد شرایط در مجموع ۷ هزار USDT کمیسیون ثبت می‌شود.",
    "انتساب ۳۰ روز است و دو معرف متفاوت هرکدام ۳,۵۰۰ USDT می‌گیرند.",
  ].join("\n"), { inline_keyboard: [[{ text: "🚀 فعال‌سازی طرح معرفی", url: `${APP_URL}/referrals` }]] });
  const partner = dashboard.partner;
  if (partner.status !== "active") return sendMessage(chatId, "برای فعال‌شدن لینک، شرایط طرح معرفی را با OTP داخل سایت تأیید کن.", {
    inline_keyboard: [[{ text: "📜 تکمیل شرایط و OTP", url: `${APP_URL}/${partner.partnerType === "media" ? "media-partners" : "referrals"}` }]],
  });
  const link = affiliatePublicLink(partner.referralCode);
  const pending = BigInt(dashboard.stats?.totals.pending || "0");
  const shadow = BigInt(dashboard.stats?.totals.shadow || "0");
  const available = BigInt(dashboard.stats?.totals.available || "0");
  await sendMessage(chatId, [
    "🎁 <b>لینک معرفی اختصاصی شما</b>",
    "",
    `<code>${html(link)}</code>`,
    "",
    `کل افراد معرفی‌شده: <b>${Number(dashboard.stats?.totalReferrals || 0).toLocaleString("fa-IR")}</b>`,
    `انتساب‌های فعال: <b>${Number(dashboard.stats?.activeAttributions || 0).toLocaleString("fa-IR")}</b>`,
    `Matchهای پولی واجد: <b>${Number(dashboard.stats?.qualifiedMatches || 0).toLocaleString("fa-IR")}</b>`,
    `در انتظار ۷۲ساعته: <b>${html(formatTomanFromRial(pending))}</b>`,
    `قابل برداشت: <b>${html(formatTomanFromRial(available))}</b>`,
    shadow > BigInt(0) ? `محاسبات آزمایشی قدیمی: <b>${html(formatTomanFromRial(shadow))}</b>` : "",
  ].filter(Boolean).join("\n"), {
    inline_keyboard: [
      [{ text: "📤 اشتراک‌گذاری", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("با لینک من وارد Flexa شو و در رقابت‌های گیمینگ شرکت کن!")}` }],
      [{ text: "📊 داشبورد معرفی", url: `${APP_URL}/${partner.partnerType === "media" ? "media-partners" : "referrals"}` }],
    ],
  });
}


type ClashPairParticipant = {
  registrationId: string;
  playerId: string;
  userId: string;
  playerName: string | null;
  playerUsername: string | null;
  playerGameId: string | null;
  telegramId: string;
  inviteLink: string | null;
  clashRoyaleId: string | null;
  clashRoyaleUsername: string | null;
};

type CreatedClashPair = {
  matchId: string;
  matchNumber: number;
  tournamentId: string;
  tournamentName: string;
  tournamentStartDate: Date | null;
  player1: ClashPairParticipant;
  player2: ClashPairParticipant;
};

function clashParticipantDisplayName(player: ClashPairParticipant) {
  return player.playerName || player.playerUsername || player.clashRoyaleUsername || "Flexa Player";
}

function clashParticipantTag(player: ClashPairParticipant) {
  return player.clashRoyaleId || player.playerGameId || player.clashRoyaleUsername || "ثبت نشده";
}

function clashQrPromptText(tournamentName: string, existing = false) {
  return [
    `⚔️ <b>${existing ? "به‌روزرسانی" : "شروع"} 1V1 کلش رویال</b>`,
    "",
    `تورنومنت: <b>${html(tournamentName)}</b>`,
    "",
    "1) در Clash Royale وارد <b>اجتماعی (Social)</b> شو.",
    "2) روی <b>افزودن دوست (+)</b> بزن.",
    "3) زیر QR روی <b>اشتراک‌گذاری پیوند</b> بزن.",
    "4) پیوند را برای همین بات Share کن یا اینجا Paste کن.",
    "",
    "پیوند باید با این آدرس شروع شود:",
    "<code>https://link.clashroyale.com/invite/friend/...</code>",
    "⚠️ عکس QR پذیرفته نمی‌شود.",
  ].join("\n");
}

async function startClashQrSubmission(chatId: number, telegramId: string, tournamentId?: string, registrationId?: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای شروع 1V1 کلش رویال، اول حساب تلگرام را با /link به Flexa وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }

  const conditions = [
    eq(registrations.visibleUserId, linked.userId),
    eq(tournaments.game, "clash_royale"),
    eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel),
    inArray(tournaments.status, ["registration", "in_progress"]),
  ];
  if (tournamentId) conditions.push(eq(tournaments.id, tournamentId));
  if (registrationId) conditions.push(eq(registrations.id, registrationId));

  const rows = await db
    .select({
      registrationId: registrations.id,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      entryFee: tournaments.entryFee,
      submittedAt: registrations.gameInviteSubmittedAt,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(...conditions))
    .orderBy(desc(registrations.registeredAt))
    .limit(8);

  const eligible = rows.filter((row) => !isFreeEntryFee(row.entryFee));
  if (!eligible.length) {
    // The 1V1 product is a single atomic queue managed by the bot itself; it
    // does not require a separate `registrations` row. Route to the real queue
    // flow which handles payment + QR + matchmaking instead of a dead end.
    return openClash1v1Queue(chatId, telegramId);
  }

  if (!tournamentId && !registrationId && eligible.length > 1) {
    await sendMessage(chatId, "برای کدام تورنومنت، 1V1 کلش رویال را شروع می‌کنی؟", {
      inline_keyboard: eligible.map((row) => [{ text: `${row.submittedAt ? "🔁" : "📲"} ${row.tournamentName.slice(0, 42)}`, callback_data: `qr:${row.tournamentId}` }]),
    });
    return;
  }

  const row = eligible[0];
  await setSession(telegramId, "clash_qr_submission", {
    qrTournamentId: row.tournamentId,
    qrRegistrationId: row.registrationId,
  });
  await sendMessage(chatId, clashQrPromptText(row.tournamentName, Boolean(row.submittedAt)), replyKeyboard([[CANCEL_TEXT]]));
  await sendClashFriendLinkGuide(chatId);
}

async function tryAutoPairClashTournament(tournamentId: string): Promise<CreatedClashPair[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`);

    const [tournament] = await tx
      .select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, status: tournaments.status, startDate: tournaments.startDate })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (!tournament || tournament.game !== "clash_royale" || !["registration", "in_progress"].includes(tournament.status)) {
      return [];
    }

    const existingMatches = await tx
      .select({ player1Id: matches.player1Id, player2Id: matches.player2Id })
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));

    const busyPlayerIds = new Set<string>();
    for (const match of existingMatches) {
      if (match.player1Id) busyPlayerIds.add(match.player1Id);
      if (match.player2Id) busyPlayerIds.add(match.player2Id);
    }

    const queued = await tx
      .select({
        registrationId: registrations.id,
        playerId: registrations.playerId,
        userId: registrations.visibleUserId,
        inviteLink: registrations.gameInviteLink,
        playerName: players.displayName,
        playerUsername: players.username,
        playerGameId: players.gameId,
        telegramId: telegramAccounts.telegramId,
        clashRoyaleId: users.clashRoyaleId,
        clashRoyaleUsername: users.clashRoyaleUsername,
        submittedAt: registrations.gameInviteSubmittedAt,
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
      .leftJoin(users, eq(registrations.visibleUserId, users.id))
      .where(and(
        eq(registrations.tournamentId, tournamentId),
        sql`${registrations.gameInviteSubmittedAt} IS NOT NULL`,
        sql`${registrations.gameInviteLink} IS NOT NULL`
      ))
      .orderBy(registrations.gameInviteSubmittedAt, registrations.registeredAt);

    const eligible = queued
      .filter((row) => row.playerId && !busyPlayerIds.has(row.playerId) && isSupportedClashInvite(row.inviteLink))
      .map((row) => ({
        registrationId: row.registrationId,
        playerId: row.playerId,
        userId: row.userId,
        playerName: row.playerName,
        playerUsername: row.playerUsername,
        playerGameId: row.playerGameId,
        telegramId: row.telegramId,
        inviteLink: row.inviteLink,
        clashRoyaleId: row.clashRoyaleId,
        clashRoyaleUsername: row.clashRoyaleUsername,
      } satisfies ClashPairParticipant));

    if (eligible.length < 2) return [];

    const [{ value: existingMatchCount }] = await tx.select({ value: count() }).from(matches).where(eq(matches.tournamentId, tournamentId));
    let nextMatchNumber = Number(existingMatchCount || 0) + 1;
    const createdPairs: CreatedClashPair[] = [];

    while (eligible.length >= 2) {
      const player1 = eligible.shift()!;
      const player2 = eligible.shift()!;
      const [match] = await tx
        .insert(matches)
        .values({
          tournamentId,
          round: 1,
          matchNumber: nextMatchNumber,
          player1Id: player1.playerId,
          player2Id: player2.playerId,
          status: "pending",
          scheduledAt: tournament.startDate || null,
        })
        .returning({ id: matches.id, matchNumber: matches.matchNumber });

      createdPairs.push({
        matchId: match.id,
        matchNumber: match.matchNumber,
        tournamentId,
        tournamentName: tournament.name,
        tournamentStartDate: tournament.startDate,
        player1,
        player2,
      });
      nextMatchNumber += 1;
      busyPlayerIds.add(player1.playerId);
      busyPlayerIds.add(player2.playerId);
    }

    return createdPairs;
  });
}

async function notifyClashPairSide(pair: CreatedClashPair, me: ClashPairParticipant, opponent: ClashPairParticipant) {
  const chatId = Number(me.telegramId);
  if (!Number.isFinite(chatId)) return;
  const opponentLink = opponent.inviteLink;
  const startLine = pair.tournamentStartDate
    ? `⏰ زمان پیشنهادی/شروع: <b>${html(new Date(pair.tournamentStartDate).toLocaleString("fa-IR"))}</b>`
    : "";

  const lines = [
    "⚔️ <b>حریف 1V1 کلش رویال شما پیدا شد</b>",
    "",
    `🏆 تورنومنت: <b>${html(pair.tournamentName)}</b>`,
    `⚔️ مسابقه: <b>#${pair.matchNumber}</b>`,
    startLine,
    "",
    `👤 حریف: <b>${html(clashParticipantDisplayName(opponent))}</b>`,
    `🏷 Player Tag / ID: <code>${html(clashParticipantTag(opponent))}</code>`,
    opponent.clashRoyaleUsername ? `👑 Username: <b>${html(opponent.clashRoyaleUsername)}</b>` : "",
    `🔗 پیوند دوستی حریف: <code>${html(opponentLink || "ثبت نشده")}</code>`,
    "",
    "قدم بعدی:",
    "1) دکمه «باز کردن پیوند دوستی حریف» را بزن.",
    "2) او را Add Friend کن و Friendly Battle را شروع کنید.",
    "3) بعد از بازی نتیجه را با /matches ثبت کن.",
  ].filter(Boolean).join("\n");

  const keyboard: Array<Array<Record<string, string>>> = [];
  if (isSupportedClashInvite(opponentLink)) keyboard.push([{ text: "🔗 باز کردن پیوند دوستی حریف", url: opponentLink! }]);
  keyboard.push([
    { text: "⚔️ ثبت نتیجه", callback_data: `match:${pair.matchId}` },
    { text: "🏆 تورنومنت", url: `${APP_URL}/tournaments/${pair.tournamentId}` },
  ]);

  await sendMessage(chatId, lines, { inline_keyboard: keyboard });
}

async function notifyClashPairs(pairs: CreatedClashPair[]) {
  for (const pair of pairs) {
    await notifyClashPairSide(pair, pair.player1, pair.player2).catch((err) => logger.warn({ err, matchId: pair.matchId }, "Failed to notify Clash pair player1"));
    await notifyClashPairSide(pair, pair.player2, pair.player1).catch((err) => logger.warn({ err, matchId: pair.matchId }, "Failed to notify Clash pair player2"));
  }
}

function missionsKeyboard(status: { channelMember: boolean; linked: boolean; preReg: boolean; invites: number }) {
  const rows: Array<Array<Record<string, string>>> = [];
  if (status.channelMember) rows.push([{ text: "🎁 دریافت پاداش عضویت کانال", callback_data: "mission:claim:channel" }]);
  if (status.linked) rows.push([{ text: "🎁 دریافت پاداش اتصال حساب", callback_data: "mission:claim:link" }]);
  if (status.preReg) rows.push([{ text: "🎁 دریافت پاداش پیش‌ثبت‌نام", callback_data: "mission:claim:prereg" }]);
  if (status.invites > 0) rows.push([{ text: "🎁 دریافت پاداش دعوت", callback_data: "mission:claim:invite" }]);
  rows.push([{ text: "🔗 لینک دعوت من", callback_data: "mission:invite" }, { text: "اتصال حساب", callback_data: "menu:link" }]);
  return { inline_keyboard: rows };
}

async function getMissionStatus(telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  const [preReg] = await db.select({ id: telegramPreRegistrations.id }).from(telegramPreRegistrations).where(eq(telegramPreRegistrations.telegramId, telegramId)).limit(1);
  const [{ value: legacyInvites }] = await db.select({ value: count() }).from(telegramReferrals).where(eq(telegramReferrals.referrerTelegramId, telegramId));
  const referralDashboard = linked?.userId ? await getMediaPartnerDashboard(linked.userId).catch(() => null) : null;
  const invites = Math.max(Number(legacyInvites || 0), Number(referralDashboard?.stats?.activeAttributions || 0));
  const channelMember = await isChannelMember(telegramId);
  return { linked, preReg: Boolean(preReg), invites, channelMember };
}

async function missionsCommand(chatId: number, telegramId: string) {
  const status = await getMissionStatus(telegramId);
  await sendMessage(chatId, [
    "🎯 <b>مأموریت‌های رشد Flexa</b>",
    "",
    `${status.channelMember ? "✅" : "⬜"} عضویت در کانال Flexa Games — <b>10 XP</b>`,
    `${status.linked ? "✅" : "⬜"} اتصال حساب با /link — <b>30 XP</b>`,
    `${status.preReg ? "✅" : "⬜"} پیش‌ثبت‌نام در ربات — <b>20 XP</b>`,
    `${status.invites > 0 ? "✅" : "⬜"} دعوت حداقل یک نفر با /invite — <b>50 XP</b>`,
    "",
    "اگر مأموریت انجام شده باشد، دکمه دریافت پاداش را بزن. هر پاداش فقط یک‌بار قابل دریافت است.",
  ].join("\n"), missionsKeyboard({ channelMember: status.channelMember, linked: Boolean(status.linked), preReg: status.preReg, invites: status.invites }));
}

async function claimMissionReward(chatId: number, telegramId: string, mission: string) {
  const status = await getMissionStatus(telegramId);
  if (!status.linked?.userId) {
    await sendMessage(chatId, "برای دریافت پاداش XP، اول حساب تلگرام را با /link به Flexa وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
    return;
  }

  const missions: Record<string, { ok: boolean; xp: number; title: string }> = {
    channel: { ok: status.channelMember, xp: 10, title: "عضویت در کانال" },
    link: { ok: Boolean(status.linked), xp: 30, title: "اتصال حساب" },
    prereg: { ok: status.preReg, xp: 20, title: "پیش‌ثبت‌نام" },
    invite: { ok: status.invites > 0, xp: 50, title: "دعوت دوست" },
  };
  const item = missions[mission];
  if (!item) return sendMessage(chatId, "این مأموریت معتبر نیست.");
  if (!item.ok) return sendMessage(chatId, "این مأموریت هنوز کامل نشده است. /missions را ببین.");

  const key = `mission:${mission}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) return sendMessage(chatId, `✅ پاداش مأموریت «${html(item.title)}» قبلاً دریافت شده است.`);

  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "mission_reward" });
  const xpText = await rewardUserXP(status.linked.userId, item.xp, item.title);
  await sendMessage(chatId, `🎁 <b>پاداش مأموریت دریافت شد</b>\n\n${html(item.title)}${xpText}`);
}


async function sendLobbyToRegisteredUsers(chatId: number, tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد.");
    return;
  }
  if (!tournament.roomId) {
    await sendMessage(chatId, "برای این تورنومنت هنوز Room ID ثبت نشده است.");
    return;
  }
  const recipients = await db
    .select({ telegramId: telegramAccounts.telegramId })
    .from(registrations)
    .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
    .where(and(
      eq(registrations.tournamentId, tournamentId),
      ...(tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? [sql`${registrations.checkedInAt} IS NOT NULL`] : []),
    ));
  let sent = 0;
  for (const row of recipients) {
    await sendMessage(Number(row.telegramId), `🏟 <b>اطلاعات ورود آماده شد</b>\n\n🏆 ${html(tournament.name)}\n${tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? "نام/برچسب مسابقه" : "Room ID"}: <code>${html(tournament.roomId)}</code>\nPassword: <code>${html(tournament.roomPassword || "بدون رمز")}</code>\n\n${html(tournament.lobbyNotes || "لطفاً به‌موقع وارد شوید.")}`);
    sent += 1;
  }
  await sendMessage(chatId, `✅ اطلاعات لابی برای ${sent} نفر ارسال شد.`);
}

async function checkInCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای چک‌این، اول حساب را با /link وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
    return;
  }
  const rows = await db
    .select({ id: registrations.id, checkedInAt: registrations.checkedInAt, tournamentId: tournaments.id, name: tournaments.name, status: tournaments.status })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.visibleUserId, linked.userId), inArray(tournaments.status, ["registration", "in_progress"])))
    .orderBy(desc(registrations.registeredAt))
    .limit(8);
  if (!rows.length) {
    await sendMessage(chatId, "ثبت‌نام فعالی برای چک‌این پیدا نشد.");
    return;
  }
  await sendMessage(chatId, "✅ برای کدام تورنومنت حضور داری؟", {
    inline_keyboard: rows.map((row) => [{ text: `${row.checkedInAt ? "✅" : "⬜"} ${row.name.slice(0, 35)}`, callback_data: `checkin:${row.id}` }]),
  });
}

async function handleCheckIn(chatId: number, telegramId: string, registrationId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "حساب شما لینک نیست.");
    return;
  }
  const [row] = await db
    .select({
      id: registrations.id,
      tournamentId: tournaments.id,
      checkedInAt: registrations.checkedInAt,
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      categoryLabel: tournaments.categoryLabel,
      startDate: tournaments.startDate,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.id, registrationId), eq(registrations.visibleUserId, linked.userId)))
    .limit(1);
  if (!row) {
    await sendMessage(chatId, "این ثبت‌نام برای شما پیدا نشد.");
    return;
  }
  if (row.checkedInAt) {
    await sendMessage(chatId, `✅ چک‌این شما برای <b>${html(row.tournamentName)}</b> قبلاً ثبت شده است.`);
    return;
  }
  if (row.tournamentStatus === "completed" || row.tournamentStatus === "cancelled") {
    await sendMessage(chatId, "چک‌این این تورنومنت بسته شده است.");
    return;
  }
  if (row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
    if (!row.startDate) {
      await sendMessage(chatId, "زمان شروع این مسابقه هنوز مشخص نشده و چک‌این باز نیست.");
      return;
    }
    const now = Date.now();
    const start = new Date(row.startDate).getTime();
    const opensAt = start - 30 * 60 * 1000;
    const closesAt = start + 15 * 60 * 1000;
    if (now < opensAt) {
      await sendMessage(chatId, `چک‌این ۳۰ دقیقه قبل از شروع باز می‌شود.\nزمان شروع: <b>${html(new Date(row.startDate).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }))}</b>`);
      return;
    }
    if (now > closesAt) {
      await sendMessage(chatId, "مهلت چک‌این این مسابقه تمام شده است.");
      return;
    }
  }
  await ensurePrivateTournamentAttendanceSchema();
  await db.update(registrations).set({ checkedInAt: new Date(), attendanceStatus: "checked_in", noShowAt: null }).where(eq(registrations.id, registrationId));
  await sendMessage(chatId, `✅ حضور شما برای تورنومنت <b>${html(row.tournamentName)}</b> ثبت شد.`, {
    inline_keyboard: [[{ text: "🏟 دریافت نام/رمز مسابقه", callback_data: `mylobby:${row.tournamentId}` }]],
  });
}

async function adminTournamentsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt)).limit(8);
  if (!rows.length) {
    await sendMessage(chatId, "تورنومنتی پیدا نشد.");
    return;
  }
  const keyboard = rows.flatMap((tournament, index) => [
    [{ text: `${index + 1}) ${tournament.name.slice(0, 28)} | ${tournament.status}`, callback_data: `adm:info:${tournament.id}` }],
    [
      { text: "📣 کانال", callback_data: `adm:post:${tournament.id}` },
      { text: "🏟 لابی", callback_data: `adm:lobby:${tournament.id}` },
      { text: "▶️ شروع", callback_data: `adm:start:${tournament.id}` },
      { text: "⛔ بستن", callback_data: `adm:close:${tournament.id}` },
    ],
  ]);
  await sendMessage(chatId, "🧩 مدیریت سریع تورنومنت‌ها:", { inline_keyboard: keyboard });
}

async function handleAdminTournamentAction(chatId: number, telegramId: string, action: string, tournamentId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد.");
    return;
  }
  if (action === "post") {
    const result = await publishTournamentToTelegramChannel(tournament);
    await sendMessage(chatId, result.ok ? "✅ در کانال منتشر شد." : `❌ انتشار انجام نشد: ${html(result.description || "خطا")}`);
    return;
  }
  if (action === "lobby") return sendLobbyToRegisteredUsers(chatId, tournamentId);
  if (action === "start") {
    if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
      if (!tournament.roomId || !tournament.roomPassword) {
        await sendMessage(chatId, "قبل از شروع، نام/برچسب مسابقه خصوصی و Password را در پنل تورنومنت ثبت کن.");
        return;
      }
      const [checked] = await db.select({ value: count() }).from(registrations)
        .where(and(eq(registrations.tournamentId, tournamentId), sql`${registrations.checkedInAt} IS NOT NULL`));
      if (Number(checked?.value || 0) < 2) {
        await sendMessage(chatId, "برای شروع حداقل دو بازیکن باید چک‌این کرده باشند.");
        return;
      }
    }
    await db.update(tournaments).set({ status: "in_progress", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
    await sendMessage(chatId, "▶️ وضعیت تورنومنت به in_progress تغییر کرد.");
    if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
      await sendLobbyToRegisteredUsers(chatId, tournamentId);
    }
    return;
  }
  if (action === "close") {
    await db.update(tournaments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
    await sendMessage(chatId, "⛔ تورنومنت لغو/بسته شد.");
    return;
  }
  await sendMessage(chatId, `🏆 <b>${html(tournament.name)}</b>\n🎮 ${html(gameLabel(tournament.game))}\nوضعیت: <b>${html(tournament.status)}</b>\nورودی: <b>${html(tournament.entryFee || "رایگان")}</b>`, {
    inline_keyboard: [[{ text: "مشاهده در سایت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
  });
}

async function leaderboardCommand(chatId: number) {
  const rows = await db
    .select({ displayName: users.displayName, username: users.username, flexaId: users.flexaId, rankPoints: users.rankPoints, level: users.level })
    .from(users)
    .orderBy(desc(users.rankPoints))
    .limit(10);
  const text = [
    "🏆 <b>لیدربورد Flexa</b>",
    "",
    ...rows.map((row, index) => `${index + 1}) <b>${html(row.displayName || row.username)}</b> — RP <b>${row.rankPoints}</b> | Lv ${row.level}\n<code>${html(row.flexaId)}</code>`),
  ].join("\n\n");
  await sendMessage(chatId, text);
}

async function dailyCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای دریافت جایزه روزانه، اول /link را انجام بده.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const key = `daily:${today}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) return sendMessage(chatId, "🎁 جایزه روزانه امروز را قبلاً گرفتی. فردا دوباره بیا!");
  const xp = crypto.randomInt(15, 76);
  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "daily" });
  const xpText = await rewardUserXP(linked.userId, xp, "جایزه روزانه");
  await sendMessage(chatId, `🎁 <b>جایزه روزانه Flexa</b>\n\nامروز گرفتی:${xpText}`);
}

const QUIZ_QUESTIONS = [
  {
    question: "برای شرکت معتبر در تورنومنت، مهم‌ترین مورد چیست؟",
    options: ["آیدی بازی صحیح", "چند اکانت همزمان", "ارسال نتیجه جعلی"],
    correct: 0,
    explain: "آیدی بازی باید با پروفایل Flexa و روز مسابقه یکی باشد.",
  },
  {
    question: "اگر نتیجه مسابقه مورد اختلاف باشد، بهترین کار چیست؟",
    options: ["ثبت اعتراض با مدرک", "دعوا در چت", "خروج از تورنومنت"],
    correct: 0,
    explain: "اعتراض همراه با اسکرین‌شات/مدرک مسیر درست داوری است.",
  },
  {
    question: "برای شارژ کیف پول، فیلترشکن باید روشن باشد یا خاموش؟",
    options: ["خاموش", "روشن", "فرقی ندارد"],
    correct: 0,
    explain: "درگاه‌های بانکی ایران با آی‌پی خارج از کشور کار نمی‌کنند؛ با VPN روشن پرداخت ناموفق می‌شود.",
  },
  {
    question: "استفاده از چیت یا ابزار غیرمجاز چه نتیجه‌ای دارد؟",
    options: ["حذف/بن طبق قوانین", "امتیاز اضافه", "برد خودکار"],
    correct: 0,
    explain: "Flexa روی بازی جوانمردانه و داوری معتبر حساس است.",
  },
];

function todayTehranKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}

function dailyQuizIndex() {
  const today = todayTehranKey();
  let hash = 0;
  for (const ch of today) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % QUIZ_QUESTIONS.length;
}

async function quizCommand(chatId: number, telegramId?: string) {
  const today = todayTehranKey();
  const questionIndex = dailyQuizIndex();
  const q = QUIZ_QUESTIONS[questionIndex];
  const alreadyAnswered = telegramId
    ? await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, `quiz:${today}:${telegramId}`)).limit(1)
    : [];

  await sendMessage(chatId, [
    "🧠 <b>کوییز روزانه Flexa</b>",
    "",
    q.question,
    "",
    alreadyAnswered.length ? "✅ امروز قبلاً امتیاز کوییز را گرفته‌ای؛ باز هم می‌توانی جواب را ببینی." : "جواب درست، XP روزانه می‌دهد.",
  ].join("\n"), {
    inline_keyboard: q.options.map((option, index) => ([{ text: option, callback_data: `quiz:ans:${questionIndex}:${index}` }])),
  });
}

async function handleQuizAnswer(chatId: number, telegramId: string, questionIndex: number, answerIndex: number) {
  const q = QUIZ_QUESTIONS[questionIndex] || QUIZ_QUESTIONS[dailyQuizIndex()];
  const correct = answerIndex === q.correct;
  if (!correct) {
    await sendMessage(chatId, `❌ جواب درست نبود.\n\n✅ پاسخ صحیح: <b>${html(q.options[q.correct])}</b>\n${html(q.explain)}`);
    return;
  }

  const linked = await getLinkedUserByTelegram(telegramId);
  const today = todayTehranKey();
  const key = `quiz:${today}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) {
    await sendMessage(chatId, `✅ درست بود!\n\nامتیاز امروز را قبلاً گرفته‌ای.\n${html(q.explain)}`);
    return;
  }

  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "quiz" });
  const xpText = linked?.userId ? await rewardUserXP(linked.userId, 20, "کوییز روزانه") : "\nبرای دریافت XP، حساب را با /link وصل کن.";
  await sendMessage(chatId, `✅ درست بود!\n${html(q.explain)}${xpText || ""}`);
}

async function healthCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const started = Date.now();
  let dbStatus = "OK";
  try { await db.select({ value: count() }).from(users); } catch { dbStatus = "ERROR"; }
  const webhook = await telegramApi("getWebhookInfo", {});
  const ms = Date.now() - started;
  await sendMessage(chatId, `🩺 <b>Health Flexa</b>\n\nDB: <b>${dbStatus}</b>\nTelegram Webhook: <b>${webhook?.ok ? "OK" : "ERROR"}</b>\nAI Keys: <b>${process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY ? "Configured" : "Local fallback"}</b>\nLatency: <b>${ms}ms</b>`);
}

async function versionCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const appVersion = process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || process.env.npm_package_version || "unknown";
  const [{ value: waitingQr }] = await db.select({ value: count() }).from(clash1v1Entries).where(eq(clash1v1Entries.status, "waiting_qr"));
  const [{ value: queued }] = await db.select({ value: count() }).from(clash1v1Entries).where(eq(clash1v1Entries.status, "queued"));
  const [{ value: matched }] = await db.select({ value: count() }).from(clash1v1Entries).where(eq(clash1v1Entries.status, "matched"));
  const [queue] = await db.select({ id: tournaments.id, status: tournaments.status, entryFee: tournaments.entryFee, prize1st: tournaments.prize1st, updatedAt: tournaments.updatedAt })
    .from(tournaments)
    .where(and(eq(tournaments.game, CLASH_1V1_CONFIG.game), eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel)))
    .orderBy(desc(tournaments.createdAt))
    .limit(1);
  await sendMessage(chatId, [
    "🩺 <b>وضعیت 1V1 کلش رویال</b>",
    "",
    `🔖 نسخه دیپلوی: <code>${html(String(appVersion).slice(0, 12))}</code>`,
    `🏟 صف سیستمی: ${queue ? `✅ فعال (${html(queue.status)})` : "❌ پیدا نشد"}`,
    queue ? `💳 ورودی: <b>${html(queue.entryFee || "-")}</b> | 🏆 جایزه: <b>${html(queue.prize1st || "-")}</b>` : "",
    "",
    `⏳ منتظر QR: <b>${waitingQr}</b>`,
    `🧍 داخل صف: <b>${queued}</b>`,
    `⚔️ مچ شده: <b>${matched}</b>`,
  ].filter(Boolean).join("\n"), {
    inline_keyboard: [[{ text: "🔄 اجرای مچ‌میکینگ دستی", callback_data: "admin:clash1v1_matchmaking" }]],
  });
}

async function exportTelegramCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db.select().from(telegramPreRegistrations).orderBy(desc(telegramPreRegistrations.updatedAt)).limit(1000);
  const headers = ["telegramId", "username", "fullName", "phone", "flexaId", "game", "platform", "gamerTag", "status", "createdAt"];
  const csv = [headers.join(","), ...rows.map((r) => [r.telegramId, r.telegramUsername || "", r.fullName, r.phoneNumber, r.flexaId || "", r.game, r.platform || "", r.gamerTag, r.status, r.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  await sendDocument(chatId, "\ufeff" + csv, `telegram_registrations_${Date.now()}.csv`, "خروجی پیش‌ثبت‌نام‌های تلگرام");
}

async function couponCommand(chatId: number, telegramId: string, code: string) {
  const value = code.trim().toUpperCase();
  if (!value) return sendMessage(chatId, "کد تخفیف را بعد از دستور وارد کن. مثال: <code>/coupon GAMENT50</code>");
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای استفاده از کوپن، اول حساب را با /link وصل کن.");

  const [coupon] = await db.select().from(coupons).where(eq(coupons.code, value)).limit(1);
  if (!coupon || !coupon.isActive || (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())) {
    return sendMessage(chatId, "این کد معتبر نیست یا منقضی شده است.");
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return sendMessage(chatId, "ظرفیت استفاده از این کد تمام شده است.");

  await db.insert(couponRedemptions).values({
    couponId: coupon.id,
    userId: linked.userId,
    telegramId,
    status: "active",
  });
  const xpText = await rewardUserXP(linked.userId, 10, `کد ${value}`);
  await sendMessage(chatId, `🎟 کد <code>${html(value)}</code> فعال شد.\nتخفیف: <b>${coupon.discountPercent}%</b>\nدر ثبت‌نام پولی بعدی از تلگرام اعمال می‌شود.${xpText}`);
}

async function pollCommand(chatId: number, telegramId: string, question: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const q = question.trim() || "تورنومنت بعدی کدام بازی باشد؟";
  await telegramApi("sendPoll", {
    chat_id: getTelegramChannelChatId(),
    question: q,
    options: ["COD Mobile", "Clash Royale", "Fortnite"],
    is_anonymous: false,
  });
  await sendMessage(chatId, "✅ نظرسنجی در کانال ارسال شد.");
}

async function shopCommand(chatId: number) {
  await sendMessage(chatId, "🛒 فروشگاه Flexa\n\nفعلاً خرید از داخل وب‌اپ انجام می‌شود. آیتم‌های پیشنهادی: بلیت تورنومنت، Badge، بسته XP و آیتم‌های ویژه.", {
    inline_keyboard: [[{ text: "باز کردن فروشگاه/کیف پول", url: `${APP_URL}/wallet` }]],
  });
}

async function judgeCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!hasAdminAccess(telegramId) && !["judge", "moderator", "admin", "super_admin"].includes(String(linked?.role || ""))) {
    return sendMessage(chatId, "شما دسترسی داوری ندارید.");
  }
  const rows = await db
    .select({ id: matches.id, status: matches.status, tournamentName: tournaments.name, round: matches.round, matchNumber: matches.matchNumber })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(inArray(matches.status, ["awaiting_judgment", "disputed"]))
    .orderBy(desc(matches.createdAt))
    .limit(10);
  if (!rows.length) return sendMessage(chatId, "مسابقه‌ای در صف داوری نیست.");
  await sendMessage(chatId, "⚖️ صف داوری:", {
    inline_keyboard: rows.flatMap((m, i) => [
      [{ text: `${i + 1}) ${m.tournamentName || "Match"} | ${m.status}`, callback_data: `judge:info:${m.id}` }],
      [{ text: "🏆 بازیکن ۱", callback_data: `judge:p1:${m.id}` }, { text: "🏆 بازیکن ۲", callback_data: `judge:p2:${m.id}` }],
      [{ text: "✅ تأیید نتیجه موافق", callback_data: `judge:approve:${m.id}` }, { text: "🚨 بررسی بیشتر", callback_data: `judge:review:${m.id}` }],
    ]),
  });
}

/** Human-readable summary of what the Clash API said, for the judging panel. */
function clashEvidenceLines(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return ["منبع: <code>—</code>"];
  const data = evidence as Record<string, unknown>;
  const lines = [`منبع: <code>${html(String(data.source || "—"))}</code>`];
  if (data.player1Crowns != null || data.player2Crowns != null) {
    lines.push(`تاج‌ها: <b>${html(String(data.player1Crowns ?? "?"))}</b> - <b>${html(String(data.player2Crowns ?? "?"))}</b>`);
  }
  if (data.battleTime) lines.push(`زمان بازی: <code>${html(String(data.battleTime))}</code>`);
  if (data.expectedGameMode) lines.push(`مود انتظاری: <code>${html(String(data.expectedGameMode))}</code> / واقعی: <code>${html(String(data.actualGameMode ?? "?"))}</code>`);
  if (data.verificationAttempts) lines.push(`تلاش بررسی: <b>${html(String(data.verificationAttempts))}</b>`);
  return lines;
}

async function handleJudgeAction(chatId: number, telegramId: string, action: string, matchId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!hasAdminAccess(telegramId) && !["judge", "moderator", "admin", "super_admin"].includes(String(linked?.role || ""))) {
    return sendMessage(chatId, "شما دسترسی داوری ندارید.");
  }
  await ensureClash1v1Schema();
  const context = await loadMatchResultContext(matchId);
  if (!context) return sendMessage(chatId, "مسابقه پیدا نشد.");


  if (action === "mode_replay") {
    await db.transaction(async (tx) => {
      await tx.update(matches).set({ status: "pending", scheduledAt: null, evidence: { source: "admin_mode_replay", previousEvidence: context.evidence || null } }).where(eq(matches.id, matchId));
      await tx.delete(matchResultClaims).where(eq(matchResultClaims.matchId, matchId));
      await tx.update(clash1v1Entries).set({ readyAt: null, updatedAt: new Date() }).where(eq(clash1v1Entries.matchedMatchId, matchId));
    });
    const text = `🔁 ادمین دستور تکرار مسابقه با مود صحیح «${html(clashDuelModeLabel(context.duel.gameMode || "normal"))}» را صادر کرد.`;
    await Promise.allSettled([
      notifyLinkedUserOnTelegram(context.player1.userId, text, { inline_keyboard: [[{ text: "🎮 شروع دوباره", callback_data: "clash1v1:status" }]] }),
      notifyLinkedUserOnTelegram(context.player2.userId, text, { inline_keyboard: [[{ text: "🎮 شروع دوباره", callback_data: "clash1v1:status" }]] }),
    ]);
    return sendMessage(chatId, "✅ Match برای تکرار با مود صحیح بازنشانی شد.");
  }

  if (action === "mode_refund") {
    const refunded = await db.transaction((tx) => refundClash1v1Match(tx, matchId, "wrong_game_mode_admin_resolution"));
    if (!refunded.refunded) return sendMessage(chatId, `بازپرداخت انجام نشد: <code>${html(refunded.reason)}</code>`);
    await Promise.allSettled([
      notifyLinkedUserOnTelegram(context.player1.userId, "💳 مسابقه به‌دلیل اختلاف مود توسط ادمین لغو و ورودی بازپرداخت شد."),
      notifyLinkedUserOnTelegram(context.player2.userId, "💳 مسابقه به‌دلیل اختلاف مود توسط ادمین لغو و ورودی بازپرداخت شد."),
    ]);
    return sendMessage(chatId, `✅ بازپرداخت انجام شد؛ تعداد بازیکنان: <b>${refunded.refundedPlayers}</b>.`);
  }

  if (action === "mode_suspend") {
    const [hostAccount] = await db.select({ telegramId: telegramAccounts.telegramId }).from(telegramAccounts)
      .where(eq(telegramAccounts.userId, context.player1.userId)).limit(1);
    if (!hostAccount?.telegramId) return sendMessage(chatId, "حساب تلگرام میزبان برای ثبت تعلیق پیدا نشد.");
    const until = await suspendClash1v1Telegram(hostAccount.telegramId, matchId);
    await notifyLinkedUserOnTelegram(context.player1.userId, `⛔ به‌دلیل انتخاب مود اشتباه، دسترسی شما به 1V1 تا <b>${html(until?.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) || "۲۴ ساعت آینده")}</b> تعلیق شد.`);
    return sendMessage(chatId, "✅ تعلیق ۲۴ ساعته میزبان ثبت شد. پرونده نتیجه همچنان برای تصمیم نهایی باز است.");
  }

  if (action === "info") {
    const evidenceRows = await db
      .select()
      .from(matchEvidence)
      .where(eq(matchEvidence.matchId, matchId))
      .orderBy(desc(matchEvidence.createdAt));
    await sendMessage(chatId, [
      "⚖️ <b>جزئیات داوری مسابقه</b>",
      `Match: <code>${html(matchId)}</code>`,
      `وضعیت: <b>${html(context.status)}</b>`,
      "",
      `1) ${html(context.player1.name || context.player1.username || "بازیکن ۱")}`,
      `2) ${html(context.player2.name || context.player2.username || "بازیکن ۲")}`,
      "",
      // Players no longer self-report, so the useful evidence is what the
      // Battle Log said and why it could not settle on its own.
      ...clashEvidenceLines(context.evidence),
      `مدارک آپلودشده: <b>${evidenceRows.length.toLocaleString("fa-IR")}</b>`,
    ].join("\n"), {
      inline_keyboard: [[
        { text: "🏆 بازیکن ۱ برنده", callback_data: `judge:p1:${matchId}` },
        { text: "🏆 بازیکن ۲ برنده", callback_data: `judge:p2:${matchId}` },
      ], [{ text: "🚨 بررسی بیشتر", callback_data: `judge:review:${matchId}` }]],
    });

    for (const evidence of evidenceRows.slice(0, 10)) {
      const caption = `📎 مدرک مسابقه ${html(matchId.slice(0, 8))}\n${html(evidence.description || "بدون توضیح")}`;
      if (evidence.fileUrl.startsWith("telegram_file:")) {
        await sendPhoto(chatId, evidence.fileUrl.replace("telegram_file:", ""), caption).catch(() => undefined);
      } else {
        await sendMessage(chatId, `${caption}\n${html(evidence.fileUrl)}`).catch(() => undefined);
      }
    }
    return;
  }

  if (action === "review") {
    await db.update(matches).set({ status: "disputed" }).where(eq(matches.id, matchId));
    return sendMessage(chatId, "🚨 مسابقه برای بررسی بیشتر علامت‌گذاری شد.");
  }

  let winnerId: string | null = null;
  if (action === "p1") winnerId = context.player1.id;
  if (action === "p2") winnerId = context.player2.id;
  if (action === "mode_forfeit") winnerId = context.player2.id;
  if (action === "approve") {
    // Players no longer self-report, so "approve" means "ask the Battle Log
    // again" -- useful when the match was disputed before Supercell published
    // it. Anything the API cannot decide still needs an explicit p1/p2 call.
    const settlement = await verifyMatchFromBattleLog(matchId);
    if (settlement.state === "completed") {
      await notifyFinalMatchResult(matchId, settlement.winnerId, settlement.prizePaid);
      return sendMessage(chatId, "✅ Battle Log نتیجه را تأیید کرد و جایزه نهایی شد.");
    }
    return sendMessage(chatId, `Battle Log نتیجه قطعی نداد (<code>${html(settlement.state)}</code>). برنده را صریحاً انتخاب کن: «بازیکن ۱» یا «بازیکن ۲».`);
  }
  if (!winnerId) return sendMessage(chatId, "عملیات داوری نامعتبر است.");

  const finalized = await db.transaction(async (tx) => finalizeMatchResult(tx, matchId, winnerId!));
  if (!finalized.completed) return sendMessage(chatId, `تکمیل مسابقه انجام نشد: <code>${html(finalized.reason)}</code>`);

  const prizePaid = Boolean(finalized.prize?.paid);
  await notifyFinalMatchResult(matchId, finalized.winnerId, prizePaid);
  await db
    .update(disputes)
    .set({ status: "resolved", resolution: `winner:${finalized.winnerId}`, resolvedAt: new Date() })
    .where(eq(disputes.matchId, matchId));
  return sendMessage(chatId, [
    "✅ نتیجه مسابقه نهایی شد.",
    prizePaid ? `💰 جایزه ${CLASH_1V1_CONFIG.prize1st} به کیف پول برنده واریز شد.` : "💰 پرداخت جایزه قبلاً انجام شده یا برای این مسابقه لازم نبود.",
    "📣 نتیجه برای هر دو بازیکن ارسال شد.",
  ].join("\n"));
}

const OUTREACH_MESSAGE_TEMPLATE = `سلام 👋\n\nمن از تیم Flexa هستم، پلتفرم برگزاری تورنومنت‌های گیمینگ (Call of Duty Mobile, Clash Royale, Fortnite).\n\nاگر به مسابقات گیمینگ، تورنومنت‌های پولی یا جامعهٔ بازیکنان علاقه‌مند هستی، به ما سر بزن:\n\n🔗 https://www.flexa1.ir\n\nثبت‌نام اولیه از طریق ربات تلگرام هم امکان‌پذیره: @FlexaTournamentBot`;

async function classifiedAdsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  await clearSession(telegramId);
  const rows = await db
    .select()
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);

  if (!rows.length) {
    await sendMessage(chatId, "🔍 آگهی جدیدی یافت نشد.\n\nبرای اسکن دستور زیر را بزن:\n<code>/ads_scan</code>\nیا برای اسکن کل کشور:\n<code>/ads_allcities</code>", mainMenuKeyboard());
    return;
  }

  await sendMessage(chatId, `📋 <b>${rows.length} آگهی گیمینگ جدید</b>.\n\nبرای انتخاب گروهی، روی دکمه‌های ✅/⬜ کلیک کن. سپس عملیات گروهی را انتخاب کن:`, {
    inline_keyboard: rows.flatMap((ad) => [
      [{ text: `⬜ ${ad.platform} | ${ad.title.slice(0, 40)}`, callback_data: `ad:select:${ad.id}` }],
    ]),
  });
  await sendMessage(chatId, "عملیات گروهی:", {
    inline_keyboard: [
      [{ text: "📋 انتخاب همه", callback_data: "ad:bulk:select_all" }],
      [{ text: "✅ علامت‌گذاری انتخاب‌شده‌ها", callback_data: "ad:bulk:contact" }, { text: "❌ نادیده انتخاب‌شده‌ها", callback_data: "ad:bulk:ignore" }],
      [{ text: "📤 خروجی CSV انتخاب‌شده‌ها", callback_data: "ad:bulk:export" }],
      [{ text: "🔗 باز کردن همه انتخاب‌شده‌ها", callback_data: "ad:bulk:open" }],
    ],
  });
}

async function toggleAdSelection(chatId: number, telegramId: string, adId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const selected = new Set(session.data.selectedAdIds || []);
  if (selected.has(adId)) selected.delete(adId);
  else selected.add(adId);
  await setSession(telegramId, session.state, { ...session.data, selectedAdIds: Array.from(selected) });

  // Refresh list if possible
  await refreshAdsList(chatId, telegramId, messageId);
}

async function refreshAdsList(chatId: number, telegramId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return;
  const session = await getSession(telegramId);
  const selected = new Set(session.data.selectedAdIds || []);
  const rows = await db
    .select()
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);

  const keyboard = rows.flatMap((ad) => {
    const isSelected = selected.has(ad.id);
    return [
      [{ text: `${isSelected ? "✅" : "⬜"} ${ad.platform} | ${ad.title.slice(0, 40)}`, callback_data: `ad:select:${ad.id}` }],
      [{ text: "👁 مشاهده", callback_data: `ad:view:${ad.id}` }, { text: "🔗 باز کردن", url: ad.url }],
    ];
  });

  const text = `📋 <b>${rows.length} آگهی گیمینگ جدید</b>. انتخاب‌شده: <b>${selected.size}</b>`;
  if (messageId) await editMessage(chatId, messageId, text, { inline_keyboard: keyboard });
  else await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function selectAllAds(chatId: number, telegramId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return;
  const rows = await db
    .select({ id: classifiedAds.id })
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);
  await setSession(telegramId, "idle", { selectedAdIds: rows.map((r) => r.id) });
  await refreshAdsList(chatId, telegramId, messageId);
}

async function bulkMarkAds(chatId: number, telegramId: string, mode: "contacted" | "ignored") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده. اول /ads را بزن و آگهی‌ها را انتخاب کن.");

  for (const id of ids) {
    await db.delete(classifiedAds).where(eq(classifiedAds.id, id));
  }
  await clearSession(telegramId);
  await sendMessage(chatId, `🗑 ${ids.length} آگهی ${mode === "contacted" ? "تماس‌گرفته‌شده" : "نادیده"} از لیست حذف شد.`, mainMenuKeyboard());
}

async function bulkExportAds(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده.");

  const rows = await db.select().from(classifiedAds).where(inArray(classifiedAds.id, ids));
  const headers = ["platform", "city", "title", "price", "url", "keywords", "status"];
  const csv = [headers.join(","), ...rows.map((r) => [
    r.platform, r.city || "", r.title, r.price || "", r.url, (r.keywords as string[]).join("|"), r.status,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");

  await sendDocument(chatId, "\ufeff" + csv, `selected_ads_${Date.now()}.csv`, `${rows.length} آگهی انتخاب‌شده`);
  await clearSession(telegramId);
}

async function bulkOpenAds(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده.");
  const rows = await db.select({ url: classifiedAds.url, title: classifiedAds.title }).from(classifiedAds).where(inArray(classifiedAds.id, ids));
  const links = rows.map((r, i) => `${i + 1}. <a href="${r.url}">${r.title.slice(0, 30)}</a>`).join("\n");
  await sendMessage(chatId, `🔗 <b>آگهی‌های انتخاب‌شده</b>\n\n${links}\n\nروی هر لینک کلیک کن و در دیوار/شیپور پیام بده.`, mainMenuKeyboard());
}

async function classifiedAdsScanCommand(chatId: number, telegramId: string, allCities = false) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  await sendMessage(chatId, `🔍 در حال اسکن ${allCities ? "کل کشور" : "تهران"} ... این فرایند چند دقیقه طول می‌کشد.`);
  const { runClassifiedScrape } = await import("@/lib/classified-scraper");
  const results = await runClassifiedScrape({ allCities, limitPerCity: 5 });
  const totalFound = results.reduce((sum, r) => sum + r.found, 0);
  const totalNew = results.reduce((sum, r) => sum + r.new, 0);
  const summary = results.filter((r) => r.found > 0 || r.status === "error").map((r) => `${r.platform} ${r.city}: ${r.found} یافت، ${r.new} جدید${r.error ? " (خطا)" : ""}`).join("\n");
  await sendMessage(chatId, `✅ اسکن تمام شد.\n\n<b>کل یافت: ${totalFound}</b>\n<b>کل جدید: ${totalNew}</b>\n\n${html(summary)}\n\nبرای مشاهده: /ads`, mainMenuKeyboard());
}

async function classifiedAdsStatsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const allAds = await db.select({ status: classifiedAds.status, platform: classifiedAds.platform }).from(classifiedAds);
  const byStatus: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  for (const ad of allAds) {
    byStatus[ad.status] = (byStatus[ad.status] || 0) + 1;
    byPlatform[ad.platform] = (byPlatform[ad.platform] || 0) + 1;
  }

  const [lastLog] = await db.select().from(classifiedScrapeLogs).orderBy(desc(classifiedScrapeLogs.createdAt)).limit(1);

  const text = [
    "📊 <b>آمار آگهی‌های گیمینگ</b>",
    "",
    "📁 کل آگهی‌ها: <b>" + allAds.length + "</b>",
    "🆕 جدید: <b>" + (byStatus.new || 0) + "</b>",
    "✅ تماس گرفته شده: <b>" + (byStatus.contacted || 0) + "</b>",
    "❌ نادیده: <b>" + (byStatus.ignored || 0) + "</b>",
    "",
    "🏪 دیوار: <b>" + (byPlatform.divar || 0) + "</b>",
    "🏪 شیپور: <b>" + (byPlatform.sheypoor || 0) + "</b>",
    "",
    lastLog
      ? `آخرین اسکن: <b>${lastLog.platform}</b> | ${lastLog.status} | ${lastLog.itemsFound} یافت، ${lastLog.itemsNew} جدید`
      : "هنوز اسکنی ثبت نشده.",
  ].join("\n");

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "🔍 مشاهده آگهی‌های جدید", callback_data: "menu:ads" }],
      [{ text: "🚀 اسکن تهران", callback_data: "menu:ads_scan" }, { text: "🇮🇷 اسکن کل کشور", callback_data: "menu:ads_scan_all" }],
    ],
  });
}

async function viewClassifiedAd(chatId: number, telegramId: string, adId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  if (!ad) return sendMessage(chatId, "آگهی پیدا نشد.");

  const text = [
    `📌 <b>${html(ad.title)}</b>`,
    `🏪 پلتفرم: <b>${html(ad.platform)}</b>`,
    ad.city ? `📍 شهر: <b>${html(ad.city)}</b>` : "",
    ad.price ? `💰 قیمت: <b>${html(ad.price)}</b>` : "",
    ad.keywords && (ad.keywords as string[]).length ? `🏷 کلمات: <b>${(ad.keywords as string[]).join(", ")}</b>` : "",
    "",
    `📝 ${html(ad.description || "بدون توضیحات")}`,
  ].filter(Boolean).join("\n");

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "🔗 باز کردن آگهی", url: ad.url }],
      [
        { text: "✅ تماس گرفتم", callback_data: `ad:contact:${ad.id}` },
        { text: "❌ نادیده", callback_data: `ad:ignore:${ad.id}` },
      ],
      [
        { text: "📋 کپی متن پیام", callback_data: `ad:copy:${ad.id}` },
        { text: "🗑 حذف از لیست", callback_data: `ad:delete:${ad.id}` },
      ],
      [{ text: "🔙 لیست آگهی‌ها", callback_data: "menu:ads" }],
    ],
  });
}

async function contactClassifiedAd(chatId: number, telegramId: string, adId: string, method: "contact" | "ignore" | "delete") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  if (!ad) return sendMessage(chatId, "آگهی پیدا نشد.");

  if (method === "delete") {
    await db.delete(classifiedAds).where(eq(classifiedAds.id, adId));
    await sendMessage(chatId, "🗑 آگهی از لیست حذف شد.", mainMenuKeyboard());
    return;
  }

  const status = method === "contact" ? "contacted" : "ignored";
  await db
    .update(classifiedAds)
    .set({ status, contactedAt: method === "contact" ? new Date() : null, contactMethod: "telegram_admin", updatedAt: new Date() })
    .where(eq(classifiedAds.id, adId));

  if (method === "contact") {
    await sendMessage(chatId, `✅ آگهی <b>${html(ad.title)}</b> به عنوان «تماس گرفته شده» ثبت شد.\n\nمتن پیشنهادی برای ارسال دستی در دیوار/شیپور:\n\n<pre>${html(OUTREACH_MESSAGE_TEMPLATE)}</pre>`, {
      inline_keyboard: [[{ text: "🔗 باز کردن آگهی", url: ad.url }], [{ text: "🔙 لیست آگهی‌ها", callback_data: "menu:ads" }]],
    });
  } else {
    await sendMessage(chatId, "آگهی نادیده گرفته شد. از لیست حذف شد.", mainMenuKeyboard());
  }
}

async function copyOutreachMessage(chatId: number, telegramId: string, adId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  await sendMessage(chatId, `📋 متن آماده برای ارسال دستی به آگهی <b>${html(ad?.title || "")}</b>:\n\n<pre>${html(OUTREACH_MESSAGE_TEMPLATE)}</pre>\n\nبرای ارسال، روی لینک آگهی کلیک کن و در دیوار/شیپور پیام را بچسبان.`, {
    inline_keyboard: [[{ text: "🔗 باز کردن آگهی", url: ad?.url || APP_URL }], [{ text: "✅ تماس گرفتم", callback_data: `ad:contact:${adId}` }]],
  });
}

async function handleCommand(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const parsed = parseTelegramCommand(text);
  if (!parsed) return;
  const { command: normalizedCommand, args } = parsed;

  if (normalizedCommand === "/start") {
    const payload = args[0];
    await recordReferralIfNeeded(user, payload);
    if (await handleStartPayload(chatId, telegramId, user, payload)) return;
    return startCommand(chatId);
  }
  if (normalizedCommand === "/help") return startCommand(chatId);
  if (normalizedCommand === "/links") return linksCommand(chatId);
  if (normalizedCommand === "/deep_links") return deepLinksCommand(chatId, telegramId);
  if (normalizedCommand === "/channel") return channelCommand(chatId);
  if (normalizedCommand === "/link") return linkCommand(chatId, user);
  if (normalizedCommand === "/profile") return profileCommand(chatId, telegramId);
  if (normalizedCommand === "/wallet") return walletCommand(chatId, telegramId);
  if (normalizedCommand === "/deposit" || normalizedCommand === "/wallet_deposit") { if (!(await ensureFeatureEnabled(chatId, "telegram_wallet_deposit_enabled", "ثبت فیش از ربات"))) return; return startWalletDeposit(chatId, telegramId); }
  if (normalizedCommand === "/achievements") return achievementsCommand(chatId, telegramId);
  if (normalizedCommand === "/my_tournaments") return myTournamentsCommand(chatId, telegramId);
  if (normalizedCommand === "/daily") return dailyCommand(chatId, telegramId);
  if (normalizedCommand === "/quiz" || normalizedCommand === "/challenge") { if (!(await ensureFeatureEnabled(chatId, "telegram_quiz_enabled", "کوییز روزانه"))) return; return quizCommand(chatId, telegramId); }
  if (normalizedCommand === "/coupon") return couponCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/shop") return shopCommand(chatId);
  if (normalizedCommand === "/invite") return inviteCommand(chatId, telegramId);
  if (normalizedCommand === "/affiliate") return affiliateCommand(chatId, telegramId);
  if (["/cod", "/cod_arena", "/codmobile"].includes(normalizedCommand)) return sendMessage(chatId, "🎯 <b>COD Arena Flexa</b>\n\nکاستوم‌روم‌های Global و Garena با جایزه Kill و جایگاه، Check-in امن، رنک و زنجیره مدرک ضدچیت.", { inline_keyboard: [[{ text: "بازکردن COD Arena", url: `${APP_URL}/cod-arena` }]] });
  if (normalizedCommand === "/connect_media") return sendMessage(chatId, "این دستور باید توسط مدیر داخل گروه موردنظر اجرا شود: <code>/connect_media CODE</code>");
  if (normalizedCommand === "/missions") { if (!(await ensureFeatureEnabled(chatId, "telegram_missions_enabled", "مأموریت‌ها"))) return; return missionsCommand(chatId, telegramId); }
  if (normalizedCommand === "/claim_missions") return missionsCommand(chatId, telegramId);
  if (normalizedCommand === "/leaderboard") return leaderboardCommand(chatId);
  if (normalizedCommand === "/ai") { if (!(await ensureFeatureEnabled(chatId, "telegram_ai_enabled", "دستیار AI"))) return; return aiCommand(chatId, args.join(" "), telegramId); }
  if (normalizedCommand === "/support") { if (!(await ensureFeatureEnabled(chatId, "telegram_support_enabled", "پشتیبانی"))) return; return supportStartCommand(chatId, telegramId); }
  if (normalizedCommand === "/my_tickets") return myTicketsCommand(chatId, telegramId);
  if (normalizedCommand === "/matches") return matchesCommand(chatId, telegramId);
  if (["/clash_tournament", "/clash_multi"].includes(normalizedCommand)) return clashPrivateTournamentsCommand(chatId, telegramId);
  // Direct entry point for the paid 1V1 product.  This deliberately bypasses
  // the old generic tournament pre-registration flow: after rules acceptance
  // it deducts 50,000 USDT from the wallet and asks for the Clash friend link.
  if (["/clash_join", "/clash_register", "/join_1v1"].includes(normalizedCommand)) {
    return registerClash1v1Queue(chatId, telegramId, { stakeMode: "paid", gameMode: "normal" });
  }
  // All Clash 1V1 entry points funnel into the single atomic queue flow so
  // users never hit the dead "no registration found" path of the legacy flow.
  if (["/qr", "/clash_qr", "/clash_link", "/clash", "/clash_1v1", "/1v1"].includes(normalizedCommand)) {
    return openClash1v1Queue(chatId, telegramId);
  }
  if (normalizedCommand === "/checkin") return checkInCommand(chatId, telegramId);
  if (normalizedCommand === "/judge") return judgeCommand(chatId, telegramId);
  if (normalizedCommand === "/health") return healthCommand(chatId, telegramId);
  if (normalizedCommand === "/version" || normalizedCommand === "/clash_queue") return versionCommand(chatId, telegramId);
  if (normalizedCommand === "/export_telegram") return exportTelegramCommand(chatId, telegramId);
  if (normalizedCommand === "/poll") return pollCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/ads") return classifiedAdsCommand(chatId, telegramId);
  if (normalizedCommand === "/ads_scan") return classifiedAdsScanCommand(chatId, telegramId, false);
  if (normalizedCommand === "/ads_allcities") return classifiedAdsScanCommand(chatId, telegramId, true);
  if (normalizedCommand === "/ads_stats") return classifiedAdsStatsCommand(chatId, telegramId);
  if (normalizedCommand === "/rules") return rulesCommand(chatId);
  if (normalizedCommand === "/howto" || normalizedCommand === "/guide") {
    const game = normalizeGame(args.join(" "));
    if (game && ["cod_mobile", "clash_royale", "fortnite"].includes(game)) {
      const guide = getGameIdGuide(game);
      return sendMessage(chatId, [`<b>${guide.title}</b>`, "", ...guide.steps].join("\n"));
    }
    return sendMessage(chatId, "🎮 برای کدام بازی آیدی را پیدا می‌کنی؟", gameGuideKeyboard());
  }
  if (normalizedCommand === "/rooms") return roomsCommand(chatId, args.join(" "));
  if (normalizedCommand === "/register") return registerStart(chatId, telegramId);
  if (normalizedCommand === "/status") return statusCommand(chatId, telegramId);
  if (normalizedCommand === "/unregister") return unregisterCommand(chatId, telegramId);
  if (normalizedCommand === "/admin" || normalizedCommand === "/stats") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/players") return playersCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_wallets") return pendingWalletsCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_disputes") return pendingDisputesCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_support") return pendingSupportCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_honors") return pendingHonorsCommand(chatId, telegramId);
  if (normalizedCommand === "/honor_stats") return honorStatsCommand(chatId, telegramId);
  if (normalizedCommand === "/ops") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/manage" || normalizedCommand === "/tournaments_admin") return adminTournamentsCommand(chatId, telegramId);
  if (normalizedCommand === "/post_latest") return postLatestTournamentCommand(chatId, telegramId);
  if (normalizedCommand === "/announce") return announceCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/announce_game") {
    const [game, ...messageParts] = args;
    return announceCommand(chatId, telegramId, messageParts.join(" "), game);
  }

  return sendMessage(chatId, "دستور را متوجه نشدم. از /start استفاده کن.", mainMenuKeyboard());
}

async function handleConversationMessage(message: TelegramMessage) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const text = normalizeDigits(message.text || "").trim();
  const session = await getSession(telegramId);

  if (text === CANCEL_TEXT) {
    if (session.state === "clash_1v1_qr_submission" && session.data.clash1v1EntryId) {
      await cancelClash1v1Queue(chatId, telegramId, session.data.clash1v1EntryId);
      return;
    }
    await clearSession(telegramId);
    await sendMessage(chatId, "عملیات لغو شد.", removeKeyboard());
    await startCommand(chatId);
    return;
  }

  const data = { ...session.data };

  if (session.state === "clash_1v1_qr_submission") {
    if (!data.clash1v1EntryId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات صف ناقص است. دوباره /qr را بزن.", removeKeyboard());
      return;
    }
    const bestQrPhoto = message.photo?.[message.photo.length - 1];
    let qrPhoto: { buffer: Buffer; contentType: string; fileId: string } | undefined;
    if (bestQrPhoto) {
      try {
        const file = await downloadTelegramQrPhoto(bestQrPhoto.file_id);
        qrPhoto = { buffer: file.buffer, contentType: file.contentType, fileId: bestQrPhoto.file_id };
      } catch (err) {
        logger.warn({ err, telegramId }, "Failed to download Clash 1V1 QR photo");
        await sendMessage(chatId, "عکس QR قابل دریافت نیست؛ عکس واضح‌تری بفرست یا Share Link را Paste کن.");
        return;
      }
    }
    await submitClash1v1Qr({ chatId, telegramId, entryId: data.clash1v1EntryId, text: message.caption || message.text || "", qrPhoto });
    return;
  }

  if (session.state === "clash_qr_submission") {
    // Legacy session state from the old registration-based flow. Clear it and
    // redirect to the current atomic queue flow which owns payment + QR +
    // matchmaking. This prevents users stuck in the dead flow from "nothing
    // happening" after a deploy.
    await clearSession(telegramId);
    return openClash1v1Queue(chatId, telegramId);
  }


  if (session.state === "wallet_online_amount") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "حساب شما لینک نیست. اول /link را انجام بده.", removeKeyboard());
      return;
    }

    const amountRial = parseTomanToRial(text);
    const validation = validateDepositAmountRial(amountRial);
    if (!validation.ok) {
      await sendMessage(chatId, `${html(validation.error)}\n\nمبلغ را دوباره به USDT وارد کن:`);
      return;
    }

    // Paid tournaments are age-gated, and a deposit funds them, so the bot
    // applies the same gate the web wallet does rather than routing around it.
    const [payer] = await db
      .select({ birthDate: users.birthDate, nationalId: users.nationalId, phoneNumber: users.phoneNumber, email: users.email })
      .from(users)
      .where(eq(users.id, linked.userId))
      .limit(1);

    if (payer) {
      const gate = checkAgeGate({ birthDate: payer.birthDate, nationalId: payer.nationalId });
      if (!gate.ok) {
        await clearSession(telegramId);
        // The gate message alone leaves the user stuck, since the identity
        // fields can only be filled in on the web profile. Link straight to it.
        await sendMessage(
          chatId,
          `🪪 ${html(gate.message)}\n\nکافی است یک‌بار کد ملی و تاریخ تولد را ثبت کنی؛ بعد از آن شارژ بدون محدودیت انجام می‌شود.`,
          { inline_keyboard: [[{ text: "🪪 تکمیل اطلاعات هویتی", url: `${APP_URL}/profile/user` }]] }
        );
        return;
      }
    }

    const limit = await rateLimit(`wallet:deposit:cryptopayment:${linked.userId}`, 8, 10 * 60 * 1000);
    if (!limit.success) {
      await clearSession(telegramId);
      await sendMessage(chatId, "تعداد درخواست‌های شارژ بیش از حد مجاز است. کمی بعد دوباره تلاش کن.", removeKeyboard());
      return;
    }

    await clearSession(telegramId);

    const result = await startCryptoPaymentDeposit({
      userId: linked.userId,
      amountRial,
      mobile: payer?.phoneNumber ?? null,
      email: payer?.email ?? null,
      origin: "telegram",
      telegramId,
    });

    if (!result.ok) {
      await sendMessage(chatId, `پرداخت شروع نشد.\n${html(result.error)}`, removeKeyboard());
      return;
    }

    await sendMessage(chatId, "در حال انتقال به درگاه...", removeKeyboard());
    await sendMessage(
      chatId,
      `🏦 <b>پرداخت ${html(formatTomanFromRial(amountRial))}</b>\n\n⚠️ <b>فیلترشکن خاموش باشد</b>، وگرنه پرداخت ناموفق می‌شود.\n\nروی دکمه بزن تا به درگاه امن زرین‌پال بروی.\n\nبعد از پرداخت موفق، موجودی به‌صورت خودکار شارژ می‌شود و همین‌جا اطلاع می‌دهیم.\n\nاین لینک مخصوص همین پرداخت است؛ آن را برای کسی نفرست.`,
      { inline_keyboard: [[{ text: "🏦 پرداخت در درگاه", url: result.paymentUrl }], [{ text: "💳 مشاهده کیف پول", callback_data: "menu:wallet" }]] }
    );
    return;
  }

  if (session.state === "wallet_deposit_amount") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "حساب شما لینک نیست. اول /link را انجام بده.", removeKeyboard());
      return;
    }
    const amountRial = parseTomanToRial(text);
    const validation = validateDepositAmountRial(amountRial);
    if (!validation.ok) {
      await sendMessage(chatId, `${html(validation.error)}\n\nمبلغ را دوباره به USDT وارد کن:`);
      return;
    }
    data.walletDepositAmountToman = rialToTomanNumber(amountRial).toString();
    await setSession(telegramId, "wallet_deposit_tracking", data);
    await sendMessage(chatId, `مبلغ ثبت شد: <b>${html(formatTomanFromRial(amountRial))}</b>\n\nشماره پیگیری یا ۴ رقم آخر کارت مبدأ را بفرست. اگر نداری «رد کردن» را بزن.`, replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "wallet_deposit_tracking") {
    data.walletDepositTracking = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "wallet_deposit_receipt", data);
    await sendMessage(chatId, "حالا تصویر فیش واریز را به‌صورت عکس ارسال کن.\n\nحداکثر حجم قابل قبول ۱.۲ مگابایت است.", replyKeyboard([[CANCEL_TEXT]]));
    return;
  }

  if (session.state === "wallet_deposit_receipt") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.walletDepositAmountToman) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات واریز ناقص است. دوباره /deposit را شروع کن.", removeKeyboard());
      return;
    }
    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    if (!bestPhoto) {
      await sendMessage(chatId, "لطفاً فیش را به‌صورت عکس ارسال کن، نه متن یا فایل دیگر.");
      return;
    }

    try {
      const amountRial = parseTomanToRial(data.walletDepositAmountToman);
      const receipt = await downloadTelegramPhotoAsDataUrl(bestPhoto.file_id);
      const wallet = await getOrCreateWallet(linked.userId);
      const [tx] = await db.insert(transactions).values({
        walletId: wallet.id,
        amount: amountRial.toString(),
        type: "deposit",
        status: "pending",
        referenceId: createWalletReference("deposit"),
        metadata: {
          kind: "manual_deposit_request",
          provider: "telegram_bot_card_transfer",
          withdrawable: false,
          userId: linked.userId,
          telegramId,
          displayName: linked.displayName,
          trackingNumber: data.walletDepositTracking || null,
          note: sanitizeWalletNote(message.caption || "ثبت از ربات تلگرام"),
          receiptUploaded: true,
          receiptUrl: receipt.dataUrl,
          receiptFileName: receipt.fileName,
          receiptFileType: receipt.contentType,
          receiptFileSize: receipt.size,
          telegramFileId: bestPhoto.file_id,
          telegramFileUniqueId: bestPhoto.file_unique_id,
        },
      }).returning();

      await clearSession(telegramId);
      await sendMessage(chatId, `✅ فیش واریز ثبت شد.\n\nمبلغ: <b>${html(formatTomanFromRial(amountRial))}</b>\nوضعیت: <b>در انتظار بررسی ادمین</b>\n\nبعد از تأیید مدیریت، موجودی کیف پولت افزایش پیدا می‌کند.`, {
        inline_keyboard: [[{ text: "مشاهده کیف پول", url: `${APP_URL}/wallet` }]],
      });
      await notifyAdminsOnWalletDeposit(user, linked.userId, amountRial, tx.id).catch((err) => logger.warn({ err }, "Failed to notify admins on Telegram wallet deposit"));
    } catch (err) {
      const messageText = err instanceof Error && err.message === "RECEIPT_TOO_LARGE"
        ? "حجم تصویر فیش بیشتر از ۱.۲ مگابایت است. لطفاً تصویر سبک‌تر ارسال کن."
        : "ثبت فیش انجام نشد. لطفاً دوباره عکس فیش را ارسال کن یا بعداً از سایت اقدام کن.";
      await sendMessage(chatId, messageText);
    }
    return;
  }

  if (session.state === "cod_lobby_check") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.codRoomId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات بررسی لابی ناقص است. از داخل صفحه روم دوباره دکمه بررسی لابی را بزن.", removeKeyboard());
      return;
    }
    const bestPhoto = message.photo?.[message.photo.length - 1];
    let imageDataUrl: string | null = null;
    let media = telegramMediaReference(message);
    if (bestPhoto) {
      try {
        const photo = await downloadTelegramPhotoAsDataUrl(bestPhoto.file_id);
        imageDataUrl = photo.dataUrl;
      } catch {
        await sendMessage(chatId, "عکس لابی خیلی بزرگ یا نامعتبر است. لطفاً اسکرین‌شات فشرده‌تر/واضح‌تر بفرست یا نام‌ها را خط‌به‌خط ارسال کن.");
        return;
      }
    }
    const operatorNote = message.caption || text || "";
    if (!imageDataUrl && operatorNote.trim().length < 3) {
      await sendMessage(chatId, "لطفاً اسکرین‌شات لابی را به صورت عکس ارسال کن یا نام‌های داخل لابی را خط‌به‌خط بنویس.");
      return;
    }
    try {
      const check = await verifyCodLobbyFromImage({
        roomId: data.codRoomId,
        userId: linked.userId,
        isAdmin: linked.role === "admin" || linked.role === "super_admin",
        telegramFileId: media?.fileId || null,
        telegramFileUniqueId: media?.fileUniqueId || null,
        sourceKind: media ? `telegram_${media.fileType}` : "telegram_text",
        imageDataUrl,
        operatorNote,
      });
      const unauthorized = Array.isArray(check.unauthorizedUsernames) ? check.unauthorizedUsernames as string[] : [];
      const missing = Array.isArray(check.missingCheckedInUsernames) ? check.missingCheckedInUsernames as string[] : [];
      const textResult = [
        check.status === "verified" ? "✅ <b>لابی تأیید شد</b>" : check.status === "flagged" ? "🚨 <b>لابی مشکوک/دارای نفر غیرمجاز است</b>" : "⚠️ <b>لابی نیازمند بررسی دستی است</b>",
        "",
        `Matched: <b>${check.matchedCount}</b>` ,
        `Unauthorized: <b>${check.unauthorizedCount}</b>` ,
        `Missing checked-in: <b>${check.missingCheckedInCount}</b>` ,
        `Confidence: <b>${check.confidence}%</b>`,
        unauthorized.length ? `\nغیرمجازها:\n${unauthorized.slice(0, 20).map((x) => `• ${html(x)}`).join("\n")}` : "",
        missing.length ? `\nChecked-in ولی در عکس دیده نشد:\n${missing.slice(0, 20).map((x) => `• ${html(x)}`).join("\n")}` : "",
      ].filter(Boolean).join("\n");
      await clearSession(telegramId);
      await sendMessage(chatId, textResult, { inline_keyboard: [[{ text: "مشاهده روم", url: `${APP_URL}/cod-arena/${data.codRoomId}` }]] });
      await Promise.allSettled(getAdminIds().map((adminId) => sendMessage(Number(adminId), `🤖 <b>نتیجه بررسی Lobby COD</b>\nRoom: <code>${html(data.codRoomId!.slice(0, 8))}</code>\n${textResult}`, { inline_keyboard: [[{ text: "مشاهده روم", url: `${APP_URL}/cod-arena/${data.codRoomId}` }]] }).catch(() => undefined)));
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const msg = code === "COD_LOBBY_CHECK_FORBIDDEN"
        ? "فقط Roomer/Spectator/Judge/Admin این روم می‌تواند بررسی هوشمند لابی را انجام دهد."
        : "بررسی لابی انجام نشد. مطمئن شو حساب تلگرام به اکانت ادمین/رومر وصل است و دوباره تلاش کن.";
      await sendMessage(chatId, msg);
    }
    return;
  }

  if (session.state === "cod_evidence_upload") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.codRoomId || !data.codEvidenceKind) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات ارسال مدرک COD ناقص است. از داخل صفحه روم دوباره دکمه ارسال در تلگرام را بزن.", removeKeyboard());
      return;
    }
    const media = telegramMediaReference(message);
    if (!media) {
      await sendMessage(chatId, "لطفاً عکس، ویدیو یا فایل مدرک را همینجا ارسال کن. برای لغو، دکمه لغو را بزن.");
      return;
    }
    try {
      await addCodRoomEvidence({
        roomId: data.codRoomId,
        userId: linked.userId,
        isAdmin: linked.role === "admin" || linked.role === "super_admin",
        kind: data.codEvidenceKind,
        fileUrl: media.fileUrl,
        metadata: {
          source: "telegram",
          telegramFileId: media.fileId,
          telegramFileUniqueId: media.fileUniqueId,
          telegramFileType: media.fileType,
          telegramFileSize: media.fileSize,
          caption: message.caption || null,
        },
      });
      await notifyCodAdminsWithTelegramMedia(media, [
        "📎 <b>مدرک جدید COD Arena</b>",
        `Room: <code>${html(data.codRoomId.slice(0, 8))}</code>`,
        `نوع: <b>${html(COD_EVIDENCE_KIND_LABELS[data.codEvidenceKind] || data.codEvidenceKind)}</b>`,
        `ارسال‌کننده: <code>${html(telegramId)}</code>`,
        message.caption ? `کپشن: ${html(message.caption).slice(0, 700)}` : "",
      ].filter(Boolean).join("\n"), data.codRoomId).catch(() => undefined);
      await clearSession(telegramId);
      await sendMessage(chatId, "✅ مدرک COD داخل پرونده روم ثبت شد. فایل در تلگرام نگهداری می‌شود و فقط شناسه فایل در Flexa ذخیره شد.", {
        inline_keyboard: [[{ text: "مشاهده روم", url: `${APP_URL}/cod-arena/${data.codRoomId}` }]],
      });
    } catch (err) {
      const errorCode = err instanceof Error ? err.message : "";
      const text = errorCode === "COD_ENTRY_NOT_FOUND"
        ? "فقط شرکت‌کننده یا عوامل این روم می‌توانند مدرک ثبت کنند. اگر حساب تلگرام را به حساب درست وصل نکردی، /link را بزن."
        : errorCode === "COD_EVIDENCE_FORBIDDEN"
          ? "رکورد Lobby فقط توسط Roomer/Spectator/Admin قابل ثبت است."
          : errorCode === "COD_EVIDENCE_DUPLICATE"
            ? "این فایل قبلاً برای همین روم ثبت شده است."
            : "ثبت مدرک COD انجام نشد. دوباره تلاش کن یا از پشتیبانی کمک بگیر.";
      await sendMessage(chatId, text);
    }
    return;
  }

  if (session.state === "cod_report_upload") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.codRoomId || !data.codReportCategory) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات گزارش COD ناقص است. از داخل صفحه روم دوباره دکمه ارسال در تلگرام را بزن.", removeKeyboard());
      return;
    }
    const media = telegramMediaReference(message);
    const description = (message.caption || text || "").trim();
    if (!media && description.length < 10) {
      await sendMessage(chatId, "لطفاً توضیح گزارش را حداقل در ۱۰ کاراکتر بنویس یا عکس/ویدیو را همراه کپشن ارسال کن.");
      return;
    }
    try {
      await reportCodRoomIssue({
        roomId: data.codRoomId,
        reporterId: linked.userId,
        isAdmin: linked.role === "admin" || linked.role === "super_admin",
        category: data.codReportCategory,
        description: description || `گزارش ${COD_REPORT_CATEGORY_LABELS[data.codReportCategory] || data.codReportCategory} همراه با مدرک تلگرام`,
        evidenceUrl: media?.fileUrl || null,
      });
      if (media) await notifyCodAdminsWithTelegramMedia(media, [
        "🚨 <b>گزارش تخلف جدید COD Arena</b>",
        `Room: <code>${html(data.codRoomId.slice(0, 8))}</code>`,
        `نوع: <b>${html(COD_REPORT_CATEGORY_LABELS[data.codReportCategory] || data.codReportCategory)}</b>`,
        `گزارش‌دهنده: <code>${html(telegramId)}</code>`,
        `توضیح: ${html(description || "بدون توضیح").slice(0, 700)}`,
      ].join("\n"), data.codRoomId).catch(() => undefined);
      await clearSession(telegramId);
      await sendMessage(chatId, "✅ گزارش تخلف ثبت شد و در صف بررسی ادمین قرار گرفت. فایل مدرک در تلگرام نگهداری می‌شود.", {
        inline_keyboard: [[{ text: "مشاهده روم", url: `${APP_URL}/cod-arena/${data.codRoomId}` }]],
      });
    } catch (err) {
      const errorCode = err instanceof Error ? err.message : "";
      const text = errorCode === "COD_REPORT_FORBIDDEN"
        ? "فقط شرکت‌کننده یا عوامل این روم می‌توانند گزارش ثبت کنند."
        : errorCode === "COD_REPORT_DESCRIPTION_INVALID"
          ? "توضیحات گزارش باید دقیق‌تر باشد. لطفاً دوباره با کپشن کامل ارسال کن."
          : "ثبت گزارش انجام نشد. دوباره تلاش کن یا از پشتیبانی کمک بگیر.";
      await sendMessage(chatId, text);
    }
    return;
  }

  if (session.state === "evidence_upload") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.evidenceMatchId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات ارسال مدرک ناقص است. دوباره /matches را بزن.");
      return;
    }
    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    if (!bestPhoto) {
      await sendMessage(chatId, "لطفاً مدرک را به‌صورت عکس ارسال کن.");
      return;
    }
    const [match] = await db.select().from(matches).where(eq(matches.id, data.evidenceMatchId)).limit(1);
    const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
    const isMyMatch = myPlayers.some((p) => p.id === match?.player1Id || p.id === match?.player2Id);
    if (!match || !isMyMatch) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
      return;
    }
    if (match.status === "completed") {
      await clearSession(telegramId);
      await sendMessage(chatId, "نتیجه این مسابقه قبلاً نهایی شده است.", removeKeyboard());
      return;
    }
    await db.insert(matchEvidence).values({
      matchId: match.id,
      uploadedById: linked.userId,
      fileUrl: `telegram_file:${bestPhoto.file_id}`,
      fileType: "photo",
      description: message.caption || "Telegram screenshot evidence",
    });
    await clearSession(telegramId);
    await sendMessage(
      chatId,
      match.status === "disputed"
        ? "✅ اسکرین‌شات ثبت و به پرونده داوری اضافه شد."
        : "✅ اسکرین‌شات ثبت شد؛ فقط در صورت اختلاف برای داور نمایش داده می‌شود.",
      removeKeyboard(),
    );
    if (match.status === "disputed") {
      await notifyResultAdmins(match.id, `📎 <b>مدرک جدید اختلاف</b>\nMatch: <code>${html(match.id.slice(0, 8))}</code>\nارسال‌کننده: <code>${html(telegramId)}</code>`);
    }
    return;
  }

  if (session.state === "support_subject") {
    if (text.length < 3 || text.length > 120) {
      await sendMessage(chatId, "موضوع باید بین ۳ تا ۱۲۰ کاراکتر باشد. دوباره بنویس:");
      return;
    }
    data.supportSubject = text;
    await setSession(telegramId, "support_message", data);
    await sendMessage(chatId, "متن پیام پشتیبانی را بنویس:");
    return;
  }

  if (session.state === "support_message") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "حساب شما لینک نیست. اول /link را انجام بده.");
      return;
    }
    if (text.length < 5 || text.length > 2000) {
      await sendMessage(chatId, "متن پیام باید بین ۵ تا ۲۰۰۰ کاراکتر باشد. دوباره بنویس:");
      return;
    }
    const [ticket] = await db.insert(tickets).values({ userId: linked.userId, subject: data.supportSubject || "پشتیبانی تلگرام" }).returning();
    await db.insert(ticketMessages).values({ ticketId: ticket.id, senderId: linked.userId, message: text });
    await clearSession(telegramId);
    await sendMessage(chatId, "✅ تیکت پشتیبانی شما ثبت شد. از داخل سایت هم می‌توانید پیگیری کنید.", {
      inline_keyboard: [[{ text: "مرکز پشتیبانی", url: `${APP_URL}/support` }], [{ text: "تیکت‌های من", callback_data: "support:mine" }]],
    });
    await notifyAdminsOnSupportTicket(user, linked.userId, ticket.id, data.supportSubject || "پشتیبانی تلگرام", text).catch((err) => logger.warn({ err, ticketId: ticket.id }, "Failed to notify admins on Telegram support ticket"));
    return;
  }

  if (session.state === "dispute_reason") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.disputeMatchId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات اعتراض ناقص است. دوباره /matches را بزن.");
      return;
    }
    const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
    const playerIds = myPlayers.map((p) => p.id);
    const [match] = await db.select().from(matches).where(eq(matches.id, data.disputeMatchId)).limit(1);
    const raisedById = playerIds.find((id) => id === match?.player1Id || id === match?.player2Id);
    if (!match || !raisedById) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
      return;
    }
    await db.insert(disputes).values({ matchId: match.id, raisedById, reason: text, evidenceUrls: [] });
    await db.update(matches).set({ status: "disputed" }).where(eq(matches.id, match.id));
    await clearSession(telegramId);
    await sendMessage(chatId, "✅ اعتراض شما ثبت شد و در پنل داوری بررسی می‌شود.");
    await notifyResultAdmins(match.id, `🚨 <b>اعتراض جدید مسابقه</b>\nMatch: <code>${html(match.id.slice(0, 8))}</code>\nدلیل: ${html(text.slice(0, 500))}`);
    return;
  }

  if (session.state === "full_name") {
    if (text.length < 2 || text.length > 80) {
      await sendMessage(chatId, "نام معتبر نیست. لطفاً نام نمایشی یا نام کامل را دوباره وارد کن:");
      return;
    }
    data.fullName = text;
    await setSession(telegramId, "gamer_tag", data);
    await sendMessage(chatId, gamePrompt(data.game));
    return;
  }

  if (session.state === "gamer_tag") {
    if (text.length < 2 || text.length > 80) {
      await sendMessage(chatId, "آیدی بازی معتبر نیست. دوباره وارد کن:");
      return;
    }
    data.gamerTag = text;
    await setSession(telegramId, "phone", data);
    await sendMessage(chatId, "شماره تماس خودت را وارد کن یا دکمه ارسال شماره را بزن:", {
      keyboard: [[{ text: "📱 ارسال شماره من", request_contact: true }], [CANCEL_TEXT]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
    return;
  }

  if (session.state === "phone") {
    const phone = message.contact?.phone_number ? normalizePhoneNumber(message.contact.phone_number) : normalizePhoneNumber(text);
    if (!/^09\d{9}$/.test(phone)) {
      await sendMessage(chatId, "شماره تماس معتبر نیست. نمونه درست: 09123456789");
      return;
    }
    if (message.contact?.user_id && message.contact.user_id !== user.id) {
      await sendMessage(chatId, "لطفاً شماره تماس خودت را ارسال کن، نه مخاطب دیگران.");
      return;
    }
    data.phoneNumber = phone;
    await setSession(telegramId, "flexa_id", data);
    await sendMessage(
      chatId,
      GAMENT_ID_REQUIRED
        ? `Flexa ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر حساب نداری اول از وب‌اپ بساز: ${html(`${APP_URL}/register`)}`
        : `اگر در وب‌اپ Flexa حساب داری، Flexa ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر هنوز حساب نداری، «رد کردن» را بزن.`,
      GAMENT_ID_REQUIRED ? removeKeyboard() : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]])
    );
    return;
  }

  if (session.state === "flexa_id") {
    if (text === SKIP_TEXT && !GAMENT_ID_REQUIRED) {
      data.flexaId = "";
    } else if (!isValidFlexaId(text)) {
      await sendMessage(chatId, "Flexa ID معتبر نیست. نمونه درست: <code>FLX-1234</code>", GAMENT_ID_REQUIRED ? undefined : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
      return;
    } else {
      data.flexaId = normalizeFlexaId(text);
    }
    await setSession(telegramId, "city", data);
    await sendMessage(chatId, "شهر محل سکونت را بنویس. اگر لازم نیست، «رد کردن» را بزن:", replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "city") {
    data.city = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "team", data);
    await sendMessage(chatId, "نام تیم/کلن را بنویس. اگر انفرادی هستی، «رد کردن» را بزن:", replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "team") {
    data.teamName = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "confirm", data);
    await sendMessage(chatId, "✅ اطلاعات دریافت شد.", removeKeyboard());
    await sendMessage(chatId, `${registrationSummary(data)}\n\nاگر اطلاعات درست است، ثبت نهایی را بزن.`, confirmKeyboard());
    return;
  }

  await sendMessage(chatId, "متوجه نشدم. از /start استفاده کن.", mainMenuKeyboard());
}

async function handleCallback(callback: TelegramCallbackQuery) {
  const chatId = callback.message?.chat.id;
  const messageId = callback.message?.message_id;
  const telegramId = String(callback.from.id);
  const data = callback.data || "";

  // A stale/expired Telegram callback acknowledgement must not prevent the
  // underlying action (notably the 1V1 button) from running.
  await answerCallback(callback.id).catch((err) => {
    logger.warn({ err, callbackData: data, telegramId }, "Telegram callback acknowledgement failed");
  });
  if (!chatId) return;

  if (data === "membership:check") {
    const membership = await checkChannelMembership(telegramId, true);
    if (!membership.member) {
      return promptChannelMembership(chatId, membership.state === "unavailable");
    }
    const session = await getSession(telegramId);
    const pendingPayload = session.data.pendingStartPayload;
    if (pendingPayload) await clearSession(telegramId);
    await sendMessage(chatId, "✅ عضویت شما تأیید شد. حالا می‌توانی از Flexa استفاده کنی.");
    if (callback.message?.chat.type && callback.message.chat.type !== "private") {
      return handleGroupUpdate({ update_id: 0, callback_query: callback });
    }
    if (pendingPayload && await handleStartPayload(chatId, telegramId, callback.from, pendingPayload)) return;
    return startCommand(chatId);
  }

  if (data === "support:mine") return myTicketsCommand(chatId, telegramId);
  if (data === "menu:home") return startCommand(chatId);

  // ── Game hubs: game:<id> and game:<id>:<action> ──────────────────────────
  const gameRoute = parseGameCallback(data);
  if (gameRoute) {
    const hub = findGameHub(gameRoute.gameId);
    if (hub) {
      if (gameRoute.action === "hub") return gameHubCommand(chatId, hub);
      if (gameRoute.action === "rooms") return roomsCommand(chatId, hub.id);
      if (gameRoute.action === "tournaments") return gameTournamentsCommand(chatId, hub);
      if (gameRoute.action === "register") return registerStartForGame(chatId, telegramId, hub);
    }
  }

  // ── Sections ────────────────────────────────────────────────────────────
  if (data === "menu:account") return accountMenuCommand(chatId);
  if (data === "menu:earn") return earnMenuCommand(chatId);
  if (data === "menu:help") return helpMenuCommand(chatId);
  if (data === "mission:invite") return inviteCommand(chatId, telegramId);
  if (data.startsWith("mission:claim:")) return claimMissionReward(chatId, telegramId, data.replace("mission:claim:", ""));
  if (data === "admin:wallets") return pendingWalletsCommand(chatId, telegramId);
  if (data === "admin:disputes") return pendingDisputesCommand(chatId, telegramId);
  if (data === "admin:support") return pendingSupportCommand(chatId, telegramId);
  if (data === "admin:honors") return pendingHonorsCommand(chatId, telegramId);
  if (data === "admin:honor_stats") return honorStatsCommand(chatId, telegramId);
  if (data === "admin:tournaments") return adminTournamentsCommand(chatId, telegramId);
  if (data.startsWith("honor:")) {
    const [, action, honorId] = data.split(":");
    if ((action === "approve" || action === "reject") && honorId) return reviewHonorFromTelegram(chatId, telegramId, honorId, action);
  }
  if (data === "menu:rooms") return roomsCommand(chatId);
  if (data === "menu:register") return registerStart(chatId, telegramId);
  if (data === "menu:ads") return classifiedAdsCommand(chatId, telegramId);
  if (data === "menu:ads_scan") return classifiedAdsScanCommand(chatId, telegramId, false);
  if (data === "menu:ads_scan_all") return classifiedAdsScanCommand(chatId, telegramId, true);
  if (data.startsWith("howto:")) {
    const game = data.replace("howto:", "");
    const guide = getGameIdGuide(game);
    return sendMessage(chatId, [`<b>${guide.title}</b>`, "", ...guide.steps].join("\n"));
  }
  if (data.startsWith("ad:select:")) return toggleAdSelection(chatId, telegramId, data.replace("ad:select:", ""), messageId);
  if (data === "ad:bulk:select_all") return selectAllAds(chatId, telegramId, messageId);
  if (data === "ad:bulk:contact") return bulkMarkAds(chatId, telegramId, "contacted");
  if (data === "ad:bulk:ignore") return bulkMarkAds(chatId, telegramId, "ignored");
  if (data === "ad:bulk:export") return bulkExportAds(chatId, telegramId);
  if (data === "ad:bulk:open") return bulkOpenAds(chatId, telegramId);
  if (data.startsWith("ad:view:")) return viewClassifiedAd(chatId, telegramId, data.replace("ad:view:", ""));
  if (data.startsWith("ad:contact:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:contact:", ""), "contact");
  if (data.startsWith("ad:ignore:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:ignore:", ""), "ignore");
  if (data.startsWith("ad:delete:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:delete:", ""), "delete");
  if (data.startsWith("ad:copy:")) return copyOutreachMessage(chatId, telegramId, data.replace("ad:copy:", ""));
  if (data.startsWith("joinprivate:confirm:")) return joinTournamentFromTelegram(chatId, telegramId, data.replace("joinprivate:confirm:", ""), true);
  if (data.startsWith("join:")) return joinTournamentFromTelegram(chatId, telegramId, data.replace("join:", ""));
  if (data.startsWith("waitlist:")) return joinWaitlist(chatId, telegramId, data.replace("waitlist:", ""));
  if (data === "menu:rules") return rulesCommand(chatId);
  if (data === "menu:status") return statusCommand(chatId, telegramId);
  if (data === "menu:link") return linkCommand(chatId, callback.from);
  if (data === "menu:profile") return profileCommand(chatId, telegramId);
  if (data === "menu:wallet") return walletCommand(chatId, telegramId);
  if (data === "menu:my_tournaments") return myTournamentsCommand(chatId, telegramId);
  if (data === "menu:matches") return matchesCommand(chatId, telegramId);
  if (data === "menu:clash_private") return clashPrivateTournamentsCommand(chatId, telegramId);
  // One clear purchase path for the product: 50K entry, normal Friendly Battle,
  // automatic random opponent.  The first tap shows the rules; after accepting
  // them the same action debits the wallet and opens QR/link submission.
  if (data === "clash1v1:quick_register") return registerClash1v1Queue(chatId, telegramId, { stakeMode: "paid", gameMode: "normal" });
  if (data === "clash1v1:rules:accept") return acceptClash1v1Rules(chatId, telegramId);
  if (data === "clash1v1:rules:show") return sendClash1v1Rules(chatId, telegramId, false);
  if (data.startsWith("clash1v1:opponent:")) {
    const opponentType = data.replace("clash1v1:opponent:", "");
    if (isClashDuelOpponentType(opponentType)) return showClash1v1StakeMenu(chatId, opponentType);
  }
  if (data.startsWith("clash1v1:stake:")) {
    const [, , opponentType, stakeMode] = data.split(":");
    if (isClashDuelOpponentType(opponentType) && isClashDuelStakeMode(stakeMode)) {
      return showClash1v1ModeMenu(chatId, opponentType, stakeMode);
    }
  }
  if (data.startsWith("clash1v1:mode:")) {
    const [, , opponentType, stakeMode, gameMode] = data.split(":");
    if (isClashDuelOpponentType(opponentType) && isClashDuelStakeMode(stakeMode) && isClashDuelGameMode(gameMode)) {
      return opponentType === "random"
        ? registerClash1v1Queue(chatId, telegramId, { stakeMode, gameMode })
        : createClashFriendChallenge(chatId, telegramId, stakeMode, gameMode);
    }
  }
  if (data.startsWith("c1f:")) {
    const [, action, value, challengeIdMaybe] = data.split(":");
    if (action === "accept" && value) return acceptFriendChallenge(chatId, telegramId, value);
    if (action === "modes" && value) return showFriendChallengeModeMenu(chatId, telegramId, value);
    if (action === "mode" && value && challengeIdMaybe) return counterFriendChallengeMode(chatId, telegramId, challengeIdMaybe, value);
    if (action === "cancel" && value) return closeFriendChallenge(chatId, telegramId, value, "cancel");
    if (action === "reject" && value) return closeFriendChallenge(chatId, telegramId, value, "reject");
  }
  if (data === "admin:clash1v1_matchmaking") {
    if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    const result = await runClash1v1MatchmakingAndNotify();
    return sendMessage(chatId, `✅ مچ‌میکینگ دستی اجرا شد.\nMatch جدید: <b>${result.matchedPairs}</b>\nاعلان‌های تلاش‌شده: <b>${result.checkedMatches ?? 0}</b>`);
  }
  if (data === "menu:clash_qr" || data === "clash1v1:status") return openClash1v1Queue(chatId, telegramId);
  if (data === "clash1v1:register") return openClash1v1Queue(chatId, telegramId);
  if (data.startsWith("clash1v1:qr:")) return promptClash1v1Qr(chatId, telegramId, data.replace("clash1v1:qr:", ""));
  if (data.startsWith("clash1v1:ready:")) return markClash1v1Ready(chatId, telegramId, data.replace("clash1v1:ready:", ""));
  if (data.startsWith("clash1v1:cancel:")) return cancelClash1v1Queue(chatId, telegramId, data.replace("clash1v1:cancel:", ""));
  // Legacy QR callback. The 1V1 product is a single global queue, so route to
  // the atomic queue flow rather than the dead "find registration" path.
  if (data.startsWith("qr:")) return openClash1v1Queue(chatId, telegramId);
  if (data === "menu:checkin") return checkInCommand(chatId, telegramId);
  if (data === "menu:affiliate") return affiliateCommand(chatId, telegramId);
  if (data === "menu:missions") { if (!(await ensureFeatureEnabled(chatId, "telegram_missions_enabled", "مأموریت‌ها"))) return; return missionsCommand(chatId, telegramId); }
  if (data === "menu:quiz") { if (!(await ensureFeatureEnabled(chatId, "telegram_quiz_enabled", "کوییز روزانه"))) return; return quizCommand(chatId, telegramId); }
  if (data === "menu:support") { if (!(await ensureFeatureEnabled(chatId, "telegram_support_enabled", "پشتیبانی"))) return; return supportStartCommand(chatId, telegramId); }
  if (data === "wallet:online_deposit") return startWalletOnlineDeposit(chatId, telegramId);
  if (data === "wallet:deposit") { if (!(await ensureFeatureEnabled(chatId, "telegram_wallet_deposit_enabled", "ثبت فیش از ربات"))) return; return startWalletDeposit(chatId, telegramId); }
  if (data.startsWith("match:")) return handleMatchAction(chatId, telegramId, data.replace("match:", ""));
  if (data.startsWith("result:")) {
    const [, action, matchId] = data.split(":");
    if (action === "verify" && matchId) return verifyTelegramResult(chatId, telegramId, matchId);
    // Legacy win/lose buttons may still exist in old chat messages. Route them
    // to the Battle Log check rather than failing, so nobody is stuck.
    if ((action === "win" || action === "lose") && matchId) return verifyTelegramResult(chatId, telegramId, matchId);
  }
  if (data.startsWith("dispute:")) return startDispute(chatId, telegramId, data.replace("dispute:", ""));
  if (data.startsWith("evidence:")) return startEvidenceUpload(chatId, telegramId, data.replace("evidence:", ""));
  if (data.startsWith("judge:")) {
    const [, action, matchId] = data.split(":");
    if (action && matchId) return handleJudgeAction(chatId, telegramId, action, matchId);
  }
  if (data.startsWith("quiz:ans:")) {
    const [, , qIndex, aIndex] = data.split(":");
    return handleQuizAnswer(chatId, telegramId, Number(qIndex), Number(aIndex));
  }
  if (data.startsWith("adm:")) {
    const [, action, tournamentId] = data.split(":");
    if (action && tournamentId) return handleAdminTournamentAction(chatId, telegramId, action, tournamentId);
  }
  if (data.startsWith("checkin:")) return handleCheckIn(chatId, telegramId, data.replace("checkin:", ""));
  if (data.startsWith("mylobby:")) return showMyLobby(chatId, telegramId, data.replace("mylobby:", ""));
  if (data.startsWith("cancelreg:")) return cancelRegistrationCommand(chatId, telegramId, data.replace("cancelreg:", ""));

  if (data === "reg:abort") {
    await clearSession(telegramId);
    if (messageId) await editMessage(chatId, messageId, "عملیات پیش‌ثبت‌نام لغو شد.", mainMenuKeyboard());
    else await sendMessage(chatId, "عملیات پیش‌ثبت‌نام لغو شد.", mainMenuKeyboard());
    return;
  }

  if (data === "reg:restart") {
    await setSession(telegramId, "idle", {});
    if (messageId) await editMessage(chatId, messageId, "پیش‌ثبت‌نام از اول شروع شد. بازی را انتخاب کن:", gameKeyboard());
    else await sendMessage(chatId, "بازی را انتخاب کن:", gameKeyboard());
    return;
  }

  if (data.startsWith("reg:game:")) {
    const game = normalizeGame(data.replace("reg:game:", ""));
    await setSession(telegramId, "idle", { game });
    if (messageId) await editMessage(chatId, messageId, `بازی انتخاب شد: <b>${html(gameLabel(game))}</b>\n\nحالا پلتفرم را انتخاب کن:`, platformKeyboard());
    else await sendMessage(chatId, "حالا پلتفرم را انتخاب کن:", platformKeyboard());
    return;
  }

  if (data.startsWith("reg:platform:")) {
    const index = Number(data.replace("reg:platform:", ""));
    const platform = PLATFORM_OPTIONS[index] || "Other";
    const session = await getSession(telegramId);
    await setSession(telegramId, "full_name", { ...session.data, platform });
    if (messageId) await editMessage(chatId, messageId, `پلتفرم انتخاب شد: <b>${html(platform)}</b>\n\nنام نمایشی Flexa یا نام و نام‌خانوادگی خودت را بنویس:`);
    else await sendMessage(chatId, "نام نمایشی Flexa یا نام و نام‌خانوادگی خودت را بنویس:");
    return;
  }

  if (data === "reg:confirm") {
    const session = await getSession(telegramId);
    const required = [session.data.game, session.data.platform, session.data.fullName, session.data.gamerTag, session.data.phoneNumber];
    if (GAMENT_ID_REQUIRED) required.push(session.data.flexaId);
    if (session.state !== "confirm" || required.some((value) => !value)) {
      await sendMessage(chatId, "بخشی از اطلاعات ناقص است. لطفاً /register را دوباره شروع کن.", mainMenuKeyboard());
      return;
    }

    await savePreRegistration(callback.from, session.data);
    await clearSession(telegramId);
    const text = `✅ پیش‌ثبت‌نام شما با موفقیت داخل پنل Flexa ثبت شد.\n\n${registrationSummary(session.data)}\n\nبرای ثبت‌نام قطعی در روم، پرداخت ورودی احتمالی و مشاهده لابی وارد وب‌اپ شو.`;
    if (messageId) await editMessage(chatId, messageId, text, {
      inline_keyboard: [
        [{ text: "🏆 تکمیل ثبت‌نام در وب‌اپ", url: `${APP_URL}/tournaments` }],
        [{ text: "👤 پروفایل Flexa", url: `${APP_URL}/profile` }],
      ],
    });
    else await sendMessage(chatId, text, mainMenuKeyboard());
    return;
  }

  await sendMessage(chatId, "این دکمه قدیمی یا نامعتبر است. منوی جدید را باز کردم؛ برای 1V1 کلش رویال روی دکمه ⚔️ بزن یا دستور /qr را ارسال کن.", mainMenuKeyboard());
}

function updateActor(update: TelegramUpdate) {
  return update.callback_query?.from || update.message?.from || null;
}

function updateChat(update: TelegramUpdate) {
  return update.callback_query?.message?.chat || update.message?.chat || null;
}

async function enforceChannelMembership(update: TelegramUpdate) {
  const actor = updateActor(update);
  const chat = updateChat(update);
  if (!actor || !chat || hasAdminAccess(String(actor.id))) return true;
  if (update.callback_query?.data === "membership:check") return true;
  const telegramId = String(actor.id);
  if (await isChannelMember(telegramId)) return true;

  const parsed = update.message?.text ? parseTelegramCommand(update.message.text) : null;
  if (parsed?.command === "/start" && parsed.args[0]) {
    await setSession(telegramId, "idle", { pendingStartPayload: parsed.args[0] });
  }
  await promptChannelMembership(chat.id);
  return false;
}

async function handleGroupUpdate(update: TelegramUpdate) {
  const chat = updateChat(update);
  const actor = updateActor(update);
  if (!chat || !actor) return;
  const connectedMedia = await affiliatePartnerForTelegramChat(String(chat.id)).catch(() => null);
  const privateClashUrl = connectedMedia
    ? affiliatePublicLink(connectedMedia.referralCode, "GROUP")
    : telegramStartLink("clash");
  const botUsername = serverBotUsername();
  const keyboard = {
    inline_keyboard: [
      [{ text: "⚔️ اجرای 1V1 در چت خصوصی", url: privateClashUrl }],
      [{ text: "🏟 تورنومنت‌های فعال", url: `${APP_URL}/tournaments` }],
      [{ text: "🤖 باز کردن Flexa", url: `https://t.me/${botUsername}` }],
    ],
  };
  if (update.callback_query) {
    await sendMessage(chat.id, "برای حفظ اطلاعات حساب و کیف پول، این عملیات فقط در چت خصوصی Flexa انجام می‌شود.", keyboard);
    return;
  }
  const parsed = parseTelegramCommand(update.message?.text || "");
  if (!parsed) return;
  if (parsed.command === "/connect_media") {
    return connectMediaGroupCommand(chat.id, chat.title, String(actor.id), parsed.args[0] || "");
  }
  if (parsed.command === "/rules") {
    await sendMessage(chat.id, html(DEFAULT_RULES));
    await sendClash1v1Rules(chat.id, String(actor.id), false);
    return;
  }
  if (["/cod", "/cod_arena", "/codmobile"].includes(parsed.command)) {
    await sendMessage(chat.id, "🎯 <b>COD Arena Flexa</b>\n\nکاستوم‌روم‌های Global و Garena، جایزه Kill و جایگاه و Check-in امن.", { inline_keyboard: [[{ text: "مشاهده روم‌های کالاف", url: `${APP_URL}/cod-arena` }]] });
    return;
  }
  if (["/start", "/clash", "/qr", "/clash_qr", "/rooms"].includes(parsed.command)) {
    await sendMessage(chat.id, [
      "⚔️ <b>Flexa در گروه فعال است</b>",
      "",
      "در گروه می‌توانید قوانین و لینک تورنومنت‌ها را ببینید. ثبت‌نام، کیف پول، Player Tag، دعوت خصوصی و نتیجه فقط در چت خصوصی انجام می‌شوند.",
      connectedMedia ? `📣 رسانه متصل: <b>${html(connectedMedia.mediaName)}</b>` : "مدیر گروه می‌تواند با <code>/connect_media CODE</code> کد رسانه فعال را متصل کند.",
    ].join("\n"), keyboard);
    return;
  }
  await sendMessage(chat.id, "🔒 این فرمان شامل اطلاعات شخصی است و فقط در چت خصوصی Flexa اجرا می‌شود.", keyboard);
}

async function handleUpdate(update: TelegramUpdate) {
  if (!(await enforceChannelMembership(update))) return;
  const chat = updateChat(update);
  if (chat?.type && chat.type !== "private" && update.callback_query?.data !== "membership:check") {
    await handleGroupUpdate(update);
    return;
  }

  if (update.callback_query) {
    try {
      await handleCallback(update.callback_query);
    } catch (err) {
      logger.error({ err, callbackData: update.callback_query.data, telegramId: update.callback_query.from.id }, "Telegram callback failed");
      await answerCallback(update.callback_query.id, "خطای موقت در اجرای دکمه. لطفاً /qr را بزن یا دوباره تلاش کن.", true).catch(() => undefined);
      const chatId = update.callback_query.message?.chat.id;
      if (chatId) {
        await sendMessage(chatId, "⚠️ اجرای دکمه با خطا مواجه شد. سیستم را آماده‌سازی کردم؛ لطفاً دوباره /qr را بزن یا روی 1V1 کلش رویال بزن.", mainMenuKeyboard()).catch(() => undefined);
      }
    }
    return;
  }

  const message = update.message;
  if (!message?.from) return;
  const text = message.text || "";

  if (!(await telegramFeatureEnabled("telegram_bot_enabled", true)) && !text.trim().startsWith("/admin")) {
    await sendMessage(message.chat.id, "ربات Flexa فعلاً در حالت تعمیرات است. لطفاً کمی بعد دوباره تلاش کن.");
    return;
  }

  if (text.trim().startsWith("/")) {
    await handleCommand(message, text);
    return;
  }

  await handleConversationMessage(message);
}

export async function POST(request: NextRequest) {
  const auth = validateWebhookSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let update: TelegramUpdate | undefined;
  let claim: TelegramUpdateClaim | undefined;

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1_000_000) {
      logger.warn({ contentLength }, "Rejected oversized Telegram webhook payload");
      return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
    }

    update = await request.json() as TelegramUpdate;
    if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) {
      return NextResponse.json({ ok: false, error: "Invalid update_id" }, { status: 400 });
    }

    claim = await claimTelegramUpdate(update.update_id);
    if (!claim.claimed) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        updateStatus: claim.status,
        attempts: claim.attempts,
      });
    }

    const actorId = update.callback_query?.from.id || update.message?.from?.id;
    if (actorId) {
      const actorKey = String(actorId);
      const actorLimit = hasAdminAccess(actorKey) ? 180 : 60;
      const allowed = await rateLimit(`telegram-webhook:${actorKey}`, actorLimit, 60_000);
      if (!allowed.success) {
        logger.warn({ actorId }, "Telegram user update rate limit exceeded");
        if (!claim.degraded) await completeTelegramUpdate(update.update_id);
        return NextResponse.json({ ok: true, rateLimited: true });
      }
    }

    await handleUpdate(update);
    if (!claim.degraded) await completeTelegramUpdate(update.update_id);
    return NextResponse.json({ ok: true, idempotent: !claim.degraded });
  } catch (err) {
    logger.error({ err, updateId: update?.update_id }, "Telegram webhook failed");
    if (update && claim?.claimed && !claim.degraded) {
      await failTelegramUpdate(update.update_id, err);
    }

    // Idempotency makes Telegram retries safe. Retry transient failures up to
    // the bounded attempt limit, then acknowledge to stop a permanent storm.
    const shouldRetry = Boolean(
      update && claim?.claimed && shouldRetryTelegramUpdate(claim.attempts, claim.degraded)
    );
    return NextResponse.json(
      { ok: false, retrying: shouldRetry },
      { status: shouldRetry ? 500 : 200 }
    );
  }
}

export async function GET() {
  try {
    await Promise.all([ensureClash1v1Schema(), ensureTelegramReliabilitySchema()]);
    const tournament = await ensureClash1v1QueueTournament();
    return NextResponse.json({
      ok: true,
      webhook: "Flexa Telegram webhook",
      reliabilityReady: true,
      clash1v1Ready: true,
      clash1v1TournamentId: tournament.id,
      setWebhookUrl: `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=${APP_URL}/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`,
    });
  } catch (err) {
    logger.error({ err }, "Telegram webhook health/repair failed");
    return NextResponse.json({
      ok: false,
      webhook: "Flexa Telegram webhook",
      reliabilityReady: false,
      clash1v1Ready: false,
      error: err instanceof Error ? err.message : "unknown",
    }, { status: 500 });
  }
}

