import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { registrations, tournaments, transactions, users, wallets } from "@/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { bigIntFromText } from "@/lib/money";
import { evaluateUserAchievements } from "@/lib/achievement-service";
import { ensurePrivateTournamentAttendanceSchema } from "@/lib/private-tournament-attendance";

export const dynamic = "force-dynamic";

function bi(value: string | null | undefined) {
  try { return BigInt(value || "0"); } catch { return BigInt(0); }
}

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "finance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensurePrivateTournamentAttendanceSchema();

    const txRows = await db
      .select({
        id: transactions.id,
        walletId: transactions.walletId,
        amount: transactions.amount,
        type: transactions.type,
        status: transactions.status,
        referenceId: transactions.referenceId,
        metadata: transactions.metadata,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        userId: users.id,
        displayName: users.displayName,
        username: users.username,
        phoneNumber: users.phoneNumber,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(users, eq(wallets.userId, users.id))
      .orderBy(desc(transactions.createdAt))
      .limit(5000);

    const walletRows = await db
      .select({ id: wallets.id, balance: wallets.balance })
      .from(wallets);

    const tournamentRows = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        status: tournaments.status,
        maxPlayers: tournaments.maxPlayers,
        registeredCount: count(registrations.id),
        noShowCount: sql<number>`count(${registrations.id}) FILTER (WHERE ${registrations.attendanceStatus} = 'no_show')::int`,
      })
      .from(tournaments)
      .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(200);

    let totalDeposits = BigInt(0);
    let totalWithdrawals = BigInt(0);
    let totalEntryFees = BigInt(0);
    let totalWins = BigInt(0);
    let completedTransactions = 0;
    let pendingTransactions = 0;

    for (const tx of txRows) {
      const amount = bi(tx.amount);
      if (tx.status === "completed") completedTransactions += 1;
      if (tx.status === "pending") pendingTransactions += 1;
      if (tx.status !== "completed") continue;
      if (tx.type === "deposit") totalDeposits += amount;
      if (tx.type === "withdrawal") totalWithdrawals += amount;
      if (tx.type === "entry_fee") totalEntryFees += amount;
      if (tx.type === "tournament_win") totalWins += amount;
    }

    const totalWalletBalance = walletRows.reduce((sum, w) => sum + bi(w.balance), BigInt(0));

    const tournamentFunds = tournamentRows.map((tournament) => {
      const related = txRows.filter((tx) => String(meta(tx.metadata).tournamentId || "") === tournament.id && tx.status === "completed");
      const entryFeesRial = related.filter((tx) => tx.type === "entry_fee").reduce((sum, tx) => sum + bi(tx.amount), BigInt(0));
      const refundsRial = related.filter((tx) => tx.type === "refund").reduce((sum, tx) => sum + bi(tx.amount), BigInt(0));
      const prizesRial = related.filter((tx) => tx.type === "tournament_win").reduce((sum, tx) => sum + bi(tx.amount), BigInt(0));
      const netCollectedRial = entryFeesRial > refundsRial ? entryFeesRial - refundsRial : BigInt(0);
      const commissionRial = netCollectedRial / BigInt(5);
      const expectedPrizeRial = netCollectedRial - commissionRial;
      const varianceRial = expectedPrizeRial - prizesRial;
      return {
        ...tournament,
        entryFeesToman: Number(entryFeesRial / BigInt(10)),
        refundsToman: Number(refundsRial / BigInt(10)),
        commissionToman: Number(commissionRial / BigInt(10)),
        expectedPrizeToman: Number(expectedPrizeRial / BigInt(10)),
        paidPrizeToman: Number(prizesRial / BigInt(10)),
        varianceToman: Number(varianceRial / BigInt(10)),
      };
    });

    const referenceCounts = new Map<string, number>();
    for (const tx of txRows) {
      if (tx.referenceId) referenceCounts.set(tx.referenceId, (referenceCounts.get(tx.referenceId) || 0) + 1);
    }
    const duplicateReferences = [...referenceCounts.entries()].filter(([, value]) => value > 1).map(([referenceId, occurrences]) => ({ referenceId, occurrences }));
    const negativeWallets = walletRows.filter((wallet) => bi(wallet.balance) < BigInt(0)).map((wallet) => wallet.id);
    const stalePending = txRows.filter((tx) => tx.status === "pending" && Date.now() - new Date(tx.createdAt).getTime() > 24 * 60 * 60 * 1000).length;
    const overpaidTournaments = tournamentFunds.filter((fund) => fund.varianceToman < 0).map((fund) => ({ id: fund.id, name: fund.name, overpaidToman: Math.abs(fund.varianceToman) }));

    return NextResponse.json({
      summary: {
        totalDepositsRial: totalDeposits.toString(),
        totalDepositsToman: Number(totalDeposits / BigInt(10)),
        totalWithdrawalsRial: totalWithdrawals.toString(),
        totalWithdrawalsToman: Number(totalWithdrawals / BigInt(10)),
        totalEntryFeesRial: totalEntryFees.toString(),
        totalEntryFeesToman: Number(totalEntryFees / BigInt(10)),
        totalTournamentWinsRial: totalWins.toString(),
        totalTournamentWinsToman: Number(totalWins / BigInt(10)),
        totalWalletBalanceRial: totalWalletBalance.toString(),
        totalWalletBalanceToman: Number(totalWalletBalance / BigInt(10)),
        completedTransactions,
        pendingTransactions,
        transactionCount: txRows.length,
        totalCommissionToman: tournamentFunds.reduce((sum, fund) => sum + fund.commissionToman, 0),
        totalExpectedPrizeToman: tournamentFunds.reduce((sum, fund) => sum + fund.expectedPrizeToman, 0),
        noShowCount: tournamentFunds.reduce((sum, fund) => sum + Number(fund.noShowCount || 0), 0),
        anomalyCount: duplicateReferences.length + negativeWallets.length + stalePending + overpaidTournaments.length,
      },
      tournamentFunds,
      anomalies: { duplicateReferences, negativeWallets, stalePending, overpaidTournaments },
      transactions: txRows.slice(0, 500).map((tx) => ({
        ...tx,
        amountRial: bi(tx.amount).toString(),
        amountToman: Number(bi(tx.amount) / BigInt(10)),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load finance report" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "finance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const transactionId = String(body.transactionId || "");
    const action = String(body.action || "");
    if (!transactionId || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "transactionId/action required" }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // Lock the transaction row first so two admins cannot approve the same
      // pending deposit at the same time and credit the wallet twice.
      await tx.execute(sql`select id from transactions where id = ${transactionId} for update`);
      const [transaction] = await tx.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
      if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
      if (transaction.status !== "pending") throw new Error("TRANSACTION_NOT_PENDING");

      if (action === "reject") {
        const [updated] = await tx
          .update(transactions)
          .set({ status: "failed", updatedAt: new Date(), metadata: sql`coalesce(${transactions.metadata}, '{}'::jsonb) || ${JSON.stringify({ rejectedBy: auth.user!.id, rejectedAt: new Date().toISOString() })}::jsonb` })
          .where(eq(transactions.id, transactionId))
          .returning();
        return { transaction: updated, userId: null as string | null };
      }

      if (transaction.type !== "deposit") throw new Error("ONLY_DEPOSIT_APPROVAL_SUPPORTED");

      await tx.execute(sql`select id from wallets where id = ${transaction.walletId} for update`);
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, transaction.walletId)).limit(1);
      if (!wallet) throw new Error("WALLET_NOT_FOUND");

      const amount = bigIntFromText(transaction.amount);
      const next = bigIntFromText(wallet.balance) + amount;
      await tx.update(wallets).set({ balance: next.toString(), updatedAt: new Date() }).where(eq(wallets.id, wallet.id));

      const [updated] = await tx
        .update(transactions)
        .set({ status: "completed", updatedAt: new Date(), metadata: sql`coalesce(${transactions.metadata}, '{}'::jsonb) || ${JSON.stringify({ approvedBy: auth.user!.id, approvedAt: new Date().toISOString() })}::jsonb` })
        .where(eq(transactions.id, transactionId))
        .returning();
      return { transaction: updated, userId: wallet.userId };
    });

    if (result.userId) await evaluateUserAchievements(result.userId).catch(() => undefined);

    await logAdminAction({ 
      adminId: auth.user.id,
      action: action === "approve" ? "approve_deposit" : "reject_deposit",
      entityType: "transaction",
      entityId: transactionId,
      metadata: { status: result.transaction.status, type: result.transaction.type, amount: result.transaction.amount },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, transaction: result.transaction });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Finance update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
