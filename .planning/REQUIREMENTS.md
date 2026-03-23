# Requirements: Minerva Money

**Defined:** 2026-03-23
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.1 Requirements

Requirements for deployment hardening milestone. Each maps to roadmap phases.

### Production Build

- [ ] **BUILD-01**: Server runs from compiled JavaScript (tsc output), not TypeScript source
- [ ] **BUILD-02**: Client static files are served by Express in production (single process, no nginx)
- [ ] **BUILD-03**: SPA catch-all route serves index.html for all client-side routes
- [ ] **BUILD-04**: Environment variables load via Node 20 native `--env-file` flag (no dotenv)

### Process Management

- [ ] **PROC-01**: Server auto-restarts on crash via launchd KeepAlive (dict form: only on non-zero exit)
- [ ] **PROC-02**: Server starts automatically on user login via launchd RunAtLoad
- [ ] **PROC-03**: Restart throttle prevents rapid restart loops (ThrottleInterval: 10)
- [ ] **PROC-04**: Server plist uses correct node binary path for the target machine
- [ ] **PROC-05**: Backup plist runs compiled JS instead of tsx source

### Deploy Scripts

- [ ] **DEPLOY-01**: `setup.sh` performs first-time install (build, copy plists, load services, health check)
- [ ] **DEPLOY-02**: `setup.sh` uses modern `launchctl bootstrap` instead of deprecated `launchctl load`
- [ ] **DEPLOY-03**: `deploy.sh` performs one-command update (git pull, install, build, restart)
- [ ] **DEPLOY-04**: Deploy scripts validate the node binary path before installing plists
- [ ] **DEPLOY-05**: `.env` existence is verified before starting the server

### Directory Layout

- [ ] **DIR-01**: All deployment config co-located in `deploy/` directory
- [ ] **DIR-02**: Server and backup plists both live in `deploy/` (backup plist moved from repo root)

## Future Requirements

### Log Management

- **LOG-01**: Log rotation for `~/Library/Logs/minerva-server.log` via newsyslog

### Remote Access

- **REMOTE-01**: SSL/TLS termination for external network access

## Out of Scope

| Feature | Reason |
|---------|--------|
| PM2 process manager | Redundant with launchd; adds dependency and competing restart system |
| nginx reverse proxy | Unnecessary for single-user home server; Express serves static files |
| Docker containerization | Overengineered for single-user home app; complicates iCloud backup access |
| Git hooks for auto-deploy | Hidden complexity; explicit deploy script is safer for single dev |
| Automated health alerts | External notification service out of scope per PROJECT.md |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUILD-01 | Phase 18 | Pending |
| BUILD-02 | Phase 18 | Pending |
| BUILD-03 | Phase 18 | Pending |
| BUILD-04 | Phase 18 | Pending |
| PROC-01 | Phase 19 | Pending |
| PROC-02 | Phase 19 | Pending |
| PROC-03 | Phase 19 | Pending |
| PROC-04 | Phase 19 | Pending |
| PROC-05 | Phase 19 | Pending |
| DEPLOY-01 | Phase 20 | Pending |
| DEPLOY-02 | Phase 20 | Pending |
| DEPLOY-03 | Phase 20 | Pending |
| DEPLOY-04 | Phase 20 | Pending |
| DEPLOY-05 | Phase 20 | Pending |
| DIR-01 | Phase 18 | Pending |
| DIR-02 | Phase 18 | Pending |

**Coverage:**
- v2.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation*
