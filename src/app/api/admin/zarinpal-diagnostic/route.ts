/**
 * Operator-only probe for the ZarinPal gateway.
 *
 * A -9 rejection names the offending field in the response body, but that body
 * is only produced when a real request leaves the production server. Reproducing
 * it otherwise means asking someone to click Pay and then reading logs, which is
 * a slow loop. This endpoint performs one gateway request from the server and
 * returns the raw response.
 *
 * It never creates a wallet transaction and never credits a balance. The
 * authority it produces is simply abandoned; ZarinPal expires unused
 * authorities on its own.
 *
 * Protected by ADMIN_SETUP_SECRET, compared in constant time. Returns 404 when
 * the secret is unset so the route is invisible on an unconfigured deployment.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCryptoPaymentConfiguration } from "@/lib/cryptopayment";

export const dynamic = "force-dynamic";

function secretMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.ADMIN_SETUP_SECRET || "";
  if (!expected) {
    return new NextResponse(null, { status: 404 });
  }

  const provided = request.headers.get("x-admin-setup-secret") || "";
  if (!provided || !secretMatches(provided, expected)) {
    return new NextResponse(null, { status: 404 });
  }

  const config = getCryptoPaymentConfiguration();
  const merchantId = (process.env.ZARINPAL_MERCHANT_ID || "").trim();

  if (!config.merchantIdValid) {
    return NextResponse.json(
      { ok: false, stage: "config", error: "ZARINPAL_MERCHANT_ID is missing or not a 36-character UUID.", config },
      { status: 400 }
    );
  }

  // Smallest allowed deposit, so the abandoned authority is harmless.
  const body = {
    merchant_id: merchantId,
    amount: 10_000,
    currency: "IRR",
    description: "بررسی سلامت درگاه",
    callback_url: `${config.callbackBaseUrl}/api/wallet/deposit/cryptopayment/callback`,
  };

  const endpoint = config.sandbox
    ? "https://sandbox.cryptopayment.com/pg/v4/payment/request.json"
    : "https://payment.cryptopayment.com/pg/v4/payment/request.json";

  try {
    const started = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Keep the raw text; a non-JSON body is itself diagnostic.
    }

    const data = (parsed as { data?: Record<string, unknown> } | null)?.data;
    const errors = (parsed as { errors?: unknown } | null)?.errors;
    const accepted = Boolean(data && data.code === 100 && data.authority);

    return NextResponse.json({
      ok: accepted,
      verdict: accepted
        ? "MERCHANT_ID_ACCEPTED"
        : "MERCHANT_ID_REJECTED",
      httpStatus: response.status,
      elapsedMs: Date.now() - started,
      // The merchant id is a credential; only its shape is echoed back.
      sent: { ...body, merchant_id: `${merchantId.slice(0, 8)}...${merchantId.slice(-4)}` },
      gatewayData: data ?? null,
      gatewayErrors: errors ?? null,
      rawBody: parsed ? undefined : text.slice(0, 800),
      config: {
        sandbox: config.sandbox,
        live: config.live,
        callbackBaseUrl: config.callbackBaseUrl,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "network",
        verdict: "GATEWAY_UNREACHABLE",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
