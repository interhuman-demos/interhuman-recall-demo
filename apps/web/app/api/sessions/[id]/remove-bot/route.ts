import { NextResponse } from "next/server";
import { hasReportAccess } from "@/lib/server/access";
import { removeBot } from "@/lib/server/recall";
import { loadJob } from "@/lib/server/store";

/** Remove the Recall bot associated with a report from its meeting. */
export async function POST(
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
  if (!record.recallBotId) {
    return NextResponse.json(
      { error: "no bot associated with this report" },
      { status: 400 },
    );
  }

  try {
    await removeBot(record.recallBotId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to remove bot" },
      { status: 502 },
    );
  }
}
