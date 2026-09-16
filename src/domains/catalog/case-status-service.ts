import { CaseStatusModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const CaseStatusService = createSimpleCatalogService(CaseStatusModel, "CaseStatus");
