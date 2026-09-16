import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const recruitmentStageSchema = buildSimpleCatalogSchema();

export type RecruitmentStage = InferSchemaType<typeof recruitmentStageSchema>;

export const RecruitmentStageModel = models.RecruitmentStage ?? model("RecruitmentStage", recruitmentStageSchema);
