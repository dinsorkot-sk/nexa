---
name: ux-standard
user-invocable: false
description: Team UX standard for any user-facing change (web, mobile, desktop, CLI output, error messages, emails). Use when designing, implementing, testing or reviewing UI, copy, forms, flows or accessibility. Team agents must apply it to every user-facing task.
---

# UX Standard

Apply this to every change a user can see or touch. Project design systems and brand
guidelines win where they are stricter; never invent a design token or component that the
project does not have — reuse existing components first.

## 1. Clarity and flow
- One primary action per screen or dialog; make it visually dominant.
- Labels say what happens ("Save changes", not "OK"). Use the user's language, not internal terms.
- Keep a consistent pattern for the same job everywhere (navigation, buttons, dates, units).
- Show where the user is (title, breadcrumb, selected nav) and how to go back.
- Destructive or irreversible actions need confirmation naming the object, or an undo.

## 2. Every state is designed
For each view or component, handle: **loading, empty, error, partial/slow, success, no permission, offline**.
- Loading over ~300 ms shows a skeleton or spinner; over ~2 s explain what is happening.
- Empty states explain why it is empty and offer the next action.
- Never leave a blank screen or a silent failure.

## 3. Forms and input
- Visible label for every field (placeholder is not a label). Mark required or optional consistently.
- Validate on blur/submit, not on every keystroke; keep the user's input after an error.
- Error messages: what went wrong + how to fix, next to the field, and summarized at top for long forms.
- Use the right input type (email, number, date, tel) and sensible defaults.
- Disable double submit; show progress on submit.

## 4. Messages and copy
- Errors: plain language, no stack traces or codes alone; say what the user can do next.
- Support Thai and English if the project is bilingual; never hard-code UI strings where the project uses i18n.
- Dates, numbers and currency formatted for the user's locale.

## 5. Accessibility (WCAG 2.2 AA minimum)
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI components). Never convey meaning by color alone.
- Everything works by keyboard; visible focus indicator; logical tab order; no keyboard traps.
- Semantic elements first (button, a, label, headings in order); ARIA only when needed.
- Images have meaningful alt text (or empty alt if decorative); icons-only buttons have accessible names.
- Touch targets ≥ 24×24 px (aim 44×44 on mobile).
- Respect `prefers-reduced-motion`; no auto-playing motion that cannot be paused.

## 6. Responsive and performance
- Works from 320 px width up; no horizontal page scroll; content reflows at 200% zoom.
- Supports light and dark mode if the project does.
- Perceived speed: optimistic updates where safe, no layout shift when content loads.

## 7. Industrial / internal tools (when applicable)
- Data-dense screens: sortable/filterable tables, sticky headers, clear units.
- Operators may use gloves, touchscreens or shared PCs: large targets, high contrast, clear status colors with text labels.
- Show data freshness ("updated 10:42") and who/what changed it when it matters.

## How each team role applies this

| Role | Duty |
|---|---|
| architect | List user-facing states and flows in the design; flag UX decisions needing the Founder. |
| implementer | Build all states in §2, meet §3–§6; report any item not met and why. |
| qa | Add tests for states, keyboard path, form errors; run a11y checks the project has (axe, Lighthouse, Playwright a11y) and report real output. |
| reviewer | Check the diff against this list; UX/a11y violations are findings (a11y failures = major). |
| integrator | Confirm UX checks passed before marking ready for approval. |

## Output checklist (paste into task result)

```
UX check: [ ] states  [ ] forms/errors  [ ] copy/i18n  [ ] a11y AA  [ ] responsive  [ ] reused components
Not met / waived: <item — reason>
```
Not applicable to non-user-facing tasks (pure backend, infra): write "UX: n/a — no user-facing change".
