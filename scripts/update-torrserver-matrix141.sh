#!/usr/bin/env bash
set -euo pipefail

SERVICE="torrserver.service"
INSTALL_DIR="/opt/torrserver"
BINARY="$INSTALL_DIR/TorrServer-linux-amd64"
NEW_BINARY="/home/home/projects/lampa-jackett-lite/.tmp/torrserver-update/TorrServer-linux-amd64"
BACKUP="$BINARY.backup-$(date +%Y%m%d-%H%M%S)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [ ! -x "$NEW_BINARY" ]; then
  echo "Downloaded binary not found: $NEW_BINARY" >&2
  exit 1
fi

echo "Current TorrServer:"
"$BINARY" --version || true
curl --silent --show-error --max-time 5 http://127.0.0.1:8095/echo || true
echo

echo "New TorrServer:"
"$NEW_BINARY" --version

cp -a "$BINARY" "$BACKUP"
install -o root -g root -m 0755 "$NEW_BINARY" "$BINARY"

if ! systemctl restart "$SERVICE"; then
  echo "Restart failed, rolling back to $BACKUP" >&2
  cp -a "$BACKUP" "$BINARY"
  systemctl restart "$SERVICE"
  exit 1
fi

sleep 3

if ! systemctl is-active --quiet "$SERVICE"; then
  echo "Service is not active after update, rolling back to $BACKUP" >&2
  cp -a "$BACKUP" "$BINARY"
  systemctl restart "$SERVICE"
  exit 1
fi

version="$(curl --silent --show-error --max-time 5 http://127.0.0.1:8095/echo || true)"
if [ "$version" != "MatriX.141" ]; then
  echo "Unexpected /echo response after update: $version" >&2
  echo "Rolling back to $BACKUP" >&2
  cp -a "$BACKUP" "$BINARY"
  systemctl restart "$SERVICE"
  exit 1
fi

echo "TorrServer updated successfully: $version"
echo "Backup: $BACKUP"
