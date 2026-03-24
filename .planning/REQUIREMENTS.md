# Requirements: Minerva Money

**Defined:** 2026-03-24
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.5 Requirements

Requirements for Chat Enhancements milestone. Each maps to roadmap phases.

### Model Selection

- [ ] **MOD-01**: Server exposes a tRPC query returning available model options (id, label, description)
- [ ] **MOD-02**: Chat mutation accepts optional model parameter with server-side allowlist validation
- [ ] **MOD-03**: Agent service uses the selected model instead of hardcoded Sonnet default
- [ ] **MOD-04**: User can select a model (Haiku/Sonnet/Opus) from a dropdown above the chat input bar
- [ ] **MOD-05**: Switching models resets the conversation (clears messages, resets session)
- [ ] **MOD-06**: Model selector is disabled while a chat request is pending
- [ ] **MOD-07**: Model-specific timeout scaling (Haiku 15s, Sonnet 30s, Opus 60s)

### Category Creation

- [ ] **CAT-01**: Agent can create a category group via `create_category_group` tool with name parameter
- [ ] **CAT-02**: Agent can create a category via `create_category` tool with groupId and name parameters
- [ ] **CAT-03**: Category group creation validates for case-insensitive duplicate group names
- [ ] **CAT-04**: Category creation validates for case-insensitive duplicate names within the same group
- [ ] **CAT-05**: Category creation validates that the target group exists
- [ ] **CAT-06**: Both creation tools require user confirmation via existing JSON confirmation block pattern
- [ ] **CAT-07**: Newly created categories are immediately usable by the agent in the same conversation turn

### System Prompt

- [ ] **SYS-01**: System prompt documents both category creation tools with usage guidance
- [ ] **SYS-02**: System prompt requires confirmation before category/group creation
- [ ] **SYS-03**: System prompt instructs agent to direct users to Categories page for delete/rename operations
- [ ] **SYS-04**: System prompt guides agent to check for existing categories before creating duplicates

## Future Requirements

### Chat Enhancements (Deferred)

- **FUT-01**: Visual model indicator pill/badge in chat area showing active model
- **FUT-02**: Persist selected model across page navigations via localStorage

## Out of Scope

| Feature | Reason |
|---------|--------|
| Category deletion via agent | Destructive op affecting sort order, budgets, transactions — belongs in UI |
| Category rename via agent | Rare operation with UI implications — Categories page sufficient |
| Category reorder via agent | Inherently visual operation — chat is wrong interface |
| Model auto-selection by query complexity | Unpredictable; user should control cost decisions |
| Streaming responses | Scoped out in PROJECT.md; collect-and-return sufficient for single user |
| Free-text group assignment | Fuzzy matching is error-prone; agent should list groups for user to pick |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MOD-01 | Phase 33 | Pending |
| MOD-02 | Phase 33 | Pending |
| MOD-03 | Phase 33 | Pending |
| MOD-04 | Phase 36 | Pending |
| MOD-05 | Phase 36 | Pending |
| MOD-06 | Phase 36 | Pending |
| MOD-07 | Phase 33 | Pending |
| CAT-01 | Phase 34 | Pending |
| CAT-02 | Phase 34 | Pending |
| CAT-03 | Phase 34 | Pending |
| CAT-04 | Phase 34 | Pending |
| CAT-05 | Phase 34 | Pending |
| CAT-06 | Phase 34 | Pending |
| CAT-07 | Phase 34 | Pending |
| SYS-01 | Phase 35 | Pending |
| SYS-02 | Phase 35 | Pending |
| SYS-03 | Phase 35 | Pending |
| SYS-04 | Phase 35 | Pending |

**Coverage:**
- v2.5 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
