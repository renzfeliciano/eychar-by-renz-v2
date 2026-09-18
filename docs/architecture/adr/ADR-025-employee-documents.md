# ADR-025: Employee documents (201-file), storage, and scope

## Status

Accepted

## Context

`Documents` was the last unimplemented Phase 8 sub-phase (AGENTS.md §57), but unlike every other
module added this phase, the legacy v1 app has no Documents feature at all to mirror — it's only
ever mentioned as a bare domain name in AGENTS.md's own list. With no source of truth to read
from and two real architectural forks (what a "document" even is here, and how the file itself
is stored), the user was asked directly rather than guessed at:

- **Scope**: employee 201-file documents (government IDs, contracts, certifications, resumes) —
  not a separate company-wide document library.
- **Storage**: base64 in MongoDB, the same call already made for attendance clock-in photos
  (ADR-020) — no new infrastructure, acceptable at current scale.

## Decision

- **`EmployeeDocument`** (`organizationId`, `employeeId`, `title`, `documentType`, `fileName`,
  `fileType`, `fileSize`, `fileData` — base64, capped at ~5MB decoded via
  `src/shared/validation/documents.ts`'s `MAX_FILE_DATA_LENGTH`, staying well under MongoDB's
  16MB BSON document limit — `expiresAt?`, `notes?`). `documentType` is a **new ninth org-managed
  catalog** (`DocumentType`, added to `CATALOG_REGISTRY` alongside the existing eight, seeded with
  Government ID/Employment Contract/Certification/Resume/Other) — consistent with every other
  categorization field in this app, not a hardcoded enum.
- **No hard delete** (AGENTS.md §53), and specifically **no delete at all** here, not even a
  status-based soft one like Travel Orders/Events — a wrong upload is superseded by uploading a
  corrected document; there's no "cancelled" state that make sense for a stored file the way there
  is for a scheduled trip or calendar event.
- **Edit is metadata-only**: `updateEmployeeDocumentSchema` omits the file fields entirely —
  re-uploading is a new document, not a mutation of the stored bytes. This keeps `update()` cheap
  (no re-validation of file size/type) and matches the mental model of "correct the label, not
  the file."
- **List vs. detail split**: `listForEmployee()` explicitly `.select("-fileData")` — the People
  detail page's Documents table would otherwise pull every document's full base64 payload just to
  render a title and a date. `getById()` (the download endpoint) is the only path that returns
  `fileData`, fetched on demand when the download button is actually clicked.
- **UI**: a "Documents" card on `/people/[id]`, alongside Issued Assets — same list-then-form
  dialog shape. Upload reads the chosen file client-side via `FileReader.readAsDataURL` and
  strips the `data:mime;base64,` prefix before POSTing; download does the reverse — fetch the
  single document, rebuild a `data:` URI, and click a throwaway `<a download>` — no separate
  binary-streaming route, keeping every API response here plain JSON like the rest of the app.

## Consequences

- Every document read that includes `fileData` moves that full payload over the wire and through
  Node's JSON serialization — fine at 5MB-and-under, would need revisiting (e.g. a dedicated
  binary route, or moving to object storage) if documents grow larger or numerous per employee.
- No document versioning/history — uploading a "renewed" copy of an expiring ID is a brand new
  `EmployeeDocument` row, not a new version of the old one. The old one stays visible; nothing
  prunes it automatically. Acceptable for now, and consistent with this app's general "never
  silently drop history" stance.
