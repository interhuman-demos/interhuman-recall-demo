import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  type Participant,
  ParticipantSchema,
  type TranscriptSegment,
  TranscriptSegmentSchema,
} from "@repo/shared";
import type { ResolvedSource } from "./source.js";

const FIXTURES_DIR = join(process.cwd(), "fixtures");

const FixtureManifestSchema = z.object({
  id: z.string(),
  title: z.string(),
  video: z.string(),
  durationS: z.number(),
  participants: z.array(ParticipantSchema),
  transcript: z.array(TranscriptSegmentSchema),
});
export type FixtureManifest = z.infer<typeof FixtureManifestSchema>;

export async function loadFixtureManifest(
  fixtureId: string,
): Promise<FixtureManifest> {
  const safeId = fixtureId.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = join(FIXTURES_DIR, `${safeId}.json`);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Fixture manifest not found at ${path}. Add a "${safeId}.json" manifest (and its referenced video) to ${FIXTURES_DIR}.`,
      );
    }
    throw err;
  }
  return FixtureManifestSchema.parse(raw);
}

export async function resolveFixtureSource(
  fixtureId: string,
): Promise<ResolvedSource> {
  const manifest = await loadFixtureManifest(fixtureId);
  const videoPath = join(FIXTURES_DIR, manifest.video);
  try {
    await access(videoPath);
  } catch {
    throw new Error(
      `Fixture video not found at ${videoPath}. Drop the "${manifest.video}" file referenced by the "${manifest.id}" manifest into ${FIXTURES_DIR}.`,
    );
  }
  const transcript: TranscriptSegment[] = manifest.transcript;
  const participants: Participant[] = manifest.participants;
  return {
    videoPath,
    transcript,
    participants,
    durationS: manifest.durationS,
    cleanup: async () => {},
  };
}
