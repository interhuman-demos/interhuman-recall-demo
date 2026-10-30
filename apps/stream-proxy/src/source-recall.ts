import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import ffmpegStatic from "ffmpeg-static";
import {
  type Participant,
  type TranscriptSegment,
} from "@repo/shared";
import type { Env } from "./env.js";
import type { ResolvedSource } from "./source.js";

const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";

/**
 * Raised when the chosen focal participant has no isolated video track — almost
 * always because their camera was off. The pipeline surfaces this verbatim so
 * the user can pick someone who was on camera instead of getting a bogus read
 * from the mixed composite.
 */
export class NoIsolatedVideoError extends Error {
  constructor(name: string) {
    super(
      `${name} didn't have their camera on during the call, so there's no video to analyze. Pick a participant who was on camera.`,
    );
    this.name = "NoIsolatedVideoError";
  }
}

function recallBase(env: Env): string {
  return `https://${env.RECALL_REGION}.recall.ai/api/v1`;
}

async function recallGet<T>(env: Env, path: string): Promise<T> {
  if (!env.RECALL_API_KEY) throw new Error("RECALL_API_KEY is not configured");
  const res = await fetch(`${recallBase(env)}${path}`, {
    headers: {
      Authorization: env.RECALL_API_KEY,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Recall GET ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function recallPost<T>(env: Env, path: string, body: unknown): Promise<T> {
  if (!env.RECALL_API_KEY) throw new Error("RECALL_API_KEY is not configured");
  const res = await fetch(`${recallBase(env)}${path}`, {
    method: "POST",
    headers: {
      Authorization: env.RECALL_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `Recall POST ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

interface RecallMediaShortcut {
  status?: { code?: string };
  data?: { download_url?: string };
}

interface RecallRecording {
  id: string;
  media_shortcuts?: {
    video_mixed?: RecallMediaShortcut;
    transcript?: RecallMediaShortcut;
  };
}

/**
 * An entry in the `/video_separate` or `/audio_separate` list response. Each
 * points (via `data.download_url`) at a JSON manifest of per-participant parts.
 */
interface RecallSeparateMedia {
  id: string;
  data?: { download_url?: string };
  format?: string;
}

interface RecallSeparateListResponse {
  results?: RecallSeparateMedia[];
}

/**
 * A single participant's media part, as found inside a separate-media manifest.
 * `download_url` here is the actual mp4/mp3 file for that one person.
 */
interface RecallSeparatePart {
  download_url?: string;
  participant?: { id?: number | string; name?: string; is_host?: boolean };
}

interface RecallBot {
  id: string;
  recordings?: RecallRecording[];
}

interface RecallTranscriptWord {
  text: string;
  start_timestamp?: { relative?: number };
  end_timestamp?: { relative?: number };
}

interface RecallTranscriptEntry {
  participant?: { id?: number | string; name?: string };
  words?: RecallTranscriptWord[];
}

/**
 * Fetch a Recall bot's transcript + composite recording and normalize them into
 * a ResolvedSource.
 *
 * Transcript strategy: the bot is created with real-time streaming
 * transcription, but that only persists utterances if the live `transcript.data`
 * webhook was reachable during the call. For a reliable post-call transcript we
 * fall back to Recall *async* transcription (`recallai_async`), which transcribes
 * the finished recording server-side regardless of webhook delivery.
 */
export async function resolveRecallSource(
  env: Env,
  botId: string,
  focalParticipantId?: string,
): Promise<ResolvedSource> {
  const bot = await recallGet<RecallBot>(env, `/bot/${botId}/`);
  const recording = bot.recordings?.[0];
  if (!recording) throw new Error("No recording on bot");

  const mixedUrl = recording.media_shortcuts?.video_mixed?.data?.download_url;

  const transcriptRaw = await resolveTranscript(env, recording);
  const { transcript, participants, durationS } =
    normalizeTranscript(transcriptRaw);

  const workDir = await mkdtemp(join(tmpdir(), "ih-recall-"));
  const cleanup = async () => {
    const { rm } = await import("node:fs/promises");
    await rm(workDir, { recursive: true, force: true });
  };

  // Phase A (no focal speaker chosen yet): we only need *a* video so the
  // pipeline can produce participants for the picker. The mixed composite is
  // fine here — it never reaches Interhuman because the pipeline pauses at the
  // awaiting_focal gate before segmentation.
  if (!focalParticipantId) {
    if (!mixedUrl) throw new Error("No recording download URL on bot");
    const videoPath = join(workDir, "recording.mp4");
    await downloadWithRetry(mixedUrl, videoPath);
    return {
      videoPath,
      transcript,
      participants,
      durationS,
      isolatedSubject: false,
      cleanup,
    };
  }

  // Phase B (focal speaker chosen): fetch that one person's isolated video and
  // audio tracks and mux them into a single single-subject file. This is the
  // file that actually gets segmented and sent to Interhuman, so its signals
  // describe exactly one real person.
  try {
    const focalName =
      participants.find((p) => p.id === focalParticipantId)?.name ??
      focalParticipantId;
    const videoUrl = await findSeparatePartUrl(
      env,
      recording.id,
      "video_separate",
      focalParticipantId,
    );
    if (!videoUrl) throw new NoIsolatedVideoError(focalName);

    const audioUrl = await findSeparatePartUrl(
      env,
      recording.id,
      "audio_separate",
      focalParticipantId,
    );

    const isolatedVideoPath = join(workDir, "isolated-video.mp4");
    await downloadWithRetry(videoUrl, isolatedVideoPath);

    let isolatedAudioPath: string | null = null;
    if (audioUrl) {
      isolatedAudioPath = join(workDir, "isolated-audio.mp3");
      await downloadWithRetry(audioUrl, isolatedAudioPath);
    } else {
      console.warn(
        `[recall] no separate audio for participant ${focalParticipantId}; analyzing silent video`,
      );
    }

    const muxedPath = join(workDir, "focal-subject.mp4");
    await muxVideoAudio(isolatedVideoPath, isolatedAudioPath, muxedPath);

    return {
      videoPath: muxedPath,
      transcript,
      participants,
      durationS,
      isolatedSubject: true,
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/**
 * Resolve the actual media download URL for one participant from a separate
 * (video or audio) media collection. Walks the two-level structure: the list
 * endpoint returns media entries, each pointing at a JSON manifest of
 * per-participant parts. Returns null when that participant has no part (e.g.
 * camera/mic off).
 */
async function findSeparatePartUrl(
  env: Env,
  recordingId: string,
  endpoint: "video_separate" | "audio_separate",
  participantId: string,
): Promise<string | null> {
  let list: RecallSeparateListResponse;
  try {
    list = await recallGet<RecallSeparateListResponse>(
      env,
      `/${endpoint}?recording_id=${recordingId}`,
    );
  } catch (err) {
    console.warn(`[recall] ${endpoint} list failed: ${String(err)}`);
    return null;
  }

  for (const media of list.results ?? []) {
    const manifestUrl = media.data?.download_url;
    if (!manifestUrl) continue;
    let parts: RecallSeparatePart[] | RecallSeparatePart;
    try {
      parts = await fetchJsonWithRetry<RecallSeparatePart[] | RecallSeparatePart>(
        manifestUrl,
      );
    } catch {
      continue;
    }
    const arr = Array.isArray(parts) ? parts : [parts];
    const match = arr.find(
      (p) => p.participant != null && String(p.participant.id) === participantId,
    );
    if (match?.download_url) return match.download_url;
  }
  return null;
}

/**
 * Mux an isolated (silent) participant video with their separate audio into one
 * mp4 without re-encoding. When no audio is available, just normalize the video.
 */
function muxVideoAudio(
  videoPath: string,
  audioPath: string | null,
  outPath: string,
): Promise<void> {
  const args = audioPath
    ? [
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-c",
        "copy",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-shortest",
        outPath,
      ]
    : ["-i", videoPath, "-c", "copy", outPath];
  return runFfmpeg(args);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, ["-y", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

/**
 * Get transcript entries for a recording. Prefers an existing (streaming)
 * transcript when it has content; otherwise kicks off an async transcript and
 * waits for it to complete.
 */
async function resolveTranscript(
  env: Env,
  recording: RecallRecording,
): Promise<RecallTranscriptEntry[]> {
  const existingUrl = recording.media_shortcuts?.transcript?.data?.download_url;
  if (existingUrl) {
    const entries =
      await fetchJsonWithRetry<RecallTranscriptEntry[]>(existingUrl);
    if (entries.length > 0) return entries;
    console.log(
      `[recall] streaming transcript empty for recording ${recording.id}; falling back to async transcription`,
    );
  }
  return createAndAwaitAsyncTranscript(env, recording.id);
}

interface RecallTranscriptArtifact {
  id: string;
  status?: { code?: string; sub_code?: string | null };
  data?: { download_url?: string };
}

/**
 * Create a Recall async transcript for a recording and poll until it's done,
 * then download and return the entries.
 */
async function createAndAwaitAsyncTranscript(
  env: Env,
  recordingId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<RecallTranscriptEntry[]> {
  const intervalMs = opts.intervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;

  const created = await recallPost<RecallTranscriptArtifact>(
    env,
    `/recording/${recordingId}/create_transcript/`,
    {
      provider: { recallai_async: { language_code: "en" } },
      diarization: { use_separate_streams_when_available: true },
    },
  );

  const startedAt = Date.now();
  let transcriptId = created.id;
  while (Date.now() - startedAt < timeoutMs) {
    const artifact = await recallGet<RecallTranscriptArtifact>(
      env,
      `/transcript/${transcriptId}/`,
    );
    const code = artifact.status?.code;
    if (code === "done") {
      const url = artifact.data?.download_url;
      if (!url) throw new Error("Async transcript done but no download_url");
      return fetchJsonWithRetry<RecallTranscriptEntry[]>(url);
    }
    if (code === "failed" || code === "error") {
      throw new Error(
        `Async transcript failed: ${code} ${artifact.status?.sub_code ?? ""}`,
      );
    }
    transcriptId = artifact.id ?? transcriptId;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Async transcript timed out");
}

/**
 * Download and parse a JSON media-shortcut file. The shortcut's signed URL can
 * briefly lag the recording.done webhook, so retry a few times before giving up.
 */
async function fetchJsonWithRetry<T>(url: string, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch status ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch transcript JSON: ${String(lastErr)}`);
}

function normalizeTranscript(entries: RecallTranscriptEntry[]): {
  transcript: TranscriptSegment[];
  participants: Participant[];
  durationS: number;
} {
  const transcript: TranscriptSegment[] = [];
  const talkTime = new Map<string, { name: string; seconds: number }>();
  let maxEnd = 0;

  entries.forEach((entry, i) => {
    const words = entry.words ?? [];
    if (words.length === 0) return;
    const startS = words[0]?.start_timestamp?.relative ?? 0;
    const endS =
      words[words.length - 1]?.end_timestamp?.relative ?? startS;
    const speaker = entry.participant?.name ?? `Speaker ${entry.participant?.id ?? "?"}`;
    const id = String(entry.participant?.id ?? speaker);

    transcript.push({
      index: i,
      speaker,
      startS,
      endS,
      text: words.map((w) => w.text).join(" "),
    });

    const prev = talkTime.get(id) ?? { name: speaker, seconds: 0 };
    prev.seconds += Math.max(0, endS - startS);
    talkTime.set(id, prev);
    maxEnd = Math.max(maxEnd, endS);
  });

  const participants: Participant[] = [...talkTime.entries()].map(
    ([id, v]) => ({ id, name: v.name, talkTimeS: v.seconds }),
  );

  return { transcript, participants, durationS: maxEnd };
}

async function downloadWithRetry(
  url: string,
  destPath: string,
  attempts = 4,
): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`download status ${res.status}`);
      await streamPipeline(
        Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(destPath),
      );
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
    }
  }
  throw new Error(
    `Failed to download recording after ${attempts} attempts: ${String(lastErr)}`,
  );
}
