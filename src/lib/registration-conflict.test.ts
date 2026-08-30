import { describe, expect, it } from "vitest";
import {
  IDENTITY_CONFLICT_MESSAGE,
  USERNAME_CONFLICT_MESSAGE,
  registrationConflictMessage,
} from "./registration-conflict";

const none = {
  usernameTaken: false,
  emailTaken: false,
  phoneTaken: false,
  nationalIdTaken: false,
};

describe("registration conflict messaging", () => {
  it("allows registration when nothing is taken", () => {
    expect(registrationConflictMessage(none)).toBeNull();
  });

  it("names the conflict for username, which is already public", () => {
    expect(registrationConflictMessage({ ...none, usernameTaken: true })).toBe(
      USERNAME_CONFLICT_MESSAGE
    );
  });

  // The point of the fix: an attacker must not be able to tell these apart.
  it("returns one identical message for email, phone and national id", () => {
    const email = registrationConflictMessage({ ...none, emailTaken: true });
    const phone = registrationConflictMessage({ ...none, phoneTaken: true });
    const nationalId = registrationConflictMessage({ ...none, nationalIdTaken: true });

    expect(email).toBe(IDENTITY_CONFLICT_MESSAGE);
    expect(phone).toBe(IDENTITY_CONFLICT_MESSAGE);
    expect(nationalId).toBe(IDENTITY_CONFLICT_MESSAGE);
    expect(new Set([email, phone, nationalId]).size).toBe(1);
  });

  it("never echoes which identity field matched", () => {
    const message = registrationConflictMessage({ ...none, nationalIdTaken: true }) || "";
    expect(message).not.toMatch(/ایمیل|موبایل|کد ملی/);
  });

  it("prefers the username message when a username also collides", () => {
    // Username is safe to disclose, and it is the field the user can actually
    // change, so it stays actionable even alongside an identity conflict.
    expect(
      registrationConflictMessage({ ...none, usernameTaken: true, emailTaken: true })
    ).toBe(USERNAME_CONFLICT_MESSAGE);
  });
});
