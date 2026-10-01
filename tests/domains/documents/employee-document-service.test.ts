import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeDocumentModel, OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { DocumentTypeService } from "@/domains/catalog/document-type-service";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";

async function seedEmployee(organizationId: object, suffix: string) {
  const person = await PersonModel.create({ organizationId, firstName: `First${suffix}`, lastName: `Last${suffix}` });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}` });
}

// A real (tiny) PDF header: uploads are checked against their own bytes.
const SAMPLE_BYTES = new Uint8Array(Buffer.from("%PDF-1.4\n%sample file contents\n"));
const SAMPLE_BASE64 = Buffer.from(SAMPLE_BYTES).toString("base64");
const pdf = (fileName: string) => ({ fileName, fileType: "application/pdf", bytes: SAMPLE_BYTES });

describe("EmployeeDocumentService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("uploads a document for an employee", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "A");

    const document = await EmployeeDocumentService.create(
      employee._id.toString(),
      {
        organizationId: orgId,
        title: "Government ID",
        documentType: "government-id",
      },
      pdf("id.pdf"),
      {},
    );

    expect(document.title).toBe("Government ID");
    // No Blob store configured in tests: kept inline, as before ADR-038.
    expect(document.fileData).toBe(SAMPLE_BASE64);
    expect(document.storage?.provider).toBe("inline");
    expect(document.fileSize).toBe(SAMPLE_BYTES.byteLength);

    const file = await EmployeeDocumentService.readFile(document._id.toString(), orgId, employee._id.toString());
    expect(Buffer.from(file.bytes).equals(Buffer.from(SAMPLE_BYTES))).toBe(true);
    expect(file).toMatchObject({ fileName: "id.pdf", contentType: "application/pdf" });
    // Another employee's id can't be used to fetch it.
    const other = await seedEmployee(organization._id, "A2");
    await expect(EmployeeDocumentService.readFile(document._id.toString(), orgId, other._id.toString())).rejects.toThrow(NotFoundError);
  });

  it("rejects a document type that doesn't match the organization's configured catalog", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-bad-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "B");
    await DocumentTypeService.create({ organizationId: orgId, code: "government-id", name: "Government ID" }, {});

    await expect(
      EmployeeDocumentService.create(
        employee._id.toString(),
        { organizationId: orgId, title: "Bad doc", documentType: "not-real" },
        pdf("x.pdf"),
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("rejects an employee id that doesn't belong to the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-org-${Date.now()}-${Math.random()}` });
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-doc-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const foreignEmployee = await seedEmployee(otherOrg._id, "FOREIGN");

    await expect(
      EmployeeDocumentService.create(
        foreignEmployee._id.toString(),
        { organizationId: orgId, title: "Doc", documentType: "government-id" },
        pdf("x.pdf"),
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("updates a document's metadata without touching the stored file", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-update-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "C");
    const document = await EmployeeDocumentService.create(
      employee._id.toString(),
      { organizationId: orgId, title: "ID", documentType: "government-id" },
      pdf("id.pdf"),
      {},
    );

    const updated = await EmployeeDocumentService.update(
      document._id.toString(),
      orgId,
      { title: "Government ID (renewed)", documentType: "government-id", notes: "Renewed copy" },
      {},
    );

    expect(updated.title).toBe("Government ID (renewed)");
    expect(updated.notes).toBe("Renewed copy");
    expect(updated.fileData).toBe(SAMPLE_BASE64);
  });

  it("lists documents for an employee, most recently uploaded first", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "D");
    await EmployeeDocumentService.create(
      employee._id.toString(),
      { organizationId: orgId, title: "First", documentType: "government-id" },
      pdf("a.pdf"),
      {},
    );
    await EmployeeDocumentService.create(
      employee._id.toString(),
      { organizationId: orgId, title: "Second", documentType: "government-id" },
      pdf("b.pdf"),
      {},
    );

    const documents = await EmployeeDocumentService.listForEmployee(employee._id.toString(), orgId);
    expect(documents).toHaveLength(2);
    expect(documents[0].title).toBe("Second");
  });

  it("still reads documents stored before object storage (inline base64, no storage field)", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-legacy-${Date.now()}-${Math.random()}` });
    const employee = await seedEmployee(organization._id, "L");
    const legacy = await EmployeeDocumentModel.create({
      organizationId: organization._id,
      employeeId: employee._id,
      title: "Old contract",
      documentType: "contract",
      fileName: "contract.pdf",
      fileType: "application/pdf",
      fileSize: SAMPLE_BYTES.byteLength,
      fileData: SAMPLE_BASE64,
    });
    const file = await EmployeeDocumentService.readFile(legacy._id.toString(), organization._id.toString(), employee._id.toString());
    expect(Buffer.from(file.bytes).equals(Buffer.from(SAMPLE_BYTES))).toBe(true);
  });

  it("refuses a file whose bytes don't match its type", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-fake-${Date.now()}-${Math.random()}` });
    const employee = await seedEmployee(organization._id, "F");
    await expect(
      EmployeeDocumentService.create(
        employee._id.toString(),
        { organizationId: organization._id.toString(), title: "Fake", documentType: "government-id" },
        { fileName: "fake.pdf", fileType: "application/pdf", bytes: new Uint8Array(Buffer.from("<html>not a pdf</html>")) },
        {},
      ),
    ).rejects.toThrow(ValidationError);
  });
});
