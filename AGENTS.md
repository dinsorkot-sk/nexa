# Team workflow

The primary agent owns the full software development lifecycle for each request. It clarifies material ambiguities, plans work in proportion to its scope, implements the change, runs relevant checks, and reports the outcome and any remaining limitations.

## Sequential and parallel work

The primary agent may delegate scoped implementation, investigation, and verification to subagents. It chooses the execution order based on dependencies and owns integration and final verification.

- Sequential: run dependent steps in order. Pass the relevant decisions, artifacts, and test results to the next agent. Review the integrated change after implementation and run re-review after any fixes that require it.
- Parallel: delegate independent work when it reduces elapsed time or provides independent evidence. Give each agent a clear deliverable and file scope. Assign overlapping edits to a single agent or run them sequentially. Collect the results before starting dependent work and rerun integration checks after combining changes.
- Use both modes when helpful. Independent investigations can run in parallel, followed by sequential implementation and review.

## Model selection and usage

Keep the primary agent on the session's selected model. When spawning a subagent, select a model the current client exposes and honor explicit user choices.

- Use a lighter model such as GPT-6 Luna for narrow exploration, straightforward edits, or test triage if available. Use GPT-6.1 Terra for visual inspection when the client exposes it.
- Use GPT-6.2 Sol for implementation or review that needs deeper reasoning, and use GPT-6.2 Astra when the complexity or risk justifies it. If a named model is unavailable, choose the closest available model for the task.
- Keep small tasks with the primary agent when delegation would duplicate context. Give subagents only the context they need and use the lowest reasoning effort appropriate for the work. Keep the required review even when conserving usage.
- Use the client's usage information when available. Model selection and parallelism can affect consumption, but do not assume models have separate weekly limits.

## When to delegate review

The primary agent assesses the impact of each task. Before delivery, spawn a reviewer subagent for high-risk changes or changes spanning multiple parts of the system. Consider the behavior affected, dependencies between components, and the consequences of failure. Changes to access controls, persistent data, public contracts, or deployment behavior can warrant review. Routine localized changes can proceed with the primary agent's own verification.

## Review and follow-up

Give the reviewer the task intent, the relevant diff or commit, and the checks already run. The reviewer inspects the change and reports actionable findings with their impact and file locations. The primary agent owns edits.

If review finds a problem affecting functionality, security, or data correctness, the primary agent fixes it, runs the relevant checks, and asks the reviewer to verify the revised change before delivery. Repeat when verification uncovers further issues of that kind. If required review or re-review is unavailable, report it as pending and leave the task open.

## Git and release actions

The primary agent may edit files, run checks, and create local commits within the task scope. Obtain explicit user approval before pushing, opening a pull request, merging remotely, or deploying.
