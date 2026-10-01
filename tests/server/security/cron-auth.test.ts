import { describe, it, expect } from "vitest";
import { checkCronAuthorization } from "@/server/security/cron-auth";

describe("checkCronAuthorization", () => {
  it("accepts only the exact bearer secret", () => {
    expect(checkCronAuthorization("Bearer s3cret-value", "s3cret-value")).toBe("ok");
    expect(checkCronAuthorization("Bearer s3cret-valuE", "s3cret-value")).toBe("unauthorized");
    expect(checkCronAuthorization("s3cret-value", "s3cret-value")).toBe("unauthorized");
    expect(checkCronAuthorization(null, "s3cret-value")).toBe("unauthorized");
  });

  it("stays off when no secret is configured", () => {
    expect(checkCronAuthorization("Bearer anything", undefined)).toBe("unconfigured");
    expect(checkCronAuthorization("Bearer ", "")).toBe("unconfigured");
  });
});
