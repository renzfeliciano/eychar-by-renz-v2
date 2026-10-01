import { NextResponse } from "next/server";
import { ZodError, type core } from "zod";
import { AppError, RateLimitError } from "./app-error";

/** "annualEntitlementDays" -> "Annual entitlement days" — for naming the field a validation issue is about. */
function humanizeFieldPath(path: readonly PropertyKey[]): string | null {
  const field = path.find((segment) => typeof segment === "string");
  if (typeof field !== "string" || field.length === 0) return null;
  const words = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The overwhelmingly common cases — a left-blank required field, or a
 * number typed as text — read as raw Zod internals by default ("Too small:
 * expected string to have >=1 characters", "Invalid input: expected
 * number, received NaN"). Those two get a plain-English rewrite; anything
 * else falls back to Zod's own message, which is usually fine on its own
 * (e.g. "Invalid email address").
 */
// Zod's own default wording for these codes — anything else was written by
// hand in a schema (e.g. `.min(10, "Radius must be at least 10 m")`) and is
// already better than the generic field-name rewrite below.
const ZOD_DEFAULT_MESSAGE = /^(Invalid input|Too small|Too big)\b/;

function describeIssue(issue: core.$ZodIssue, field: string | null): string {
  const name = field ?? "This field";
  if (issue.code === "invalid_type") {
    // Zod v4 only fills `issue.input` when parsing with `reportInput`, which
    // no route does — so the value itself usually isn't available here, and
    // "abc" in a number field is only recognizable from the default message
    // ("…expected number, received NaN"). Checked before the missing-field
    // case, which is otherwise what an absent `input` would look like.
    const input = "input" in issue ? issue.input : undefined;
    if ((typeof input === "number" && Number.isNaN(input)) || /received NaN$/.test(issue.message)) return `${name} must be a number`;
    if (input === undefined) return `${name} is required`;
  }
  if ((issue.code === "too_small" || issue.code === "too_big") && !ZOD_DEFAULT_MESSAGE.test(issue.message)) {
    return issue.message;
  }
  if (issue.code === "too_small") {
    if (issue.origin === "string" && issue.minimum === 1) return `${name} is required`;
    const unit = issue.origin === "string" ? "characters" : issue.origin === "array" ? "items" : "";
    return `${name} must be at least ${issue.minimum}${unit ? ` ${unit}` : ""}`;
  }
  if (issue.code === "too_big") {
    const unit = issue.origin === "string" ? "characters" : issue.origin === "array" ? "items" : "";
    return `${name} must be at most ${issue.maximum}${unit ? ` ${unit}` : ""}`;
  }
  return field ? `${name}: ${issue.message}` : issue.message;
}

/** The raw (non-humanized) top-level field key, for the client to focus the matching input — e.g. "code", not "Code". */
function firstFieldKey(path: readonly PropertyKey[]): string | null {
  const field = path.find((segment) => typeof segment === "string");
  return typeof field === "string" ? field : null;
}

/** The first issue, named by field, instead of Zod's own generic message alone — "Code is required" beats "Invalid input". */
function describeZodError(error: ZodError): { message: string; field: string | null } {
  const [issue] = error.issues;
  if (!issue) return { message: "Invalid input", field: null };
  return { message: describeIssue(issue, humanizeFieldPath(issue.path)), field: firstFieldKey(issue.path) };
}

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

/**
 * Route handlers convert any thrown error to an HTTP response through this
 * single chokepoint, so an unexpected/database error never leaks internal
 * messages or stack details to the client (per AGENTS.md §48).
 */
function isCastError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : undefined;
  return name === "CastError" || name === "BSONError";
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const headers = error instanceof RateLimitError ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.status, headers },
    );
  }
  if (error instanceof ZodError) {
    const { message, field } = describeZodError(error);
    return NextResponse.json(
      { error: message, field, details: error.flatten() },
      { status: 400 },
    );
  }
  // A malformed id or date in the URL or body (Mongo couldn't cast it): the
  // caller's mistake, not ours, and never worth a stack trace in the logs.
  if (isCastError(error)) {
    return NextResponse.json({ error: "Something in the request isn't valid (an id or a date). Check it and try again." }, { status: 400 });
  }
  console.error("Unexpected error", describeErrorForLog(error));
  return NextResponse.json({ error: "Unexpected error — please try again, and contact support if it keeps happening." }, { status: 500 });
}
