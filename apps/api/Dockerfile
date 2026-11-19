# HamPath API (Fastify) and the database bootstrap. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t hampath-api .
# The API runs its TypeScript through tsx, as in development: no separate build step to drift.
# The same image runs the one-shot `migrate` service (migrate, seed, import the bank, load content).
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/content/package.json packages/content/
COPY packages/ham-sim/package.json packages/ham-sim/
RUN pnpm install --frozen-lockfile --prod --filter "@hampath/api..." --filter "@hampath/db..."

FROM base AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/db packages/db
COPY packages/content packages/content
COPY packages/ham-sim packages/ham-sim
# The content tree (lessons, labs, bank, blueprint) and the lesson list the seed reads.
COPY content content
COPY docs/coverage docs/coverage
RUN addgroup -S hampath && adduser -S hampath -G hampath && chown -R hampath:hampath /app
USER hampath
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1
CMD ["node_modules/.bin/tsx", "src/main.ts"]
