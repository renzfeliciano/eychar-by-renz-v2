import { Types } from "mongoose";
import { HolidayModel } from "@/server/db/models";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";
import { pickHoliday, placeNamesOf, previousWorkdayStatus, type HolidayLean } from "@/domains/attendance/day-holiday";
import type { PremiumAttendance } from "./engine/compute-pay";
import { payPremiumsOf, type PayPremiums } from "./engine/premiums";
import { holidayDayTypesOf } from "./holiday-day-types";
import type { PremiumSummaryInputs } from "./payroll-attendance";

/**
 * Bumped whenever the premium formulas change (engine/premium-pay.ts), and
 * stored on every record a run computes premiums for. 1: GATE 3 (2026-11-14).
 */
export const PREMIUM_ENGINE_VERSION = 1;

type AttendanceRow = {
  _id: Types.ObjectId;
  employeeId: Types.ObjectId;
  date: Date;
  status: string;
  dayResult?: { calcVersion?: number | null } | null;
};

type PolicyRow = { _id: Types.ObjectId; hoursPerDay?: number | null; holidayDayTypes?: Record<string, string | null> | null } & { [K in keyof PayPremiums]?: number | null };

/**
 * What a run that computes premiums needs beyond attendance (attendance plan
 * Phase 5): the period's active holidays, mapped through the run's payroll
 * policy and applied where each employee works (their project as of the
 * period end), and for each unworked regular holiday whether the workday
 * before was attended or on leave. Loaded once per run; the previous-workday
 * lookups happen only for unworked regular holidays.
 */
export async function loadPremiumContext(input: {
  organizationId: string;
  policy: PolicyRow;
  periodDays: string[];
  attendance: AttendanceRow[];
  projectByEmployee: Map<string, string | null | undefined>;
}) {
  const { organizationId, policy, periodDays } = input;
  const mapping = holidayDayTypesOf(policy);
  const holidays = await HolidayModel.find({
    organizationId: new Types.ObjectId(organizationId),
    status: "active",
    date: { $gte: dateKeyToDate(periodDays[0]), $lte: dateKeyToDate(periodDays[periodDays.length - 1]) },
  })
    .select("date type scope")
    .sort({ _id: 1 })
    .lean<(HolidayLean & { date: Date })[]>();
  const holidaysByDate = new Map<string, HolidayLean[]>();
  for (const holiday of holidays) {
    const key = dateToDateKey(holiday.date);
    holidaysByDate.set(key, [...(holidaysByDate.get(key) ?? []), holiday]);
  }
  const anyScoped = holidays.some((holiday) => holiday.scope?.trim());
  const placesByProject = new Map<string, Promise<string[]>>();
  const placesOf = (projectId: string | undefined) => {
    if (!anyScoped || !projectId) return Promise.resolve([]);
    let places = placesByProject.get(projectId);
    if (!places) placesByProject.set(projectId, (places = placeNamesOf(organizationId, projectId)));
    return places;
  };

  const recordsByEmployee = new Map<string, AttendanceRow[]>();
  for (const record of input.attendance) {
    const key = record.employeeId.toString();
    recordsByEmployee.set(key, [...(recordsByEmployee.get(key) ?? []), record]);
  }

  return {
    async inputsFor(employeeId: string): Promise<PremiumSummaryInputs> {
      const projectId = input.projectByEmployee.get(employeeId) ?? undefined;
      const places = await placesOf(projectId);
      const workedOn = new Set((recordsByEmployee.get(employeeId) ?? []).filter((record) => record.status !== "absent" && record.status !== "on_leave").map((record) => dateToDateKey(record.date)));
      const hoursPerDay = typeof policy.hoursPerDay === "number" ? policy.hoursPerDay : undefined;
      const result: PremiumSummaryInputs = { holidays: new Map(), previousWorkday: new Map(), regularMinutesCap: hoursPerDay ? Math.round(hoursPerDay * 60) : undefined };
      for (const [date, dayHolidays] of holidaysByDate) {
        const holiday = pickHoliday(dayHolidays, places, mapping);
        if (!holiday) continue;
        result.holidays.set(date, { dayType: holiday.dayType, dayOff: holiday.dayOff });
        if (holiday.dayType === "regular_holiday" && holiday.dayOff && !workedOn.has(date)) {
          const before = await previousWorkdayStatus({ organizationId, employeeId, date, projectId });
          result.previousWorkday.set(date, before ? { attended: before.attended, onLeave: before.onLeave } : null);
        }
      }
      return result;
    },

    /** What the premium lines were computed from, stored on the payroll record (§28, §46). */
    snapshot(employeeId: string, premiums: PremiumAttendance) {
      const recordByDate = new Map((recordsByEmployee.get(employeeId) ?? []).map((record) => [dateToDateKey(record.date), record]));
      return {
        engineVersion: PREMIUM_ENGINE_VERSION,
        payrollPolicyId: policy._id,
        rates: payPremiumsOf(policy),
        holidayDayTypes: mapping,
        days: premiums.days.map((day) => {
          const record = recordByDate.get(day.date);
          return { ...day, attendanceRecordId: record?._id, calcVersion: record?.dayResult?.calcVersion ?? undefined };
        }),
        unworkedRegularHolidaysPaid: premiums.unworkedRegularHolidaysPaid,
        regularHolidaysAbsentBefore: premiums.regularHolidaysAbsentBefore,
        unapprovedOvertimeMinutes: premiums.unapprovedOvertimeMinutes,
        missingCheckoutDays: premiums.missingCheckoutDays,
        withoutDayResult: premiums.withoutDayResult,
      };
    },
  };
}
