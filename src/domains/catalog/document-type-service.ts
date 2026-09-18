import { DocumentTypeModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const DocumentTypeService = createSimpleCatalogService(DocumentTypeModel, "DocumentType");
