import { EmploymentTypeModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const EmploymentTypeService = createSimpleCatalogService(EmploymentTypeModel, "EmploymentType");
