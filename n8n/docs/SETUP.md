# n8n Integration Setup for Gament

## 1. Create n8n instance

Recommended:
- Self-hosted on Render / Railway / VPS (free tier available)
- Or use n8n.cloud

## 2. Import workflows

1. Open n8n
2. Go to **Workflows** → **Import**
3. Upload the JSON files from `n8n/workflows/`

## 3. Add credentials

### Telegram Credential
- Name: `Gament Telegram Bot`
- Bot Token: Your BOT_TOKEN (same as Gament)
- Default Chat ID (optional): your personal chat id for testing

### HTTP Header Auth (for Gament API)
- Name: `Gament n8n Secret`
- Header Name: `x-n8n-secret`
- Header Value: same as `N8N_WEBHOOK_SECRET` in Gament env

## 4. Environment variables in Gament (Render)

Add these to your Render service:

```env
N8N_WEBHOOK_SECRET=super-secret-string-here-1234567890
N8N_ALLOWED_IPS=   # leave empty for now
```

## 5. Recommended first workflows to activate

1. `gament-error-notifier.json` → Activate immediately (very useful)
2. `gament-tournament-publisher.json` → Activate when you want auto-publish

## 6. Testing

You can test the webhook publisher manually:

```bash
curl -X POST https://your-n8n-domain/webhook/gament-publish-tournament \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Tournament",
    "game": "cod_mobile",
    "entryFee": "۵۰٬۰۰۰ تومان",
    "prizePool": "۵۰۰٬۰۰۰ تومان"
  }'
```

## Need more?

We imported several high-quality Telegram workflows from the excellent community repo:
https://github.com/Zie619/n8n-workflows
