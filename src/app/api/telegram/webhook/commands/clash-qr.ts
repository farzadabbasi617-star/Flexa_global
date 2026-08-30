import { extractInviteReference } from "../utils";
import { isSupportedClashInvite } from "./clash-1v1-policy";

export type ClashQrImageResult = {
  inviteLink: string | null;
};

/**
 * Reads a Clash Royale Add Friend QR locally. The original Telegram file ID
 * is separately retained by the queue so its image can be relayed to the
 * opponent if decoding fails. No QR/photo is sent to a third-party service.
 *
 * `jsqr` and `jimp` are imported lazily so they are only ever loaded when a
 * QR photo actually arrives at runtime. This keeps them out of the eager
 * module graph, lowering the production build's peak memory (Render Free OOM).
 */
export async function decodeClashFriendQr(buffer: Buffer, contentType: string): Promise<ClashQrImageResult> {
  void contentType;
  try {
    const [{ Jimp }, jsQRModule] = await Promise.all([
      import("jimp"),
      import("jsqr"),
    ]);
    const jsQR = jsQRModule.default;
    const image = await Jimp.read(buffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    if (width < 32 || height < 32 || width > 4096 || height > 4096) return { inviteLink: null };

    const qr = jsQR(new Uint8ClampedArray(image.bitmap.data), width, height, {
      inversionAttempts: "attemptBoth",
    });
    const candidate = extractInviteReference(qr?.data || "");
    return { inviteLink: isSupportedClashInvite(candidate) ? candidate : null };
  } catch {
    // The photo can still be sent as the opponent's actual QR even if its QR
    // pixels cannot be decoded on this server.
    return { inviteLink: null };
  }
}
