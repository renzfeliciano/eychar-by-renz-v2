import { EvaluationTypeModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const EvaluationTypeService = createSimpleCatalogService(EvaluationTypeModel, "EvaluationType");
