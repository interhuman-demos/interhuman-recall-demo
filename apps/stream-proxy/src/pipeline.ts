import {
  type AnalyzeRequest,
  type InterhumanEvent,
  type JobResult,
  type TranscriptSegment,
} from "@repo/shared";
import type { Env } from "./env.js";
import { InterhumanClient } from "./interhuman-client.js";
import { setError, mergeResult, setAwaitingFocal, setResult, setStatus } from "./job-store.js";
import { reconcileEvents, type ReconcileResult } from "./reconcile.js";
import { segmentVideo } from "./segmenter.js";
import { resolveFixtureSource } from "./source-fixture.js";
import { resolveFocalSpeaker, type ResolvedSource } from "./source.js";
import { generateSummary } from "./summarize.js";
import { cleanupTranscript } from "./transcript-cleanup.js";

/**
 * Compact debug logger for the pipeline. Prints structured, readable summaries
 * of everything captured and analyzed so you can inspect the full data flow.
 */
function debugLog(sessionId: string, label: string, data: unknown): void {
  const tag = `[pipeline ${sessionId.slice(0, 8)}] ${label}`;
  console.log(`\n${"=".repeat(8)} ${tag} ${"=".repeat(8)}`);
  console.dir(data, { depth: 6, maxArrayLength: 200, colors: true });
}

/**
 * Run the full post-call pipeline for a job:
 *   resolve source -> segment -> stream to Interhuman -> reconcile -> summarize.
 * Updates job status at each stage. Errors mark the job failed.
 */
export async function runPipeline(
  env: Env,
  req: AnalyzeRequest,
): Promise<void> {
  const { sessionId } = req;
  let source: ResolvedSource | null = null;
  const client = new InterhumanClient(env);

  try {
    debugLog(sessionId, "analyze request", req);

    setStatus(sessionId, "fetching");
    source = await resolveSource(env, req);

    debugLog(sessionId, "resolved source", {
      videoPath: source.videoPath,
      isolatedSubject: source.isolatedSubject ?? false,
      durationS: source.durationS,
      participants: source.participants,
      transcriptSegments: source.transcript.length,
      transcriptPreview: source.transcript.slice(0, 10).map((t) => ({
        index: t.index,
        speaker: t.speaker,
        startS: t.startS,
        endS: t.endS,
        text: t.text,
      })),
    });

    const focal = resolveFocalSpeaker(
      source.participants,
      req.focalParticipantId,
    );
    if (!focal) {
      // An empty transcript (no speech captured) yields no participants. This is
      // usually a silent call — or, historically, a real-time transcript webhook
      // that never arrived. Either way, give the user something actionable.
      if (source.transcript.length === 0) {
        throw new Error(
          "No speech was detected in this recording. Make sure you talk during the call, then try again.",
        );
      }
      throw new Error("No participants found in source");
    }

    // If the user hasn't chosen a focal speaker yet and the call has more than
    // one participant, pause here and let them pick from a dropdown. The
    // expensive Interhuman + GPT work then runs once, for the chosen speaker.
    // (Single-speaker calls skip the gate — there's nothing to choose.)
    if (!req.focalParticipantId && source.participants.length > 1) {
      setAwaitingFocal(sessionId, {
        sessionId,
        durationS: source.durationS,
        focalSpeaker: focal.name,
        participants: source.participants,
        transcript: source.transcript,
      });
      debugLog(sessionId, "awaiting focal-speaker selection", {
        participants: source.participants,
        suggestedFocal: focal.name,
      });
      return;
    }
    debugLog(sessionId, "focal speaker (the 'you')", focal);

    // We now know the focal speaker but may still be holding the *mixed*
    // composite (Phase A, or a single-participant call that skipped the gate).
    // Interhuman needs a single subject, so re-resolve to that participant's
    // isolated track before segmenting. resolveIsolatedSource is a no-op when
    // the source is already isolated (e.g. fixtures, or Phase B recall).
    source = await resolveIsolatedSource(env, req, source, focal.id);
    debugLog(sessionId, "isolated source", {
      videoPath: source.videoPath,
      isolatedSubject: source.isolatedSubject ?? false,
    });

    // Clean up the fragmented diarized transcript (merge same-speaker runs, fix
    // obvious mishearings) while the video gets segmented and analyzed. Both
    // reconcile and the summary use the cleaned transcript; signals re-anchor by
    // time, so merging lines is safe. Runs concurrently to hide its latency.
    const rawTranscript = source.transcript;
    const cleanedTranscriptP = cleanupTranscript(env, rawTranscript);

    // Publish the transcript immediately so the report shell renders while
    // segmentation + analysis are still running. The cleaned version replaces
    // it below once GPT finishes; the UI reconciles rows by stable index.
    mergeResult(sessionId, {
      sessionId,
      durationS: source.durationS,
      focalSpeaker: focal.name,
      participants: source.participants,
      transcript: rawTranscript,
    });

    setStatus(sessionId, "segmenting");
    const segments = await segmentVideo(source.videoPath, undefined, source.durationS);
    if (segments.length === 0) throw new Error("Segmentation produced no output");
    debugLog(sessionId, "video segments", {
      count: segments.length,
      indices: segments.map((s) => s.index),
      totalBytes: segments.reduce((n, s) => n + s.bytes.byteLength, 0),
    });

    // Latest transcript pointer: starts as raw, swapped to cleaned once ready.
    // The onProgress callback captures this by reference so reconcile always
    // anchors signals to the most up-to-date transcript available.
    let latestTranscript: TranscriptSegment[] = rawTranscript;

    setStatus(sessionId, "analyzing");
    const events = await streamSegments(
      client,
      segments,
      (partial) => {
        // Incrementally publish signals/engagement/CQI as each Interhuman
        // window completes. The UI renders whatever is present and fills in
        // the rest progressively.
        mergeResult(sessionId, {
          sessionId,
          signals: partial.signals,
          engagement: partial.engagement,
          conversationQuality: partial.conversationQuality,
        });
      },
      () => latestTranscript,
      focal.name,
      source.isolatedSubject ?? false,
    );
    debugLog(sessionId, "raw interhuman events", {
      count: events.length,
      byType: events.reduce<Record<string, number>>((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1;
        return acc;
      }, {}),
      events,
    });

    const transcript = await cleanedTranscriptP;
    // Swap in the cleaned transcript now that it's ready.
    latestTranscript = transcript;
    debugLog(sessionId, "cleaned transcript", {
      rawSegments: rawTranscript.length,
      cleanedSegments: transcript.length,
      changed: transcript.length !== rawTranscript.length,
      preview: transcript.slice(0, 12).map((t) => ({
        speaker: t.speaker,
        startS: t.startS,
        endS: t.endS,
        text: t.text,
      })),
    });

    // Final reconcile against the cleaned transcript. Signals re-anchor to
    // cleaned lines; this is the authoritative version published below.
    const { signals, engagement, conversationQuality } = reconcileEvents(
      events,
      transcript,
      focal.name,
      source.isolatedSubject ?? false,
    );
    debugLog(sessionId, "reconciled analysis (focal user)", {
      signals,
      engagement,
      conversationQuality,
    });

    // Publish the complete analysis half — cleaned transcript + final signals.
    mergeResult(sessionId, {
      sessionId,
      durationS: source.durationS,
      focalSpeaker: focal.name,
      participants: source.participants,
      transcript,
      signals,
      engagement,
      conversationQuality,
    });

    setStatus(sessionId, "summarizing");
    const summary = await generateSummary(
      env,
      {
        focalSpeaker: focal.name,
        durationS: source.durationS,
        transcript,
        signals,
        engagement,
        conversationQuality,
      },
      (partial) => {
        // Push each streamed slice of the summary so the report fills in as the
        // model writes it, rather than appearing all at once at the end.
        mergeResult(sessionId, { sessionId, summary: partial });
      },
    );
    debugLog(sessionId, "gpt summary", summary);

    const result: JobResult = {
      sessionId,
      durationS: source.durationS,
      focalSpeaker: focal.name,
      participants: source.participants,
      transcript,
      signals,
      engagement,
      conversationQuality,
      summary,
    };
    setResult(sessionId, result);
    debugLog(sessionId, "DONE — final job result stored", {
      focalSpeaker: result.focalSpeaker,
      signalCount: result.signals.length,
      cqi: result.conversationQuality.cqi,
    });
  } catch (err) {
    console.error(
      `[pipeline ${sessionId.slice(0, 8)}] FAILED:`,
      err instanceof Error ? err.stack ?? err.message : err,
    );
    setError(sessionId, err instanceof Error ? err.message : String(err));
  } finally {
    client.close();
    await source?.cleanup();
  }
}

async function resolveSource(
  env: Env,
  req: AnalyzeRequest,
): Promise<ResolvedSource> {
  if (req.fixtureId) return resolveFixtureSource(req.fixtureId);
  if (req.recallBotId) {
    const { resolveRecallSource } = await import("./source-recall.js");
    return resolveRecallSource(env, req.recallBotId, req.focalParticipantId);
  }
  throw new Error("Request must include fixtureId or recallBotId");
}

/**
 * Ensure the source video is a single isolated subject before analysis. If the
 * current source is already isolated (or isn't a recall bot), it's returned
 * unchanged. Otherwise we re-resolve the recall source for the focal
 * participant — fetching their per-participant track — and dispose the mixed
 * composite we were holding.
 */
async function resolveIsolatedSource(
  env: Env,
  req: AnalyzeRequest,
  current: ResolvedSource,
  focalId: string,
): Promise<ResolvedSource> {
  if (current.isolatedSubject) return current;
  if (!req.recallBotId) return current;

  const { resolveRecallSource } = await import("./source-recall.js");
  const isolated = await resolveRecallSource(env, req.recallBotId, focalId);
  // We no longer need the mixed composite that was downloaded for the picker.
  await current.cleanup();
  return isolated;
}

/**
 * Open the upstream socket, stream segments in order via a promise queue, and
 * collect all emitted events. Resolves shortly after the final segment so late
 * signals have a chance to arrive.
 *
 * Calls `onProgress` with a freshly-reconciled partial result after each
 * Interhuman event (debounced 250ms) so the UI fills in progressively rather
 * than waiting for the full run. `getTranscript` is called at reconcile time
 * so the latest version (raw or cleaned) is always used.
 */
function streamSegments(
  client: InterhumanClient,
  segments: { index: number; bytes: Buffer }[],
  onProgress: (partial: ReconcileResult) => void,
  getTranscript: () => TranscriptSegment[],
  focalName: string,
  isolatedSubject: boolean,
): Promise<InterhumanEvent[]> {
  return new Promise((resolve, reject) => {
    const events: InterhumanEvent[] = [];

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleProgress() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        onProgress(reconcileEvents(events, getTranscript(), focalName, isolatedSubject));
      }, 250);
    }

    client.on("event", (e) => {
      events.push(e);
      scheduleProgress();
    });
    client.on("error", reject);

    client
      .connect({
        include: [
          "conversation_quality_overall",
          "conversation_quality_timeline",
        ],
      })
      .then(async () => {
        let queue: Promise<void> = Promise.resolve();
        for (const seg of segments) {
          queue = queue.then(() => {
            client.sendSegment(seg.bytes);
          });
        }
        await queue;
        // Allow time for the final window's events to come back.
        setTimeout(() => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          resolve(events);
        }, 4_000);
      })
      .catch(reject);
  });
}
