import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PersonModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";

export type CreatePersonInput = {
  organizationId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: "Male" | "Female";
  birthDate?: Date;
  address?: string;
  sssNumber?: string;
  philHealthNumber?: string;
  pagIbigNumber?: string;
  tinNumber?: string;
};

// "" on an otherwise-typed field means "clear it" (see updateEmployeeProfileSchema's
// `clearable` wrapper) — every field in an edit form is always submitted, so a blank
// value is a deliberate signal, not "not provided."
type Clearable<T> = T | "";
export type UpdatePersonInput = Partial<{
  [K in keyof Omit<CreatePersonInput, "organizationId">]: Clearable<CreatePersonInput[K]>;
}>;

export const PersonService = {
  async create(input: CreatePersonInput, actor: { userId?: string }) {
    await connectMongoDB();

    const person = await PersonModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      gender: input.gender,
      birthDate: input.birthDate,
      address: input.address,
      sssNumber: input.sssNumber,
      philHealthNumber: input.philHealthNumber,
      pagIbigNumber: input.pagIbigNumber,
      tinNumber: input.tinNumber,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "person.created",
      resourceType: "Person",
      resourceId: person._id.toString(),
      after: { firstName: person.firstName, lastName: person.lastName },
    });

    return person;
  },

  async update(personId: string, organizationId: string, patch: UpdatePersonInput, actor: { userId?: string }) {
    await connectMongoDB();

    const existing = await PersonModel.findOne({
      _id: new Types.ObjectId(personId),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!existing) throw new NotFoundError("Person not found in this organization");

    const before = {
      firstName: existing.firstName,
      middleName: existing.middleName,
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone,
      gender: existing.gender,
      birthDate: existing.birthDate,
      address: existing.address,
      sssNumber: existing.sssNumber,
      philHealthNumber: existing.philHealthNumber,
      pagIbigNumber: existing.pagIbigNumber,
      tinNumber: existing.tinNumber,
    };

    // An empty string means "clear it" ($unset), not "set it to the empty
    // string" — a plain Object.assign + save() would leave the old value
    // in place instead, since Mongoose doesn't treat that as a real change.
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, ""> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (value === "") unsetFields[key] = "";
      else setFields[key] = value;
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(setFields).length > 0) update.$set = setFields;
    if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;

    const person = await PersonModel.findOneAndUpdate({ _id: existing._id }, update, { returnDocument: "after" });
    if (!person) throw new NotFoundError("Person not found in this organization");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "person.updated",
      resourceType: "Person",
      resourceId: person._id.toString(),
      before,
      after: patch,
    });

    return person;
  },
};
