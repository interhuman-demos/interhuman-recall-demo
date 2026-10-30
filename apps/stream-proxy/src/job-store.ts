import type {
  JobRecord,
  JobResult,
  JobStatus,
  PartialJobResult,
} from "@repo/shared";

/**
 * Minimal in-memory job store. The web app owns the canonical persistent store;
 * the proxy keeps job state in memory and exposes it via GET /v1/recall/jobs/:id.
 */
const jobs = new Map<string, JobRecord>();

/** Listeners notified whenever a job record changes (used by the SSE stream). */
const subscribers = new Map<string, Set<(job: JobRecord) => void>>();

function notify(job: JobRecord): void {
  subscribers.get(job.sessionId)?.forEach((cb) => cb(job));
}

/** Subscribe to all changes for a session. Returns an unsubscribe function. */
export function subscribeJob(
  sessionId: string,
  cb: (job: JobRecord) => void,
): () => void {
  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Set();
    subscribers.set(sessionId, set);
  }
  set.add(cb);
  return () => {
    subscribers.get(sessionId)?.delete(cb);
    if (subscribers.get(sessionId)?.size === 0) {
      subscribers.delete(sessionId);
    }
  };
}

export function createJob(
  sessionId: string,
  partial: Partial<JobRecord> = {},
): JobRecord {
  const now = new Date().toISOString();
  const record: JobRecord = {
    sessionId,
    reportId: partial.reportId ?? sessionId,
    status: "queued",
    meetingUrl: partial.meetingUrl ?? null,
    source: partial.source ?? "fixture",
    recallBotId: partial.recallBotId ?? null,
    fixtureId: partial.fixtureId ?? null,
    focalParticipantId: partial.focalParticipantId ?? null,
    createdAt: now,
    updatedAt: now,
    error: null,
    result: null,
  };
  jobs.set(sessionId, record);
  return record;
}

export function getJob(sessionId: string): JobRecord | undefined {
  return jobs.get(sessionId);
}

export function setStatus(sessionId: string, status: JobStatus): void {
  const job = jobs.get(sessionId);
  if (!job) return;
  job.status = status;
  job.updatedAt = new Date().toISOString();
  notify(job);
}

/**
 * Publish the resolved participant list + transcript and pause the job for the
 * user to choose a focal speaker. No Interhuman/GPT work runs until the choice
 * comes back (via a fresh job with `focalParticipantId` set).
 */
export function setAwaitingFocal(
  sessionId: string,
  partial: PartialJobResult,
): void {
  const job = jobs.get(sessionId);
  if (!job) return;
  job.result = { ...(job.result ?? {}), ...partial };
  job.status = "awaiting_focal";
  job.updatedAt = new Date().toISOString();
  notify(job);
}

export function setResult(sessionId: string, result: JobResult): void {
  const job = jobs.get(sessionId);
  if (!job) return;
  job.result = result;
  job.status = "done";
  job.updatedAt = new Date().toISOString();
  notify(job);
}

/**
 * Shallow-merge a partial result into the job without flipping it to "done".
 * Used to publish analysis fields right after reconciliation and to push the
 * streaming GPT summary as it fills in, so the report renders progressively.
 */
export function mergeResult(
  sessionId: string,
  partial: PartialJobResult,
): void {
  const job = jobs.get(sessionId);
  if (!job) return;
  job.result = { ...(job.result ?? {}), ...partial };
  job.updatedAt = new Date().toISOString();
  notify(job);
}

export function setError(sessionId: string, error: string): void {
  const job = jobs.get(sessionId);
  if (!job) return;
  job.error = error;
  job.status = "failed";
  job.updatedAt = new Date().toISOString();
  notify(job);
}
