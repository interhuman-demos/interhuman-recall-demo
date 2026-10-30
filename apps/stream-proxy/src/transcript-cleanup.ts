import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { type TranscriptSegment } from "@repo/shared";
import { z } from "zod";
import type { Env } from "./env.js";

const MODEL = "gpt-5.4";

/**
 * Output schema for the cleanup pass. The model returns a re-grouped transcript
 * where each line carries the original segment indices it was built from, plus
 * its own corrected text. We re-derive speaker/timestamps ourselves from those
 * source indices so the model can never invent a speaker or move a line in time.
 */
const CleanedLineSchema = z.object({
  // Indices (from the input transcript) merged into this line, in order.
  sourceIndices: z.array(z.number().int()).min(1),
  // The corrected, readable text for the merged line.
  text: z.string(),
});
const CleanupResultSchema = z.object({ lines: z.array(CleanedLineSchema) });

const SYSTEM_PROMPT = `You clean up a diarized meeting transcript produced by a streaming speech-to-text system. The raw transcript is fragmented: a single spoken sentence is often split into many one-word segments, and short mishearings occur.

Your job is to produce a cleaner, more readable transcript WITHOUT changing what was actually said.

You are given an array of segments, each with: index, speaker, startS, endS, text.

RULES — follow ALL of them:
1. MERGE consecutive segments that have the SAME speaker into one natural line. List every merged input index in sourceIndices, in order. Start a new line whenever the speaker changes.
2. You may FIX obvious speech-to-text errors using conversational context (e.g. a phrase that makes no sense literally but is an obvious mishearing). Keep corrections minimal and faithful — fix words, do not rewrite meaning or style.
3. NEVER invent content that wasn't spoken. NEVER merge across a speaker change. NEVER drop a speaker's turn entirely. Every input index must appear in exactly one line's sourceIndices.
4. Preserve the speaker's actual phrasing, filler, and informality. Do NOT make people sound more articulate than they were — this transcript is used to assess how they really communicated.
5. Keep lines in chronological order.

Output ONLY the lines array.`;

/**
 * Clean up a fragmented diarized transcript: merge same-speaker runs into
 * readable lines and fix obvious mis-transcriptions, without altering speakers,
 * timing, or meaning. Falls back to the original transcript on any failure or
 * if the model's output doesn't faithfully cover the input.
 */
export async function cleanupTranscript(
  env: Env,
  transcript: TranscriptSegment[],
): Promise<TranscriptSegment[]> {
  if (!env.OPENAI_API_KEY || transcript.length === 0) return transcript;

  try {
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    const { object } = await generateObject({
      model: openai(MODEL),
      schema: CleanupResultSchema,
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(
        transcript.map((t) => ({
          index: t.index,
          speaker: t.speaker,
          startS: t.startS,
          endS: t.endS,
          text: t.text,
        })),
      ),
    });

    const rebuilt = rebuildFromCleaned(transcript, object.lines);
    return rebuilt ?? transcript;
  } catch {
    // Cleanup is best-effort; never block the report on it.
    return transcript;
  }
}

/**
 * Rebuild a transcript from the model's merged lines. Speaker and timestamps are
 * taken from the original segments (never the model), and the result is rejected
 * (returns null -> caller keeps the raw transcript) unless every original index
 * is used exactly once and no line mixes speakers.
 */
function rebuildFromCleaned(
  original: TranscriptSegment[],
  lines: { sourceIndices: number[]; text: string }[],
): TranscriptSegment[] | null {
  const byIndex = new Map(original.map((seg) => [seg.index, seg]));
  const seen = new Set<number>();
  const rebuilt: TranscriptSegment[] = [];

  lines.forEach((line, i) => {
    const segs = line.sourceIndices
      .map((idx) => byIndex.get(idx))
      .filter((s): s is TranscriptSegment => s != null);
    if (segs.length === 0) return;

    // A merged line must be a single speaker; bail the whole cleanup otherwise.
    const speaker = segs[0]!.speaker;
    if (segs.some((s) => s.speaker !== speaker)) throw new Error("mixed speaker");

    for (const s of segs) {
      if (seen.has(s.index)) throw new Error("duplicate index");
      seen.add(s.index);
    }

    rebuilt.push({
      index: i,
      speaker,
      startS: Math.min(...segs.map((s) => s.startS)),
      endS: Math.max(...segs.map((s) => s.endS)),
      text: line.text.trim() || segs.map((s) => s.text).join(" "),
    });
  });

  // Every original segment must be accounted for exactly once.
  if (seen.size !== original.length) return null;
  if (rebuilt.length === 0) return null;
  return rebuilt;
}
