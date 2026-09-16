import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const eventCategorySchema = buildSimpleCatalogSchema();

export type EventCategory = InferSchemaType<typeof eventCategorySchema>;

export const EventCategoryModel = models.EventCategory ?? model("EventCategory", eventCategorySchema);
