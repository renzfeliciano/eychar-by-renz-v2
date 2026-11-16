import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const governmentIdTypeSchema = buildSimpleCatalogSchema();

export type GovernmentIdType = InferSchemaType<typeof governmentIdTypeSchema>;

export const GovernmentIdTypeModel = models.GovernmentIdType ?? model("GovernmentIdType", governmentIdTypeSchema);
