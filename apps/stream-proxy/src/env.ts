import { z } from "zod";

/** Treat blank env var strings as absent. */
const optionalStr = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v))
  .pipe(z.string().optional());

const EnvSchema = z.object({
  INTERHUMAN_API_KEY: optionalStr,
  DEMO_STREAM_PROXY_TOKEN_SECRET: z
    .string()
    .min(16, "DEMO_STREAM_PROXY_TOKEN_SECRET must be at least 16 chars"),
  RECALL_API_KEY: optionalStr,
  RECALL_REGION: z.string().min(1).default("us-east-1"),
  OPENAI_API_KEY: optionalStr,
  PORT: z.coerce.number().int().positive().default(8787),
  API_PLATFORM_BASE_URL: z.string().url().default("https://api.interhuman.ai"),
  WEB_APP_BASE_URL: optionalStr,
  // ---- Live-mode additions (used by the real-time RTMP bridge path) ----
  /** Public HTTPS URL reachable by Recall for webhooks and the Meet add-on proxy. */
  PUBLIC_BASE_URL: optionalStr,
  /**
   * Public RTMP base URL reachable by Recall, e.g. rtmp://0.tcp.eu.ngrok.io:12345
   * Defaults to rtmp://<PUBLIC_BASE_URL hostname>:<RTMP_PORT> which works when a
   * single tunnel (VPS / static IP) covers both HTTP and RTMP.
   * In local dev with separate ngrok HTTP + TCP tunnels, set this explicitly to
   * the ngrok TCP forwarding URL: rtmp://0.tcp.eu.ngrok.io:PORT
   */
  RTMP_PUBLIC_BASE: optionalStr,
  /** RTMP ingest port on localhost. Defaults to 1935. */
  RTMP_PORT: z.coerce.number().int().positive().default(1935),
  /** Display name for the Recall bot in the participant list. */
  BOT_NAME: z.string().default("Interhuman Signals"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid stream-proxy environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Interhuman WebSocket URL derived from the platform base URL. */
export function interhumanWsUrl(env: Env): string {
  const base = env.API_PLATFORM_BASE_URL.replace(/^http/, "ws");
  return `${base}/v1/stream/analyze`;
}
