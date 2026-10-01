import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

export const orgChartQuerySchema = z.object({
  organizationId: objectId(),
  asOf: z.coerce.date().optional(),
  search: z.string().max(200).trim().min(1).optional(),
  organizationUnitId: objectId().optional(),
  positionId: objectId().optional(),
  projectId: objectId().optional(),
  employmentStatus: z.enum(["active", "on_leave", "terminated"]).optional(),
});

export type OrgChartQuery = z.infer<typeof orgChartQuerySchema>;
