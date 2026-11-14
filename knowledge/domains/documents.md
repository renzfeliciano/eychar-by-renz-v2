# Employee documents (201 file)

**Purpose:** Employee 201-file documents (IDs, contracts, certifications): multipart upload with server-side type and size checks, metadata-only edits, and download. Files go to object storage when configured, otherwise stay inline.
**Governing docs:** ADR-025 (Accepted, `docs/architecture/adr/ADR-025-employee-documents.md`); ADR-038 (document object storage, cited by ARCHITECTURE.md § Documents); ARCHITECTURE.md § Documents (Phase 8, ADR-025); ENGINEERING.md §43 (document storage: metadata in Mongo, file in a replaceable provider).
**Services:**
- `src/domains/documents/employee-document-service.ts`: `EmployeeDocumentService` with `create(employeeId, input, upload, actor)`, `update(id, org, patch, actor)`, `listForEmployee(employeeId, org)`, `listExpiringForOrganization(org, until)`, `readFile(id, org, employeeId)`, `getById(id, org, employeeId?)`. Also exports `documentMetadata` and `UploadedDocumentFile`.
- `src/domains/documents/file-check.ts`: `ALLOWED_DOCUMENT_TYPES` (PDF, PNG, JPEG, WebP, Word and Excel in OOXML and legacy OLE forms), each checked against the file's own leading bytes. Also `MAX_DOCUMENT_BYTES` (4 MB), `inspectDocumentBytes`, `inspectDocumentUpload` (base64 variant), `safeDownloadType`, `guessDocumentType`, `DOCUMENT_ACCEPT`.
- Storage: `src/server/storage/document-storage.ts` (`DocumentStorage.save/read/remove`), called from the service. Its provider logic is not covered here.
- Type codes: `DocumentTypeService.assertValidCode` from `src/domains/catalog/document-type-service.ts`.

**Models:**
- `src/server/db/models/employee-document.ts` (`EmployeeDocument`): `employeeId`, `title`, `documentType`, `fileName`, `fileType`, `fileSize`, `storage { provider: vercel-blob | inline, key }`, optional `fileData`, `expiresAt`, `notes`. Index `{organizationId, employeeId}`.
- `src/server/db/models/document-type.ts` (catalog, read through `DocumentTypeService`).

**Routes:**
- `src/app/api/employees/[id]/documents/route.ts`: `GET` (`employee-documents.read`, list without file data); `POST` multipart upload (`employee-documents.create`, requires a `content-length` header (411 otherwise), rejects bodies over the cap before parsing, rate-limited per user with `enforceRateLimit("documentUpload")`).
- `src/app/api/employees/[id]/documents/[documentId]/route.ts`: `GET` download as an attachment (`employee-documents.read`, scoped by employee id); `PATCH` metadata (`employee-documents.update`).

**Pages:**
- `src/app/(app)/people/[id]/documents-tab.tsx`, `document-form-dialog.tsx`, `document-download-button.tsx`.
- Expiry risk list: `src/app/(app)/dashboard/page.tsx` line ~180 calls `listExpiringForOrganization`, gated on `canReadDocuments`. Risk logic in `src/domains/dashboard/compliance-risks.ts`.

**Tests:**
- `tests/domains/documents/employee-document-service.test.ts` (7 tests)
- `tests/domains/documents/file-check.test.ts` (6 tests)

**Rules a change must respect:**
- The browser's file type is never trusted. `inspectDocumentBytes` checks the magic bytes against the allow-list (`file-check.ts`, `ALLOWED_DOCUMENT_TYPES`). The stored `fileSize` is the server-measured length.
- The size cap is 4 MB on the file, and the POST route also checks the declared `content-length` before parsing (`src/app/api/employees/[id]/documents/route.ts`). Keep the two in step (`MAX_DOCUMENT_BYTES`).
- `create` checks that the employee belongs to `input.organizationId` (`EmployeeModel.exists`) before storing anything. It validates the type code before storing.
- `update` changes metadata only (`title`, `documentType`, `expiresAt`, `notes`). The file fields are never touched, so a new file is a new document (`employee-document-service.ts` `update` comment; `updateEmployeeDocumentSchema` omits file fields).
- Lists and responses never include `fileData` or `storage`: `listForEmployee` selects `-fileData -storage`, and `documentMetadata` strips both.
- A download's `Content-Type` comes from `safeDownloadType`, so a type that isn't on the allow-list is served as `application/octet-stream`.
- Download and read are scoped to the employee in the URL (`getById` filters by `employeeId`).
- Every create and update is audited (`employee-document.created`, `employee-document.updated`).

**Known gaps / mismatches:**
- `PATCH /api/employees/[id]/documents/[documentId]` ignores the `[id]` segment. It calls `EmployeeDocumentService.update(documentId, org, …)`, which looks up the document by id and organization only. A PATCH with any employee id in the same organization updates the document. The GET route does check the employee.
- ADR-025 says "no delete at all", and ARCHITECTURE.md § Documents says "No delete of any kind". The recycle-bin registry lists `employee-document` as deletable (`src/domains/deletion/deletion-registry.ts`). See the deletion file.
- `listExpiringForOrganization` returns at most 200 rows (`.limit(200)`) with no indication of truncation, and the dashboard uses it for the risk list.
- The Known gaps in ARCHITECTURE.md do not mention documents. No open gap is recorded for them.

**Last verified:** 6587050
