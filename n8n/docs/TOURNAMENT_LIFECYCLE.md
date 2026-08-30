# Gament Tournament Lifecycle with n8n

## Overview
Automates the full tournament journey:
- Created → Announce in channel
- 24h before start → Reminder
- 1h before start → Final reminder
- (Future) Tournament completed → Results + payouts notification

## Files Added
- `src/lib/n8n.ts` — Helper to trigger n8n from Gament
- `src/app/api/n8n/trigger/tournament/route.ts` — Optional internal trigger
- `n8n/workflows/gament-tournament-lifecycle.json` — Main workflow

## Setup Steps

### 1. Add environment variables (Render)
```env
N8N_WEBHOOK_BASE=https://your-n8n-instance.com/webhook
N8N_WEBHOOK_SECRET=your-long-secret-here
```

### 2. Import workflow in n8n
1. Open n8n
2. Import `n8n/workflows/gament-tournament-lifecycle.json`
3. Activate it
4. Copy the webhook URL (e.g. `https://n8n.../webhook/gament-tournament-created`)

### 3. Update your N8N_WEBHOOK_BASE
Set the full base like:
`https://n8n.yourdomain.com/webhook`

### 4. Set Telegram credential in n8n
Name it: **Gament Telegram Bot**
Use the same BOT_TOKEN as your app.

## How it works now

When an admin creates a tournament in Gament admin panel:
1. Tournament is saved in DB
2. Old Telegram announcement still happens
3. **New**: Gament calls n8n webhook automatically
4. n8n formats a beautiful message and posts to channel
5. (If startDate exists) It can schedule future reminders (add Wait nodes or Cron in future)

## Next Enhancements (easy to add later)
- 24h / 1h reminder nodes (using Schedule Trigger + filtering)
- Auto send reminder to registered players
- Post results when status = completed

## Testing
You can manually test the webhook:
```bash
curl -X POST https://your-n8n/webhook/gament-tournament-created \
  -H "Content-Type: application/json" \
  -H "x-n8n-secret: YOUR_SECRET" \
  -d '{
    "data": {
      "id": "test-123",
      "name": "Test Tournament",
      "game": "cod_mobile",
      "maxPlayers": 32,
      "entryFee": "۵۰٬۰۰۰ تومان",
      "startDate": "2026-07-05T20:00:00Z"
    }
  }'
```

