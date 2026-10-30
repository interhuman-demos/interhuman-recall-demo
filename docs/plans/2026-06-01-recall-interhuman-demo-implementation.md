# Recall + Interhuman Meeting Insights Demo — Implementation Plan

**Date:** 2026-06-01
**Design reference:** `docs/plans/2026-06-01-recall-interhuman-demo-design.md`
**Status:** Ready to execute

This plan breaks the approved design into ordered, independently-verifiable phases. Each
phase lists its goal, the work, and a concrete "done when" check. Build in order — later
phases depend on the contracts and scaffolding established earlier.

## Conventions

- Monorepo via **pnpm workspaces** + **Turborepo**. Three packages: `apps/web`,
`apps/stream-proxy`, `packages/shared`.
- TypeScript everywhere, `strict: true`.
- All cross-boundary data validated with **zod**; types are inferred from schemas
(`z.infer`) and exported from `packages/shared`.
- Frontend components: **Tailwind** for styling, **Framer Motion** for animation.
- Secrets only ever live server-side (proxy holds Interhuman key; web app holds Recall +
OpenAI keys). Never ship a key to the browser.

---

## Phase 0 — Monorepo scaffolding

**Goal:** A buildable, empty monorepo with the three workspaces wired together.

**Work:**

- `package.json` at root with pnpm workspaces (`apps/`*, `packages/`*) and Turborepo
(`turbo.json` with `build`, `dev`, `lint`, `typecheck` pipelines).
- `packages/shared`: TS package, `tsconfig`, exports barrel `src/index.ts`. Add `zod`.
- `apps/web`: `create-next-app` (App Router, TS, Tailwind). Add `@repo/shared` dep.
- `apps/stream-proxy`: bare Node TS service (`tsx` for dev, `tsup`/`esbuild` for build).
Add `ws`, `zod`, `@repo/shared`.
- Root `.gitignore`, `.env.example` files per app, `.nvmrc`, `README.md` (run instructions).
- Shared `tsconfig.base.json`.

**Done when:** `pnpm install && pnpm build` succeeds; `pnpm dev` starts both apps;
`apps/web` serves a placeholder page; `apps/stream-proxy` logs "listening on :8787".

---

## Phase 1 — Shared contracts (`packages/shared`)

**Goal:** The single source of truth for every event, signal, and result shape.

**Work (all as zod schemas with inferred + exported types):**

- `constants.ts`: `DEMO_WINDOW_MS = 5000`, `DEMO_MIN_SEGMENT_DURATION_S = 3`,
`DEMO_MIN_SEGMENT_BYTES`, `DEMO_MAX_SEGMENT_BYTES = 32 * 1024 * 1024`, window-seconds helper.
- `signals.ts`: 12 signal types enum (`agreement`, `confidence`, `confusion`,
`disagreement`, `disengagement`, `engagement`, `frustration`, `hesitation`, `interest`,
`skepticism`, `stress`, `uncertainty`), 3 probabilities (`high|medium|low`), engagement
states (`engaged|disengaged|neutral`).
- `envelopes.ts`: Interhuman server envelope schemas — `signal.detected`,
`engagement.updated`, `conversation_quality.updated`, `error` (verbatim shapes).
- `windows.ts`: `windowIndexForStart(startS): number = Math.floor(startS / windowSeconds)`.
- `analysis.ts`: normalized `AnalysisSignal`, transcript segment, engagement point,
`ConversationQuality` (cqi + 5 dimensions), and the final `JobResult` schema.
- `summary.ts`: GPT output schema (`headline`, `cqi`, `keyMoments[]`, `dips[]`,
`strengths[]`, `watchOuts[]`, `narrative`) — `overallTone` intentionally omitted.
- `jobs.ts`: job status enum (`queued|fetching|segmenting|analyzing|summarizing|done|failed`)
and `JobRecord` schema.

**Done when:** `packages/shared` builds; a throwaway test parses a sample Interhuman
`signal.detected` payload and a sample `JobResult` without error.

---

## Phase 2 — Stream proxy: skeleton + auth + Interhuman client

**Goal:** A deployable proxy that can authenticate a job request and talk to Interhuman.

**Work:**

- `env.ts`: validate `INTERHUMAN_API_KEY`, `DEMO_STREAM_PROXY_TOKEN_SECRET` (≥16 chars),
`RECALL_API_KEY`, `OPENAI_API_KEY`, `PORT` (default 8787), `API_PLATFORM_BASE_URL`
(default `https://api.interhuman.ai`). Fail fast with clear errors.
- `token.ts`: HMAC verify of the short-lived token minted by the web app (payload+signature,
expiry check). Mirror the web app's mint logic exactly (shared algorithm).
- HTTP server (`/healthz`, `POST /v1/recall/analyze`, `GET /v1/recall/jobs/:id`). If
WebSocket upgrade is offered, configure `handleProtocols` to echo one accepted subprotocol.
- `interhuman-client.ts`: open upstream WS to `${API_PLATFORM_BASE_URL}/v1/stream/analyze`
with `Authorization: Bearer`, `perMessageDeflate: false`; send `include`
config; parse envelopes via shared schemas; expose async event iterator + `sendSegment(bytes)`.
- In-memory job store (Map) keyed by `sessionId`.

**Done when:** `/healthz` returns 200; posting a job with a valid token is accepted (202) and
an invalid/expired token is rejected (401); a manual smoke test opens an Interhuman WS and
logs `session.ready` (or a clear auth error).

---

## Phase 3 — Stream proxy: segmentation + analysis pipeline

**Goal:** Turn a video + transcript into a complete `JobResult`.

**Work:**

- `segmenter.ts`: ffmpeg wrapper that slices an input video into self-contained ~5s
segments (each independently decodable; keyframe-aligned). Enforce min duration / max
bytes from shared constants. Use `fluent-ffmpeg` or spawn `ffmpeg` directly;
`ffmpeg-static` for a bundled binary in the container.
- `window-processor.ts`: in-order promise queue
(`queue = queue.then(() => sendSegment(bytes))`); collect all
`signal.detected` / `engagement.updated` / `conversation_quality.updated` events with
their cumulative timestamps.
- `reconcile.ts`: map each signal to a window via `windowIndexForStart`, then snap to the
overlapping diarized transcript line for the focal speaker; build `AnalysisSignal[]`.
- `pipeline.ts`: orchestrate resolve-source → segment → stream → reconcile → assemble
`JobResult` (minus summary). Update job status at each stage.

**Done when:** Given a local sample mp4 + transcript JSON, the pipeline produces a valid
`JobResult` with non-empty `signals` reconciled onto transcript lines, plus engagement +
CQI. Verified against the shared zod schema.

---

## Phase 4 — Recall integration (web app side) + source resolution

**Goal:** Send a bot, receive the recording, hand the proxy a real source.

**Work (in `apps/web`):**

- `lib/server/recall.ts`: region-aware client. `createBot(meetingUrl)` →
`recording_config` with `recallai_streaming` transcript provider,
`diarization.use_separate_streams_when_available: true`, and `realtime_endpoints` webhook
pointing at `${PUBLIC_BASE_URL}/api/recall/webhook`. `getTranscript(botId)`,
`getRecordingDownloadUrl(botId)`, `listParticipants(botId)`.
- `app/api/recall/bot/route.ts`: `POST { meetingUrl }` → create bot, persist a `JobRecord`
(status `queued`), return `{ sessionId, reportUrl }` with a crypto-random report id.
- `app/api/recall/webhook/route.ts`: verify Recall signature (`RECALL_WEBHOOK_SECRET`);
on `recording.done`, mint the proxy token and `POST /v1/recall/analyze` to the proxy with
`recallBotId` + chosen `focalParticipantId` (default: most talk-time, resolved from
participants/transcript). Handle `recording.failed` → mark job failed.
- Proxy `source-recall.ts`: given `recallBotId`, fetch transcript + download recording to a
temp file; normalize transcript into shared transcript-segment shape.

**Done when:** With a live meeting URL + ngrok, sending a bot, joining, talking, and leaving
results in a `recording.done` webhook that kicks off a proxy job which completes to `done`.
(Human-owned setup: Recall dashboard webhook + ngrok URL configured.)

---

## Phase 5 — GPT summary

**Goal:** Produce the grounded narrative report from a `JobResult`.

**Work:**

- `summarize.ts` (proxy or web app — colocate with whoever finalizes the job; plan assumes
proxy): Vercel AI SDK `generateObject` with GPT 5.4 and the `summary.ts` zod schema.
- Prompt: pass transcript + reconciled signals (incl. each `rationale`) + engagement + CQI.
Hard constraints: only cite moments backed by a real signal AND a real transcript line;
every `keyMoment`/`dip` must include a real `startS/endS` and an exact `quote`; do not
invent emotions — explain/organize what Interhuman detected.
- Post-validate: drop any `keyMoment`/`dip` whose `quote` isn't found in the transcript or
whose timestamps don't overlap a real signal (defensive grounding).
- Attach `summary` to the `JobResult`; mark job `done`.

**Done when:** Running the Phase 3 sample through summarization yields a schema-valid summary
where every cited moment maps to a real signal + transcript line.

---

## Phase 6 — Fixture mode

**Goal:** A bulletproof, dependency-free demo path.

**Work:**

- Add 1–2 canned recordings + diarized transcript JSON under `apps/stream-proxy/fixtures/`
(real video+audio, meaningful content per Interhuman input requirements).
- Proxy `source-fixture.ts`: resolve `fixtureId` → local video + transcript, feed the same
pipeline (Phases 3 + 5).
- Web `app/demo/page.tsx`: list fixtures, "Run analysis" → posts a fixture job, redirects to
the report page.

**Done when:** `/demo` runs end-to-end with no Recall/network dependency and renders a full
report.

---

## Phase 7 — Report UI

**Goal:** The polished payoff screen.

**Work (in `apps/web`, Tailwind + Framer Motion):**

- `app/report/[id]/page.tsx`: fetch `JobRecord`; if not `done`, show pipeline progress state
(bot joined → recording → analyzing → done) and poll `GET /api/sessions/:id`.
- `app/api/sessions/[id]/route.ts`: proxy job status/result from the stream-proxy (or read
local store).
- Components:
  - `report-header.tsx` — title/date, hero `headline`, focal-speaker selector (default most
  talk-time; switching calls a re-run endpoint).
  - `cqi-gauge.tsx` — 0–100 gauge + qualitative band; `dimension-bars.tsx` — 5 animated bars.
  - `engagement-timeline.tsx` — horizontal track with engaged/neutral/disengaged + signal
  markers at timestamps; hover shows `rationale`.
  - `moment-cards.tsx` — key moments & dips as color-coded cards; click scrolls transcript.
  - `annotated-transcript.tsx` — diarized transcript, inline signal badges on focal lines
  (snapped by window index), badges animate in.
  - `narrative.tsx` — the GPT paragraphs.
- Motion: bars grow on mount, badges fade/scale in, markers stagger. Respect
`prefers-reduced-motion`.
- States: in-progress, graceful error card (link to `/demo`).
- Re-run endpoint `app/api/sessions/[id]/refocus/route.ts`: `POST { focalParticipantId }`
→ new proxy job for that speaker.

**Done when:** A completed job renders all six sections; switching focal speaker re-runs and
re-renders; reduced-motion respected; error state reachable and links to `/demo`.

---

## Phase 8 — Persistence, polish & deploy docs

**Goal:** Make it shareable and demo-ready.

**Work:**

- Persistence: swap the in-memory store for **SQLite** (e.g. `better-sqlite3`) keyed by
`sessionId`, storing `JobRecord` + result JSON. (Web app owns the canonical store; proxy
pushes status/result back, or web app polls — pick one and document it.)
- Crypto-random report ids (`crypto.randomUUID()` or `nanoid`); never list reports publicly.
- Landing page polish (`app/page.tsx`): paste URL, validation, "Send bot", link to `/demo`.
- `Dockerfile` for `apps/stream-proxy` (Node + `ffmpeg-static`), Cloud Run settings doc
(port 8787, min instances 1, CPU always allocated, session affinity, timeout ≥300s,
`/healthz`, public ingress + token validation).
- `apps/web` Vercel deploy notes (env vars + redeploy gotcha).
- Fill `.env.example` for both apps; expand `README.md` with full local + deploy runbook.

**Done when:** Fresh clone → follow README → `/demo` works locally; documented steps deploy
proxy to Cloud Run and web to Vercel; a live meeting produces a shareable `/report/<id>` link.

---

## Risk register

- **Composite vs. per-speaker video:** demo attributes signals via timestamps on the
composite recording. Acceptable for the demo; documented as a known limitation.
- **ffmpeg in serverless:** the proxy must run on a container host (Cloud Run), not Vercel
functions. Reflected in the architecture.
- **Recall recording availability timing:** download URL may lag `recording.done` slightly;
pipeline should retry the fetch a few times before failing.
- **Interhuman input quality:** segments need real audio + video; fixtures must be
meaningful (no black/silent clips).
- **Secret whitespace:** `DEMO_STREAM_PROXY_TOKEN_SECRET` must match exactly on both sides.

## Suggested build order

Phase 0 → 1 → 2 → 3 → 5 (validate full pipeline on a local sample) → 6 (fixture) →
7 (UI against fixture) → 4 (live Recall) → 8 (persist + deploy). Doing fixture + UI before
live Recall lets you build and demo the whole experience without depending on a live meeting.