# Recall + Interhuman Meeting Insights Demo — Design

**Date:** 2026-06-01
**Status:** Approved design, ready for implementation planning

## Purpose

Make Interhuman's social-signal product tangible for prospective customers. A meeting
bot sits in on a real call, and after the call ends the demo produces a polished report
showing how a chosen speaker came across — where they were confident, hesitant,
disengaged, etc. — by fusing Interhuman's detected social signals with the meeting
transcript.

Building on top of Recall.ai provides the meeting-capture primitives and opens the door
to a possible collaboration.

## Decisions (locked)

- **Audience:** prospective customers. Goal: make abstract "social signals" concrete via
  a relatable use case.
- **Timing:** post-call report (not a live dashboard). Most reliable, most
  impressive-per-effort, deterministic to demo.
- **Speakers:** analyze a single focal speaker (not full per-speaker tracks).
- **Scenario framing:** scenario-agnostic — works for 1:1 and group meetings. UI must not
  hardcode "candidate"/"rep" language.
- **Stack:** Next.js + TypeScript on Vercel for the web app; a separate Node WebSocket
  proxy service (Cloud Run) for the Interhuman connection and analysis pipeline.
- **Architecture pattern:** post-call batch built on the proven Interhuman streaming
  primitives (server-side proxy, in-order window queue, timestamp/window-index
  reconciliation, shared zod contracts), as a **standalone repo** mirroring the existing
  demo's structure.
- **Transcript source:** Recall's diarized, timestamped transcript (no Whisper).
- **Scope:** happy-path only. No retries/concurrency hardening beyond what's needed.
- **Focal-speaker selection:** post-call picker from the real participant list, defaulted
  to most talk-time. Selecting a different speaker re-runs the pipeline.
- **Access control:** unguessable report link (`/report/<random-uuid>`). No login. Reports
  are never listed publicly.

## Architecture

Standalone repo, three parts (mirrors the reference Interhuman streaming demo):

```
apps/web/          Next.js on Vercel — UI, "start meeting" action, Recall webhook receiver, report pages
apps/stream-proxy/ Node WebSocket proxy (Cloud Run) — holds Interhuman WS, fans out segments, reconciles by timestamp
packages/shared/   constants, envelopes, signal types, window math (ported from demo-stream package), as zod schemas
```

### End-to-end flow (post-call batch)

```
1. User pastes meeting URL in web app → API creates Recall bot (recording + diarized transcript)
2. Bot joins, records. Call ends → Recall fires "recording.done" webhook → web app
3. Web app mints a short-lived HMAC token and kicks off a job to the proxy
4. Proxy:
     a. Fetch Recall transcript (diarized, timestamped) + download focal-speaker (composite) video
     b. ffmpeg-slice video into ~5s self-contained windows (DEMO_WINDOW_MS reused)
     c. Open upstream WS to wss://api.interhuman.ai/v1/stream/analyze (server-side key),
        send include: [conversation_quality_overall, conversation_quality_timeline]
     d. Stream windows in-order via a promise queue; collect signal.detected /
        engagement.updated / conversation_quality.updated events
     e. Reconcile each signal to a transcript segment via
        windowIndex = floor(signal.start / windowSeconds), then snap to the diarized line
5. Fused {signals + engagement + CQI + transcript + timestamps} → GPT 5.4 → narrative report
6. Report JSON persisted (SQLite/JSON, happy-path) → web app renders timeline + summary
```

**Fixture fallback:** step 4a swaps Recall for a local video + transcript file; 4b–6 run
identically. Provides a reliable, dependency-free path for live demos (`/demo`).

### Deltas from the reference streaming demo

- Source is Recall server-side composite video, not browser `MediaRecorder`. WebM
  init-segment handling is replaced by ffmpeg producing self-contained segments.
- No Whisper fan-out — transcript comes from Recall.
- Honesty note: Recall's standard recording is a composite/speaker-view video, not a clean
  isolated per-participant track. The demo feeds Interhuman the composite recording and
  **attributes** signals to the focal speaker via transcript timestamps. True
  per-participant video isolation is a future enhancement, out of scope.

## Stream proxy & data contracts

### Endpoints

```
GET  /healthz                 readiness (Cloud Run health check)
POST /v1/recall/analyze       start a job  { sessionId, token, recallBotId | fixtureId, focalParticipantId }
GET  /v1/recall/jobs/:id      job status + result (web app polls this)
```

Auth: short-lived HMAC token via `DEMO_STREAM_PROXY_TOKEN_SECRET` (≥16 chars, exact match
both sides). On the browser/upstream WebSocket, echo one accepted `Sec-WebSocket-Protocol`.

### Internal pipeline (per job)

1. Resolve source → Recall (transcript + composite video) or fixture (local files).
2. ffmpeg segment into self-contained ~5s windows (`DEMO_WINDOW_MS`), each independently decodable.
3. Open upstream Interhuman WS (`Authorization: Bearer`, `perMessageDeflate: false`), send `include` config.
4. In-order promise queue: `segmentQueue = segmentQueue.then(() => handleBinarySegment(...))`.
5. Collect events; reconcile each `signal.detected` to a transcript segment via
   `Math.floor(signal.start / windowSeconds)`, then snap to the overlapping diarized line.
6. Assemble the normalized job result.

### Contracts

Interhuman event (verbatim):

```json
{ "type": "signal.detected", "correlation_id": "uuid",
  "data": { "signal_type": "hesitation", "start": 2.1, "end": 4.3,
            "probability": "high", "rationale": "Brief pause mid-sentence..." } }
```

Normalized signal attached to a transcript segment:

```json
{ "type": "analysis.signal",
  "windowIndex": 3, "startS": 16.2, "endS": 18.4, "speaker": "Speaker 1",
  "signal": { "type": "confidence", "probability": "high",
              "rationale": "Steady cadence and assertive wording." } }
```

Final job result (consumed by GPT, rendered by the report):

```json
{ "sessionId": "uuid", "durationS": 1840,
  "transcript": [ { "index": 0, "speaker": "Speaker 1", "startS": 0, "endS": 5, "text": "..." } ],
  "signals": [ /* normalized analysis.signal entries with windowIndex + speaker */ ],
  "engagement": [ /* engagement.updated over time */ ],
  "conversationQuality": { "cqi": 72,
    "dimensions": { "clarity": 70, "authority": 68, "energy": 75, "rapport": 74, "learning": 73 } },
  "summary": { /* GPT output */ } }
```

`packages/shared` holds window constants, Interhuman envelope schemas, the 12 signal types +
3 probabilities, engagement states, and normalized `analysis.*` types — all as **zod schemas
with exported types**.

## Web app, Recall integration & focal-speaker selection

### Pages & routes

```
/                       Landing: paste meeting URL + "Send bot"
/api/recall/bot         POST  create Recall bot (recording + diarized transcript + realtime webhook)
/api/recall/webhook     POST  receive Recall events (recording.done, etc.), kick off proxy job
/api/sessions/:id       GET   poll job status (proxies to stream-proxy)
/report/:id             Report page (unguessable random id)
/demo                   Fixture mode: pick a canned recording, run the same pipeline
```

- **Bot creation:** `recording_config` with `recallai_streaming` transcript provider,
  `diarization.use_separate_streams_when_available: true`, and a `realtime_endpoints`
  webhook. Region-aware base URL (`RECALL_REGION`).
- **Webhook handling:** subscribe to `recording.done` / `recording.failed` /
  `transcript.done`. On `recording.done`, mint HMAC token and POST the job to the proxy.
  Verify Recall webhook signature with the workspace secret. Requires a stable public URL
  (static ngrok in dev).
- **Focal-speaker selection:** post-call picker from the real participant list, defaulted to
  most talk-time. Changing the speaker re-runs the pipeline for that participant.
- **Access:** `/report/<crypto-random-uuid>`. No login; URL is the secret. Reports never
  listed publicly.
- **Storage:** single SQLite file (or JSON) keyed by `sessionId` holding job status + result.
  No auth, single-tenant.

## GPT summary

Built with the Vercel AI SDK calling GPT 5.4, with **structured output validated by zod**.

**Input:** assembled job result — diarized transcript with timestamps (focal speaker
highlighted), normalized signals (type, probability, rationale, start/end, window index)
attributed to the focal speaker, engagement timeline, conversation quality (CQI + 5
dimensions).

**Output (zod schema → typed):**

```jsonc
{
  "headline": "One-sentence read on how the focal speaker came across",
  "cqi": 72,
  "keyMoments": [
    { "startS": 124.0, "endS": 131.5, "label": "Confident close",
      "signalType": "confidence", "quote": "...exact transcript line...",
      "insight": "Spoke decisively when describing pricing." }
  ],
  "dips": [ { "startS": 540, "endS": 552, "signalType": "hesitation",
             "quote": "...", "insight": "Hedged when asked about the timeline." } ],
  "strengths": ["..."],
  "watchOuts": ["..."],
  "narrative": "2-3 paragraph human-readable summary tying moments to the transcript"
}
```

**Grounding guardrails:** the model may only cite moments backed by a real signal and a real
transcript line; every `keyMoment`/`dip` must reference an actual `startS/endS` and quote.
Signals are the source of truth; the model explains and organizes what Interhuman detected
rather than re-judging the video. Each signal's `rationale` anchors the explanation.

## Report UI

Tailwind + Framer Motion. Layout, top to bottom:

1. **Header** — meeting title/date, focal-speaker selector (defaults to most talk-time;
   switching re-runs the pipeline), `headline` as the hero line.
2. **CQI gauge + dimension bars** — 0–100 CQI with its qualitative band (Weak → Excellent)
   and the 5 dimension scores as animated bars.
3. **Engagement timeline** — horizontal track across the meeting duration showing
   engaged/neutral/disengaged over time, with signal markers pinned at their timestamps;
   hover shows `rationale`.
4. **Key moments & dips** — two columns of cards (timestamp, color-coded signal badge,
   transcript quote, one-line insight). Clicking scrolls the transcript to that moment.
5. **Annotated transcript** — diarized transcript with signal badges inline on the focal
   speaker's lines (snapped via window index). Badges animate in.
6. **Narrative** — the 2–3 paragraph GPT summary.

**Motion:** dimension bars grow on mount, signal badges fade/scale in, timeline markers
stagger in. Honors `prefers-reduced-motion`. While a job runs, show a pipeline progress
state (bot joined → recording → analyzing → done) and poll `/api/sessions/:id`.

**States:** clean "analysis in progress" screen with pipeline steps; graceful error card on
job failure, with the fixture `/demo` always available as fallback.

## Environment variables

### Web app

| Variable | Required | Notes |
| --- | --- | --- |
| `RECALL_API_KEY` | Yes | Recall.ai API key |
| `RECALL_REGION` | Yes | Recall region host (e.g. us-east-1) |
| `RECALL_WEBHOOK_SECRET` | Yes | Workspace secret for webhook signature verification |
| `STREAM_PROXY_URL` | Yes | Base URL of the proxy service |
| `DEMO_STREAM_PROXY_TOKEN_SECRET` | Yes | Shared HMAC secret, ≥16 chars, matches proxy exactly |
| `OPENAI_API_KEY` | Yes | GPT 5.4 summary via Vercel AI SDK |
| `PUBLIC_BASE_URL` | Yes | Stable public URL for Recall webhooks (ngrok in dev) |

### Stream proxy

| Variable | Required | Notes |
| --- | --- | --- |
| `INTERHUMAN_API_KEY` | Yes | Server-only Interhuman API key |
| `DEMO_STREAM_PROXY_TOKEN_SECRET` | Yes | Must match web app exactly |
| `RECALL_API_KEY` | Yes | To fetch transcript + download recording |
| `OPENAI_API_KEY` | Yes | GPT 5.4 summary (if run in proxy) |
| `PORT` | No | Defaults to 8787 |
| `API_PLATFORM_BASE_URL` | No | Defaults to https://api.interhuman.ai |

Whitespace matters in secrets — a trailing space/newline on one side mints tokens that fail
verification.

## Deployment notes

- **Proxy on Cloud Run:** port 8787, min instances 1 (avoid cold starts during demos), CPU
  always allocated, session affinity on, timeout ≥300s, `/healthz` health check, public
  ingress + token validation.
- **Web app on Vercel:** changing env vars does not update existing deployments — redeploy
  (without build cache if behavior looks stale).
- **Proxy URL** must include scheme + path.

## Out of scope (YAGNI)

- True per-participant isolated video tracks (we attribute via timestamps on composite video).
- Live real-time dashboard during the call.
- Whisper transcription (Recall provides the transcript).
- Auth / accounts / report history list.
- Multi-meeting concurrency hardening, retries, robust error recovery.

## Future enhancements

- Per-participant video isolation for true multi-speaker analysis.
- Optional live view during the call.
- Accounts + saved report history.
