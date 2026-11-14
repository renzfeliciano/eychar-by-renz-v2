import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/authorization";
import { PriorEmploymentService } from "@/domains/payroll/prior-employment-service";
import { priorEmploymentSchema } from "@/shared/validation/payroll";
import { objectId } from "@/shared/validation/object-id";
import { toErrorResponse } from "@/shared/errors/to-response";

const listSchema = z.object({ organizationId: objectId(), employeeId: objectId() });

/** Previous-employer pay for the year-end annualization (payroll plan Phase 4). Pay data: compensation permissions. */
export async function GET(request: NextRequest) {
  try {
    const { organizationId, employeeId } = listSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    await requirePermission("compensation.read", organizationId);
    const priorEmployments = await PriorEmploymentService.list(organizationId, employeeId);
    return NextResponse.json({ priorEmployments });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = priorEmploymentSchema.parse(await request.json());
    const { userId } = await requirePermission("compensation.create", input.organizationId);
    const priorEmployment = await PriorEmploymentService.create(input, { userId });
    return NextResponse.json({ priorEmployment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
