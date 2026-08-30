import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { checkAgeGate } from "@/lib/age-gate";
import { bigIntFromText, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { createWalletReference, sanitizeWalletNote, validateDepositAmountRial } from "@/lib/wallet-security";
import { isValidIranIban, sanitizeIban, sanitizeNationalId, sanitizeShortText, walletBreakdown } from "@/lib/wallet-accounting";
import { rateLimit } from "@/lib/rate-limit";
import { getCryptoPaymentConfiguration } from "@/lib/cryptopayment";
import logger from "@/lib/logger";
import { withRequestLogging } from "@/lib/with-request-logging";

export const dynamic = "force-dynamic";

const MIN_WITHDRAWAL_RIAL = BigInt(500_000); // 50,000 USDT
const MAX_RECEIPT_SIZE = 1.2 * 1024 * 1024;


type WalletRequestBody = Record<string, unknown> & { receipt?: File };

async function parseWalletRequestBody(request: NextRequest): Promise<WalletRequestBody> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const body: WalletRequestBody = {};
    for (const [key, value] of form.entries()) {
      if (key === "receipt" && value instanceof File) {
        body.receipt = value;
      } else if (typeof value === "string") {
        body[key] = value;
      }
    }
    body.acceptTerms = body.acceptTerms === true || body.acceptTerms === "true";
    return body;
  }

  return await request.json();
}

async function receiptToMetadata(file: File | undefined) {
  if (!file || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("INVALID_RECEIPT_TYPE");
  if (file.size > MAX_RECEIPT_SIZE) throw new Error("RECEIPT_TOO_LARGE");

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    receiptUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
    receiptFileName: file.name.slice(0, 160),
    receiptFileType: file.type,
    receiptFileSize: file.size,
  };
}

async function getOrCreateWallet(userId: string) {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(wallets)
    .values({ userId, balance: "0", currency: "RIAL" })
    .onConflictDoNothing({ target: wallets.userId })
    .returning();

  if (created) return created;

  const [afterConflict] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (!afterConflict) throw new Error("WALLET_CREATE_FAILED");
  return afterConflict;
}

function requireTermsAccepted(body: Record<string, unknown>) {
  if (body.acceptTerms !== true) {
    return "برای ثبت درخواست شارژ یا برداشت باید قوانین کیف پول را مطالعه و تأیید کنید.";
  }
  return null;
}

async function GETHandler(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const user = await validateSession(token || "", ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const wallet = await getOrCreateWallet(user.id);
    const allRows = await db.select().from(transactions).where(eq(transactions.walletId, wallet.id));
    const recentRows = [...allRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 100);

    const balanceRial = bigIntFromText(wallet.balance);
    const breakdown = walletBreakdown(balanceRial, allRows);

    return NextResponse.json({
      wallet: {
        id: wallet.id,
        balanceRial: breakdown.totalRial,
        balanceToman: breakdown.totalToman,
        usableRial: breakdown.usableRial,
        usableToman: breakdown.usableToman,
        withdrawableRial: breakdown.withdrawableRial,
        withdrawableToman: breakdown.withdrawableToman,
        nonWithdrawableRial: breakdown.nonWithdrawableRial,
        nonWithdrawableToman: breakdown.nonWithdrawableToman,
        currency: wallet.currency,
      },
      transactions: recentRows.map((tx) => {
        const amountRial = bigIntFromText(tx.amount);
        return {
          ...tx,
          amountRial: amountRial.toString(),
          amountToman: rialToTomanNumber(amountRial),
        };
      }),
      // Lets the wallet UI show the online top-up button only when the gateway
      // can actually take a payment, instead of failing after the user commits.
      onlinePayment: { available: getCryptoPaymentConfiguration().live, provider: "cryptopayment" },
    });
  } catch (err) {
    logger.error({ err }, "Wallet transactions GET failed");
    return NextResponse.json({ error: "Failed to load wallet" }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const user = await validateSession(token || "", ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await parseWalletRequestBody(request);
    const termsError = requireTermsAccepted(body);
    if (termsError) return NextResponse.json({ error: termsError }, { status: 400 });

    const action = body.action === "withdrawal" ? "withdrawal" : "deposit";

    // Age-gate: both deposit and withdrawal are real-money flows and are
    // gated to adults with a registered national ID. Free features of the
    // app remain accessible to under-18 users.
    const gate = checkAgeGate({ birthDate: user.birthDate, nationalId: user.nationalId });
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: gate.message,
          code: "AGE_GATE_BLOCKED",
          reason: gate.code,
        },
        { status: 403 }
      );
    }

    if (action === "deposit") {
      // Card-to-card top-up is retired: deposits now go through the payment
      // gateway, which credits instantly instead of waiting on a manual review.
      // Rejected here as well as in the UI so a stale tab or a direct API call
      // cannot create a pending receipt that nobody is watching for any more.
      //
      // This only blocks *new* receipts. Historical rows stay readable, and the
      // admin approval endpoint is untouched so anything already pending can
      // still be settled.
      return NextResponse.json(
        {
          error: "شارژ کارت‌به‌کارت غیرفعال شده است. لطفاً از پرداخت اینترنتی استفاده کنید.",
          code: "MANUAL_DEPOSIT_DISABLED",
        },
        { status: 410 }
      );
    }


    const limit = await rateLimit(`wallet:withdrawal:${user.id}`, 2, 10 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد درخواست‌های برداشت زیاد است. لطفاً چند دقیقه بعد دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    const amountRial = parseTomanToRial(String(body.amountToman || ""));
    if (amountRial < MIN_WITHDRAWAL_RIAL) {
      return NextResponse.json({ error: "حداقل مبلغ برداشت ۵۰٬۰۰۰ USDT است." }, { status: 400 });
    }

    const iban = sanitizeIban(body.iban);
    const nationalId = sanitizeNationalId(body.nationalId);
    const accountOwner = sanitizeShortText(body.accountOwner, 120);

    if (!accountOwner) return NextResponse.json({ error: "نام صاحب حساب را وارد کنید." }, { status: 400 });
    if (nationalId.length !== 10) return NextResponse.json({ error: "کد ملی معتبر نیست." }, { status: 400 });
    if (!isValidIranIban(iban)) return NextResponse.json({ error: "شماره شبا باید با فرمت IR و ۲۴ رقم وارد شود." }, { status: 400 });

    const tx = await db.transaction(async (dbTx) => {
      await dbTx
        .insert(wallets)
        .values({ userId: user.id, balance: "0", currency: "RIAL" })
        .onConflictDoNothing({ target: wallets.userId });

      // Lock this wallet while we calculate withdrawable balance and create the
      // pending withdrawal. Without the lock, two concurrent requests could both
      // pass the same availability check before either pending row is visible.
      await dbTx.execute(sql`SELECT id FROM wallets WHERE user_id = ${user.id} FOR UPDATE`);

      const [wallet] = await dbTx.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1);
      if (!wallet) throw new Error("WALLET_CREATE_FAILED");

      const allRows = await dbTx.select().from(transactions).where(eq(transactions.walletId, wallet.id));
      const breakdown = walletBreakdown(bigIntFromText(wallet.balance), allRows);
      const withdrawableRial = bigIntFromText(breakdown.withdrawableRial);

      if (withdrawableRial < amountRial) {
        throw new Error("INSUFFICIENT_WITHDRAWABLE_BALANCE");
      }

      const [created] = await dbTx
        .insert(transactions)
        .values({
          walletId: wallet.id,
          amount: amountRial.toString(),
          type: "withdrawal",
          status: "pending",
          referenceId: createWalletReference("withdrawal"),
          metadata: {
            kind: "manual_withdrawal_request",
            userId: user.id,
            displayName: user.displayName,
            accountOwner,
            nationalId,
            iban,
            note: sanitizeWalletNote(body.note),
            requestedIp: ip,
            userAgent: ua.slice(0, 300),
          },
        })
        .returning();

      return created;
    });

    return NextResponse.json({
      success: true,
      message: "درخواست برداشت ثبت شد و پس از بررسی، طی ۲۴ تا ۷۲ ساعت کاری پرداخت می‌شود.",
      transaction: tx,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_WITHDRAWABLE_BALANCE") {
      return NextResponse.json({ error: "موجودی قابل برداشت کافی نیست." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "INVALID_RECEIPT_TYPE") {
      return NextResponse.json({ error: "فقط تصویر فیش واریز قابل ارسال است." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "RECEIPT_TOO_LARGE") {
      return NextResponse.json({ error: "حجم تصویر فیش واریز باید کمتر از ۱.۲ مگابایت باشد." }, { status: 400 });
    }

    logger.error({ err }, "Wallet transaction request failed");
    return NextResponse.json({ error: "ثبت درخواست انجام نشد" }, { status: 500 });
  }
}


export const GET = withRequestLogging(GETHandler);


export const POST = withRequestLogging(POSTHandler);
