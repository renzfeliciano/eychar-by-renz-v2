# UI patterns and building blocks (Phase 5)

**Built from commit:** `6587050` (main). **Last verified:** `6587050`.
**Sources of truth:** `ARCHITECTURE.md` "UI standards" (line ~590), `docs/ENGINEERING.md` §23 (UI authorization), §41 (mobile-first), §47-§50 (type safety, errors, observability, code quality), `docs/architecture/adr/ADR-013-ui-design-system.md`, `ADR-048-navy-ledger-design-and-loading-states.md`, `ADR-050-animated-brand-loader.md`, `ADR-046-org-chart-as-a-drawn-canvas.md`.
Code wins over docs. Cited paths are relative to the repo root.

## 1. Route structure

**Route groups** (`src/app/`):

| Group | Contents | Layout |
|---|---|---|
| `(app)/` | Authenticated HR shell: 44 `page.tsx` routes (dashboard, people, organization, attendance, leave, payroll, performance, cases, clearance, settings, ...) | `src/app/(app)/layout.tsx` |
| `(auth)/` | login, change-password, set-up-two-step | `src/app/(auth)/` |
| `(self-service)/` | clock-in/out portal | `src/app/(self-service)/layout.tsx` (renders `SelfServiceHeader`) |
| root | `layout.tsx` (fonts, `Providers`, `Toaster`), `error.tsx`, `global-error.tsx`, `not-found.tsx` | `src/app/layout.tsx` |

**Shell.** `(app)/layout.tsx` checks the session, redirects (`/change-password`, `/clock`, `/set-up-two-step`), loads the account, and renders `WorkspaceLayout` with `ConcurrentSessionGuard` and `IdleSessionGuard`. It sets `robots: noindex` in its metadata. `WorkspaceLayout` (`src/components/shared/workspace-layout.tsx`, 207 lines) is the sidebar + top bar: `h-dvh` root (line 68), a scrolling `<main>` with `env(safe-area-inset-bottom)` padding (line 195), the nav, `Breadcrumbs`, `AccountMenu`, `ThemeToggle`, and `PendingNavigationRegion`. Heights use `dvh`; `h-screen` does not occur under `src/`.

**loading.tsx.** Every one of the 44 `(app)` pages has a sibling `loading.tsx` (checked by listing `page.tsx` against `loading.tsx`; plus the group-level `src/app/(app)/loading.tsx`). Each returns `<PageLoader />` or a variant such as `<PageLoader variant="detail" />` (`src/components/shared/page-loader.tsx:20`). Per ADR-048 (Decision → Loading), the skeleton should follow the page's shape, using pieces from `src/components/shared/skeletons.tsx` (e.g. `src/app/(app)/events/loading.tsx` uses `CalendarSkeleton`, `src/app/(app)/performance/[id]/loading.tsx` uses `TabsSkeleton`). No test enforces this (see §10).

**error.tsx.** `src/app/(app)/error.tsx` and `src/app/(self-service)/error.tsx` render `SectionError` (`src/components/shared/section-error.tsx`) inside the frame, so navigation stays usable. The root `src/app/error.tsx` is a full-page card with a digest reference, and `src/app/global-error.tsx` is the last resort.

**Page headers.** `PageHeader` (`src/components/shared/page-header.tsx`, 28 lines) is used by 42 of the 44 `(app)` pages. Exceptions: `src/app/(app)/people/[id]/page.tsx` (own record header, `<h1>` at line ~259) and `src/app/(app)/payroll/[id]/payslips/page.tsx` (own `<h1>`, line ~70). ARCHITECTURE and ADR-013 say "used on every page".

**Tabs.** Two components, both link-based so the section lives in the URL:
- `PageTabs` (`src/components/shared/page-tabs.tsx`): underlined `<Link>` tabs with optional count, `aria-current="page"`. Used only by `src/app/(app)/people/[id]/page.tsx`.
- `ModuleTabs` (`src/components/shared/module-tabs.tsx`): used by `NavLinks` and `WorkspaceLayout` for merged modules (sub-navigation), not by pages directly.

**Navigation.** `src/components/shared/nav-links.tsx` (359 lines) defines `NAV_SECTIONS`, `NAV_PAGES`, `canSeeNavItem` and `CATALOG_READ_PERMISSIONS`. Each item names the permission its page checks. Hiding is a convenience (ENGINEERING §23); server checks are the boundary.

**No access.** A page the viewer cannot open renders `NoAccessState` (`src/components/shared/no-access-state.tsx`, used by 45 call sites), which wraps `NoAccessCard` (names the missing permission and roles, offers a copyable request).

**Mobile back link.** `Breadcrumbs` exports `mobileBackTarget` and `MobileHeaderTitle` (`src/components/shared/breadcrumbs.tsx`) for the phone top bar (ARCHITECTURE "Detail pages").

## 2. Shared building blocks

`src/components/shared/` holds 44 entries: 42 `.tsx` components, `table-constants.ts`, and one empty stray file, `status-badge.tsx.py` (see §9). Counts below are from grepping `src/` for each name outside its own file.

**Page chrome and navigation**
- `PageHeader`: title, description, action slot. 42 pages.
- `WorkspaceLayout`, `NavLinks`, `ModuleTabs`, `AccountMenu`, `Breadcrumbs`, `ThemeToggle`, `Logo`, `BrandName`: the shell (used by `(app)/layout.tsx` and `WorkspaceLayout`). `Logo` is also on the auth pages.
- `SelfServiceHeader`: `(self-service)/layout.tsx`.
- `PageTabs`: `people/[id]`. `StatusFilterTabs`: segmented status filter (cases, clearance, leave, settings/accounts).
- `Providers` (`src/app/layout.tsx`), `ServiceWorkerRegister`, `ConcurrentSessionGuard`, `IdleSessionGuard`: app-wide.

**Loading and states**
- `PageLoader` (49 uses), `BrandLoader` (only via `PageLoader`; ADR-050), `PendingNavigationRegion` / `usePendingNavigation` (`navigation-pending.tsx`; ADR-048: same-page query changes dim the content).
- `skeletons.tsx`: `HeaderSkeleton`, `StripSkeleton`, `FilterBarSkeleton`, `TableSkeleton`, `CardSkeleton`, `FormSkeleton`, `TabsSkeleton`, `RecordHeaderSkeleton`, `CalendarSkeleton`, `ScheduleGridSkeleton`, `KanbanSkeleton`, `CanvasSkeleton`, `PanelSkeleton`, `DocumentSkeleton`.
- `EmptyState` (only used by `horizontal-bar-chart.tsx`), `NoAccessState` / `NoAccessCard`, `SectionError`.

**Data display**
- `DataTable` (33 uses) + `DataTableFrame` (frame, sticky header, `ClientPaginationFooter`), `table-constants.ts` (`PAGE_SIZE_OPTIONS`, `DEFAULT_PAGE_SIZE`, `TABLE_FRAME_HEIGHT`).
- `StatusBadge` (37 uses): dot + word (ADR-048). Categorical colors are not used for status.
- `MetricCard` (32) and `MetricStrip` (34): figures in one ruled strip (ADR-048; `metric-card.tsx`).
- `TruncatedCell` (table cells that cut text with a tooltip), `HorizontalBarChart` (cases, performance/[id]), `HideToggle` (11; hides a record from lists, counts and exports, `src/components/shared/hide-toggle.tsx:11`).
- `CatalogSection` (`settings/catalogs/page.tsx` only).

**Filters, search and selection**
- `TableSearchInput` (8 uses), `OptionSelect` (33; optional FK dropdown with a "None" choice, per ADR-013), `SearchableOptionSelect` (only `performance/new-evaluation-dialog.tsx`).

**Forms, dialogs and actions**
- `FormField` (59 uses; label, control, `description`, `error`, `required`), `FormError` (68; form-level `role="alert"` banner), `RequiredFieldsHint` (45). See §3.
- `ConfirmDialog` (12 uses) and `DeleteRecordButton` (13 uses): destructive confirm (§3.3).
- `ExportDialog` (4; `attendance/export-attendance-dialog.tsx`, `attendance/schedules/page.tsx`, `payroll/[id]/run-actions.tsx`) and `TableExportActions` (3; `cases`, `people`, `travel-orders` export-actions). See §5.
- `AdjustLeaveBalanceDialog` (`leave/balances/employee-balance-sheet.tsx`, `people/[id]/leave-tab.tsx`), `ChangePasswordForm` (`account/security/password-section.tsx`, `(auth)/change-password/forced-password-change.tsx`).

**Account and security UX**
- `IdleSessionGuard` (exports `formatCountdown`, `countdownAnnouncement`, `forceIdleSignOut`), `ConcurrentSessionGuard`.

**Other**
- `ServiceWorkerRegister` (PWA, ADR-036), `brand-name.tsx` / `logo.tsx` (brand, ADR-036).

`src/components/ui/` holds 17 files: 16 `.tsx` primitives (Base UI + Tailwind, shadcn-style, copied into the repo; ADR-013) and `action-icon.ts`.

| Primitive | Notes |
|---|---|
| `button.tsx` | Adds `icon`, `pending`, `pendingLabel` props (lines ~48-89). `max-md:min-h-10` on every size (40px touch target, ARCHITECTURE UI standards). |
| `dialog.tsx` | `DialogContent` is a flex column with `max-h-[calc(100dvh-2rem)]`; `data-slot="dialog-body"` scrolls, header and footer stay fixed (line ~99, ~108; ENGINEERING "Dialogs"). |
| `sheet.tsx` | Side panel (7 files use `SheetContent`, e.g. case detail). |
| `input.tsx` (also `select.tsx`, `checkbox.tsx`, `label.tsx`, `textarea.tsx`) | `input.tsx` has `max-md:min-h-10` and `aria-invalid` styling; the other four were not checked for the 40px rule. |
| `table.tsx`, `card.tsx`, `badge.tsx`, `avatar.tsx`, `separator.tsx`, `skeleton.tsx`, `dropdown-menu.tsx` | Plain primitives. |
| `sonner.tsx` | Toaster config: `top-right`, `TOAST_TOP_OFFSET` (clears the 64px top bar), `TOAST_DURATION_MS`. Mounted once in `src/app/layout.tsx:62`. |
| `action-icon.ts` | `iconForAction(label)` picks an icon from the button's words (Save, Add, Send, Approve, Cancel, Trash, Close, default Check). Pinned by `tests/standards/button-standard.test.ts`. |

## 3. Forms and dialogs

### 3.1 Dialog and sheet pattern
- Modal forms use `Dialog` + `DialogContent` (57 files). Example: `src/app/(app)/people/[id]/edit-employee-dialog.tsx:269-273` puts a submit `Button` with `icon`, `pending` and `pendingLabel` in `DialogFooter`, and the form is linked by `form={formId}`.
- Side panels use `Sheet` (7 files). Dialog uses a dim scrim, not a blur (ADR-013 addendum).
- Client-fetched lists inside dialogs show skeleton rows (ADR-048 Decision → Loading). Not verified against code here.

### 3.2 Field errors and validation display
- `src/lib/field-errors.ts`:
  - `splitApiError(body, fallback, fields?)` takes the API body `{ error, field }` (shape from `src/shared/errors/to-response.ts`, per the file's comment). A `field` lands on that field only if the form renders it; otherwise the message becomes a form-level error, so nothing is dropped.
  - `useFieldErrors({ fieldIds | formId+fields })` returns `fieldErrors`, `formError`, `setFromResponse`, `setFieldError`, `clearField`, `clear`. A form-level message clears field errors, so one error shows at a time.
- `src/lib/focus-invalid-field.ts`: `focusInvalidField(formId, field)` scrolls to, highlights (`field-error-highlight`, 1.6s) and focuses the control whose id ends `-${field}`. Only called from `field-errors.ts` (line 76); no direct callers.
- `FormField` (`src/components/shared/form-field.tsx`, lines 48-110): sets `aria-invalid` and appends the error id to `aria-describedby` on its single control; `FormError` is `role="alert"`.
- Forms using `useFieldErrors` (11 files), e.g. `src/app/(app)/people/new/hire-form.tsx`, `src/app/(app)/people/[id]/edit-employee-dialog.tsx`, `src/app/(app)/settings/access/create-staff-account-dialog.tsx`.
- Dialog-based forms also use the `aria-invalid:` utility classes in `input.tsx`.
- Server-side field validation is documented in ENGINEERING §48 (errors) and §47 (types); Zod schemas live in `src/shared/validation/`.

### 3.3 Destructive confirm
- `ConfirmDialog` (`src/components/shared/confirm-dialog.tsx`, 93 lines): trigger opens a dialog. `onConfirm` is `() => Promise<void>`; if it throws, the dialog stays open and shows the message in `FormError`. Confirm button uses `confirmLoadingLabel` while running. `cancelLabel` defaults to "Keep it" (matches the `iconForAction` test). `variant` defaults to `destructive`.
- `DeleteRecordButton` (`src/components/shared/delete-record-button.tsx`) wraps it for "move to recycle bin" flows (used by `cases`, `clearance/[id]`, `final-settlements/[id]`, `leave/types`).
- ARCHITECTURE "UI standards": destructive actions go through `ConfirmDialog`.

### 3.4 Mutation feedback
- Spinner: `Button` `pending` swaps the icon for `Loader2` (`src/components/ui/button.tsx` lines ~84-89), disables, sets `aria-busy`, and uses `pendingLabel` ("Saving…"). `ConfirmDialog` does the same with `confirmLoadingLabel`.
- Toast: `toast.success` / `toast.error` from `sonner` (76 files call them; 77 import `sonner`). Errors shown inline in the dialog are also common; `tests/standards/mutation-feedback.test.ts` requires one or the other (see §8).
- Exceptions recorded in the guard: `recruitment/tracking/applicant-pipeline.tsx` (optimistic drag, rolls back with a toast), `leave/types/convertible-toggle.tsx`, `(self-service)/clock/clock-panel.tsx` (card state is the confirmation), `shared/change-password-form.tsx` (own success panel).

## 4. Tables, filters and export

### 4.1 Table query (`src/lib/table-query.ts`, 100 lines)
- `parseTableQuery(searchParams, defaultSort?, prefix?)` reads `q`, `sort`, `dir`, `page`, `pageSize` (1-100, default 10). `prefix` namespaces keys (`assignmentSort`, `assignmentPage`) for pages with two tables.
- `applyTableQuery(rows, query, { searchFields, sortValues })` filters (case-insensitive substring), sorts (nulls last), and slices. It works on rows already loaded by a domain service; it does not query the database.
- `buildTableHref(basePath, currentParams, changes, prefix?)` keeps other params and drops `undefined` values.
- Consumers (server pages that call `parseTableQuery`): `attendance/page.tsx`, `cases/page.tsx`, `leave/page.tsx`, `leave/balances/page.tsx`, `payroll/page.tsx`, `payroll/compensation/page.tsx`, and others (12 files in total).
- Client table: `DataTable` takes `sort` (`sortBy`, `buildHref`) and `pagination` (`page`, `pageSize`, `total`, `buildHref`) props (`src/components/shared/data-table.tsx`, lines 84-135). Search box: `TableSearchInput`.

### 4.2 Column rules (`src/components/shared/data-table.tsx`)
- `width`: `xs | sm | md | lg | xl | fill | auto` (lines 39-56). Defaults: first column `fill`, empty-header column `auto`, others `md`.
- `mobile`: `title | subtitle | badge | meta | actions | hidden` (lines 37, 63-82). Below `md`, each row becomes a stacked card. Defaults: first column is title, header ending in "Status" is badge, empty header is actions, rest are labelled meta lines.
- `truncate` defaults to on (cell cut with tooltip via `TruncatedCell`); set `false` for badges and buttons.

### 4.3 Export (`src/lib/export/`, `src/lib/csv.ts`)
- `src/lib/export/table-export.ts`: `TableExportSpec<Row>` has `title`, `sheetName`, `noun` (singular, plural), and `columns` (`header`, `width`, `wrap`, `value`). The same columns feed `buildTableCsv` and `buildTableWorkbook` (ExcelJS; title row, filters, frozen header). `countLabel` gives "12 employees". `XLSX_MIME` is exported.
- `src/lib/export/filename.ts`: `exportFilename(organizationName, what, on?)` and `filenameSlug`.
- `src/lib/export/download.ts`: `downloadBlob(blob, filename)`.
- `src/lib/csv.ts`:
  - `neutralizeCsvCell` prefixes a single quote to cells starting with `= + - @ TAB CR`, unless the cell is a plain number (CSV injection guard).
  - `buildCsvContent(headers, rows)` quotes every cell, doubles quotes, and prepends a UTF-8 BOM so Excel reads non-ASCII correctly.
- `ExportDialog` (`src/components/shared/export-dialog.tsx`): an "Export" button opens a dialog with Excel and CSV choices. Target is either an `href` or a `build()` function that runs the export client-side.
- `TableExportActions` (`src/components/shared/table-export-actions.tsx`): combines `ExportDialog` with a `TableExportSpec` and a `loadRows` function that fetches rows only when someone exports.
- Domain CSV builders also call `buildCsvContent`: `src/domains/attendance/attendance-export.ts`, `schedule-export.ts`, `src/domains/payroll/payroll-register-export.ts`.

## 5. Mobile-first rules and design tokens

**Rules** (ENGINEERING §41; ARCHITECTURE "UI standards"):
- Tables become cards below `md` (see §4.2).
- Buttons and inputs keep desktop size; add `max-md:min-h-10` (40px) rather than a `md:` height. Already in `button.tsx` and `input.tsx`.
- `h-dvh` / `min-h-dvh` plus `env(safe-area-inset-bottom)`; never `h-screen`.
- Top bar is 64px (`TOAST_TOP_OFFSET` comment in `sonner.tsx`); toasts sit below it.
- Forms: `FormField` + `FormError`; errors focus the first invalid field (§3.2).
- Nav and back links adapt on phones (`Breadcrumbs`, `WorkspaceLayout`).

**Tokens** (`src/app/globals.css`; ADR-048):
- Light and dark sets are `:root` and `.dark` (lines ~16-125). Brand `--primary` is the logo navy, `oklch(0.335 0.095 260)` (line 22). Dark primary is light blue (line 94). Surfaces are warm paper (`--background` line 16); hairlines use `--rule` (line 56).
- `--radius: 0.5rem` (line 39). `--shadow-soft` is a 1px line (line 60). `--shadow-raised`, `--shadow-modal` also defined.
- Font: IBM Plex Sans, weights 400-700, set in `src/app/layout.tsx:15` (`--font-sans`). Tabular figures for money and dates.
- Theme: `next-themes` `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, and a CSP nonce (`src/components/shared/providers.tsx:11`).
- Reduced motion: `@media (prefers-reduced-motion: reduce)` at `globals.css:312`; `BrandLoader` shows stills instead (ADR-050).
- Categorical palettes (shift, chart-group colors) are allowed; status uses `StatusBadge` (ADR-048 Consequences).
- A `design-system/workforcehub/` folder exists on disk but has no tracked files (see §9).

## 6. Display rules

- Instants: `formatDateTime` (Manila time), calendar dates: `formatCalendarDate`, money: `formatMoney` (ARCHITECTURE "UI standards", ADR-045). Implementations are in `src/lib/app-time.ts`, `src/lib/money.ts`.
- Person names: `formatPersonName` (`src/lib/person-name.ts`).
- Relative times: `src/lib/relative-time.ts`.

## 7. Adding a new screen (checklist derived from the above)

1. `src/app/(app)/<route>/page.tsx` with a `PageHeader`, the permission check (server side), and `NoAccessState` when denied.
2. `loading.tsx` beside it, built from `skeletons.tsx` pieces in the page's own order (ADR-048).
3. `parseTableQuery` / `applyTableQuery` / `buildTableHref` for search, sort and paging; `DataTable` with `mobile` roles set.
4. Export: `TableExportSpec` + `TableExportActions`, not a new CSV writer.
5. Mutations: `Button` with `icon`, `pending`, `pendingLabel`; `toast.success` / `toast.error`; errors through `useFieldErrors`.
6. Destructive actions through `ConfirmDialog` / `DeleteRecordButton`.
7. Nav item in `nav-links.tsx` with the permission the page checks (`tests/app/nav-permissions.test.tsx:63` reads the page source to check this).

## 8. Guard tests (`tests/standards/`)

`npm run test:core` includes `tests/standards` (`package.json`).

**`button-standard.test.ts`** (92 lines)
- Scans `.tsx` under `src/app` and `src/components`, excluding `components/ui/` and one exempt file (`attendance/schedules/schedule-grid.tsx`, shift-code chips).
- Fails if a `<Button>` body contains `Loader2` or `animate-spin` (the spinner must come from `pending`).
- Fails if a labelled `<Button>` has no icon: passes if the tag has `size="icon…"`, `icon={…}`, or `render={…}`, or the body has an inline component.
- Pins `iconForAction` mappings (`src/components/ui/action-icon.ts`).
- **New screen:** a labelled button needs `icon={…}` or it fails; do not draw spinners inside `Button`.

**`mutation-feedback.test.ts`** (51 lines)
- Collects every `.tsx` under `src/app` and `src/components` that contains a literal `method: "POST" | "PATCH" | "PUT" | "DELETE"` (double quotes). Asserts the set has more than 30 files (currently 69).
- Each collected file must contain `pending=`, `Loader2`, `animate-spin`, or `<ConfirmDialog`.
- Each collected file must contain `toast.success` or `toast.error`.
- Exempt files: `recruitment/tracking/applicant-pipeline.tsx`, `leave/types/convertible-toggle.tsx` (no spinner); `(self-service)/clock/clock-panel.tsx`, `shared/change-password-form.tsx` (no toast).
- **New screen:** a file that sends a mutation with a literal method string needs both a pending state and a toast in the same file, or an entry in the exemption map with a reason.

## 9. Known gaps and mismatches

1. **`PageHeader` not on every page.** `src/app/(app)/people/[id]/page.tsx` and `src/app/(app)/payroll/[id]/payslips/page.tsx` use their own `<h1>`. ARCHITECTURE and ADR-013 say every page uses `PageHeader`.
2. **`loading.tsx` is not enforced.** ADR-048 requires one per route. All 44 routes currently have it, but no test checks it (`grep` under `tests/` for `loading.tsx` finds nothing).
3. **Responsive rules are not enforced.** No test checks `dvh`, `max-md:min-h-10`, or `h-screen` absence (`grep` under `tests/` finds none). `src/app/error.tsx` and `not-found.tsx` use `min-h-screen`.
4. **Guards are file-level, not per call.** `mutation-feedback.test.ts` passes if the file has any `pending=` or toast, even if one of several mutations lacks them. It matches only the double-quoted literal form of `method:`; a mutation sent through a helper or a variable method is invisible to it (`grep 'method: [A-Z_]+'` finds none today).
5. **`button-standard` skips `components/ui/`** and does not check a `<Button render={…}>` for an icon.
6. **Stray file:** `src/components/shared/status-badge.tsx.py` is empty and not imported.
7. **Indirect helper:** `src/lib/focus-invalid-field.ts` is called only from `src/lib/field-errors.ts`; no screen imports it directly.
8. **Components with no page consumer:** `Breadcrumbs`, `AccountMenu`, `NavLinks`, `ModuleTabs`, `BrandLoader`, `NoAccessCard`, `PendingNavigationRegion` are used only by the shell or by other shared components. `EmptyState` is used only by `horizontal-bar-chart.tsx`.
9. **Design system folder.** `design-system/workforcehub/` exists on disk; `git ls-files design-system` returns nothing. The overview calls `design-system/workforcehub/pages/` empty and undocumented (`knowledge/overview.md`, Top-level layout).
10. **ADR-048 claims not verified in code here:** "no uppercase micro-labels, gradients or colored card edges" and "client-fetched lists in dialogs show skeleton rows". Treat as intent.
11. **Single shell importer.** `WorkspaceLayout` is imported only by `src/app/(app)/layout.tsx`; `tests/app/workspace-layout.test.tsx` covers it.

## 10. Test coverage of this area

- `tests/app/` (jsdom via `// @vitest-environment jsdom` in 39 files; `tests/app/api/*` runs in node): `data-table.test.tsx`, `form-field.test.tsx`, `destructive-confirm.test.tsx`, `delete-record-button.test.tsx`, `table-export-actions.test.tsx`, `page-loader.test.tsx`, `brand-loader.test.tsx`, `toaster.test.tsx`, `nav-permissions.test.tsx`, `workspace-layout.test.tsx`, `page-tabs.test.tsx`, `metric-card.test.tsx`, `hide-toggle*.test.tsx`, `date-nav.test.tsx`, `section-error.test.tsx`, `idle-session.test.tsx`, `concurrent-session-guard.test.tsx`.
- `tests/lib/csv.test.ts`, `tests/lib/table-export.test.ts`, `tests/lib/app-time.test.ts`, `tests/lib/money.test.ts`: export, CSV injection and date/money helpers.
- Only two test files reference these helpers (grep under `tests/`): `tests/app/form-field.test.tsx` and `tests/domains/leave/leave-request-service.test.ts`. There is no direct unit test for `src/lib/table-query.ts`. Check which helper each one touches before relying on it.
