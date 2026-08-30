import type { CodRoomStatus } from "./cod-room-policy";

/**
 * Decides whether one viewer may see a room's join code and password.
 *
 * The room code is the whole product of a paid room: anyone holding it can walk
 * into the lobby without paying. The existing check asked "is this person
 * registered and checked in", which relied on an unwritten assumption that an
 * entry row cannot exist without a payment. That assumption holds today because
 * joinCodRoom debits the wallet inside the same transaction that inserts the
 * entry, but nothing enforced it, so any future path that creates an entry —
 * an admin invite, a migration, a refund left half-applied — would silently
 * hand out the code.
 *
 * This makes payment an explicit condition rather than an inherited one.
 */
export type CodCredentialDenial =
  | "not_registered"
  | "entry_not_active"
  | "not_paid"
  | "not_checked_in"
  | "too_early";

export interface CodCredentialViewer {
  /** Admins and assigned room staff always see the code; they run the lobby. */
  isPrivileged: boolean;
  /** The viewer's entry, or null when they never joined. */
  entry: {
    status: string;
    checkedInAt: Date | string | null;
    /** Set when money actually moved. Null on a free room or a shadow-mode entry. */
    paymentTransactionId: string | null;
    paymentMode: string;
  } | null;
  /** Entry fee in rial. "0" means the room is free, so no payment is expected. */
  entryFeeRial: string;
  revealAt: Date | string | null;
  status: CodRoomStatus | string;
  now?: Date;
}

export interface CodCredentialDecision {
  allowed: boolean;
  reason: CodCredentialDenial | null;
}

/** Entry states that still hold a seat. A refunded seat must lose access. */
const ACTIVE_ENTRY_STATUSES = new Set(["registered", "checked_in", "settled", "no_show"]);

/** Once the lobby is open the code is needed immediately, reveal time or not. */
const LOBBY_LIVE_STATUSES = new Set(["lobby_open", "in_progress", "settling", "completed"]);

function isPaidRoom(entryFeeRial: string) {
  try { return BigInt(entryFeeRial || "0") > BigInt(0); } catch { return false; }
}

export function decideCodCredentialAccess(viewer: CodCredentialViewer): CodCredentialDecision {
  if (viewer.isPrivileged) return { allowed: true, reason: null };

  const entry = viewer.entry;
  if (!entry) return { allowed: false, reason: "not_registered" };

  // Cancelled and refunded seats keep their row for audit, but the person no
  // longer has a place in the lobby.
  if (!ACTIVE_ENTRY_STATUSES.has(entry.status)) {
    return { allowed: false, reason: "entry_not_active" };
  }

  // On a paid room, require proof that money moved. `paymentMode` alone is not
  // enough: a shadow-mode entry never paid, and an entry created outside
  // joinCodRoom would have no transaction at all.
  if (isPaidRoom(viewer.entryFeeRial)) {
    if (entry.paymentMode !== "live" || !entry.paymentTransactionId) {
      return { allowed: false, reason: "not_paid" };
    }
  }

  if (!entry.checkedInAt) return { allowed: false, reason: "not_checked_in" };

  if (LOBBY_LIVE_STATUSES.has(String(viewer.status))) return { allowed: true, reason: null };

  if (!viewer.revealAt) return { allowed: false, reason: "too_early" };
  const reveal = new Date(viewer.revealAt);
  if (Number.isNaN(reveal.getTime())) return { allowed: false, reason: "too_early" };
  const now = viewer.now || new Date();
  return now.getTime() >= reveal.getTime()
    ? { allowed: true, reason: null }
    : { allowed: false, reason: "too_early" };
}

/** Message shown in place of the code, so a player knows what to do next. */
export function codCredentialDenialMessage(reason: CodCredentialDenial | null) {
  switch (reason) {
    case "not_registered":
      return "برای دیدن کد روم باید اول در روم ثبت‌نام کنی.";
    case "entry_not_active":
      return "جایگاه شما در این روم فعال نیست؛ اگر ورودی بازگردانده شده، کد روم نمایش داده نمی‌شود.";
    case "not_paid":
      return "پرداخت ورودی این روم ثبت نشده است. تا تأیید پرداخت، کد روم نمایش داده نمی‌شود.";
    case "not_checked_in":
      return "برای دریافت کد روم باید Check-in کنی تا حضورت تأیید شود.";
    case "too_early":
      return "کد روم در زمان اعلام‌شده و فقط برای بازیکنان Check-in شده نمایش داده می‌شود.";
    default:
      return "";
  }
}
