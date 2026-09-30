import { PaymentMethodModel } from "@/server/db/models";
import { createSimpleCatalogService } from "./simple-catalog-service";

export const PaymentMethodService = createSimpleCatalogService(PaymentMethodModel, "PaymentMethod");
