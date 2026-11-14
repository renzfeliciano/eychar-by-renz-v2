# Performance

**Purpose:** two generations of employee appraisal. (1) The current Employee Performance Evaluation Form (PCAS-HRMD-FR-004): per-employee, event-driven evaluations filled by a rule-matched evaluator, submitted, then acknowledged. (2) The older cycle-based `PerformanceReview` (one rating per employee per `ReviewCycle`). Also records probation evaluations handled outside the system.
**Governing docs:** ADR-017 (review cycles), ADR-053 (probation evaluations outside the system), ADR-051 (evaluation form and evaluator rules; **file missing**, see gaps), ARCHITECTURE.md § Performance (Phase 8b, ADR-017), ENGINEERING.md § 20 (RBAC), § 27 (effective dating), § 33 (transactions), § 36-37 (API and services), § 46 and § 58-60 (tests).
**Services:**
- `src/domains/performance/performance-evaluation-service.ts`: `PerformanceEvaluationService.create`, `saveDraft`, `submit`, `acknowledge`, `getDetail`, `list`. Helpers `describeEmployee`, `assertCanAct`, `load`, `assertPeriod`.
- `src/domains/performance/evaluator-resolver.ts`: `resolveEvaluators(employeeId, organizationId, now)` returns `{ rule, candidates }`.
- `src/domains/performance/evaluation-actor.ts`: `resolveEvaluationActor(userId, organizationId)` returns `{ userId, employeeId, canManage }`; `canManage` is an `authorize()` check on `performance-evaluations.manage`. Exports `EVALUATION_MANAGE_PERMISSION`.
- `src/domains/performance/evaluation-template.ts`: `EVALUATION_FORM_CODE`, `RATING_SCALE` (S / A / NI), `CURRENT_TEMPLATE_VERSION` (1), `getTemplate(version)`, `criterionKeys`, `ratingLabel`. Versioned: old versions stay in `TEMPLATES`.
- `src/domains/performance/performance-review-service.ts` (legacy): `PerformanceReviewService.create`, `submit`, `listForCycle`, `listForEmployee`.
- `src/domains/performance/review-cycle-service.ts`: `ReviewCycleService.create`, `updateStatus`, `listCurrent`, `getById`.
- `src/domains/performance/review-cycle-summary.ts`: `summarizeReviewCycle` (pure: coverage, submitted count, missing ids, rating distribution, days left).
- `src/domains/performance/evaluation-follow-up-service.ts`: `EvaluationFollowUpService.record` (upsert per probation), `withdraw`, `listActive`, `listForEmployee`, `latestSubmittedByEmployee`.
- `src/domains/performance/evaluation-purpose.ts`: `regularizationEvaluationCodes(types)` from the `EvaluationType` catalog flag `isRegularization`, with legacy fallback `"regularization"`.

**Models:**
- `src/server/db/models/performance-evaluation.ts` (`PerformanceEvaluationModel`): `employeeId`, `evaluatorEmployeeId`, `evaluationFor` (catalog code), period, `templateVersion`, `ratings[]`, `goals`, `evaluatorComments`, `status` draft/submitted/acknowledged, `evaluatorOverride`, `snapshot`, `submittedAt`, `evaluatorAcknowledgment`, `employeeAcknowledgment`. No hidden plugin.
- `src/server/db/models/performance-review.ts` (`PerformanceReviewModel`): unique on `(organizationId, reviewCycleId, employeeId)`. No hidden plugin.
- `src/server/db/models/review-cycle.ts` (`ReviewCycleModel`): `status` draft/open/closed.
- `src/server/db/models/evaluation-follow-up.ts` (`EvaluationFollowUpModel`): hidden plugin applied. Partial unique index on `(organizationId, employeeId, dueKey)` where `status: active`.
- `src/server/db/models/evaluator-rule.ts` (`EvaluatorRuleModel`): `order`, `subjectPositionIds`, `subjectProjectIds`, `evaluatorPositionIds`, `evaluatorScope` (`same-project` / `organization`), `status`.
- Catalogs used: `EvaluationType` and `PerformanceRating` (`src/domains/catalog/evaluation-type-service.ts`, `performance-rating-service.ts`).

**Routes:**
- `src/app/api/performance-evaluations/route.ts`: GET (`performance-evaluations.read`), POST (`performance-evaluations.create`).
- `src/app/api/performance-evaluations/[id]/route.ts`: GET (`.read`), PATCH (`.update`).
- `src/app/api/performance-evaluations/[id]/submit/route.ts`: POST (`.update`).
- `src/app/api/performance-evaluations/[id]/acknowledge/route.ts`: POST (`.acknowledge`).
- `src/app/api/performance-evaluations/evaluators/route.ts`: GET (`.create`), wraps `resolveEvaluators`.
- `src/app/api/performance-reviews/route.ts` (GET `.read`, POST `.create`) and `src/app/api/performance-reviews/[id]/route.ts` (PATCH `.update`, calls `submit`).
- `src/app/api/review-cycles/route.ts` (GET `.read`, POST `.create`) and `src/app/api/review-cycles/[id]/route.ts` (PATCH `.update`).
- `src/app/api/evaluation-follow-ups/route.ts` (POST) and `[id]/route.ts` (DELETE = withdraw). Both use `employees.update`, not a performance permission.
- No route manages `EvaluatorRule`.

**Pages:**
- `src/app/(app)/performance/page.tsx` (evaluation list), `new-evaluation-dialog.tsx`.
- `src/app/(app)/performance/evaluations/[id]/page.tsx`: `evaluation-form.tsx`, `acknowledge-panel.tsx`, `evaluation-sheet.tsx`, `print-button.tsx`.
- `src/app/(app)/performance/cycles/page.tsx` and `create-review-cycle-dialog.tsx`.
- `src/app/(app)/performance/[id]/page.tsx`: review-cycle detail (`add-review-dialog.tsx`, `submit-review-dialog.tsx`, `cycle-status-button.tsx`).
- Cross-domain: `src/app/(app)/people/[id]/page.tsx` (legacy reviews, follow-ups), `src/app/(app)/dashboard/evaluation-follow-up-dialog.tsx` ("Mark sent" on probation rows).

**Tests:**
- `tests/domains/performance/performance-evaluation-service.test.ts` (covers `evaluator-resolver.ts` through `create`)
- `tests/domains/performance/evaluation-follow-up-service.test.ts`
- `tests/domains/performance/performance-review-service.test.ts`
- `tests/domains/performance/review-cycle-service.test.ts`, `review-cycle-summary.test.ts`
- `tests/domains/deletion/performance-deletion.test.ts`
- `tests/app/api/employment-and-evaluation-routes.test.ts` (follow-up routes)
- None for `evaluation-actor.ts`, `evaluation-template.ts`, or the evaluator-rule data.

**Rules a change must respect:**
- Authority comes from data, not role names. The evaluator of record is `evaluatorEmployeeId` on the evaluation. `assertCanAct` allows only that evaluator or a `canManage` actor (`performance-evaluation-service.ts`, lines 44-48). The `evaluation-actor.ts` header says the same (lines 276-280).
- Only a `draft` may be saved or submitted (`saveDraft` line 119, `submit` line 150). Submit requires a rating for every criterion of the evaluation's own `templateVersion` (lines 152-154).
- Criterion keys in `saveDraft` are checked against `getTemplate(evaluation.templateVersion)`, not the current version (lines 131-135). Changing the wording means a new template version, never an edit to v1 (`evaluation-template.ts` header).
- `submit` freezes names into `snapshot` (lines 162-169). Printing and `header` in `getDetail` read the snapshot first.
- Only `submitted` may be acknowledged (`acknowledge`, line 196). Acknowledgment is recorded by the evaluator or HR, not by the employee (comment lines 188-192).
- `create`: an employee cannot evaluate themselves (line 72). A non-manager must be the evaluator and must appear in `resolveEvaluators().candidates` (lines 83-90). A manager may override, and the record stores `evaluatorOverride` (line 100).
- `resolveEvaluators`: the first active rule by `order` whose subject position and project lists match (empty list = any) wins. `same-project` scope with no project on the assignment yields no candidates. Candidates must hold current employment and be current staff (`evaluator-resolver.ts`, lines 337-384).
- Review cycles move only `draft -> open -> closed` (`review-cycle-service.ts`, `ALLOWED_TRANSITIONS`).
- Legacy reviews: one per employee per cycle (unique index in `performance-review.ts`). `submit` needs a `ratingCode` that exists in the `PerformanceRating` catalog.
- Follow-ups: one active record per probation `dueKey`. `withdraw` sets `status: withdrawn` and never deletes. `latestSubmittedByEmployee` counts only `submitted` and `acknowledged`.
- Hidden test data: `EvaluationFollowUp` is hidden-plugin scoped. The other performance models are not (see `visibility.md`).

**Known gaps / mismatches:**
- **Legacy `PerformanceReview` is still writable.** `performance-evaluation.ts` (lines 6-7) says the older review "stays as read-only history". But `POST /api/performance-reviews` and `PATCH /api/performance-reviews/[id]` are live, and ARCHITECTURE.md § Performance describes the cycle flow as current.
- `PerformanceReviewService.submit` does not check that the caller is the review's `reviewerId`. Any holder of `performance-reviews.update` can submit any review in the organization (`performance-review-service.ts` lines 51-90).
- **ADR-051 is cited throughout (`evaluation-template.ts`, `evaluator-resolver.ts`, `evaluator-rule.ts`, `performance-evaluation.ts`) but the file does not exist.** `docs/architecture/adr/` has no ADR-051, and no other doc references it. ARCHITECTURE.md has no section for `PerformanceEvaluation`.
- **Evaluator rules have no editor.** `evaluator-rule.ts` says rules are "edited without a deploy", but no route or settings page handles `EvaluatorRule`. Rules come only from `scripts/seed.ts` (around line 734) and direct database edits.
- `PerformanceEvaluationService.list` returns at most 500 rows with no pagination. `describeEmployee` runs several queries per id, so `list` and `getDetail` issue many small reads.
- `EvaluationFollowUpService.record` converts `actionDate` by appending `T00:00:00Z` (line 223). That is correct for a date-only value, but no test covers a timezone edge.

**Last verified:** 6587050.
