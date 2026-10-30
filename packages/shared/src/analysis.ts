import { z } from "zod";
import {
  CqiDimensionSchema,
  EngagementStateSchema,
  ProbabilitySchema,
  SignalTypeSchema,
} from "./signals.js";

/** A diarized transcript line from Recall (or a fixture). */
export const TranscriptSegmentSchema = z.object({
  index: z.number().int(),
  speaker: z.string(),
  startS: z.number(),
  endS: z.number(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

/** A detected signal normalized and reconciled onto a transcript window. */
export const AnalysisSignalSchema = z.object({
  windowIndex: z.number().int(),
  startS: z.number(),
  endS: z.number().nullable(),
  speaker: z.string(),
  type: SignalTypeSchema,
  probability: ProbabilitySchema.nullable(),
  rationale: z.string().nullable(),
  /** Index into the transcript array this signal was snapped to, if any. */
  transcriptIndex: z.number().int().nullable(),
});
export type AnalysisSignal = z.infer<typeof AnalysisSignalSchema>;

/** An engagement state observation over a time range. */
export const EngagementPointSchema = z.object({
  state: EngagementStateSchema,
  startS: z.number(),
  endS: z.number().nullable(),
});
export type EngagementPoint = z.infer<typeof EngagementPointSchema>;

export const ConversationQualitySchema = z.object({
  cqi: z.number(),
  dimensions: z.record(CqiDimensionSchema, z.number()),
});
export type ConversationQuality = z.infer<typeof ConversationQualitySchema>;

/** Qualitative band for a CQI score. */
export function cqiBand(
  cqi: number,
): "Weak" | "Below average" | "Moderate" | "Good" | "Excellent" {
  if (cqi < 30) return "Weak";
  if (cqi < 50) return "Below average";
  if (cqi < 65) return "Moderate";
  if (cqi < 80) return "Good";
  return "Excellent";
}

export const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  talkTimeS: z.number(),
});
export type Participant = z.infer<typeof ParticipantSchema>;
