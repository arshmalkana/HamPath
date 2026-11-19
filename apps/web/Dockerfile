# HamPath web (Next.js standalone server). Build from the repo root:
#   docker build -f apps/web/Dockerfile -t hampath-web .
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/ham-sim/package.json packages/ham-sim/
COPY packages/content/package.json packages/content/
RUN pnpm install --frozen-lockfile --filter "@hampath/web..."
COPY tsconfig*.json ./
COPY apps/web apps/web
COPY packages/ui packages/ui
COPY packages/ham-sim packages/ham-sim
# The lab registry test (type-checked by next build) reads the content tree.
COPY packages/content packages/content
COPY content content
# Rewrites (/api → the API) are fixed at build time, and so is the browser's error-monitoring DSN.
ARG API_ORIGIN=http://api:4000
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ENV API_ORIGIN=$API_ORIGIN NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
RUN pnpm --filter @hampath/web build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
RUN addgroup -S hampath && adduser -S hampath -G hampath
COPY --from=build --chown=hampath:hampath /app/apps/web/.next/standalone ./
COPY --from=build --chown=hampath:hampath /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=hampath:hampath /app/apps/web/public ./apps/web/public
USER hampath
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/offline || exit 1
CMD ["node", "apps/web/server.js"]
