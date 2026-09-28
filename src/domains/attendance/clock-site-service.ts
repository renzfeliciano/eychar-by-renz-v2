import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LocationModel, ProjectModel } from "@/server/db/models";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

/**
 * A place an employee can clock in at: a Project, geofenced by its linked
 * Location's coordinates + radius (ADR-026). Derived on read, never stored,
 * so HR moving a project to a different site or adjusting a radius takes
 * effect on the very next clock-in.
 */
export type ClockSite = {
  projectId: string;
  projectName: string;
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

type LocationLike = {
  _id: Types.ObjectId;
  name: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
};

function hasSiteCoordinates(location: LocationLike): location is LocationLike & { latitude: number; longitude: number } {
  return typeof location.latitude === "number" && typeof location.longitude === "number";
}

function toClockSite(project: { _id: Types.ObjectId; name: string }, location: LocationLike & { latitude: number; longitude: number }): ClockSite {
  return {
    projectId: project._id.toString(),
    projectName: project.name,
    locationId: location._id.toString(),
    locationName: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    radiusMeters: location.geofenceRadiusMeters ?? 100,
  };
}

export const ClockSiteService = {
  async listForOrganization(organizationId: string): Promise<ClockSite[]> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);

    const projects = await ProjectModel.find({ organizationId: orgObjectId, status: "active", locationId: { $exists: true, $ne: null } })
      .sort({ name: 1 })
      .lean();
    const locations = await LocationModel.find({
      organizationId: orgObjectId,
      status: "active",
      _id: { $in: projects.map((project) => project.locationId) },
      latitude: { $ne: null },
      longitude: { $ne: null },
    }).lean();
    const locationById = new Map(locations.map((location) => [location._id.toString(), location]));

    return projects.flatMap((project) => {
      const location = locationById.get(project.locationId!.toString());
      return location && hasSiteCoordinates(location) ? [toClockSite(project, location)] : [];
    });
  },

  /**
   * `allowInactiveProject` exists for clock-out: a project deactivated
   * mid-day must not trap an employee who already clocked in there.
   */
  async resolve(organizationId: string, projectId: string, options: { allowInactiveProject?: boolean } = {}): Promise<ClockSite> {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(projectId)) throw new NotFoundError("Project not found in this organization");

    const orgObjectId = new Types.ObjectId(organizationId);
    const project = await ProjectModel.findOne({ _id: new Types.ObjectId(projectId), organizationId: orgObjectId }).lean();
    if (!project) throw new NotFoundError("Project not found in this organization");
    if (project.status !== "active" && !options.allowInactiveProject) {
      throw new BusinessRuleError(`"${project.name}" is no longer an active project`);
    }

    const location = project.locationId
      ? await LocationModel.findOne({ _id: project.locationId, organizationId: orgObjectId, status: "active" }).lean()
      : null;
    if (!location || !hasSiteCoordinates(location)) {
      throw new BusinessRuleError(`"${project.name}" doesn't have a clock-in site set up yet. Ask HR to add its location's coordinates.`);
    }

    return toClockSite(project, location);
  },
};
