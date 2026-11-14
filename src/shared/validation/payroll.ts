import { z } from "zod";
import { calendarDateSchema, dateSpanInDays } from "./schedule";
import { objectId } from "@/shared/validation/object-id";
import { PAY_PREMIUM_DEFAULTS } from "@/domains/payroll/engine/premiums";
import { HOLIDAY_DAY_TYPE_CHOICES } from "@/domains/payroll/holiday-day-types";

const PAY_FREQUENCY = z.enum(["weekly", "semi-monthly", "monthly"]);
const optionalId = z.string().max(200).trim().min(1).optional();
const money = (label: string) => z.coerce.number({ message: `${label} must be a number` }).min(0, `${label} can't be negative`);

// ── Compensation ──────────────────────────────────────────────────────────

const allowanceSchema = z.object({
  name: z.string().trim().min(1, "Name each allowance").max(60),
  amount: money("Allowance amount"),
  basis: z.enum(["monthly", "daily"]).default("monthly"),
  taxable: z.boolean().default(false),
});

const compensationTermsSchema = z.object({
  organizationId: objectId(),
  rateType: z.enum(["monthly", "daily"]),
  rate: money("Rate").refine((value) => value > 0, "Rate must be more than zero"),
  allowances: z.array(allowanceSchema).max(20).default([]),
  minimumWageEarner: z.boolean().default(false),
  effectiveFrom: calendarDateSchema.optional(),
  reason: z.string().trim().max(200).optional(),
});

export const createCompensationSchema = compensationTermsSchema.extend({ employeeId: objectId() });
export const reviseCompensationSchema = compensationTermsSchema;

export const BULK_CHANGE_TYPES = ["set_rate", "increase_amount", "increase_percent", "raise_to_minimum"] as const;

export const bulkCompensationChangeSchema = z.object({
  organizationId: objectId(),
  projectId: optionalId,
  rateType: z.enum(["monthly", "daily"]).optional(),
  changeType: z.enum(BULK_CHANGE_TYPES),
  value: z.coerce.number().refine((value) => value > 0, "Enter an amount or percentage above zero"),
  effectiveFrom: calendarDateSchema,
  reason: z.string().trim().min(3, "Give a reason, e.g. the wage order number").max(200),
  /** Apply to just these (from the preview); omitted means everyone the preview would change. */
  employeeIds: z.array(objectId()).max(5000).optional(),
});

// ── Policy and rule versions ──────────────────────────────────────────────

const premiumMultiplier = (what: string, fallback: number) => z.coerce.number().min(1, `${what} can't be below the regular rate`).max(5).default(fallback);
const holidayDayType = z.enum(HOLIDAY_DAY_TYPE_CHOICES);

export const createPayrollPolicySchema = z.object({
  organizationId: objectId(),
  projectId: optionalId,
  name: z.string().trim().min(1).max(80),
  payFrequency: PAY_FREQUENCY,
  workDaysPerYear: z.coerce.number().int().min(1).max(366).default(261),
  hoursPerDay: z.coerce.number().min(1).max(24).default(8),
  finalPayDeadlineDays: z.coerce.number().int().min(1).max(365).default(30),
  workWeekDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one workday").default([1, 2, 3, 4, 5]),
  deductLateAndUndertime: z.boolean().default(true),
  contributionTiming: z.enum(["every_cutoff", "last_cutoff_of_month"]).default("every_cutoff"),
  // Multiples of the hourly / daily rate (1.25 = 125%).
  overtimeMultiplier: z.coerce.number().min(1, "Overtime pay can't be below the regular rate").max(5).default(PAY_PREMIUM_DEFAULTS.overtimeMultiplier),
  restDayMultiplier: z.coerce.number().min(1, "Rest day pay can't be below the regular rate").max(5).default(PAY_PREMIUM_DEFAULTS.restDayMultiplier),
  thirteenthMonthDivisor: z.coerce.number().min(1, "The 13th month divisor must be at least 1").max(24).default(PAY_PREMIUM_DEFAULTS.thirteenthMonthDivisor),
  // Holiday and night premiums (attendance plan Phase 5, GATE 3).
  specialHolidayMultiplier: premiumMultiplier("Special day pay", PAY_PREMIUM_DEFAULTS.specialHolidayMultiplier),
  specialHolidayRestDayMultiplier: premiumMultiplier("Special day on a rest day", PAY_PREMIUM_DEFAULTS.specialHolidayRestDayMultiplier),
  regularHolidayMultiplier: premiumMultiplier("Regular holiday pay", PAY_PREMIUM_DEFAULTS.regularHolidayMultiplier),
  regularHolidayRestDayMultiplier: premiumMultiplier("Regular holiday on a rest day", PAY_PREMIUM_DEFAULTS.regularHolidayRestDayMultiplier),
  premiumOvertimeMultiplier: premiumMultiplier("Overtime on a premium day", PAY_PREMIUM_DEFAULTS.premiumOvertimeMultiplier),
  nightDifferentialRate: z.coerce.number().min(0).max(1, "Night differential is a share of the hourly rate (0.10 = 10%)").default(PAY_PREMIUM_DEFAULTS.nightDifferentialRate),
  // What each holiday type counts as (attendance plan Phase 4); unset types use the defaults.
  holidayDayTypes: z.object({ regular: holidayDayType, special_non_working: holidayDayType, special_working: holidayDayType }).partial().optional(),
  effectiveFrom: calendarDateSchema.optional(),
});

export const updatePayrollPolicyStatusSchema = z.object({
  organizationId: objectId(),
  status: z.enum(["active", "inactive"]).optional(),
  effectiveTo: z.coerce.date().optional(),
});

const taxBracketSchema = z.object({
  minIncome: money("Minimum income"),
  maxIncome: money("Maximum income").nullish(),
  rate: z.coerce.number().min(0).max(1, "Rates are fractions, e.g. 0.15 for 15%"),
  baseDeduction: money("Base tax").default(0),
});

const contributionRowSchema = z.object({
  from: money("From"),
  to: money("To").nullish(),
  employeeRate: z.coerce.number().min(0).max(1).nullish(),
  employerRate: z.coerce.number().min(0).max(1).nullish(),
  employeeAmount: money("Employee amount").nullish(),
  employerAmount: money("Employer amount").nullish(),
  extraAmount: money("Extra amount").nullish(),
});

const contributionRuleSchema = z.object({
  code: z.string().trim().min(1).max(12),
  name: z.string().trim().min(1).max(60),
  floor: money("Floor").nullish(),
  ceiling: money("Ceiling").nullish(),
  extraLabel: z.string().trim().max(20).nullish(),
  rows: z.array(contributionRowSchema).max(200).min(1, "Each contribution needs at least one row"),
});

// Form 2316 box map (payroll plan Phase 4): see engine/year-end-tax.ts.
const form2316BoxSchema = z.object({
  box: z.string().trim().min(1).max(8),
  label: z.string().trim().min(1).max(120),
  part: z.enum(["non_taxable", "taxable"]),
  codes: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  minimumWage: z.enum(["any", "mwe", "non_mwe"]).nullish(),
  taxable: z.enum(["any", "yes", "no"]).nullish(),
  lessContributions: z.boolean().nullish(),
  capped: z.boolean().nullish(),
  overflowTo: z.string().trim().max(8).nullish(),
});

export const createPayrollRuleVersionSchema = z.object({
  organizationId: objectId(),
  projectId: optionalId,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  effectiveFrom: calendarDateSchema.optional(),
  basedOnVersionId: optionalId,
  taxTables: z
    .array(z.object({ payFrequency: PAY_FREQUENCY, brackets: z.array(taxBracketSchema).max(100).min(1, "Each tax table needs at least one bracket") }))
    .min(1, "Add at least one withholding tax table"),
  contributions: z.array(contributionRuleSchema).max(50).default([]),
  // Year-end (Phase 4): optional; a version without an annual table can't be used for a year-end run.
  annualTaxTable: z.array(taxBracketSchema).max(100).optional(),
  benefitsExemptionCap: money("Benefits exemption").nullish(),
  form2316Boxes: z.array(form2316BoxSchema).max(80).optional(),
  form2316Excluded: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
});

export const updatePayrollRuleVersionStatusSchema = z.object({
  organizationId: objectId(),
  status: z.enum(["active", "inactive"]).optional(),
  effectiveTo: z.coerce.date().optional(),
});

// ── Runs ──────────────────────────────────────────────────────────────────

export const MAX_PAY_PERIOD_DAYS = 31;

export const createPayrollRunSchema = z
  .object({
    organizationId: objectId(),
    projectId: optionalId,
    payPeriodStart: calendarDateSchema,
    payPeriodEnd: calendarDateSchema,
    payDate: calendarDateSchema,
  })
  .refine((input) => input.payPeriodEnd >= input.payPeriodStart, { message: "The period can't end before it starts.", path: ["payPeriodEnd"] })
  .refine((input) => input.payPeriodEnd < input.payPeriodStart || dateSpanInDays(input.payPeriodStart, input.payPeriodEnd) <= MAX_PAY_PERIOD_DAYS, {
    message: `A pay period can be at most ${MAX_PAY_PERIOD_DAYS} days.`,
    path: ["payPeriodEnd"],
  })
  .refine((input) => input.payDate >= input.payPeriodStart, { message: "The pay date can't be before the period starts.", path: ["payDate"] });

/** A 13th-month run for one calendar year (payroll plan Phase 3). */
export const createThirteenthMonthRunSchema = z
  .object({
    organizationId: objectId(),
    projectId: optionalId,
    year: z.coerce.number().int().min(2000).max(2100),
    payDate: calendarDateSchema,
  })
  .refine((input) => Number(input.payDate.slice(0, 4)) >= input.year, { message: "Pay the 13th month in its year or later.", path: ["payDate"] });

export const createYearEndRunSchema = z
  .object({
    organizationId: objectId(),
    projectId: optionalId,
    year: z.coerce.number().int().min(2000).max(2100),
    payDate: calendarDateSchema,
  })
  .refine((input) => Number(input.payDate.slice(0, 4)) >= input.year, { message: "Settle the year's tax in that year or later.", path: ["payDate"] });

const dateInYear = calendarDateSchema.nullish();
export const priorEmploymentSchema = z
  .object({
    organizationId: objectId(),
    employeeId: objectId(),
    year: z.coerce.number().int().min(2000).max(2100),
    employerName: z.string().trim().min(1, "Name the previous employer").max(160),
    employerTin: z.string().trim().max(20).nullish(),
    employerAddress: z.string().trim().max(300).nullish(),
    employerZipCode: z.string().trim().max(10).nullish(),
    periodFrom: dateInYear,
    periodTo: dateInYear,
    taxableCompensation: money("Taxable compensation"),
    nonTaxableCompensation: money("Non-taxable compensation").default(0),
    taxWithheld: money("Tax withheld").default(0),
    concurrent: z.boolean().default(false),
  })
  .refine((input) => [input.periodFrom, input.periodTo].every((date) => !date || Number(date.slice(0, 4)) === input.year), { message: "The period must be within the year.", path: ["periodFrom"] })
  .refine((input) => !input.periodFrom || !input.periodTo || input.periodFrom <= input.periodTo, { message: "The period ends before it starts.", path: ["periodTo"] });

// The employer's BIR registration for Form 2316 (payroll plan Phase 4).
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((value) => value || undefined);
export const employerTaxSchema = z.object({
  organizationId: objectId(),
  tin: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || undefined)
    .refine((value) => !value || /^\d{3}-?\d{3}-?\d{3}(-?\d{3,5})?$/.test(value), "Enter the TIN as 9 to 14 digits, e.g. 123-456-789-000"),
  registeredName: optionalText(160),
  registeredAddress: optionalText(300),
  zipCode: optionalText(10),
  rdoCode: optionalText(10),
});

export const thirteenthMonthTrueUpSchema = z.object({ organizationId: objectId(), year: z.coerce.number().int().min(2000).max(2100) });

export const payrollRunActionSchema = z.discriminatedUnion("action", [
  z.object({ organizationId: objectId(), action: z.literal("recompute") }),
  z.object({
    organizationId: objectId(),
    action: z.literal("submit"),
    note: z.string().trim().max(500).optional(),
    // A reason for each employee the run leaves out (e.g. no pay terms yet): HR confirms they know.
    exclusionReasons: z
      .array(z.object({ employeeId: objectId(), reason: z.string().trim().min(3, "Give a reason for each employee left out").max(200) }))
      .max(1000)
      .optional(),
  }),
  z.object({ organizationId: objectId(), action: z.literal("approve"), note: z.string().trim().max(500).optional() }),
  z.object({ organizationId: objectId(), action: z.literal("return"), reason: z.string().trim().min(3, "Say what needs fixing").max(500) }),
  z.object({
    organizationId: objectId(),
    action: z.literal("release"),
    releasedOn: calendarDateSchema,
    paymentReference: z.string().trim().max(120).optional(),
  }),
  z.object({ organizationId: objectId(), action: z.literal("cancel"), reason: z.string().trim().min(3, "Give a reason for cancelling").max(500) }),
]);

export const payrollAdjustmentSchema = z.object({
  organizationId: objectId(),
  employeeId: objectId(),
  category: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1, "Describe the adjustment").max(80),
  direction: z.enum(["earning", "deduction"]),
  amount: money("Amount").refine((value) => value > 0, "Amount must be more than zero"),
  taxable: z.boolean().default(false),
  notes: z.string().trim().max(300).optional(),
});

// ── Schedules ─────────────────────────────────────────────────────────────

const scheduleFieldsSchema = z.object({
  organizationId: objectId(),
  projectId: optionalId,
  name: z.string().trim().min(1).max(80),
  payFrequency: PAY_FREQUENCY,
  cutoffDay: z.coerce.number().int().min(0).max(31),
  payDateOffsetDays: z.coerce.number().int().min(0).max(31).default(5),
  autoPrepare: z.boolean().default(true),
  startsOn: calendarDateSchema.optional(),
});

function validCutoffDay(input: { payFrequency: string; cutoffDay: number }) {
  if (input.payFrequency === "weekly") return input.cutoffDay >= 0 && input.cutoffDay <= 6;
  if (input.payFrequency === "semi-monthly") return input.cutoffDay >= 1 && input.cutoffDay <= 15;
  return input.cutoffDay >= 1 && input.cutoffDay <= 31;
}

const CUTOFF_MESSAGE = "Semi-monthly cutoffs end on day 1–15, monthly on day 1–31, weekly on a weekday.";

export const createPayrollScheduleSchema = scheduleFieldsSchema.refine(validCutoffDay, { message: CUTOFF_MESSAGE, path: ["cutoffDay"] });

export const updatePayrollScheduleSchema = scheduleFieldsSchema
  .partial()
  .extend({ organizationId: objectId(), status: z.enum(["active", "inactive"]).optional() })
  .refine((input) => input.payFrequency === undefined || input.cutoffDay === undefined || validCutoffDay(input as { payFrequency: string; cutoffDay: number }), {
    message: CUTOFF_MESSAGE,
    path: ["cutoffDay"],
  });

export type CreateCompensationInput = z.infer<typeof createCompensationSchema>;
export type ReviseCompensationInput = z.infer<typeof reviseCompensationSchema>;
export type BulkCompensationChangeInput = z.infer<typeof bulkCompensationChangeSchema>;
export type CreatePayrollPolicyInput = z.infer<typeof createPayrollPolicySchema>;
export type UpdatePayrollPolicyStatusInput = z.infer<typeof updatePayrollPolicyStatusSchema>;
export type CreatePayrollRuleVersionInput = z.infer<typeof createPayrollRuleVersionSchema>;
export type UpdatePayrollRuleVersionStatusInput = z.infer<typeof updatePayrollRuleVersionStatusSchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type CreateThirteenthMonthRunInput = z.infer<typeof createThirteenthMonthRunSchema>;
export type CreateYearEndRunInput = z.infer<typeof createYearEndRunSchema>;
export type PriorEmploymentInput = z.infer<typeof priorEmploymentSchema>;
export type EmployerTaxInput = z.infer<typeof employerTaxSchema>;
export type PayrollRunActionInput = z.infer<typeof payrollRunActionSchema>;
export type PayrollAdjustmentInput = z.infer<typeof payrollAdjustmentSchema>;
export type CreatePayrollScheduleInput = z.infer<typeof createPayrollScheduleSchema>;
export type UpdatePayrollScheduleInput = z.infer<typeof updatePayrollScheduleSchema>;
