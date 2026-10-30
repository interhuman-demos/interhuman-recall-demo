import { NextResponse } from "next/server";
import { z } from "zod";
import { type KillResponse, KillResponseSchema } from "@/lib/admin-schemas";
import { fetchBotStatus, isActiveBotStatus, removeBot } from "@/lib/server/recall";

const ParamsSchema = z.object({ botId: z.string().min(1) });

/** Force a Recall bot to leave its call, then report its resulting status. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ botId: string }> },
): Promise<NextResponse> {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid bot id" }, { status: 400 });
  }
  const { botId } = parsed.data;

  try {
    await removeBot(botId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to remove bot" },
      { status: 502 },
    );
  }

  const liveStatus = await fetchBotStatus(botId);
  const payload: KillResponse = {
    ok: true,
    botId,
    liveStatus,
    active: isActiveBotStatus(liveStatus),
  };
  return NextResponse.json(KillResponseSchema.parse(payload));
}
