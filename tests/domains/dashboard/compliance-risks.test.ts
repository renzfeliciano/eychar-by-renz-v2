import { describe, it, expect } from "vitest";
import { documentRisks, finalPayRisks, regularizationRisks } from "@/domains/dashboard/compliance-risks";

const TODAY = "2026-10-03";

describe("regularizationRisks", () => {
  const months = new Map([["probationary", 6]]);

  it("flags probationary staff within 30 days of regularization, and those already past it", () => {
    const risks = regularizationRisks(
      [
        { id: "a", name: "Ana", employmentType: "probationary", hiredKey: "2026-04-10" }, // regular on Oct 10
        { id: "b", name: "Ben", employmentType: "probationary", hiredKey: "2026-03-01" }, // was regular Sep 1
        { id: "c", name: "Cara", employmentType: "probationary", hiredKey: "2026-09-01" }, // far off
        { id: "d", name: "Dan", employmentType: "regular", hiredKey: "2026-04-10" }, // not watched
      ],
      months,
      TODAY,
    );
    expect(risks.map((risk) => [risk.id, risk.urgency, risk.dueKey])).toEqual([
      ["regularize-a", "now", "2026-10-10"],
      ["regularize-b", "now", "2026-09-01"],
    ]);
    expect(risks[1].title).toBe("Ben may already be regular");
  });

  it("handles month ends (Aug 31 + 6 months is Feb 28)", () => {
    const [risk] = regularizationRisks([{ id: "e", name: "Eve", employmentType: "probationary", hiredKey: "2026-08-31" }], months, "2027-02-10");
    expect(risk.dueKey).toBe("2027-02-28");
  });
});

describe("finalPayRisks", () => {
  it("uses the organization's deadline and skips paid or cancelled settlements", () => {
    const risks = finalPayRisks(
      [
        { clearanceId: "1", employeeName: "Ana", lastWorkingDayKey: "2026-08-20" }, // due Sep 19: overdue
        { clearanceId: "2", employeeName: "Ben", lastWorkingDayKey: "2026-09-20", settlementId: "s2", settlementStatus: "approved" }, // due Oct 20
        { clearanceId: "3", employeeName: "Cara", lastWorkingDayKey: "2026-08-01", settlementStatus: "disbursed" },
      ],
      30,
      TODAY,
    );
    expect(risks.map((risk) => [risk.title, risk.urgency, risk.href])).toEqual([
      ["Final pay overdue: Ana", "now", "/clearance/1"],
      ["Release Ben's final pay", "later", "/final-settlements/s2"],
    ]);
  });
});

describe("documentRisks", () => {
  it("flags expired documents and those expiring within 30 days", () => {
    const risks = documentRisks(
      [
        { id: "x", employeeId: "e1", employeeName: "Ana", title: "NBI clearance", expiresKey: "2026-09-30" },
        { id: "y", employeeId: "e2", employeeName: "Ben", title: "Driver's license", expiresKey: "2026-10-25" },
        { id: "z", employeeId: "e3", employeeName: "Cara", title: "Contract", expiresKey: "2027-01-01" },
      ],
      TODAY,
    );
    expect(risks.map((risk) => [risk.title, risk.urgency])).toEqual([
      ["NBI clearance expired: Ana", "now"],
      ["Renew Ben's Driver's license", "soon"],
    ]);
  });
});
