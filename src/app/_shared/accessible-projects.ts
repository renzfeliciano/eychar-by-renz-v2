import { requireAccessibleProjects } from "@/server/authorization";
import type { AccessibleProjects } from "@/server/authorization";
import { AuthorizationError } from "@/shared/errors";

/**
 * For Server Component pages over project-scoped data — the same check
 * the API's list routes make: "all" for an organization-wide grant, the
 * viewer's projects for a project-scoped one, or null when they hold the
 * permission nowhere (render NoAccessState).
 */
export async function accessibleProjects(permission: string, organizationId: string): Promise<AccessibleProjects | null> {
  try {
    return (await requireAccessibleProjects(permission, organizationId)).projects;
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}
