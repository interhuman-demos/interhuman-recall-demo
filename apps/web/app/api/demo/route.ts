import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { type JobRecord, type JobResult } from "@repo/shared";
import { grantReportAccess } from "@/lib/server/access";
import {
  DEMO_DEFAULT_FOCAL_ID,
  DEMO_RESULTS_BY_PARTICIPANT,
  DEMO_SAMPLE_RESULT,
} from "@/lib/server/demo-sample";
import { saveJob } from "@/lib/server/store";

const BodySchema = z.object({
  fixtureId: z.string(),
});

const ResponseSchema = z.object({
  reportId: z.string(),
  reportUrl: z.string(),
});
type DemoResponse = z.infer<typeof ResponseSchema>;

/**
 * Start the dependency-free demo. Instead of dispatching to the stream-proxy
 * (which requires external services), this writes a fully-assembled sample
 * report straight to the store and returns immediately.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const sessionId = randomUUID();
  const reportId = randomUUID();
  const now = new Date().toISOString();

  // Pre-seed a completed result for every demo participant so the report's
  // speaker switcher can restore each one instantly (the refocus route reads
  // this cache). The demo is fully synthetic — there's no backing video — so
  // switching must never fall through to the stream-proxy.
  const resultsByParticipant: Record<string, JobResult> = {};
  for (const [participantId, result] of Object.entries(
    DEMO_RESULTS_BY_PARTICIPANT,
  )) {
    resultsByParticipant[participantId] = { sessionId, ...result };
  }

  const record: JobRecord = {
    sessionId,
    reportId,
    status: "done",
    meetingUrl: null,
    source: "fixture",
    recallBotId: null,
    fixtureId: parsed.data.fixtureId,
    focalParticipantId: DEMO_DEFAULT_FOCAL_ID,
    createdAt: now,
    updatedAt: now,
    error: null,
    result: { sessionId, ...DEMO_SAMPLE_RESULT },
    resultsByParticipant,
  };
  await saveJob(record);
  await grantReportAccess(reportId);

  const body: DemoResponse = { reportId, reportUrl: `/report/${reportId}` };
  return NextResponse.json(body);
}
