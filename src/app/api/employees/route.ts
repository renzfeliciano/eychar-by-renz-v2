import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { HireService } from "@/domains/workforce/hire-service";
import { hireEmployeeSchema } from "@/shared/validation/workforce";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest) {
  try {
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("employees.read", organizationId);
    const employees = await EmployeeService.listWithCurrentStatus(organizationId);
    return NextResponse.json({ employees });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = hireEmployeeSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.create", input.organizationId);
    const result = await HireService.hire(input, { userId });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
