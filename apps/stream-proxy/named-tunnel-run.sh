#!/usr/bin/env bash
#
# Start the permanent named cloudflared tunnel and sync env files with the
# stable hostnames. Run this instead of the ephemeral quick tunnels.
#
# Stable URLs (set once in Cloud Console, never rotate):
#   addon.interhuman.ai   -> the Meet add-on (localhost:3000)
#   bridge.interhuman.ai  -> the stream-proxy bridge (localhost:8787)
#
# Usage:
#   ./apps/stream-proxy/named-tunnel-run.sh

set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-interhuman-dev}"
ADDON_HOST="${ADDON_HOST:-addon.interhuman.ai}"
BRIDGE_HOST="${BRIDGE_HOST:-bridge.interhuman.ai}"
CF_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CF_DIR/$TUNNEL_NAME.yml"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_ENV="$SCRIPT_DIR/.env.local"
ADDON_ENV="$HOME/Projects/google-meet-addon/.env.local"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: $CONFIG_FILE not found. Run named-tunnel-setup.sh first." >&2
  exit 1
fi

ADDON_URL="https://$ADDON_HOST"
BRIDGE_URL="https://$BRIDGE_HOST"

# --- Sync stream-proxy/.env.local -------------------------------------------
# The bridge needs PUBLIC_BASE_URL = the bridge's own stable hostname (for
# Recall webhooks). RTMP_PUBLIC_BASE still comes from ngrok (separate script).
if [[ -f "$PROXY_ENV" ]]; then
  tmp="$(mktemp)"
  awk -v pub="$BRIDGE_URL" '
    /^PUBLIC_BASE_URL=/ { print "PUBLIC_BASE_URL=" pub; found=1; next }
    { print }
    END { if (!found) print "PUBLIC_BASE_URL=" pub }
  ' "$PROXY_ENV" > "$tmp" && mv "$tmp" "$PROXY_ENV"
  echo "[run] set PUBLIC_BASE_URL=$BRIDGE_URL in stream-proxy/.env.local"
fi

# --- Sync google-meet-addon/.env.local --------------------------------------
if [[ -f "$ADDON_ENV" ]]; then
  tmp2="$(mktemp)"
  awk -v addon="$ADDON_URL" -v bridge="$BRIDGE_URL" '
    /^NEXT_PUBLIC_APP_URL=/    { print "NEXT_PUBLIC_APP_URL=" addon; fa=1; next }
    /^NEXT_PUBLIC_BRIDGE_URL=/ { print "NEXT_PUBLIC_BRIDGE_URL=" bridge; fb=1; next }
    /^BRIDGE_PUBLIC_URL=/      { print "BRIDGE_PUBLIC_URL=" bridge; fc=1; next }
    { print }
    END {
      if (!fa) print "NEXT_PUBLIC_APP_URL=" addon
      if (!fb) print "NEXT_PUBLIC_BRIDGE_URL=" bridge
      if (!fc) print "BRIDGE_PUBLIC_URL=" bridge
    }
  ' "$ADDON_ENV" > "$tmp2" && mv "$tmp2" "$ADDON_ENV"
  echo "[run] set NEXT_PUBLIC_APP_URL=$ADDON_URL, NEXT_PUBLIC_BRIDGE_URL/BRIDGE_PUBLIC_URL=$BRIDGE_URL in addon/.env.local"
  echo "[run] NOTE: restart 'npm run dev' in the addon (NEXT_PUBLIC_* are build-time)"
fi

echo "[run] ---------------------------------------------------------"
echo "[run] Stable URLs (register addon URL in Cloud Console once):"
echo "[run]   Add-on : $ADDON_URL/side-panel  +  $ADDON_URL/main-stage"
echo "[run]   Bridge : $BRIDGE_URL"
echo "[run] Starting tunnel '$TUNNEL_NAME' (Ctrl-C to stop)..."
echo "[run] ---------------------------------------------------------"

exec cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME"
