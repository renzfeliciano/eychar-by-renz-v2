import { GovernmentIdTypeModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

/** Government ID types an employee can hold, beyond SSS, PhilHealth, Pag-IBIG and TIN (Settings › Catalogs). */
export const GovernmentIdTypeService = createSimpleCatalogService(GovernmentIdTypeModel, "GovernmentIdType");
