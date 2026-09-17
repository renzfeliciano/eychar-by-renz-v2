import { z } from "zod";
import { ASSET_CONDITIONS } from "@/server/db/models/asset-issuance";

const assetIssuanceFields = z.object({
  organizationId: z.string().trim().min(1),
  assetName: z.string().trim().min(1, "Asset name is required").max(120),
  assetType: z.string().trim().max(60).optional(),
  serialNumber: z.string().trim().max(80).optional(),
  condition: z.enum(ASSET_CONDITIONS),
  issuedDate: z.coerce.date(),
  returnedDate: z.coerce.date().optional(),
  remarks: z.string().trim().max(255).optional(),
});

// Same shape for create and update, mirroring the legacy v1 app's single
// reused form dialog.
export const assetIssuanceSchema = assetIssuanceFields.superRefine((data, ctx) => {
  if (data.returnedDate && data.returnedDate < data.issuedDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["returnedDate"], message: "Return date must be on or after the issued date." });
  }
});

export const createAssetIssuanceSchema = assetIssuanceSchema;
export const updateAssetIssuanceSchema = assetIssuanceSchema;

export type CreateAssetIssuanceInput = z.infer<typeof createAssetIssuanceSchema>;
export type UpdateAssetIssuanceInput = z.infer<typeof updateAssetIssuanceSchema>;
