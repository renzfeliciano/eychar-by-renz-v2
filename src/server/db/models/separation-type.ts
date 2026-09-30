import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const separationTypeSchema = buildSimpleCatalogSchema();

export type SeparationType = InferSchemaType<typeof separationTypeSchema>;

export const SeparationTypeModel = models.SeparationType ?? model("SeparationType", separationTypeSchema);
