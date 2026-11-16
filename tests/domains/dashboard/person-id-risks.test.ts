import { describe, it, expect } from "vitest";
import { personIdRisks } from "@/domains/dashboard/compliance-risks";

const today = "2026-11-16";
const item = (id: string, validKey: string, label = "PWD ID") => ({ id, employeeId: "e1", employeeName: "Ana Cruz", label, validKey });

describe("personIdRisks", () => {
  it("raises a now-urgent row for an expired ID, saying how long ago", () => {
    const [risk] = personIdRisks([item("a", "2026-11-10")], today);
    expect(risk).toMatchObject({
      id: "person-id-a",
      kind: "person-id",
      title: "PWD ID expired: Ana Cruz",
      detail: "Expired 6 days ago",
      href: "/people/e1",
      actionLabel: "Open profile",
      urgency: "now",
      dueKey: "2026-11-10",
    });
  });

  it("treats today as expiring, not expired", () => {
    const [risk] = personIdRisks([item("a", today, "PRC license (Nurse)")], today);
    expect(risk.title).toBe("Renew Ana Cruz's PRC license (Nurse)");
    expect(risk.detail).toBe("Expires today");
    expect(risk.urgency).toBe("now");
  });

  it("includes day 30 as soon, and leaves out day 31", () => {
    const rows = personIdRisks([item("in30", "2026-12-16"), item("in31", "2026-12-17")], today);
    expect(rows.map((row) => row.id)).toEqual(["person-id-in30"]);
    expect(rows[0].urgency).toBe("soon");
  });

  it("is quiet when nothing is near", () => {
    expect(personIdRisks([], today)).toEqual([]);
    expect(personIdRisks([item("far", "2030-01-01")], today)).toEqual([]);
  });
});
