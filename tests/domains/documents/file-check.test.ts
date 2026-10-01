import { describe, it, expect } from "vitest";
import { guessDocumentType, inspectDocumentUpload, safeDownloadType } from "@/domains/documents/file-check";
import { ValidationError } from "@/shared/errors";

const b64 = (bytes: number[] | string) => Buffer.from(typeof bytes === "string" ? bytes : Uint8Array.from(bytes)).toString("base64");
const PDF = b64("%PDF-1.7\nhello");
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

describe("inspectDocumentUpload", () => {
  it("accepts an allowed type whose bytes match, and measures the size itself", () => {
    expect(inspectDocumentUpload({ fileType: "application/pdf", fileData: PDF })).toEqual({ fileType: "application/pdf", fileSize: 14 });
    expect(inspectDocumentUpload({ fileType: "IMAGE/PNG", fileData: PNG })).toEqual({ fileType: "image/png", fileSize: 12 });
  });

  it("rejects types that aren't allowed, like HTML or SVG", () => {
    expect(() => inspectDocumentUpload({ fileType: "text/html", fileData: b64("<script>alert(1)</script>") })).toThrow(ValidationError);
    expect(() => inspectDocumentUpload({ fileType: "image/svg+xml", fileData: b64("<svg/>") })).toThrow(ValidationError);
    expect(() => inspectDocumentUpload({ fileType: "application/pdf;charset=x", fileData: PDF })).toThrow(ValidationError);
  });

  it("rejects a file whose content doesn't match its claimed type", () => {
    expect(() => inspectDocumentUpload({ fileType: "application/pdf", fileData: b64("MZ\u0090\u0000 not a pdf") })).toThrow(/isn't a real PDF/);
    expect(() => inspectDocumentUpload({ fileType: "image/png", fileData: PDF })).toThrow(/isn't a real PNG/);
  });

  it("rejects text that isn't base64, empty files, and files over 4MB", () => {
    expect(() => inspectDocumentUpload({ fileType: "application/pdf", fileData: "not base64!!" })).toThrow(ValidationError);
    expect(() => inspectDocumentUpload({ fileType: "application/pdf", fileData: "" })).toThrow(ValidationError);
    const big = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(4 * 1024 * 1024)]).toString("base64");
    expect(() => inspectDocumentUpload({ fileType: "application/pdf", fileData: big })).toThrow(/too large/);
  });
});

describe("download and naming helpers", () => {
  it("only hands back allowed types on download", () => {
    expect(safeDownloadType("application/pdf")).toBe("application/pdf");
    expect(safeDownloadType("text/html")).toBe("application/octet-stream");
    expect(safeDownloadType(undefined)).toBe("application/octet-stream");
  });

  it("guesses a type from the file name when the browser gives none", () => {
    expect(guessDocumentType("Contract.DOCX")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(guessDocumentType("scan.jpg")).toBe("image/jpeg");
    expect(guessDocumentType("virus.exe")).toBe("application/octet-stream");
  });
});
