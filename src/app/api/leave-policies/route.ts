import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeavePolicyService } from "@/domains/leave/leave-policy-service";
import { createLeavePolicySchema } from "@/shared/validation/leave";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("leave-policies.read", organizationId);
    const leavePolicies = await LeavePolicyService.listCurrent(organizationId);
    return NextResponse.json({ leavePolicies });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createLeavePolicySchema.parse(await request.json());
    const { userId } = await requirePermission("leave-policies.create", input.organizationId);
    const leavePolicy = await LeavePolicyService.create(input, { userId });
    return NextResponse.json({ leavePolicy }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
