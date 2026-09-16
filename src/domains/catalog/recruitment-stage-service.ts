import { RecruitmentStageModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const RecruitmentStageService = createSimpleCatalogService(RecruitmentStageModel, "RecruitmentStage");
