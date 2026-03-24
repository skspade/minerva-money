#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Pre-flight: check .env exists
if [ ! -f .env ]; then
  echo "Error: .env file not found."
  echo "Create .env with SIMPLEFIN_SETUP_TOKEN and ANTHROPIC_API_KEY before running setup."
  exit 1
fi

# Pre-flight: validate node binary path from plist
NODE_PATH=$(sed -n 's/.*<string>\(.*\/bin\/node\)<\/string>/\1/p' deploy/com.minerva.server.plist)
if [ ! -x "$NODE_PATH" ]; then
  echo "Error: Node binary not found at $NODE_PATH"
  echo "Update the path in deploy/com.minerva.server.plist and deploy/com.minerva.backup.plist"
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Installing launchd services..."
cp deploy/com.minerva.server.plist ~/Library/LaunchAgents/
cp deploy/com.minerva.backup.plist ~/Library/LaunchAgents/

echo "Loading server service..."
launchctl bootout "gui/$(id -u)/com.minerva.server" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.minerva.server.plist

echo "Loading backup service..."
launchctl bootout "gui/$(id -u)/com.minerva.backup" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.minerva.backup.plist

echo "Starting server..."
launchctl kickstart "gui/$(id -u)/com.minerva.server"

echo "Waiting for server to start..."
for i in {1..10}; do
  if curl -s http://localhost:3001/health | grep -q '"ok"'; then
    echo "Server is running!"
    exit 0
  fi
  sleep 1
done

echo "Server failed to start — check ~/Library/Logs/minerva-server-error.log"
exit 1
