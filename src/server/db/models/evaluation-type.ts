import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

// What an evaluation is "for" (Contractual, Probationary, Regularization). An
// org-managed catalog like every other lookup list; metadata.defaultPeriodMonths
// pre-fills the evaluation period.
const evaluationTypeSchema = buildSimpleCatalogSchema();

export type EvaluationType = InferSchemaType<typeof evaluationTypeSchema>;

export const EvaluationTypeModel = models.EvaluationType ?? model("EvaluationType", evaluationTypeSchema);
