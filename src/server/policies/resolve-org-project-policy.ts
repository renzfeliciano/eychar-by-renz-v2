import { Types, type Model } from "mongoose";

export type PolicySource = "organization" | "project";

export type PolicyResolutionResult<T> = { policy: T; source: PolicySource };

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Business dates (e.g. an attendance/leave record's own date) are calendar
 * days, but effectiveFrom/effectiveTo are full timestamps — effectiveFrom
 * defaults to the exact moment a policy is created. Comparing day-granular
 * against timestamp-granular values requires widening to the whole day on
 * both ends, otherwise a policy created at, say, 3pm today would not
 * resolve for "today" (midnight), since its effectiveFrom would be later
 * in the day than the lookup. Caught first in AttendancePolicyService
 * (ADR-011) — shared here so every future policy resolver inherits the fix
 * instead of rediscovering it.
 */
function effectiveFilter(effectiveDate: Date) {
  return {
    status: "active",
    effectiveFrom: { $lte: endOfDayUtc(effectiveDate) },
    $or: [
      { effectiveTo: { $exists: false } },
      { effectiveTo: null },
      { effectiveTo: { $gte: startOfDayUtc(effectiveDate) } },
    ],
  };
}

/**
 * Organization → Project override resolution (AGENTS.md §26): the most
 * specific active policy effective on `effectiveDate` wins, project-scoped
 * first, falling back to org-wide. Generic over the policy model so each
 * domain (Attendance, Leave, ...) keeps its own typed `resolve()` wrapper
 * — this only factors out the query shape they'd otherwise duplicate
 * (AGENTS.md §56: extracted because a second real caller showed up, not
 * pre-built for a hypothetical one).
 *
 * `model` is typed `Model<any>` rather than a minimal duck-typed interface:
 * Mongoose's real `findOne` has a multi-argument overload set that doesn't
 * structurally match a simplified single-signature interface, and each
 * call site passes a differently-shaped concrete model anyway. Callers
 * supply `T` explicitly (e.g. `resolveOrgProjectPolicy<AttendancePolicyDoc>`)
 * to get a properly typed `policy` back.
 */
export async function resolveOrgProjectPolicy<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  params: {
    organizationId: string;
    projectId?: string;
    effectiveDate: Date;
    extraFilter?: Record<string, unknown>;
  },
): Promise<PolicyResolutionResult<T> | null> {
  const orgObjectId = new Types.ObjectId(params.organizationId);
  const extraFilter = params.extraFilter ?? {};

  if (params.projectId) {
    const projectPolicy = await model
      .findOne({
        organizationId: orgObjectId,
        projectId: new Types.ObjectId(params.projectId),
        ...extraFilter,
        ...effectiveFilter(params.effectiveDate),
      })
      .sort({ effectiveFrom: -1 });
    if (projectPolicy) return { policy: projectPolicy, source: "project" };
  }

  const orgPolicy = await model
    .findOne({
      organizationId: orgObjectId,
      projectId: { $exists: false },
      ...extraFilter,
      ...effectiveFilter(params.effectiveDate),
    })
    .sort({ effectiveFrom: -1 });
  if (orgPolicy) return { policy: orgPolicy, source: "organization" };

  return null;
}
