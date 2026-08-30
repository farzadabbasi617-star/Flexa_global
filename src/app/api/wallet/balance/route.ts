import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { bigIntFromText } from "@/lib/money";
import { walletBreakdown } from "@/lib/wallet-accounting";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token, ip, ua, request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [wallet] = await db
      .select({ id: wallets.id, balance: wallets.balance, currency: wallets.currency })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    if (!wallet) {
      return NextResponse.json({
        balanceRial: "0",
        balanceToman: 0,
        usableRial: "0",
        usableToman: 0,
        withdrawableRial: "0",
        withdrawableToman: 0,
        nonWithdrawableRial: "0",
        nonWithdrawableToman: 0,
        currency: "RIAL",
      });
    }

    const rows = await db.select().from(transactions).where(eq(transactions.walletId, wallet.id));
    const breakdown = walletBreakdown(bigIntFromText(wallet.balance), rows);

    return NextResponse.json({
      balanceRial: breakdown.totalRial,
      balanceToman: breakdown.totalToman,
      usableRial: breakdown.usableRial,
      usableToman: breakdown.usableToman,
      withdrawableRial: breakdown.withdrawableRial,
      withdrawableToman: breakdown.withdrawableToman,
      nonWithdrawableRial: breakdown.nonWithdrawableRial,
      nonWithdrawableToman: breakdown.nonWithdrawableToman,
      currency: wallet.currency || "RIAL",
    });
  } catch (err) {
    logger.error({ err }, "Wallet balance error");
    return NextResponse.json({ error: "Failed to load wallet balance" }, { status: 500 });
  }
}
