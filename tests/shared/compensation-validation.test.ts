import { describe, it, expect } from "vitest";
import { createCompensationSchema, reviseCompensationSchema } from "@/shared/validation/payroll";

const organizationId = "507f1f77bcf86cd799439011";
const terms = { organizationId, rateType: "monthly", allowances: [], minimumWageEarner: false, effectiveFrom: "2026-12-01" };

describe("compensation terms validation", () => {
  it("adds the annual increase to the basic salary to get the total that payroll pays", () => {
    const parsed = reviseCompensationSchema.parse({ ...terms, baseRate: 37000, annualIncrease: 3000 });
    expect(parsed).toMatchObject({ baseRate: 37000, annualIncrease: 3000, rate: 40000 });
  });

  it("ignores a total sent by the caller when a basic salary is given", () => {
    expect(reviseCompensationSchema.parse({ ...terms, baseRate: 37000, annualIncrease: 3000, rate: 1 }).rate).toBe(40000);
  });

  it("treats a missing increase as none", () => {
    expect(reviseCompensationSchema.parse({ ...terms, baseRate: 37000 })).toMatchObject({ baseRate: 37000, annualIncrease: 0, rate: 37000 });
  });

  it("still accepts a plain rate, as the basic with no increase", () => {
    expect(reviseCompensationSchema.parse({ ...terms, rate: 25000 })).toMatchObject({ baseRate: 25000, annualIncrease: 0, rate: 25000 });
  });

  it("needs a basic salary above zero, and refuses a negative increase", () => {
    expect(reviseCompensationSchema.safeParse(terms).success).toBe(false);
    expect(reviseCompensationSchema.safeParse({ ...terms, baseRate: 0 }).success).toBe(false);
    expect(reviseCompensationSchema.safeParse({ ...terms, baseRate: 37000, annualIncrease: -1 }).success).toBe(false);
  });

  it("works the same for the first pay terms", () => {
    const parsed = createCompensationSchema.parse({ ...terms, employeeId: organizationId, baseRate: 20000, annualIncrease: 500 });
    expect(parsed).toMatchObject({ employeeId: organizationId, rate: 20500 });
  });
});
