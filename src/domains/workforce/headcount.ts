import { EmployeeService } from "./employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";

export type Headcount = {
  /** Current staff (the dashboard's active-headcount rule). */
  total: number;
  byUnit: Map<string, number>;
  byPosition: Map<string, number>;
  byProject: Map<string, number>;
  byLocation: Map<string, number>;
  /** Current staff with no unit, position, project or location on their current assignment. */
  unassigned: { unit: number; position: number; project: number; location: number };
};

function increment(map: Map<string, number>, key: unknown) {
  if (!key) return false;
  const id = String(key);
  map.set(id, (map.get(id) ?? 0) + 1);
  return true;
}

/** Current staff counted by where their current assignment places them, for the organization screens. */
export async function loadHeadcount(organizationId: string): Promise<Headcount> {
  const [roster, isCurrentStaff] = await Promise.all([EmployeeService.listWithCurrentStatus(organizationId), loadCurrentStaffCheck(organizationId)]);
  const headcount: Headcount = {
    total: 0,
    byUnit: new Map(),
    byPosition: new Map(),
    byProject: new Map(),
    byLocation: new Map(),
    unassigned: { unit: 0, position: 0, project: 0, location: 0 },
  };
  for (const employee of roster) {
    if (!isCurrentStaff(employee.currentEmployment?.status)) continue;
    headcount.total += 1;
    const assignment = employee.currentAssignment;
    if (!increment(headcount.byUnit, assignment?.organizationUnitId)) headcount.unassigned.unit += 1;
    if (!increment(headcount.byPosition, assignment?.positionId)) headcount.unassigned.position += 1;
    if (!increment(headcount.byProject, assignment?.projectId)) headcount.unassigned.project += 1;
    if (!increment(headcount.byLocation, assignment?.locationId)) headcount.unassigned.location += 1;
  }
  return headcount;
}
