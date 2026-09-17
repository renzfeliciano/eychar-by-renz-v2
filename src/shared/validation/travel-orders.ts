import { z } from "zod";

const travelOrderFields = z.object({
  organizationId: z.string().trim().min(1),
  employeeIds: z.array(z.string().trim().min(1)).min(1, "Select at least one employee"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  remarks: z.string().trim().max(255).optional(),
});

// Same shape for create and update, mirroring the legacy v1 app's single
// reused form dialog.
export const travelOrderSchema = travelOrderFields.superRefine((data, ctx) => {
  if (data.endDate < data.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must be on or after the start date." });
  }
});

export const createTravelOrderSchema = travelOrderSchema;
export const updateTravelOrderSchema = travelOrderSchema;

export const cancelTravelOrderSchema = z.object({
  organizationId: z.string().trim().min(1),
});

export type CreateTravelOrderInput = z.infer<typeof createTravelOrderSchema>;
export type UpdateTravelOrderInput = z.infer<typeof updateTravelOrderSchema>;
