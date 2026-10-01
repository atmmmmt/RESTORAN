#!/bin/bash
#
# Ship the backend to the droplet.
#
# The one rule that matters: never send .env. The server's copy holds the
# production database URI and the list of allowed frontend origins, while the
# repo's copy points at localhost — overwriting one with the other takes the
# whole dashboard down with a CORS failure that looks like a login bug.
#
# Usage: ./deploy-backend.sh
#
set -euo pipefail

HOST="root@157.245.94.0"
HOSTKEY="SHA256:W6Zjpe4MqeZLPoECFvAZZ86wNA1OXEN5mmFuRIZH9Xk"
REMOTE="/var/www/ajenah"
APP="loliz-backend"

: "${DROPLET_PASSWORD:?ضع كلمة سر السيرفر في المتغير DROPLET_PASSWORD}"

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "▶ تحزيم الباك اند (بدون .env و node_modules)…"
tar -C "$here" \
  --exclude=node_modules \
  --exclude=logs \
  --exclude='.env' \
  --exclude='.env.*' \
  -czf "$tmp/backend.tar.gz" backend

# Belt and braces: prove .env is not in there before it leaves the machine.
if tar -tzf "$tmp/backend.tar.gz" | grep -qE '(^|/)\.env$'; then
  echo "✖ الأرشيف يحتوي .env — أُلغيت العملية" >&2
  exit 1
fi

echo "▶ رفع…"
pscp -batch -hostkey "$HOSTKEY" -pw "$DROPLET_PASSWORD" \
  "$tmp/backend.tar.gz" "$HOST:$REMOTE/"

echo "▶ تركيب وإعادة تشغيل…"
plink -batch -ssh -hostkey "$HOSTKEY" -pw "$DROPLET_PASSWORD" "$HOST" "
  set -e
  cd $REMOTE
  cp backend/.env /root/.env.backup            # last-resort copy
  tar xzf backend.tar.gz && rm backend.tar.gz
  cd backend
  npm install --omit=dev --no-audit --no-fund >/dev/null
  pm2 restart $APP --update-env >/dev/null
  sleep 5
  echo '— الحالة —'
  grep -E '^(NODE_ENV|FRONTEND_URL)=' .env
  curl -s -m 10 http://127.0.0.1:3002/health
  echo
"

echo "✓ تم النشر"
