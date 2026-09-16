import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const employmentTypeSchema = buildSimpleCatalogSchema();

export type EmploymentType = InferSchemaType<typeof employmentTypeSchema>;

export const EmploymentTypeModel = models.EmploymentType ?? model("EmploymentType", employmentTypeSchema);
