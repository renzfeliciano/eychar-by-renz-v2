import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { toErrorResponse } from "@/shared/errors/to-response";
import { AppError, ConflictError } from "@/shared/errors";

function parseFailure(schema: z.ZodTypeAny, input: unknown): ZodError {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("Expected schema parse to fail for this test fixture");
  return result.error;
}

describe("toErrorResponse", () => {
  it("turns a completely omitted required field into a friendly message, not Zod's raw internals", async () => {
    // This is exactly the self-service clock-in shape that regressed:
    // organizationId required but never sent by the client at all.
    const schema = z.object({ organizationId: z.string().trim().min(1) });
    const error = parseFailure(schema, {});

    const response = toErrorResponse(error);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Organization id is required");
    expect(body.error).not.toMatch(/received undefined/i);
    expect(body.error).not.toMatch(/Invalid input/i);
    expect(body.field).toBe("organizationId");
  });

  it("turns a blank (empty-string) required field into the same friendly message", async () => {
    const schema = z.object({ code: z.string().trim().min(1) });
    const error = parseFailure(schema, { code: "" });

    const body = await toErrorResponse(error).json();

    expect(body.error).toBe("Code is required");
    expect(body.field).toBe("code");
  });

  it("describes a too-long field with the actual limit", async () => {
    const schema = z.object({ description: z.string().trim().max(10) });
    const error = parseFailure(schema, { description: "way more than ten characters" });

    const body = await toErrorResponse(error).json();

    expect(body.error).toBe("Description must be at most 10 characters");
  });

  it("describes a missing required number the same way as a missing required string", async () => {
    const schema = z.object({ entitledDays: z.number() });
    const error = parseFailure(schema, {});

    const body = await toErrorResponse(error).json();

    expect(body.error).toBe("Entitled days is required");
    expect(body.error).not.toMatch(/received undefined/i);
  });

  it("says a non-numeric value 'must be a number', not that it's missing", async () => {
    // Zod v4 only populates issue.input when parsing with reportInput, so a
    // typo like "abc" in a number field used to fall into the "is required" branch.
    const schema = z.object({ latitude: z.coerce.number() });
    const error = parseFailure(schema, { latitude: "abc" });

    const body = await toErrorResponse(error).json();

    expect(body.error).toBe("Latitude must be a number");
  });

  it("uses a schema's own custom min/max message instead of the generic rewrite", async () => {
    const schema = z.object({ geofenceRadiusMeters: z.coerce.number().min(10, "Radius must be at least 10 m") });
    const error = parseFailure(schema, { geofenceRadiusMeters: "5" });

    const body = await toErrorResponse(error).json();

    expect(body.error).toBe("Radius must be at least 10 m");
    expect(body.field).toBe("geofenceRadiusMeters");
  });

  it("passes an AppError's own message straight through with its status code", async () => {
    const response = toErrorResponse(new ConflictError('Employee number "EMP-001" is already in use'));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('Employee number "EMP-001" is already in use');
  });

  it("never leaks an unexpected error's internal message to the client", async () => {
    const response = toErrorResponse(new Error("connection string contains a password"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toContain("password");
  });

  it("AppError is the base class every thrown domain error extends", () => {
    expect(new ConflictError("x")).toBeInstanceOf(AppError);
  });
});
