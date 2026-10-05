---
name: ui-standards
description: EychAr's house UI rules for the authenticated HR app — dialogs, mutation feedback, toasts, confirmations, permission-aware actions, responsive/mobile behaviour and copy. Load before building or changing any screen, form, dialog, table or toast. Design taste comes from impeccable/emil-design-eng; this skill is the app's concrete conventions.
---

# UI standards (EychAr)

Precedence: these conventions + `.claude/skills/THIRD_PARTY_SKILLS.md` (impeccable "Operate" mode and emil-design-eng for the HR app; taste-skill for the login page only).

## Dialogs (`@/components/ui/dialog`)
- Structure every dialog as `DialogHeader` → body → `DialogFooter`. `DialogContent` keeps header and footer fixed and scrolls only the body — **don't** add `max-h`/`overflow-y-auto` to `DialogContent` or forms inside it.
- A custom header/footer component must declare `MyHeader.dialogSlot = "header"` (or `"footer"`) so it stays fixed.
- Confirmations use `ConfirmDialog` (`@/components/shared/confirm-dialog`): title as a question ("Clear 2 days?"), description says what happens and what doesn't, explicit verb on the button ("Clear", "Remove"), never "OK".
- Render `FormError` only when there's an error (`{error && <FormError …/>}`) so dialogs don't get empty bands.
- Footer actions: primary on the right with a present-participle loading label ("Saving…"); secondary is `variant="ghost"` or `"outline"`.

## Look (ADR-048, the navy ledger)
- Tokens only (`primary`, `muted-foreground`, `border`, `rule`, `success`/`warning`/`destructive`): no Tailwind palette colors except user-chosen categorical ones (shift colors, chart groups).
- Figures go in `MetricStrip` + `MetricCard` (no icons). Status is `StatusBadge` (dot + word). No uppercase micro-labels, eyebrows, gradients, tinted icon tiles or colored card edges.

## Loading
- Every route has its own `loading.tsx` built from `@/components/shared/skeletons` inside `PageLoader`, in the page's own order and shape.
- Code that navigates on the same page (filters, pickers) uses `usePendingNavigation().push`; links inside the workspace are handled by `PendingNavigationRegion` automatically.
- Lists fetched inside a dialog show skeleton rows (`Bone`), not a spinner line.

## Mutation feedback (enforced by `tests/standards/mutation-feedback.test.ts`)
- Every POST/PATCH/PUT/DELETE shows a spinner (`Loader2 … animate-spin`) with present-participle text while running, and ends with `toast.success(...)` or an inline error / `toast.error(...)`.
- Toast titles are short past-tense facts ("Added Cebu Charter Day"); add a description only when it tells something new. Reversible actions offer `action: { label: "Undo", onClick }` (see `HideToggle`).
- After a successful change call `router.refresh()` so server data reloads.

## Permissions in the UI
- Hide actions the user can't perform (pass `canUpdate`/`canHide` from the server page using `hasPermission`/`isSuperAdmin`). This is usability only — the server checks again.
- Super Admin test-data hiding uses `HideToggle`; hidden records show the "Hidden" badge.

## Responsive
- Mobile-first. Check 375px (phone), 768–1024px (tablet) and desktop.
- Toolbars `flex-wrap`; long labels get a short phone variant (`<span className="min-[420px]:hidden">…</span>`).
- Text in grids/cells: `min-w-0` + `truncate` on the flex child, `w-full overflow-hidden` on the chip; drop secondary info (times, codes) at narrow widths instead of overflowing.
- Wide tables/grids scroll inside their own frame (`overflow-x-auto`), never the page.
- Footers/headers inside flex columns with `overflow-hidden` need `shrink-0`.

## Copy
- Plain, specific sentences; say what happens next. No "Something went wrong" without the reason. No exclamation marks, no blame.
- Never alarm without cause (e.g. a signed-out session is "This session was signed out", not "someone accessed your account").

## Accessibility
- Follow the `frontend-a11y` skill: labels for every input, `aria-label` on icon-only buttons, keyboard reachable, colour never the only cue (print the code/label too).

## Checks before done
- UI test in `tests/app/` for new interactive components; light and dark mode look right; no horizontal page scroll on phone.
