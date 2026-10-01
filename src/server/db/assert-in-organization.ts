import { Types } from "mongoose";
import { NotFoundError } from "@/shared/errors";

/** Any organization-owned model (every one has `organizationId`); structural so typed and untyped models both fit. */
type OrgScopedModel = {
  exists(filter: { _id: Types.ObjectId; organizationId: Types.ObjectId }): { setOptions(options: { includeHidden: boolean }): PromiseLike<unknown> };
};

/**
 * Guards a client-supplied foreign id before it is written into another
 * record: it must name a document of `model` that belongs to
 * `organizationId`. A malformed id, or one from another organization, reads
 * as "not found" (never "forbidden"), so ids from other tenants can't be
 * probed. Hidden test records still count — hiding is about who reads them,
 * not who owns them.
 */
export async function assertInOrganization(
  model: OrgScopedModel,
  id: string | Types.ObjectId,
  organizationId: string | Types.ObjectId,
  label: string,
): Promise<void> {
  const raw = id instanceof Types.ObjectId ? id : String(id);
  if (!Types.ObjectId.isValid(raw) || !Types.ObjectId.isValid(organizationId)) throw new NotFoundError(`${label} not found in this organization`);
  const found = await model
    .exists({ _id: new Types.ObjectId(raw), organizationId: new Types.ObjectId(organizationId) })
    .setOptions({ includeHidden: true });
  if (!found) throw new NotFoundError(`${label} not found in this organization`);
}

/** {@link assertInOrganization} for an optional id: nothing to check when it's absent. */
export async function assertOptionalInOrganization(
  model: OrgScopedModel,
  id: string | Types.ObjectId | null | undefined,
  organizationId: string | Types.ObjectId,
  label: string,
): Promise<void> {
  if (id === null || id === undefined || id === "") return;
  await assertInOrganization(model, id, organizationId, label);
}
