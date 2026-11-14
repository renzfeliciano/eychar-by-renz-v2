import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const educationLevelSchema = buildSimpleCatalogSchema();

export type EducationLevel = InferSchemaType<typeof educationLevelSchema>;

export const EducationLevelModel = models.EducationLevel ?? model("EducationLevel", educationLevelSchema);
