/** "Acme Holdings, Inc." -> "acme-holdings-inc": the organization part of an export's filename. */
export function filenameSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organization";
}

/** "acme-inc-case-monitoring-2026-09-28": who, what and when, without an extension. */
export function exportFilename(organizationName: string, what: string, on: Date = new Date()): string {
  const day = `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, "0")}-${String(on.getDate()).padStart(2, "0")}`;
  return `${filenameSlug(organizationName)}-${what}-${day}`;
}
