# syntax=docker/dockerfile:1
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.14.0
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @privatepath/db generate
# Build-time placeholders only; real values are provided at runtime.
RUN pnpm --filter @privatepath/web build

FROM base AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 app
COPY --from=build --chown=app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app /app/apps/web/.next/static ./apps/web/.next/static
USER app
EXPOSE 3000
# Runtime configuration (DATABASE_URL, HASH_PEPPER, AUTH_MODE=clerk, KMS settings, ...) comes from the environment.
CMD ["node", "apps/web/server.js"]
