import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { JobResultSchema } from "@repo/shared";
import { getEnv } from "@/lib/server/env";
import { analyzeRecording } from "@/lib/server/analyze-recording";
import { findJobByBotId, saveJob } from "@/lib/server/store";

const SVIX_TOLERANCE_SECONDS = 24 * 60 * 60;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function verifySvix(
  secret: string,
  headers: Headers,
  body: string,
): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SVIX_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret,
    "base64",
  );
  const expected = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  return signatureHeader.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    return version === "v1" && value != null && safeEqual(value, expected);
  });
}

function verifyLegacyHex(
  secret: string,
  headers: Headers,
  body: string,
): boolean {
  const signature = headers.get("x-recall-signature");
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return safeEqual(signature, expected);
}

export const maxDuration = 300;

/**
 * Recall webhook receiver. On recording completion, fetches the recording and
 * analyzes it directly via the Interhuman upload API — no intermediate proxy.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const env = getEnv();

  if (env.RECALL_WEBHOOK_SECRET) {
    const secret = env.RECALL_WEBHOOK_SECRET;
    const ok =
      verifySvix(secret, request.headers, rawBody) ||
      verifyLegacyHex(secret, request.headers, rawBody);
    if (!ok) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }

  let event: { event?: string; data?: { bot_id?: string; bot?: { id?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const botId = event.data?.bot_id ?? event.data?.bot?.id;
  const type = event.event ?? "";

  if (!botId) return NextResponse.json({ ok: true });

  const job = await findJobByBotId(botId);
  if (!job) return NextResponse.json({ ok: true });

  if (type === "recording.done" || type === "bot.done") {
    const restartable =
      job.status === "queued" ||
      job.status === "fetching" ||
      job.status === "failed";
    if (restartable) {
      job.status = "analyzing";
      job.error = null;
      job.updatedAt = new Date().toISOString();
      await saveJob(job);

      try {
        const result = await analyzeRecording(
          botId,
          job.focalParticipantId ?? undefined,
        );
        result.sessionId = job.sessionId;

        job.status = "done";
        job.result = result;
        job.updatedAt = new Date().toISOString();
        if (job.focalParticipantId) {
          const full = JobResultSchema.safeParse(result);
          if (full.success) {
            job.resultsByParticipant = {
              ...job.resultsByParticipant,
              [job.focalParticipantId]: full.data,
            };
          }
        }
        await saveJob(job);
      } catch (err) {
        console.error("analyzeRecording failed", err);
        const detail = err instanceof Error ? err.message : String(err);
        job.status = "failed";
        job.error = detail;
        job.updatedAt = new Date().toISOString();
        await saveJob(job);
        return NextResponse.json(
          { error: "analysis failed", detail },
          { status: 502 },
        );
      }
    }
  } else if (type === "recording.failed" || type === "bot.fatal") {
    job.status = "failed";
    job.error = "Recording failed";
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
  }

  return NextResponse.json({ ok: true });
}
