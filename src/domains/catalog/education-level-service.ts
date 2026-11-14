import { EducationLevelModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

/** Highest educational attainment choices for the roster (Settings › Catalogs). */
export const EducationLevelService = createSimpleCatalogService(EducationLevelModel, "EducationLevel");
