import type { Env } from "./env.js";

/**
 * Recall bot creation for the per-participant bridge path.
 *
 * Primary path: per-participant H264 video + separate raw audio are streamed
 * over a WebSocket to /sessions/:id/media. The bridge fuzzy-matches the focal
 * speaker's name, keeps only their frames, and muxes them into WebM segments
 * for Interhuman — so only the user's face is ever analyzed.
 *
 * Fallback path: the mixed FLV/RTMP stream is kept alive as a fallback.
 * If no matched per-participant frame arrives within ~8s of RTMP starting, the
 * bridge switches to consuming the mixed stream instead.
 *
 * gallery_view_v2 is required to enable video_separate_h264 and
 * audio_separate_raw. The web_4_core variant is required for H264 per-participant.
 */

function recallBase(env: Env): string {
  return `https://${env.RECALL_REGION}.recall.ai/api/v1`;
}

export interface CreateBotOptions {
  meetingUrl: string;
  rtmpUrl: string;
  webhookUrl: string;
  mediaWsUrl: string;
  /** Session ID used to build the spotlight page URL served by this bridge. */
  sessionId: string;
}

export async function createBot(env: Env, opts: CreateBotOptions): Promise<{ id: string }> {
  if (!env.RECALL_API_KEY) throw new Error("RECALL_API_KEY is not configured");

  // Serve the spotlight page directly from this bridge at
  // GET /sessions/:id/spotlight — the bot loads it as its camera tile. Uses
  // PUBLIC_BASE_URL (the bridge's own public tunnel), so no separate web app
  // deployment is needed.
  const spotlightBase = env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  const spotlightPageUrl = spotlightBase
    ? `${spotlightBase}/sessions/${opts.sessionId}/spotlight`
    : null;

  const res = await fetch(`${recallBase(env)}/bot/`, {
    method: "POST",
    headers: {
      Authorization: env.RECALL_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      meeting_url: opts.meetingUrl,
      bot_name: env.BOT_NAME,
      // web_4_core is required for video_separate_h264.
      variant: {
        zoom: "web_4_core",
        google_meet: "web_4_core",
        microsoft_teams: "web_4_core",
      },
      // Render a branded spotlight page as the bot's camera tile so all
      // participants see who is being analyzed. Mutually exclusive with
      // automatic_video_output; only included when PUBLIC_BASE_URL is set.
      ...(spotlightPageUrl
        ? {
            output_media: {
              camera: {
                kind: "webpage",
                config: { url: spotlightPageUrl },
              },
            },
          }
        : {}),
      recording_config: {
        // gallery_view_v2 is required to enable video_separate_h264 and
        // audio_separate_raw. The bridge selects only the focal speaker's
        // stream from the per-participant feed, so Interhuman sees only their
        // face regardless of who is speaking.
        video_mixed_layout: "gallery_view_v2",
        // Required to enable mixed-video RTMP streaming (fallback path).
        video_mixed_flv: {},
        // Per-participant H264 video (~10-30fps, platform-controlled resolution).
        video_separate_h264: {},
        // Per-participant raw PCM audio (16 kHz mono S16LE).
        audio_separate_raw: {},
        transcript: {
          provider: {
            recallai_streaming: {
              mode: "prioritize_low_latency",
              language_code: "en",
            },
          },
          diarization: { use_separate_streams_when_available: true },
        },
        realtime_endpoints: [
          // Per-participant H264 + audio → bridge WebSocket receiver → muxer.
          // The bridge keeps only the focal speaker's frames.
          {
            type: "websocket",
            url: opts.mediaWsUrl,
            events: ["video_separate_h264.data", "audio_separate_raw.data"],
          },
          // Mixed FLV → bridge RTMP ingest (fallback when focal stream not found).
          {
            type: "rtmp",
            url: opts.rtmpUrl,
            events: ["video_mixed_flv.data"],
          },
          // Live transcript → bridge webhook → side panel.
          {
            type: "webhook",
            url: opts.webhookUrl,
            events: ["transcript.data"],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Recall createBot failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string }>;
}

export async function removeBot(env: Env, botId: string): Promise<void> {
  if (!env.RECALL_API_KEY) return;
  const res = await fetch(`${recallBase(env)}/bot/${botId}/leave_call/`, {
    method: "POST",
    headers: { Authorization: env.RECALL_API_KEY, Accept: "application/json" },
  });
  if (res.status >= 500) {
    throw new Error(`Recall leave_call failed: ${res.status} ${await res.text()}`);
  }
}
