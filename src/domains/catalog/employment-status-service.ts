import { EmploymentStatusModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const EmploymentStatusService = createSimpleCatalogService(EmploymentStatusModel, "EmploymentStatus");
