/**
 * Shared-secret gate for the /admin surface. A correct secret mints a signed
 * cookie; middleware checks that cookie on every /admin and /api/admin request.
 *
 * Uses Web Crypto (HMAC-SHA256) so it runs in both the Edge middleware runtime
 * and Node route handlers.
 */

export const ADMIN_COOKIE = "ih_admin";

function getSecret(): string | null {
  return process.env.ADMIN_SECRET ?? null;
}

async function hmac(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** The cookie value to set once a caller proves they know the secret. */
export async function adminCookieValue(): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  return hmac("admin", secret);
}

/** Constant-time check that the supplied secret matches ADMIN_SECRET. */
export function isCorrectSecret(supplied: string): boolean {
  const secret = getSecret();
  if (!secret) return false;
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(secret);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** True if the presented cookie value is a valid admin token. */
export async function isValidAdminCookie(
  value: string | undefined,
): Promise<boolean> {
  if (!value) return false;
  const expected = await adminCookieValue();
  if (!expected) return false;
  return timingSafeEqualHex(value, expected);
}

/** Whether admin auth is configured at all. */
export function isAdminConfigured(): boolean {
  return getSecret() != null;
}
