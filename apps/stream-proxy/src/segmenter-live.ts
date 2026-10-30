import { spawn, type ChildProcess } from "node:child_process";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN: string = (ffmpegStatic as unknown as string | null) ?? "ffmpeg";
const SEGMENT_SECONDS = 5;

export interface LiveSegmentEvent {
  index: number;
  bytes: Buffer;
}

export interface LiveSegmenter {
  stop(): Promise<void>;
}

/**
 * Streaming counterpart to segmenter.ts's `segmentVideo`.
 *
 * Differences from the post-call version:
 * - Input is a live RTMP URL, not a finished file.
 * - ffmpeg runs continuously until stop() is called (no EOF).
 * - Segments are detected via fs.watch on the ffmpeg segment-list file rather
 *   than listing the directory at the end — this gives us each segment as soon
 *   as ffmpeg finalises it (~5s after it starts).
 * - Each segment is read and emitted via onSegment immediately, so Inter-1
 *   receives frames in near real-time.
 *
 * Segment decodability: `-reset_timestamps 1` + `-force_key_frames` ensure each
 * WebM starts at t=0 on a keyframe, making it independently decodable — the
 * same requirement as the post-call segmenter.
 */
export async function startLiveSegmenter(
  rtmpUrl: string,
  onSegment: (seg: LiveSegmentEvent) => void,
  onError: (err: Error) => void,
): Promise<LiveSegmenter> {
  const workDir = join(tmpdir(), `ih-live-${Date.now()}`);
  await mkdir(workDir, { recursive: true });

  const pattern = join(workDir, "seg_%05d.webm");
  let segmentIndex = 0;
  let stopped = false;
  const knownSegments = new Set<string>();

  const ffmpegArgs = [
    "-loglevel", "error",
    // NOTE: the -reconnect* flags are HTTP-only and unsupported by this ffmpeg
    // build for RTMP ("Option reconnect not found"). The publisher-not-ready
    // race is instead handled by the spawn-retry loop below.
    "-i", rtmpUrl,
    // VP9 + Opus (same container/codec pair as the post-call segmenter).
    // These flags make libvpx-vp9 encode in REAL TIME. Without them libvpx
    // defaults to `-deadline good`, which on a 2-vCPU VM pegs both cores at
    // 200% and falls behind real-time, delaying every segment (and therefore
    // every live signal) by tens of seconds.
    "-c:v", "libvpx-vp9",
    "-deadline", "realtime",
    // 0 (slowest/best) … 8 (fastest). 8 = lowest CPU, essential on shared cores.
    "-cpu-used", "8",
    // Row-based multithreading spreads a single frame across both vCPUs.
    "-row-mt", "1",
    "-threads", "2",
    "-crf", "35",
    "-b:v", "0",
    "-c:a", "libopus",
    "-b:a", "64k",
    // segment muxer: each output file is a self-contained WebM.
    "-f", "segment",
    "-segment_time", String(SEGMENT_SECONDS),
    "-reset_timestamps", "1",
    // Force a keyframe at every segment boundary so each WebM is independently
    // decodable by Inter-1 without prior context (mirrors post-call segmenter).
    "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    pattern,
  ];

  const MAX_INITIAL_RETRIES = 5;
  const RETRY_DELAY_MS = 1500;
  let proc!: ChildProcess;
  let producedAnySegment = false;

  function spawnFfmpeg(attempt: number): void {
    proc = spawn(FFMPEG_BIN, ffmpegArgs);

    let stderrBuf = "";
    proc.stderr?.on("data", (d: Buffer) => {
      stderrBuf += d.toString();
      if (stderrBuf.includes("\n")) {
        const line = stderrBuf.trim();
        if (line) console.error(`[ffmpeg-live] ${line}`);
        stderrBuf = "";
      }
    });

    proc.on("close", (code) => {
      if (stopped) return;
      // If ffmpeg exits before any segment was produced, the publisher likely
      // wasn't ready yet (race between postPublish and stream availability).
      // Retry the connection a few times before giving up.
      if (!producedAnySegment && attempt < MAX_INITIAL_RETRIES) {
        console.error(
          `[segmenter-live] ffmpeg exited (code ${code}) before any segment; ` +
            `retry ${attempt + 1}/${MAX_INITIAL_RETRIES} in ${RETRY_DELAY_MS}ms: ${stderrBuf.trim()}`,
        );
        setTimeout(() => { if (!stopped) spawnFfmpeg(attempt + 1); }, RETRY_DELAY_MS);
        return;
      }
      onError(new Error(`ffmpeg exited unexpectedly (code ${code}): ${stderrBuf.trim()}`));
    });
  }

  spawnFfmpeg(0);

  // Detect finalized segments by polling the work directory. We deliberately
  // avoid fs.watch here: on macOS it reports filenames inconsistently and often
  // misses the segment-list updates, which silently starved the pipeline.
  //
  // ffmpeg keeps the newest segment file open while writing it, so a segment is
  // only safe to read once a later one exists. We therefore emit every *.webm
  // except the highest-numbered one, and flush that last file on stop().
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
      producedAnySegment = true;
      try {
        const bytes = await readFile(join(workDir, name));
        if (bytes.length > 0) {
          console.log(`[segmenter-live] segment ${name} (${bytes.length} bytes) → Inter-1`);
          onSegment({ index: segmentIndex++, bytes });
        }
      } catch (err) {
        console.error(`[segmenter-live] failed to read ${name}:`, err);
      }
    }
  }

  const pollTimer = setInterval(() => { void flushSegments(false); }, 1000);

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(pollTimer);
      proc.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 3000);
        proc.on("close", () => { clearTimeout(t); resolve(); });
      });
      // Flush the final (previously open) segment now that ffmpeg has exited.
      await flushSegments(true);
      await rm(workDir, { recursive: true, force: true });
    },
  };
}
