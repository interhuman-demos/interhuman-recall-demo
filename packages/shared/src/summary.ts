import { z } from "zod";
import { SignalTypeSchema } from "./signals.js";

/**
 * GPT-generated narrative report. Every cited moment must be grounded in a real
 * signal and a real transcript line (enforced post-generation by the proxy).
 * `overallTone` is intentionally omitted per the design.
 */

const MomentSchema = z.object({
  startS: z.number(),
  endS: z.number(),
  label: z.string(),
  signalType: SignalTypeSchema,
  quote: z.string(),
  insight: z.string(),
});
export type SummaryMoment = z.infer<typeof MomentSchema>;

export const SummarySchema = z.object({
  headline: z.string(),
  cqi: z.number(),
  /**
   * A short recap of the whole conversation (everyone), used as framing context.
   * This is NOT signal analysis — it grounds the personal read in what was
   * actually discussed, the way a meeting-notes tool would summarize the call.
   */
  conversationContext: z.string(),
  keyMoments: z.array(MomentSchema),
  dips: z.array(MomentSchema),
  strengths: z.array(z.string()),
  watchOuts: z.array(z.string()),
  /**
   * Forward-looking, second-person coaching for the focal user: concrete things
   * to try next time, grounded in this call's signals + dynamics.
   */
  coaching: z.array(z.string()),
  narrative: z.string(),
});
export type Summary = z.infer<typeof SummarySchema>;

/**
 * A summary that is still streaming in from the model. Every field is optional
 * and arrays may contain partially-built items, mirroring the `DeepPartial`
 * shape emitted by `streamObject`. The report UI renders whatever is present.
 */
const PartialMomentSchema = MomentSchema.partial();

export const PartialSummarySchema = z.object({
  headline: z.string().optional(),
  cqi: z.number().optional(),
  conversationContext: z.string().optional(),
  keyMoments: z.array(PartialMomentSchema).optional(),
  dips: z.array(PartialMomentSchema).optional(),
  strengths: z.array(z.string()).optional(),
  watchOuts: z.array(z.string()).optional(),
  coaching: z.array(z.string()).optional(),
  narrative: z.string().optional(),
});
export type PartialSummary = z.infer<typeof PartialSummarySchema>;
