import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PersonModel } from "@/server/db/models";
import { removeEmployeeRdoZip } from "@/domains/people/remove-employee-rdo-zip";

// Raw inserts: the Person schema no longer has these paths, so Mongoose would drop them.
async function insertLegacyPerson(extra: Record<string, unknown>) {
  const result = await PersonModel.collection.insertOne({ organizationId: new Types.ObjectId(), firstName: "Ana", lastName: "Cruz", ...extra });
  return result.insertedId;
}

describe("removeEmployeeRdoZip", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await PersonModel.deleteMany({});
  });

  it("a dry run counts the people holding either value and changes nothing", async () => {
    const withRdo = await insertLegacyPerson({ rdoCode: "039" });
    await insertLegacyPerson({ zipCode: "1100" });
    await insertLegacyPerson({});

    expect(await removeEmployeeRdoZip({ apply: false })).toEqual({ found: 2, cleared: 0 });
    expect(await PersonModel.collection.findOne({ _id: withRdo })).toMatchObject({ rdoCode: "039" });
  });

  it("applying removes both values and leaves the rest of the person alone", async () => {
    const id = await insertLegacyPerson({ rdoCode: "039", zipCode: "1100", tinNumber: "123-456-789" });

    expect(await removeEmployeeRdoZip({ apply: true })).toEqual({ found: 1, cleared: 1 });
    const stored = await PersonModel.collection.findOne({ _id: id });
    expect(stored).not.toHaveProperty("rdoCode");
    expect(stored).not.toHaveProperty("zipCode");
    expect(stored).toMatchObject({ firstName: "Ana", tinNumber: "123-456-789" });
  });

  it("applying twice is a no-op the second time", async () => {
    await insertLegacyPerson({ rdoCode: "039" });
    await removeEmployeeRdoZip({ apply: true });
    expect(await removeEmployeeRdoZip({ apply: true })).toEqual({ found: 0, cleared: 0 });
  });
});
