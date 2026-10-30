# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

# Copy workspace manifests first — maximises layer cache reuse
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Only the packages the proxy needs
COPY packages/shared/ packages/shared/
COPY apps/stream-proxy/ apps/stream-proxy/

# Full install so:
#   • ffmpeg-static postinstall downloads the correct Linux binary
#   • @repo/shared resolves as a workspace dep
#   • all devDeps are present for the tsup build step
RUN pnpm install --frozen-lockfile

# tsup bundles src/index.ts (including @repo/shared source) → dist/index.js
RUN pnpm --filter @repo/stream-proxy build

# Produce a self-contained deployable folder with a FLAT node_modules
# (pnpm's symlinked store layout does not survive a plain COPY, which is why
# runtime imports like `ws` failed). `pnpm deploy` resolves all prod deps of
# the app into /app/deploy/node_modules as real files.
RUN pnpm --filter @repo/stream-proxy deploy --prod --legacy /deploy

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Self-contained node_modules (flat, includes ws, node-media-server,
# ffmpeg-static binary, etc.) plus the built bundle.
COPY --from=build /deploy/node_modules                ./node_modules
COPY --from=build /app/apps/stream-proxy/dist         ./dist
COPY --from=build /app/apps/stream-proxy/package.json ./package.json

# HTTP / WebSocket port
EXPOSE 8787
# RTMP raw TCP port (node-media-server)
EXPOSE 1935

CMD ["node", "dist/index.js"]
