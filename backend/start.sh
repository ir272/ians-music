#!/bin/sh
set -e

# Start bgutil HTTP server in background (provides PO tokens for YouTube)
# Must run from inside node_modules/ for FFI/read permissions to resolve correctly
echo "[startup] Starting bgutil PO token server on :4416 ..."
cd /root/bgutil-ytdlp-pot-provider/server/node_modules
DENO_DIR=/root/bgutil-ytdlp-pot-provider/.deno deno run \
  --allow-env \
  --allow-net \
  "--allow-ffi=." \
  "--allow-read=." \
  ../src/main.ts \
  2>&1 | sed 's/^/[bgutil] /' &

# Give bgutil a moment to start before accepting traffic
sleep 4
echo "[startup] bgutil server started, launching app ..."

# Start uvicorn
cd /app
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
