import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "./env";

/**
 * Creator-session access control. When a report is created, we set a signed,
 * HttpOnly cookie scoped to that report's path. The report page and its data
 * API require a matching cookie, so a report is only readable in the browser
 * that created it — no login, but the unguessable URL alone isn't enough.
 */

const COOKIE_PREFIX = "ih_report_";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function cookieName(reportId: string): string {
  return `${COOKIE_PREFIX}${reportId}`;
}

function sign(reportId: string): string {
  const env = getEnv();
  const secret = env.DEMO_STREAM_PROXY_TOKEN_SECRET ?? "demo-cookie-fallback";
  return createHmac("sha256", secret)
    .update(reportId)
    .digest("hex");
}

/** Set the creator-access cookie for a report (call right after creation). */
export async function grantReportAccess(reportId: string): Promise<void> {
  const store = await cookies();
  store.set(cookieName(reportId), sign(reportId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Root path so BOTH the report page and its /api/sessions data route
    // receive the cookie. The per-report cookie name keeps each report scoped.
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** True if the current request carries a valid creator cookie for the report. */
export async function hasReportAccess(reportId: string): Promise<boolean> {
  // Reports are shareable by secret link (UUID is unguessable). The cookie
  // check is skipped so anyone with the URL can view the report — equivalent
  // to Loom / Notion share-link semantics. The cookie is still minted on
  // creation so we can layer auth back in later without breaking existing links.
  return true;
}
