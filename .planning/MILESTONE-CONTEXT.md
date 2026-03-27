# Milestone Context

**Source:** Brainstorm session (Sync Error Visibility)
**Design:** .planning/designs/2026-03-26-sync-error-visibility-design.md

## Milestone Goal

Surface per-account sync errors in the UI so the user immediately knows when a bank connection needs attention, instead of silently showing "success" when SimpleFIN returns account-level errors.

## Features

### Database Schema

New `sync_warnings` table to persist per-account errors alongside each sync_log entry. Supports error history tracking. New `'partial'` status value for sync_log when accounts have errors but the API call succeeded.

### Sync Service Changes

Persist per-account warnings to `sync_warnings` table. Set sync status to `'partial'` when errors exist but sync didn't fail. Parse SimpleFIN error list with account IDs. Return structured warnings in SyncResult type.

### tRPC API Changes

Extend `sync.status` response with `warnings` array containing accountId, accountName, and message. Query `sync_warnings` joined to latest sync_log entry.

### Dashboard UI Changes

Amber "Partial" badge on sync status card. Account warnings list with simplified error messages. Link to SimpleFIN dashboard (bridge.simplefin.org) for reconnection. Clean display when no warnings.

### Navbar SyncStatus Changes

Amber warning indicator when latest sync is partial. Tooltip showing count of affected accounts. Four-state display: running, success, partial, error.
