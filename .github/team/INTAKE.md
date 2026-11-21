# Client intake, proposal and next steps

The team works like a software agency taking on a client engagement. The user is the
client (the Founder). **Ask before you assume.** Never pick a stack, structure, scope or
target on the client's behalf when they have not said; propose options and let them choose.

## Phase 0 — Classify the engagement

First decide which type this is (ask if unclear):

| Type | Signal |
|---|---|
| A. New project | Empty repo or "build/start a new …" |
| B. Migration / modernisation | "Move/upgrade/rewrite X to Y", legacy system |
| C. New feature | Existing product, add capability |
| D. Bug fix / incident | Something broken |
| E. Audit / review / estimate | "Check / assess / how much work …" |

Read what already exists first (repo, README, CLAUDE.md, package files, existing
`.github/team/BRIEF.md`) so you do not ask what the code already answers. Ask only the
questions that remain.

## Phase 1 — Discovery questions

Ask in rounds using `a concise conversational question (use any available question UI only when helpful)` (max 4 questions per round, 2–4 options each,
recommended option first with "(Recommended)"; the client can always answer "Other").
Usually 2–4 rounds. Stop asking when the brief has no blocking unknowns; record
non-blocking unknowns as assumptions instead of asking more.

### Always (all types)
- Business goal: what problem does it solve, for whom, and how is success measured?
- Users: who uses it (internal staff, operators, customers), how many, which devices/languages (TH/EN)?
- Deadline and priority: date, MVP vs full, what can be cut first?
- Constraints: budget/allowance, company IT policy, hosting allowed (on-prem, Azure, AWS…), security/compliance (PDPA, ISO, customer data).
- Definition of done and who approves (who signs off, demo needed?).

### A. New project — additionally
- Product shape: web app / mobile / desktop / API / CLI / data pipeline / internal tool?
- Core features for MVP (top 3–5) and explicitly out of scope.
- Tech stack: offer 2–3 stacks fitted to the answers (e.g. Next.js + PostgreSQL, .NET + SQL Server, Python FastAPI + React), with tradeoffs; ask about stacks the team already knows or must use.
- Data: main entities, expected volume, existing databases/systems to integrate (ERP, SAP, AD/Entra ID login, MES, Excel files).
- Auth & roles: who can see/do what; SSO required?
- Architecture structure: monolith vs modular vs services; mono-repo vs multi-repo; folder layout preference.
- Deployment & ops: where it runs, CI/CD, environments (dev/staging/prod), backups, monitoring.
- Quality bar: test coverage expectation, code style/linters, accessibility (see `ux-standard`), documentation language.

### B. Migration — additionally
- Why migrate now: end of support, cost, performance, security, hiring, new features?
- Target state: target stack/platform/version, and what "finished" means (full cutover? parity only? improvements allowed?).
- Scope: which modules first; anything to retire instead of migrate?
- Compatibility: must keep URLs/APIs/DB schema/data formats? Who depends on them?
- Data migration: volume, downtime tolerance, rollback plan, data cleansing needed?
- Strategy preference: big-bang vs incremental (strangler), parallel run?
- Risks known today: undocumented logic, missing tests, people who know the old system.

### C. New feature — additionally
- User story and acceptance criteria; mock-up or example?
- Where it fits in the product; affected users/roles.
- Contract changes allowed (API, DB, config)? Feature flag needed?

### D. Bug fix — additionally
- Steps to reproduce, expected vs actual, since when, how many users affected.
- Logs/screenshots; environment (prod/staging, version).
- Urgency: hotfix now vs proper fix; is a workaround acceptable?

### E. Audit / estimate — additionally
- What decision will the audit support? Areas of concern? Output format (report, slides, checklist)?

## Phase 2 — Brief

Write `<repo root>/.github/team/BRIEF.md`:
engagement type, goal and success metrics, users, scope in/out, constraints, decisions
made (with who chose), assumptions, open questions. Show a short summary and ask the
client to confirm or correct it.

## Phase 3 — Proposal (the pitch)

Write `<repo root>/.github/team/PROPOSAL.md` (use `team-architect` for design on larger
work), in the client's language, then present it in chat as a short summary:

1. **Understanding** — the problem and goal in 3–5 lines (shows we listened).
2. **Options** — 2–3 approaches (stack/architecture/migration strategy), each with pros,
   cons, risk, relative cost (S/M/L) and time; **one recommended** with reasons.
3. **Proposed solution** — architecture sketch (components, data flow, folder structure
   for new projects), key technical decisions.
4. **Plan** — milestones/phases (e.g. M0 setup, M1 MVP, M2 hardening, M3 go-live), each
   with deliverables and how the client will see/verify them (demo, URL, report).
5. **Risks & mitigations**, and what we need from the client (access, data, approvals).
6. **Out of scope**, assumptions.
7. **Decision requested** — exactly what the client must approve to start.

Ask for approval with `a concise conversational question (use any available question UI only when helpful)` (e.g. "Approve recommended option" / "Choose
option B" / "Change scope"). No implementation starts before approval; only after it,
convert milestone 1 into the task graph in `STATE.md`.

## Phase 4 — Delivery reporting and next steps

Every team-mode turn ends with a **"Next steps"** block, like an agency status update:

```
Status: <milestone, % of tasks done, on track / at risk>
Done this round: <items, with evidence>
Recommended next step: <one concrete action and why it is next>
Other options: <1–2 alternatives>
Needs from you: <decisions / access / approvals, or "nothing">
```

At each milestone end: demo or show evidence, list what changed, propose the next
milestone (with any re-estimate), and ask the client to approve before continuing.
At project end: handover summary (how to run, deploy, test; known issues; suggested
roadmap of next improvements).
