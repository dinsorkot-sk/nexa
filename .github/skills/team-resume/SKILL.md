---
name: team-resume
description: Resume an existing GitHub Copilot engineering team task graph from .github/team/STATE.md and continue the next permitted task.
argument-hint: "<goal or optional context>"
disable-model-invocation: true
---


# Resume team

1. Read `.github/team/TEAM.md`, `.github/team/INTAKE.md` and `.github/team/STATE.md`. If the state file is missing, say so and suggest `/team <goal>`.
2. Read `.github/team/BRIEF.md` and `PROPOSAL.md` if present; preserve prior approvals and any unresolved founder gate.
3. Check current repository state with actual read-only git commands (branch, worktrees, status, recent commits) before trusting the checkpoint; reconcile mismatches explicitly.
4. If `WAITING_BUDGET`, ask for current Copilot premium usage or permission to proceed conservatively. If `WAITING_FOUNDER`, restate the precise decision; do not bypass it.
5. Continue the next executable approved task, delegate only as supported and useful, run verification and update the checkpoint.
6. Report results, blockers, allowance if known, and INTAKE.md `Next steps`. Additional user text after `/team-resume` is supplementary guidance.
