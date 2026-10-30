import { neon } from "@neondatabase/serverless";
import { type JobRecord, JobRecordSchema } from "@repo/shared";

/**
 * Job store backed by Neon Postgres. Records are persisted as a JSONB blob
 * keyed by reportId, with the recallBotId and createdAt promoted to indexed
 * columns for the webhook lookup and the admin listing respectively.
 *
 * This replaces the previous local-JSON-file store, which does not survive on
 * a serverless host (ephemeral, per-invocation filesystem with no shared disk).
 */

let sqlClient: ReturnType<typeof neon> | null = null;
let bootstrapped: Promise<void> | null = null;

function sql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    sqlClient = neon(url);
  }
  return sqlClient;
}

/**
 * Create the table on first use. Cheap (IF NOT EXISTS) and memoized per
 * instance so we don't depend on a separate migration step for this demo.
 */
function ensureSchema(): Promise<void> {
  if (!bootstrapped) {
    const db = sql();
    bootstrapped = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS jobs (
          report_id     text PRIMARY KEY,
          recall_bot_id text,
          created_at    timestamptz NOT NULL DEFAULT now(),
          record        jsonb NOT NULL
        )
      `;
      await db`
        CREATE INDEX IF NOT EXISTS jobs_recall_bot_id_idx
          ON jobs (recall_bot_id)
      `;
    })().catch((err) => {
      // Reset so a transient failure doesn't permanently poison the instance.
      bootstrapped = null;
      throw err;
    });
  }
  return bootstrapped;
}

export async function saveJob(record: JobRecord): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO jobs (report_id, recall_bot_id, created_at, record)
    VALUES (
      ${record.reportId},
      ${record.recallBotId},
      ${record.createdAt},
      ${JSON.stringify(record)}
    )
    ON CONFLICT (report_id) DO UPDATE
      SET recall_bot_id = EXCLUDED.recall_bot_id,
          record = EXCLUDED.record
  `;
}

export async function loadJob(reportId: string): Promise<JobRecord | null> {
  await ensureSchema();
  const db = sql();
  const rows = (await db`
    SELECT record FROM jobs WHERE report_id = ${reportId} LIMIT 1
  `) as { record: unknown }[];
  const row = rows[0];
  if (!row) return null;
  const parsed = JobRecordSchema.safeParse(row.record);
  return parsed.success ? parsed.data : null;
}

/** Find a job by its Recall bot id (used by the webhook handler). */
export async function findJobByBotId(
  botId: string,
): Promise<JobRecord | null> {
  await ensureSchema();
  const db = sql();
  const rows = (await db`
    SELECT record FROM jobs WHERE recall_bot_id = ${botId}
    ORDER BY created_at DESC LIMIT 1
  `) as { record: unknown }[];
  const row = rows[0];
  if (!row) return null;
  const parsed = JobRecordSchema.safeParse(row.record);
  return parsed.success ? parsed.data : null;
}

/** Enumerate every stored job record, newest first. */
export async function listJobs(): Promise<JobRecord[]> {
  await ensureSchema();
  const db = sql();
  const rows = (await db`
    SELECT record FROM jobs ORDER BY created_at DESC
  `) as { record: unknown }[];
  const jobs: JobRecord[] = [];
  for (const row of rows) {
    const parsed = JobRecordSchema.safeParse(row.record);
    if (parsed.success) jobs.push(parsed.data);
  }
  return jobs;
}
