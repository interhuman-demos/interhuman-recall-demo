import { z } from "zod";

export const BotRowSchema = z.object({
  reportId: z.string(),
  botId: z.string(),
  meetingUrl: z.string().nullable(),
  source: z.string(),
  jobStatus: z.string(),
  createdAt: z.string(),
  liveStatus: z.string().nullable(),
  active: z.boolean(),
});
export type BotRow = z.infer<typeof BotRowSchema>;

export const BotsResponseSchema = z.object({
  bots: z.array(BotRowSchema),
  activeCount: z.number(),
});
export type BotsResponse = z.infer<typeof BotsResponseSchema>;

export const KillResponseSchema = z.object({
  ok: z.boolean(),
  botId: z.string(),
  liveStatus: z.string().nullable(),
  active: z.boolean(),
});
export type KillResponse = z.infer<typeof KillResponseSchema>;
