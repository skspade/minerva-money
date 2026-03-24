#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Pre-flight: validate node binary path from plist
NODE_PATH=$(sed -n 's/.*<string>\(.*\/bin\/node\)<\/string>/\1/p' deploy/com.minerva.server.plist)
if [ ! -x "$NODE_PATH" ]; then
  echo "Error: Node binary not found at $NODE_PATH"
  echo "Update the path in deploy/com.minerva.server.plist and deploy/com.minerva.backup.plist"
  exit 1
fi

echo "Pulling latest..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Verifying build output..."
if [ ! -f packages/server/dist/index.js ]; then
  echo "Error: Server build output missing (packages/server/dist/index.js)"
  exit 1
fi
if [ ! -f packages/client/dist/index.html ]; then
  echo "Error: Client build output missing (packages/client/dist/index.html)"
  exit 1
fi

echo "Restarting server..."
launchctl kickstart -k "gui/$(id -u)/com.minerva.server"

echo "Waiting for server to restart..."
for i in {1..10}; do
  if curl -s http://localhost:3001/health | grep -q '"ok"'; then
    echo "Deploy complete — server is healthy!"
    exit 0
  fi
  sleep 1
done

echo "Server failed to restart — check ~/Library/Logs/minerva-server-error.log"
exit 1
