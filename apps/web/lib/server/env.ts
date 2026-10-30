import { z } from "zod";

const EnvSchema = z.object({
  RECALL_API_KEY: z.string().min(1).optional(),
  RECALL_REGION: z.string().min(1).default("us-east-1"),
  RECALL_WEBHOOK_SECRET: z.string().min(1).optional(),
  INTERHUMAN_API_KEY: z.string().min(1).optional(),
  STREAM_PROXY_URL: z.string().url().optional(),
  DEMO_STREAM_PROXY_TOKEN_SECRET: z.string().min(16).optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not configured").optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  BOT_NAME: z.string().optional(),
  BOT_IMAGE_URL: z.string().url().optional(),
  ADMIN_SECRET: z.string().min(1).optional(),
});

export type WebEnv = z.infer<typeof EnvSchema>;

let cached: WebEnv | null = null;

export function getEnv(): WebEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid web environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
