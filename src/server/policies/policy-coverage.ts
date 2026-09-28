type PolicyLike = { projectId?: { toString(): string } | null; status?: string | null; effectiveTo?: Date | string | null };

/**
 * How an organization's effective-dated policies (attendance, leave, payroll)
 * are laid out: how many are in force, the organization-wide ones, and the
 * project overrides, for each policy screen's summary strip.
 */
export function policyCoverage(policies: PolicyLike[], now: Date = new Date()) {
  const inForce = policies.filter((policy) => policy.status !== "inactive" && (!policy.effectiveTo || new Date(policy.effectiveTo) > now));
  const overrides = inForce.filter((policy) => policy.projectId);
  return {
    inForce: inForce.length,
    orgWide: inForce.length - overrides.length,
    projectOverrides: overrides.length,
    projectsWithOwn: new Set(overrides.map((policy) => policy.projectId!.toString())).size,
    retired: policies.length - inForce.length,
  };
}
