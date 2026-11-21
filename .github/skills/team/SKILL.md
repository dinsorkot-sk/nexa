---
name: team
description: Start an opt-in engineering team to plan and execute a project goal with intake, proposal, delegation, testing and saved state. Invoke /team with the goal.
argument-hint: "<goal or optional context>"
disable-model-invocation: true
---


# Start team engagement

The text after `/team` is the user's project goal; if absent, ask for the goal once.

1. Read `.github/team/TEAM.md` and `.github/team/INTAKE.md`. Adopt the `team-lead` workflow; if switching custom agent is not possible, the current capable agent acts as coordinator.
2. Inspect repository instructions, README, code, tests, current git branch and `.github/team/STATE.md` if any. Avoid questions already answered.
3. If unfinished state exists, summarize and ask whether to resume or change the goal before overwriting it.
4. Follow intake phases 0–3: write `.github/team/BRIEF.md` and `.github/team/PROPOSAL.md` for substantial goals, offer options and wait for explicit project approval before coding. For a tiny bug fix, use the brief intake route allowed by the agreement.
5. After approval, copy `.github/team/STATE.template.md` to `.github/team/STATE.md`, fill the first milestone task graph and continue under the agreement.
6. Delegate specialists only when useful and supported; if no delegation tool is present, continue with the main agent. Check real tests and checkpoint state.
7. End with the INTAKE.md `Next steps` block. For usage say `unverified` unless the current Copilot UI or user supplied evidence.
