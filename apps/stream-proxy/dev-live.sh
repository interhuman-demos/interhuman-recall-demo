#!/usr/bin/env bash
#
# Local "real bot" launcher for the Interhuman real-time bridge.
#
# Starts everything needed for a real Recall bot to join a real Google Meet and
# stream 30fps RTMP to your laptop, with the side-panel signals showing live in
# the google-meet-addon — all from one command:
#
#   1. ngrok TCP tunnel   -> RTMP ingest      (Recall pushes 30fps video+audio)
#   2. cloudflared tunnel -> HTTPS webhooks   (Recall transcript.data + add-on proxy)
#   3. writes PUBLIC_BASE_URL + RTMP_PUBLIC_BASE into apps/stream-proxy/.env.local
#   4. starts the stream-proxy
#
# Prereqs (one-time):
#   - ngrok authed + a card added (TCP tunnels require it; not charged):
#       https://dashboard.ngrok.com/settings#id-verification
#   - INTERHUMAN_API_KEY, RECALL_API_KEY, RECALL_REGION set in .env.local
#
# Usage:
#   ./apps/stream-proxy/dev-live.sh
#
# Then in another terminal:
#   cd ~/Projects/google-meet-addon && npm run dev
# Open the side panel, choose "Recall bot", paste the Meet URL, hit Start.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.local"
RTMP_PORT="${RTMP_PORT:-1935}"
HTTP_PORT="${PORT:-8787}"

NGROK_PID=""
CF_PID=""
PROXY_PID=""

cleanup() {
  echo ""
  echo "[dev-live] shutting down..."
  [[ -n "$PROXY_PID" ]] && kill "$PROXY_PID" 2>/dev/null || true
  [[ -n "$CF_PID" ]] && kill "$CF_PID" 2>/dev/null || true
  [[ -n "$NGROK_PID" ]] && kill "$NGROK_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[dev-live] ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# --- 1. Start ngrok TCP for RTMP --------------------------------------------
echo "[dev-live] starting ngrok tcp $RTMP_PORT ..."
ngrok tcp "$RTMP_PORT" --log stdout >/tmp/dev-live-ngrok.log 2>&1 &
NGROK_PID=$!

# ngrok exposes a local API on :4040; poll it for the public tcp:// URL.
RTMP_PUBLIC=""
for i in $(seq 1 30); do
  # Surface ngrok auth/card errors early instead of spinning for 30s.
  if grep -q "ERR_NGROK" /tmp/dev-live-ngrok.log 2>/dev/null; then
    echo "[dev-live] ngrok failed to start a TCP tunnel:" >&2
    grep -E "ERR_NGROK|must add a credit" /tmp/dev-live-ngrok.log | head -2 >&2
    echo "[dev-live] TCP endpoints need a card on file (not charged):" >&2
    echo "[dev-live]   https://dashboard.ngrok.com/settings#id-verification" >&2
    cleanup
  fi
  RTMP_PUBLIC="$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | sed -n 's/.*"public_url":"\(tcp:\/\/[^"]*\)".*/\1/p' | head -1 || true)"
  if [[ -n "$RTMP_PUBLIC" ]]; then
    break
  fi
  sleep 1
done
if [[ -z "$RTMP_PUBLIC" ]]; then
  echo "[dev-live] ERROR: could not get ngrok TCP URL (see /tmp/dev-live-ngrok.log)" >&2
  cleanup
fi
# tcp://0.tcp.eu.ngrok.io:18234 -> rtmp://0.tcp.eu.ngrok.io:18234
RTMP_PUBLIC_BASE="${RTMP_PUBLIC/tcp:\/\//rtmp://}"
echo "[dev-live] RTMP: $RTMP_PUBLIC_BASE"

# --- 2. Start cloudflared for HTTPS -----------------------------------------
echo "[dev-live] starting cloudflared tunnel -> http://localhost:$HTTP_PORT ..."
cloudflared tunnel --url "http://localhost:$HTTP_PORT" >/tmp/dev-live-cf.log 2>&1 &
CF_PID=$!

PUBLIC_BASE_URL=""
for i in $(seq 1 30); do
  PUBLIC_BASE_URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/dev-live-cf.log 2>/dev/null | head -1 || true)"
  if [[ -n "$PUBLIC_BASE_URL" ]]; then
    break
  fi
  sleep 1
done
if [[ -z "$PUBLIC_BASE_URL" ]]; then
  echo "[dev-live] ERROR: could not get cloudflared URL (see /tmp/dev-live-cf.log)" >&2
  cleanup
fi
echo "[dev-live] HTTPS: $PUBLIC_BASE_URL"

# --- 3. Write the two URLs into .env.local ----------------------------------
# Replace existing PUBLIC_BASE_URL / RTMP_PUBLIC_BASE lines in place.
tmp="$(mktemp)"
awk -v pub="$PUBLIC_BASE_URL" -v rtmp="$RTMP_PUBLIC_BASE" '
  /^PUBLIC_BASE_URL=/   { print "PUBLIC_BASE_URL=" pub; next }
  /^RTMP_PUBLIC_BASE=/  { print "RTMP_PUBLIC_BASE=" rtmp; next }
  { print }
' "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
echo "[dev-live] wrote PUBLIC_BASE_URL + RTMP_PUBLIC_BASE to .env.local"

# Keep the google-meet-addon's bridge URL in sync with this cloudflared tunnel.
# The side panel runs in an HTTPS iframe and can only open wss:// — so it must
# point at the bridge's HTTPS tunnel, not localhost. Server-side routes use the
# separate BRIDGE_URL=http://localhost:8787 already in the addon's .env.local.
ADDON_ENV="$HOME/Projects/google-meet-addon/.env.local"
if [[ -f "$ADDON_ENV" ]]; then
  tmp2="$(mktemp)"
  awk -v pub="$PUBLIC_BASE_URL" '
    /^NEXT_PUBLIC_BRIDGE_URL=/ { print "NEXT_PUBLIC_BRIDGE_URL=" pub; foundpub=1; next }
    /^BRIDGE_PUBLIC_URL=/       { print "BRIDGE_PUBLIC_URL=" pub; foundsrv=1; next }
    { print }
    END {
      if (!foundpub) print "NEXT_PUBLIC_BRIDGE_URL=" pub
      if (!foundsrv) print "BRIDGE_PUBLIC_URL=" pub
    }
  ' "$ADDON_ENV" > "$tmp2" && mv "$tmp2" "$ADDON_ENV"
  echo "[dev-live] synced NEXT_PUBLIC_BRIDGE_URL + BRIDGE_PUBLIC_URL in google-meet-addon/.env.local"
  echo "[dev-live] NOTE: restart 'npm run dev' in the addon to pick up the new URL"
else
  echo "[dev-live] WARN: $ADDON_ENV not found — set NEXT_PUBLIC_BRIDGE_URL=$PUBLIC_BASE_URL manually"
fi

# --- 4. Start the stream-proxy ----------------------------------------------
echo "[dev-live] starting stream-proxy on :$HTTP_PORT (RTMP :$RTMP_PORT)"
echo "[dev-live] ---------------------------------------------------------"
echo "[dev-live] Ready. In another terminal:  cd ~/Projects/google-meet-addon && npm run dev"
echo "[dev-live] Then open the side panel, choose 'Recall bot', paste the Meet URL, Start."
echo "[dev-live] Ctrl-C here tears down both tunnels and the proxy."
echo "[dev-live] ---------------------------------------------------------"

npx tsx --env-file="$ENV_FILE" "$SCRIPT_DIR/src/index.ts" &
PROXY_PID=$!
wait "$PROXY_PID"
