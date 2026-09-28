/** Plain (serializable) shapes the run workspace hands its client components. */
export type PayslipLine = { code: string; label: string; amount: number; taxable?: boolean };
export type PayslipContribution = { code: string; name: string; employee: number; employer: number; extra: number; extraLabel?: string | null };
export type PayslipWarning = { code: string; message: string; blocking: boolean };

export type RegisterRow = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  projectName: string | null;
  rateType: "monthly" | "daily";
  rate: number;
  dailyRate: number;
  hourlyRate: number;
  attendance: {
    scheduledDays: number;
    eligibleDays: number;
    daysWorked: number;
    paidLeaveDays: number;
    absentDays: number;
    missingDays: number;
    restDaysWorked: number;
    lateMinutes: number;
    undertimeMinutes: number;
  };
  earnings: PayslipLine[];
  contributions: PayslipContribution[];
  deductions: PayslipLine[];
  grossPay: number;
  taxableIncome: number;
  tax: number;
  employeeContributions: number;
  employerContributions: number;
  totalDeductions: number;
  netPay: number;
  previousNetPay: number | null;
  warnings: PayslipWarning[];
};

export type AdjustmentRow = {
  id: string;
  employeeId: string;
  category: string;
  label: string;
  direction: "earning" | "deduction";
  amount: number;
  taxable: boolean;
  notes: string | null;
};
