# راهنمای Deploy پروژه Gament روی Render

> این فایل عمداً هیچ کلید یا رمز واقعی ندارد. Secretها را فقط داخل داشبورد Render وارد کنید و داخل GitHub کامیت نکنید.

## 1) تنظیمات Web Service در Render

در سرویس Render پروژه:

- **Build Command**

```bash
npm ci --include=dev && npm run build
```

- **Start Command**

```bash
npm run start
```

- **Health Check Path**

```txt
/api/health
```

اگر Render در آینده با port مشکل داشت، Start Command را به این تغییر دهید:

```bash
npm run start -- -p $PORT
```

## 2) Environment Variables

در مسیر زیر در داشبورد Render:

```txt
Web Service → Environment → Add Environment Variable
```

این متغیرها را اضافه کنید. مقدارها را بدون کوتیشن `"` وارد کنید.

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=verify-full
OPENROUTER_API_KEY=your_openrouter_key
GROQ_API_KEY=your_groq_key
NODE_ENV=production
ADMIN_SETUP_SECRET=your_long_random_bootstrap_secret
OTP_TOKEN_PEPPER=your_different_long_random_otp_hash_pepper
CLASH_ROYALE_API_TOKEN=your_supercell_api_token
CLASH_ROYALE_API_BASE_URL=https://proxy.royaleapi.dev/v1
EMAIL_PROVIDER=google_apps_script
GOOGLE_APPS_SCRIPT_EMAIL_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GOOGLE_APPS_SCRIPT_EMAIL_SECRET=your_long_random_shared_secret
BOT_TOKEN=telegram_bot_token_from_botfather
TELEGRAM_WEBHOOK_SECRET=your_long_random_webhook_secret
TELEGRAM_ADMIN_IDS=your_numeric_telegram_id
TELEGRAM_CHANNEL_URL=https://t.me/Flexa_games
TELEGRAM_CHANNEL_ID=@Flexa_games
TELEGRAM_CRON_SECRET=your_long_random_cron_secret
TELEGRAM_SETUP_SECRET=your_different_long_random_setup_secret
# Optional trusted public Telegram news channels:
GAMING_NEWS_TELEGRAM_CHANNELS=clash_royale:channel_one,cod_mobile:channel_two,fortnite:channel_three
# Optional legacy Python-worker integration:
TELEGRAM_INTEGRATION_SECRET=your_long_random_secret
```

فعلاً چون SMS/OTP هنوز فعال نشده، FarazSMS اختیاری است:

```env
FARAZSMS_API_KEY=optional_for_now
FARAZSMS_PATTERN_CODE=optional_for_now
FARAZSMS_SENDER=+983000505
```

نکته مهم برای Neon:

- مقدار `DATABASE_URL` باید URL خام PostgreSQL باشد.
- اگر جایی URL تبدیل به لینک Markdown شد و داخلش `[]` یا `mailto:` آمد، آن مقدار اشتباه است.
- فرمت درست باید شبیه این باشد:

```txt
postgresql://neondb_owner:<PASSWORD>@<HOST>/neondb?sslmode=verify-full
```

## 3) زمان‌بندی رایگان Automation با GitHub Actions

Render Free اجرای Cron داخلی تضمین‌شده ندارد و سرویس هنگام بی‌کاری Sleep می‌شود. فایل
`.github/workflows/telegram-cron.yml` هر پنج دقیقه endpoint محافظت‌شده Automation را اجرا می‌کند.

در GitHub این مسیر را باز کنید:

```txt
Repository → Settings → Secrets and variables → Actions → New repository secret
```

دو Secret زیر را بسازید:

```txt
Name: TELEGRAM_CRON_SECRET
Value: همان مقدار TELEGRAM_CRON_SECRET در Render
```

```txt
Name: TELEGRAM_CRON_URL
Value: https://YOUR-SERVICE.onrender.com/api/telegram/cron
```

آدرس `onrender.com` را از بالای صفحه سرویس Gament در Render کپی کنید. از دامنه `gament1.ir` برای Cron استفاده نکنید، چون Cloudflare درخواست‌های GitHub Actions را Challenge می‌کند. آدرس مستقیم Render را عمومی یا داخل Commit قرار ندهید.

مقدار Secret را در فایل، Commit، چت یا URL عمومی قرار ندهید. Workflow Secret احراز هویت را فقط در Header زیر می‌فرستد:

```txt
Authorization: Bearer <secret>
```

برای تست دستی بدون منتظرماندن تا نوبت بعدی:

```txt
GitHub → Actions → Telegram automation cron → Run workflow
```

این Automation شامل یادآوری‌ها، چک‌این و No-show، ارسال اطلاعات ورود، Ready Timeout، بررسی دوره‌ای Battle Log، اعلان پایان تورنمنت و پردازش Outbox است.

## 4) ساخت جدول‌های دیتابیس

بعد از ست کردن `DATABASE_URL`، باید schema دیتابیس ساخته شود.

### روش ساده برای شروع

روی سیستم خودتان یا Render Shell این دستور را اجرا کنید:

```bash
npm run db:push
```

برای دیتابیس production بهتر است قبل از اجرای push مطمئن شوید دیتابیس خالی است یا backup دارید.

> **مهم برای Production:** اجرای `db:push` از Build Command حذف شده است. تغییر Schema باید فقط با Backup و اجرای Migration بازبینی‌شده انجام شود تا هر Deploy عادی نتواند ناخواسته ساختار یا داده‌های مالی را تغییر دهد.

### migration دستی اتصال تلگرام

اگر دیتابیس از قبل ساخته شده، برای جدول پیش‌ثبت‌نام و وضعیت مکالمه تلگرام این SQLها را هم اجرا کنید:

```bash
psql "$DATABASE_URL" -f drizzle/manual/0002_add_telegram_pre_registrations.sql
psql "$DATABASE_URL" -f drizzle/manual/0003_add_telegram_bot_sessions.sql
psql "$DATABASE_URL" -f drizzle/manual/0004_add_telegram_account_linking.sql
psql "$DATABASE_URL" -f drizzle/manual/0005_add_telegram_growth_and_notifications.sql
psql "$DATABASE_URL" -f drizzle/manual/0006_add_telegram_marketing_and_waitlist.sql
psql "$DATABASE_URL" -f drizzle/manual/0009_sync_core_schema.sql
psql "$DATABASE_URL" -f drizzle/manual/0010_harden_registration_integrity.sql
psql "$DATABASE_URL" -f drizzle/manual/0024_add_telegram_reliability.sql
psql "$DATABASE_URL" -f drizzle/manual/0025_repair_wallet_money_types.sql
psql "$DATABASE_URL" -f drizzle/manual/0026_repair_telegram_sent_notifications.sql
psql "$DATABASE_URL" -f drizzle/manual/0027_add_match_result_claims.sql
psql "$DATABASE_URL" -f drizzle/manual/0028_add_private_tournament_leaderboards.sql
psql "$DATABASE_URL" -f drizzle/manual/0029_add_private_tournament_attendance.sql
psql "$DATABASE_URL" -f drizzle/manual/0030_add_clash_ready_and_tournament_end.sql
psql "$DATABASE_URL" -f drizzle/manual/0031_add_store_order_deadlines.sql
```

یا محتوای همین فایل‌ها را در SQL Editor دیتابیس paste و اجرا کنید.

بعد از Deploy، webhook را با BotFather/API تلگرام ست کنید:

```txt
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://www.gament1.ir/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

## 5) Redeploy

بعد از تنظیم env و ساخت دیتابیس:

```txt
Manual Deploy → Deploy latest commit
```

سپس Health Check را تست کنید:

```txt
https://YOUR_RENDER_DOMAIN/api/health
```

اگر خروجی این بود یعنی اتصال دیتابیس درست است:

```json
{ "ok": true, "database": true, "release": "COMMIT_SHA" }
```

سپس گیت غیرمخرب بهره‌برداری عمومی را اجرا کنید:

```bash
npm run test:production
```

این تست صفحات عمومی، Health دیتابیس/ایمیل/تلگرام، هدرهای امنیتی، عدم نشت اطلاعات خصوصی، Pagination، مرزهای احراز هویت و Assetهای اصلی را بررسی می‌کند و هیچ کاربر یا تراکنشی ایجاد نمی‌کند. GitHub Actions نیز آن را زمان‌بندی‌شده و با اجرای دستی بررسی می‌کند؛ این تست عمداً جزو Checkهای قبل از Deploy نیست تا با تنظیم «Deploy after CI checks pass» در Render حلقه انتظار ایجاد نکند.

## 6) نکته امنیتی

اگر کلید API یا URL دیتابیس را جایی خارج از Render وارد کرده‌اید یا در چت/اسکرین‌شات/گیت منتشر شده، بعد از راه‌اندازی آن‌ها را Rotate کنید.
