import { NextResponse } from "next/server";
import { hasReportAccess } from "@/lib/server/access";
import { loadJob } from "@/lib/server/store";

/**
 * Report-facing job status. The analysis now runs inline during the webhook,
 * so the job record in the DB is always the source of truth — no proxy polling.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!(await hasReportAccess(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const record = await loadJob(id);
  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(record);
}
