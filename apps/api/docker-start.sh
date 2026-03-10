#!/bin/sh
set -eu

cd /app/apps/api

if [ "${RUN_DATABASE_MIGRATIONS:-false}" = "true" ]; then
  pnpm exec prisma migrate deploy
fi

exec node dist/apps/api/src/index.js
