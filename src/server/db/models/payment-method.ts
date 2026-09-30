import { model, models, type InferSchemaType } from "mongoose";
import { buildSimpleCatalogSchema } from "./simple-catalog-schema";

// How a final settlement is paid out (Bank transfer, Check, Cash, …): an org catalog, so it stays flexible.
const paymentMethodSchema = buildSimpleCatalogSchema();

export type PaymentMethod = InferSchemaType<typeof paymentMethodSchema>;

export const PaymentMethodModel = models.PaymentMethod ?? model("PaymentMethod", paymentMethodSchema);
