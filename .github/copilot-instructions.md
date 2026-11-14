# Universal Codex Team v2 — Copilot repository instructions

This repository follows the Universal Codex Team v2 operating policy from
`universal-codex-team-v2/AGENTS.team.md`.

## Operating rules

- Read the repository instructions, relevant code/tests, and current Git state before changing files.
- For sustained or multi-step work, define a small task DAG with dependencies, owner role, acceptance criteria, risk, and executable verification.
- Use the smallest capable agent and keep parallel work limited to independent tasks with disjoint write paths. Treat shared contracts, migrations, lockfiles, and integration as sequential work.
- Never claim a check passed unless it was actually run. Report exact commands, results, changed files, risks, blockers, and next handoff.
- Ask the user before changing product scope, making breaking contract or major architecture changes, changing security/tenant policy, deleting data, deploying, releasing, or merging.
- Do not force-push, reset destructively, merge, release, or deploy without explicit approval.
- Do not use API keys, external model providers, paid credits, or additional accounts for this workflow.

## Agent routing

Use the repository custom agents for focused work:

- `@team-explorer` for read-only discovery and dependency mapping.
- `@team-architect` for approved architecture, contracts, and task dependencies.
- `@team-implementer` for one narrowly scoped implementation task.
- `@team-qa` for focused tests and quality evidence.
- `@team-reviewer` for independent evidence-based review.
- `@team-integrator` for branch, dependency, CI, and integration readiness.

When a task is small, work directly instead of creating unnecessary parallel work.
