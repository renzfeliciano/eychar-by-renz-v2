import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";

/**
 * Resolves an active user by username OR email — mirrors the login
 * convention this HR team already uses elsewhere, where an account may
 * have only one of the two set.
 */
export async function findUserByLogin(login: string) {
  await connectMongoDB();

  const normalized = login.trim().toLowerCase();
  if (!normalized) return null;

  return UserModel.findOne({
    $or: [{ username: normalized }, { email: normalized }],
    status: "active",
  }).lean();
}
