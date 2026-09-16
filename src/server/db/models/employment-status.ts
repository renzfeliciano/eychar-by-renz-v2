import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const employmentStatusSchema = buildSimpleCatalogSchema();

export type EmploymentStatus = InferSchemaType<typeof employmentStatusSchema>;

export const EmploymentStatusModel = models.EmploymentStatus ?? model("EmploymentStatus", employmentStatusSchema);
