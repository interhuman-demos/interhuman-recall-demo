# Interhuman × Recall — Meeting Insights Demo

A demo that makes Interhuman's social-signal analysis tangible. A meeting bot
(via [Recall.ai](https://recall.ai)) sits in on a call, and after the call ends
the app produces a polished post-call **report** showing how a chosen speaker
came across — where they were confident, hesitant, disengaged, and so on — by
fusing Interhuman's detected social signals with the diarized transcript.

> This is a demo, not a production or open-source project. It targets the
> happy path and is meant for showing the concept to prospective customers.

## How it works

```
1. User pastes a meeting URL → web app creates a Recall bot (records + diarized transcript)
2. Bot joins and records. Call ends → Recall fires a webhook to the web app
3. Web app mints a short-lived HMAC token and kicks off a job on the stream-proxy
4. stream-proxy:
     - fetches the Recall transcript + focal-speaker video
     - slices the video into ~5s windows with ffmpeg
     - streams windows in order to Interhuman's WS analyze endpoint
     - reconciles signals back to the transcript by timestamp
5. Web app renders the report at /report/<random-uuid> (unguessable link, no login)
```

You can also explore the experience without any external services via the
built-in **demo path** (`/demo`), which uses a bundled synthetic sample.

## Repo layout

This is a pnpm + Turborepo monorepo:

```
apps/web/          Next.js app — UI, "start meeting" action, Recall webhook, report pages, admin dashboard
apps/stream-proxy/ Node WebSocket proxy — holds the Interhuman connection and runs the analysis pipeline
packages/shared/   Shared zod contracts, signal types, and window math
docs/              Design + implementation notes and the design system
scripts/           Throwaway/dev probes (gitignored)
```

## Prerequisites

- **Node** ≥ 20
- **pnpm** 10 (`corepack enable` will provide the pinned version)
- API keys for **Recall.ai**, **Interhuman**, and **OpenAI**

## Setup

```bash
pnpm install

# Configure environment for each app
cp apps/web/.env.example apps/web/.env.local
cp apps/stream-proxy/.env.example apps/stream-proxy/.env.local
# then fill in the values (see below)
```

### Environment variables

**`apps/web/.env.local`**

| Variable | Description |
| --- | --- |
| `RECALL_API_KEY` | Recall.ai API key |
| `RECALL_REGION` | Recall region (e.g. `us-east-1`) |
| `RECALL_WEBHOOK_SECRET` | Secret used to verify Recall webhooks |
| `STREAM_PROXY_URL` | URL of the stream-proxy (default `http://localhost:8787`) |
| `DEMO_STREAM_PROXY_TOKEN_SECRET` | Shared HMAC secret between web and proxy (≥16 chars) |
| `OPENAI_API_KEY` | OpenAI API key |
| `PUBLIC_BASE_URL` | Public base URL of the web app |
| `ADMIN_SECRET` | Secret to access the `/admin` dashboard (blank disables admin) |

**`apps/stream-proxy/.env.local`**

| Variable | Description |
| --- | --- |
| `INTERHUMAN_API_KEY` | Interhuman API key |
| `DEMO_STREAM_PROXY_TOKEN_SECRET` | Must match the web app's value |
| `RECALL_API_KEY` | Recall.ai API key |
| `RECALL_REGION` | Recall region (e.g. `us-east-1`) |
| `OPENAI_API_KEY` | OpenAI API key |
| `PORT` | Proxy port (default `8787`) |
| `API_PLATFORM_BASE_URL` | Interhuman API base (`https://api.interhuman.ai`) |
| `WEB_APP_BASE_URL` | Web app base URL |
| `SAVE_FOCAL_CLIP` | Dev only: local dir to save the focal-subject clip for inspection |

> `.env.local` files are gitignored and never committed.

## Running

```bash
# Run everything (web + stream-proxy) via Turborepo
pnpm dev
```

This starts:

- **web** on http://localhost:3000
- **stream-proxy** on http://localhost:8787

To try the dependency-free path, open http://localhost:3000/demo.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run all apps in watch mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint across the workspace |
| `pnpm typecheck` | Type-check across the workspace |

## Tech stack

- **Web:** Next.js 15, React 19, Tailwind CSS 4, Base UI, Motion, zod
- **Proxy:** Node, `ws`, fluent-ffmpeg, Vercel AI SDK (OpenAI), zod
- **Tooling:** pnpm workspaces, Turborepo, TypeScript

## Notes

- Reports are reachable only via an unguessable `/report/<uuid>` link; there is no
  public listing and no login.
- Local session/report state for development is stored under `apps/web/.data/`
  (gitignored).
