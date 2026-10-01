import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel } from "@/server/db/models";
import { withTransaction } from "@/server/db/transaction";

const unique = () => `${Date.now()}.${Math.random()}`;

describe("withTransaction (ADR-041)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("keeps every write when the work succeeds", async () => {
    const slug = `txn-ok-${unique()}`;
    const result = await withTransaction(async (session) => {
      await OrganizationModel.create([{ name: "Txn A", slug: `${slug}-a` }], { session });
      await OrganizationModel.create([{ name: "Txn B", slug: `${slug}-b` }], { session });
      return "done";
    });
    expect(result).toBe("done");
    expect(await OrganizationModel.countDocuments({ slug: { $in: [`${slug}-a`, `${slug}-b`] } })).toBe(2);
  });

  it("drops every write when the work throws part way", async () => {
    const slug = `txn-fail-${unique()}`;
    await expect(
      withTransaction(async (session) => {
        await OrganizationModel.create([{ name: "Txn C", slug: `${slug}-c` }], { session });
        throw new Error("failed after the first write");
      }),
    ).rejects.toThrow("failed after the first write");
    expect(await OrganizationModel.countDocuments({ slug: `${slug}-c` })).toBe(0);
  });
});
