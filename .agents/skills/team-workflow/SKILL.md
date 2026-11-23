---
name: team-workflow
description: Coordinate substantial repository work across available agents; use for multi-step features, migrations, audits, or explicit team orchestration, not routine small changes.
---

# Team workflow

Read `team/TEAM.md`, `team/INTAKE.md`, and repository instructions before planning.
Follow the shared workflow in `team/TEAM.md`; the repository instructions and user's
request take precedence.

For user-facing changes, read and apply `team/UX-STANDARD.md`.

Classify the goal, inspect existing code and tests, and ask only questions that block safe
or correct work. Keep simple tasks direct. For multi-step tasks, maintain
`team/STATE.md` using `team/STATE.template.md`, with bounded tasks, dependencies, file
scopes, and verification. Delegate only when Codex exposes a useful subagent capability;
map tasks to the closest available role and do not claim unavailable agents ran.

Do not exceed three concurrent agents, overlap parallel write scopes, or bypass required
user approval. Verify integrated changes and report observed results, blockers, and one
recommended next step.
