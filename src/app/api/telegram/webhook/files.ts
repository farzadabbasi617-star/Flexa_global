import { telegramApi } from "@/lib/telegram";

interface TelegramFileInfo {
  file_path?: string;
  file_size?: number;
}

async function getTelegramFileInfo(fileId: string) {
  const result = await telegramApi<TelegramFileInfo>("getFile", { file_id: fileId });
  if (!result.ok || !result.result.file_path) throw new Error("TELEGRAM_FILE_NOT_FOUND");
  return result.result;
}

async function downloadTelegramImage(fileId: string, maxBytes: number, sizeError: string, typeError: string) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is missing");

  const fileInfo = await getTelegramFileInfo(fileId);
  const filePath = fileInfo.file_path!;
  if (Number(fileInfo.file_size || 0) > maxBytes) throw new Error(sizeError);

  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { cache: "no-store" });
  if (!response.ok) throw new Error("TELEGRAM_FILE_DOWNLOAD_FAILED");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error(typeError);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error(sizeError);
  return {
    buffer,
    contentType,
    size: buffer.byteLength,
    fileName: filePath.split("/").pop() || "telegram-image.jpg",
  };
}


export async function downloadTelegramQrPhoto(fileId: string) {
  const file = await downloadTelegramImage(fileId, 2.5 * 1024 * 1024, "QR_TOO_LARGE", "INVALID_QR_TYPE");
  return {
    buffer: file.buffer,
    contentType: file.contentType,
    size: file.size,
    fileName: file.fileName,
  };
}

export async function downloadTelegramPhotoAsDataUrl(fileId: string) {
  const file = await downloadTelegramImage(fileId, 1.2 * 1024 * 1024, "RECEIPT_TOO_LARGE", "INVALID_RECEIPT_TYPE");
  return {
    dataUrl: `data:${file.contentType};base64,${file.buffer.toString("base64")}`,
    contentType: file.contentType,
    size: file.size,
    fileName: file.fileName,
  };
}
