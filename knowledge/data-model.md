# Data model (Phase 3)

**Last verified:** `6587050` (main, 2026-11-14). Working tree had only the untracked `knowledge/` folder.
**Scope:** the Mongoose schemas as the code defines them, how reference data is seeded and indexed,
and the invariants the code enforces. Authorization is in `authorization.md` (Phase 4), not here.
**Code wins over docs.** Where a doc disagrees, the mismatch is listed in the last section.

Sources: `src/server/db/models/*.ts` (all schemas), `src/server/db/*.ts` (connection, plugin,
transactions, org assertion), `src/domains/deletion/*.ts`, `scripts/seed.ts`, `scripts/sync-indexes.ts`,
`ARCHITECTURE.md` (Identity, Workforce, MongoDB modeling), `docs/ENGINEERING.md` §§30–34, 53–54,
ADR-002, ADR-003, ADR-005, ADR-006, ADR-033, ADR-041.

Index and collection facts below were dumped from the compiled schemas (`schema.indexes()`,
`model.collection.collectionName`) in this commit, not copied from docs.

---

## 1. Count and naming

- **63 Mongoose models**, not 65. `src/server/db/models/` has 65 `.ts` files, but two are not models:
  `index.ts` (barrel, 63 exports) and `simple-catalog-schema.ts` (factory). See section 9.
- **Collection names are Mongoose defaults**: lowercased plural of the model name, e.g.
  `EmployeeAssignment` → `employeeassignments`, `Person` → `people`, `CaseStatus` → `casestatuses`.
  No `collection:` option is set on any model (grep of `src/server/db/models/`). ARCHITECTURE.md uses
  camelCase names (see section 9).
- Every model file ends with `models.X ?? model("X", schema)` (hot-reload guard), and every model is
  re-exported from `src/server/db/models/index.ts`.
- Timestamps: `{ timestamps: true }` on all models except `AuditLog` (`audit-log.ts`, own
  `timestamp` field), `LoginThrottle` (`login-throttle.ts`) and `DeletedRecord` (`timestamps: true`,
  `minimize: false`, `deleted-record.ts`).

## 2. Entity list by domain

Columns: **file** (in `src/server/db/models/`), **model → collection**, **key fields**, **indexes**
(`U` = unique; `partial{}` = partialFilterExpression; `TTL` = expireAfterSeconds), **refs** (schema-level
`ref:` on top-level paths). Org-scoped means `organizationId` is required (section 4).
Models marked `h` carry `hiddenFromOthers` via `hiddenPlugin` (section 5).

### 2.1 Identity and access (8)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `user.ts` | User → `users` | username, email (both lowercased, sparse), passwordHash, personId?, employeeId?, status, activeSessionId, failedSignInCount, lockedUntil, mustChangePassword, mfa{…}, webAuthn challenge fields | `username` U sparse; `email` U sparse. **No index on `personId` or `employeeId`** | personId→Person, employeeId→Employee. **No organizationId** (global) |
| `person.ts` | Person → `people` | first/middle/last name, email, phone, birthDate, gender, SSS/PhilHealth/Pag-IBIG/TIN numbers, remarks (maxlength), metadata | `organizationId` | organizationId→Organization |
| `permission.ts` | Permission → `permissions` | key (unique), category, description, isSystem | `key` U | none. Global catalog |
| `role.ts` | Role → `roles` | name, description, status, `permissionKeys: string[]` (embedded), `system: "super_admin"?` | `(organizationId,name)` U | organizationId→Organization. permissionKeys are strings, not refs |
| `role-assignment.ts` | RoleAssignment → `roleassignments` | userId, roleId, scope{type: organization│project, projectIds?}, effectiveFrom, effectiveTo | `(userId,organizationId)`; `(roleId)`; `(organizationId,createdAt:-1)` | userId→User, roleId→Role, organizationId, scope.projectIds→Project |
| `webauthn-credential.ts` | WebAuthnCredential → `webauthncredentials` | credentialId (U), publicKey, counter, transports | `credentialId` U; `(userId)` | userId→User, organizationId |
| `login-throttle.ts` | LoginThrottle → `loginthrottles` | key (U, e.g. `ip:…`), count, windowStart, expiresAt | `key` U; `expiresAt` TTL 0 | none. Global |
| `audit-log.ts` | AuditLog → `auditlogs` | organizationId, actorUserId?, action, resourceType, resourceId, timestamp, before/after/metadata (Mixed) | `(org,timestamp:-1)`; `(org,resourceType,resourceId)`; `(resourceType,resourceId,timestamp:-1)`; `(org,actorUserId,timestamp:-1)` | actorUserId→User, organizationId. `resourceId` is not a ref (any model) |

### 2.2 Organization structure (6)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `organization.ts` | Organization → `organizations` | name, slug (U, lowercased), status, `security{idleTimeoutSeconds, idleWarningSeconds, requireTwoStepForStaff}`, `compliance{finalPayDays}`, metadata | `slug` U | none. Root tenant |
| `organization-unit.ts` | OrganizationUnit → `organizationunits` | type (free string), name, code, status, effectiveFrom/To, parentUnitId? | `(org,code)` U; `(parentUnitId)`; `h` | parentUnitId→OrganizationUnit (self) |
| `position.ts` | Position → `positions` | title, code, status, effectiveFrom/To | `(org,code)` U; `h` | organizationId |
| `location.ts` | Location → `locations` | name, code, address, latitude/longitude, geofenceRadiusMeters (10–5000, default 100), status. **Not effective-dated** | `(org,code)` U; `h` | organizationId |
| `project.ts` | Project → `projects` | name, code, status, locationId? | `(org,code)` U; `(locationId)`; `h` | locationId→Location |
| `org-chart.ts` | OrgChart → `orgcharts` | nodes[{key, type: person│group, employeeId?, label, color, x, y}], edges[{from,to}], updatedBy | `organizationId` U (one per org) | nodes[].employeeId→Employee, updatedBy→User |

### 2.3 Workforce (7)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `employee.ts` | Employee → `employees` | personId, employeeNumber?, excludedFromSchedule, metadata. **No status field** | `(org,employeeNumber)` U partial{employeeNumber exists}; `(org)`; `h` | personId→Person, organizationId |
| `employment.ts` | Employment → `employments` | employmentType (string, validated against catalog), status (string, default "active"), effectiveFrom/To, endOfContract?, terminationReason?, `termsHistory[]` (ADR-052) | `(employeeId,effectiveFrom)` | employeeId→Employee |
| `employee-assignment.ts` | EmployeeAssignment → `employeeassignments` | positionId?, organizationUnitId?, projectId?, locationId?, effectiveFrom/To, status | `(employeeId,effectiveFrom)`; `(org,effectiveFrom)` | employeeId, positionId, organizationUnitId, projectId, locationId |
| `compensation.ts` | Compensation → `compensations` | rateType, rate, allowances[], minimumWageEarner, effectiveFrom (**no default**), effectiveTo?, reason, batchId | `(employeeId,effectiveFrom)`; `(org,employeeId,effectiveFrom)`; `(org,batchId)`; `(org,effectiveFrom)` | employeeId→Employee |
| `employee-document.ts` | EmployeeDocument → `employeedocuments` | title, documentType (string), fileName, fileType, fileSize, **fileData (inline String, optional)**, storage{provider: vercel-blob│inline, key}, expiresAt | `(org,employeeId)` | employeeId→Employee |
| `asset-issuance.ts` | AssetIssuance → `assetissuances` | assetName, assetType, serialNumber, condition (Good/Fair/Damaged/Lost), issuedDate, returnedDate | `(org,employeeId)` | employeeId→Employee |
| `travel-order.ts` | TravelOrder → `travelorders` | employeeIds[] (≥1), startDate, endDate, remarks, status (default "scheduled") | `(org,startDate:-1)`; `h` | employeeIds→Employee[] |

### 2.4 Attendance, schedule and calendar (7)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `attendance-policy.ts` | AttendancePolicy → `attendancepolicies` | name, standardStartTime/EndTime, gracePeriodMinutes, workDays[], status, effectiveFrom/To | `(org,projectId)` | projectId→Project |
| `attendance-record.ts` | AttendanceRecord → `attendancerecords` | employeeId, date, checkInAt/checkOutAt, status (string, validated vs catalog), policyId?, projectId?, checkIn/checkOut{at, lat/long, accuracy, photo, photoStorage, verified, locationId, distanceMeters, liveness} | `(org,employeeId,date)` **U**; `(org,date)` | employeeId, policyId, projectId, clock locationId |
| `shift-template.ts` | ShiftTemplate → `shifttemplates` | name, code (uppercased), kind: work│rest, pattern fixed│flexible, start/end times, requiredHours | `(org,code)` U; `h` | organizationId |
| `schedule-entry.ts` | ScheduleEntry → `scheduleentries` | employeeId, date, shiftTemplateId, shift{snapshot of template}, projectId? | `(org,employeeId,date)` **U**; `(org,date)` | employeeId, shiftTemplateId, projectId |
| `day-note.ts` | DayNote → `daynotes` | date, note, status, updatedByUserId? | `(org,date)` **U**; `h` | updatedByUserId→User |
| `holiday.ts` | Holiday → `holidays` | date, name, type: regular│special_non_working│special_working, scope, source, presetKey?, eventId?, status | `(org,date)`; `(org,eventId)` partial{eventId exists}; `h` | eventId→Event |
| `event.ts` | Event → `events` | title, date, time, category (string, catalog), holidayType?, status | `(org,date)`; `h` | organizationId |

### 2.5 Leave (4)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `leave-type.ts` | LeaveType → `leavetypes` | name, code, requiresApproval, convertibleAtSeparation, status | `(org,code)` U; `h` | organizationId |
| `leave-policy.ts` | LeavePolicy → `leavepolicies` | leaveTypeId, projectId?, annualEntitlementDays, status, effectiveFrom/To | `(org,projectId,leaveTypeId)` | leaveTypeId, projectId |
| `leave-balance.ts` | LeaveBalance → `leavebalances` | employeeId, leaveTypeId, year, entitledDays, adjustmentDays, hasNoFixedAmount | `(org,employeeId,leaveTypeId,year)` **U** | employeeId, leaveTypeId |
| `leave-request.ts` | LeaveRequest → `leaverequests` | employeeId, leaveTypeId, startDate/endDate, totalDays (≥1), status: pending│approved│rejected│cancelled, approvedBy?, approvedAt | `(org,employeeId,startDate)`; `(org,status)`; `(org,startDate:-1)` | employeeId, leaveTypeId, approvedBy→User |

### 2.6 Payroll (6)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `payroll-policy.ts` | PayrollPolicy → `payrollpolicies` | name, payFrequency, workDaysPerYear, hoursPerDay, finalPayDeadlineDays, multipliers, contributionTiming, status, effectiveFrom/To | `(org,projectId)` | projectId |
| `payroll-rule-version.ts` | PayrollRuleVersion → `payrollruleversions` | versionNumber, taxTables[], contributions[] (embedded rule tables), basedOnVersionId?, status, effectiveFrom/To | `(org,projectId)`; `(org,versionNumber)` **U** | projectId, basedOnVersionId (self) |
| `payroll-schedule.ts` | PayrollSchedule → `payrollschedules` | name, payFrequency, cutoffDay, payDateOffsetDays, autoPrepare, startsOn, status, lastPreparedPeriodEnd, lastRunId?, lastError | `(org,status)` | projectId, lastRunId→PayrollRun |
| `payroll-run.ts` | PayrollRun → `payrollruns` | runNumber, payPeriodStart/End, payDate, policyId, ruleVersionId, status: draft│submitted│approved│released│cancelled, source{type, scheduleId?}, totals{…} (embedded), exclusions[], computeLock, history[], sign-off user/time fields | `(org,payPeriodStart)`; `(org,runNumber)` **U** | policyId, ruleVersionId, projectId, source.scheduleId→PayrollSchedule, 5 user fields (prepared/submitted/approved/released/cancelled by) |
| `payroll-record.ts` | PayrollRecord → `payrollrecords` | payrollRunId, employeeId, employeeNumber/Name (snapshot), compensationId?, rate fields, attendance{…} (embedded), earnings[], contributions[], deductions[], grossPay, tax, netPay, warnings[] | `(payrollRunId,employeeId)` **U**; `(org,employeeId)` | payrollRunId, employeeId, projectId, compensationId |
| `payroll-adjustment.ts` | PayrollAdjustment → `payrolladjustments` | payrollRunId, employeeId, category, label, direction: earning│deduction, amount, taxable, createdBy | `(payrollRunId,employeeId)` | payrollRunId, employeeId, createdBy |

### 2.7 Catalogs: org-managed lists (13 models, one shared shape)

Built by `buildSimpleCatalogSchema()` (`simple-catalog-schema.ts`). Every one has: `organizationId`
(required), `code`, `name`, `description`, `sortOrder`, `metadata` (Mixed, open extension point),
`status` (active│inactive), timestamps. Indexes on every one: `(organizationId,code)` **U** and
`(organizationId,sortOrder)`.

| file | model → collection |
|---|---|
| `employment-type.ts` | EmploymentType → `employmenttypes` |
| `employment-status.ts` | EmploymentStatus → `employmentstatuses` |
| `attendance-status.ts` | AttendanceStatus → `attendancestatuses` |
| `recruitment-stage.ts` | RecruitmentStage → `recruitmentstages` |
| `event-category.ts` | EventCategory → `eventcategories` |
| `case-classification.ts` | CaseClassification → `caseclassifications` |
| `case-status.ts` | CaseStatus → `casestatuses` |
| `performance-rating.ts` | PerformanceRating → `performanceratings` |
| `evaluation-type.ts` | EvaluationType → `evaluationtypes` |
| `document-type.ts` | DocumentType → `documenttypes` |
| `separation-type.ts` | SeparationType → `separationtypes` |
| `clearance-department.ts` | ClearanceDepartment → `clearancedepartments` |
| `payment-method.ts` | PaymentMethod → `paymentmethods` |

Other models refer to these by **string code**, not ObjectId (e.g. `Employment.employmentType`,
`AttendanceRecord.status`, `Applicant.stage`, `Case.classification`/`status`, `Event.category`,
`PerformanceReview.ratingCode`, `ClearanceCase.separationTypeCode`, `ClearanceChecklistItem.departmentCode`,
`FinalSettlement.payment.methodCode`, `EmployeeDocument.documentType`). Validation of these codes is
at the service boundary (e.g. `employment.ts` comment → `EmploymentTypeService.assertValidCode`,
`src/domains/catalog/employment-type-service.ts`), not a Mongoose enum.

### 2.8 Recruitment, performance and cases (8)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `applicant.ts` | Applicant → `applicants` | positionId, applicantName, email, phone, stage (string, default "applied"), appliedDate, remarks | `(org,positionId)`; `(org,stage)`; `h` | positionId→Position |
| `review-cycle.ts` | ReviewCycle → `reviewcycles` | name, periodStart/End, status: draft│open│closed | `(org,status)` | organizationId |
| `performance-review.ts` | PerformanceReview → `performancereviews` (older single-rating record; `performance-evaluation.ts` comment calls it read-only history) | reviewCycleId, employeeId, reviewerId, ratingCode, status: draft│submitted | `(org,reviewCycleId,employeeId)` **U**; `(org,employeeId)` | reviewCycleId, employeeId, reviewerId (both Employee) |
| `evaluator-rule.ts` | EvaluatorRule → `evaluatorrules` | name, order, subjectPositionIds[], subjectProjectIds[], evaluatorPositionIds[], evaluatorScope: same-project│organization | `(org,name)` **U**; `(org,order)` | arrays → Position, Project |
| `performance-evaluation.ts` | PerformanceEvaluation → `performanceevaluations` | employeeId, evaluatorEmployeeId, evaluationFor, periodStart/End, templateVersion, ratings[{criterionKey, rating: S│A│NI}], status: draft│submitted│acknowledged, snapshot{names…}, acknowledgments | `(org,employeeId,createdAt:-1)`; `(org,evaluatorEmployeeId,createdAt:-1)`; `(org,createdAt:-1)` | employeeId, evaluatorEmployeeId |
| `evaluation-follow-up.ts` | EvaluationFollowUp → `evaluationfollowups` | employeeId, dueKey (YYYY-MM-DD), outcome: sent│completed, actionDate, status: active│withdrawn | `(org,status,employeeId)`; `(org,employeeId,dueKey)` **U partial{status: active}** | employeeId, recordedBy→User; `h` |
| `case.ts` | Case → `cases` | projectId, caseName, caseNumber, classification, status, legalCounsel, briefHistory | `(org,status)`; `(projectId)`; `h` | projectId |

### 2.9 Clearance and separation (3)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `clearance-checklist-item.ts` | ClearanceChecklistItem → `clearancechecklistitems` | departmentCode, title, blocking, dueDaysAfterLastDay, autoSource: assets│account_access│travel_orders, sortOrder, status | `(org,departmentCode,sortOrder)` | organizationId |
| `clearance-case.ts` | ClearanceCase → `clearancecases` | caseNumber, employeeId, separationTypeCode, noticeDate, lastWorkingDay, status: in_clearance│cleared│cancelled│closed, active (bool), items[] (embedded: checklistItemId?, status: pending│cleared│flagged│waived│not_applicable, amount, actedBy/At) | `(org,caseNumber)` **U**; `(org,employeeId)` **U partial{active: true}**; `(org,status,lastWorkingDay)`; `h` | employeeId, openedBy→User, items[].checklistItemId |
| `final-settlement.ts` | FinalSettlement → `finalsettlements` | clearanceCaseId, employeeId, status: draft│submitted│reviewed│approved│disbursed│cancelled, version, lines[], manualLines[], totals{earnings,deductions,net}, inputs (Mixed), payment{methodCode, reference, paidAt}, history[] | `(org,clearanceCaseId)` **U**; `(org,status)`; `h` | clearanceCaseId, employeeId, preparedBy→User |

### 2.10 Recycle bin (2)

| file | model → collection | key fields | indexes | refs |
|---|---|---|---|---|
| `deletion-batch.ts` | DeletionBatch → `deletionbatches` | entityType, entityId, label, status: in_bin│restored│purged, summary[], recordCount, patches[] (undo instructions), deletedAt, purgeAfter, restoredAt, purgedAt | `(org,status,deletedAt:-1)`; `(status,purgeAfter)` | deletedBy, restoredBy → User |
| `deleted-record.ts` | DeletedRecord → `deletedrecords` | batchId, collectionName, doc (Mixed full snapshot) | `(batchId)` | batchId→DeletionBatch |

Total: 8 + 6 + 7 + 7 + 4 + 6 + 13 + 1 + 5 + 1 + 3 + 2 = **63**.

---

## 3. Relationships (text)

- **Identity chain** (ADR-003): `User.personId → Person` (optional, so an HR account may have no Person
  or Employee); `Employee.personId → Person` (required); `Employee` is the workforce identity;
  `User.employeeId → Employee` only for self-service accounts (`user.ts`).
- **Employee history** (ADR-005/006): `Employment`, `EmployeeAssignment`, `Compensation` each reference
  `Employee` and are read as "current" by `effectiveFrom/effectiveTo`. `EmployeeAssignment` references
  `Position`, `OrganizationUnit`, `Project`, `Location`. `Employee` itself has no status.
- **Units**: `OrganizationUnit.parentUnitId` self-reference. `Project.locationId → Location`.
- **Access**: `RoleAssignment` links `User` ↔ `Role` in an org, optionally limited to `projectIds`.
  `Role.permissionKeys` embeds permission keys (strings) that point at `Permission.key`; there is no
  ObjectId link.
- **Payroll**: `PayrollRun` → `PayrollPolicy` + `PayrollRuleVersion` (+ `Project`, + `PayrollSchedule`
  via `source.scheduleId`). `PayrollRecord` → `PayrollRun` + `Employee` (+ `Compensation`).
  `PayrollAdjustment` → `PayrollRun` + `Employee`. `PayrollRuleVersion.basedOnVersionId` chains versions.
- **Leave**: `LeaveRequest`, `LeaveBalance`, `LeavePolicy` → `LeaveType`; `LeaveRequest`/`LeaveBalance` → `Employee`.
- **Attendance and schedule**: `AttendanceRecord` → `Employee`, `AttendancePolicy`, `Project`, clock
  `Location`. `ScheduleEntry` → `Employee`, `ShiftTemplate`, `Project`. `Holiday.eventId → Event`.
- **Performance**: `PerformanceReview` → `ReviewCycle` + two `Employee`s. `PerformanceEvaluation` →
  two `Employee`s (employee + evaluator). `EvaluatorRule` → `Position[]`/`Project[]` (picks evaluators;
  grants nothing, `evaluator-rule.ts` comment, ADR-051).
- **Clearance**: `ClearanceCase` → `Employee`; `items[].checklistItemId` → `ClearanceChecklistItem`.
  `FinalSettlement` → `ClearanceCase` (unique, one per case) + `Employee`.
- **Recruitment**: `Applicant` → `Position`.
- **Recycle bin**: `DeletedRecord.batchId → DeletionBatch`; the bin holds full copies (`doc`) and the
  `patches` needed to undo edits to records that were not moved (`deletion-service.ts`, section 5).
- **Org chart**: `OrgChart` (one per org) embeds nodes that point at `Employee`; edges are key pairs.
- **Not refs, but cross-model**: `AuditLog.resourceId` (any model, `audit-log.ts`).

---

## 4. Org scoping

- **59 of 63 models** have a required `organizationId`. The four without it are `User`, `Permission`,
  `LoginThrottle` and `Organization` (itself). Checked by loading the models with `tsx`.
- `User` is global. Org membership comes from `Person.organizationId` or a `RoleAssignment`
  (`src/domains/deletion/deletion-registry.ts:138–141`). Login names are unique across all orgs.
- **Enforcement for foreign IDs**: `assertInOrganization()` / `assertOptionalInOrganization()`
  (`src/server/db/assert-in-organization.ts:17,32`) check that a referenced `_id` belongs to the same
  `organizationId`, and return "not found" otherwise. It is called from 14 files under `src/`.
- Schema-level: no cross-document org check exists in Mongoose. Each service must call the assertion.
  This is a convention, not a DB constraint.

## 5. Soft-delete, recycle bin and hidden records

Two different mechanisms. Do not confuse them.

**(a) Recycle bin (ADR-033): not a soft-delete flag.**
- `DeletionService.remove()` (`src/domains/deletion/deletion-service.ts:52`) is Super Administrator only
  (`assertSuperAdmin`). It requires the typed label to confirm, and it refuses if the plan has blockers.
- In one `withTransaction` (ADR-041, `deletion-service.ts:62`) it creates a `DeletionBatch`, copies every
  matching document into `deletedrecords`, **deletes it from the live collection**, and applies `patches`
  to records it keeps (e.g. removes a person from a shared travel order).
- `RECYCLE_BIN_DAYS = 30` (`deletion-service.ts:16`); `purgeAfter` is set on the batch.
  `purgeExpired()` (`deletion-service.ts:166`) is called by `src/app/api/cron/recycle-bin/route.ts`, scheduled in
  `vercel.json` (17:20 UTC, per `overview.md`).
- Plans and blockers per type: `src/domains/deletion/deletion-registry.ts`. Its `DELETABLE_TYPES` has
  **18** keys (`employee`, `staff-account`, `clearance`, `final-settlement`, `performance-evaluation`,
  `performance-review`, `position`, `project`, `location`, `organization-unit`, `leave-type`,
  `shift-template`, `travel-order`, `case`, `event`, `applicant`, `asset-issuance`, `employee-document`).
- Blocked while in use: positions, projects, locations, units, leave types, shifts (ADR-033).
- Restore and purge are also transactional (`deletion-service.ts:118, 157`).

**(b) `hiddenFromOthers` (ADR-034): test-data hiding, not deletion.**
- `hiddenPlugin` (`src/server/db/hidden-plugin.ts`) adds `hiddenFromOthers` (indexed) and filters it out of
  find, findOne, count, distinct, update and aggregate, unless the viewer may see hidden data
  (`visibility-context.ts:14`) or the query passes `includeHidden`.
- Applied with `schema.plugin(hiddenPlugin)` to **16 models**: Applicant, Case, ClearanceCase, DayNote,
  Employee, EvaluationFollowUp, Event, FinalSettlement, Holiday, LeaveType, Location, OrganizationUnit,
  Position, Project, ShiftTemplate, TravelOrder.
- `User` has its own `hiddenFromOthers` field (`user.ts`) and no plugin.
- Most other models have no hidden flag, so hiding does not reach them.

## 6. Effective dating (ADR-006)

Models with `effectiveFrom` (and optional `effectiveTo`; unset = still in effect), 10 in all:
`Position`, `OrganizationUnit`, `Employment`, `EmployeeAssignment`, `RoleAssignment`, `AttendancePolicy`,
`LeavePolicy`, `PayrollPolicy`, `PayrollRuleVersion`, `Compensation`.

- Current-state filter used across services: `effectiveFrom <= now AND (effectiveTo missing OR effectiveTo >= now)`
  (ADR-006). Examples: `src/domains/authorization/role-assignment-service.ts:79`,
  `src/domains/identity/security-settings-service.ts:62`, `src/domains/organization/organization-service.ts:48`.
  The shared shape is also in `deletion-registry.ts:41`.
- **Transfer is never an in-place edit** (ADR-005): `EmployeeAssignmentService.transfer()`
  (`src/domains/workforce/employee-assignment-service.ts:116`) closes the current row (sets `effectiveTo`)
  and inserts a new one, in one transaction (ADR-041).
- **Terms change keeps the same row**: `Employment.termsHistory[]` (ADR-052). `effectiveFrom` stays the hire date.
- Per ENGINEERING §16, historical state is reconstructed from these rows, not from `AuditLog`.
- `Location`, `Holiday`, `Event` and `Employee` are not effective-dated (`location.ts` comment says so).

## 7. Audit (ADR-007, ENGINEERING §35)

- `AuditService.record()` / `recordMany()` (`src/server/audit/audit-service.ts:35,41`) is the only writer
  to `AuditLog`. It is called from **122 sites in 53 files**, across almost every domain.
- Audit is written **by service code after the commit**, not by Mongoose hooks. The models have no
  `pre`/`post` audit hooks (only `hiddenPlugin` adds hooks). Example: the delete flow records
  `record.deleted` after `withTransaction` returns (`deletion-service.ts:113`).
- `AuditLog` is append-only by convention: no update or delete method is exposed (`audit-log.ts` comment).
  The DB does not enforce this.
- No model is "audited" by schema. Coverage is per call site. Not every mutation is confirmed to audit.

## 8. Transactions and integrity

- `withTransaction()` (`src/server/db/transaction.ts:20`) wraps a MongoDB session. ADR-041 limits it to
  paths that must not split: payroll recompute, recycle-bin delete/restore/purge, settlement disbursal with
  clearance close, assignment transfer. **7 files** call it.
- Compute-then-persist (ADR-014): values are computed before the transaction opens.
- Unique indexes are the main integrity guard (section 10). Callers detect the violation with
  `isDuplicateKeyError()` (`src/server/db/mongo-errors.ts:3`).

---

## 9. Seeding and index management

**Seed data** (`scripts/seed.ts`, 770 lines; run with `npm run db:seed`, per `package.json` and
`overview.md`). Idempotent by design (ENGINEERING §54):
- Permission catalog: upsert (`upsertPermissionCatalog`, `seed.ts:246`); superseded keys retired
  (`retireSupersededPermissions`, `seed.ts:258`). Literal keys are listed in `BASELINE_PERMISSIONS` (`seed.ts:51`).
- Organization: `organization ??= await OrganizationModel.create(...)` (`seed.ts:361`).
- Catalogs: `updateOne(..., { upsert: true })` with `$setOnInsert`, plus a per-key metadata backfill that
  never overwrites an org's own value (`seed.ts:505–512`).
- Guarded inserts: policies and checklist items are inserted only if none exist (`seed.ts:451`, `:636`,
  `insertMany` at `:647`).
- Super Administrator role: `system: "super_admin"` set only by the seed (`seed.ts:321`, `role.ts`).
  `assertSuperAdminRoleFree` refuses an org where it already exists elsewhere (`seed.ts:320`).
- Seeded logins: `ensureSeedAccount` (`seed.ts:297`) never touches an existing account. Passwords
  must change at first sign-in.
- Environment inputs: `SEED_HR_*` and `SEED_SUPER_ADMIN_*` (`seed.ts:277–288`). The seed refuses a partial
  Super Administrator set. Values are not recorded here.
- `scripts/seed-e2e.ts` calls the same seed against the E2E database.

**Indexes.**
- `src/server/db/connection.ts:32`: `buildsIndexesOnConnect()` returns false in production. In production,
  `autoIndex` and `autoCreate` are off (`connection.ts:58–63`). Outside production, `init()` runs on connect
  (`connection.ts:45–50`).
- `scripts/sync-indexes.ts` is the production path. It creates each model's collection and indexes
  (create-only, never drops). It lists indexes that exist in the DB but in no schema, and leaves them in
  place. Run it after any deploy that adds or changes an index (ADR-044, per ARCHITECTURE.md
  "MongoDB modeling").
- `sync-indexes` builds from `@/server/db/models` (63 models), so every index in section 2 is covered.

---

## 10. Invariants the code enforces

| invariant | enforced by |
|---|---|
| Org code is unique per org: Position, OrganizationUnit, Location, Project, Leave type, Shift template | `(organizationId, code)` **U**: `position.ts`, `organization-unit.ts`, `location.ts`, `project.ts`, `leave-type.ts`, `shift-template.ts` |
| Catalog code is unique per org (13 catalogs) | `simple-catalog-schema.ts` `(organizationId, code)` **U** |
| Role name unique per org | `role.ts` `(organizationId, name)` **U** |
| Org slug unique | `organization.ts` `slug` **U** |
| Username and email unique (sparse, global) | `user.ts` |
| Permission key unique | `permission.ts` `key` **U** |
| Employee number unique per org when present | `employee.ts` partial unique index |
| One attendance record per employee per day | `attendance-record.ts` `(org, employee, date)` **U** |
| One schedule entry per employee per day | `schedule-entry.ts` `(org, employee, date)` **U** |
| One day note per date | `day-note.ts` `(org, date)` **U** |
| One leave balance per employee, type and year | `leave-balance.ts` **U** |
| One review per employee per cycle | `performance-review.ts` **U** |
| One active follow-up per employee per due date | `evaluation-follow-up.ts` **U partial{active}** |
| Only one active clearance per employee | `clearance-case.ts` **U partial{active: true}** |
| One final settlement per clearance case | `final-settlement.ts` **U** |
| One payroll run number per org; one payroll record per run and employee | `payroll-run.ts`, `payroll-record.ts` **U** |
| One payroll rule version number per org | `payroll-rule-version.ts` **U** |
| One org chart per org | `org-chart.ts` `organizationId` **U** |
| Project-scoped role needs ≥1 project; org-wide takes none | `role-assignment.ts` `scope.projectIds` validator |
| Employment dates are coherent (rehire = new row) | ADR-005/006 pattern, `employment.ts` comment. **Service-level only** |
| Transfer closes the old row and opens a new one | `employee-assignment-service.ts:116` (transaction, ADR-041) |
| Position has no authority (display only, ENGINEERING §12) | `position.ts` comment and `evaluator-rule.ts` comment |
| Employee has no status (active = latest Employment) | `employee.ts` comment |
| Catalog codes (employment type/status, attendance status, etc.) are valid for the org | service `assertValidCode` (e.g. `src/domains/catalog/employment-type-service.ts`). **Not a schema enum** |
| Login needs a username or an email | Validation boundary, `src/shared/validation/auth.ts` (per `user.ts` comment). **Not schema-enforced** |
| Secrets never serialized (hash, MFA secrets, WebAuthn challenge, session id) | `user.ts` `stripSecrets` on `toJSON`/`toObject`. The MFA secret is encrypted by `src/server/auth/secret-box.ts` |
| Login throttle windows expire | `login-throttle.ts` TTL index |
| Recycle-bin records are restorable for 30 days, then purged | `deletion-service.ts:16, 157–170`; cron `vercel.json` |
| Super Administrator cannot be deleted and the role is seed-only | `deletion-registry.ts:144–145`; `role.ts`; `seed.ts:320` |
| Records cannot be hard-deleted outside the bin | **Not enforced.** See section 11 |
| Writes that must not split are atomic | `withTransaction` (7 call sites, ADR-041) |
| Every org-owned model is scoped | `organizationId` required (59 models) + `assertInOrganization` for foreign ids |

---

## 11. Known gaps and mismatches

Each item cites both sides. "Doc" means the file named.

1. **Model count.** The brief and planning text say 65 models. The code has **63** (`models/index.ts`
   exports 63; `simple-catalog-schema.ts` is a factory, not a model).
2. **"Soft-deleted".** Deletion is a move, not a flag. Deleted records leave the live collection and are copied
   into `deletedrecords` (`deletion-service.ts`, ADR-033). `hiddenFromOthers` (ADR-034) is test-data hiding.
   Neither is a `deletedAt` soft delete.
3. **Collection names.** `ARCHITECTURE.md` "MongoDB modeling" lists camelCase (`roleAssignments`,
   `employeeAssignments`, `auditLogs`). The real names are lowercase Mongoose defaults (`roleassignments`,
   `employeeassignments`, `auditlogs`). ENGINEERING.md §30 is also camelCase, but it is "potential," not binding.
4. **Stale `reportsToEmployeeId`.** `ARCHITECTURE.md` lines 84, 109 and 522 (and ADR-005 and ENGINEERING §32)
   describe `EmployeeAssignment.reportsToEmployeeId` and index it. The schema does not declare it
   (`employee-assignment.ts`). ADR-046 replaced it with `OrgChart`. The only read is the legacy first-visit
   import in `src/domains/workforce/org-chart-service.ts:78–91`, which reads the raw collection. The index is
   not created by `sync-indexes`.
5. **Employment status enum.** `ARCHITECTURE.md` (Workforce) says `status: active|on_leave|terminated`. The code
   stores a free string (default `"active"`) validated against the EmploymentStatus catalog (`employment.ts`).
6. **"Nothing hard-deletes".** The seed comment says no delete keys exist "because nothing in this codebase
   hard-deletes (ENGINEERING.md §53)" (`scripts/seed.ts`, permission catalog comment near line 51). Real hard
   deletes exist, each with its own guard: `leave-type-service.ts:160` (only when the type is unused),
   `payroll-run-service.ts:86–87` (cleanup of a run whose prepare failed), `payroll-run-service.ts:242`
   (`findOneAndDelete` on draft-run adjustments, documented as intentional), `final-settlement-service.ts:207`
   (draft settlement lines only), and `webauthn-service.ts:214` (`deleteMany` of a user's biometric credentials,
   no bin, no status flag). Only the first, second and fourth are clearly "unused or draft" guarded.
7. **Effective-date boundary.** ADR-006 says `effectiveTo >= now`. Most queries use `$gte`
   (`deletion-registry.ts:41`). `role-assignment-service.ts:134` and `src/domains/identity/user-directory.ts:8` use
   `$gt`. The difference only matters at the exact instant.
8. **Unindexed user lookups.** `User.employeeId` and `User.personId` have no index (`user.ts`). Yet they are queried
   in `employee-account-service.ts:94`, `clearance-service.ts:201` and `deletion-registry.ts:96`. `users` is a
   global collection, so this is a scan-risk, not a correctness issue.
9. **No `organizationId` index on `Employment`.** Its only index is `(employeeId, effectiveFrom)`
   (`employment.ts`). An org-wide "current employments" query would not be served. Whether such a query exists
   needs a grep (open question 3).
10. **Catalog comment count.** `simple-catalog-schema.ts` says the factory replaced "seven" hardcoded enums. It
    builds **13** catalogs. The comment is stale, not the code.
11. **Inline files in the DB.** `EmployeeDocument.fileData` (`employee-document.ts`) stores file bytes as a string
    inline, next to `storage.provider: vercel-blob`. A large inline file counts toward MongoDB's 16 MB document
    limit. Confirm the upload path caps size (not verified here).
12. **Compensation has no default `effectiveFrom`** (`compensation.ts`), unlike the other effective-dated models
    (default now). Required, so creation without it fails validation rather than defaulting.
13. **Users are global, orgs are not.** A login can belong to several orgs through separate `RoleAssignment`s.
    `User.username` / `email` uniqueness is global, not per org (`user.ts`).
14. **AuditLog immutability is convention only** (section 7).
15. **Doc vs code (ADR-005):** ADR-005 says `transfer()` checks that `reportsToEmployeeId` is a different employee.
    The code has no such check, because the field is not in the schema (`employee-assignment-service.ts` has no
    `reportsTo` reference; grep of `src/` finds it only in `org-chart-service.ts`).

---

## 12. Open questions

1. Are the 63 models the full set the team expects, or were two more planned (the brief says 65)?
2. For each hard delete in section 11 item 6, is the guard that keeps it to unused or draft rows always present?
3. Is there an org-wide query on `employments` (no organizationId index)? Does `sync-indexes` output on the
   production DB show any index not declared in the schemas?
4. Should `User.employeeId` and `User.personId` get indexes, given the three lookup sites in section 11 item 8?
5. Is any legacy document still carrying `reportsToEmployeeId` on `employeeassignments`? If not, can the raw-collection
   read in `org-chart-service.ts:78` be removed?
6. Does the file-upload path cap `EmployeeDocument.fileData` size, given the inline option (section 11 item 11)?
