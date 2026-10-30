import { z } from "zod";
import {
  AnalysisSignalSchema,
  ConversationQualitySchema,
  EngagementPointSchema,
  ParticipantSchema,
  TranscriptSegmentSchema,
} from "./analysis.js";
import { PartialSummarySchema, SummarySchema } from "./summary.js";

/** Lifecycle of an analysis job. */
export const JobStatusSchema = z.enum([
  "queued",
  "fetching",
  // Source resolved and participants known; waiting for the user to pick which
  // speaker to analyze before the (expensive) Interhuman + GPT work runs.
  "awaiting_focal",
  "segmenting",
  "analyzing",
  "summarizing",
  "done",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** The fully assembled analysis result. */
export const JobResultSchema = z.object({
  sessionId: z.string(),
  durationS: z.number(),
  focalSpeaker: z.string(),
  participants: z.array(ParticipantSchema),
  transcript: z.array(TranscriptSegmentSchema),
  signals: z.array(AnalysisSignalSchema),
  engagement: z.array(EngagementPointSchema),
  conversationQuality: ConversationQualitySchema,
  summary: SummarySchema,
});
export type JobResult = z.infer<typeof JobResultSchema>;

/**
 * A result that is still being assembled by the pipeline. After reconciliation
 * the analysis fields (transcript/signals/engagement/quality) are present while
 * `summary` streams in from the model field-by-field. The report UI renders
 * whatever is available at each poll, so the page fills in progressively
 * instead of appearing all at once when the job finishes.
 */
export const PartialJobResultSchema = z.object({
  sessionId: z.string(),
  durationS: z.number().optional(),
  focalSpeaker: z.string().optional(),
  participants: z.array(ParticipantSchema).optional(),
  transcript: z.array(TranscriptSegmentSchema).optional(),
  signals: z.array(AnalysisSignalSchema).optional(),
  engagement: z.array(EngagementPointSchema).optional(),
  conversationQuality: ConversationQualitySchema.optional(),
  summary: PartialSummarySchema.optional(),
});
export type PartialJobResult = z.infer<typeof PartialJobResultSchema>;

/** Persisted record for a job, returned to the report UI while it polls. */
export const JobRecordSchema = z.object({
  sessionId: z.string(),
  reportId: z.string(),
  status: JobStatusSchema,
  meetingUrl: z.string().nullable(),
  source: z.enum(["recall", "fixture"]),
  recallBotId: z.string().nullable(),
  fixtureId: z.string().nullable(),
  focalParticipantId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  result: PartialJobResultSchema.nullable(),
  // Completed results cached per focal participant id. Lets the user switch
  // back to a previously-analyzed speaker instantly, without re-running the
  // (expensive) Interhuman + GPT pipeline. Only fully `done` results land here.
  resultsByParticipant: z.record(z.string(), JobResultSchema).optional(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

/** Body the web app posts to the proxy to start a job. */
export const AnalyzeRequestSchema = z.object({
  sessionId: z.string(),
  recallBotId: z.string().optional(),
  fixtureId: z.string().optional(),
  focalParticipantId: z.string().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
