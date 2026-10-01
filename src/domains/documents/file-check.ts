import { ValidationError } from "@/shared/errors";

/** Decoded file cap (the base64 text is ~33% larger). Matches the schema's limit. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

type Kind = { label: string; matches: (bytes: Uint8Array) => boolean };

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const isZip = (bytes: Uint8Array) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (bytes: Uint8Array) => startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * The file types employee documents may be. Each is checked against the
 * file's own first bytes, so a renamed .exe or .html can't pass as a PDF
 * just because the browser said so.
 */
export const ALLOWED_DOCUMENT_TYPES: Record<string, Kind> = {
  "application/pdf": { label: "PDF", matches: (bytes) => startsWith(bytes, ascii("%PDF-")) },
  "image/png": { label: "PNG", matches: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  "image/jpeg": { label: "JPEG", matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  "image/webp": { label: "WebP", matches: (bytes) => startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8) },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "Word", matches: isZip },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { label: "Excel", matches: isZip },
  "application/msword": { label: "Word 97–2003", matches: isOle },
  "application/vnd.ms-excel": { label: "Excel 97–2003", matches: isOle },
};

/** For the upload input's `accept` attribute. */
export const DOCUMENT_ACCEPT = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx", ".xls", ".xlsx", ...Object.keys(ALLOWED_DOCUMENT_TYPES)].join(",");

export const ALLOWED_DOCUMENT_LABELS = [...new Set(Object.values(ALLOWED_DOCUMENT_TYPES).map((kind) => kind.label.replace(/ 97–2003$/, "")))].join(", ");

// One character class, so it runs in linear time even on a 7MB string.
const BASE64_CHARS = /^[A-Za-z0-9+/]+={0,2}$/;
const isStrictBase64 = (data: string) => data.length % 4 === 0 && BASE64_CHARS.test(data);

/** The MIME type to hand back on download: the stored one if it's allowed, otherwise a plain binary type. */
export function safeDownloadType(fileType: string | null | undefined): string {
  return fileType && Object.hasOwn(ALLOWED_DOCUMENT_TYPES, fileType) ? fileType : "application/octet-stream";
}

/**
 * Checks an upload before it's stored: an allowed type, real base64, within
 * the size cap, and content that matches the type. Returns the size the
 * server measured (never the browser's claim).
 */
export function inspectDocumentUpload(input: { fileType: string; fileData: string }): { fileType: string; fileSize: number } {
  const fileType = input.fileType.trim().toLowerCase();
  const kind = Object.hasOwn(ALLOWED_DOCUMENT_TYPES, fileType) ? ALLOWED_DOCUMENT_TYPES[fileType] : undefined;
  if (!kind) throw new ValidationError(`That file type isn't allowed. Upload a ${ALLOWED_DOCUMENT_LABELS} file.`);

  const data = input.fileData.replace(/\s+/g, "");
  if (data.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4) throw new ValidationError("File is too large (max 5MB)");
  if (!data || !isStrictBase64(data)) throw new ValidationError("The file couldn't be read. Choose it again and retry.");
  const bytes = Buffer.from(data, "base64");
  if (bytes.length === 0) throw new ValidationError("The file is empty.");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new ValidationError("File is too large (max 5MB)");
  if (!kind.matches(bytes)) throw new ValidationError(`That file isn't a real ${kind.label} file. Check the file and try again.`);
  return { fileType, fileSize: bytes.length };
}

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** For when the browser reports no type: a best guess from the file name (still checked against the bytes). */
export function guessDocumentType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return Object.hasOwn(TYPE_BY_EXTENSION, extension) ? TYPE_BY_EXTENSION[extension] : "application/octet-stream";
}
