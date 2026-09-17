import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PersonModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";

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
};
