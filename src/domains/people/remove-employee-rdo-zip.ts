import { PersonModel } from "@/server/db/models";

const HOLDS_EITHER = { $or: [{ rdoCode: { $exists: true } }, { zipCode: { $exists: true } }] };

/**
 * One-off clean-up behind `scripts/remove-employee-rdo-zip.ts`: unsets the employee RDO and ZIP codes that
 * older Person records still carry. Works on the raw collection because the Person schema no longer has
 * these paths and Mongoose would strip them from an update. A dry run only counts.
 */
export async function removeEmployeeRdoZip({ apply }: { apply: boolean }): Promise<{ found: number; cleared: number }> {
  const found = await PersonModel.collection.countDocuments(HOLDS_EITHER);
  if (!apply || found === 0) return { found, cleared: 0 };
  const result = await PersonModel.collection.updateMany(HOLDS_EITHER, { $unset: { rdoCode: "", zipCode: "" } });
  return { found, cleared: result.modifiedCount };
}
