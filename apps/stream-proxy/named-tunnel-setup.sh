#!/usr/bin/env bash
#
# One-time setup for permanent named cloudflared tunnels.
#
# Creates two stable public hostnames that never rotate, so you register them
# in Google Cloud Console (add-on side-panel/main-stage URLs) ONCE and never
# touch them again:
#
#   addon.interhuman.ai   ->  http://localhost:3000   (the Meet add-on / Next app)
#   bridge.interhuman.ai  ->  http://localhost:8787   (the stream-proxy bridge)
#
# Prereq (you, once):
#   cloudflared tunnel login        # opens browser, pick the interhuman.ai zone
#
# Then:
#   ./apps/stream-proxy/named-tunnel-setup.sh
#
# After setup, start the tunnel any time with:
#   ./apps/stream-proxy/named-tunnel-run.sh

set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-interhuman-dev}"
ADDON_HOST="${ADDON_HOST:-addon.interhuman.ai}"
BRIDGE_HOST="${BRIDGE_HOST:-bridge.interhuman.ai}"
CF_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CF_DIR/$TUNNEL_NAME.yml"

if [[ ! -f "$CF_DIR/cert.pem" ]]; then
  echo "ERROR: not logged in. Run:  cloudflared tunnel login" >&2
  echo "Then pick the interhuman.ai zone in the browser." >&2
  exit 1
fi

# --- Create the tunnel (idempotent) -----------------------------------------
if cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$TUNNEL_NAME"; then
  echo "[setup] tunnel '$TUNNEL_NAME' already exists"
else
  echo "[setup] creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
fi

# Resolve the tunnel UUID and its credentials file.
TUNNEL_ID="$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n {print $1}')"
if [[ -z "$TUNNEL_ID" ]]; then
  echo "ERROR: could not resolve tunnel id for '$TUNNEL_NAME'" >&2
  exit 1
fi
CRED_FILE="$CF_DIR/$TUNNEL_ID.json"
echo "[setup] tunnel id: $TUNNEL_ID"

# --- Route DNS for both hostnames (idempotent) ------------------------------
echo "[setup] routing DNS: $ADDON_HOST -> $TUNNEL_NAME"
cloudflared tunnel route dns "$TUNNEL_NAME" "$ADDON_HOST" 2>&1 | sed 's/^/[dns] /' || true
echo "[setup] routing DNS: $BRIDGE_HOST -> $TUNNEL_NAME"
cloudflared tunnel route dns "$TUNNEL_NAME" "$BRIDGE_HOST" 2>&1 | sed 's/^/[dns] /' || true

# --- Write the ingress config -----------------------------------------------
cat > "$CONFIG_FILE" <<YAML
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $ADDON_HOST
    service: http://localhost:3000
  - hostname: $BRIDGE_HOST
    service: http://localhost:8787
  - service: http_status:404
YAML
echo "[setup] wrote $CONFIG_FILE"

echo ""
echo "[setup] DONE. Stable URLs:"
echo "          Add-on : https://$ADDON_HOST"
echo "          Bridge : https://$BRIDGE_HOST"
echo ""
echo "[setup] Next:"
echo "  1. In Google Cloud Console (Workspace Marketplace SDK -> App Configuration), set:"
echo "       Side Panel : https://$ADDON_HOST/side-panel"
echo "       Main Stage : https://$ADDON_HOST/main-stage"
echo "  2. Start the tunnel any time:  ./apps/stream-proxy/named-tunnel-run.sh"
