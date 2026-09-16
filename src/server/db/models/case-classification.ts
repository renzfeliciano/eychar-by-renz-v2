import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const caseClassificationSchema = buildSimpleCatalogSchema();

export type CaseClassification = InferSchemaType<typeof caseClassificationSchema>;

export const CaseClassificationModel = models.CaseClassification ?? model("CaseClassification", caseClassificationSchema);
