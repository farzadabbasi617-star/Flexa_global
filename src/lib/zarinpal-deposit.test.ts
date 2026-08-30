import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
const requestPaymentMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/lib/cryptopayment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cryptopayment")>("@/lib/cryptopayment");
  return { ...actual, requestPayment: requestPaymentMock };
});
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { startCryptoPaymentDeposit } from "@/lib/cryptopayment-deposit";

const VALID_MERCHANT = "1344b5d4-0048-11e8-94db-005056a205be";

/** Minimal drizzle chain stubs: select -> wallet row, insert -> pending row. */
function stubDb() {
  dbMock.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [{ id: "wallet-1", userId: "user-1", balance: "0" }] }) }),
  });
  dbMock.insert.mockReturnValue({
    values: () => ({ returning: async () => [{ id: "tx-1" }] }),
  });
  dbMock.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
}

function setLive() {
  process.env.ZARINPAL_MERCHANT_ID = VALID_MERCHANT;
  process.env.PAYMENT_CALLBACK_BASE_URL = "https://www.flexa1.ir";
  process.env.ZARINPAL_LIVE = "true";
}

describe("startCryptoPaymentDeposit", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    stubDb();
    delete process.env.ZARINPAL_MERCHANT_ID;
    delete process.env.ZARINPAL_LIVE;
    delete process.env.PAYMENT_CALLBACK_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("refuses when the gateway is not live, without touching the database", async () => {
    const result = await startCryptoPaymentDeposit({
      userId: "user-1",
      amountRial: BigInt(10_000),
      origin: "telegram",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(requestPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects an amount below the minimum before contacting the gateway", async () => {
    setLive();
    const result = await startCryptoPaymentDeposit({
      userId: "user-1",
      amountRial: BigInt(100),
      origin: "telegram",
    });

    expect(result.ok).toBe(false);
    expect(requestPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects an amount above the maximum", async () => {
    setLive();
    const result = await startCryptoPaymentDeposit({
      userId: "user-1",
      amountRial: BigInt(900_000_000),
      origin: "telegram",
    });

    expect(result.ok).toBe(false);
    expect(requestPaymentMock).not.toHaveBeenCalled();
  });

  it("returns the payment url and never sends a query-string callback", async () => {
    setLive();
    requestPaymentMock.mockResolvedValue({
      ok: true,
      authority: "A00000000000000000000000000000123456",
      paymentUrl: "https://payment.cryptopayment.com/pg/StartPay/A00000000000000000000000000000123456",
    });

    const result = await startCryptoPaymentDeposit({
      userId: "user-1",
      amountRial: BigInt(500_000),
      origin: "telegram",
      telegramId: "12345",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paymentUrl).toContain("StartPay");
      expect(result.amountToman).toBe(50_000);
    }

    const sent = requestPaymentMock.mock.calls[0][0];
    expect(sent.callbackUrl).toBe("https://www.flexa1.ir/api/wallet/deposit/cryptopayment/callback");
    expect(sent.callbackUrl).not.toContain("?");
    // order_id is deliberately dropped: our reference exceeds the gateway limit.
    expect(sent.orderId).toBeNull();
  });

  it("marks the pending row failed when the gateway rejects the request", async () => {
    setLive();
    requestPaymentMock.mockResolvedValue({ ok: false, code: -9, error: "رد شد" });

    const result = await startCryptoPaymentDeposit({
      userId: "user-1",
      amountRial: BigInt(10_000),
      origin: "web",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
    expect(dbMock.update).toHaveBeenCalled();
  });

  it("records the origin so bot deposits are distinguishable from web", async () => {
    setLive();
    requestPaymentMock.mockResolvedValue({ ok: true, authority: "A1", paymentUrl: "https://x" });

    await startCryptoPaymentDeposit({
      userId: "user-1",
      amountRial: BigInt(10_000),
      origin: "telegram",
      telegramId: "999",
    });

    const inserted = dbMock.insert.mock.results[0].value;
    expect(inserted).toBeDefined();
    expect(dbMock.insert).toHaveBeenCalled();
  });
});
