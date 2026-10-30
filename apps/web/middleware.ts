import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/server/admin-auth";

const REPORT_COOKIE_PREFIX = "ih_report_";
const REPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Web Crypto (not node:crypto) so this runs in the Edge middleware runtime,
// matching the admin-auth helpers.
async function hmacBytes(message: string, key: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return atob(b64);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signature the access cookie stores for a report id (matches lib/server/access). */
async function reportCookieValue(reportId: string, secret: string): Promise<string> {
  return toHex(await hmacBytes(reportId, secret));
}

/**
 * Verify a proxy-minted `?t=` token for a report id. Mirrors the proxy's token
 * format: base64url(JSON({sessionId, exp})).base64url(HMAC_SHA256(secret, payload)).
 */
async function verifyReportToken(
  token: string,
  reportId: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts as [string, string];
  const expected = toBase64url(await hmacBytes(payload, secret));
  if (!timingSafeEqualStr(signature, expected)) return false;
  try {
    const decoded = JSON.parse(fromBase64url(payload)) as {
      sessionId?: string;
      exp?: number;
    };
    if (decoded.sessionId !== reportId) return false;
    if (typeof decoded.exp !== "number" || decoded.exp < Date.now() / 1000) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Two responsibilities:
 *  1. Gate the admin surface behind the shared-secret cookie.
 *  2. For report links opened from the Meet side panel (`/report/:id?t=<token>`),
 *     verify the signed token and mint the creator-access cookie. Those sessions
 *     are created server-to-server on the bridge, so the browser never received
 *     a cookie the normal (web-app-created) way — the token is the grant.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl;

  // --- Report token → access cookie ---------------------------------------
  const reportMatch = pathname.match(/^\/report\/([^/]+)$/);
  if (reportMatch) {
    const reportId = reportMatch[1]!;
    const token = searchParams.get("t");
    const secret = process.env.DEMO_STREAM_PROXY_TOKEN_SECRET;
    if (
      token &&
      secret &&
      !request.cookies.get(`${REPORT_COOKIE_PREFIX}${reportId}`) &&
      (await verifyReportToken(token, reportId, secret))
    ) {
      const res = NextResponse.next();
      res.cookies.set(
        `${REPORT_COOKIE_PREFIX}${reportId}`,
        await reportCookieValue(reportId, secret),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: REPORT_COOKIE_MAX_AGE,
        },
      );
      return res;
    }
    return NextResponse.next();
  }

  // --- Admin gate ----------------------------------------------------------
  const isAdminApi = pathname.startsWith("/api/admin");
  const valid = await isValidAdminCookie(
    request.cookies.get(ADMIN_COOKIE)?.value,
  );
  if (valid) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Report pages (to honor `?t=` access tokens) plus the admin page tree and
  // admin APIs. The admin login page and its auth endpoint stay reachable.
  matcher: ["/report/:id", "/admin/((?!login).*)", "/admin", "/api/admin/((?!login).*)"],
};
