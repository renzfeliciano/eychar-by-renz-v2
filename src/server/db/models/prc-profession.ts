import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const prcProfessionSchema = buildSimpleCatalogSchema();

export type PrcProfession = InferSchemaType<typeof prcProfessionSchema>;

export const PrcProfessionModel = models.PrcProfession ?? model("PrcProfession", prcProfessionSchema);
