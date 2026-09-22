#!/bin/sh
# Entrypoint of the worker's production image (stage `runtime`).
#
# The worker deliberately does NOT run migrations: the api owns the schema
# and applies it on its own boot (see docker/api-entrypoint.sh). Two
# processes racing to apply the same migrations on every deploy buys
# nothing -- Prisma's advisory lock would just make one wait for the other.
#
# This file exists only so the worker starts the same way the api does, with
# node as PID 1 receiving SIGTERM directly for the graceful shutdown.
set -e

exec node apps/worker/dist/index.js
