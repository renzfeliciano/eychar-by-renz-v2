import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { OrganizationService } from "@/domains/organization/organization-service";

/**
 * Phase 2 UI only supports acting within the caller's first accessible
 * organization — multi-organization switching is a later-phase concern
 * (AGENTS.md §24), not built prematurely here.
 */
export async function getCurrentOrganization() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);
  return { userId: session.user.id, organization: organizations[0] ?? null };
}
