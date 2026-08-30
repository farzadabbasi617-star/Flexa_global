# Gament Telegram Bot ⚡

> ## 🚨 قبل از اجرا حتماً بخوان — خطر از کار افتادن ربات
>
> **این پروژه دو پیاده‌سازی از ربات تورنومنت دارد:**
>
> | | داخل Next.js | همین پوشه (پایتون) |
> |---|---|---|
> | مسیر | `src/app/api/telegram/webhook/` | `telegram_bot/` |
> | حجم | ~۸,۴۰۰ خط | ~۱,۳۷۰ خط |
> | وضعیت | ✅ **فعال و دیپلوی‌شده** | نسخه قدیمی‌تر |
> | روش | Webhook | Polling |
>
> ⚠️ **هر دو را همزمان با یک `BOT_TOKEN` اجرا نکن.**
>
> تلگرام اجازه نمی‌دهد یک توکن هم Webhook داشته باشد هم `getUpdates`.
> نتیجه: خطای `Conflict: terminated by other getUpdates request` و
> **هر دو ربات از کار می‌افتند**.
>
> بدتر: سرویس Next.js موقع بالا آمدن `setWebhook` می‌زند. یعنی حتی اگر
> اول این ربات پایتونی را راه بیندازی، اولین ری‌استارت وب‌اپ آن را می‌کُشد.
>
> **اگر می‌خواهی این نسخه پایتونی را اجرا کنی:**
> 1. یک ربات جدید از [@BotFather](https://t.me/BotFather) بساز → توکن مجزا
> 2. آن توکن را فقط در سرویس worker این ربات بگذار
> 3. هرگز همان توکن را در env وب‌اپ Next.js نگذار
>
> **اگر فقط یک ربات می‌خواهی:** نسخه Next.js را استفاده کن (کامل‌تر است) و
> این پوشه را نادیده بگیر.

---

ربات تلگرام شخصی‌سازی‌شده برای وب‌اپ **Gament — پلتفرم تورنومنت گیمینگ**.

این ربات مکمل وب‌اپ است؛ یعنی:

- روم‌های فعال را از API وب‌اپ Gament می‌خواند.
- بازیکن‌ها را برای تورنومنت‌ها به‌صورت تلگرامی پیش‌ثبت‌نام می‌کند.
- Gament ID، آیدی بازی، شماره تماس، پلتفرم و تیم/کلن را جمع‌آوری می‌کند.
- لینک ثبت‌نام رسمی، پروفایل و ساخت حساب در وب‌اپ را نمایش می‌دهد.
- ادمین می‌تواند خروجی CSV، آمار، قرعه‌کشی ساده و اطلاعیه داشته باشد.

> ثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی، کیف پول و داوری نهایی همچنان داخل وب‌اپ Gament انجام می‌شود.

---

## هماهنگی با سایت فعلی Gament

بر اساس سایت و ریپازیتوری شما، ربات برای این موارد تنظیم شده است:

- برند: `Gament`
- آدرس وب‌اپ: `https://www.gament1.ir`
- بازی‌ها:
  - 🎯 COD MOBILE / کالاف موبایل
  - 🏗️ FORTNITE / فورتنایت
  - 👑 CLASH ROYALE / کلش رویال
- لینک روم‌ها: `/tournaments`
- API روم‌ها: `/api/tournaments?limit=20`
- حساب کاربری و شناسه: `Gament ID` مثل `FLX-1234`
- تاکید روی داوری هوشمند، قوانین ضدتقلب، ثبت آیدی صحیح بازی و ثبت‌نام رسمی از وب‌اپ

---

## امکانات کاربر

- `/start` منوی اصلی
- `/rooms` نمایش روم‌های فعال از وب‌اپ
- `/rooms cod_mobile` روم‌های کالاف موبایل
- `/rooms fortnite` روم‌های فورتنایت
- `/rooms clash_royale` روم‌های کلش رویال
- `/register` پیش‌ثبت‌نام تلگرامی
- `/status` وضعیت پیش‌ثبت‌نام
- `/rules` قوانین خلاصه Gament
- `/links` لینک‌های مهم
- `/unregister` لغو پیش‌ثبت‌نام تلگرامی

---

## امکانات ادمین

- `/admin` راهنمای پنل ادمین
- `/stats` آمار پیش‌ثبت‌نام‌ها
- `/players` نمایش ۲۰ پیش‌ثبت‌نام آخر
- `/players COD MOBILE` نمایش ۲۰ پیش‌ثبت‌نام آخر یک بازی
- `/export` خروجی CSV کامل
- `/draw COD MOBILE` قرعه‌کشی ساده
- `/announce متن اطلاعیه` ارسال اطلاعیه فقط به کاربران پیش‌ثبت‌نام‌شده

---

## نصب و اجرا

### 1) ساخت ربات در BotFather

در تلگرام وارد `@BotFather` شوید:

```text
/newbot
```

توکن ربات را بگیرید.

### 2) گرفتن آیدی ادمین

برای گرفتن آیدی عددی تلگرام خودتان می‌توانید به `@userinfobot` پیام بدهید.

### 3) تنظیم فایل env

```bash
cd tournament_bot
cp .env.example .env
```

فایل `.env` را ویرایش کنید:

```env
BOT_TOKEN=توکن_ربات_از_BotFather
ADMIN_IDS=آیدی_عددی_تلگرام_شما
APP_URL=https://www.gament1.ir
TELEGRAM_INTEGRATION_SECRET=همان_کلیدی_که_در_وب‌اپ_می‌گذارید
```

اگر خواستید Gament ID برای پیش‌ثبت‌نام اجباری باشد:

```env
GAMENT_ID_REQUIRED=true
```

### 4) نصب وابستگی‌ها

```bash
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

pip install -r requirements.txt
```

### 5) اجرا

```bash
python bot.py
```

بعد در تلگرام ربات را باز کنید و `/start` را بزنید.

---

## دیتابیس و خروجی

- دیتابیس پیش‌فرض: `gament_telegram_bot.db`
- خروجی CSV در پوشه `exports/` ساخته می‌شود.
- خروجی شامل این ستون‌هاست:
  - Telegram ID
  - Username
  - Gament ID
  - نام نمایشی/نام کامل
  - شماره تماس
  - بازی
  - پلتفرم
  - آیدی بازی
  - شهر
  - تیم/کلن
  - وضعیت

---

## نکته مهم درباره اتصال عمیق به وب‌اپ

در نسخه فعلی، ربات اطلاعات پیش‌ثبت‌نام را هم در SQLite خودش نگه می‌دارد و هم، در صورت تنظیم `TELEGRAM_INTEGRATION_SECRET`، به وب‌اپ Gament ارسال می‌کند.

API امن وب‌اپ:

```text
POST /api/integrations/telegram/pre-registrations
```

برای فعال‌سازی Sync، همین مقدار Secret را در هر دو پروژه تنظیم کنید:

```env
# در gament و tournament_bot
TELEGRAM_INTEGRATION_SECRET=یک_کلید_طولانی_و_تصادفی
```

بعد از اجرای migration وب‌اپ، پیش‌ثبت‌نام‌ها در پنل ادمین سایت، تب «تلگرام»، نمایش داده می‌شوند.

---

## اجرای دائم روی VPS با systemd، اختیاری

```ini
[Unit]
Description=Gament Telegram Bot
After=network.target

[Service]
WorkingDirectory=/path/to/tournament_bot
ExecStart=/path/to/tournament_bot/.venv/bin/python /path/to/tournament_bot/bot.py
Restart=always
RestartSec=5
User=ubuntu

[Install]
WantedBy=multi-user.target
```

سپس:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gament-telegram-bot
sudo systemctl start gament-telegram-bot
sudo systemctl status gament-telegram-bot
```

---

## نکات امنیتی

- فایل `.env` را عمومی نکنید؛ توکن ربات داخل آن است.
- `ADMIN_IDS` را حتماً تنظیم کنید.
- اطلاعیه `/announce` فقط به کاربرانی ارسال می‌شود که خودشان در ربات پیش‌ثبت‌نام کرده‌اند.
- پرداخت و کیف پول را از داخل وب‌اپ رسمی Gament مدیریت کنید، نه داخل ربات.
