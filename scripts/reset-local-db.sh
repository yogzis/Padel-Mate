#!/usr/bin/env bash
#
# Wipes the local Miniflare D1 database and rebuilds it from the migrations in
# drizzle/. Local only: it deletes a directory under .wrangler/ and never
# authenticates against Cloudflare, so it cannot touch the deployed database.

set -euo pipefail

readonly LOCAL_D1_STATE_DIR=".wrangler/state/v3/d1"
readonly DEV_SERVER_PORT=3000

cd "$(dirname "$0")/.."

# Match the listening socket only. A plain port lookup also returns browser and
# editor clients, whose sockets linger in CLOSE_WAIT after the server exits and
# would block a reset that is actually safe to run.
if lsof -ti "TCP:${DEV_SERVER_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Dev server is still running on port ${DEV_SERVER_PORT}."
  echo "Stop it first. Miniflare holds the database file open, so replacing it"
  echo "underneath a running server leaves that server on a stale handle."
  exit 1
fi

if [ -d "${LOCAL_D1_STATE_DIR}" ]; then
  rm -rf "${LOCAL_D1_STATE_DIR}"
  echo "Deleted ${LOCAL_D1_STATE_DIR}"
else
  echo "No local database found. Creating one."
fi

npm run db:migrate

echo
echo "Local database reset. Sign in again to recreate your admin user."
