# ADR-048: Navy ledger design, and a loading state for every page

## Status

Accepted (October 2026). Supersedes the visual parts of ADR-013 and `design-system/workforcehub/MASTER.md`'s
glassmorphism brief.

## Context

The app looked like a stock template: the default bright blue and Geist, every number in its own
card with a tinted icon tile and an uppercase label, a gradient hero on the dashboard, seven
dashboard cards each with its own colored top edge. Nothing in it came from the product or the
brand, and the PCAS mark (deep navy, #123262) clashed with the bright blue around it.

Loading was uneven. Only six routes had a `loading.tsx`; every other page showed one generic
skeleton (header, four figures, a table) whatever its shape: the schedule grid, the calendar, the
org chart canvas and the forms all "loaded" as a table. Filters, sorting, paging, the date and
month pickers and profile tabs gave no feedback at all, because Next keeps the old page on screen
for same-page navigations. The sign-in button flipped back to "Sign in" before the dashboard
opened, and stayed stuck on "Signing in…" if the request threw.

## Decision

**Look: the navy ledger.**
- Brand color is the logo's navy (`--primary: oklch(0.335 0.095 260)`), used for primary actions,
  selection and state only. Surfaces are warm paper (`#faf8f4` page, near-white cards), separated
  by hairline rules (`border`, and the lighter `--rule` inside tables and lists) more than shadows.
  Dark mode is navy ink, not neutral black.
- One family, IBM Plex Sans (400–700), with tabular figures for tables, totals and dates.
- Radius 0.5rem. Shadows are faint and neutral (`--shadow-soft` is a 1px line).
- Figures sit in a `MetricStrip`: one ruled frame with hairlines between cells, no icon tiles.
- Status is a colored dot plus the word in ink (`StatusBadge`, `PayrollStatusBadge`); only negative
  states color the word.
- No uppercase micro-labels, eyebrows, gradients, glow blobs or colored top/left card edges.
- Page headers end with a hairline rule. Tabs are underlined, no icons. Status filters are a
  segmented control with the chosen one filled in navy.
- The dashboard is one set of identical ruled panels in two columns (work on the left, the day and
  month on the right); "Coming up" reads as a dated ledger.

**Loading.**
- Every route has its own `loading.tsx`, assembled from `src/components/shared/skeletons.tsx`
  in the same order as the page (header, strip, filters, table; or calendar, schedule grid,
  kanban, canvas, form, document). `PageLoader` wraps them, announces one status line and runs
  the top progress bar.
- Same-page navigations (query-string changes) run through `PendingNavigationRegion` in the
  workspace layout: plain links inside it are picked up automatically, and code that navigates
  itself uses `usePendingNavigation().push`. While pending, the content dims and the top bar runs.
- Client-fetched lists inside dialogs show skeleton rows, not a spinner line.

**Sign-in.** The button stays disabled on "Signing in…" from the click until the dashboard
replaces the page. It comes back only when the sign-in stops: wrong password, locked account,
rate limit, a server error (`ok: false`) or a network failure (thrown), each with its own message.

## Consequences

- New pages add a `loading.tsx` built from the skeleton pieces; new screens use `MetricStrip`,
  `StatusBadge` and the tokens above rather than palette colors (categorical palettes chosen by
  users, such as shift and chart-group colors, stay).
- Navigations made in code inside the workspace should use `usePendingNavigation().push`.
