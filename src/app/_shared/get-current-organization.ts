import { cache } from "react";
import { redirect } from "next/navigation";
import { OrganizationService } from "@/domains/organization/organization-service";
import { getSession } from "@/server/auth/session";

/**
 * Phase 2 UI only supports acting within the caller's first accessible
 * organization — multi-organization switching is a later-phase concern
 * (AGENTS.md §24), not built prematurely here. Resolved once per server render.
 */
export const getCurrentOrganization = cache(async () => {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);
  return { userId: session.user.id, organization: organizations[0] ?? null };
});
