import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const attendanceStatusSchema = buildSimpleCatalogSchema();

export type AttendanceStatus = InferSchemaType<typeof attendanceStatusSchema>;

export const AttendanceStatusModel = models.AttendanceStatus ?? model("AttendanceStatus", attendanceStatusSchema);
