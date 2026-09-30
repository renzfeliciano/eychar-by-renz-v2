import { SeparationTypeModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const SeparationTypeService = createSimpleCatalogService(SeparationTypeModel, "SeparationType");
