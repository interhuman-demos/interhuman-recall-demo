import { getEnv } from "./env";

function recallBase(): string {
  const env = getEnv();
  return `https://${env.RECALL_REGION}.recall.ai/api/v1`;
}

/**
 * Fetch a JPEG image URL and return it as base64 (no data-URI prefix), suitable
 * for Recall's automatic_video_output. Returns null on any failure so bot
 * creation never breaks over a missing/broken image.
 */
async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return null;
    return buf.toString("base64");
  } catch {
    return null;
  }
}

/** Create a meeting bot with recording + diarized streaming transcript. */
export async function createBot(meetingUrl: string): Promise<{ id: string }> {
  const env = getEnv();
  if (!env.RECALL_API_KEY) throw new Error("RECALL_API_KEY is not configured");

  // Recall outputs a still image as the bot's camera via base64 JPEG, not a URL.
  const imageB64 = env.BOT_IMAGE_URL
    ? await fetchImageBase64(env.BOT_IMAGE_URL)
    : null;
  const videoOutput = imageB64
    ? { kind: "jpeg" as const, b64_data: imageB64 }
    : null;

  const res = await fetch(`${recallBase()}/bot/`, {
    method: "POST",
    headers: {
      Authorization: env.RECALL_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      meeting_url: meetingUrl,
      // Display name shown in the participant list.
      bot_name: env.BOT_NAME ?? "Interhuman Insights",
      // Still image for the bot's camera tile in both recording states.
      ...(videoOutput
        ? {
            automatic_video_output: {
              in_call_recording: videoOutput,
              in_call_not_recording: videoOutput,
            },
          }
        : {}),
      // Per-participant separate video+audio is CPU-intensive; Recall requires
      // the 4-core variant (and gallery_view_v2 layout) to produce it reliably.
      variant: {
        zoom: "web_4_core",
        google_meet: "web_4_core",
        microsoft_teams: "web_4_core",
      },
      recording_config: {
        // gallery_view_v2 is required for per-participant separate recordings.
        video_mixed_layout: "gallery_view_v2",
        // Isolated single-subject video (no audio) per participant — this is
        // what we feed Interhuman so signals attribute to one real person.
        video_separate_mp4: {},
        // Separate video is silent; grab per-participant audio to mux back in.
        audio_separate_mp3: {},
        transcript: {
          provider: {
            recallai_streaming: { mode: "prioritize_low_latency", language_code: "en" },
          },
          diarization: { use_separate_streams_when_available: true },
        },
        realtime_endpoints: [
          {
            type: "webhook",
            url: `${env.PUBLIC_BASE_URL}/api/recall/webhook`,
            events: ["transcript.data"],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Recall createBot failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id: string };
}

/** Ask Recall to remove the bot from its current call. Idempotent-ish. */
export async function removeBot(botId: string): Promise<void> {
  const env = getEnv();
  if (!env.RECALL_API_KEY) throw new Error("RECALL_API_KEY is not configured");
  const res = await fetch(`${recallBase()}/bot/${botId}/leave_call/`, {
    method: "POST",
    headers: {
      Authorization: env.RECALL_API_KEY,
      Accept: "application/json",
    },
  });
  // 200/202 = removing; 4xx often means it already left. Only throw on 5xx.
  if (res.status >= 500) {
    throw new Error(`Recall leave_call failed: ${res.status} ${await res.text()}`);
  }
}

interface RecallBotStatus {
  status_changes?: { code?: string }[];
}

/**
 * Recall bot status codes that mean the bot is still in a meeting and therefore
 * still accruing billable time. Anything else (done, call_ended, fatal) is
 * terminal/idle.
 */
const ACTIVE_BOT_STATUSES = new Set([
  "joining_call",
  "in_waiting_room",
  "in_call_not_recording",
  "in_call_recording",
]);

/** True if the status code represents a bot still active in a call. */
export function isActiveBotStatus(code: string | null): boolean {
  return code != null && ACTIVE_BOT_STATUSES.has(code);
}

/** Fetch the latest known status code for a bot, or null. */
export async function fetchBotStatus(botId: string): Promise<string | null> {
  const env = getEnv();
  if (!env.RECALL_API_KEY) return null;
  try {
    const res = await fetch(`${recallBase()}/bot/${botId}/`, {
      headers: { Authorization: env.RECALL_API_KEY, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const bot = (await res.json()) as RecallBotStatus;
    const changes = bot.status_changes ?? [];
    return changes[changes.length - 1]?.code ?? null;
  } catch {
    return null;
  }
}
