import { Schema, model, models, type InferSchemaType } from "mongoose";

const earningLineSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    taxable: { type: Boolean, required: true },
  },
  { _id: false },
);

const deductionLineSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const contributionLineSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    employee: { type: Number, required: true },
    employer: { type: Number, required: true },
    extra: { type: Number, required: true, default: 0 },
    extraLabel: { type: String },
  },
  { _id: false },
);

const warningSchema = new Schema(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    blocking: { type: Boolean, required: true },
  },
  { _id: false },
);

// One employee's payslip in one run: every figure computed once and stored,
// with the inputs (rate, attendance) that produced it, so it can be
// explained and reproduced later (ENGINEERING.md §28). Name and number are
// snapshotted too: the payslip reads the same after a later rename.
const payrollRecordSchema = new Schema(
  {
    payrollRunId: { type: Schema.Types.ObjectId, required: true, ref: "PayrollRun" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    employeeNumber: { type: String, required: true },
    employeeName: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    compensationId: { type: Schema.Types.ObjectId, ref: "Compensation" },
    rateType: { type: String, enum: ["monthly", "daily"], required: true },
    rate: { type: Number, required: true },
    monthlyBasic: { type: Number, required: true },
    dailyRate: { type: Number, required: true },
    hourlyRate: { type: Number, required: true },
    attendance: {
      type: new Schema(
        {
          scheduledDays: Number,
          eligibleDays: Number,
          daysWorked: Number,
          paidLeaveDays: Number,
          absentDays: Number,
          missingDays: Number,
          restDaysWorked: Number,
          lateMinutes: Number,
          undertimeMinutes: Number,
        },
        { _id: false },
      ),
      required: true,
    },
    earnings: { type: [earningLineSchema], default: [] },
    contributions: { type: [contributionLineSchema], default: [] },
    deductions: { type: [deductionLineSchema], default: [] },
    grossPay: { type: Number, required: true },
    taxableIncome: { type: Number, required: true },
    tax: { type: Number, required: true },
    employeeContributions: { type: Number, required: true },
    employerContributions: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    netPay: { type: Number, required: true },
    previousNetPay: { type: Number },
    warnings: { type: [warningSchema], default: [] },
    // On a run that computes premiums (attendance plan Phase 5): the attendance inputs and rates the
    // premium lines were computed from, snapshotted so a later attendance correction or policy change
    // can't change what a finished run says it paid (§28, §46).
    premiumInputs: {
      type: new Schema(
        {
          engineVersion: { type: Number, required: true },
          payrollPolicyId: { type: Schema.Types.ObjectId, ref: "PayrollPolicy" },
          rates: { type: Schema.Types.Mixed, required: true },
          holidayDayTypes: { type: Schema.Types.Mixed },
          days: {
            type: [
              new Schema(
                {
                  attendanceRecordId: { type: Schema.Types.ObjectId, ref: "AttendanceRecord" },
                  date: { type: String, required: true },
                  dayType: { type: String, required: true },
                  restDay: { type: Boolean, required: true },
                  inBasic: { type: Boolean, required: true },
                  regularMinutes: { type: Number, required: true },
                  overtimeMinutes: { type: Number, required: true },
                  nightMinutes: { type: Number, required: true },
                  nightOvertimeMinutes: { type: Number, required: true },
                  calcVersion: { type: Number },
                },
                { _id: false },
              ),
            ],
            default: [],
          },
          unworkedRegularHolidaysPaid: { type: Number, default: 0 },
          regularHolidaysAbsentBefore: { type: Number, default: 0 },
          unapprovedOvertimeMinutes: { type: Number, default: 0 },
          missingCheckoutDays: { type: Number, default: 0 },
          withoutDayResult: { type: Number, default: 0 },
        },
        { _id: false },
      ),
    },
    // On a 13th-month run's record only (payroll plan Phase 3): what the amount was computed from, so it
    // reproduces later (§46). estimatedBasic covers the part of the year no approved run paid yet (true-up in January).
    thirteenthMonth: {
      type: new Schema(
        {
          year: { type: Number, required: true },
          basicEarned: { type: Number, required: true },
          estimatedBasic: { type: Number, required: true, default: 0 },
          estimatedFrom: { type: String },
          divisor: { type: Number, required: true },
          alreadyPaid: { type: Number, required: true, default: 0 },
          monthsWithPay: { type: Number, required: true },
          sourceRunIds: { type: [Schema.Types.ObjectId], default: [] },
        },
        { _id: false },
      ),
      default: undefined,
    },
    // On a year-end adjustment run's record only (payroll plan Phase 4): the annualization and the
    // Form 2316 amounts it came from, so the record reproduces (§46) and the 2316 export reads it back.
    yearEnd: {
      type: new Schema(
        {
          year: { type: Number, required: true },
          periodFrom: { type: String },
          periodTo: { type: String },
          minimumWageEarner: { type: Boolean, default: false },
          presentTaxable: { type: Number, required: true },
          previousTaxable: { type: Number, required: true, default: 0 },
          grossTaxable: { type: Number, required: true },
          taxDue: { type: Number, required: true },
          presentWithheld: { type: Number, required: true },
          previousWithheld: { type: Number, required: true, default: 0 },
          withheld: { type: Number, required: true },
          difference: { type: Number, required: true },
          benefitsExcess: { type: Number, required: true, default: 0 },
          gross: { type: Number, required: true },
          nonTaxableTotal: { type: Number, required: true },
          taxableTotal: { type: Number, required: true },
          boxes: { type: [new Schema({ box: { type: String, required: true }, amount: { type: Number, required: true } }, { _id: false })], default: [] },
          unmapped: { type: [String], default: [] },
          previousEmploymentIds: { type: [Schema.Types.ObjectId], default: [] },
          sourceRunIds: { type: [Schema.Types.ObjectId], default: [] },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

payrollRecordSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });
payrollRecordSchema.index({ organizationId: 1, employeeId: 1 });

export type PayrollRecord = InferSchemaType<typeof payrollRecordSchema>;

export const PayrollRecordModel = models.PayrollRecord ?? model("PayrollRecord", payrollRecordSchema);
