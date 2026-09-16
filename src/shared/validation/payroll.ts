import { z } from "zod";

export const createPayrollPolicySchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  payFrequency: z.string().trim().min(1),
  standardWorkDaysPerPeriod: z.coerce.number().int().min(1),
});

export const updatePayrollPolicyStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  effectiveTo: z.coerce.date().optional(),
});

const taxBracketSchema = z.object({
  minIncome: z.coerce.number().min(0),
  maxIncome: z.coerce.number().min(0).optional(),
  rate: z.coerce.number().min(0).max(1),
  baseDeduction: z.coerce.number().min(0).default(0),
});

const statutoryContributionSchema = z.object({
  name: z.string().trim().min(1),
  employeeRate: z.coerce.number().min(0).max(1),
  employerRate: z.coerce.number().min(0).max(1).optional(),
  cap: z.coerce.number().min(0).optional(),
});

export const createPayrollRuleVersionSchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  taxBrackets: z.array(taxBracketSchema).optional(),
  statutoryContributions: z.array(statutoryContributionSchema).optional(),
});

export const updatePayrollRuleVersionStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  effectiveTo: z.coerce.date().optional(),
});

export const createCompensationSchema = z.object({
  organizationId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  baseSalary: z.coerce.number().min(0),
  allowanceAmount: z.coerce.number().min(0).optional(),
  effectiveFrom: z.coerce.date().optional(),
});

export const reviseCompensationSchema = z.object({
  organizationId: z.string().trim().min(1),
  baseSalary: z.coerce.number().min(0),
  allowanceAmount: z.coerce.number().min(0).optional(),
  effectiveFrom: z.coerce.date().optional(),
});

const payrollAdjustmentInputSchema = z.object({
  employeeId: z.string().trim().min(1),
  category: z.string().trim().min(1),
  direction: z.enum(["addition", "deduction"]),
  amount: z.coerce.number().min(0),
  description: z.string().trim().optional(),
});

export const generatePayrollRunSchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  payPeriodStart: z.coerce.date(),
  payPeriodEnd: z.coerce.date(),
  adjustments: z.array(payrollAdjustmentInputSchema).default([]),
});

export const decidePayrollRunSchema = z.object({
  organizationId: z.string().trim().min(1),
  action: z.literal("approve"),
});

export type CreatePayrollPolicyInput = z.infer<typeof createPayrollPolicySchema>;
export type UpdatePayrollPolicyStatusInput = z.infer<typeof updatePayrollPolicyStatusSchema>;
export type CreatePayrollRuleVersionInput = z.infer<typeof createPayrollRuleVersionSchema>;
export type UpdatePayrollRuleVersionStatusInput = z.infer<typeof updatePayrollRuleVersionStatusSchema>;
export type CreateCompensationInput = z.infer<typeof createCompensationSchema>;
export type ReviseCompensationInput = z.infer<typeof reviseCompensationSchema>;
export type GeneratePayrollRunInput = z.infer<typeof generatePayrollRunSchema>;
export type DecidePayrollRunInput = z.infer<typeof decidePayrollRunSchema>;
