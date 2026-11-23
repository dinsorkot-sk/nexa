# Cross-agent team workflow

This workflow is shared by Claude Code, Codex, GitHub Copilot agents, and OpenCode.
Use it only when the user invokes the team workflow or asks for multi-agent work.
Handle small, clear tasks directly.

## Authority and responsibilities

- Read and follow the repository's instructions and relevant project documentation first.
  Repository instructions and the user's request take precedence over this workflow.
- The primary session owns the goal, task boundaries, integration, and final verification.
- Delegate only work that benefits from a separate context and only when the host supports
  the required agent capability. Never claim an agent ran if it did not.
- Use at most three concurrent agents unless the user or repository explicitly requires a
  different limit. Avoid parallel writes to overlapping files, migrations, generated
  outputs, shared contracts, or lockfiles.
- Give each worker a clear outcome, acceptance criteria, writable scope, known context,
  and required verification. Stop and report if the task cannot be completed within scope.
- Treat agent reports as claims. The primary session verifies the integrated result.

## Roles

| Role | Responsibility | Write access |
|---|---|---|
| `team-explorer` | Locate relevant code, tests, interfaces, and conflicts. | No |
| `team-architect` | Design a bounded approach and dependency-aware task breakdown. | No |
| `team-implementer` | Implement one assigned task and focused tests. | Assigned files only |
| `team-qa` | Plan and run focused tests; add tests when assigned. | Test files only |
| `team-reviewer` | Independently inspect a change for concrete regressions. | No |
| `team-integrator` | Integrate completed work and verify the combined result. | No direct edits |

Use the closest available host role when a listed role is unavailable. The orchestrator
may perform a role directly rather than creating a redundant agent.

## Model selection and weekly usage

- Each provider chooses only among the models available in its own environment:
  Claude uses Claude models, Codex uses models available to Codex, and OpenCode uses
  models configured for that OpenCode installation. Do not prescribe or assume model
  names from another provider.
- Choose the least costly model that can reliably complete the task. Prefer lightweight
  models for simple lookups, routine edits, and test triage; use more capable models for
  complex implementation, high-risk review, or difficult reasoning when justified.
- Keep small tasks in the primary session when delegation would add overhead. Delegate
  only when separate context or parallel execution has a clear benefit, and use the
  minimum number of agents needed.
- Check the provider's usage information when it is available. Do not guess or claim
  weekly remaining limits when they cannot be verified. Avoid unnecessary parallel runs
  and repeated broad scans; reserve available usage for integration and verification.
- If usage is near its weekly limit or cannot be verified and the requested work is
  substantial, prioritize essential work and tell the user about the uncertainty or
  constraint rather than switching providers or assuming extra allowance.

## Workflow

1. **Understand.** Read project instructions, inspect the relevant code and tests, and
   classify the goal as a feature, bug fix, migration, audit, or new project. Ask only
   questions that block a correct or safe implementation; record other assumptions.
2. **Plan.** For multi-step work, record bounded tasks, dependencies, owners, file scopes,
   risks, and verification in `team/STATE.md`, starting from `team/STATE.template.md`.
   Keep small changes in the conversation instead of creating unnecessary state files.
3. **Execute.** Work in dependency order. Parallelize only independent tasks with
   non-overlapping write scopes. Respect project approval gates and never push, merge,
   publish, or deploy without the required approval.
4. **Verify.** Run the smallest relevant checks, then broader checks when the change or
   repository requires them. Review risky or cross-cutting changes independently when
   review capability is available. Report missing checks and failures explicitly.
5. **Checkpoint and report.** Update team state after meaningful batches. Report what
   changed, evidence from checks, pending work and blockers, and one recommended next step.
   Resume from `team/STATE.md`, not conversation memory alone.

For commit co-author trailers, follow the repository's `AGENTS.md`: use only the product
name `Claude`, `Codex`, or `OpenCode`, never a model name or version.

For user-facing changes, also apply `team/UX-STANDARD.md`; include its UX check in the
implementation, QA, review, and integration results. Mark UX as not applicable for
changes with no user-facing impact.

## Safe handling

- Never put credentials, personal data, or sensitive production data in prompts or team
  state. Do not copy secrets into the repository.
- Do not silently relax tests, permissions, validation, or project rules to make a task
  appear complete.
- Stop for user approval before destructive or irreversible actions, major scope or
  architecture changes, breaking public contracts, added spending, or production changes.
- Keep generated files, dependencies, and unrelated changes out of scope.

## Host entry points

- Claude Code: `/team`, `/team-resume`, `/team-status`
- Codex: invoke the `team-workflow` skill (for example, `$team-workflow`)
- GitHub Copilot: run the `team`, `team-resume`, or `team-status` prompt
- OpenCode: `/team`, `/team-resume`, `/team-status`

Each entry point loads this agreement and the matching instructions in `team/`.
