# GitHub Copilot project instructions

- Follow the repository's existing conventions, ADRs, test commands, security policy and developer instructions; do not invent commands or project rules.
- For small requests, work directly without spawning a team or writing a large plan.
- **Team mode is opt-in** via `/team`, `/team-resume`, `/team-status`, choosing `team-lead`, or an explicit request to orchestrate multiple agents. In team mode read `.github/team/TEAM.md` and `.github/team/INTAKE.md`.
- In team mode, persist tasks in `.github/team/STATE.md`, not user home or chat memory. Do not overwrite or erase unfinished state without permission.
- For UI, copy, forms, CLI UX or other user-facing behavior, consult `.github/skills/ux-standard/SKILL.md` and the project's design system.
- Use GitHub Copilot with the signed-in user's entitlement; do not require Anthropic API keys, a paid third-party provider or extra billing. Never guess quota or remaining requests.
- Never push, deploy, merge, publish, delete data or introduce a paid service without explicit approval.
