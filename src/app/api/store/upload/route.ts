import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// Slightly smaller direct cap than admin uploads (data-URLs are stored inline).
const MAX_DIRECT_SIZE = 1.6 * 1024 * 1024;
const MAX_CLOUD_SIZE = 6 * 1024 * 1024;
const ALLOWED_PURPOSES = new Set(["listing", "kyc"]);

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
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
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:upload:${user.id}:${ip}`, 40, 60 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد آپلودها زیاد است. بعداً تلاش کنید." }, { status: 429 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const purpose = String(form.get("purpose") || "listing");
    if (!ALLOWED_PURPOSES.has(purpose)) {
      return NextResponse.json({ error: "نوع آپلود نامعتبر است" }, { status: 400 });
    }
    if (!(file instanceof File)) return NextResponse.json({ error: "فایلی انتخاب نشده است" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "فقط تصویر مجاز است" }, { status: 400 });

    // KYC images go to a private/separate folder so they are not mixed with public media.
    const folder = purpose === "kyc" ? `flexa/kyc/${user.id}` : `flexa/store/${user.id}`;

    if (hasCloudinaryConfig()) {
      if (file.size > MAX_CLOUD_SIZE) {
        return NextResponse.json({ error: "حجم تصویر بیش از حد مجاز است (حداکثر ۶ مگابایت)" }, { status: 400 });
      }
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
      if (!res.ok) {
        return NextResponse.json({ error: data.error?.message || "آپلود ناموفق بود" }, { status: 400 });
      }
      return NextResponse.json({ url: data.secure_url, provider: "cloudinary" });
    }

    if (file.size > MAX_DIRECT_SIZE) {
      return NextResponse.json(
        { error: "حجم تصویر زیاد است. لطفاً تصویر کوچک‌تری انتخاب کنید." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
    return NextResponse.json({ url: dataUrl, provider: "data-url" });
  } catch (err) {
    logger.error({ err }, "Store upload failed");
    return NextResponse.json({ error: "خطا در آپلود تصویر" }, { status: 500 });
  }
}
