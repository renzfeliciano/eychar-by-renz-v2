import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { openClearanceSchema } from "@/shared/validation/clearance";
import { toErrorResponse } from "@/shared/errors/to-response";

/** HR opens a clearance once the separation notice (received by email) is on file (ADR-031). */
export async function POST(request: NextRequest) {
  try {
    const input = openClearanceSchema.parse(await request.json());
    const { userId } = await requirePermission("clearance.create", input.organizationId);
    const clearance = await ClearanceService.open(input, { userId });
    return NextResponse.json({ clearance }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
