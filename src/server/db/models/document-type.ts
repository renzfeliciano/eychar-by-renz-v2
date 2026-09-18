import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

const documentTypeSchema = buildSimpleCatalogSchema();

export type DocumentType = InferSchemaType<typeof documentTypeSchema>;

export const DocumentTypeModel = models.DocumentType ?? model("DocumentType", documentTypeSchema);
