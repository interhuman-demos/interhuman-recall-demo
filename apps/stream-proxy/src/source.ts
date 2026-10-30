import type { Participant, TranscriptSegment } from "@repo/shared";

/** A resolved analysis source: a local video file plus its diarized transcript. */
export interface ResolvedSource {
  videoPath: string;
  transcript: TranscriptSegment[];
  participants: Participant[];
  durationS: number;
  /**
   * True when `videoPath` is a single isolated participant (per-participant
   * Recall track muxed with their own audio). False when it's the mixed
   * composite of everyone (e.g. fixtures, or the picker phase). Drives whether
   * Interhuman signals can be honestly attributed to the focal speaker.
   */
  isolatedSubject?: boolean;
  /** Cleanup callback (e.g. delete a downloaded temp file). */
  cleanup: () => Promise<void>;
}

/** Pick the focal speaker: explicit choice, else most talk-time. */
export function resolveFocalSpeaker(
  participants: Participant[],
  requestedId?: string,
): Participant | null {
  if (participants.length === 0) return null;
  if (requestedId) {
    const found = participants.find((p) => p.id === requestedId);
    if (found) return found;
  }
  return [...participants].sort((a, b) => b.talkTimeS - a.talkTimeS)[0]!;
}
