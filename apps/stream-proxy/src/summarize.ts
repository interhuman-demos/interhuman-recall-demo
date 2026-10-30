import { createOpenAI } from "@ai-sdk/openai";
import { streamObject } from "ai";
import {
  type AnalysisSignal,
  type ConversationQuality,
  type EngagementPoint,
  type PartialSummary,
  type Summary,
  SummarySchema,
  type TranscriptSegment,
} from "@repo/shared";
import type { Env } from "./env.js";

const MODEL = "gpt-5.4";

interface SummaryInput {
  focalSpeaker: string;
  durationS: number;
  transcript: TranscriptSegment[];
  signals: AnalysisSignal[];
  engagement: EngagementPoint[];
  conversationQuality: ConversationQuality;
}

const SYSTEM_PROMPT = `You write a personal, post-call report for ONE participant (the "focal user") about how THEY came across in a meeting — specifically, about the SOCIAL SIGNALS a behavioral model detected in their delivery (confidence, hesitation, engagement, etc.). This is NOT a meeting-summary or a negotiation-advice tool. It is a behavioral-communication coach. The detected signals and their rationales are your PRIMARY EVIDENCE; the transcript is only there to tell you what was being said when each signal fired.

You are given:
- Social signals detected by a behavioral model (type, probability, rationale, start/end), already attributed to the FOCAL USER only. THESE ARE THE SUBJECT OF THE REPORT.
- A diarized transcript of the WHOLE conversation (all speakers, with timestamps). This is CONTEXT ONLY: it tells you what was said and how others responded, so you can describe what triggered each signal. Do NOT coach on the content of what was said.
- An engagement timeline and a Conversation Quality Index (CQI) with five dimension scores for the focal user.

CORE PRINCIPLE — signal-first feedback:
- Every observation, strength, watch-out, and coaching tip MUST be anchored to one or more DETECTED SIGNALS and their rationale. If a point can't be traced back to a specific signal (its type, rationale, and timestamp), do NOT make it.
- You are coaching HOW the focal user came across (their delivery, presence, and the impression they projected), NOT WHAT they should have argued. Never give domain/tactical advice (e.g. "ask for a phased raise", "lead with the numbers") — that ignores the signals. Instead coach the behavior the signals revealed (e.g. "the model flagged hesitation as you opened — slow down and land your first sentence before continuing").
- Quote the signal's rationale or paraphrase it as the reason. Tie advice to the signal type: hesitation → steadiness/pacing; uncertainty → conviction; confidence/engagement → reinforce and repeat what worked.

QUALITY OVER QUANTITY — this is the most important formatting rule:
- keyMoments: emit EXACTLY ONE entry — the single strongest positive moment (highest-probability confidence, interest, agreement, or engagement signal). Pick the one that best illustrates how they came across well and write a comprehensive, specific insight for it. Do NOT pad with additional moments.
- dips: emit EXACTLY ONE entry — the single most important weaker moment (the highest-probability hesitation, uncertainty, stress, or disengagement signal). Choose the one that would most benefit from coaching. Do NOT pad.
- strengths: 1-3 items maximum, most significant first. Only include a strength if it is clearly supported by a high-probability signal; omit rather than pad.
- watchOuts: 1-3 items maximum, most significant first. Same rule — omit rather than pad.
- coaching: exactly 3 tips maximum, ranked most-impactful first. Each tip must be concrete, actionable, and explicitly grounded in a specific detected signal and its rationale. Quality over quantity.

VOICE & FRAMING:
- Write TO the focal user in second person ("you"). Refer to others by name from the transcript.
- Frame moments relationally and behaviorally: "when <other person> pushed back, the model detected hesitation (rationale: …), then your tone steadied." Use the transcript only to establish what prompted the signal.
- conversationContext: 2-3 sentences recapping what the whole meeting was about and the focal user's role. Plain recap, NOT signal analysis.
- strengths/watchOuts: each item must name the behavior a signal revealed, not a content point.

HARD RULES:
- keyMoments and dips MUST each reference real start/end seconds from a detected signal AND include an EXACT quote copied verbatim from the transcript.
- The keyMoment quote and the dip quote MUST be different transcript moments — they may NOT be the same sentence.
- Do NOT invent emotions or judge the video yourself. Use each signal's rationale as the evidence for what was detected.
- The transcript is CONTEXT for causality only; the SIGNALS are what you report and coach on. Do not turn this into advice about the subject matter discussed.
- keyMoments are positive/strong moments (confidence, interest, agreement, engagement). dips are weaker moments (hesitation, uncertainty, confusion, stress, disengagement, frustration, skepticism, disagreement).
- Set cqi to the provided CQI value. Keep narrative to 1-2 short paragraphs, and keep it about how they came across (signals), not about what they should have said.
- NEVER write raw second offsets in any prose field. Do NOT write things like "at second 67", "around 108s", "at 50", "at t=120", or any numeric timestamp in narrative, insight, strengths, watchOuts, or coaching. The startS/endS fields carry timing data; prose must use relational phrasing instead (e.g. "as you opened", "when Priya pushed back", "midway through", "toward the end"). This applies to every string field without exception.`;

export async function generateSummary(
  env: Env,
  input: SummaryInput,
  onPartial?: (partial: PartialSummary) => void,
): Promise<Summary> {
  if (!env.OPENAI_API_KEY) {
    const summary = fallbackSummary(input);
    onPartial?.(summary);
    return summary;
  }
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  const { partialObjectStream, object } = streamObject({
    model: openai(MODEL),
    schema: SummarySchema,
    system: SYSTEM_PROMPT,
    prompt: JSON.stringify({
      focalSpeaker: input.focalSpeaker,
      durationS: input.durationS,
      cqi: input.conversationQuality.cqi,
      dimensions: input.conversationQuality.dimensions,
      transcript: input.transcript,
      signals: input.signals.map((s) => ({
        startS: s.startS,
        endS: s.endS,
        type: s.type,
        probability: s.probability,
        rationale: s.rationale,
      })),
      engagement: input.engagement,
    }),
  });

  if (onPartial) {
    for await (const partial of partialObjectStream) {
      // `partial` is a DeepPartial<Summary>; the report UI tolerates missing
      // fields and partially-built array items as they stream in.
      onPartial(partial as PartialSummary);
    }
  }

  const finished = (await object) as Summary;
  return groundSummary(finished, input);
}

/**
 * Defensive grounding: drop any cited moment whose quote isn't found in the
 * transcript, clamp cqi to the real value, and ensure a key moment and a dip
 * never describe the SAME quote. The same transcript line can legitimately
 * carry both a strong and a weak high-probability signal seconds apart, and the
 * model sometimes cites the identical opening sentence for both — which reads as
 * a contradiction. We keep that quote on the key-moment side and drop the
 * colliding dip so the two cards always show distinct moments.
 */
function groundSummary(summary: Summary, input: SummaryInput): Summary {
  const transcriptText = input.transcript.map((t) => t.text).join("\n");
  const isGrounded = (quote: string) =>
    quote.length > 0 &&
    transcriptText.toLowerCase().includes(quote.trim().toLowerCase());

  const norm = (quote: string) => quote.trim().toLowerCase();

  const keyMoments = summary.keyMoments.filter((m) => isGrounded(m.quote)).slice(0, 1);
  const keyQuotes = new Set(keyMoments.map((m) => norm(m.quote)));

  // A dip may not reuse a quote already claimed by a key moment.
  const dips = summary.dips
    .filter((m) => isGrounded(m.quote) && !keyQuotes.has(norm(m.quote)))
    .slice(0, 1);

  return {
    ...summary,
    cqi: input.conversationQuality.cqi,
    keyMoments,
    dips,
    strengths: summary.strengths.slice(0, 3),
    watchOuts: summary.watchOuts.slice(0, 3),
    coaching: summary.coaching.slice(0, 3),
  };
}

/** Deterministic summary used when no OpenAI key is configured. */
function fallbackSummary(input: SummaryInput): Summary {
  const positive = new Set([
    "confidence",
    "interest",
    "agreement",
    "engagement",
  ]);
  const toMoment = (s: AnalysisSignal) => {
    const line = input.transcript.find((t) => t.index === s.transcriptIndex);
    return {
      startS: s.startS,
      endS: s.endS ?? s.startS,
      label: s.type,
      signalType: s.type,
      quote: line?.text ?? "",
      insight: s.rationale ?? `Detected ${s.type}.`,
    };
  };
  const moments = input.signals.filter((s) => {
    const line = input.transcript.find((t) => t.index === s.transcriptIndex);
    return Boolean(line?.text);
  });
  return {
    headline: `Behavioral read for ${input.focalSpeaker} (CQI ${input.conversationQuality.cqi}).`,
    cqi: input.conversationQuality.cqi,
    conversationContext:
      "Conversation recap is unavailable without an OpenAI key.",
    keyMoments: moments.filter((s) => positive.has(s.type)).map(toMoment),
    dips: moments.filter((s) => !positive.has(s.type)).map(toMoment),
    strengths: [],
    watchOuts: [],
    coaching: [],
    narrative:
      "Automatic narrative is unavailable without an OpenAI key. Key moments and dips below are derived directly from detected signals.",
  };
}
