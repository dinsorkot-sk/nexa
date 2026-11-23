# Team intake

Use this before planning team-mode work. Read the repository first; do not ask for facts
already available in its code, docs, or configuration.

## Classify

Choose the closest type: new project, migration, feature, bug fix/incident, or audit.

## Clarify only blockers

Ask concise questions when missing information would change scope, compatibility, safety,
or the definition of done. For a bug, establish expected and actual behavior. For a
feature, establish the user outcome and acceptance criteria. For a migration or new
project, confirm the target and constraints. For an audit, confirm the decision the
findings should support.

Do not require a proposal or approval for routine, reversible implementation details.
Pause for decisions involving major scope or architecture changes, breaking contracts,
destructive operations, significant security or data-policy changes, added spending,
production deployment, or a repository-defined approval gate.

## Brief for multi-step work

When useful, capture the goal, success criteria, in/out of scope, constraints, decisions,
assumptions, and unresolved questions in `team/BRIEF.md`. Keep it concise and update it
when the user changes direction.

## Delivery update

For team-mode work, report:

```text
Status:
Done (with verification):
Pending / blocked:
Recommended next step:
Needs from you:
```

Use the user's language. For ordinary one-step tasks, a concise completion summary is
enough.
