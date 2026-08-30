import { matches, players, registrations, tournaments, transactions, wallets } from "@/db/schema";
import { bigIntFromText, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export interface LadderRankDistribution {
  rank: number;
  label: string;
  percentageText: string;
  weight: number;
  amountToman: number;
  maxAmountToman: number;
}

export interface DynamicPrizePoolResult {
  isPaid: boolean;
  entryFeeToman: number;
  registeredCount: number;
  maxPlayers: number;
  totalCollectedToman: number;
  siteCommissionToman: number;
  netPrizePoolToman: number;
  maxTotalCollectedToman: number;
  maxSiteCommissionToman: number;
  maxNetPrizePoolToman: number;
  displayPrizePool: string;
  subtitle: string;
  ladder: LadderRankDistribution[];
}

export function calculateDynamicTournamentPrizePool({
  entryFee,
  registeredCount = 0,
  maxPlayers = 16,
  staticPrizePool,
  isDuel = false,
}: {
  entryFee?: string | null;
  registeredCount?: number;
  maxPlayers?: number;
  staticPrizePool?: string | null;
  /**
   * Head-to-head match rather than a bracket: exactly two players, one winner,
   * no tiered ladder.
   *
   * Clash Royale 1V1 is a matchmaking *queue*, so its `maxPlayers` is 1000 —
   * the queue capacity, not the size of a single match. Feeding that into the
   * pooled formula advertised 1000 x 50,000 = 50,000,000 collected and a
   * 40,000,000 prize pool, then split it across a 10-place ladder. The real
   * economics are two players x 50,000 = 100,000, minus the 20% fee, so the
   * winner takes 80,000.
   */
  isDuel?: boolean;
}): DynamicPrizePoolResult {
  const entryFeeRial = parseTomanToRial(entryFee);
  const entryFeeToman = rialToTomanNumber(entryFeeRial);
  const isPaid = entryFeeToman > 0;
  // A duel is always two seats regardless of the queue capacity stored on the
  // tournament row.
  const maxCount = isDuel ? 2 : Math.max(1, maxPlayers || 16);
  const count = Math.min(Math.max(0, registeredCount || 0), isDuel ? 2 : Number.MAX_SAFE_INTEGER);

  let totalCollectedToman = 0;
  let siteCommissionToman = 0;
  let netPrizePoolToman = 0;

  let maxTotalCollectedToman = 0;
  let maxSiteCommissionToman = 0;
  let maxNetPrizePoolToman = 0;

  let displayPrizePool = "";
  let subtitle = "";

  if (isPaid) {
    totalCollectedToman = count * entryFeeToman;
    // 20% site fee
    siteCommissionToman = Math.floor(totalCollectedToman * 0.2);
    // Remaining 80%
    netPrizePoolToman = totalCollectedToman - siteCommissionToman;

    maxTotalCollectedToman = maxCount * entryFeeToman;
    maxSiteCommissionToman = Math.floor(maxTotalCollectedToman * 0.2);
    maxNetPrizePoolToman = maxTotalCollectedToman - maxSiteCommissionToman;

    if (isDuel) {
      // The payout for a duel is fixed and known before anyone joins, so show
      // the real number instead of "۰ USDT (طبق ثبت‌نام)".
      displayPrizePool = `${maxNetPrizePoolToman.toLocaleString("fa-IR")} USDT`;
      subtitle = `۲ بازیکن × ${entryFeeToman.toLocaleString("fa-IR")} USDT ورودی، پس از کسر ۲۰٪ کارمزد سایت — کل مبلغ به برنده می‌رسد`;
    } else if (count > 0) {
      displayPrizePool = `${netPrizePoolToman.toLocaleString("fa-IR")} USDT`;
      subtitle = `از مجموع ${count.toLocaleString("fa-IR")} شرکت‌کننده (۲۰٪ کارمزد سایت کسر شده)`;
    } else {
      displayPrizePool = "۰ USDT (طبق ثبت‌نام)";
      subtitle = `تا سقف ${maxNetPrizePoolToman.toLocaleString("fa-IR")} USDT با تکمیل ظرفیت (${maxCount.toLocaleString("fa-IR")} نفر)`;
    }
  } else {
    const staticRial = parseTomanToRial(staticPrizePool);
    const staticToman = rialToTomanNumber(staticRial);

    if (staticToman > 0) {
      netPrizePoolToman = staticToman;
      maxNetPrizePoolToman = staticToman;
      displayPrizePool = `${staticToman.toLocaleString("fa-IR")} USDT`;
      subtitle = "جایزه اسپانسری (ورودی رایگان)";
    } else {
      displayPrizePool = staticPrizePool || "بدون جایزه";
      subtitle = staticPrizePool ? "جایزه اعلام‌شده مدیریت" : "بدون هزینه ورودی";
    }
  }

  // Winner-takes-all: a duel has no runner-up prize, so the whole net pool
  // goes to first place instead of being split ten ways.
  const ladderWeights = isDuel ? [
    { rank: 1, label: "برنده مسابقه 🥇", weight: 1 },
  ] : [
    { rank: 1, label: "نفر اول (قهرمان 🥇)", weight: 0.35 },
    { rank: 2, label: "نفر دوم (نایب قهرمان 🥈)", weight: 0.20 },
    { rank: 3, label: "نفر سوم 🥉", weight: 0.12 },
    { rank: 4, label: "نفر چهارم", weight: 0.08 },
    { rank: 5, label: "نفر پنجم", weight: 0.06 },
    { rank: 6, label: "نفر ششم", weight: 0.05 },
    { rank: 7, label: "نفر هفتم", weight: 0.04 },
    { rank: 8, label: "نفر هشتم", weight: 0.04 },
    { rank: 9, label: "نفر نهم", weight: 0.03 },
    { rank: 10, label: "نفر دهم", weight: 0.03 },
  ];

  const ladder: LadderRankDistribution[] = ladderWeights.map((item) => ({
    rank: item.rank,
    label: item.label,
    percentageText: `${item.weight * 100}٪`,
    weight: item.weight,
    amountToman: Math.floor(netPrizePoolToman * item.weight),
    maxAmountToman: Math.floor(maxNetPrizePoolToman * item.weight),
  }));

  return {
    isPaid,
    entryFeeToman,
    registeredCount: count,
    maxPlayers: maxCount,
    totalCollectedToman,
    siteCommissionToman,
    netPrizePoolToman,
    maxTotalCollectedToman,
    maxSiteCommissionToman,
    maxNetPrizePoolToman,
    displayPrizePool,
    subtitle,
    ladder,
  };
}

export async function refundTournamentEntryFees(tx: any, tournamentId: string, adminId?: string) {
  const paidEntries = await tx
    .select({
      id: transactions.id,
      walletId: transactions.walletId,
      amount: transactions.amount,
      metadata: transactions.metadata,
    })
    .from(transactions)
    .where(
      sql`${transactions.type} = 'entry_fee' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'tournamentId' = ${tournamentId}`
    );

  let refundedCount = 0;
  let refundedRial = BigInt(0);

  for (const entry of paidEntries) {
    const [existingRefund] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.referenceId, `refund-${entry.id}`))
      .limit(1);

    if (existingRefund) continue;

    const amountStr = entry.amount;
    if (!amountStr) continue;
    const amount = bigIntFromText(amountStr);
    if (amount <= BigInt(0)) continue;

    // ATOMIC UPDATE: Prevent race conditions by doing the addition in the DB
    await tx.update(wallets)
      .set({ 
        balance: sql`${wallets.balance} + ${amountStr}`, 
        updatedAt: new Date() 
      })
      .where(eq(wallets.id, entry.walletId));

    await tx.insert(transactions).values({
      walletId: entry.walletId,
      amount: amountStr,
      type: "refund",
      status: "completed",
      referenceId: `refund-${entry.id}`,
      metadata: {
        kind: "tournament_entry_refund",
        tournamentId,
        originalTransactionId: entry.id,
        adminId: adminId || null,
      },
    });

    await tx
      .update(transactions)
      .set({
        metadata: sql`coalesce(${transactions.metadata}, '{}'::jsonb) || ${JSON.stringify({ refundedAt: new Date().toISOString() })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, entry.id));

    refundedCount += 1;
    refundedRial += amount;
  }

  return { refundedCount, refundedRial: refundedRial.toString() };
}

export function getEntryFeeRial(entryFee: string | null | undefined) {
  return parseTomanToRial(entryFee);
}

export async function distributeTournamentPrizes(tx: any, tournamentId: string, adminId?: string) {
  const [existingPrize] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(sql`${transactions.referenceId} LIKE ${`prize-${tournamentId}-%`}`)
    .limit(1);

  if (existingPrize) {
    return { distributedCount: 0, distributedRial: "0" };
  }

  const [tournament] = await tx
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!tournament) return { distributedCount: 0, distributedRial: "0" };

  const regs = await tx
    .select({
      playerId: registrations.playerId,
      userId: registrations.visibleUserId,
    })
    .from(registrations)
    .where(eq(registrations.tournamentId, tournamentId));

  if (!regs.length) return { distributedCount: 0, distributedRial: "0" };

  const finance = calculateDynamicTournamentPrizePool({
    entryFee: tournament.entryFee,
    registeredCount: regs.length,
    maxPlayers: tournament.maxPlayers,
    staticPrizePool: tournament.prizePool,
  });

  if (finance.netPrizePoolToman <= 0) return { distributedCount: 0, distributedRial: "0" };

  const completedMatches = await tx
    .select({ winnerId: matches.winnerId })
    .from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.status, "completed")));

  const winCounts = new Map<string, number>();
  for (const m of completedMatches) {
    if (m.winnerId) winCounts.set(m.winnerId, (winCounts.get(m.winnerId) || 0) + 1);
  }

  const sortedPlayers = [...regs].sort((a, b) => {
    const winsA = winCounts.get(a.playerId) || 0;
    const winsB = winCounts.get(b.playerId) || 0;
    return winsB - winsA;
  });

  let distributedCount = 0;
  let distributedRial = BigInt(0);

  const topPlayers = sortedPlayers.slice(0, 10);
  for (let idx = 0; idx < topPlayers.length; idx++) {
    const rank = idx + 1;
    const ladderItem = finance.ladder[idx];
    if (!ladderItem || ladderItem.amountToman <= 0) continue;

    const prizeRial = BigInt(ladderItem.amountToman) * BigInt(10);
    const playerReg = topPlayers[idx];

    const [userWallet] = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.userId, playerReg.userId))
      .limit(1);

    if (!userWallet) continue;

    const refId = `prize-${tournamentId}-rank-${rank}`;

    await tx
      .update(wallets)
      .set({
        balance: sql`${wallets.balance} + ${prizeRial.toString()}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, userWallet.id));

    await tx.insert(transactions).values({
      walletId: userWallet.id,
      amount: prizeRial.toString(),
      type: "prize",
      status: "completed",
      referenceId: refId,
      metadata: {
        kind: "tournament_prize",
        tournamentId,
        rank,
        rankLabel: ladderItem.label,
        percentageText: ladderItem.percentageText,
        adminId: adminId || null,
      },
    });

    distributedCount += 1;
    distributedRial += prizeRial;
  }

  return { distributedCount, distributedRial: distributedRial.toString() };
}
