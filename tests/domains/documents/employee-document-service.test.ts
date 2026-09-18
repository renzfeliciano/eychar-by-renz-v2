import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { DocumentTypeService } from "@/domains/catalog/document-type-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

async function seedEmployee(organizationId: object, suffix: string) {
  const person = await PersonModel.create({ organizationId, firstName: `First${suffix}`, lastName: `Last${suffix}` });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}` });
}

const SAMPLE_BASE64 = Buffer.from("sample file contents").toString("base64");

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
        fileName: "id.pdf",
        fileType: "application/pdf",
        fileSize: 1024,
        fileData: SAMPLE_BASE64,
      },
      {},
    );

    expect(document.title).toBe("Government ID");
    expect(document.fileData).toBe(SAMPLE_BASE64);
  });

  it("rejects a document type that doesn't match the organization's configured catalog", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-doc-bad-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "B");
    await DocumentTypeService.create({ organizationId: orgId, code: "government-id", name: "Government ID" }, {});

    await expect(
      EmployeeDocumentService.create(
        employee._id.toString(),
        { organizationId: orgId, title: "Bad doc", documentType: "not-real", fileName: "x.pdf", fileType: "application/pdf", fileSize: 10, fileData: SAMPLE_BASE64 },
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
        { organizationId: orgId, title: "Doc", documentType: "government-id", fileName: "x.pdf", fileType: "application/pdf", fileSize: 10, fileData: SAMPLE_BASE64 },
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
      { organizationId: orgId, title: "ID", documentType: "government-id", fileName: "id.pdf", fileType: "application/pdf", fileSize: 10, fileData: SAMPLE_BASE64 },
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
      { organizationId: orgId, title: "First", documentType: "government-id", fileName: "a.pdf", fileType: "application/pdf", fileSize: 10, fileData: SAMPLE_BASE64 },
      {},
    );
    await EmployeeDocumentService.create(
      employee._id.toString(),
      { organizationId: orgId, title: "Second", documentType: "government-id", fileName: "b.pdf", fileType: "application/pdf", fileSize: 10, fileData: SAMPLE_BASE64 },
      {},
    );

    const documents = await EmployeeDocumentService.listForEmployee(employee._id.toString(), orgId);
    expect(documents).toHaveLength(2);
    expect(documents[0].title).toBe("Second");
  });
});
