import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

/** Card colors the canvas offers (tokens, not free CSS). */
export const ORG_CHART_COLORS = ["blue", "violet", "teal", "emerald", "amber", "rose", "slate"] as const;

const nodeKey = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid card key");

export const orgChartNodeSchema = z
  .object({
    key: nodeKey,
    type: z.enum(["person", "group"]),
    employeeId: objectId().optional(),
    label: z.string().trim().max(80).optional(),
    color: z.enum(ORG_CHART_COLORS).optional(),
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
  })
  .refine((node) => (node.type === "person" ? Boolean(node.employeeId) : Boolean(node.label)), {
    message: "An employee card needs an employee; a group box needs a name",
  });

/** PUT /api/organization-chart: the whole canvas, saved at once. */
export const saveOrgChartSchema = z.object({
  organizationId: objectId(),
  nodes: z.array(orgChartNodeSchema).max(2000),
  edges: z.array(z.object({ from: nodeKey, to: nodeKey })).max(2000),
});

export const orgChartQuerySchema = z.object({ organizationId: objectId() });

export type SaveOrgChartInput = z.infer<typeof saveOrgChartSchema>;
export type OrgChartNodeInput = z.infer<typeof orgChartNodeSchema>;
