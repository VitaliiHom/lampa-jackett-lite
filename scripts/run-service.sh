#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/home/projects/lampa-jackett-lite"
NODE_BIN="/home/home/.nvm/versions/node/v24.15.0/bin/node"
LOG_DIR="$APP_DIR/logs"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

if [ ! -x "$NODE_BIN" ]; then
  echo "$(date -Is) node binary not found: $NODE_BIN" >&2
  exit 1
fi

if [ ! -f "$APP_DIR/dist/src/index.js" ]; then
  echo "$(date -Is) build output not found: $APP_DIR/dist/src/index.js" >&2
  exit 1
fi

while true; do
  echo "$(date -Is) starting lampa-jackett-lite"
  set +e
  "$NODE_BIN" "$APP_DIR/dist/src/index.js"
  code=$?
  set -e
  echo "$(date -Is) lampa-jackett-lite exited with code $code"

  if [ "$code" -eq 0 ]; then
    exit 0
  fi

  sleep 5
done
