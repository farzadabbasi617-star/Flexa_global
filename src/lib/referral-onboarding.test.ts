import { describe, expect, it } from "vitest";
import {
  REFERRAL_QUICK_RULES,
  canIssueReferralLink,
  canRedeemToGamingWallet,
  canWithdrawCash,
  hasUsableNationalId,
  missingForCashWithdrawal,
  referralRequirementLabel,
  referralStage,
  type ReferralAccountFacts,
} from "./referral-onboarding";

const noAccount: ReferralAccountFacts = { hasPartner: false };

const quickOnly: ReferralAccountFacts = {
  hasPartner: true,
  quickRulesAcceptedAt: new Date("2026-08-01T10:00:00Z"),
};

const contractSigned: ReferralAccountFacts = {
  ...quickOnly,
  contractAcceptedAt: new Date("2026-08-01T11:00:00Z"),
};

const fullyVerified: ReferralAccountFacts = {
  ...contractSigned,
  nationalId: "0012345678",
  sheba: "IR820540102680020817909002",
};

describe("stage 1: getting a link", () => {
  it("issues a link after nothing more than the short rules", () => {
    // The whole point of the change: no national id, no contract, no OTP.
    expect(canIssueReferralLink(quickOnly)).toBe(true);
    expect(referralStage(quickOnly)).toBe("link_ready");
  });

  it("does not issue a link before the rules are accepted", () => {
    expect(canIssueReferralLink({ hasPartner: true })).toBe(false);
    expect(canIssueReferralLink(noAccount)).toBe(false);
  });

  it("treats a signed full contract as covering the short rules", () => {
    // Users who onboarded under the old flow never saw the short rules and
    // must not be pushed backwards.
    const legacy: ReferralAccountFacts = {
      hasPartner: true,
      contractAcceptedAt: new Date("2026-07-01T00:00:00Z"),
      nationalId: "0012345678",
    };
    expect(canIssueReferralLink(legacy)).toBe(true);
  });

  it("keeps the rule list short enough that people read it", () => {
    expect(REFERRAL_QUICK_RULES.length).toBeLessThanOrEqual(3);
  });
});

describe("stage 2: taking money out", () => {
  it("blocks cash until identity and bank details exist", () => {
    expect(canWithdrawCash(quickOnly)).toBe(false);
    expect(canWithdrawCash(contractSigned)).toBe(false);
    expect(canWithdrawCash({ ...contractSigned, nationalId: "0012345678" })).toBe(false);
    expect(canWithdrawCash(fullyVerified)).toBe(true);
  });

  it("still requires the full contract even with a bank account on file", () => {
    const noContract: ReferralAccountFacts = {
      hasPartner: true,
      quickRulesAcceptedAt: new Date(),
      nationalId: "0012345678",
      sheba: "IR820540102680020817909002",
    };
    expect(canWithdrawCash(noContract)).toBe(false);
  });

  it("allows in-app credit once the contract is signed, without bank details", () => {
    // Nothing leaves Flexa, so no bank identity is needed -- but it is still
    // a transfer of value, so the contract is.
    expect(canRedeemToGamingWallet(contractSigned)).toBe(true);
    expect(canRedeemToGamingWallet(quickOnly)).toBe(false);
  });
});

describe("missingForCashWithdrawal", () => {
  it("lists every step for a brand new user, in order", () => {
    expect(missingForCashWithdrawal(noAccount)).toEqual([
      "quick_rules",
      "contract",
      "national_id",
      "sheba",
    ]);
  });

  it("drops steps as they are completed", () => {
    expect(missingForCashWithdrawal(quickOnly)).toEqual(["contract", "national_id", "sheba"]);
    expect(missingForCashWithdrawal(contractSigned)).toEqual(["national_id", "sheba"]);
    expect(missingForCashWithdrawal(fullyVerified)).toEqual([]);
  });

  it("has Persian copy for every requirement", () => {
    for (const requirement of missingForCashWithdrawal(noAccount)) {
      expect(referralRequirementLabel(requirement).length).toBeGreaterThan(5);
    }
  });
});

describe("hasUsableNationalId", () => {
  it("accepts exactly ten digits and nothing else", () => {
    expect(hasUsableNationalId("0012345678")).toBe(true);
    expect(hasUsableNationalId("123")).toBe(false);
    expect(hasUsableNationalId("00123456789")).toBe(false);
    expect(hasUsableNationalId(null)).toBe(false);
    expect(hasUsableNationalId("00123abc78")).toBe(false);
  });
});

describe("stage transitions", () => {
  it("reports cash_ready only when the user really can be paid", () => {
    expect(referralStage(noAccount)).toBe("anonymous");
    expect(referralStage(quickOnly)).toBe("link_ready");
    expect(referralStage(contractSigned)).toBe("link_ready");
    expect(referralStage(fullyVerified)).toBe("cash_ready");
  });

  it("ignores an empty-string timestamp rather than treating it as accepted", () => {
    expect(referralStage({ hasPartner: true, quickRulesAcceptedAt: "" })).toBe("anonymous");
  });
});
