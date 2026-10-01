import { requireAuthenticatedUser } from "@/server/authorization";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { isDeletableType } from "@/domains/deletion/deletion-registry";
import { ValidationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";
import { objectId } from "@/shared/validation/object-id";

const bodySchema = z.object({ organizationId: objectId(), type: z.string().trim().min(1), id: z.string().trim().min(1), confirm: z.string().max(200) });

/** Moves a record and everything attached to the recycle bin (the service enforces Super Administrator only). */
export async function POST(request: NextRequest) {
  try {
    const input = bodySchema.parse(await request.json());
    const { userId } = await requireAuthenticatedUser();
    if (!isDeletableType(input.type)) throw new ValidationError("This kind of record can't be deleted");
    const batch = await DeletionService.remove(input.type, input.id, input.organizationId, { confirm: input.confirm }, { userId: userId });
    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
