import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PersonService } from "@/domains/people/person-service";
import { organizationIdParamSchema } from "@/shared/validation/organization";
import { updateEmployeeProfileSchema } from "@/shared/validation/workforce";
import { NotFoundError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/employees/[id]">) {
  try {
    const { id } = await ctx.params;
    const { organizationId } = organizationIdParamSchema.parse({
      organizationId: request.nextUrl.searchParams.get("organizationId"),
    });
    await requirePermission("employees.read", organizationId);
    const detail = await EmployeeService.getDetail(id, organizationId);
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/employees/[id]">) {
  try {
    const { id } = await ctx.params;
    const input = updateEmployeeProfileSchema.parse(await request.json());
    const { userId } = await requirePermission("employees.update", input.organizationId);

    const current = await EmployeeService.getDetail(id, input.organizationId);
    if (!current.person) throw new NotFoundError("This employee has no linked person record");

    await PersonService.update(
      current.person._id.toString(),
      input.organizationId,
      {
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        gender: input.gender,
        birthDate: input.birthDate,
        address: input.address,
        sssNumber: input.sssNumber,
        philHealthNumber: input.philHealthNumber,
        pagIbigNumber: input.pagIbigNumber,
        tinNumber: input.tinNumber,
      },
      { userId },
    );

    if (input.employeeNumber !== undefined) {
      await EmployeeService.update(id, input.organizationId, { employeeNumber: input.employeeNumber }, { userId });
    }

    const detail = await EmployeeService.getDetail(id, input.organizationId);
    return NextResponse.json({ detail });
  } catch (error) {
    return toErrorResponse(error);
  }
}
