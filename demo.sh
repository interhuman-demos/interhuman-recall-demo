#!/usr/bin/env bash
#
# demo.sh — one-command startup for the Interhuman Signals demo.
#
# Starts everything in the right order:
#   1. ngrok TCP         → RTMP ingest (Recall streams 30fps video+audio here)
#   2. cloudflared       → bridge HTTPS tunnel (Recall transcript webhooks)
#   3. cloudflared       → add-on HTTPS tunnel (Google Meet loads the panel from here)
#   4. updates .env.local in both projects with the fresh tunnel URLs
#   5. starts the stream-proxy bridge
#   6. prints the Cloud Console snippet to paste if the add-on URL changed
#
# Usage:
#   cd ~/Projects/interhuman-recall-demo
#   ./demo.sh
#
# Then in a second terminal:
#   cd ~/Projects/google-meet-addon && npm run dev
#
# Prerequisites (one-time setup, already done):
#   - ngrok authed with a card on file
#   - cloudflared installed
#   - all API keys set in apps/stream-proxy/.env.local

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_ENV="$SCRIPT_DIR/apps/stream-proxy/.env.local"
ADDON_ENV="$HOME/Projects/google-meet-addon/.env.local"
RTMP_PORT="${RTMP_PORT:-1935}"
HTTP_PORT="${PORT:-8787}"
ADDON_PORT=3000

# Track PIDs for cleanup
NGROK_PID="" CF_BRIDGE_PID="" CF_ADDON_PID="" PROXY_PID=""

cleanup() {
  echo ""
  echo "[demo] shutting down..."
  [[ -n "$PROXY_PID"    ]] && kill "$PROXY_PID"    2>/dev/null || true
  [[ -n "$CF_ADDON_PID" ]] && kill "$CF_ADDON_PID" 2>/dev/null || true
  [[ -n "$CF_BRIDGE_PID" ]] && kill "$CF_BRIDGE_PID" 2>/dev/null || true
  [[ -n "$NGROK_PID"    ]] && kill "$NGROK_PID"    2>/dev/null || true
  echo "[demo] all processes stopped."
  exit 0
}
trap cleanup INT TERM

if [[ ! -f "$PROXY_ENV" ]]; then
  echo "[demo] ERROR: $PROXY_ENV not found" >&2; exit 1
fi

echo ""
echo "[demo] ============================================================"
echo "[demo]  Interhuman Signals — demo startup"
echo "[demo] ============================================================"
echo ""

# ── 1. ngrok TCP for RTMP ────────────────────────────────────────────────────
echo "[demo] [1/4] Starting ngrok TCP $RTMP_PORT (RTMP ingest for Recall bot)..."
rm -f /tmp/demo-ngrok.log
ngrok tcp "$RTMP_PORT" --log stdout > /tmp/demo-ngrok.log 2>&1 &
NGROK_PID=$!

RTMP_PUBLIC=""
for i in $(seq 1 30); do
  if grep -q "ERR_NGROK" /tmp/demo-ngrok.log 2>/dev/null; then
    echo "[demo] ERROR: ngrok failed — check card on file at https://dashboard.ngrok.com/settings#id-verification" >&2
    cleanup
  fi
  RTMP_PUBLIC="$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | sed -n 's/.*"public_url":"\(tcp:\/\/[^"]*\)".*/\1/p' | head -1 || true)"
  [[ -n "$RTMP_PUBLIC" ]] && break
  sleep 1
done
if [[ -z "$RTMP_PUBLIC" ]]; then
  echo "[demo] ERROR: could not get ngrok TCP URL (see /tmp/demo-ngrok.log)" >&2; cleanup
fi
RTMP_PUBLIC_BASE="${RTMP_PUBLIC/tcp:\/\//rtmp://}"
echo "[demo]   RTMP : $RTMP_PUBLIC_BASE"

# ── 2. cloudflared for bridge (HTTPS webhooks + WS) ─────────────────────────
echo "[demo] [2/4] Starting cloudflared tunnel → bridge (localhost:$HTTP_PORT)..."
rm -f /tmp/demo-cf-bridge.log
nohup cloudflared tunnel --url "http://localhost:$HTTP_PORT" --no-autoupdate \
  > /tmp/demo-cf-bridge.log 2>&1 &
CF_BRIDGE_PID=$!

BRIDGE_PUBLIC_URL=""
for i in $(seq 1 45); do
  if grep -q "failed to request quick Tunnel\|context deadline exceeded\|error" \
      /tmp/demo-cf-bridge.log 2>/dev/null && \
     ! grep -q 'trycloudflare\.com' /tmp/demo-cf-bridge.log 2>/dev/null; then
    echo "[demo] ERROR: cloudflared bridge tunnel failed — network issue?" >&2
    cat /tmp/demo-cf-bridge.log | tail -3 >&2
    cleanup
  fi
  BRIDGE_PUBLIC_URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' \
    /tmp/demo-cf-bridge.log 2>/dev/null | grep -v 'api\.trycloudflare' | head -1 || true)"
  [[ -n "$BRIDGE_PUBLIC_URL" ]] && break
  sleep 1
done
if [[ -z "$BRIDGE_PUBLIC_URL" ]]; then
  echo "[demo] ERROR: could not get bridge cloudflared URL (see /tmp/demo-cf-bridge.log)" >&2; cleanup
fi
echo "[demo]   Bridge : $BRIDGE_PUBLIC_URL"

# ── 3. cloudflared for add-on (Meet loads the panel from here) ───────────────
echo "[demo] [3/4] Starting cloudflared tunnel → add-on (localhost:$ADDON_PORT)..."
rm -f /tmp/demo-cf-addon.log
nohup cloudflared tunnel --url "http://localhost:$ADDON_PORT" --no-autoupdate \
  > /tmp/demo-cf-addon.log 2>&1 &
CF_ADDON_PID=$!

ADDON_PUBLIC_URL=""
for i in $(seq 1 45); do
  if grep -q "failed to request quick Tunnel\|context deadline exceeded\|error" \
      /tmp/demo-cf-addon.log 2>/dev/null && \
     ! grep -q 'trycloudflare\.com' /tmp/demo-cf-addon.log 2>/dev/null; then
    echo "[demo] ERROR: cloudflared add-on tunnel failed — network issue?" >&2
    cat /tmp/demo-cf-addon.log | tail -3 >&2
    cleanup
  fi
  ADDON_PUBLIC_URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' \
    /tmp/demo-cf-addon.log 2>/dev/null | grep -v 'api\.trycloudflare' | head -1 || true)"
  [[ -n "$ADDON_PUBLIC_URL" ]] && break
  sleep 1
done
if [[ -z "$ADDON_PUBLIC_URL" ]]; then
  echo "[demo] ERROR: could not get add-on cloudflared URL (see /tmp/demo-cf-addon.log)" >&2; cleanup
fi
echo "[demo]   Add-on : $ADDON_PUBLIC_URL"

# ── 4. Write all URLs into both .env.local files ─────────────────────────────
echo "[demo] [4/4] Syncing .env.local files..."

# stream-proxy/.env.local
tmp="$(mktemp)"
awk -v pub="$BRIDGE_PUBLIC_URL" -v rtmp="$RTMP_PUBLIC_BASE" '
  /^PUBLIC_BASE_URL=/   { print "PUBLIC_BASE_URL="  pub;  fp=1; next }
  /^RTMP_PUBLIC_BASE=/  { print "RTMP_PUBLIC_BASE=" rtmp; fr=1; next }
  { print }
  END {
    if (!fp) print "PUBLIC_BASE_URL="  pub
    if (!fr) print "RTMP_PUBLIC_BASE=" rtmp
  }
' "$PROXY_ENV" > "$tmp" && mv "$tmp" "$PROXY_ENV"
echo "[demo]   wrote PUBLIC_BASE_URL + RTMP_PUBLIC_BASE → stream-proxy/.env.local"

# google-meet-addon/.env.local
OLD_ADDON_URL=""
if [[ -f "$ADDON_ENV" ]]; then
  OLD_ADDON_URL="$(grep '^NEXT_PUBLIC_APP_URL=' "$ADDON_ENV" | cut -d= -f2 || true)"
  tmp2="$(mktemp)"
  awk -v addon="$ADDON_PUBLIC_URL" -v bridge="$BRIDGE_PUBLIC_URL" '
    /^NEXT_PUBLIC_APP_URL=/    { print "NEXT_PUBLIC_APP_URL="    addon;  fa=1; next }
    /^NEXT_PUBLIC_BRIDGE_URL=/ { print "NEXT_PUBLIC_BRIDGE_URL=" bridge; fb=1; next }
    /^BRIDGE_PUBLIC_URL=/      { print "BRIDGE_PUBLIC_URL="      bridge; fc=1; next }
    { print }
    END {
      if (!fa) print "NEXT_PUBLIC_APP_URL="    addon
      if (!fb) print "NEXT_PUBLIC_BRIDGE_URL=" bridge
      if (!fc) print "BRIDGE_PUBLIC_URL="      bridge
    }
  ' "$ADDON_ENV" > "$tmp2" && mv "$tmp2" "$ADDON_ENV"
  echo "[demo]   wrote NEXT_PUBLIC_APP_URL + NEXT_PUBLIC_BRIDGE_URL → google-meet-addon/.env.local"
fi

# ── 5. Start the stream-proxy ─────────────────────────────────────────────────
echo ""
echo "[demo] ============================================================"
echo "[demo]  All tunnels running. Summary:"
echo "[demo]    RTMP (Recall bot) : $RTMP_PUBLIC_BASE"
echo "[demo]    Bridge (webhooks) : $BRIDGE_PUBLIC_URL"
echo "[demo]    Add-on (panel)    : $ADDON_PUBLIC_URL"
echo "[demo] ============================================================"
echo ""

# Warn if the add-on URL changed — Cloud Console needs a manual update.
URL_CHANGED=false
if [[ -n "$OLD_ADDON_URL" && "$OLD_ADDON_URL" != "$ADDON_PUBLIC_URL" ]]; then
  URL_CHANGED=true
fi

if [[ "$URL_CHANGED" == "true" ]]; then
  echo "[demo] ⚠️  ADD-ON URL CHANGED — update Google Cloud Console now:"
  echo "[demo]    APIs & Services → Workspace Marketplace SDK → App Configuration"
  echo ""
  echo "    Paste this manifest:"
  cat <<JSON
{
  "oauthScopes": ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
  "addOns": {
    "common": {
      "name": "Interhuman Signals",
      "logoUrl": "https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png"
    },
    "meet": {
      "web": {
        "supportsScreenSharing": true,
        "addOnOrigins": ["$ADDON_PUBLIC_URL"],
        "sidePanelUrl": "$ADDON_PUBLIC_URL/side-panel"
      }
    },
    "httpOptions": {
      "granularOauthPermissionSupport": "OPT_IN"
    }
  }
}
JSON
  echo ""
  echo "[demo] After saving Cloud Console, press ENTER here to continue..."
  read -r
else
  echo "[demo] ✓ Add-on URL unchanged — no Cloud Console update needed."
  echo ""
fi

echo "[demo] Starting stream-proxy on :$HTTP_PORT..."
echo "[demo] ------------------------------------------------------------"
echo "[demo] Next step: in another terminal run:"
echo "[demo]   cd ~/Projects/google-meet-addon && npm run dev"
echo "[demo] Then open the side panel in Meet, paste the Meet URL, Start."
echo "[demo] Ctrl-C here tears everything down."
echo "[demo] ------------------------------------------------------------"
echo ""

npx tsx --env-file="$PROXY_ENV" "$SCRIPT_DIR/apps/stream-proxy/src/index.ts" &
PROXY_PID=$!
wait "$PROXY_PID"
