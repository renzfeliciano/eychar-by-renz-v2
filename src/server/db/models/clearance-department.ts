import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const clearanceDepartmentSchema = buildSimpleCatalogSchema();

export type ClearanceDepartment = InferSchemaType<typeof clearanceDepartmentSchema>;

export const ClearanceDepartmentModel = models.ClearanceDepartment ?? model("ClearanceDepartment", clearanceDepartmentSchema);
