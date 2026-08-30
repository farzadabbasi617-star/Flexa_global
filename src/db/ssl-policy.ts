/**
 * تصمیم دربارهٔ استفاده از TLS برای اتصال به دیتابیس.
 *
 * Neon و اکثر دیتابیس‌های مدیریت‌شده گواهی معتبر ارائه می‌دهند، پس تأیید
 * گواهی باید روشن بماند. ولی یک PostgreSQL که روی همین ماشین و از طریق
 * loopback در دسترس است، چیزی برای رمزنگاری ندارد: ترافیک هرگز از سرور
 * خارج نمی‌شود و نصب استاندارد محلی هیچ گواهی‌ای ارائه نمی‌دهد.
 *
 * اجبار TLS در آن حالت با خطای «self-signed certificate» شکست می‌خورد و
 * برنامه با pool مرده بالا می‌آید — دقیقاً همان چیزی که موقع مهاجرت به VPS
 * اتفاق افتاد: psql روی همان سرور کار می‌کرد ولی /api/health خطای
 * DATABASE_CONNECTION_FAILED می‌داد.
 *
 * قاعده عمداً محدود است: TLS فقط برای loopback کنار گذاشته می‌شود. هر میزبان
 * دیگری — حتی آی‌پی شبکهٔ داخلی — تأیید کامل گواهی را نگه می‌دارد، چون آنجا
 * ترافیک واقعاً از شبکه عبور می‌کند.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const FORCE_OFF = new Set(["disable", "false", "off"]);
const FORCE_ON = new Set(["require", "true", "on"]);

export function shouldUseSsl(
  url: string | undefined | null,
  env: { DB_SSL?: string } = process.env as { DB_SSL?: string },
): boolean {
  const forced = (env.DB_SSL || "").trim().toLowerCase();
  if (FORCE_OFF.has(forced)) return false;
  if (FORCE_ON.has(forced)) return true;

  if (!url) return true;

  try {
    const { hostname } = new URL(url);
    return !LOOPBACK_HOSTS.has(hostname);
  } catch {
    // URL غیرقابل تجزیه: به حالت امن برگرد، نه اینکه بی‌صدا رمزنگاری را حذف کنیم.
    return true;
  }
}
