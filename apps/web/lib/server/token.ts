import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mints the short-lived HMAC token verified by the stream-proxy. MUST match the
 * proxy's verify logic exactly (same payload shape, same base64url encoding).
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function mintProxyToken(
  sessionId: string,
  secret: string,
  ttlSeconds = 600,
): string {
  const payloadObj = {
    sessionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = base64url(JSON.stringify(payloadObj));
  const signature = base64url(
    createHmac("sha256", secret).update(payload).digest(),
  );
  return `${payload}.${signature}`;
}

export interface VerifyProxyTokenResult {
  ok: boolean;
  sessionId?: string;
  reason?: string;
}

/**
 * Verify a token minted by mintProxyToken / the stream-proxy's mintToken. Used
 * to authorize report links opened from the Meet side panel, where the browser
 * never received a creator cookie. Mirrors the proxy's verifyToken exactly.
 */
export function verifyProxyToken(
  token: string,
  secret: string,
): VerifyProxyTokenResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payload, signature] = parts as [string, string];

  const expected = base64url(
    createHmac("sha256", secret).update(payload).digest(),
  );
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  let decoded: { sessionId?: string; exp?: number };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      sessionId?: string;
      exp?: number;
    };
  } catch {
    return { ok: false, reason: "bad-payload" };
  }

  if (typeof decoded.exp !== "number" || decoded.exp < Date.now() / 1000) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, sessionId: decoded.sessionId };
}
