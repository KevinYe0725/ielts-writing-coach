# syntax=docker/dockerfile:1.7
FROM node:24.19.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/exchange/package.json packages/exchange/package.json
COPY packages/learning-contracts/package.json packages/learning-contracts/package.json
COPY packages/learning-core/package.json packages/learning-core/package.json
COPY packages/question-bank/package.json packages/question-bank/package.json
RUN pnpm install --frozen-lockfile

FROM postgres:17.6-bookworm AS postgres-tools

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @iwc/web build \
    && pnpm --filter @iwc/worker exec tsup src/index.ts src/migrate.ts \
      --config ../../tsup.worker.config.ts \
      --format esm \
      --sourcemap \
      --out-dir dist \
    && pnpm --filter @iwc/worker deploy --prod --legacy /workspace/worker-runtime \
    && mkdir -p /workspace/runtime-node-modules \
    && cp -a /workspace/apps/web/.next/standalone/node_modules/. /workspace/runtime-node-modules/ \
    && ln -s .pnpm/node_modules/pg /workspace/runtime-node-modules/pg

FROM node:24.19.0-bookworm-slim AS runner
ARG SOURCE_URL="https://github.com/KevinYe0725/ielts-writing-coach"
ARG VCS_REF="unknown"
ARG VERSION="1.0.0"
LABEL org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="IELTS Writing Coach"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      libgssapi-krb5-2 \
      libldap-2.5-0 \
      libpq5 \
      libsasl2-2 \
      libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 iwc \
    && useradd --system --uid 1001 --gid iwc iwc \
    && install -d -o iwc -g iwc -m 0700 /run/iwc-secrets
COPY --from=postgres-tools /usr/lib/postgresql/17/bin/pg_dump /usr/lib/postgresql/17/bin/pg_restore /usr/lib/postgresql/17/bin/
COPY --from=builder --chown=iwc:iwc /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=iwc:iwc /workspace/runtime-node-modules ./node_modules
COPY --from=builder --chown=iwc:iwc /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=iwc:iwc /workspace/worker-runtime ./worker-runtime
COPY --from=builder --chown=iwc:iwc /workspace/packages/db/drizzle ./drizzle
COPY --from=builder --chown=iwc:iwc /workspace/docker ./docker
COPY --from=builder --chown=iwc:iwc /workspace/LICENSE /workspace/NOTICE /workspace/THIRD_PARTY_NOTICES.md ./
USER iwc
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
CMD ["node", "/app/docker/start-web.mjs"]
