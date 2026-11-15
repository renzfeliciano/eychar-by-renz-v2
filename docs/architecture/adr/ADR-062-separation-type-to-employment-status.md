# ADR-062: A separation type names the employment status it ends in

**Status:** Accepted, 2026-11-14 (payroll plan Phase 5a slice 2, built with Phase 5 at Gate D).
**Context:** Two lists record why someone left: the `SeparationType` picked when HR opens a clearance, and the employment status set when HR ends the employment. Nothing linked them, so a clearance could say "Resignation" while the employment said "Terminated", and final pay depends on which is true.

## Decision

1. **Catalog metadata, not a new field:** each separation type may carry `metadata.employmentStatusCode`, the same pattern as `isActiveHeadcount` (ENGINEERING.md §2).
2. **Defaults for seeded types** so existing data reads right without a migration: resignation → resigned, termination → terminated. End of contract, retirement, redundancy and death have no default; an explicit value (or an explicit empty one) wins (`employmentStatusForSeparation`).
3. **Final pay checks it:** when a mapping exists and the employment ended with another status (or hasn't ended by the last working day), the `employment_not_ended` check fires (ADR-061).

## Consequences

- There is no settings screen for the mapping yet; it is set as catalog metadata (gaps B26).
- Scheduled ends (resignation with notice) and a separation-pay line are separate, later changes (payroll plan Phase 5a slices 3–4).
