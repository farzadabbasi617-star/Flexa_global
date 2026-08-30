export const STORE_DELIVERY_DEADLINE_HOURS = 24;
export const STORE_BUYER_CONFIRMATION_HOURS = 24;

export function canConfirmStoreOrder(status: string, isAdmin = false) {
  return status === "delivered" || (isAdmin && ["paid_escrow", "disputed"].includes(status));
}

export function canRefundStoreOrder(input: {
  status: string;
  actorId: string;
  buyerId: string;
  isAdmin?: boolean;
}) {
  if (input.isAdmin) return ["paid_escrow", "delivered", "disputed"].includes(input.status);
  return input.actorId === input.buyerId && input.status === "paid_escrow";
}

export function deliveryDeadline(from = new Date()) {
  return new Date(from.getTime() + STORE_DELIVERY_DEADLINE_HOURS * 60 * 60 * 1000);
}

export function autoReleaseDeadline(from = new Date()) {
  return new Date(from.getTime() + STORE_BUYER_CONFIRMATION_HOURS * 60 * 60 * 1000);
}
