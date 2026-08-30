#!/usr/bin/env bash
#
# Provisions a fresh Debian/Ubuntu VPS to run this app.
#
# Lives in the repo rather than in the agent's memory, which is wiped between
# sessions: re-running this on a new server reproduces the same setup instead of
# relying on somebody remembering the steps.
#
# Idempotent — safe to run repeatedly.
#
# Usage (as a sudo-capable non-root user):
#   sudo bash scripts/vps-provision.sh --domain gament1.ir --email you@example.com
#
set -euo pipefail

DOMAIN=""
EMAIL=""
APP_USER="${SUDO_USER:-deploy}"
APP_DIR="/var/www/gament"
NODE_MAJOR=20
REPO="https://github.com/farzadabbasi617-star/Flexa_app.git"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2";  shift 2 ;;
    --dir)    APP_DIR="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$DOMAIN" ]] && { echo "--domain is required" >&2; exit 1; }
[[ -z "$EMAIL"  ]] && { echo "--email is required (for the TLS certificate)" >&2; exit 1; }
[[ $EUID -ne 0 ]] && { echo "run with sudo" >&2; exit 1; }

log() { printf '\n=== %s\n' "$1"; }

log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ufw ca-certificates gnupg postgresql-client

log "Node.js ${NODE_MAJOR}"
if ! node --version 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
node --version

log "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status | head -6

log "Unattended security updates"
apt-get install -y -qq unattended-upgrades
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

log "Application directory"
mkdir -p "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git clone --depth 1 "$REPO" "$APP_DIR"
fi

log "Environment file"
# Secrets are never written by this script. Copy them from Render and place them
# here; the systemd unit reads this file and it is not world-readable.
if [[ ! -f "$APP_DIR/.env.production" ]]; then
  install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/null "$APP_DIR/.env.production"
  cat > "$APP_DIR/.env.production" <<'ENVEOF'
# Copy every variable from the Render dashboard into this file, one KEY=value
# per line. At minimum the app needs DATABASE_URL, BOT_TOKEN, APP_URL and
# NEXT_PUBLIC_APP_URL. NEXT_PUBLIC_* values are baked in at build time, so a
# change to any of them requires a rebuild, not just a restart.
NODE_ENV=production
PORT=3000
ENVEOF
  chmod 600 "$APP_DIR/.env.production"
  chown "$APP_USER":"$APP_USER" "$APP_DIR/.env.production"
  echo "  created $APP_DIR/.env.production — fill it in before starting the service"
fi

log "systemd service"
cat > /etc/systemd/system/gament.service <<EOF
[Unit]
Description=Gament (Next.js)
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env.production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
# The build peaks well above the ~200MB the app uses at runtime.
Environment=NODE_OPTIONS=--max-old-space-size=1024
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable gament >/dev/null 2>&1 || true

log "nginx reverse proxy"
cat > /etc/nginx/sites-available/gament <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Next.js serves immutable hashed assets; let the browser keep them.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        # The app reads the client IP from this header for rate limiting and
        # session validation, so it must be forwarded accurately.
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }

    client_max_body_size 12M;
}
EOF
ln -sf /etc/nginx/sites-available/gament /etc/nginx/sites-enabled/gament
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "TLS certificate"
apt-get install -y -qq certbot python3-certbot-nginx
if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" \
    --non-interactive --agree-tos -m "${EMAIL}" --redirect || {
      echo "  certbot failed — check the DNS A record points at this server, then re-run"
    }
fi
# certbot installs its own renewal timer; verify rather than assume.
systemctl list-timers 2>/dev/null | grep -i certbot || echo "  (no certbot timer yet)"

log "Database backup (daily, 14 days retained)"
mkdir -p /var/backups/gament
cat > /usr/local/bin/gament-backup <<'BEOF'
#!/usr/bin/env bash
# Dumps the database defined by DATABASE_URL in the app's env file.
set -euo pipefail
ENV_FILE="/var/www/gament/.env.production"
DEST="/var/backups/gament"
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"'')"
[[ -z "$DB_URL" ]] && { echo "DATABASE_URL not found in $ENV_FILE" >&2; exit 1; }
pg_dump "$DB_URL" | gzip > "$DEST/gament-$(date +%Y%m%d-%H%M%S).sql.gz"
find "$DEST" -name 'gament-*.sql.gz' -mtime +14 -delete
BEOF
chmod +x /usr/local/bin/gament-backup
cat > /etc/systemd/system/gament-backup.service <<'EOF'
[Unit]
Description=Gament database backup
[Service]
Type=oneshot
ExecStart=/usr/local/bin/gament-backup
EOF
cat > /etc/systemd/system/gament-backup.timer <<'EOF'
[Unit]
Description=Daily Gament database backup
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now gament-backup.timer >/dev/null 2>&1 || true

cat <<EOF

=== Provisioning complete ===

Still to do, in order:

  1. Fill in secrets:
       sudo -u ${APP_USER} nano ${APP_DIR}/.env.production
     Copy every variable from the Render dashboard. APP_URL and
     NEXT_PUBLIC_APP_URL must be https://${DOMAIN}

  2. Build and start:
       cd ${APP_DIR}
       sudo -u ${APP_USER} npm ci
       sudo -u ${APP_USER} npm run build
       sudo systemctl start gament

  3. Verify:
       curl -s localhost:3000/api/health
       systemctl status gament --no-pager

  4. Point the Telegram webhook at the new host, otherwise the bot keeps
     talking to Render:
       curl -F "url=https://${DOMAIN}/api/telegram/webhook" \\
            -F "secret_token=\$TELEGRAM_WEBHOOK_SECRET" \\
            "https://api.telegram.org/bot\$BOT_TOKEN/setWebhook"

  5. Set up free uptime monitoring (UptimeRobot or similar) against
     https://${DOMAIN}/api/health — nothing on this box will tell you if it
     goes down at 3am.

Useful commands:
  journalctl -u gament -f          # live logs
  systemctl restart gament         # restart after an env change
  /usr/local/bin/gament-backup     # run a backup right now
EOF
