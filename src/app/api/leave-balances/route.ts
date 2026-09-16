import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { createLeaveBalanceSchema } from "@/shared/validation/leave";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("leave-balances.read", organizationId);
    const leaveBalances = await LeaveBalanceService.listCurrent(organizationId);
    return NextResponse.json({ leaveBalances });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createLeaveBalanceSchema.parse(await request.json());
    const { userId } = await requirePermission("leave-balances.create", input.organizationId);
    const leaveBalance = await LeaveBalanceService.create(input, { userId });
    return NextResponse.json({ leaveBalance }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
