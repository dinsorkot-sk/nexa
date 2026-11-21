---
name: team-status
description: Report GitHub Copilot engineering team progress, evidence, blockers and next step from .github/team/STATE.md without changing code.
disable-model-invocation: true
---


# Team status (read-only)

Do **not** edit code, create tasks, run a writing subagent or change task state.

1. Read `.github/team/TEAM.md`, `.github/team/STATE.md`, plus `BRIEF.md` and `PROPOSAL.md` if present.
2. Read-only validate branch, git status and recent commits; state any mismatch or stale state.
3. Report the goal, completed tasks and their evidence, in-progress tasks, blocked tasks, founder gates, current next executable step and allowance (from user/Copilot UI or `unverified`).
4. Finish with INTAKE.md `Next steps`. If state is absent, explain and suggest `/team <goal>`.
