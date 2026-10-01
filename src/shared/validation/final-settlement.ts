import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

export const FINAL_SETTLEMENT_ACTIONS = ["submit", "review", "approve", "return", "disburse", "cancel"] as const;

export const prepareFinalSettlementSchema = z.object({
  organizationId: objectId(),
  clearanceCaseId: objectId(),
});

export const manualLineSchema = z.object({
  organizationId: objectId(),
  direction: z.enum(["earning", "deduction"]),
  label: z.string().trim().min(1, "Describe the line").max(120),
  amount: z.number().positive("Enter an amount above zero").max(100_000_000),
  reason: z.string().trim().max(500),
});

export const finalSettlementActionSchema = z.object({
  organizationId: objectId(),
  action: z.enum(FINAL_SETTLEMENT_ACTIONS),
  note: z.string().trim().max(500).optional(),
  paymentMethodCode: z.string().trim().max(60).optional(),
  paymentReference: z.string().trim().max(120).optional(),
});

export type ManualLineInput = Omit<z.infer<typeof manualLineSchema>, "organizationId">;
export type FinalSettlementActionInput = Omit<z.infer<typeof finalSettlementActionSchema>, "organizationId">;
