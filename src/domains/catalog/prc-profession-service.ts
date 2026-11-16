import { PrcProfessionModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

/** Professions an employee's PRC license can be for (Settings › Catalogs). */
export const PrcProfessionService = createSimpleCatalogService(PrcProfessionModel, "PrcProfession");
