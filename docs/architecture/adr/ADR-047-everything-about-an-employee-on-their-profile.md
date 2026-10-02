# ADR-047: Everything about an employee on their profile

## Status

Accepted (October 2026).

## Context

HR opened an employee's profile to answer questions like "is their contract ending?", "did they
file leave?" or "what was their last net pay?". The profile only had job, leave balances,
documents and assets, so they had to go to each module and filter for the person. It also showed
the same facts several times: status twice, hire date three times, position and project twice.

## Decision

- **Each fact appears once.** The header holds who they are and where they sit: name, status,
  position · project · type, Employee #, Hired + tenure, Contract ends, Email, Phone.
- **The Overview is "Needs attention"** for this one person (`profileAttention` in
  `src/domains/workforce/profile-summary.ts`): open clearance, contract ending or already past,
  expired or expiring documents, missing government IDs, pending leave, no pay terms, no position,
  no self-service login. Most urgent first, each linked to the tab that resolves it. Only the
  Government IDs and Self-service cards stay, since their information appears nowhere else.
- **One tab per module:** Job & history, Leave (balances + requests), Attendance (last 60 days),
  Pay (pay terms + payslips), Documents, Assets, Travel, Performance, Offboarding (clearance +
  final pay). Cases are project-level, not per employee, so they have no tab.
- **Read here, act in the module.** Tabs that show another module's records link to it ("Decide
  in Leave", "Open Payroll") instead of copying its actions, so each workflow keeps one home.
  Job, leave balances, documents and assets keep their in-place actions as before.
- **Same permissions as the modules.** Each tab, and each query behind it, needs the module's
  read permission. A tab you can't read isn't shown, and its data is never loaded.
- **Load only the open tab.** The Overview loads only what its checks need. Other tabs load
  their own records when opened. Per-employee queries that modules lacked live in
  `src/domains/people/employee-records.ts`.
- The sidebar modules are unchanged.

## Consequences

- A new employee-related module should add a profile tab the same way: a read-permission gate,
  a per-employee query, and a link back to the module.
- The profile's tab bar is long (up to 10 tabs). `PageTabs` scrolls horizontally on narrow screens.
