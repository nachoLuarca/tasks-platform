# syntax=docker/dockerfile:1

FROM node:24-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json

# Same layering as docker/api.Dockerfile, see its comments -- both images
# share the same monorepo and the same reasons for each step. The worker
# still needs apps/api's prisma/ directory: it's where the Prisma schema
# (and therefore the generated client both processes import via
# @tasks-platform/shared) lives, even though the worker never runs a
# migration itself.
FROM base AS deps
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS dev
COPY . .
RUN pnpm rebuild
RUN pnpm --filter @tasks-platform/api exec prisma generate --schema prisma/schema.prisma
EXPOSE 3100
CMD ["pnpm", "run", "dev:worker"]

FROM deps AS build
COPY . .
RUN pnpm rebuild
RUN pnpm --filter @tasks-platform/api exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @tasks-platform/contracts run build
RUN pnpm --filter @tasks-platform/shared run build
RUN pnpm --filter @tasks-platform/worker run build

FROM node:24-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --shell /usr/sbin/nologin --no-create-home nodeapp
WORKDIR /app
COPY --from=build --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodejs /app/package.json ./package.json
COPY --from=build --chown=nodeapp:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=nodeapp:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=nodeapp:nodejs /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=nodeapp:nodejs /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=nodeapp:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=nodeapp:nodejs /app/packages/shared/dist ./packages/shared/dist

ENV NODE_ENV=production
USER nodeapp
EXPOSE 3100
CMD ["node", "apps/worker/dist/index.js"]
