import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/authorization";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { objectId } from "@/shared/validation/object-id";

const bulkGrantSchema = z
  .object({
    organizationId: objectId(),
    leaveTypeId: objectId(),
    year: z.coerce.number().int().min(2000).max(2100),
    entitledDays: z.coerce.number().min(0).max(999.99).multipleOf(0.01, "Balances can have at most two decimal places").optional(),
    hasNoFixedAmount: z.boolean().optional(),
  })
  .refine((input) => input.hasNoFixedAmount || input.entitledDays !== undefined, { message: "Enter the entitled days, or make it unlimited.", path: ["entitledDays"] });

/** Opens a leave type for the year for every current employee who doesn't have it yet. */
export async function POST(request: Request) {
  try {
    const input = bulkGrantSchema.parse(await request.json());
    const { userId } = await requirePermission("leave-balances.create", input.organizationId);
    await enforceRateLimit("bulkChange", userId);
    const result = await LeaveBalanceService.grantMissing(input, { userId });
    return NextResponse.json({ result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
