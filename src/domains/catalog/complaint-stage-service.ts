import { ComplaintStageModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const ComplaintStageService = createSimpleCatalogService(ComplaintStageModel, "ComplaintStage");
