import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";

/**
 * The dashboard's "who counts as current staff" rule: an employment status
 * whose catalog item is flagged `isActiveHeadcount`. With no status catalog
 * configured yet, everyone counts. Shared by the schedule grid and the
 * attendance export so both list the same people.
 */
export async function loadCurrentStaffCheck(organizationId: string): Promise<(status: string | undefined | null) => boolean> {
  const statuses = await EmploymentStatusService.listCurrent(organizationId);
  const activeCodes = new Set(statuses.filter((status) => status.metadata?.isActiveHeadcount).map((status) => status.code));
  return (status) => activeCodes.size === 0 || (typeof status === "string" && activeCodes.has(status));
}
