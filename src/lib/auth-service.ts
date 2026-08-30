import { db } from "@/db";
import { verificationTokens, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { getOtpTokenPepper } from "@/lib/otp-security";

function hashOtpToken(phoneNumber: string, token: string) {
  // Bind the OTP hash to its identifier so the same numeric code for two phone
  // numbers does not produce the same DB value.
  return crypto
    .createHmac("sha256", getOtpTokenPepper())
    .update(`${phoneNumber}:${token}`)
    .digest("hex");
}

export const AuthService = {
  /**
   * Send SMS via FarazSMS Pattern API
   */
  async sendSmsViaFaraz(phoneNumber: string, code: string) {
    const apiKey = process.env.FARAZSMS_API_KEY;
    const patternCode = process.env.FARAZSMS_PATTERN_CODE;
    const sender = process.env.FARAZSMS_SENDER || "+983000505";

    if (!apiKey || !patternCode) {
      console.warn("FarazSMS API Key or Pattern Code missing. SMS not sent.");
      return false;
    }

    try {
      const response = await fetch("https://ippanel.com/services/v1/sms/pattern/normal/send", {
        method: "POST",
        headers: {
          "Authorization": `AccessKey ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pattern_code: patternCode,
          originator: sender,
          recipient: phoneNumber,
          values: {
            code: code, // Make sure your pattern has a %code% variable
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("FarazSMS Error Response:", data);
        return false;
      }
      return true;
    } catch (error) {
      console.error("FarazSMS Connection Error:", error);
      return false;
    }
  },

  /**
   * Generate a 6-digit OTP for Mobile and send it.
   *
   * The plaintext code is never stored in the database. It is returned so a
   * future route can display it in local development if needed; production
   * callers should ignore the return value and rely on SMS delivery.
   */
  async generateVerificationToken(phoneNumber: string) {
    const token = crypto.randomInt(100000, 999999).toString();
    const tokenHash = hashOtpToken(phoneNumber, token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Keep only the latest live OTP for this phone number. This reduces replay
    // and confusion when a user requests multiple SMS codes.
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, phoneNumber));

    await db.insert(verificationTokens).values({
      identifier: phoneNumber,
      token: tokenHash,
      expiresAt,
    });

    await this.sendSmsViaFaraz(phoneNumber, token);

    return token;
  },

  /**
   * Verify the token and update user's phone verification status
   */
  async verifyIdentifier(phoneNumber: string, token: string) {
    const tokenHash = hashOtpToken(phoneNumber, token);
    const [record] = await db.select()
      .from(verificationTokens)
      .where(and(
        eq(verificationTokens.identifier, phoneNumber),
        eq(verificationTokens.token, tokenHash)
      ));

    if (!record || record.expiresAt < new Date()) {
      throw new Error("کد تایید نامعتبر یا منقضی شده است");
    }

    await db.update(users)
      .set({ phoneVerifiedAt: new Date(), isVerified: true })
      .where(eq(users.phoneNumber, phoneNumber));

    await db.delete(verificationTokens).where(eq(verificationTokens.id, record.id));

    return true;
  }
};
