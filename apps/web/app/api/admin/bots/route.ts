import { NextResponse } from "next/server";
import {
  type BotRow,
  type BotsResponse,
  BotsResponseSchema,
} from "@/lib/admin-schemas";
import { fetchBotStatus, isActiveBotStatus } from "@/lib/server/recall";
import { listJobs } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * Ops view: every stored job that has a Recall bot, enriched with the bot's
 * live status so orphaned, still-recording bots are easy to spot and kill.
 */
export async function GET(): Promise<NextResponse<BotsResponse>> {
  const jobs = await listJobs();
  const withBots = jobs.filter((j) => j.recallBotId);

  const bots = await Promise.all(
    withBots.map(async (j): Promise<BotRow> => {
      const liveStatus = await fetchBotStatus(j.recallBotId as string);
      return {
        reportId: j.reportId,
        botId: j.recallBotId as string,
        meetingUrl: j.meetingUrl ?? null,
        source: j.source,
        jobStatus: j.status,
        createdAt: j.createdAt,
        liveStatus,
        active: isActiveBotStatus(liveStatus),
      };
    }),
  );

  const payload: BotsResponse = {
    bots,
    activeCount: bots.filter((b) => b.active).length,
  };
  return NextResponse.json(BotsResponseSchema.parse(payload));
}
