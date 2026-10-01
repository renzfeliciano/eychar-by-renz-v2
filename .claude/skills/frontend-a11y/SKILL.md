---
name: frontend-a11y
description: Accessibility rules for EychAr's React/Next.js UI — form labels and errors, icon buttons, dialogs and focus, keyboard use, live regions, colour and motion. Load when building or reviewing any form, dialog, menu, table, grid or interactive component.
---

# Frontend accessibility (EychAr)

Adapted for this app from ECC's `frontend-a11y` skill (affaan-m/ECC, MIT). Target: WCAG 2.2 AA. HR staff use this all day, often on phones; employees clock in on whatever device they have.

## Forms
- Every input has a visible label tied to it: use `FormField` (`@/components/shared/form-field`) or `<Label htmlFor>` + matching `id`. Placeholders are examples, never the label.
- Required fields: `required` on the input and the `RequiredFieldsHint` once per form; the asterisk is `aria-hidden`.
- Errors: field errors linked with `aria-describedby` + `aria-invalid`; form-level errors use `FormError` (it has `role="alert"`). Say what to fix ("Enter the holiday's name"), not "Invalid".
- Hints (allowed file types, formats) go in text linked with `aria-describedby`.
- Native controls (`<input type="date">`, checkboxes) over custom divs; selects use `@/components/ui/select` / `OptionSelect`.

## Buttons and links
- A clickable thing is a `<button>` (action) or `<Link>` (navigation) — never a `div`/`span` with `onClick`.
- Icon-only buttons need `aria-label` (and usually `title`): `aria-label="Remove Cebu Charter Day"`.
- Disabled while saving, with the spinner and "Saving…" text (screen readers get the text change).

## Dialogs and focus
- Use the app's `Dialog`/`ConfirmDialog` (Base UI): focus trap, Esc, and focus return are built in — don't hand-roll modals.
- Every dialog has a `DialogTitle`; add `DialogDescription` when there's context.
- Set `initialFocus` to the safest primary action in time-critical dialogs (e.g. "Stay signed in").
- Dialogs that must not be dismissed (ended session) disable close explicitly; everything else closes on Esc.

## Grids, tables, calendars
- Real `<table>` with `<caption className="sr-only">`, `<th scope="col|row">` (see the schedule grid).
- Cells that act get a button with a full `aria-label` ("Angela Santos, Monday 5: Day shift 08:00–17:00"), not just "D".
- Selection state uses `aria-pressed`/`aria-selected`; today uses `aria-current="date"`.

## Live updates
- Toasts (sonner) announce themselves. For countdowns or changing values use a polite live region that changes only at milestones (see `countdownAnnouncement` in `idle-session-guard.tsx`) — never announce every second.

## Colour, contrast, motion
- Colour is never the only cue: shifts print their code, holidays print their type, statuses print a word.
- Text contrast ≥ 4.5:1 in light **and** dark mode; muted text only for secondary info.
- Respect `prefers-reduced-motion` for anything beyond a fade (the toast countdown already does).

## Images
- Meaningful images get `alt`; decorative ones `alt=""` and icons `aria-hidden="true"`.

## Checklist
- [ ] Every input labelled; errors linked; required marked.
- [ ] No clickable divs; icon buttons labelled.
- [ ] Keyboard only: can reach, operate and leave everything; visible focus ring.
- [ ] Dialog has a title; focus lands sensibly and returns.
- [ ] Works at 375px and 200% zoom without horizontal scrolling.
- [ ] Light and dark contrast OK.
- [ ] Testing Library queries by role/label (`getByRole("button", { name: … })`) — if a test can't find it by role, a screen reader can't either.
