import type { Env } from "./env.js";

/**
 * Per-segment Whisper transcription for the live bridge path.
 *
 * Used as a fallback when Recall's streaming transcript.data webhook is
 * unreachable (e.g. a rotating cloudflare tunnel URL has expired). Each
 * 5-second WebM segment produced by the live segmenter is sent to OpenAI
 * Whisper independently, mirroring what useTranscription does in the
 * direct-browser path.
 *
 * Limitations vs the Recall webhook path:
 * - No per-speaker diarization — the RTMP stream is a composite mix, so all
 *   speech is attributed to the focal speaker.
 * - ~2–5s latency added by the Whisper round-trip.
 *
 * These are acceptable trade-offs: any transcript is better than none, and
 * the Recall webhook path takes priority when it is working (see the
 * `transcribedWindows` guard in LiveSession).
 *
 * Hallucination patterns copied verbatim from
 * `google-meet-addon/lib/hallucination-filter.ts` (same source of truth as the
 * addon's direct-mode path).
 */

const HALLUCINATION_PATTERNS: readonly RegExp[] = [
  /^thanks?\s*(you\s*)?(for\s+)?(watching|listening|viewing)/i,
  /^(please\s+)?(like|subscribe)/i,
  /^(see you|bye|goodbye)/i,
  /^дякую/i,
  /^спасибо за/i,
  /^시청/i,
  /^ご視聴/i,
  /^감사합니다/i,
  /^terima kasih/i,
  /^merci d'avoir/i,
  /^gracias por ver/i,
  /^obrigado por assistir/i,
  /^danke fürs? zuschauen/i,
  /^(mamma mia|hello\??|oh|um|uh)\.?$/i,
];

const NO_SPEECH_THRESHOLD = 0.6;

function isHallucination(text: string, noSpeechProb: number): boolean {
  if (!text) return false;
  if (noSpeechProb > NO_SPEECH_THRESHOLD) return true;
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

interface WhisperVerboseResponse {
  text?: string;
  segments?: Array<{ no_speech_prob?: number }>;
}

/**
 * Transcribe one 5-second WebM segment via OpenAI Whisper (verbose_json).
 *
 * Returns `null` when:
 * - OPENAI_API_KEY is absent (silent no-op so the session continues).
 * - The response is filtered as a hallucination or contains no speech.
 *
 * Throws on HTTP / network errors so the caller can log and continue.
 */
export async function transcribeSegment(
  env: Env,
  bytes: Buffer,
  windowIndex: number,
): Promise<{ text: string; windowIndex: number } | null> {
  if (!env.OPENAI_API_KEY) return null;

  const body = new FormData();
  body.append("file", new Blob([bytes], { type: "video/webm" }), "segment.webm");
  body.append("model", "whisper-1");
  body.append("response_format", "verbose_json");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body,
    });
  } catch (err) {
    throw new Error(
      `Whisper fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`Whisper returned ${res.status}: ${raw.slice(0, 200)}`);
  }

  const result = (await res.json()) as WhisperVerboseResponse;
  const text = (result.text ?? "").trim();
  const noSpeechProb = result.segments?.[0]?.no_speech_prob ?? 0;

  if (!text || isHallucination(text, noSpeechProb)) return null;

  return { text, windowIndex };
}
