import {
  type AnalysisSignal,
  type ConversationQuality,
  type EngagementPoint,
  type InterhumanEvent,
  type TranscriptSegment,
  windowIndexForStart,
} from "@repo/shared";

/**
 * Find the transcript segment that overlaps a given start time. Used to snap a
 * detected signal onto the line the focal speaker was saying at that moment.
 *
 * When `focalSpeaker` is provided, only that speaker's lines are considered, so
 * a signal from the isolated focal video can't get pinned to someone else's
 * line just because it happened to overlap in time.
 */
function findTranscriptIndex(
  transcript: TranscriptSegment[],
  startS: number,
  focalSpeaker?: string,
): number | null {
  const lines = focalSpeaker
    ? transcript.filter((seg) => seg.speaker === focalSpeaker)
    : transcript;
  for (const seg of lines) {
    if (startS >= seg.startS && startS < seg.endS) return seg.index;
  }
  // Fall back to the nearest preceding segment.
  let best: TranscriptSegment | null = null;
  for (const seg of lines) {
    if (seg.startS <= startS && (!best || seg.startS > best.startS)) best = seg;
  }
  return best ? best.index : null;
}

export interface ReconcileResult {
  signals: AnalysisSignal[];
  engagement: EngagementPoint[];
  conversationQuality: ConversationQuality;
}

/**
 * Turn the raw collected Interhuman events into normalized, transcript-anchored
 * outputs. All signals are attributed to the focal speaker.
 *
 * When `isolatedSubject` is true the analyzed video was a single isolated
 * participant, so signals truly belong to the focal speaker and are pinned only
 * to that speaker's own transcript lines. When false (mixed composite), signals
 * are still labelled with the focal speaker but pinned by time alone.
 */
export function reconcileEvents(
  events: InterhumanEvent[],
  transcript: TranscriptSegment[],
  focalSpeaker: string,
  isolatedSubject = false,
): ReconcileResult {
  const signals: AnalysisSignal[] = [];
  const engagement: EngagementPoint[] = [];
  let cq: ConversationQuality = {
    cqi: 50,
    dimensions: {
      clarity: 50,
      authority: 50,
      energy: 50,
      rapport: 50,
      learning: 50,
    },
  };

  for (const event of events) {
    switch (event.type) {
      case "signal.detected": {
        const raw = event.data as Record<string, unknown>;
        const entries = Array.isArray(raw.signals)
          ? (raw.signals as Record<string, unknown>[])
          : [raw];
        for (const entry of entries) {
          const start = Number(entry.start ?? 0);
          const end = typeof entry.end === "number" ? entry.end : null;
          const signalType = String(entry.signal_type ?? entry.type ?? "");
          const probability = (entry.probability as string | undefined) ?? null;
          const rationale = (entry.rationale as string | undefined) ?? null;
          signals.push({
            windowIndex: windowIndexForStart(start),
            startS: start,
            endS: end,
            speaker: focalSpeaker,
            type: signalType as (typeof signals)[number]["type"],
            probability: probability as (typeof signals)[number]["probability"],
            rationale,
            transcriptIndex: findTranscriptIndex(
              transcript,
              start,
              isolatedSubject ? focalSpeaker : undefined,
            ),
          });
        }
        break;
      }
      case "engagement.updated": {
        engagement.push({
          state: event.data.state,
          startS: event.data.start,
          endS: event.data.end ?? null,
        });
        break;
      }
      case "conversation_quality.updated": {
        const overall = event.data.overall;
        if (overall) {
          cq = {
            cqi: overall.quality_index,
            dimensions: {
              clarity: overall.clarity,
              authority: overall.authority,
              energy: overall.energy,
              rapport: overall.rapport,
              learning: overall.learning,
            },
          };
        }
        break;
      }
      default:
        break;
    }
  }

  signals.sort((a, b) => a.startS - b.startS);
  engagement.sort((a, b) => a.startS - b.startS);
  return { signals, engagement, conversationQuality: cq };
}
