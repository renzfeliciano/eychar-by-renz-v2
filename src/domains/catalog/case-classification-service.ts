import { CaseClassificationModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const CaseClassificationService = createSimpleCatalogService(CaseClassificationModel, "CaseClassification");
