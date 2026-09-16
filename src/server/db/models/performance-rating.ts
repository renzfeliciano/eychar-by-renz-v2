import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const performanceRatingSchema = buildSimpleCatalogSchema();

export type PerformanceRating = InferSchemaType<typeof performanceRatingSchema>;

export const PerformanceRatingModel = models.PerformanceRating ?? model("PerformanceRating", performanceRatingSchema);
