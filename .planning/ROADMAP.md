# Roadmap: Minerva Money

## Milestones

- ✅ **v1.0 MVP** — Phases 1-13 (shipped 2026-03-22)
- ✅ **v2.0 Claude Agent** — Phases 14-17 (shipped 2026-03-23)
- ✅ **v2.1 Deployment Hardening** — Phases 18-20 (shipped 2026-03-24)
- ✅ **v2.2 Mobile-Friendly UI** — Phases 21-25 (shipped 2026-03-24)
- ✅ **v2.3 CSV Import** — Phases 26-28 (shipped 2026-03-24)
- ✅ **v2.4 CSV Import Account Filtering** — Phases 29-32 (shipped 2026-03-24)
- 🚧 **v2.5 Chat Enhancements** — Phases 33-36 (in progress)

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

<details>
<summary>✅ v2.0 Claude Agent (Phases 14-17) — SHIPPED 2026-03-23</summary>

- [x] Phase 14: Agent Infrastructure and Query Tools (3/3 plans) — completed 2026-03-23
- [x] Phase 15: Chat UI (2/2 plans) — completed 2026-03-23
- [x] Phase 16: Action Tools and Confirmation Flow (2/2 plans) — completed 2026-03-23
- [x] Phase 17: Audit Gap Closure (1/1 plan) — completed 2026-03-23 [Gap Closure]

Full details: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

</details>

<details>
<summary>✅ v2.1 Deployment Hardening (Phases 18-20) — SHIPPED 2026-03-24</summary>

- [x] Phase 18: Production Build and Directory Layout (2/2 plans) — completed 2026-03-23
- [x] Phase 19: Service Configuration (1/1 plan) — completed 2026-03-24
- [x] Phase 20: Deploy Scripts (2/2 plans) — completed 2026-03-24

Full details: [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md)

</details>

<details>
<summary>✅ v2.2 Mobile-Friendly UI (Phases 21-25) — SHIPPED 2026-03-24</summary>

- [x] Phase 21: Layout Foundation (2/2 plans) — completed 2026-03-24
- [x] Phase 22: Transaction Cards (1/1 plan) — completed 2026-03-24
- [x] Phase 23: Budget Cards (1/1 plan) — completed 2026-03-24
- [x] Phase 24: Modal Conversions (1/1 plan) — completed 2026-03-24
- [x] Phase 25: Remaining Pages (2/2 plans) — completed 2026-03-24

Full details: [milestones/v2.2-ROADMAP.md](milestones/v2.2-ROADMAP.md)

</details>

<details>
<summary>✅ v2.3 CSV Import (Phases 26-28) — SHIPPED 2026-03-24</summary>

- [x] Phase 26: Import Service and API (2/2 plans) — completed 2026-03-24
- [x] Phase 27: Import UI and Navigation (2/2 plans) — completed 2026-03-24
- [x] Phase 28: Phase 26 Verification (1/1 plan) — completed 2026-03-24 [Gap Closure]

Full details: [milestones/v2.3-ROADMAP.md](milestones/v2.3-ROADMAP.md)

</details>

<details>
<summary>✅ v2.4 CSV Import Account Filtering (Phases 29-32) — SHIPPED 2026-03-24</summary>

- [x] Phase 29: Server Skip Support (1/1 plan) — completed 2026-03-24
- [x] Phase 30: Client Skip UI (1/1 plan) — completed 2026-03-24
- [x] Phase 31: Stats Filtering and Polish (1/1 plan) — completed 2026-03-24
- [x] Phase 32: Phase 31 Verification (1/1 plan) — completed 2026-03-24 [Gap Closure]

Full details: [milestones/v2.4-ROADMAP.md](milestones/v2.4-ROADMAP.md)

</details>

### 🚧 v2.5 Chat Enhancements (In Progress)

**Milestone Goal:** Add model selector and category creation to the Claude chat agent

- [x] **Phase 33: Model Selector Server** - Server-side model list endpoint, chat mutation model parameter, and model-specific timeout scaling (completed 2026-03-24)
- [x] **Phase 34: Category Creation Tools** - Agent tools for creating categories and category groups with duplicate validation and confirmation flow (completed 2026-03-25)
- [ ] **Phase 35: System Prompt Updates** - Behavioral guidance for category creation tools and add-only policy
- [ ] **Phase 36: Model Selector UI** - Client-side model dropdown, session reset on model change, and disabled state during pending requests

## Phase Details

### Phase 33: Model Selector Server
**Goal**: Server exposes model options and accepts model selection for chat requests
**Depends on**: Nothing (first phase of v2.5)
**Requirements**: MOD-01, MOD-02, MOD-03, MOD-07
**Success Criteria** (what must be TRUE):
  1. Calling the models tRPC query returns a list of available models with id, label, and description
  2. Sending a chat message with a model parameter uses that model instead of the hardcoded default
  3. Sending a chat message without a model parameter defaults to Sonnet
  4. Chat requests to Opus allow up to 60 seconds before timing out; Haiku allows 15 seconds
**Plans**: 1 plan

Plans:
- [ ] 33-01-PLAN.md — Model definitions, service model parameter, router models query and chat model input

### Phase 34: Category Creation Tools
**Goal**: Agent can create categories and category groups during conversation with safety validation
**Depends on**: Nothing (independent of Phase 33)
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06, CAT-07
**Success Criteria** (what must be TRUE):
  1. User can ask the agent to create a category group and see a confirmation prompt before it is created
  2. User can ask the agent to create a category in a specific group and see a confirmation prompt before it is created
  3. Agent rejects creation and suggests the existing item when a duplicate name (case-insensitive) is requested
  4. Agent rejects category creation when the target group does not exist
  5. A newly created category can be used by the agent for categorization in the same conversation turn
**Plans**: 1 plan

Plans:
- [ ] 34-01-PLAN.md — Add create_category_group and create_category tools with validation (TDD)

### Phase 35: System Prompt Updates
**Goal**: Agent follows behavioral guidance for category creation and directs users to UI for destructive operations
**Depends on**: Phase 34
**Requirements**: SYS-01, SYS-02, SYS-03, SYS-04
**Success Criteria** (what must be TRUE):
  1. Agent checks for existing categories before attempting to create a new one
  2. Agent asks for user confirmation before creating a category or group
  3. When asked to delete or rename a category, the agent directs the user to the Categories page instead
**Plans**: 1 plan

Plans:
- [ ] 35-01-PLAN.md — Add Category Management section to system prompt (TDD)

### Phase 36: Model Selector UI
**Goal**: User can choose between Haiku, Sonnet, and Opus from the chat interface
**Depends on**: Phase 33
**Requirements**: MOD-04, MOD-05, MOD-06
**Success Criteria** (what must be TRUE):
  1. A model dropdown is visible above the chat input bar with Haiku, Sonnet, and Opus options
  2. Switching models clears the conversation history and starts a fresh session
  3. The model dropdown is disabled and unclickable while a chat response is loading
**Plans**: TBD

Plans:
- [ ] 36-01: TBD

## Progress

**Execution Order:**
Phases 33 and 34 are independent and can execute in parallel. Phase 35 depends on 34. Phase 36 depends on 33.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-13 | v1.0 | 39/39 | Complete | 2026-03-22 |
| 14-17 | v2.0 | 8/8 | Complete | 2026-03-23 |
| 18-20 | v2.1 | 5/5 | Complete | 2026-03-24 |
| 21-25 | v2.2 | 7/7 | Complete | 2026-03-24 |
| 26-28 | v2.3 | 5/5 | Complete | 2026-03-24 |
| 29-32 | v2.4 | 4/4 | Complete | 2026-03-24 |
| 33. Model Selector Server | 1/1 | Complete   | 2026-03-24 | - |
| 34. Category Creation Tools | 1/1 | Complete    | 2026-03-25 | - |
| 35. System Prompt Updates | v2.5 | 0/1 | Not started | - |
| 36. Model Selector UI | v2.5 | 0/1 | Not started | - |
