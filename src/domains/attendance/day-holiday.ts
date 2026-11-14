import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel, HolidayModel, LeaveRequestModel, LocationModel, ProjectModel } from "@/server/db/models";
import { addDays, dateKeyToDate, weekdayOf } from "@/lib/date-key";
import type { HolidayType } from "@/domains/holidays/holiday-types";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { holidayDayTypesOf, isDayOffDayType, type HolidayDayType, type HolidayDayTypes } from "@/domains/payroll/holiday-day-types";
import { AttendancePolicyService } from "./attendance-policy-service";
import { ScheduleService } from "./schedule-service";

/**
 * The holiday side of the stored day result (plan Phase 4). The holiday
 * calendar (HR data, ADR-035) says which days are holidays; the payroll
 * policy's holidayDayTypes say what each type counts as. Nothing here knows
 * a rate: whether an unworked holiday is paid is a payroll rule (Phase 5),
 * this only records the facts it needs.
 */

export type DayHoliday = { holidayId: Types.ObjectId; dayType: Exclude<HolidayDayType, "workday">; dayOff: boolean };

export type HolidayLean = { _id: Types.ObjectId; type: HolidayType; scope?: string | null };

/** Stronger first: when two holidays share a day, the stronger day type counts. */
const STRENGTH: Record<HolidayDayType, number> = { regular_holiday: 3, special_holiday: 2, special_working: 1, workday: 0 };

const normalize = (text: string) => text.trim().toLowerCase();

/** The names a local holiday's scope can match: the project's location name and code. */
export async function placeNamesOf(organizationId: string, projectId: string | undefined): Promise<string[]> {
  if (!projectId) return [];
  const project = await ProjectModel.findOne({ _id: new Types.ObjectId(projectId), organizationId: new Types.ObjectId(organizationId) }).select("locationId").lean<{ locationId?: Types.ObjectId | null }>();
  if (!project?.locationId) return [];
  const location = await LocationModel.findOne({ _id: project.locationId, organizationId: new Types.ObjectId(organizationId) }).select("name code").lean<{ name: string; code: string }>();
  return location ? [normalize(location.name), normalize(location.code)] : [];
}

/**
 * The holiday that applies to a day, mapped to its day type; null when none
 * does. Only active holidays. A holiday with no scope applies everywhere; a
 * scoped one ("Cebu City") only when the employee's project is at a location
 * of that name or code. A type the policy maps to "workday" isn't observed.
 */
export async function holidayForDay(input: { organizationId: string; dateKey: string; projectId?: string; mapping: HolidayDayTypes }): Promise<DayHoliday | null> {
  await connectMongoDB();
  const holidays = await HolidayModel.find({ organizationId: new Types.ObjectId(input.organizationId), date: dateKeyToDate(input.dateKey), status: "active" })
    .select("type scope")
    .sort({ _id: 1 })
    .lean<HolidayLean[]>();
  if (holidays.length === 0) return null;

  const places = holidays.some((holiday) => holiday.scope?.trim()) ? await placeNamesOf(input.organizationId, input.projectId) : [];
  return pickHoliday(holidays, places, input.mapping);
}

/**
 * Of one day's active holidays, the one that applies where the employee
 * works (`places`: placeNamesOf their project), mapped to its day type; the
 * stronger day type wins (a regular holiday over a special day). Pure, so
 * payroll can apply it to a whole period's holidays at once.
 */
export function pickHoliday(holidays: HolidayLean[], places: string[], mapping: HolidayDayTypes): DayHoliday | null {
  let best: DayHoliday | null = null;
  for (const holiday of holidays) {
    if (holiday.scope?.trim() && !places.includes(normalize(holiday.scope))) continue;
    const dayType = mapping[holiday.type];
    if (!dayType || dayType === "workday") continue;
    if (best && STRENGTH[best.dayType] >= STRENGTH[dayType]) continue;
    best = { holidayId: holiday._id, dayType, dayOff: isDayOffDayType(dayType) };
  }
  return best;
}

export type PreviousWorkday = { date: Date; attended: boolean; onLeave: boolean };

/** How far back the previous workday is looked for (a long run of rest days and holidays). */
const PREVIOUS_WORKDAY_LOOKBACK_DAYS = 14;

/**
 * The employee's last workday before `date`, and whether they attended it
 * or were on approved leave: the facts the unworked-holiday rule needs (plan
 * Phase 4; the rule itself is payroll's, Phase 5). Rest days come from the
 * schedule entry first, then the attendance policy's work week as of that
 * day; day-off holidays are skipped too. Works whether or not the employee
 * has a record on `date` itself. Null when no workday is found in the
 * lookback.
 */
export async function previousWorkdayStatus(input: { organizationId: string; employeeId: string; date: string; projectId?: string }): Promise<PreviousWorkday | null> {
  await connectMongoDB();
  const { organizationId, employeeId } = input;

  for (let back = 1; back <= PREVIOUS_WORKDAY_LOOKBACK_DAYS; back++) {
    const dateKey = addDays(input.date, -back);
    const date = dateKeyToDate(dateKey);
    const projectId = input.projectId ?? (await EmployeeAssignmentService.getAsOf(employeeId, date))?.projectId?.toString();
    const entry = await ScheduleService.getEntryForDate(organizationId, employeeId, dateKey);
    let restDay: boolean;
    if (entry) restDay = entry.shift.kind === "rest";
    else {
      const policy = await AttendancePolicyService.resolve({ organizationId, projectId, effectiveDate: date });
      restDay = policy ? !(policy.policy.workDays ?? []).includes(weekdayOf(dateKey)) : false;
    }
    if (restDay) continue;
    const payroll = await PayrollPolicyService.resolve({ organizationId, projectId, effectiveDate: date });
    const holiday = await holidayForDay({ organizationId, dateKey, projectId, mapping: holidayDayTypesOf(payroll?.policy) });
    if (holiday?.dayOff) continue;

    const ids = { organizationId: new Types.ObjectId(organizationId), employeeId: new Types.ObjectId(employeeId) };
    const [record, leave] = await Promise.all([
      AttendanceRecordModel.exists({ ...ids, date, checkInAt: { $ne: null } }),
      LeaveRequestModel.exists({ ...ids, status: "approved", startDate: { $lte: date }, endDate: { $gte: date } }),
    ]);
    return { date, attended: Boolean(record), onLeave: Boolean(leave) };
  }
  return null;
}
