import { PerformanceRatingModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const PerformanceRatingService = createSimpleCatalogService(PerformanceRatingModel, "PerformanceRating");
