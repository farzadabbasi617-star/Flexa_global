import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_DIRECT_SIZE = 1.2 * 1024 * 1024;
const MAX_CLOUD_SIZE = 8 * 1024 * 1024;

function hasCloudinaryConfig() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

function signCloudinary(params: Record<string, string>, secret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(payload + secret).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "uploads");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const form = await request.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "flexa").replace(/[^a-zA-Z0-9_/-]/g, "").slice(0, 80) || "flexa";

    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "فقط تصویر مجاز است" }, { status: 400 });

    if (hasCloudinaryConfig()) {
      if (file.size > MAX_CLOUD_SIZE) return NextResponse.json({ error: "حجم تصویر بیش از حد مجاز است" }, { status: 400 });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
      const apiKey = process.env.CLOUDINARY_API_KEY!;
      const apiSecret = process.env.CLOUDINARY_API_SECRET!;
      const params = { folder, timestamp };
      const signature = signCloudinary(params, apiSecret);

      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("api_key", apiKey);
      uploadForm.append("timestamp", timestamp);
      uploadForm.append("folder", folder);
      uploadForm.append("signature", signature);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: uploadForm,
      });
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ error: data.error?.message || "Cloudinary upload failed" }, { status: 400 });

      await logAdminAction({
        adminId: auth.user.id,
        action: "upload",
        entityType: "image",
        entityId: data.public_id,
        metadata: { provider: "cloudinary", bytes: file.size, url: data.secure_url },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ url: data.secure_url, provider: "cloudinary", publicId: data.public_id });
    }

    if (file.size > MAX_DIRECT_SIZE) {
      return NextResponse.json({
        error: "برای آپلود مستقیم بدون Cloudinary حجم باید کمتر از ۱.۲ مگابایت باشد. برای فایل بزرگ، لینک مستقیم تصویر را وارد کن یا Cloudinary را تنظیم کن.",
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

    await logAdminAction({
      adminId: auth.user.id,
      action: "upload_data_url",
      entityType: "image",
      metadata: { provider: "database-data-url", bytes: file.size, type: file.type },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ url: dataUrl, provider: "data-url" });
  } catch (err) {
    logger.error({ err }, "Admin upload failed");
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
