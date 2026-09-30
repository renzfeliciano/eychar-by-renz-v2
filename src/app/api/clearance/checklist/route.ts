import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { ClearanceChecklistService } from "@/domains/clearance/clearance-checklist-service";
import { createChecklistItemSchema } from "@/shared/validation/clearance";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function POST(request: NextRequest) {
  try {
    const input = createChecklistItemSchema.parse(await request.json());
    const { userId } = await requirePermission("clearance.update", input.organizationId);
    const item = await ClearanceChecklistService.create(input, { userId });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
