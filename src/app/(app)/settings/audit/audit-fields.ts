import { formatMoney } from "@/lib/money";
import { formatDateKey } from "@/lib/date-key";

export type AuditField = { label: string; value: string };

// Field names whose plain humanized form reads badly, or that mean something specific in pay terms.
const LABELS: Record<string, string> = {
  rateType: "Pay basis",
  baseRate: "Basic salary",
  annualIncrease: "Annual increase",
  rate: "Total salary",
  minimumWageEarner: "Minimum wage earner",
  sssNumber: "SSS number",
  philHealthNumber: "PhilHealth number",
  pagIbigNumber: "Pag-IBIG number",
  tinNumber: "TIN",
  pwdIdNumber: "PWD ID number",
  pwdIdValidUntil: "PWD ID valid until",
  soloParentIdNumber: "Solo Parent ID number",
  soloParentIdValidUntil: "Solo Parent ID valid until",
  // Government ID and PRC license records.
  typeCode: "ID type",
  otherTypeName: "ID type name",
  idNumber: "ID number",
  professionCode: "Profession",
  licenseNumber: "License number",
  validUntil: "Valid until",
};

// Codes stored for a choice, shown by their name.
const VALUE_NAMES: Record<string, Record<string, string>> = {
  rateType: { monthly: "Monthly", daily: "Daily" },
};

// Numbers under these names are peso amounts.
const MONEY_KEY = /(rate|amount|salary|pay|increase|total|allowance|deduction|tax|contribution|basic|gross|net)$/i;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "annualIncrease" → "Annual increase". */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelFor(key: string): string {
  return LABELS[key] ?? humanize(key);
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return MONEY_KEY.test(key) ? formatMoney(value) : value.toLocaleString("en-US");
  if (typeof value === "string") {
    const named = VALUE_NAMES[key]?.[value];
    if (named) return named;
    if (DATE_KEY.test(value)) return formatDateKey(value);
    if (ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))) {
      const date = new Date(value);
      // A calendar day is stored as UTC midnight; anything else is a moment in time.
      return date.toISOString().endsWith("T00:00:00.000Z") ? formatDateKey(value.slice(0, 10)) : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.map((item) => (item && typeof item === "object" ? describeItem(item as Record<string, unknown>) : formatValue(key, item))).join("\n");
  }
  if (typeof value === "object") return describeObject(value as Record<string, unknown>);
  return String(value);
}

/** One item of a list: its name first if it has one, then the rest. "Rice · Amount ₱2,000.00 · Basis monthly". */
function describeItem(item: Record<string, unknown>): string {
  const { name, label, ...rest } = item;
  const title = typeof name === "string" ? name : typeof label === "string" ? label : null;
  const details = describeObject(rest);
  return title ? (details ? `${title} · ${details}` : title) : details;
}

function describeObject(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => `${labelFor(key)} ${formatValue(key, item)}`)
    .join(" · ");
}

/**
 * A stored audit value (before, after or details) as labelled lines a person
 * can read: names instead of field keys, pesos, dates and Yes/No instead of
 * raw JSON. Plain text is shown as it was stored, never as HTML.
 */
export function auditFields(value: unknown): AuditField[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object" || Array.isArray(value)) return [{ label: "Value", value: formatValue("", value) }];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => ({ label: labelFor(key), value: formatValue(key, item) }));
}

/** For a change: each field whose value differs, with its value before and after (a dash where there was none). */
export function auditChanges(before: unknown, after: unknown): { label: string; before: string; after: string }[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) || Array.isArray(after)) return [];
  const beforeFields = new Map(auditFields(before).map((field) => [field.label, field.value]));
  const afterFields = new Map(auditFields(after).map((field) => [field.label, field.value]));
  // In the order the new value lists its fields, then any the change removed.
  const labels = [...new Set([...afterFields.keys(), ...beforeFields.keys()])];
  return labels
    .map((label) => ({ label, before: beforeFields.get(label) ?? "—", after: afterFields.get(label) ?? "—" }))
    .filter((change) => change.before !== change.after);
}

/** "LeaveRequest" -> "Leave request": the record type as a person would say it, not the system's internal name. */
export function describeRecordType(resourceType: string): string {
  const words = resourceType.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
