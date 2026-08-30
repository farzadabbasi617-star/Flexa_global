/**
 * ZarinPal payment gateway (REST API v4).
 *
 * Deposits are credited by the callback route, never by the client. The client
 * only ever learns "go here"; the amount that gets credited is re-read from our
 * own pending transaction row, so a tampered callback cannot inflate a balance.
 *
 * Amounts are Rial everywhere, matching wallets.balance and transactions.amount.
 * `currency: "IRR"` is sent explicitly so a future change to ZarinPal's default
 * cannot silently reinterpret an amount as Toman.
 *
 * https://www.cryptopayment.com/docs/paymentGateway/
 */
import logger from "@/lib/logger";

const REQUEST_URL = "https://payment.cryptopayment.com/pg/v4/payment/request.json";
const VERIFY_URL = "https://payment.cryptopayment.com/pg/v4/payment/verify.json";
const INQUIRY_URL = "https://payment.cryptopayment.com/pg/v4/payment/inquiry.json";
const STARTPAY_URL = "https://payment.cryptopayment.com/pg/StartPay/";

const SANDBOX_REQUEST_URL = "https://sandbox.cryptopayment.com/pg/v4/payment/request.json";
const SANDBOX_VERIFY_URL = "https://sandbox.cryptopayment.com/pg/v4/payment/verify.json";
const SANDBOX_INQUIRY_URL = "https://sandbox.cryptopayment.com/pg/v4/payment/inquiry.json";
const SANDBOX_STARTPAY_URL = "https://sandbox.cryptopayment.com/pg/StartPay/";

const TIMEOUT_MS = 20_000;

/** ZarinPal enforces a 36-character UUID merchant id. */
const MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CryptoPaymentConfig = {
  configured: boolean;
  live: boolean;
  sandbox: boolean;
  merchantIdValid: boolean;
  callbackBaseUrl: string;
};

function callbackBaseUrl() {
  const raw = (process.env.PAYMENT_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  return raw.replace(/\/+$/, "");
}

export function getCryptoPaymentConfiguration(): CryptoPaymentConfig {
  const merchantId = (process.env.ZARINPAL_MERCHANT_ID || "").trim();
  const merchantIdValid = MERCHANT_ID_PATTERN.test(merchantId);
  const sandbox = process.env.ZARINPAL_SANDBOX === "true";
  const base = callbackBaseUrl();

  // Deliberately three separate switches. A valid merchant id is not consent to
  // charge real cards: ZARINPAL_LIVE must also be set, the same way COD_ARENA_LIVE
  // and AFFILIATE_PROGRAM_LIVE gate their own money paths in this codebase.
  const configured = merchantIdValid && base.startsWith("https://");
  const live = configured && process.env.ZARINPAL_LIVE === "true";

  return { configured, live, sandbox, merchantIdValid, callbackBaseUrl: base };
}

function endpoints() {
  const { sandbox } = getCryptoPaymentConfiguration();
  return sandbox
    ? { request: SANDBOX_REQUEST_URL, verify: SANDBOX_VERIFY_URL, startpay: SANDBOX_STARTPAY_URL, inquiry: SANDBOX_INQUIRY_URL }
    : { request: REQUEST_URL, verify: VERIFY_URL, startpay: STARTPAY_URL, inquiry: INQUIRY_URL };
}

export function startPayUrl(authority: string) {
  return `${endpoints().startpay}${authority}`;
}

/**
 * Documented ZarinPal failure codes. Anything unmapped falls back to a generic
 * message rather than leaking a raw gateway string to the user.
 */
const ERROR_MESSAGES: Record<number, string> = {
  [-9]: "اطلاعات ارسال‌شده به درگاه پذیرفته نشد (کد -9).",
  [-10]: "آی‌پی یا مرچنت کد پذیرنده صحیح نیست.",
  [-11]: "مرچنت کد فعال نیست. با پشتیبانی زرین‌پال تماس بگیرید.",
  [-12]: "تلاش بیش از حد مجاز. کمی بعد دوباره امتحان کنید.",
  [-15]: "درگاه پرداخت معلق شده است. با پشتیبانی زرین‌پال تماس بگیرید.",
  [-16]: "سطح تأیید پذیرنده پایین‌تر از حد مجاز است.",
  [-30]: "امکان پرداخت با این مبلغ وجود ندارد.",
  [-31]: "حساب بانکی پذیرنده تأیید نشده است.",
  [-33]: "مبلغ تراکنش با مبلغ پرداخت‌شده مطابقت ندارد.",
  [-34]: "سقف تقسیم تراکنش رد شده است.",
  [-40]: "دسترسی به این متد مجاز نیست.",
  [-50]: "مبلغ پرداخت‌شده با مبلغ ارسالی در وریفای متفاوت است.",
  [-51]: "پرداخت ناموفق بود.",
  [-52]: "خطای غیرمنتظره در درگاه. با پشتیبانی زرین‌پال تماس بگیرید.",
  [-53]: "این پرداخت متعلق به پذیرنده دیگری است.",
  [-54]: "شناسه‌ی پرداخت نامعتبر است.",
  [101]: "این پرداخت قبلاً تأیید شده است.",
};

/**
 * `errors` is ZarinPal's error object. On a -9 it carries `validations`, an
 * array naming the rejected field; surfacing that turns an opaque failure into
 * something an operator can act on.
 */
export function cryptopaymentErrorMessage(
  code: number | undefined,
  errors?: { validations?: unknown; message?: unknown } | null
) {
  if (code === undefined) return "ارتباط با درگاه پرداخت برقرار نشد.";

  if (code === -9) {
    const fields = extractValidationFields(errors?.validations);
    if (fields.length) {
      return `اطلاعات ارسالی به درگاه پذیرفته نشد (${fields.join("، ")}).`;
    }
  }

  return ERROR_MESSAGES[code] || `پرداخت انجام نشد (کد ${code}).`;
}

/** ZarinPal returns validations as [{ field: message }] or [{ field, message }]. */
function extractValidationFields(validations: unknown): string[] {
  if (!Array.isArray(validations)) return [];
  const fields: string[] = [];
  for (const entry of validations) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.field === "string") fields.push(record.field);
    else fields.push(...Object.keys(record));
  }
  return [...new Set(fields)].slice(0, 4);
}

type RequestResult =
  | { ok: true; authority: string; paymentUrl: string }
  | { ok: false; code?: number; error: string };

export async function requestPayment(input: {
  amountRial: bigint;
  description: string;
  callbackUrl: string;
  mobile?: string | null;
  email?: string | null;
  orderId?: string | null;
}): Promise<RequestResult> {
  const merchantId = (process.env.ZARINPAL_MERCHANT_ID || "").trim();
  const { configured } = getCryptoPaymentConfiguration();
  if (!configured) return { ok: false, error: "درگاه پرداخت پیکربندی نشده است." };

  // ZarinPal takes a JSON number. Rial amounts stay far inside Number.MAX_SAFE_INTEGER
  // (the wallet cap is 500,000,000 Rial), but guard rather than silently truncate.
  if (input.amountRial > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, error: "مبلغ درخواستی خارج از محدوده‌ی مجاز است." };
  }

  // ZarinPal validates every metadata field it is given and rejects the whole
  // request with -9 if one is malformed. These are all optional conveniences,
  // so anything that does not match the expected shape is dropped rather than
  // allowed to fail an otherwise valid payment.
  const metadata: Record<string, string> = {};

  // Must be exactly 09xxxxxxxxx. Accounts registered by Telegram or email may
  // hold a differently shaped value.
  if (input.mobile && /^09\d{9}$/.test(input.mobile)) {
    metadata.mobile = input.mobile;
  }

  if (input.email && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(input.email) && input.email.length <= 100) {
    metadata.email = input.email;
  }

  // Our wallet reference is `deposit-<epoch>-<uuid>`, around 50 characters.
  // ZarinPal caps order_id well below that, and the value is redundant for us
  // anyway: the callback carries the same reference in its own query string.
  if (input.orderId && input.orderId.length <= 50) {
    metadata.order_id = input.orderId;
  }

  // The description is required and length-limited by the gateway.
  const description = input.description.trim().slice(0, 255) || "شارژ کیف پول";

  try {
    const response = await fetch(endpoints().request, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: Number(input.amountRial),
        currency: "IRR",
        description,
        callback_url: input.callbackUrl,
        ...(Object.keys(metadata).length ? { metadata } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const payload = await response.json().catch(() => null);
    const data = payload?.data;
    const errors = payload?.errors;

    if (data && data.code === 100 && data.authority) {
      return { ok: true, authority: String(data.authority), paymentUrl: startPayUrl(String(data.authority)) };
    }

    // `errors` is an object on failure and an empty array on success.
    // On a 422 the object carries `validations`, naming the field ZarinPal
    // rejected. Without it a -9 is undebuggable, so log the whole thing.
    const code = typeof errors?.code === "number" ? errors.code : data?.code;
    logger.error(
      {
        code,
        status: response.status,
        gatewayMessage: errors?.message ?? null,
        validations: errors?.validations ?? null,
        sentAmount: Number(input.amountRial),
        sentCallback: input.callbackUrl,
        descriptionLength: input.description.length,
        hasMobile: Boolean(input.mobile),
        hasEmail: Boolean(input.email),
      },
      "ZarinPal payment request failed"
    );
    return { ok: false, code, error: cryptopaymentErrorMessage(code, errors) };
  } catch (error) {
    logger.error({ error }, "ZarinPal payment request error");
    return { ok: false, error: "ارتباط با درگاه پرداخت برقرار نشد. لطفاً دوباره تلاش کنید." };
  }
}

type VerifyResult =
  | { ok: true; refId: string; cardPan?: string; alreadyVerified: boolean; feeRial: number }
  | { ok: false; code?: number; error: string };

/**
 * `amountRial` must come from our stored transaction, never from the request,
 * so a user cannot verify a 1,000,000 Rial authority against a 1,000 Rial row.
 * ZarinPal rejects the mismatch with -33/-50 as a second line of defence.
 *
 * Code 101 means "already verified": the payment is real and must be treated as
 * success, but the caller is responsible for not crediting the wallet twice.
 */
export async function verifyPayment(input: { authority: string; amountRial: bigint }): Promise<VerifyResult> {
  const merchantId = (process.env.ZARINPAL_MERCHANT_ID || "").trim();
  const { configured } = getCryptoPaymentConfiguration();
  if (!configured) return { ok: false, error: "درگاه پرداخت پیکربندی نشده است." };

  try {
    const response = await fetch(endpoints().verify, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: Number(input.amountRial),
        authority: input.authority,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const payload = await response.json().catch(() => null);
    const data = payload?.data;
    const errors = payload?.errors;

    if (data && (data.code === 100 || data.code === 101)) {
      return {
        ok: true,
        refId: String(data.ref_id ?? ""),
        cardPan: data.card_pan ? String(data.card_pan) : undefined,
        alreadyVerified: data.code === 101,
        feeRial: typeof data.fee === "number" ? data.fee : 0,
      };
    }

    const code = typeof errors?.code === "number" ? errors.code : data?.code;
    logger.error({ code, status: response.status }, "ZarinPal verification failed");
    return { ok: false, code, error: cryptopaymentErrorMessage(code) };
  } catch (error) {
    logger.error({ error }, "ZarinPal verification error");
    return { ok: false, error: "تأیید پرداخت با خطا مواجه شد." };
  }
}

export type InquiryResult =
  | { ok: true; status: string; paid: boolean; refId?: string }
  | { ok: false; code?: number; error: string };

/**
 * Ask ZarinPal what actually happened to an authority.
 *
 * The callback is the happy path, but it only runs if the user's browser comes
 * back. When they close the tab on the bank page the money can already be
 * taken while our row sits "pending" forever. This is the out-of-band question
 * that tells us which of those two it was, without moving any money itself.
 */
export async function inquirePayment(authority: string): Promise<InquiryResult> {
  const merchantId = (process.env.ZARINPAL_MERCHANT_ID || "").trim();
  const { configured } = getCryptoPaymentConfiguration();
  if (!configured) return { ok: false, error: "درگاه پرداخت پیکربندی نشده است." };

  try {
    const response = await fetch(endpoints().inquiry, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ merchant_id: merchantId, authority }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const payload = await response.json().catch(() => null);
    const data = payload?.data;
    const errors = payload?.errors;

    if (data && data.code === 100) {
      const status = String(data.status ?? "");
      // "PAID" means the card was charged but we never verified it; "VERIFIED"
      // means it is already settled. Anything else was never completed.
      return {
        ok: true,
        status,
        paid: status === "PAID" || status === "VERIFIED",
        refId: data.ref_id ? String(data.ref_id) : undefined,
      };
    }

    const code = typeof errors?.code === "number" ? errors.code : data?.code;
    return { ok: false, code, error: cryptopaymentErrorMessage(code, errors) };
  } catch (error) {
    logger.error({ error }, "ZarinPal inquiry error");
    return { ok: false, error: "استعلام وضعیت پرداخت با خطا مواجه شد." };
  }
}
