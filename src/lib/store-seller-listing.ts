/**
 * Rules for what a seller may do to their own listing.
 *
 * Sellers previously had no control at all: /api/store/listings/[id] exposed
 * only GET, so once an ad was posted the seller could not fix a price, update
 * stock, or take it down when the item was gone. Their only recourse was to
 * message an admin.
 *
 * Kept as pure functions because the interesting part is the state machine, and
 * a wrong answer here either lets someone edit a stranger's ad or silently
 * re-opens a rejected one.
 */

/** Statuses a seller is allowed to edit the content of. */
const EDITABLE_STATUSES = new Set(["draft", "pending_review", "active", "paused", "sold_out"]);

/** Statuses that may be toggled between visible and hidden. */
const PAUSABLE_STATUSES = new Set(["active", "sold_out"]);
const RESUMABLE_STATUSES = new Set(["paused"]);

/** Statuses a seller may archive (their version of delete). */
const ARCHIVABLE_STATUSES = new Set(["draft", "pending_review", "active", "paused", "sold_out", "rejected"]);

export type SellerListingAction = "update" | "pause" | "resume" | "archive";

export interface SellerListingState {
  sellerId: string | null;
  source: string;
  status: string;
}

export interface SellerActionVerdict {
  allowed: boolean;
  /** HTTP status to answer with when not allowed. */
  status?: number;
  error?: string;
}

/**
 * Ownership is checked before status so a stranger probing another seller's
 * listing gets 404 and cannot learn its state.
 */
export function canSellerActOnListing(
  listing: SellerListingState,
  actorId: string,
  action: SellerListingAction
): SellerActionVerdict {
  // Official Flexa stock is managed from the admin panel, never by a seller.
  if (listing.source !== "user" || !listing.sellerId || listing.sellerId !== actorId) {
    return { allowed: false, status: 404, error: "آگهی یافت نشد." };
  }

  if (listing.status === "archived") {
    return { allowed: false, status: 409, error: "این آگهی حذف شده است." };
  }

  switch (action) {
    case "update":
      if (!EDITABLE_STATUSES.has(listing.status)) {
        return { allowed: false, status: 409, error: "این آگهی قابل ویرایش نیست." };
      }
      return { allowed: true };

    case "pause":
      if (!PAUSABLE_STATUSES.has(listing.status)) {
        return { allowed: false, status: 409, error: "فقط آگهی فعال را می‌توان موقتاً غیرفعال کرد." };
      }
      return { allowed: true };

    case "resume":
      if (!RESUMABLE_STATUSES.has(listing.status)) {
        return { allowed: false, status: 409, error: "این آگهی غیرفعال نیست." };
      }
      return { allowed: true };

    case "archive":
      if (!ARCHIVABLE_STATUSES.has(listing.status)) {
        return { allowed: false, status: 409, error: "این آگهی قابل حذف نیست." };
      }
      return { allowed: true };
  }
}

/**
 * Status after a seller edit.
 *
 * An approved listing that gets materially changed must go back to review,
 * otherwise "post something harmless, get approved, then rewrite it" is a
 * trivial way to publish unreviewed content. Stock-only changes are exempt:
 * restocking is the single most common edit and forcing a re-review for it
 * would push sellers to just delete and repost.
 */
export function statusAfterSellerEdit(currentStatus: string, materialChange: boolean): string {
  if (!materialChange) {
    // Selling out and restocking flips between these two automatically.
    return currentStatus;
  }
  if (currentStatus === "active" || currentStatus === "paused" || currentStatus === "sold_out") {
    return "pending_review";
  }
  return currentStatus;
}

/**
 * A change is "material" if it alters what the buyer is being sold or for how
 * much. Stock and image order are not.
 */
export function isMaterialListingChange(
  before: { title: string; description: string | null; priceRial: string; deliveryNotes: string | null },
  after: { title?: string; description?: string | null; priceRial?: string; deliveryNotes?: string | null }
): boolean {
  if (after.title !== undefined && after.title !== before.title) return true;
  if (after.description !== undefined && (after.description ?? "") !== (before.description ?? "")) return true;
  if (after.priceRial !== undefined && after.priceRial !== before.priceRial) return true;
  if (after.deliveryNotes !== undefined && (after.deliveryNotes ?? "") !== (before.deliveryNotes ?? "")) return true;
  return false;
}
