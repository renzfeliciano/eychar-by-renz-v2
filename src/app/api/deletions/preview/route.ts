import { requireAuthenticatedUser } from "@/server/authorization";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { isDeletableType } from "@/domains/deletion/deletion-registry";
import { AuthorizationError, ValidationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";
import { objectId } from "@/shared/validation/object-id";

const querySchema = z.object({ organizationId: objectId(), type: z.string().trim().min(1), id: z.string().trim().min(1) });

/** What deleting a record would take with it, and anything that blocks it. Super Administrator only. */
export async function GET(request: NextRequest) {
  try {
    const { organizationId, type, id } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { userId } = await requireAuthenticatedUser();
    if (!(await SuperAdminService.isSuperAdmin(userId, organizationId))) throw new AuthorizationError("Only the Super Administrator can delete records");
    if (!isDeletableType(type)) throw new ValidationError("This kind of record can't be deleted");
    return NextResponse.json(await DeletionService.preview(type, id, organizationId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
