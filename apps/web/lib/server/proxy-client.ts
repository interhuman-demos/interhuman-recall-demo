import { type AnalyzeRequest, type JobRecord, JobRecordSchema } from "@repo/shared";
import { getEnv } from "./env";
import { mintProxyToken } from "./token";

/** Kick off an analysis job on the stream-proxy. */
export async function startProxyJob(req: AnalyzeRequest): Promise<void> {
  const env = getEnv();
  const secret = env.DEMO_STREAM_PROXY_TOKEN_SECRET;
  if (!secret) throw new Error("DEMO_STREAM_PROXY_TOKEN_SECRET not configured");
  const token = mintProxyToken(req.sessionId, secret);
  const url = `${env.STREAM_PROXY_URL}/v1/recall/analyze`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, token }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`proxy fetch to ${url} threw: ${detail}`);
  }
  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `proxy analyze ${url} -> ${res.status}: ${text.slice(0, 200)}`,
    );
  }
}

/** Fetch current job state from the proxy. */
export async function fetchProxyJob(
  sessionId: string,
): Promise<JobRecord | null> {
  const env = getEnv();
  const res = await fetch(
    `${env.STREAM_PROXY_URL}/v1/recall/jobs/${encodeURIComponent(sessionId)}`,
  );
  if (!res.ok) return null;
  const raw = (await res.json()) as unknown;
  const parsed = JobRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
