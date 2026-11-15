import { CivilStatusModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

/** Civil status choices for a person's profile and the roster (Settings › Catalogs). */
export const CivilStatusService = createSimpleCatalogService(CivilStatusModel, "CivilStatus");
