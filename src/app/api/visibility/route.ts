import { requireAuthenticatedUser } from "@/server/authorization";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VisibilityService } from "@/domains/visibility/visibility-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { objectId } from "@/shared/validation/object-id";

const bodySchema = z.object({ organizationId: objectId(), type: z.string().trim().min(1), id: z.string().trim().min(1), hidden: z.boolean() });

/** Hides or unhides a record as test data (the service enforces Super Administrator only, ADR-034). */
export async function POST(request: NextRequest) {
  try {
    const input = bodySchema.parse(await request.json());
    const { userId } = await requireAuthenticatedUser();
    return NextResponse.json(await VisibilityService.setHidden(input.type, input.id, input.organizationId, input.hidden, { userId: userId }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
