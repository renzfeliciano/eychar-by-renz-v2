import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { isDeletableType } from "@/domains/deletion/deletion-registry";
import { AuthenticationError, AuthorizationError, ValidationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

const querySchema = z.object({ organizationId: z.string().trim().min(1), type: z.string().trim().min(1), id: z.string().trim().min(1) });

/** What deleting a record would take with it, and anything that blocks it. Super Administrator only. */
export async function GET(request: NextRequest) {
  try {
    const { organizationId, type, id } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new AuthenticationError();
    if (!(await SuperAdminService.isSuperAdmin(session.user.id, organizationId))) throw new AuthorizationError("Only the Super Administrator can delete records");
    if (!isDeletableType(type)) throw new ValidationError("This kind of record can't be deleted");
    return NextResponse.json(await DeletionService.preview(type, id, organizationId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
