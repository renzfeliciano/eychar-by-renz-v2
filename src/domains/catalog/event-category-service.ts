import { EventCategoryModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const EventCategoryService = createSimpleCatalogService(EventCategoryModel, "EventCategory");
