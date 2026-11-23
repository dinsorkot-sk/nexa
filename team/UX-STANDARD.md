# User experience checklist

Use this checklist for changes users can see or interact with. Follow the repository's
design system and accessibility requirements when they are stricter. Prefer existing
components and established product language over new patterns.

## Design and behavior

- Make the current location and the main next action clear. Use labels that describe the
  result; keep navigation and repeated actions consistent.
- Design loading, empty, error, partial/offline, success, and permission-denied states.
  Explain delays and failures, and give users a useful next action.
- For forms, provide visible labels, suitable input types, understandable validation,
  retained input after errors, and clear submit progress.
- Write concise, plain-language messages. Use the project's localization, date, number,
  and currency conventions.
- Confirm destructive actions or provide a practical undo.

## Accessibility and responsive layout

- Use semantic controls and meaningful accessible names. Ensure keyboard operation,
  logical focus order, and a visible focus indicator.
- Do not communicate meaning by color alone. Follow the project's contrast standard;
  target WCAG 2.2 AA when the project defines no stricter baseline.
- Provide useful image alternatives, respect reduced-motion preferences, and avoid
  keyboard traps.
- Support narrow screens and zoom without lost content or unnecessary horizontal
  scrolling. Support dark mode when the product offers it.
- For internal tools, make dense data scannable and controls practical for the actual
  devices and work environment.

## Role checks

| Role | Check |
|---|---|
| Architect | Include key user journeys, states, accessibility concerns, and unresolved UX decisions in the design. |
| Implementer | Implement expected states and reuse the product's components and localization patterns. |
| QA | Test relevant interaction, validation, keyboard, and accessibility paths with available project tooling. |
| Reviewer | Report concrete usability or accessibility regressions with affected files and impact. |
| Integrator | Include UX verification or explicitly explain why it does not apply. |

For a user-facing task, report: `UX check: states, forms/errors, copy/localization,
accessibility, responsive layout, reused components`. List unmet items with reasons.
For backend-only or otherwise non-user-facing tasks, report `UX: n/a` with a brief
reason.
