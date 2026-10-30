import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  adminCookieValue,
  isAdminConfigured,
  isCorrectSecret,
} from "@/lib/server/admin-auth";

const BodySchema = z.object({ secret: z.string().min(1) });

const MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

/** Exchange the shared secret for a signed admin cookie. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "admin access is not configured (set ADMIN_SECRET)" },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "secret required" }, { status: 400 });
  }

  if (!isCorrectSecret(parsed.data.secret)) {
    return NextResponse.json({ error: "incorrect secret" }, { status: 401 });
  }

  const value = await adminCookieValue();
  if (!value) {
    return NextResponse.json({ error: "admin not configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}

/** Clear the admin cookie. */
export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
