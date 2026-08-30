import { channelUrl } from "@/lib/telegram-channel";
export const APP_URL = (process.env.APP_URL || "https://www.flexa1.ir").replace(/\/$/, "");
export const CHANNEL_URL = (process.env.TELEGRAM_CHANNEL_URL || process.env.CHANNEL_URL || channelUrl()).trim();
export const SKIP_TEXT = "رد کردن";
export const CANCEL_TEXT = "لغو";
export const GAMENT_ID_REQUIRED = process.env.GAMENT_ID_REQUIRED === "true" || process.env.TELEGRAM_GAMENT_ID_REQUIRED === "true";

export const GAME_OPTIONS = [
  { id: "cod_mobile", label: "🎯 COD MOBILE", fa: "کالاف موبایل", accountPrompt: "UID یا Username کالاف موبایل را وارد کن." },
  { id: "fortnite", label: "🏗️ FORTNITE", fa: "فورتنایت", accountPrompt: "Epic Games ID یا Username فورتنایت را وارد کن." },
  { id: "clash_royale", label: "👑 CLASH ROYALE", fa: "کلش رویال", accountPrompt: "Player Tag کلش رویال را وارد کن؛ مثل #ABC123." },
];

export const PLATFORM_OPTIONS = ["Mobile", "PC", "Console", "PS5", "PS4", "Xbox", "Nintendo Switch", "Other"];

export const GAME_ALIASES: Record<string, string> = {
  cod: "cod_mobile",
  "cod mobile": "cod_mobile",
  cod_mobile: "cod_mobile",
  "call of duty": "cod_mobile",
  "call of duty mobile": "cod_mobile",
  کالاف: "cod_mobile",
  "کالاف موبایل": "cod_mobile",
  fortnite: "fortnite",
  فورتنایت: "fortnite",
  clash: "clash_royale",
  "clash royale": "clash_royale",
  clash_royale: "clash_royale",
  کلش: "clash_royale",
  "کلش رویال": "clash_royale",
};

export const DEFAULT_RULES = `📜 قوانین خلاصه Flexa

1) Flexa پلتفرم مدیریت، ثبت‌نام، اطلاع‌رسانی، داوری و پشتیبانی تورنومنت‌های گیمینگ است.
2) مسابقات بر پایه مهارت برگزار می‌شوند؛ شرط‌بندی، تبانی مالی، خرید/فروش نتیجه یا قمار ممنوع است.
3) اطلاعات ثبت‌شده شامل شماره تماس، Flexa ID و آیدی بازی باید صحیح و متعلق به خود بازیکن باشد.
4) آیدی بازی در روز مسابقه باید با آیدی ثبت‌شده مطابقت داشته باشد.
5) استفاده از چیت، هک، اسکریپت، سوءاستفاده از باگ، جعل اسکرین‌شات یا هر ابزار غیرمجاز باعث حذف می‌شود.
6) نتیجه مسابقه طبق قوانین همان روم و با مدارک قابل بررسی ثبت می‌شود؛ داوری Flexa ملاک تصمیم نهایی است.
7) بی‌احترامی، تهدید، نشر اطلاعات شخصی، اسپم و تبلیغات بدون مجوز ممنوع است.
8) ثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی و دریافت جایزه از داخل وب‌اپ Flexa انجام می‌شود.`;
