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

# Full install (incl. devDependencies, needed for the Prisma CLI and the
# TypeScript build), reused by dev and build stages. --ignore-scripts skips
# the root `postinstall` (builds packages/contracts, runs `prisma generate`),
# which would fail here: only package.json files are copied at this point,
# not the source it needs. It also skips dependency lifecycle scripts, most
# notably @prisma/engines' postinstall (downloads the query engine binaries)
# and argon2's (builds its native addon) -- both re-enabled explicitly below,
# in the stages where the source tree is present.
FROM base AS deps
RUN pnpm install --frozen-lockfile --ignore-scripts

# Development image: runs the TypeScript source directly with hot reload.
FROM deps AS dev
COPY . .
RUN pnpm rebuild
RUN pnpm --filter @tasks-platform/api exec prisma generate --schema prisma/schema.prisma
# pnpm >=10 runs an automatic "deps status check" before any `pnpm run`,
# and purges/reinstalls node_modules if the bind-mounted
# package.json/pnpm-lock.yaml (from the host) don't exactly match what's
# baked into the image -- which happens any time a dependency changed on
# the host after this image was last built. Two problems follow: the
# purge needs a TTY this detached container doesn't have (CI=true makes
# pnpm skip that prompt instead of aborting), and the purge/reinstall
# itself needs write access to node_modules, which docker-compose's
# `user: "1000:1000"` (so bind-mounted source files stay host-owned) can't
# have -- node_modules was built as root in this same RUN step. `chmod` it
# open so the non-root runtime user can still write there if pnpm decides
# it must.
ENV CI=true
RUN chmod -R a+rwX node_modules apps/*/node_modules packages/*/node_modules
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# Compiles contracts and the API to plain JS, with the Prisma client
# generated in the same node_modules tree that ships to runtime.
FROM deps AS build
COPY . .
RUN pnpm rebuild
RUN pnpm --filter @tasks-platform/api exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @tasks-platform/contracts run build
RUN pnpm --filter @tasks-platform/shared run build
RUN pnpm --filter @tasks-platform/api run build

# Final runtime image: compiled output only, running as a non-root user.
# The Prisma client generator requires the `prisma` CLI (a devDependency) to
# run, so this reuses the `build` stage's node_modules rather than a
# separate --prod install that would lack it.
FROM node:24-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --shell /usr/sbin/nologin --no-create-home nodeapp
WORKDIR /app
# pnpm's strict node_modules layout symlinks each workspace package's
# dependencies from its own node_modules into the central .pnpm store, so
# every package directory (not just the root) needs to come along.
COPY --from=build --chown=nodeapp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodejs /app/package.json ./package.json
COPY --from=build --chown=nodeapp:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=nodeapp:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodeapp:nodejs /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=nodeapp:nodejs /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=nodeapp:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=nodeapp:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=nodeapp:nodejs /app/packages/shared/dist ./packages/shared/dist

ENV NODE_ENV=production
USER nodeapp
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
