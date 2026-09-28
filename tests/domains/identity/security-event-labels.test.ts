import { describe, it, expect } from "vitest";
import { describeAuditAction } from "@/domains/identity/security-event-labels";

describe("describeAuditAction", () => {
  it("uses the security event's own wording", () => {
    expect(describeAuditAction("auth.account-locked")).toBe("Account locked after failed sign-ins");
  });

  it("turns any other action into a readable phrase", () => {
    expect(describeAuditAction("payroll-run.approved")).toBe("Payroll run approved");
    expect(describeAuditAction("leave-balance.granted-in-bulk")).toBe("Leave balance granted in bulk");
  });
});
