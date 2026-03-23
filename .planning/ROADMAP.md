# Roadmap: Minerva Money

## Milestones

- ✅ **v1.0 MVP** — Phases 1-13 (shipped 2026-03-22)
- 🚧 **v2.0 Claude Agent** — Phases 14-16 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-13) — SHIPPED 2026-03-22</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-22
- [x] Phase 2: SimpleFIN Data Pipeline (4/4 plans) — completed 2026-03-22
- [x] Phase 3: Accounts and Transactions UI (4/4 plans) — completed 2026-03-22
- [x] Phase 4: Category Management (4/4 plans) — completed 2026-03-22
- [x] Phase 5: Categorization Rules Engine (4/4 plans) — completed 2026-03-23
- [x] Phase 6: Transfer Detection (3/3 plans) — completed 2026-03-22
- [x] Phase 7: Budget Engine (4/4 plans) — completed 2026-03-22
- [x] Phase 8: Budget UI (3/3 plans) — completed 2026-03-22
- [x] Phase 9: Dashboard and Reporting (4/4 plans) — completed 2026-03-22
- [x] Phase 10: Foundation Bug Fix & Verification (2/2 plans) — completed 2026-03-23 [Gap Closure]
- [x] Phase 11: Reporting Date Fix & Verification Sweep (2/2 plans) — completed 2026-03-23 [Gap Closure]
- [x] Phase 12: Budget Defaults UI (1/1 plan) — completed 2026-03-23 [Gap Closure]
- [x] Phase 13: Transaction Filter Completion (1/1 plan) — completed 2026-03-23 [Gap Closure]

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v2.0 Claude Agent (In Progress)

**Milestone Goal:** Add a Claude-powered conversational agent that can query and act on all financial data through a chat interface.

- [x] **Phase 14: Agent Infrastructure and Query Tools** — Server-side agent with read-only tools covering all financial data queries (completed 2026-03-23)
- [ ] **Phase 15: Chat UI** — Full-height chat page with markdown rendering, loading states, and navigation
- [ ] **Phase 16: Action Tools and Confirmation Flow** — Write operations for categorization, rules, budgets, transfers, and sync with confirmation for amount changes

## Phase Details

### Phase 14: Agent Infrastructure and Query Tools
**Goal**: Users can ask natural language questions about their finances and get accurate, tool-backed answers via tRPC
**Depends on**: v1.0 complete (Phase 13)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, QUERY-01, QUERY-02, QUERY-03, QUERY-04, QUERY-05, QUERY-06, QUERY-07, QUERY-08, QUERY-09, QUERY-10, SAFE-01, SAFE-03, SAFE-04, SAFE-05
**Success Criteria** (what must be TRUE):
  1. User can send a chat message via tRPC and receive an agent response with accurate financial data (balances, spending, budgets, net worth, transactions)
  2. Agent answers are backed by tool calls to real data — no hallucinated numbers appear in responses
  3. Multi-turn conversations maintain context (user can ask follow-up questions without restating prior context)
  4. Agent refuses to perform destructive operations (no delete tools exist) and validates all inputs before executing queries
  5. API key is never exposed to the client; agent runs entirely server-side
**Plans**: 3 plans
- [ ] 14-01-PLAN.md — Agent infrastructure: SDK setup, system prompt, MCP server, agent service, tRPC router
- [ ] 14-02-PLAN.md — Core query tools: account balances, budget summary, spending, net worth
- [ ] 14-03-PLAN.md — Remaining query tools: transactions, categories, rules, sync status, transfers

### Phase 15: Chat UI
**Goal**: Users interact with the agent through a polished chat interface in the web app
**Depends on**: Phase 14
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. User can navigate to /chat from the sidebar and see a full-height chat page with message list and input bar
  2. Agent responses render formatted markdown including tables, bold text, and lists for financial data
  3. User sees a loading indicator while the agent is processing and cannot double-send messages
  4. Errors from the agent display as readable messages in the chat thread (not silent failures or raw stack traces)
  5. Confirmation buttons appear inline when the agent proposes actions that require approval
**Plans**: 2 plans
- [ ] 15-01-PLAN.md — Dependencies, routing, nav link, and ChatPage shell with full-height layout
- [ ] 15-02-PLAN.md — Chat message flow, markdown rendering, loading states, errors, and confirmation buttons

### Phase 16: Action Tools and Confirmation Flow
**Goal**: Users can modify financial data through chat — categorize transactions, manage rules, adjust budgets, handle transfers, and trigger sync
**Depends on**: Phase 15
**Requirements**: ACTION-01, ACTION-02, ACTION-03, ACTION-04, ACTION-05, ACTION-06, ACTION-07, ACTION-08, SAFE-02
**Success Criteria** (what must be TRUE):
  1. User can categorize transactions and create/update/delete categorization rules via natural language chat commands
  2. User can adjust budget allocations and defaults via chat, with the agent requiring explicit confirmation before any amount change takes effect
  3. User can confirm or dismiss pending transfer suggestions and trigger a manual SimpleFIN sync through chat
  4. All write operations validate inputs (category/rule IDs exist, amounts are valid) and the agent reports clear success or failure messages
**Plans**: TBD

## Progress

**Execution Order:** Phases execute in numeric order: 14 -> 15 -> 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-22 |
| 2. SimpleFIN Data Pipeline | v1.0 | 4/4 | Complete | 2026-03-22 |
| 3. Accounts and Transactions UI | v1.0 | 4/4 | Complete | 2026-03-22 |
| 4. Category Management | v1.0 | 4/4 | Complete | 2026-03-22 |
| 5. Categorization Rules Engine | v1.0 | 4/4 | Complete | 2026-03-23 |
| 6. Transfer Detection | v1.0 | 3/3 | Complete | 2026-03-22 |
| 7. Budget Engine | v1.0 | 4/4 | Complete | 2026-03-22 |
| 8. Budget UI | v1.0 | 3/3 | Complete | 2026-03-22 |
| 9. Dashboard and Reporting | v1.0 | 4/4 | Complete | 2026-03-22 |
| 10. Foundation Bug Fix | v1.0 | 2/2 | Complete | 2026-03-23 |
| 11. Reporting Date Fix | v1.0 | 2/2 | Complete | 2026-03-23 |
| 12. Budget Defaults UI | v1.0 | 1/1 | Complete | 2026-03-23 |
| 13. Transaction Filters | v1.0 | 1/1 | Complete | 2026-03-23 |
| 14. Agent Infrastructure and Query Tools | v2.0 | Complete    | 2026-03-23 | - |
| 15. Chat UI | 1/2 | In Progress|  | - |
| 16. Action Tools and Confirmation Flow | v2.0 | 0/? | Not started | - |
