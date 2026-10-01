import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/authorization";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { bulkCompensationChangeSchema } from "@/shared/validation/payroll";
import { toErrorResponse } from "@/shared/errors/to-response";
import { enforceRateLimit } from "@/server/security/rate-limit";

const requestSchema = bulkCompensationChangeSchema.extend({ mode: z.enum(["preview", "apply"]) });

/** A bulk pay change (e.g. a wage order for one project): preview first, then apply. */
export async function POST(request: Request) {
  try {
    const { mode, ...input } = requestSchema.parse(await request.json());
    const { userId } = await requirePermission(mode === "apply" ? "compensation.update" : "compensation.read", input.organizationId);
    if (mode === "apply") await enforceRateLimit("bulkChange", userId);
    if (mode === "preview") return NextResponse.json({ rows: await CompensationService.previewBulkChange(input) });
    return NextResponse.json({ result: await CompensationService.applyBulkChange(input, { userId }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
