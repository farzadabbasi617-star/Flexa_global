import { describe, expect, it } from "vitest";
import {
  canSellerActOnListing,
  isMaterialListingChange,
  statusAfterSellerEdit,
} from "./store-seller-listing";

const SELLER = "seller-1";
const OTHER = "seller-2";

const listing = (over: Partial<{ sellerId: string | null; source: string; status: string }> = {}) => ({
  sellerId: SELLER,
  source: "user",
  status: "active",
  ...over,
});

describe("canSellerActOnListing", () => {
  it("lets a seller manage their own active listing", () => {
    for (const action of ["update", "pause", "archive"] as const) {
      expect(canSellerActOnListing(listing(), SELLER, action).allowed).toBe(true);
    }
  });

  // Ownership is checked before status so probing cannot reveal that a listing
  // exists, let alone what state it is in.
  it("answers 404 for someone else's listing", () => {
    const verdict = canSellerActOnListing(listing(), OTHER, "update");
    expect(verdict.allowed).toBe(false);
    expect(verdict.status).toBe(404);
  });

  it("refuses to let a seller touch official Flexa stock", () => {
    const verdict = canSellerActOnListing(
      listing({ source: "official", sellerId: null }),
      SELLER,
      "update"
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.status).toBe(404);
  });

  it("treats an archived listing as gone", () => {
    for (const action of ["update", "pause", "resume", "archive"] as const) {
      expect(canSellerActOnListing(listing({ status: "archived" }), SELLER, action).allowed).toBe(false);
    }
  });

  it("only pauses something that is actually visible", () => {
    expect(canSellerActOnListing(listing({ status: "active" }), SELLER, "pause").allowed).toBe(true);
    expect(canSellerActOnListing(listing({ status: "paused" }), SELLER, "pause").allowed).toBe(false);
    expect(canSellerActOnListing(listing({ status: "rejected" }), SELLER, "pause").allowed).toBe(false);
  });

  it("only resumes something that is paused", () => {
    expect(canSellerActOnListing(listing({ status: "paused" }), SELLER, "resume").allowed).toBe(true);
    expect(canSellerActOnListing(listing({ status: "active" }), SELLER, "resume").allowed).toBe(false);
  });

  it("lets a rejected listing be archived but not edited back to life", () => {
    expect(canSellerActOnListing(listing({ status: "rejected" }), SELLER, "archive").allowed).toBe(true);
    expect(canSellerActOnListing(listing({ status: "rejected" }), SELLER, "update").allowed).toBe(false);
  });

  it("allows editing a listing still awaiting review", () => {
    expect(canSellerActOnListing(listing({ status: "pending_review" }), SELLER, "update").allowed).toBe(true);
  });
});

describe("statusAfterSellerEdit", () => {
  // Otherwise: post something harmless, get approved, rewrite it into anything.
  it("sends an approved listing back to review after a material change", () => {
    expect(statusAfterSellerEdit("active", true)).toBe("pending_review");
    expect(statusAfterSellerEdit("paused", true)).toBe("pending_review");
    expect(statusAfterSellerEdit("sold_out", true)).toBe("pending_review");
  });

  it("leaves status alone for a stock-only edit", () => {
    expect(statusAfterSellerEdit("active", false)).toBe("active");
    expect(statusAfterSellerEdit("paused", false)).toBe("paused");
  });

  it("does not promote a listing that was never approved", () => {
    expect(statusAfterSellerEdit("pending_review", true)).toBe("pending_review");
    expect(statusAfterSellerEdit("draft", true)).toBe("draft");
  });
});

describe("isMaterialListingChange", () => {
  const before = {
    title: "1000 gems",
    description: "fast",
    priceRial: "500000",
    deliveryNotes: "send id",
  };

  it("flags price, title, description and delivery changes", () => {
    expect(isMaterialListingChange(before, { priceRial: "900000" })).toBe(true);
    expect(isMaterialListingChange(before, { title: "5000 gems" })).toBe(true);
    expect(isMaterialListingChange(before, { description: "slow" })).toBe(true);
    expect(isMaterialListingChange(before, { deliveryNotes: "different" })).toBe(true);
  });

  it("does not flag an unchanged field that was merely resubmitted", () => {
    expect(isMaterialListingChange(before, { title: "1000 gems", priceRial: "500000" })).toBe(false);
  });

  it("does not flag a stock-only edit", () => {
    expect(isMaterialListingChange(before, {})).toBe(false);
  });

  it("treats null and empty description as the same", () => {
    expect(isMaterialListingChange({ ...before, description: null }, { description: "" })).toBe(false);
  });
});
