import { z } from "zod";
import { clearable, objectIdSchema } from "./shared";

export const GEOFENCE_RADIUS_MIN_METERS = 10;
export const GEOFENCE_RADIUS_MAX_METERS = 5000;

const latitudeSchema = z.coerce
  .number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");
const longitudeSchema = z.coerce
  .number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");
const geofenceRadiusSchema = z.coerce
  .number()
  .int("Radius must be a whole number of meters")
  .min(GEOFENCE_RADIUS_MIN_METERS, `Radius must be at least ${GEOFENCE_RADIUS_MIN_METERS} m`)
  .max(GEOFENCE_RADIUS_MAX_METERS, `Radius can't exceed ${GEOFENCE_RADIUS_MAX_METERS} m`);

export const createOrganizationUnitSchema = z.object({
  organizationId: z.string().trim().min(1),
  parentUnitId: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export const createPositionSchema = z.object({
  organizationId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
});

export const createLocationSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  address: z.string().trim().optional(),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  geofenceRadiusMeters: geofenceRadiusSchema.optional(),
});

// Edit forms submit every field pre-filled; "" means "clear it" (see
// clearable()). `code` isn't editable — it's the stable identifier.
export const updateLocationSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  name: z.string().trim().min(1).optional(),
  address: clearable(z.string().trim()).optional(),
  latitude: clearable(latitudeSchema).optional(),
  longitude: clearable(longitudeSchema).optional(),
  geofenceRadiusMeters: geofenceRadiusSchema.optional(),
});

export const createProjectSchema = z.object({
  organizationId: z.string().trim().min(1),
  locationId: objectIdSchema("Select a valid location").optional(),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
});

export const updateProjectSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  name: z.string().trim().min(1).optional(),
  description: clearable(z.string().trim()).optional(),
  locationId: clearable(objectIdSchema("Select a valid location")).optional(),
});

export const updateOrganizationEntityStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  effectiveTo: z.coerce.date().optional(),
});

export type CreateOrganizationUnitInput = z.infer<typeof createOrganizationUnitSchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateOrganizationEntityStatusInput = z.infer<typeof updateOrganizationEntityStatusSchema>;
