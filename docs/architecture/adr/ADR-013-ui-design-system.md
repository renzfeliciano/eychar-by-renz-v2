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
