import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { type JobRecord } from "@repo/shared";
import { grantReportAccess } from "@/lib/server/access";
import { createBot } from "@/lib/server/recall";
import { saveJob } from "@/lib/server/store";

const BodySchema = z.object({
  meetingUrl: z.string().url(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sessionId = randomUUID();
  const reportId = randomUUID();

  try {
    const bot = await createBot(parsed.data.meetingUrl);
    const now = new Date().toISOString();
    const record: JobRecord = {
      sessionId,
      reportId,
      status: "queued",
      meetingUrl: parsed.data.meetingUrl,
      source: "recall",
      recallBotId: bot.id,
      fixtureId: null,
      focalParticipantId: null,
      createdAt: now,
      updatedAt: now,
      error: null,
      result: null,
    };
    await saveJob(record);
    await grantReportAccess(reportId);

    // Completion is driven by Recall's webhook (POST /api/recall/webhook),
    // which mints the proxy token and kicks off the analysis pipeline once the
    // recording is done. We deliberately do NOT poll in-process here: on a
    // serverless host the function is frozen after the response is sent, so a
    // long-lived poll loop would never run. Ensure the webhook is configured in
    // Recall (or via recording_config.realtime_endpoints) to point at this app.

    return NextResponse.json({ sessionId, reportId, reportUrl: `/report/${reportId}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to create bot" },
      { status: 500 },
    );
  }
}
