# Requirements: Minerva Money v2.0

**Defined:** 2026-03-23
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.0 Requirements

Requirements for the Claude Agent integration. Each maps to roadmap phases.

### Agent Infrastructure

- [ ] **AGENT-01**: Server-side agent endpoint accepts chat messages and returns agent responses via tRPC
- [ ] **AGENT-02**: Agent uses only custom MCP tools wrapping existing service functions (no built-in filesystem/shell tools)
- [ ] **AGENT-03**: System prompt provides agent with Minerva Money domain knowledge (envelope budgeting, categories, accounts, pay schedule)
- [ ] **AGENT-04**: Agent sessions persist across multiple turns within a conversation (multi-turn context)
- [ ] **AGENT-05**: Agent enforces maxTurns limit to prevent runaway API costs

### Query Tools

- [ ] **QUERY-01**: User can ask for account balances in natural language ("How much is in my checking?")
- [ ] **QUERY-02**: User can ask for spending by category and date range ("How much did I spend on groceries this month?")
- [ ] **QUERY-03**: User can ask for budget summary showing allocated vs spent vs remaining per category
- [ ] **QUERY-04**: User can ask for net worth with trend direction
- [ ] **QUERY-05**: User can search and filter transactions by merchant, category, date range, and amount
- [ ] **QUERY-06**: User can ask for sync status (last sync time, errors)
- [ ] **QUERY-07**: User can ask for uncategorized transactions
- [ ] **QUERY-08**: User can ask for pending transfer suggestions
- [ ] **QUERY-09**: User can ask for current categorization rules
- [ ] **QUERY-10**: User can ask for available-to-budget amount for current period

### Action Tools

- [ ] **ACTION-01**: User can categorize a transaction via chat ("Categorize this Starbucks transaction as Dining")
- [ ] **ACTION-02**: User can create categorization rules via chat ("Create a rule: Starbucks goes to Dining")
- [ ] **ACTION-03**: User can update or delete existing rules via chat
- [ ] **ACTION-04**: User can apply a rule retroactively to all matching transactions via chat
- [ ] **ACTION-05**: User can adjust budget allocation for a category/period via chat (requires confirmation)
- [ ] **ACTION-06**: User can set default budget allocation for a category via chat (requires confirmation)
- [ ] **ACTION-07**: User can confirm or dismiss transfer suggestions via chat
- [ ] **ACTION-08**: User can trigger a manual SimpleFIN sync via chat

### Chat UI

- [ ] **UI-01**: Chat page at /chat with full-height layout, message list, and input bar
- [ ] **UI-02**: Agent responses render markdown (tables, bold, lists) for formatted financial data
- [ ] **UI-03**: Loading indicator while agent is processing a response
- [ ] **UI-04**: Inline confirmation buttons for actions that require approval (budget amount changes)
- [ ] **UI-05**: Chat navigation link in the app sidebar
- [ ] **UI-06**: Error messages displayed in chat when agent encounters errors

### Safety & Permissions

- [ ] **SAFE-01**: Agent auto-executes all read queries and most write actions without confirmation
- [ ] **SAFE-02**: Agent requires explicit user confirmation before changing budget amounts (allocations and defaults)
- [ ] **SAFE-03**: Agent cannot delete accounts or transactions (no tools provided for these operations)
- [ ] **SAFE-04**: Tool implementations validate inputs before executing (category ID exists, rule conditions valid)
- [ ] **SAFE-05**: Anthropic API key stored in .env (gitignored), never exposed to client

## Future Requirements

Deferred to v2.x or later. Tracked but not in current roadmap.

### Streaming & Performance

- **STREAM-01**: Agent responses stream token-by-token via WebSocket for faster perceived response times
- **STREAM-02**: Partial message rendering as tokens arrive

### Chat History

- **HIST-01**: Chat conversations persist across page reloads
- **HIST-02**: User can view and resume previous conversations

### Enhanced Insights

- **INSIGHT-01**: Agent provides spending comparisons across periods ("You spent 20% more on dining this month vs last")
- **INSIGHT-02**: Agent identifies spending anomalies ("Unusual $500 charge at merchant X")

## Out of Scope

| Feature | Reason |
|---------|--------|
| Financial advice / recommendations | Liability risk; agent answers data questions only, not "should I buy this?" |
| Voice input/output | Massive scope; text-only chat sufficient |
| Agent-initiated proactive alerts | Different architecture from request-response; dashboard already shows budget status |
| Persistent chat history database | SDK sessions handle within-session continuity; defer permanent storage |
| Category creation via agent | UI concern with sort ordering; agent suggests, user creates in UI |
| Multi-agent orchestration | Single agent with all tools is simpler and sufficient for this scope |
| Agent filesystem/shell access | Security risk; agent only accesses data through custom tools |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AGENT-01 | Phase 14 | Pending |
| AGENT-02 | Phase 14 | Pending |
| AGENT-03 | Phase 14 | Pending |
| AGENT-04 | Phase 14 | Pending |
| AGENT-05 | Phase 14 | Pending |
| QUERY-01 | Phase 14 | Pending |
| QUERY-02 | Phase 14 | Pending |
| QUERY-03 | Phase 14 | Pending |
| QUERY-04 | Phase 14 | Pending |
| QUERY-05 | Phase 14 | Pending |
| QUERY-06 | Phase 14 | Pending |
| QUERY-07 | Phase 14 | Pending |
| QUERY-08 | Phase 14 | Pending |
| QUERY-09 | Phase 14 | Pending |
| QUERY-10 | Phase 14 | Pending |
| SAFE-01 | Phase 14 | Pending |
| SAFE-03 | Phase 14 | Pending |
| SAFE-04 | Phase 14 | Pending |
| SAFE-05 | Phase 14 | Pending |
| UI-01 | Phase 15 | Pending |
| UI-02 | Phase 15 | Pending |
| UI-03 | Phase 15 | Pending |
| UI-04 | Phase 15 | Pending |
| UI-05 | Phase 15 | Pending |
| UI-06 | Phase 15 | Pending |
| ACTION-01 | Phase 16 | Pending |
| ACTION-02 | Phase 16 | Pending |
| ACTION-03 | Phase 16 | Pending |
| ACTION-04 | Phase 16 | Pending |
| ACTION-05 | Phase 16 | Pending |
| ACTION-06 | Phase 16 | Pending |
| ACTION-07 | Phase 16 | Pending |
| ACTION-08 | Phase 16 | Pending |
| SAFE-02 | Phase 16 | Pending |

**Coverage:**
- v2.0 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation*
