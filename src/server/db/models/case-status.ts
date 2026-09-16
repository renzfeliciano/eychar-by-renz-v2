import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const caseStatusSchema = buildSimpleCatalogSchema();

export type CaseStatus = InferSchemaType<typeof caseStatusSchema>;

export const CaseStatusModel = models.CaseStatus ?? model("CaseStatus", caseStatusSchema);
