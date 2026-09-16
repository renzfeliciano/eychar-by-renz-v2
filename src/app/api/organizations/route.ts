import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/authorization";
import { OrganizationService } from "@/domains/organization/organization-service";
import { toErrorResponse } from "@/shared/errors/to-response";

// Authenticate → Resolve Context → Execute → Return (AGENTS.md §36). Scoped
// strictly to organizations the caller has an active RoleAssignment in —
// never returns every organization in the database.
export async function GET() {
  try {
    const { userId } = await requireAuthenticatedUser();
    const organizations = await OrganizationService.listAccessibleTo(userId);
    return NextResponse.json({ organizations });
  } catch (error) {
    return toErrorResponse(error);
  }
}
