import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN: string = (ffmpegStatic as unknown as string | null) ?? "ffmpeg";
const SEGMENT_SECONDS = 5;
// Output constant framerate. Recall per-participant H264 is variable-framerate
// (10-30fps, platform-controlled). Resampling to a fixed CFR removes the drift
// that otherwise desyncs video against the self-clocking audio.
const OUTPUT_FPS = 15;

export interface ParticipantSegmentEvent {
  index: number;
  bytes: Buffer;
}

export interface ParticipantSegmenter {
  /** Push a raw H264 Annex-B buffer from the focal participant. */
  pushVideo(buf: Buffer): void;
  /** Push a raw 16 kHz mono S16LE PCM buffer from the focal participant. */
  pushAudio(buf: Buffer): void;
  /** Finalize all segments and clean up. */
  stop(): Promise<void>;
}

/**
 * Per-participant WebM segmenter.
 *
 * Reads raw H264 video and S16LE PCM audio from two writable pipes, encodes
 * to VP9+Opus WebM, and emits independent 5s segments via the polling
 * flushSegments pattern.
 *
 * A/V sync: raw H264 over a pipe carries no timing, so ffmpeg would otherwise
 * guess a fixed framerate and drift against the self-clocking audio. We stamp
 * BOTH inputs with `-use_wallclock_as_timestamps 1` so each packet's PTS is its
 * real arrival time — both streams share the same clock (the bridge receiving
 * them live), keeping them aligned. The output is forced to constant framerate
 * (`-fps_mode cfr -r`) so the variable input rate can't reintroduce drift.
 */
export async function startParticipantSegmenter(
  onSegment: (seg: ParticipantSegmentEvent) => void,
  onError: (err: Error) => void,
): Promise<ParticipantSegmenter> {
  const workDir = join(tmpdir(), `ih-part-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const pattern = join(workDir, "seg_%05d.webm");
  let segmentIndex = 0;
  let stopped = false;
  const knownSegments = new Set<string>();

  const proc = spawn(
    FFMPEG_BIN,
    [
      "-loglevel", "error",

      // Video input: raw H264 from pipe fd 3. Stamp each packet with its
      // arrival wall-clock time so it shares a timeline with the audio.
      "-use_wallclock_as_timestamps", "1",
      "-f", "h264",
      "-i", "pipe:3",

      // Audio input: raw PCM from pipe fd 4. Also wall-clock stamped so both
      // inputs derive from the same clock source (this process's receive time).
      "-use_wallclock_as_timestamps", "1",
      "-f", "s16le",
      "-ar", "16000",
      "-ac", "1",
      "-i", "pipe:4",

      // Video encode: VP9 real-time. Force constant output framerate to remove
      // variable-framerate drift.
      "-c:v", "libvpx-vp9",
      "-deadline", "realtime",
      "-cpu-used", "8",
      "-row-mt", "1",
      "-threads", "2",
      "-crf", "35",
      "-b:v", "0",
      "-fps_mode", "cfr",
      "-r", String(OUTPUT_FPS),

      // Audio encode: Opus. Resample/pad to keep A/V aligned across gaps.
      "-c:a", "libopus",
      "-b:a", "64k",
      "-af", "aresample=async=1",

      "-map", "0:v:0",
      "-map", "1:a:0",

      // WebM segment muxer.
      "-f", "segment",
      "-segment_time", String(SEGMENT_SECONDS),
      "-reset_timestamps", "1",
      "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
      pattern,
    ],
    {
      // stdio: [stdin, stdout, stderr, videoPipe, audioPipe]
      stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
    },
  );

  let stderrBuf = "";
  proc.stderr?.on("data", (d: Buffer) => {
    stderrBuf += d.toString();
    if (stderrBuf.includes("\n")) {
      const line = stderrBuf.trim();
      if (line) console.error(`[ffmpeg-part] ${line}`);
      stderrBuf = "";
    }
  });

  proc.on("close", (code) => {
    if (stopped) return;
    onError(new Error(`[ffmpeg-part] exited unexpectedly (code ${code}): ${stderrBuf.trim()}`));
  });

  const videoPipe = proc.stdio[3] as NodeJS.WritableStream | null;
  const audioPipe = proc.stdio[4] as NodeJS.WritableStream | null;

  // Swallow EPIPE / ERR_STREAM_WRITE_AFTER_END errors that fire when Recall
  // keeps pushing frames over the media WebSocket after session.end() has
  // already closed the pipes. The try/catch in pushVideo/pushAudio handles
  // synchronous throws, but Node.js streams emit 'error' asynchronously on
  // pipe closure — without a listener the process crashes with an unhandled
  // 'error' event.
  videoPipe?.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_WRITE_AFTER_END") {
      console.error("[segmenter-part] video pipe error:", err.message);
    }
  });
  audioPipe?.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE" && err.code !== "ERR_STREAM_WRITE_AFTER_END") {
      console.error("[segmenter-part] audio pipe error:", err.message);
    }
  });

  async function flushSegments(includeLast: boolean): Promise<void> {
    if (stopped && !includeLast) return;
    let files: string[];
    try {
      files = (await readdir(workDir)).filter((f) => f.endsWith(".webm")).sort();
    } catch {
      return;
    }
    const ready = includeLast ? files : files.slice(0, -1);
    for (const name of ready) {
      if (knownSegments.has(name)) continue;
      knownSegments.add(name);
      try {
        const bytes = await readFile(join(workDir, name));
        if (bytes.length === 0) continue;
        console.log(`[segmenter-part] segment ${name} (${bytes.length} bytes) → Inter-1`);
        onSegment({ index: segmentIndex++, bytes });
      } catch (err) {
        console.error(`[segmenter-part] failed to read ${name}:`, err);
      }
    }
  }

  const pollTimer = setInterval(() => { void flushSegments(false); }, 1000);

  return {
    pushVideo(buf: Buffer): void {
      if (stopped || !videoPipe) return;
      try {
        videoPipe.write(buf);
      } catch {
        // Pipe may already be closed during teardown.
      }
    },

    pushAudio(buf: Buffer): void {
      if (stopped || !audioPipe) return;
      try {
        audioPipe.write(buf);
      } catch {
        // Pipe may already be closed during teardown.
      }
    },

    async stop(): Promise<void> {
      stopped = true;
      clearInterval(pollTimer);

      try { videoPipe?.end(); } catch { /* ignore */ }
      try { audioPipe?.end(); } catch { /* ignore */ }

      await new Promise<void>((resolve) => {
        const t = setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 5000);
        proc.on("close", () => { clearTimeout(t); resolve(); });
      });

      await flushSegments(true);
      await rm(workDir, { recursive: true, force: true });
    },
  };
}
