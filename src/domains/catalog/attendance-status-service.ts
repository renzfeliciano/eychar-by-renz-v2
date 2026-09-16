import { AttendanceStatusModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const AttendanceStatusService = createSimpleCatalogService(AttendanceStatusModel, "AttendanceStatus");
