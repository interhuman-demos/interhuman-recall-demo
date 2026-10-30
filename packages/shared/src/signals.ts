import { z } from "zod";

/** The 12 social signals detected by the Interhuman API. */
export const SignalTypeSchema = z.enum([
  "agreement",
  "confidence",
  "confusion",
  "disagreement",
  "disengagement",
  "engagement",
  "frustration",
  "hesitation",
  "interest",
  "skepticism",
  "stress",
  "uncertainty",
]);
export type SignalType = z.infer<typeof SignalTypeSchema>;

/** Likelihood rating attached to each detected signal. */
export const ProbabilitySchema = z.enum(["high", "medium", "low"]);
export type Probability = z.infer<typeof ProbabilitySchema>;

/** Engagement state for a given moment. */
export const EngagementStateSchema = z.enum([
  "engaged",
  "disengaged",
  "neutral",
]);
export type EngagementState = z.infer<typeof EngagementStateSchema>;

/** CQI dimensions used for conversation quality. */
export const CqiDimensionSchema = z.enum([
  "clarity",
  "authority",
  "energy",
  "rapport",
  "learning",
]);
export type CqiDimension = z.infer<typeof CqiDimensionSchema>;

export const ALL_SIGNAL_TYPES = SignalTypeSchema.options;
export const ALL_CQI_DIMENSIONS = CqiDimensionSchema.options;
