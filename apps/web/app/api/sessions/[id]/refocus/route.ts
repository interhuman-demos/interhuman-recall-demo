import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { JobResultSchema } from "@repo/shared";
import { hasReportAccess } from "@/lib/server/access";
import { analyzeRecording } from "@/lib/server/analyze-recording";
import { loadJob, saveJob } from "@/lib/server/store";

const BodySchema = z.object({
  focalParticipantId: z.string(),
});

export const maxDuration = 300;

/** Re-run the pipeline for a different focal speaker. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!(await hasReportAccess(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const record = await loadJob(id);
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });

  const focalParticipantId = parsed.data.focalParticipantId;

  // Restore from cache if already analyzed for this speaker
  const cached = record.resultsByParticipant?.[focalParticipantId];
  if (cached) {
    record.status = "done";
    record.result = cached;
    record.error = null;
    record.sessionId = cached.sessionId;
    record.focalParticipantId = focalParticipantId;
    record.updatedAt = new Date().toISOString();
    await saveJob(record);
    return NextResponse.json({ ok: true, cached: true });
  }

  // Fixture-based demos can't be re-analyzed
  if (record.source === "fixture" && !record.recallBotId) {
    return NextResponse.json(
      { error: "This sample speaker isn't available." },
      { status: 409 },
    );
  }

  if (!record.recallBotId) {
    return NextResponse.json({ error: "No recording available" }, { status: 409 });
  }

  // Carry over transcript/participants for the UI while re-analyzing
  const prev = record.result;
  const nextFocalName = prev?.participants?.find(
    (p) => p.id === focalParticipantId,
  )?.name;
  record.sessionId = randomUUID();
  record.status = "analyzing";
  record.result =
    prev?.transcript?.length && nextFocalName
      ? {
          sessionId: record.sessionId,
          durationS: prev.durationS,
          participants: prev.participants,
          transcript: prev.transcript,
          focalSpeaker: nextFocalName,
        }
      : null;
  record.error = null;
  record.focalParticipantId = focalParticipantId;
  record.updatedAt = new Date().toISOString();
  await saveJob(record);

  try {
    const result = await analyzeRecording(record.recallBotId, focalParticipantId);
    result.sessionId = record.sessionId;

    record.status = "done";
    record.result = result;
    record.updatedAt = new Date().toISOString();
    const full = JobResultSchema.safeParse(result);
    if (full.success) {
      record.resultsByParticipant = {
        ...record.resultsByParticipant,
        [focalParticipantId]: full.data,
      };
    }
    await saveJob(record);
  } catch (err) {
    console.error("refocus analyzeRecording failed", err);
    record.status = "failed";
    record.error = err instanceof Error ? err.message : String(err);
    record.updatedAt = new Date().toISOString();
    await saveJob(record);
    return NextResponse.json(
      { error: "analysis failed", detail: record.error },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
