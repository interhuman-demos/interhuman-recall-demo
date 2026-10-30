import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived HMAC token. Mirrors the web app's mint logic exactly:
 *   payload = base64url(JSON({ sessionId, exp }))
 *   signature = base64url(HMAC_SHA256(secret, payload))
 *   token = `${payload}.${signature}`
 */

interface TokenPayload {
  sessionId: string;
  exp: number; // epoch seconds
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(payload).digest());
}

export function mintToken(
  sessionId: string,
  secret: string,
  ttlSeconds = 600,
): string {
  const payloadObj: TokenPayload = {
    sessionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = base64url(JSON.stringify(payloadObj));
  return `${payload}.${sign(payload, secret)}`;
}

export interface VerifyResult {
  ok: boolean;
  sessionId?: string;
  reason?: string;
}

export function verifyToken(token: string, secret: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payload, signature] = parts as [string, string];

  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  let decoded: TokenPayload;
  try {
    decoded = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8"),
    ) as TokenPayload;
  } catch {
    return { ok: false, reason: "bad-payload" };
  }

  if (typeof decoded.exp !== "number" || decoded.exp < Date.now() / 1000) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, sessionId: decoded.sessionId };
}
