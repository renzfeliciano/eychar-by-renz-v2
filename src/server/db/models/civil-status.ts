import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const civilStatusSchema = buildSimpleCatalogSchema();

export type CivilStatus = InferSchemaType<typeof civilStatusSchema>;

export const CivilStatusModel = models.CivilStatus ?? model("CivilStatus", civilStatusSchema);
