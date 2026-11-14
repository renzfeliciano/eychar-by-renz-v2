import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const complaintStageSchema = buildSimpleCatalogSchema();

export type ComplaintStage = InferSchemaType<typeof complaintStageSchema>;

export const ComplaintStageModel = models.ComplaintStage ?? model("ComplaintStage", complaintStageSchema);
