#!/usr/bin/env node
/**
 * Local RTMP smoke test for the real-time bridge — NO Recall, NO tunnel.
 *
 * Validates the novel part of the live pipeline end-to-end on localhost:
 *   sample clip → ffmpeg RTMP push → bridge RTMP ingest → live segmenter
 *   → Inter-1 → signal events → WS to "side panel" (this script).
 *
 * Prereqs:
 *   - stream-proxy running:  pnpm dev --filter @repo/stream-proxy
 *   - INTERHUMAN_API_KEY set in apps/stream-proxy/.env.local
 *   - ffmpeg on PATH (you have /opt/homebrew/bin/ffmpeg)
 *
 * Run:
 *   node apps/stream-proxy/local-smoke-test.mjs [path-to-clip.mp4]
 *
 * Default clip: ../../.focal-clips/isolated-100.mp4
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROXY = process.env.PROXY_URL ?? "http://localhost:8787";
const RTMP_PORT = process.env.RTMP_PORT ?? "1935";

const clipArg = process.argv[2];
const clip = clipArg
  ? resolve(clipArg)
  : resolve(__dirname, "../../.focal-clips/isolated-100.mp4");

function log(msg) { console.log(`\x1b[36m[smoke]\x1b[0m ${msg}`); }
function ok(msg) { console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`); }
function bad(msg) { console.error(`\x1b[31m  ✗ ${msg}\x1b[0m`); }

function clipHasAudio(path) {
  return new Promise((resolve) => {
    const probe = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      path,
    ]);
    let out = "";
    probe.stdout.on("data", (d) => { out += d.toString(); });
    probe.on("close", () => resolve(out.includes("audio")));
    probe.on("error", () => resolve(false));
  });
}

async function main() {
  log(`Proxy: ${PROXY}`);
  log(`Clip:  ${clip}`);

  // 1. Health
  let health;
  try {
    health = await fetch(`${PROXY}/healthz`).then((r) => r.json());
  } catch (err) {
    bad(`stream-proxy not reachable at ${PROXY} — start it first: pnpm dev --filter @repo/stream-proxy`);
    process.exit(1);
  }
  ok(`stream-proxy healthy (${JSON.stringify(health)})`);

  // 2. Create a LOCAL session (no Recall)
  const session = await fetch(`${PROXY}/sessions/local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Smoke Test" }),
  }).then((r) => r.json());

  if (!session.sessionId) {
    bad(`Failed to create local session: ${JSON.stringify(session)}`);
    process.exit(1);
  }
  ok(`Local session created: ${session.sessionId}`);
  log(`RTMP target: ${session.rtmpUrl}`);

  // 3. Connect a WS client (acts as the side panel)
  const wsUrl = `${PROXY.replace(/^http/, "ws")}/sessions/${session.sessionId}/events`;
  const ws = new WebSocket(wsUrl);

  let signalCount = 0;
  let transcriptCount = 0;
  let gotSummary = false;
  let firstSignalAt = null;
  const startedAt = Date.now();

  ws.on("open", () => ok(`WS connected: ${wsUrl}`));
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.type) {
      case "signal":
        signalCount++;
        if (!firstSignalAt) {
          firstSignalAt = ((Date.now() - startedAt) / 1000).toFixed(1);
          ok(`FIRST SIGNAL after ${firstSignalAt}s → ${msg.data.signal_type} (${msg.data.probability ?? "?"})`);
        }
        log(`signal #${signalCount}: ${msg.data.signal_type}`);
        break;
      case "engagement":
        log(`engagement: ${msg.data.state}`);
        break;
      case "conversation_quality":
        log(`CQI update: ${msg.data.overall?.quality_index ?? "?"}`);
        break;
      case "transcript":
        transcriptCount++;
        log(`transcript: "${msg.text.slice(0, 60)}..."`);
        break;
      case "summary":
        gotSummary = true;
        ok(`SUMMARY received: "${msg.summary?.headline ?? "(no headline)"}"`);
        break;
      case "error":
        bad(`bridge error: ${msg.message}`);
        break;
    }
  });
  ws.on("error", (err) => bad(`WS error: ${err.message}`));

  // Give the WS a moment to connect before streaming.
  await new Promise((r) => setTimeout(r, 1000));

  // 4. Stream the clip into RTMP with ffmpeg (re-encode to FLV/H264+AAC, the
  //    RTMP wire format — Recall would do this; we mimic it locally).
  //    Many focal clips are video-only, so we synthesize a silent audio track
  //    (RTMP/FLV + Inter-1 both expect audio). The silent source is mapped only
  //    if the clip has no audio of its own.
  const hasAudio = await clipHasAudio(clip);
  log(`Clip has audio: ${hasAudio ? "yes" : "no (synthesizing silence)"}`);
  log(`Streaming clip into RTMP (real-time)...`);

  const args = ["-re", "-i", clip];
  if (!hasAudio) {
    // Add an anullsrc silent audio input and stop when the video ends.
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    args.push("-shortest");
    args.push("-map", "0:v:0", "-map", "1:a:0");
  }
  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", "44100",
    "-f", "flv",
    session.rtmpUrl,
  );
  const ff = spawn("ffmpeg", args);

  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d.toString(); });
  ff.on("close", (code) => {
    if (code === 0) {
      ok("ffmpeg finished streaming the clip");
    } else {
      bad(`ffmpeg exited ${code}`);
      console.error(ffErr.split("\n").slice(-15).join("\n"));
    }
    // Wait a bit for trailing signals, then end the session to trigger summary.
    setTimeout(async () => {
      log("Ending session to trigger summary...");
      await fetch(`${PROXY}/sessions/${session.sessionId}`, { method: "DELETE" }).catch(() => {});
      setTimeout(() => report(), 20_000); // allow summary LLM call
    }, 5_000);
  });

  function report() {
    console.log("\n========== RESULT ==========");
    console.log(`Signals received:    ${signalCount}`);
    console.log(`Transcript lines:    ${transcriptCount} (expected 0 in local mode — no Recall webhook)`);
    console.log(`First signal at:     ${firstSignalAt ? firstSignalAt + "s" : "NEVER"}`);
    console.log(`Summary received:    ${gotSummary ? "yes" : "no"}`);
    console.log("============================\n");
    if (signalCount > 0) {
      ok("PIPELINE WORKS: segmenter → Inter-1 → side-panel WS is functional.");
      process.exit(0);
    } else {
      bad("No signals received. Check: INTERHUMAN_API_KEY set? ffmpeg errors above? clip has audio+video?");
      process.exit(1);
    }
  }
}

main().catch((err) => { bad(String(err)); process.exit(1); });
