# ADR-013: UI design system (shadcn/ui) and shared components

## Status

Accepted

## Context

Phases 1–2 used bare Tailwind utility classes with ad-hoc inline `style={{ color: "var(--x)" }}`
CSS custom properties per page — no shared component layer, so every list page repeated its own
`<table>` markup and every form repeated its own `<input>`/`<select>`/`<button>` styling. AGENTS.md
§41 requires a mobile-first UI and says to "use the existing design system if the repository
already has one" — at this point there wasn't one yet, just per-page improvisation.

## Decision

Adopted **shadcn/ui** (Base UI primitives + Tailwind, components copied into the repo rather than
an opaque npm dependency) as the component foundation, with a real color palette (a blue
`--primary` over shadcn's neutral scale, both light and dark variants) replacing the earlier
bespoke tokens.

On top of the copied `src/components/ui/*` primitives, a small shared layer in
`src/components/shared/` is used by every page instead of each page inventing its own markup:

- `PageHeader` — title/description/action-slot header, used on every page.
- `DataTable` — generic column-config wrapper over the shadcn `Table` primitives.
- `StatusBadge` — status → color mapping (active/on_leave/inactive/terminated).
- `FormField` / `FormError` — label+control pairing and error display.
- `OptionSelect` — an optional-FK dropdown with a "None" choice; Base UI's `Select` (like
  Radix's) rejects an empty-string item value, so this centralizes that sentinel-value handling
  once instead of in every form (units/positions/projects/hire/transfer all need it).
- `AppShell` / `NavLinks` — the persistent sidebar + topbar chrome, wrapping every authenticated
  route via `src/app/(app)/layout.tsx`; a mobile drawer (shadcn `Sheet`) covers the same nav below
  the `md` breakpoint (AGENTS.md §41's mobile-first requirement).

Routes were reorganized into an `(app)` route group (`dashboard`, `organization/*`, `people/*`)
sharing that one layout, while `(auth)/login` stays outside it as a plain centered card. This is
a filesystem change only — URLs are unchanged, since Next.js route groups don't add a path
segment.

## Consequences

- `src/app/_shared/{get-current-organization,has-permission}.ts` (session/permission helpers used
  by every page) had to move from `organization/_shared/` to a location outside the new `(app)`
  group's own directory nesting, and every import switched from a relative path to the `@/`
  alias — relative imports into a shared helper are fragile once route groups add filesystem
  depth without changing the URL; the alias isn't.
- `OptionSelect`'s selected-label text is computed from the component's own React state rather
  than Base UI's built-in `SelectValue` label resolution, which only resolves once the dropdown's
  items have been mounted at least once — before that it rendered the raw sentinel value
  (`__none__`) instead of "None" on first paint. Computing it locally sidesteps that lazy-mount
  timing entirely.
- Every Phase 2/3 list and form was rewritten against this shared layer in the same pass, so
  there is no lingering "old style" page for a future contributor to accidentally copy from.

## Addendum (2026-09-27): visual direction follows the vendored design skills

The user asked that the newly vendored design skills (`emil-design-eng`, `impeccable`,
`taste-skill` — see `.claude/skills/THIRD_PARTY_SKILLS.md`) govern the look, superseding the
earlier "glassmorphism + soft gradients" brief. Concretely:

- **Color is restrained.** One brand blue (`--primary`) for primary actions, selection and state.
  The blue→violet `--gradient-brand` and the brand-colored `--shadow-glow` halo were removed; icon
  chips, avatars and count pills use flat tints (`bg-primary/10`), not gradients.
- **Depth is neutral.** `--shadow-soft` / `--shadow-raised` / `--shadow-modal` are offset neutral
  shadows only.
- **Glass only where it does a job:** the sticky top bars (content scrolls beneath them) and
  elements sitting over the login photo. Dialogs use a plain dim scrim like the Sheet.
- **Headings carry themselves:** no accent bar beside page titles, no gradient banner on the
  dashboard (it opens with a normal `PageHeader`).
- **Motion** uses emil's curves as the app-wide Tailwind easing (`ease-out`, `ease-in-out`,
  `ease-drawer`, and the default for every `transition-*`), explicit transition properties (never
  `transition-all`), a `scale(0.97)` press on buttons, and gentler (fade-only) enter/exit under
  `prefers-reduced-motion`.

**Login (2026-09-28).** The photo carousel now fills the whole screen at every size. On desktop, the
brand story sits bottom-left on the photo and the sign-in form sits in a frosted panel floating on
the right. On phones, the same form rises from the bottom as a solid sheet. The carousel has
clickable progress segments that fill over each photo's turn (static under reduced motion). The
password field warns when Caps Lock is on. The feature-chip row was removed: the headline carries
the message on its own.

**Enterprise pass (2026-09-28).** The user asked for every screen, from the dashboard through
roles, to look enterprise-grade. The shared pieces every page now uses:

- `MetricCard`: a summary strip. Its tone marks meaning: primary for the headline figure,
  warning/danger for to-dos, never color alone.
- `StatusBadge`: one status language, a dot plus the word. It has tones for waiting (amber), done
  (green), blocked (red), in progress (blue) and neutral, with an optional label.
- `DataTable`: uppercase column headers, and empty states that explain what to do next and offer
  the action that fills the table.
- `StatusFilterTabs`: status pills with counts.
- `Breadcrumbs`: in the top bar, e.g. "Payroll › Runs › Details".
- Nested-route nav highlighting: the longest matching nav item wins.
- `AccountMenu`: name, @username, organization and role badges.
- `PageHeader`: its actions wrap below the title instead of squeezing it.

Screen by screen:

- **Organization pages:** summary strips, plus headcount per unit, position, location and project
  from one shared `loadHeadcount()`.
- **People:** new hires, contracts ending, and incomplete government IDs.
- **Employee profiles:** a summary header.
- **Daily roster:** the day's present, late, absent, on-leave and not-recorded counts.
- **Leave balances:** one row per employee, leave types as columns, and a detail side panel. This
  was the user's explicit request.
- **Settings:** a sticky catalog index; per-role member and permission counts on Roles & access.
- **Dashboard:** opens with a greeting and the date, then:
  - four linked headline cards: headcount, at work today, on leave today, next pay date;
  - a "Needs attention" queue, most urgent first, where each row opens the screen that resolves
    it: payroll to release or approve, leave to decide, payroll drafts, contracts ending, staff
    without pay terms, incomplete government IDs, open cases;
  - a "Today" panel with the attendance split and who is away;
  - Workforce charts, including deployment by project;
  - People & calendar: recent hires, birthdays, upcoming events.

  Each dashboard widget is read only when the user may see that module. The queue rules live in
  `src/domains/dashboard/dashboard-summary.ts` and are unit tested. `MetricCard` takes an `href`,
  which makes the whole card a link.
- **Application tracking:** a search, position filter and Board/List view switch. Cards are
  compact, show how long ago the person applied (over 30 days in an open stage is flagged), and
  have a Move menu. A side panel shows the details, with a stage track that moves the applicant
  when clicked. Hired and Rejected columns look distinct. Moves update at once and roll back if
  the server refuses.
- **Case monitoring:**
  - status tabs;
  - open cases by classification and by project;
  - a "Needs follow-up" count for open cases with no update in 90 days;
  - a "Last updated" column;
  - a side panel with the full brief history.

  The open/closed rule lives in `domains/cases/case-summary.ts`, shared with the dashboard.
- **Company calendar:**
  - next event, next 7 days, and this month's count;
  - a toolbar with Today, month arrows and New event (the event form now has its own date);
  - whole weeks including the neighbouring months' days, with weekends shaded;
  - chips with a category dot, and dots only on phones;
  - a "Coming up" agenda and a category legend.
- **Travel orders:** timing tabs (ongoing, upcoming, completed, cancelled) and a two-week timeline,
  one bar per trip, so who is away when is visible at a glance.
- **Organizational chart:**
  - people, levels, largest team, and a "no manager set" warning;
  - a one-row filter toolbar that shows the active filter count and has Clear;
  - a canvas on a dot grid that can be dragged to pan, with zoom, reset and expand/collapse all;
  - a Chart/List switch.

  Cards show a unit-colored top edge, the title and the direct-report count, with a fold toggle
  per team. Charts over 40 people open with two levels unfolded. A side panel shows the person's
  manager chain and direct reports. The logic lives in `domains/workforce/org-chart-summary.ts`.
- **Account & settings (ADR-030):** a Security page per person, and Settings › Accounts and
  Settings › Audit log, built to the same pattern (summary strip, tabs or filters, table, side
  panel).
- **Login (second pass):** the sign-in card is content-height, with a branded header band (a blue
  top edge, a faint tint and a dot texture), a "Trouble signing in?" help, and a footer stating
  the session rules. The "01 / 06" counter was removed; the progress segments already show the
  position.
- **Everywhere:**
  - buttons, links and interactive roles show the hand cursor, and disabled controls show
    not-allowed (one base rule in `globals.css`);
  - four-card summary strips stay 2×2 until extra-large screens, so labels aren't cut off;
  - card hints wrap to two lines.
