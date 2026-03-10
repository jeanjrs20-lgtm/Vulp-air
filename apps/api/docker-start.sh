#!/bin/sh
set -eu

cd /app/apps/api

if [ "${RUN_DATABASE_MIGRATIONS:-false}" = "true" ]; then
  pnpm exec prisma migrate deploy
fi

if [ "${RUN_DATABASE_SEED:-false}" = "true" ]; then
  pnpm run db:seed
fi

exec node dist/apps/api/src/index.js
