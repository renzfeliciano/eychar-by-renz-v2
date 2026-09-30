import { ClearanceDepartmentModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const ClearanceDepartmentService = createSimpleCatalogService(ClearanceDepartmentModel, "ClearanceDepartment");
