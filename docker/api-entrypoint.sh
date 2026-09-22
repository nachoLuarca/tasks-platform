#!/bin/sh
# Entrypoint of the api's production image (stage `runtime`).
#
# `set -e` is the whole point of this file: `prisma migrate deploy` runs
# before the server, and if it fails the script exits non-zero without ever
# reaching `exec node`, so the container dies instead of serving traffic
# against a schema that doesn't match the code that was just deployed.
#
# `migrate deploy` is idempotent by design: it applies only the migrations
# recorded in prisma/migrations that are missing from the
# `_prisma_migrations` table of the target database, and is a no-op when
# there are none. It never prompts, never resets and never generates a new
# migration -- that's `migrate dev`, which is not used here.
set -e

cd /app/apps/api
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

# `exec` replaces this shell with node, so node becomes PID 1 and receives
# Render's SIGTERM directly -- without it the signal would reach `sh`, which
# wouldn't forward it, and the graceful shutdown in server.ts would never run.
cd /app
exec node apps/api/dist/server.js
