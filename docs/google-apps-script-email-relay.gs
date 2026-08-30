// Gament Gmail HTTPS relay for Google Apps Script.
// Deploy as: Web app -> Execute as Me -> Who has access: Anyone.
// Before deploying, add Script Property:
//   GAMENT_EMAIL_SECRET = the same long random value used in Render.

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse_({ ok: true, service: 'gament-gmail-relay' });
}

function doPost(event) {
  try {
    var body = JSON.parse((event.postData && event.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('GAMENT_EMAIL_SECRET');
    if (!expected || String(body.secret || '') !== expected) {
      return jsonResponse_({ ok: false, error: 'unauthorized' });
    }

    var to = String(body.to || '').trim().toLowerCase();
    var subject = String(body.subject || '').trim().slice(0, 200);
    var html = String(body.html || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !html || html.length > 200000) {
      return jsonResponse_({ ok: false, error: 'invalid_payload' });
    }

    // Best-effort de-duplication for HTTP retries.
    var idempotencyKey = String(body.idempotencyKey || '').slice(0, 200);
    var cache = CacheService.getScriptCache();
    if (idempotencyKey && cache.get(idempotencyKey)) {
      return jsonResponse_({ ok: true, duplicate: true });
    }

    GmailApp.sendEmail(to, subject, 'برای مشاهده این پیام از یک سرویس ایمیل دارای پشتیبانی HTML استفاده کنید.', {
      htmlBody: html,
      name: 'Gament',
      replyTo: 'gament1.ir@gmail.com'
    });

    if (idempotencyKey) cache.put(idempotencyKey, 'sent', 21600);
    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ ok: false, error: 'send_failed' });
  }
}
