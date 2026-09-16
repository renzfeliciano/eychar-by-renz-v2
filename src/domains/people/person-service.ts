import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PersonModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";

export type CreatePersonInput = {
  organizationId: string;
  firstName: string;
  lastName: string;
  email?: string;
};

export const PersonService = {
  async create(input: CreatePersonInput, actor: { userId?: string }) {
    await connectMongoDB();

    const person = await PersonModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
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
