#!/usr/bin/env bash
set -euo pipefail

FLARESOLVERR_DIR="/home/home/services/flaresolverr/flaresolverr"
XVFB_ROOT="/home/home/services/xvfb-local/root"
LOG_DIR="/home/home/projects/lampa-jackett-lite/logs"

mkdir -p "$LOG_DIR"
cd "$FLARESOLVERR_DIR"

export PATH="$XVFB_ROOT/usr/bin:$PATH"
export LD_LIBRARY_PATH="$XVFB_ROOT/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8191}"

while true; do
  echo "$(date -Is) starting FlareSolverr"
  set +e
  "$FLARESOLVERR_DIR/flaresolverr"
  code=$?
  set -e
  echo "$(date -Is) FlareSolverr exited with code $code"
  sleep 5
done
