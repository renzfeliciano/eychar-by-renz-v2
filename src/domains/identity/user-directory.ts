import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PersonModel, UserModel } from "@/server/db/models";
import { formatPersonName } from "@/lib/person-name";

/**
 * Display names for user ids (who prepared, approved, released …): the
 * linked person's name when there is one, else the username or email.
 * Missing ids simply don't appear in the map.
 */
export async function userDisplayNames(userIds: (string | Types.ObjectId | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean).map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return new Map();
  await connectMongoDB();

  const users = await UserModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
    .select("username email personId")
    .lean();
  const persons = await PersonModel.find({ _id: { $in: users.map((user) => user.personId).filter(Boolean) } }).lean();
  const personById = new Map(persons.map((person) => [person._id.toString(), person]));

  return new Map(
    users.map((user) => {
      const person = user.personId ? personById.get(user.personId.toString()) : undefined;
      return [user._id.toString(), person ? formatPersonName(person) : (user.username ?? user.email ?? "Unknown user")];
    }),
  );
}
