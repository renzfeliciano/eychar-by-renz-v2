# ADR-038: Employee document files in object storage

## Status

Accepted. Supersedes the storage part of ADR-025 (files as base64 in MongoDB).

## Context

ADR-025 stored each 201-file document's bytes as base64 on the `EmployeeDocument` record. That was
fine for a handful of files but doesn't scale on the deployment we run on: MongoDB Atlas Free Tier
has 512MB in total, so a few hundred scanned IDs and contracts would fill it, and every backup and
query touching the collection carries the files. Uploads were also sent as base64 inside JSON,
which inflates them by a third; anything over about 3.3MB went past Vercel's 4.5MB request body
limit and failed, even though the form said 5MB.

AGENTS.md §43 already asks for "Document Metadata → Storage Provider → Object Storage" with a
replaceable provider.

## Decision

- **Provider seam:** `src/server/storage/document-storage.ts` (`DocumentStorage.save/read/remove`).
  The domain service never talks to a storage SDK directly.
- **Vercel Blob, private:** when `BLOB_READ_WRITE_TOKEN` is set (Vercel adds it when a Blob store is
  connected to the project), files are `put` with `access: "private"` under
  `employee-documents/<organizationId>/<employeeId>/<uuid>`. Keys hold no file name or personal data.
  Private blobs can't be fetched by URL; the only way to a file is the permission-checked route.
- **Inline fallback:** with no token (local dev, tests, a deploy without a Blob store yet) files stay
  inline in `fileData` as before, so nothing breaks before the store is connected.
- **Model:** `EmployeeDocument.storage { provider: "vercel-blob" | "inline", key? }`; `fileData` is now
  optional. Documents uploaded before this change have `fileData` and no `storage`, and are read
  the same way. No migration is required; moving old files into Blob can be a later, explicit
  backfill (AGENTS.md §53).
- **Upload:** `POST /api/employees/[id]/documents` takes `multipart/form-data` (metadata fields plus
  `file`). The cap is 4MB (`MAX_DOCUMENT_BYTES`), under Vercel's 4.5MB body limit; the route refuses
  a larger `Content-Length` before reading the body. Type, content and size are still checked
  against the file's own bytes (`inspectDocumentBytes`).
- **Download:** `GET /api/employees/[id]/documents/[documentId]` now returns the file itself, not
  JSON: an allowed `Content-Type` only, `Content-Disposition: attachment` (RFC 6266, UTF-8 name),
  `Cache-Control: private, no-store`, `nosniff`, and a sandboxing CSP. The list and edit responses
  never include `fileData` or `storage`.
- **Deletion:** documents still have no delete (ADR-025). `DocumentStorage.remove` exists for when one
  is added, so a purge removes the blob too.

## Consequences

- The database holds only metadata once a Blob store is connected; Blob's free allowance covers far
  more files than the Atlas free tier could.
- Files bigger than 4MB need direct-to-storage client uploads (`@vercel/blob/client`) if they're
  ever required; not needed today.
- Swapping providers (S3, R2, GCS) means a new branch in `DocumentStorage` and a new `provider`
  value; the domain and routes stay the same.
