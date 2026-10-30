import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { DEMO_MIN_SEGMENT_DURATION_S, DEMO_WINDOW_SECONDS } from "@repo/shared";

const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";

export interface VideoSegment {
  index: number;
  startS: number;
  bytes: Buffer;
}

/**
 * Slice an input video into self-contained, independently-decodable segments of
 * ~windowSeconds each. Uses ffmpeg segment muxer with keyframe-forced cuts so
 * every segment can be analyzed and transcribed on its own.
 *
 * When `totalDurationS` is known we compute explicit cut points and collapse a
 * too-short trailing segment into the previous window, so we never emit a tail
 * below Interhuman's minimum segment duration (which the API rejects, ih5006).
 */
export async function segmentVideo(
  inputPath: string,
  windowSeconds: number = DEMO_WINDOW_SECONDS,
  totalDurationS?: number,
): Promise<VideoSegment[]> {
  const workDir = await mkdtemp(join(tmpdir(), "ih-seg-"));
  try {
    const pattern = join(workDir, "seg_%05d.webm");
    const cutTimes = computeCutTimes(totalDurationS, windowSeconds);

    const segmentArgs =
      cutTimes.length > 0
        ? ["-segment_times", cutTimes.join(",")]
        : ["-segment_time", String(windowSeconds)];
    // Force a keyframe at each cut point so every segment is independently
    // decodable. With an unknown duration, fall back to evenly spaced cuts.
    const keyframeArgs =
      cutTimes.length > 0
        ? ["-force_key_frames", cutTimes.join(",")]
        : ["-force_key_frames", `expr:gte(t,n_forced*${windowSeconds})`];

    await runFfmpeg([
      "-i",
      inputPath,
      "-c:v",
      "libvpx-vp9",
      "-c:a",
      "libopus",
      "-f",
      "segment",
      ...segmentArgs,
      "-reset_timestamps",
      "1",
      ...keyframeArgs,
      pattern,
    ]);

    const files = (await readdir(workDir))
      .filter((f) => f.startsWith("seg_") && f.endsWith(".webm"))
      .sort();

    const segments: VideoSegment[] = [];
    for (let i = 0; i < files.length; i++) {
      const name = files[i]!;
      const bytes = await readFile(join(workDir, name));
      segments.push({
        index: i,
        startS: cutTimes.length > 0 ? (cutTimes[i - 1] ?? 0) : i * windowSeconds,
        bytes,
      });
    }
    return segments;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Boundary timestamps (exclusive of 0 and the end) at which to cut the video.
 * A final window shorter than the minimum is merged into the previous one by
 * omitting its leading boundary, so the last segment is always >= the minimum.
 * Returns [] when the duration is unknown (caller falls back to fixed windows).
 */
function computeCutTimes(
  totalDurationS: number | undefined,
  windowSeconds: number,
): number[] {
  if (!totalDurationS || !Number.isFinite(totalDurationS)) return [];
  // A video that fits in a single window needs no cuts at all.
  if (totalDurationS <= windowSeconds) return [];

  const cuts: number[] = [];
  for (let t = windowSeconds; t < totalDurationS; t += windowSeconds) {
    cuts.push(Number(t.toFixed(3)));
  }
  // Drop the last boundary if it would leave a too-short trailing segment,
  // merging that tail into the previous window.
  while (
    cuts.length > 0 &&
    totalDurationS - cuts[cuts.length - 1]! < DEMO_MIN_SEGMENT_DURATION_S
  ) {
    cuts.pop();
  }
  return cuts;
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
