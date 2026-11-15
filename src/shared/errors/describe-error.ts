/** keyValue / keyPattern on a MongoServerError E11000 carry the duplicated values themselves (emails, ID numbers). */
const REDACTED_ERROR_FIELDS = ["keyValue", "keyPattern"] as const;

function redactFields(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(Object.keys(value).map((key) => [key, "[redacted]"]));
}

function redactMessage(message: string): string {
  // The driver repeats the duplicated value inside the message: `dup key: { email: "a@b.c" }`.
  return message.replace(/dup key: \{[\s\S]*\}/, "dup key: { [redacted] }");
}

/**
 * What gets logged for an unexpected error: name, code, message and stack,
 * never the whole object, which for a Mongo error carries the offending
 * document values (PII) in keyValue and friends. Field names are kept so a
 * duplicate-key log still says which index tripped.
 */
export function describeErrorForLog(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { name: "NonError", message: `Non-error thrown (${typeof error})` };
  const record = error as Error & { code?: unknown; codeName?: unknown } & Partial<Record<(typeof REDACTED_ERROR_FIELDS)[number], unknown>>;
  const message = redactMessage(error.message);
  const entry: Record<string, unknown> = { name: error.name, message };
  if (typeof record.code === "string" || typeof record.code === "number") entry.code = record.code;
  if (typeof record.codeName === "string") entry.codeName = record.codeName;
  for (const field of REDACTED_ERROR_FIELDS) {
    const redacted = redactFields(record[field]);
    if (redacted) entry[field] = redacted;
  }
  if (error.stack) entry.stack = redactMessage(error.stack.replace(error.message, message));
  return entry;
}
