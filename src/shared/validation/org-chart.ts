import { z } from "zod";

export const orgChartQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  asOf: z.coerce.date().optional(),
  search: z.string().trim().min(1).optional(),
  organizationUnitId: z.string().trim().min(1).optional(),
  positionId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  employmentStatus: z.enum(["active", "on_leave", "terminated"]).optional(),
});

export type OrgChartQuery = z.infer<typeof orgChartQuerySchema>;
