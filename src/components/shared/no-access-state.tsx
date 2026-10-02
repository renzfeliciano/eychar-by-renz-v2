import { cache } from "react";
import { connectMongoDB } from "@/server/db/connection";
import { PermissionModel, UserModel } from "@/server/db/models";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { NoAccessCard } from "./no-access-card";

const permissionLabel = cache(async (key: string): Promise<string | undefined> => {
  await connectMongoDB();
  const permission = await PermissionModel.findOne({ key }).select("description").lean<{ description?: string } | null>();
  return permission?.description || undefined;
});

/**
 * What a page renders when the viewer lacks the permission it checks
 * server-side (AGENTS.md §23: the nav hides most of these pages, so this is
 * reached by a shared link or a role that changed mid-session). Names the
 * missing access and the viewer's current roles so they can ask for exactly
 * what they need. Never says more than the viewer's own account and the
 * permission name, which are not secret.
 */
export async function NoAccessState({
  message,
  permission,
  needed,
  superAdminOnly,
  backHref,
  backLabel,
}: {
  message: string;
  permission?: string;
  /** Plain-words description of what's missing, when it isn't a single permission. */
  needed?: string;
  superAdminOnly?: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  // Best effort: the screen still works if any of these can't be read.
  const details = await (async () => {
    try {
      const { userId, organization } = await getCurrentOrganization();
      const [label, roleNames, user] = await Promise.all([
        permission ? permissionLabel(permission) : undefined,
        organization ? RoleAssignmentService.listRoleNamesForUser(userId, organization._id.toString()) : [],
        UserModel.findById(userId).select("username email").lean<{ username?: string; email?: string } | null>(),
      ]);
      return { permissionLabel: needed ?? label, roleNames: organization ? roleNames : undefined, signedInAs: user?.username ?? user?.email };
    } catch {
      return { permissionLabel: needed };
    }
  })();

  return <NoAccessCard message={message} permission={permission} superAdminOnly={superAdminOnly} backHref={backHref} backLabel={backLabel} {...details} />;
}
