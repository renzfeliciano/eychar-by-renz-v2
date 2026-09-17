import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeAccountService } from "@/domains/identity/employee-account-service";
import { createEmployeeAccountSchema } from "@/shared/validation/auth";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    const employeeId = request.nextUrl.searchParams.get("employeeId");
    if (!employeeId) return NextResponse.json({ account: null });

    await requirePermission("employees.read", organizationId);
    const account = await EmployeeAccountService.getForEmployee(employeeId);
    return NextResponse.json({ account });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = createEmployeeAccountSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);
    const account = await EmployeeAccountService.create(input, { userId });
    return NextResponse.json({ account: { id: account._id.toString(), username: account.username } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
