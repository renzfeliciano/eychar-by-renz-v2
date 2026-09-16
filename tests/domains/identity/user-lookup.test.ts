import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { findUserByLogin } from "@/domains/identity/user-lookup";

describe("findUserByLogin", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await UserModel.deleteMany({});
  });

  it("matches by username", async () => {
    await UserModel.create({ username: "renzy_admin", passwordHash: "hash" });

    const user = await findUserByLogin("renzy_admin");

    expect(user).not.toBeNull();
    expect(user?.username).toBe("renzy_admin");
  });

  it("matches by email when no username is provided", async () => {
    await UserModel.create({ email: "hr@example.com", passwordHash: "hash" });

    const user = await findUserByLogin("hr@example.com");

    expect(user).not.toBeNull();
    expect(user?.email).toBe("hr@example.com");
  });

  it("is case-insensitive and trims whitespace", async () => {
    await UserModel.create({ username: "renzy_admin", passwordHash: "hash" });

    const user = await findUserByLogin("  Renzy_Admin  ");

    expect(user).not.toBeNull();
  });

  it("returns null for a disabled account", async () => {
    await UserModel.create({ username: "renzy_admin", passwordHash: "hash", status: "disabled" });

    const user = await findUserByLogin("renzy_admin");

    expect(user).toBeNull();
  });

  it("returns null when nothing matches", async () => {
    const user = await findUserByLogin("nobody");

    expect(user).toBeNull();
  });
});
