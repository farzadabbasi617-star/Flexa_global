import { describe, expect, it } from "vitest";
import { autoReleaseDeadline, canConfirmStoreOrder, canRefundStoreOrder, deliveryDeadline } from "@/lib/store-order-policy";

describe("store escrow order policy", () => {
  it("lets buyers confirm only after delivery", () => {
    expect(canConfirmStoreOrder("paid_escrow")).toBe(false);
    expect(canConfirmStoreOrder("delivered")).toBe(true);
    expect(canConfirmStoreOrder("paid_escrow", true)).toBe(true);
    expect(canConfirmStoreOrder("disputed", true)).toBe(true);
  });

  it("prevents sellers or unrelated users from refunding an order", () => {
    expect(canRefundStoreOrder({ status: "paid_escrow", actorId: "buyer", buyerId: "buyer" })).toBe(true);
    expect(canRefundStoreOrder({ status: "paid_escrow", actorId: "seller", buyerId: "buyer" })).toBe(false);
    expect(canRefundStoreOrder({ status: "delivered", actorId: "buyer", buyerId: "buyer" })).toBe(false);
    expect(canRefundStoreOrder({ status: "disputed", actorId: "admin", buyerId: "buyer", isAdmin: true })).toBe(true);
  });

  it("sets deterministic 24-hour deadlines", () => {
    const start = new Date("2026-07-18T00:00:00.000Z");
    expect(deliveryDeadline(start).toISOString()).toBe("2026-07-19T00:00:00.000Z");
    expect(autoReleaseDeadline(start).toISOString()).toBe("2026-07-19T00:00:00.000Z");
  });
});
