# Milestone Context

**Source:** Brainstorm session (Deployment Hardening — Uptime Reliability & Crash Recovery)
**Design:** .planning/designs/2026-03-23-deployment-hardening-design.md

## Milestone Goal

Harden Minerva Money for production deployment on a home iMac. The server should auto-restart on crash, start on boot, serve both the API and client from a single process, and support one-command deployments.

## Features

### Production Build & Static File Serving

Express serves the Vite-built client static files in production. A `start:prod` script uses Node 20's native `--env-file` flag. The compiled server resolves the client dist directory relative to `__dirname`.

### launchd Service Configuration

A `com.minerva.server.plist` LaunchAgent with `KeepAlive: true` for crash recovery, `RunAtLoad: true` for boot startup, and `ThrottleInterval: 10` to prevent rapid restart loops. Logs to `~/Library/Logs/minerva-server.log`.

### Deploy Script

`deploy/deploy.sh` handles git pull, npm install, build, and service restart via `launchctl kickstart -k`. A one-time `deploy/setup.sh` installs plists and verifies the server starts.

### Environment & Directory Layout

All deployment config co-located in `deploy/` directory: server plist, backup plist (moved from repo root), deploy script, and setup script.
