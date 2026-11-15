// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditEntrySheet, type AuditEntryView } from "@/app/(app)/settings/audit/audit-entry-sheet";
import { auditFields } from "@/app/(app)/settings/audit/audit-fields";

const entry: AuditEntryView = {
  id: "1",
  when: "Nov 14, 2026, 10:54:40 PM",
  actorName: "HR Officer",
  actionLabel: "Compensation created",
  action: "compensation.created",
  resourceType: "Compensation",
  resourceId: "6af87630b67490a3449c4b15",
  before: null,
  after: { rateType: "monthly", rate: 40000, allowances: [], minimumWageEarner: false },
  metadata: null,
};

describe("auditFields", () => {
  it("turns stored values into labelled, readable lines", () => {
    expect(auditFields({ rateType: "monthly", baseRate: 37000, annualIncrease: 3000, rate: 40000, allowances: [], minimumWageEarner: false, effectiveFrom: "2026-12-01" })).toEqual([
      { label: "Pay basis", value: "Monthly" },
      { label: "Basic salary", value: "₱37,000.00" },
      { label: "Annual increase", value: "₱3,000.00" },
      { label: "Total salary", value: "₱40,000.00" },
      { label: "Allowances", value: "None" },
      { label: "Minimum wage earner", value: "No" },
      { label: "Effective from", value: "Dec 1, 2026" },
    ]);
  });

  it("describes a list of items one per line, and nested details inline", () => {
    const [allowances, other] = auditFields({
      allowances: [{ name: "Rice", amount: 2000, basis: "monthly", taxable: false }],
      someNestedThing: { firstName: "Jane", count: 2 },
    });
    expect(allowances).toEqual({ label: "Allowances", value: "Rice · Amount ₱2,000.00 · Basis monthly · Taxable No" });
    expect(other).toEqual({ label: "Some nested thing", value: "First name Jane · Count 2" });
  });

  it("shows a blank as a dash and leaves plain text as it was stored", () => {
    expect(auditFields({ reason: "Annual merit increase", middleName: null })).toEqual([
      { label: "Reason", value: "Annual merit increase" },
      { label: "Middle name", value: "—" },
    ]);
  });
});

describe("AuditEntrySheet", () => {
  it("shows the saved values as labelled fields, not raw JSON", async () => {
    const user = userEvent.setup();
    render(<AuditEntrySheet entry={entry} />);
    await user.click(screen.getByRole("button", { name: "Details" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Total salary")).toBeTruthy();
    expect(within(sheet).getByText("₱40,000.00")).toBeTruthy();
    expect(within(sheet).getByText("Monthly")).toBeTruthy();
    expect(sheet.textContent).not.toContain('"rateType"');
    expect(sheet.textContent).not.toContain("{");
  });

  it("puts before and after side by side for a change, with only the fields that changed", async () => {
    const user = userEvent.setup();
    render(
      <AuditEntrySheet
        entry={{
          ...entry,
          actionLabel: "Compensation revised",
          before: { rateType: "monthly", rate: 25000, allowances: [], minimumWageEarner: false },
          after: { rateType: "monthly", baseRate: 37000, annualIncrease: 3000, rate: 40000, allowances: [], minimumWageEarner: false },
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Details" }));

    const table = within(screen.getByRole("dialog")).getByRole("table", { name: "What changed" });
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual(["Basic salary—₱37,000.00", "Annual increase—₱3,000.00", "Total salary₱25,000.00₱40,000.00"]);
  });
});
