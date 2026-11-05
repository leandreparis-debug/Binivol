# syntax=docker/dockerfile:1.7
# Multi-stage build for Binivol (Next.js standalone output).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apk add --no-cache libc6-compat

# --- Dependencies --------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc prisma.config.ts ./
# `postinstall` runs `prisma generate`, which needs the schema (not a database).
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build ---------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec prisma generate && pnpm build

# --- Runtime -------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache wget

COPY --from=builder /app/public ./public
# Official PDF templates and fonts (read at runtime, SHA-256 checked: docs/signature.md).
COPY --from=builder /app/assets ./assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"ok"' || exit 1

CMD ["node", "server.js"]
