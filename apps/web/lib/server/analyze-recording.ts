import {
  type AnalysisSignal,
  type ConversationQuality,
  type EngagementPoint,
  type JobResult,
  type Participant,
  type TranscriptSegment,
} from "@repo/shared";
import { AuthClient, UploadClient, StaticTokenProvider, Scope } from "@interhumanai/sdk";
import { getEnv } from "./env";
import { generateSummary } from "./summarize";

const RECALL_TRANSCRIPT_POLL_INTERVAL_MS = 5_000;
const RECALL_TRANSCRIPT_TIMEOUT_MS = 10 * 60 * 1000;

function recallBase(): string {
  const env = getEnv();
  return `https://${env.RECALL_REGION}.recall.ai/api/v1`;
}

async function recallGet<T>(path: string): Promise<T> {
  const env = getEnv();
  if (!env.RECALL_API_KEY) throw new Error("RECALL_API_KEY is not configured");
  const res = await fetch(`${recallBase()}${path}`, {
    headers: { Authorization: env.RECALL_API_KEY, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Recall GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function recallPost<T>(path: string, body: unknown): Promise<T> {
  const env = getEnv();
  if (!env.RECALL_API_KEY) throw new Error("RECALL_API_KEY is not configured");
  const res = await fetch(`${recallBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: env.RECALL_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Recall POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

interface RecallRecording {
  id: string;
  media_shortcuts?: {
    video_mixed?: { data?: { download_url?: string } };
    transcript?: { data?: { download_url?: string } };
  };
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

interface RecallTranscriptArtifact {
  id: string;
  status?: { code?: string; sub_code?: string | null };
  data?: { download_url?: string };
}

interface RecallSeparateMedia {
  id: string;
  data?: { download_url?: string };
}

interface RecallSeparatePart {
  download_url?: string;
  participant?: { id?: number | string; name?: string; is_host?: boolean };
}

/**
 * Run the full post-call analysis pipeline directly from a Vercel function:
 *   1. Fetch recording + transcript from Recall
 *   2. Upload video to Interhuman /v1/upload/analyze
 *   3. Return assembled JobResult
 */
export async function analyzeRecording(
  botId: string,
  focalParticipantId?: string,
): Promise<JobResult> {
  const env = getEnv();
  if (!env.INTERHUMAN_API_KEY) throw new Error("INTERHUMAN_API_KEY is not configured");

  const bot = await recallGet<RecallBot>(`/bot/${botId}/`);
  const recording = bot.recordings?.[0];
  if (!recording) throw new Error("No recording on bot");

  // Resolve transcript (streaming or async)
  const transcriptP = resolveTranscript(recording);

  // Find video to upload — prefer isolated focal participant track
  const videoBlob = await resolveVideo(recording, focalParticipantId);
  if (!videoBlob) throw new Error("No video available for analysis");

  // Mint a short-lived upload-scoped token from the full API key, then upload
  // via the SDK's UploadClient (which attaches the token and normalizes errors).
  const auth = new AuthClient({ environment: "production" });
  const clientToken = await auth.createClientToken({
    apiKey: env.INTERHUMAN_API_KEY,
    scopes: [Scope.Upload],
  });
  const upload = new UploadClient({
    tokenProvider: new StaticTokenProvider(clientToken.access_token),
    environment: "production",
  });

  const ihResult = await upload.analyze({
    file: videoBlob,
    filename: "recording.mp4",
    include: ["conversation_quality_overall", "conversation_quality_timeline"],
  });

  // Wait for transcript
  const { transcript, participants, durationS } = await transcriptP;

  // Determine focal speaker
  const focalName = focalParticipantId
    ? (participants.find((p) => p.id === focalParticipantId)?.name ?? "You")
    : (participants[0]?.name ?? "You");

  // Map Interhuman signals to our schema
  const signals: AnalysisSignal[] = (ihResult.signals ?? []).map((s) => ({
    windowIndex: Math.floor(s.start / 5),
    startS: s.start,
    endS: s.end,
    speaker: focalName,
    type: s.type,
    probability: s.probability,
    rationale: s.rationale ?? null,
    transcriptIndex: findTranscriptIndex(transcript, s.start),
  }));

  const engagement: EngagementPoint[] = (ihResult.engagement_state ?? []).map((e) => ({
    state: e.state,
    startS: e.start,
    endS: e.end,
  }));

  const cq = ihResult.conversation_quality;
  const conversationQuality: ConversationQuality = cq
    ? {
        cqi: cq.overall.quality_index,
        dimensions: {
          clarity: cq.overall.clarity,
          authority: cq.overall.authority,
          energy: cq.overall.energy,
          rapport: cq.overall.rapport,
          learning: cq.overall.learning,
        },
      }
    : { cqi: 0, dimensions: {} };

  const summary = await generateSummary({
    focalSpeaker: focalName,
    durationS,
    transcript,
    signals,
    engagement,
    conversationQuality,
  });

  return {
    sessionId: bot.id,
    durationS,
    focalSpeaker: focalName,
    participants,
    transcript,
    signals,
    engagement,
    conversationQuality,
    summary,
  };
}

function findTranscriptIndex(transcript: TranscriptSegment[], timeS: number): number | null {
  for (const seg of transcript) {
    if (timeS >= seg.startS && timeS <= seg.endS) return seg.index;
  }
  return null;
}

async function resolveVideo(
  recording: RecallRecording,
  focalParticipantId?: string,
): Promise<Blob | null> {
  if (focalParticipantId) {
    const url = await findSeparatePartUrl(recording.id, "video_separate", focalParticipantId);
    if (url) return downloadAsBlob(url);
  }
  const mixedUrl = recording.media_shortcuts?.video_mixed?.data?.download_url;
  if (mixedUrl) return downloadAsBlob(mixedUrl);
  return null;
}

async function downloadAsBlob(url: string, attempts = 4): Promise<Blob> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download status ${res.status}`);
      return await res.blob();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
    }
  }
  throw new Error(`Failed to download recording: ${String(lastErr)}`);
}

async function findSeparatePartUrl(
  recordingId: string,
  endpoint: "video_separate" | "audio_separate",
  participantId: string,
): Promise<string | null> {
  let list: { results?: RecallSeparateMedia[] };
  try {
    list = await recallGet(`/${endpoint}?recording_id=${recordingId}`);
  } catch {
    return null;
  }
  for (const media of list.results ?? []) {
    const manifestUrl = media.data?.download_url;
    if (!manifestUrl) continue;
    let parts: RecallSeparatePart[] | RecallSeparatePart;
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) continue;
      parts = (await res.json()) as RecallSeparatePart[] | RecallSeparatePart;
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

async function resolveTranscript(
  recording: RecallRecording,
): Promise<{ transcript: TranscriptSegment[]; participants: Participant[]; durationS: number }> {
  const existingUrl = recording.media_shortcuts?.transcript?.data?.download_url;
  if (existingUrl) {
    const entries = await fetchJsonRetry<RecallTranscriptEntry[]>(existingUrl);
    if (entries.length > 0) return normalizeTranscript(entries);
  }
  const entries = await createAndAwaitAsyncTranscript(recording.id);
  return normalizeTranscript(entries);
}

async function createAndAwaitAsyncTranscript(recordingId: string): Promise<RecallTranscriptEntry[]> {
  const created = await recallPost<RecallTranscriptArtifact>(
    `/recording/${recordingId}/create_transcript/`,
    { provider: { recallai_async: { language_code: "en" } }, diarization: { use_separate_streams_when_available: true } },
  );
  const startedAt = Date.now();
  let transcriptId = created.id;
  while (Date.now() - startedAt < RECALL_TRANSCRIPT_TIMEOUT_MS) {
    const artifact = await recallGet<RecallTranscriptArtifact>(`/transcript/${transcriptId}/`);
    const code = artifact.status?.code;
    if (code === "done") {
      const url = artifact.data?.download_url;
      if (!url) throw new Error("Async transcript done but no download_url");
      return fetchJsonRetry<RecallTranscriptEntry[]>(url);
    }
    if (code === "failed" || code === "error") {
      throw new Error(`Async transcript failed: ${code} ${artifact.status?.sub_code ?? ""}`);
    }
    transcriptId = artifact.id ?? transcriptId;
    await new Promise((r) => setTimeout(r, RECALL_TRANSCRIPT_POLL_INTERVAL_MS));
  }
  throw new Error("Async transcript timed out");
}

async function fetchJsonRetry<T>(url: string, attempts = 4): Promise<T> {
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
  throw new Error(`Failed to fetch JSON: ${String(lastErr)}`);
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
    const endS = words[words.length - 1]?.end_timestamp?.relative ?? startS;
    const speaker = entry.participant?.name ?? `Speaker ${entry.participant?.id ?? "?"}`;
    const id = String(entry.participant?.id ?? speaker);

    transcript.push({ index: i, speaker, startS, endS, text: words.map((w) => w.text).join(" ") });

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
