import { cache } from "react";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { RoleAssignmentModel, RoleModel } from "@/server/db/models";
import { AuthorizationError } from "@/shared/errors";

export type AuthorizeInput = {
  userId: string;
  organizationId: string;
  permission: string;
  /**
   * The project the operation acts on, when it is project-scoped. A
   * project-scoped role assignment only counts when this names one of its
   * projects; without it, only organization-wide grants count — so a
   * Project Manager never passes an organization-wide check such as
   * "list every employee".
   */
  projectId?: string;
};

/**
 * Everything a user holds in one organization right now:
 * - `superAdmin`: the Super Administrator's system role (organization-wide), passes every check;
 * - `keys`: permissions granted organization-wide (every project included);
 * - `projectKeys`: permissions granted only for particular projects, by project id.
 */
export type HeldGrants = { superAdmin: boolean; keys: Set<string>; projectKeys: Map<string, Set<string>> };

/** The projects a user may exercise a permission on: every one, or just these. */
export type AccessibleProjects = "all" | Types.ObjectId[];

/**
 * The single server-side authorization chokepoint (AGENTS.md §20/§22):
 * grants access only if the user has an active RoleAssignment in this exact
 * organization whose role carries the requested permission key, and whose
 * scope covers the request (organization-wide, or the named project).
 * Never check `user.role === "..."` anywhere else — call this instead.
 */
export async function authorize({ userId, organizationId, permission, projectId }: AuthorizeInput): Promise<void> {
  const grants = await activeGrants(userId, organizationId);
  if (grants.superAdmin || grants.keys.has(permission)) return;
  const project = projectId ? normalizeId(projectId) : null;
  if (project && grants.projectKeys.get(project)?.has(permission)) return;
  throw new AuthorizationError(
    projectId ? `Missing permission "${permission}" for this project` : `Missing permission "${permission}" in this organization`,
  );
}

/**
 * Which projects the user may exercise `permission` on: "all" for an
 * organization-wide grant (or the Super Administrator), otherwise the
 * projects of their project-scoped grants (possibly none). List endpoints
 * use this to filter instead of an organization-wide check.
 */
export async function accessibleProjectIds({ userId, organizationId, permission }: Omit<AuthorizeInput, "projectId">): Promise<AccessibleProjects> {
  const grants = await activeGrants(userId, organizationId);
  if (grants.superAdmin || grants.keys.has(permission)) return "all";
  return [...grants.projectKeys.entries()].filter(([, keys]) => keys.has(permission)).map(([id]) => new Types.ObjectId(id));
}

/** Whether `projectId` is within an {@link AccessibleProjects} result. */
export function includesProject(projects: AccessibleProjects, projectId: string | Types.ObjectId | null | undefined): boolean {
  if (projects === "all") return true;
  if (!projectId) return false;
  const id = projectId.toString();
  return projects.some((project) => project.toString() === id);
}

function normalizeId(id: string): string | null {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id).toString() : null;
}

/**
 * What `scope` an assignment document carries. Documents written before
 * scopes existed (no `scope`, or no `scope.type`) are organization-wide, as
 * they always were. An unrecognised type grants nothing (fails closed), so a
 * future scope kind can't silently widen into organization-wide access.
 */
type StoredScope = { type?: string | null; projectIds?: Types.ObjectId[] | null } | null | undefined;
function scopeOf(scope: StoredScope): { type: "organization" } | { type: "project"; projectIds: string[] } | null {
  if (!scope?.type || scope.type === "organization") return { type: "organization" };
  if (scope.type === "project") return { type: "project", projectIds: (scope.projectIds ?? []).map((id) => id.toString()) };
  return null;
}

/**
 * The user's active roles in this organization, read once per server render
 * (a page checks several permissions; each used to re-read the same roles).
 * Outside a render (route handlers, tests) React's cache doesn't memoize,
 * so an API call always sees the current roles.
 */
const activeGrants = cache(async (userId: string, organizationId: string): Promise<HeldGrants> => {
  const none: HeldGrants = { superAdmin: false, keys: new Set(), projectKeys: new Map() };
  await connectMongoDB();
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(organizationId)) return none;

  const now = new Date();
  const assignments = await RoleAssignmentModel.find({
    userId: new Types.ObjectId(userId),
    organizationId: new Types.ObjectId(organizationId),
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
  })
    .select("roleId scope")
    .lean<{ roleId: Types.ObjectId; scope?: StoredScope }[]>();
  if (assignments.length === 0) return none;

  const roles = await RoleModel.find({
    _id: { $in: assignments.map((assignment) => assignment.roleId) },
    // Missing status (any role seeded before this field existed) is
    // treated as active, the same permissive-when-unconfigured fallback
    // used for employment/attendance status metadata elsewhere.
    $or: [{ status: "active" }, { status: { $exists: false } }],
  })
    .select("permissionKeys system")
    .lean<{ _id: Types.ObjectId; permissionKeys?: string[]; system?: string }[]>();
  const roleById = new Map(roles.map((role) => [role._id.toString(), role]));

  const grants: HeldGrants = { superAdmin: false, keys: new Set(), projectKeys: new Map() };
  for (const assignment of assignments) {
    const role = roleById.get(assignment.roleId.toString());
    const scope = scopeOf(assignment.scope);
    if (!role || !scope) continue;
    const keys = role.permissionKeys ?? [];
    if (scope.type === "organization") {
      // The Super Administrator's system role passes every check, including permissions added later —
      // but only held organization-wide (the seed's only way of assigning it).
      if (role.system === "super_admin") grants.superAdmin = true;
      for (const key of keys) grants.keys.add(key);
      continue;
    }
    for (const projectId of scope.projectIds) {
      const held = grants.projectKeys.get(projectId) ?? new Set<string>();
      for (const key of keys) held.add(key);
      grants.projectKeys.set(projectId, held);
    }
  }
  return grants;
});

/**
 * Organization *membership* — any active role assignment in this
 * organization, regardless of which permissions it carries or its scope.
 * Used for "can this user select/see this organization at all", distinct
 * from `authorize()`'s permission-specific check for a given operation.
 */
export async function hasActiveRoleAssignment({
  userId,
  organizationId,
}: Pick<AuthorizeInput, "userId" | "organizationId">): Promise<boolean> {
  await connectMongoDB();

  const now = new Date();
  const assignment = await RoleAssignmentModel.exists({
    userId: new Types.ObjectId(userId),
    organizationId: new Types.ObjectId(organizationId),
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
  });

  return Boolean(assignment);
}

/**
 * What the user can do in this organization right now: organization-wide
 * permission keys, per-project keys, and whether they hold the Super
 * Administrator's system role (which passes every check). Used to stop
 * anyone handing out more access than they hold themselves (see
 * {@link missingGrants}).
 */
export async function heldPermissions({
  userId,
  organizationId,
}: Pick<AuthorizeInput, "userId" | "organizationId">): Promise<HeldGrants> {
  return activeGrants(userId, organizationId);
}

/** Every permission key held in any scope — for UI hints (navigation) only, never for a security decision. */
export function keysInAnyScope(grants: HeldGrants): Set<string> {
  const all = new Set(grants.keys);
  for (const keys of grants.projectKeys.values()) for (const key of keys) all.add(key);
  return all;
}

/**
 * The grants in `wanted` that `holder` doesn't hold at least as broadly
 * (empty when fully covered): an organization-wide key needs the holder to
 * have it organization-wide; a key for project P is covered by the holder's
 * organization-wide key or their key for P. The Super Administrator covers
 * everything. Returns the uncovered permission keys, for the error message.
 */
export function missingGrants(holder: HeldGrants, wanted: { keys: Iterable<string>; projectKeys?: Map<string, Iterable<string>> }): string[] {
  if (holder.superAdmin) return [];
  const missing = new Set<string>();
  for (const key of wanted.keys) if (!holder.keys.has(key)) missing.add(key);
  for (const [projectId, keys] of wanted.projectKeys ?? new Map()) {
    for (const key of keys) {
      if (!holder.keys.has(key) && !holder.projectKeys.get(projectId)?.has(key)) missing.add(key);
    }
  }
  return [...missing];
}
