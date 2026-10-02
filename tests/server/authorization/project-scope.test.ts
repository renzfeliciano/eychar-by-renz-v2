import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PayrollRunModel, ProjectModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { accessibleProjectIds, authorize, heldPermissions, missingGrants } from "@/server/authorization/authorize";
import { AuthorizationError, NotFoundError } from "@/shared/errors";

// Project-scoped role assignments (AGENTS.md §21/§22, ADR-007): the §60
// matrix against the real authorize()/requireProjectAccess, DB-backed.
const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));

const { requireAccessibleProjects, requirePermission, requireProjectAccess } = await import("@/server/authorization/require");
const { RoleAssignmentService } = await import("@/domains/authorization/role-assignment-service");
const projectsRoute = await import("@/app/api/projects/route");
const attendanceRoute = await import("@/app/api/attendance/route");
const payrollRunsRoute = await import("@/app/api/payroll-runs/route");

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const PERMISSIONS = ["projects.read", "attendance.read", "payroll-runs.read"];
const past = () => new Date(Date.now() - 60_000);

async function newUser() {
  return UserModel.create({ username: `scope.${unique()}`, passwordHash: "x" });
}

async function seed() {
  const organization = await OrganizationModel.create({ name: "Scoped Co", slug: `scoped-${unique()}` });
  const [projectA, projectB] = await Promise.all([
    ProjectModel.create({ organizationId: organization._id, name: "Project A", code: `A-${unique()}` }),
    ProjectModel.create({ organizationId: organization._id, name: "Project B", code: `B-${unique()}` }),
  ]);
  const [hrAdministrator, projectManager] = await Promise.all([
    RoleModel.create({ organizationId: organization._id, name: `HR Administrator ${unique()}`, permissionKeys: PERMISSIONS }),
    RoleModel.create({ organizationId: organization._id, name: `Project Manager ${unique()}`, permissionKeys: PERMISSIONS }),
  ]);
  const [userA, userB, userC] = await Promise.all([newUser(), newUser(), newUser()]);
  const [assignmentA, assignmentB, assignmentC] = await Promise.all([
    RoleAssignmentModel.create({ organizationId: organization._id, roleId: hrAdministrator._id, userId: userA._id, scope: { type: "organization" }, effectiveFrom: past() }),
    RoleAssignmentModel.create({ organizationId: organization._id, roleId: projectManager._id, userId: userB._id, scope: { type: "project", projectIds: [projectA._id] }, effectiveFrom: past() }),
    RoleAssignmentModel.create({ organizationId: organization._id, roleId: projectManager._id, userId: userC._id, scope: { type: "project", projectIds: [projectB._id] }, effectiveFrom: past() }),
  ]);
  const ids = {
    organizationId: organization._id.toString(),
    projectA: projectA._id.toString(),
    projectB: projectB._id.toString(),
    userA: userA._id.toString(),
    userB: userB._id.toString(),
    userC: userC._id.toString(),
  };
  return { ...ids, organization, projectManager, assignmentA, assignmentB, assignmentC };
}

const can = (userId: string, organizationId: string, projectId?: string, permission = "attendance.read") =>
  authorize({ userId, organizationId, permission, projectId }).then(
    () => true,
    (error) => {
      if (error instanceof AuthorizationError) return false;
      throw error;
    },
  );

function request(url: string) {
  return new NextRequest(new URL(url, "http://localhost:4100"));
}

describe("project-scoped authorization", () => {
  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
  });

  it("required test §60: org-scoped A reaches both projects; B only Project A; C only Project B", async () => {
    const s = await seed();
    const matrix = await Promise.all([
      can(s.userA, s.organizationId, s.projectA),
      can(s.userA, s.organizationId, s.projectB),
      can(s.userB, s.organizationId, s.projectA),
      can(s.userB, s.organizationId, s.projectB),
      can(s.userC, s.organizationId, s.projectA),
      can(s.userC, s.organizationId, s.projectB),
    ]);
    expect(matrix).toEqual([true, true, true, false, false, true]);
  });

  it("required test §60 through requireProjectAccess (the route guard), with the session faked", async () => {
    const s = await seed();
    const guard = async (userId: string, projectId: string) => {
      session.mockResolvedValue({ user: { id: userId } });
      return requireProjectAccess("attendance.read", s.organizationId, projectId).then(
        () => true,
        (error) => {
          if (error instanceof AuthorizationError) return false;
          throw error;
        },
      );
    };
    expect(await guard(s.userA, s.projectA)).toBe(true);
    expect(await guard(s.userA, s.projectB)).toBe(true);
    expect(await guard(s.userB, s.projectA)).toBe(true);
    expect(await guard(s.userB, s.projectB)).toBe(false);
    expect(await guard(s.userC, s.projectA)).toBe(false);
    expect(await guard(s.userC, s.projectB)).toBe(true);
  });

  it("requireProjectAccess honours a pending password change / two-step setup like the other guards", async () => {
    const s = await seed();
    session.mockResolvedValue({ user: { id: s.userB }, mustChangePassword: true });
    await expect(requireProjectAccess("attendance.read", s.organizationId, s.projectA)).rejects.toThrow(/temporary/);
    session.mockResolvedValue({ user: { id: s.userB }, mustSetUpTwoStep: true });
    await expect(requireProjectAccess("attendance.read", s.organizationId, s.projectA)).rejects.toThrow(/two-step/);
    session.mockResolvedValue(null);
    await expect(requireProjectAccess("attendance.read", s.organizationId, s.projectA)).rejects.toThrow();
  });

  it("a project id from another organization (or a malformed one) reads as not found, even for an org-wide holder", async () => {
    const s = await seed();
    const other = await OrganizationModel.create({ name: "Other", slug: `other-${unique()}` });
    const foreign = await ProjectModel.create({ organizationId: other._id, name: "Foreign", code: `F-${unique()}` });
    session.mockResolvedValue({ user: { id: s.userA } });
    await expect(requireProjectAccess("attendance.read", s.organizationId, foreign._id.toString())).rejects.toThrow(NotFoundError);
    await expect(requireProjectAccess("attendance.read", s.organizationId, "not-an-id")).rejects.toThrow(NotFoundError);
  });

  it("a project-scoped grant never satisfies an organization-wide check", async () => {
    const s = await seed();
    expect(await can(s.userB, s.organizationId)).toBe(false);
    expect(await can(s.userA, s.organizationId)).toBe(true);
    session.mockResolvedValue({ user: { id: s.userB } });
    await expect(requirePermission("attendance.read", s.organizationId)).rejects.toThrow(AuthorizationError);
  });

  it("denies an expired project assignment", async () => {
    const s = await seed();
    await RoleAssignmentModel.updateOne({ _id: s.assignmentB._id }, { $set: { effectiveTo: new Date(Date.now() - 1000) } });
    expect(await can(s.userB, s.organizationId, s.projectA)).toBe(false);
    expect(await accessibleProjectIds({ userId: s.userB, organizationId: s.organizationId, permission: "attendance.read" })).toEqual([]);
  });

  it("denies once the permission is removed from the role, or the role is retired", async () => {
    const s = await seed();
    await RoleModel.updateOne({ _id: s.projectManager._id }, { $set: { permissionKeys: ["projects.read"] } });
    expect(await can(s.userB, s.organizationId, s.projectA)).toBe(false);
    expect(await can(s.userB, s.organizationId, s.projectA, "projects.read")).toBe(true);
    await RoleModel.updateOne({ _id: s.projectManager._id }, { $set: { status: "inactive" } });
    expect(await can(s.userB, s.organizationId, s.projectA, "projects.read")).toBe(false);
  });

  it("accessibleProjectIds: 'all' organization-wide, the assignment's projects otherwise, nothing without the permission", async () => {
    const s = await seed();
    const ids = (userId: string, permission = "attendance.read") => accessibleProjectIds({ userId, organizationId: s.organizationId, permission });
    expect(await ids(s.userA)).toBe("all");
    expect((await ids(s.userB)) as Types.ObjectId[]).toEqual([new Types.ObjectId(s.projectA)]);
    expect((await ids(s.userC)) as Types.ObjectId[]).toEqual([new Types.ObjectId(s.projectB)]);
    expect(await ids(s.userB, "employees.read")).toEqual([]);

    // One assignment spanning both projects.
    const both = await newUser();
    await RoleAssignmentModel.create({ organizationId: s.organizationId, roleId: s.projectManager._id, userId: both._id, scope: { type: "project", projectIds: [s.projectA, s.projectB] }, effectiveFrom: past() });
    const spanning = (await ids(both._id.toString())) as Types.ObjectId[];
    expect(spanning.map(String).sort()).toEqual([s.projectA, s.projectB].sort());

    session.mockResolvedValue({ user: { id: s.userB } });
    await expect(requireAccessibleProjects("employees.read", s.organizationId)).rejects.toThrow(AuthorizationError);
  });

  it("assignments written before scopes existed stay organization-wide; an unknown scope type grants nothing", async () => {
    const s = await seed();
    const legacy = await newUser();
    const future = await newUser();
    // Raw writes: exactly what older (or newer) code left in the collection.
    await RoleAssignmentModel.collection.insertMany([
      { organizationId: s.organization._id, roleId: s.projectManager._id, userId: legacy._id, effectiveFrom: past() },
      { organizationId: s.organization._id, roleId: s.projectManager._id, userId: future._id, scope: { type: "organizationUnit" }, effectiveFrom: past() },
    ]);
    expect(await can(legacy._id.toString(), s.organizationId)).toBe(true);
    expect(await can(legacy._id.toString(), s.organizationId, s.projectB)).toBe(true);
    expect(await can(future._id.toString(), s.organizationId)).toBe(false);
    expect(await can(future._id.toString(), s.organizationId, s.projectA)).toBe(false);
  });

  it("the model refuses a project scope without projects", async () => {
    const s = await seed();
    const user = await newUser();
    await expect(
      RoleAssignmentModel.create({ organizationId: s.organizationId, roleId: s.projectManager._id, userId: user._id, scope: { type: "project", projectIds: [] } }),
    ).rejects.toThrow(/project/);
    await expect(RoleAssignmentModel.create({ organizationId: s.organizationId, roleId: s.projectManager._id, userId: user._id, scope: { type: "project" } })).rejects.toThrow(/project/);
  });

  describe("granting", () => {
    it("stores the chosen projects and rejects another organization's project", async () => {
      const s = await seed();
      const user = await newUser();
      const role = await RoleModel.create({ organizationId: s.organizationId, name: `Viewer ${unique()}`, permissionKeys: ["attendance.read"] });
      const assignment = await RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: role._id.toString(), userId: user._id.toString(), scope: { type: "project", projectIds: [s.projectB] } }, {});
      expect(assignment.scope?.type).toBe("project");
      expect(await can(user._id.toString(), s.organizationId, s.projectB)).toBe(true);
      expect(await can(user._id.toString(), s.organizationId, s.projectA)).toBe(false);

      const other = await OrganizationModel.create({ name: "Other", slug: `other-${unique()}` });
      const foreign = await ProjectModel.create({ organizationId: other._id, name: "Foreign", code: `F-${unique()}` });
      await expect(
        RoleAssignmentService.assertCanGrant({ organizationId: s.organizationId, roleId: role._id.toString(), scope: { type: "project", projectIds: [foreign._id.toString()] } }, {}),
      ).rejects.toThrow(NotFoundError);
    });

    it("a project-scoped actor can only grant within their own projects, never organization-wide", async () => {
      const s = await seed();
      const role = await RoleModel.create({ organizationId: s.organizationId, name: `Viewer ${unique()}`, permissionKeys: ["attendance.read"] });
      const grant = (actor: string, scope: { type: "organization" } | { type: "project"; projectIds: string[] }) =>
        RoleAssignmentService.assertCanGrant({ organizationId: s.organizationId, roleId: role._id.toString(), scope }, { userId: actor });

      await expect(grant(s.userB, { type: "project", projectIds: [s.projectA] })).resolves.toBeTruthy();
      await expect(grant(s.userB, { type: "project", projectIds: [s.projectB] })).rejects.toThrow(AuthorizationError);
      await expect(grant(s.userB, { type: "project", projectIds: [s.projectA, s.projectB] })).rejects.toThrow(AuthorizationError);
      await expect(grant(s.userB, { type: "organization" })).rejects.toThrow(AuthorizationError);
      // Organization-wide holders may grant on any project, or organization-wide.
      await expect(grant(s.userA, { type: "project", projectIds: [s.projectB] })).resolves.toBeTruthy();
      await expect(grant(s.userA, { type: "organization" })).resolves.toBeTruthy();
    });

    it("account administration compares project-scoped grants project by project", async () => {
      const s = await seed();
      const [a, b, c] = await Promise.all([s.userA, s.userB, s.userC].map((userId) => heldPermissions({ userId, organizationId: s.organizationId })));
      expect(missingGrants(a, b)).toEqual([]); // org-wide covers Project A
      expect(missingGrants(b, c).sort()).toEqual([...PERMISSIONS].sort()); // Project A doesn't cover Project B
      expect(missingGrants(b, a).sort()).toEqual([...PERMISSIONS].sort()); // a project never covers the organization
      expect(missingGrants(b, b)).toEqual([]);
    });
  });

  describe("project-filtered routes", () => {
    it("GET /api/projects lists every project organization-wide, only the caller's otherwise", async () => {
      const s = await seed();
      const list = async (userId: string) => {
        session.mockResolvedValue({ user: { id: userId } });
        const response = await projectsRoute.GET(request(`/api/projects?organizationId=${s.organizationId}`));
        expect(response.status).toBe(200);
        const body = (await response.json()) as { projects: { _id: string }[] };
        return body.projects.map((project) => project._id).sort();
      };
      expect(await list(s.userA)).toEqual([s.projectA, s.projectB].sort());
      expect(await list(s.userB)).toEqual([s.projectA]);
      expect(await list(s.userC)).toEqual([s.projectB]);

      const outsider = await newUser();
      session.mockResolvedValue({ user: { id: outsider._id.toString() } });
      expect((await projectsRoute.GET(request(`/api/projects?organizationId=${s.organizationId}`))).status).toBe(403);
    });

    it("GET /api/attendance?projectId= is refused for a project outside the caller's scope", async () => {
      const s = await seed();
      session.mockResolvedValue({ user: { id: s.userB } });
      expect((await attendanceRoute.GET(request(`/api/attendance?organizationId=${s.organizationId}&projectId=${s.projectA}`))).status).toBe(200);
      expect((await attendanceRoute.GET(request(`/api/attendance?organizationId=${s.organizationId}&projectId=${s.projectB}`))).status).toBe(403);
      // One employee's full history is an organization-wide read.
      expect((await attendanceRoute.GET(request(`/api/attendance?organizationId=${s.organizationId}&employeeId=${new Types.ObjectId()}`))).status).toBe(403);
    });

    it("GET /api/payroll-runs shows a project-scoped reader only their projects' runs", async () => {
      const s = await seed();
      const run = (projectId?: string) => ({
        organizationId: s.organization._id,
        runNumber: `PR-${unique()}`,
        status: "draft",
        payPeriodStart: new Date("2026-09-01"),
        payPeriodEnd: new Date("2026-09-15"),
        ...(projectId ? { projectId: new Types.ObjectId(projectId) } : {}),
      });
      await PayrollRunModel.collection.insertMany([run(), run(s.projectA), run(s.projectB)]);
      const projectsOf = async (userId: string) => {
        session.mockResolvedValue({ user: { id: userId } });
        const response = await payrollRunsRoute.GET(request(`/api/payroll-runs?organizationId=${s.organizationId}`));
        expect(response.status).toBe(200);
        const body = (await response.json()) as { runs: { projectId?: string }[] };
        return body.runs.map((r) => r.projectId ?? "organization").sort();
      };
      expect(await projectsOf(s.userA)).toEqual(["organization", s.projectA, s.projectB].sort());
      expect(await projectsOf(s.userB)).toEqual([s.projectA]);
      expect(await projectsOf(s.userC)).toEqual([s.projectB]);
    });
  });
});
