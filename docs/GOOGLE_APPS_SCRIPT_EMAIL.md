# ارسال ایمیل Gament از Gmail روی Render Free

Render Free پورت‌های SMTP را مسدود می‌کند. این روش با Google Apps Script و HTTPS
(پورت 443) ایمیل را واقعاً از حساب `gament1.ir@gmail.com` ارسال می‌کند.

## 1. ساخت Web App

1. با حساب `gament1.ir@gmail.com` وارد <https://script.google.com> شوید.
2. **New project** را بزنید.
3. محتوای فایل `docs/google-apps-script-email-relay.gs` را داخل `Code.gs` قرار دهید.
4. در **Project Settings → Script Properties** یک Property بسازید:
   - Name: `GAMENT_EMAIL_SECRET`
   - Value: یک رشته تصادفی بلند (حداقل 32 کاراکتر)
5. **Deploy → New deployment → Web app** را انتخاب کنید.
6. Execute as: **Me**
7. Who has access: **Anyone**
8. دسترسی Gmail را تایید کنید و Deploy را بزنید.
9. آدرس نهایی که به `/exec` ختم می‌شود را کپی کنید.

## 2. تنظیم Render

```env
EMAIL_PROVIDER=google_apps_script
GOOGLE_APPS_SCRIPT_EMAIL_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GOOGLE_APPS_SCRIPT_EMAIL_SECRET=همان مقدار GAMENT_EMAIL_SECRET
```

Secret را در GitHub، کد یا چت قرار ندهید. مقدار `SMTP_PASS` دیگر برای این روش
لازم نیست.

## 3. بررسی

بعد از Deploy سایت، خروجی `/api/health` باید شامل این موارد باشد:

```json
{
  "email": {
    "configured": true,
    "provider": "google_apps_script",
    "from": "Gament <gament1.ir@gmail.com>"
  }
}
```

Apps Script از CacheService برای جلوگیری از ارسال تکراری درخواست‌های Retry شده
استفاده می‌کند. Cooldown درخواست مجدد OTP در برنامه 120 ثانیه است.
