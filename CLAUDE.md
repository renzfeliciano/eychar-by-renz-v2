@AGENTS.md

# Knowledge base rule (every session)

The `knowledge/` folder is this project's memory. Do not start from scratch each session.

**Index (loaded automatically):** @knowledge/README.md

**Where things live:** `knowledge/` has `overview.md`, `CHANGE_PROTOCOL.md`, `known-gaps-and-mismatches.md` at the top, plus `reference/` (layers, cross-cutting, data-model, authorization, ui-patterns, testing, philippine-payroll-compliance), `domains/` (one file per domain; payroll and workforce each cover two parts) and `plans/` (one file per feature). Architecture and engineering rules are `docs/architecture/ARCHITECTURE.md` and `docs/engineering/ENGINEERING.md`; decisions are in `docs/architecture/adr/`.

**New specs, designs and plans go in `knowledge/plans/<feature>.md`** (one file per feature: design first, then the implementation plan), not in a new `docs/superpowers/` folder. If a skill defaults to another path, override it with this one. Do not add loose `.md` files to the repo root or the top of `knowledge/`.

1. **Before any task**, read `knowledge/overview.md`, then the `knowledge/domains/<domain>.md` file(s) for the area the task touches. Use the README index above to pick the right files (data model, authorization, payroll compliance, UI patterns, testing, etc.).
2. **Before planning a change**, follow `knowledge/CHANGE_PROTOCOL.md` and check `knowledge/known-gaps-and-mismatches.md` before deciding a behavior is intended. Check `knowledge/plans/` for an existing plan covering the work.
3. **Cite, then verify.** Knowledge files can lag the code (see each file's "Last verified" line). Code wins over docs: if they disagree, verify in the source, tell the user, and fix the knowledge file.
4. **Every change updates `knowledge/` in the same change. No exceptions.** Before calling work done, check which knowledge files the change touched and update them:
   - the `domains/<domain>.md` file(s) for the area changed;
   - `reference/data-model.md` (models, indexes, relations), `reference/authorization.md` (permissions, roles, scope), `reference/ui-patterns.md`, `reference/testing.md`, `reference/cross-cutting.md`, `reference/philippine-payroll-compliance.md` where the change affects them;
   - `known-gaps-and-mismatches.md` when you find, fix, or create a mismatch or open decision;
   - the relevant plan in `knowledge/plans/` (progress, decisions, what is done);
   - `knowledge/README.md` when you add, rename, or remove a knowledge file;
   - the "Last verified" line of every file you touched.
   If a change truly needs no knowledge update, say so explicitly in the final summary.
5. **Record new learning.** If you discover something non-obvious (a gotcha, a decision, a mismatch), write it to the relevant knowledge file before finishing, so the next session does not rediscover it.
