// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GovernmentIdsCard } from "@/app/(app)/people/[id]/government-ids-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const TYPES = [
  { code: "passport", name: "Passport", status: "active", sortOrder: 1 },
  { code: "umid", name: "UMID", status: "inactive", sortOrder: 2 },
];
const RECORDS = [
  { id: "r1", typeCode: "passport", otherTypeName: null, idNumber: "P1234567", validUntil: "2026-11-10" },
  { id: "r2", typeCode: "umid", otherTypeName: null, idNumber: "0028-1", validUntil: "2026-12-01" },
  { id: "r3", typeCode: null, otherTypeName: "Seaman's Book", idNumber: "SB-9", validUntil: null },
  { id: "r4", typeCode: "old_code", otherTypeName: null, idNumber: "X-1", validUntil: "2030-01-01" },
];
const base = { organizationId: "org1", employeeId: "e1", employeeName: "Jane Doe", types: TYPES, todayKey: "2026-11-16" };

describe("GovernmentIdsCard", () => {
  it("lists each ID by its type's name, a typed name, or the stored code, with number and validity", () => {
    render(<GovernmentIdsCard {...base} records={RECORDS} canUpdate={false} />);

    expect(screen.getByText("Additional government IDs")).toBeTruthy();
    const passport = screen.getByText("P1234567").closest("tr")!;
    expect(within(passport).getByText("Passport")).toBeTruthy();
    expect(within(passport).getByText("2026-11-10")).toBeTruthy();
    expect(within(screen.getByText("0028-1").closest("tr")!).getByText("UMID")).toBeTruthy();
    expect(within(screen.getByText("SB-9").closest("tr")!).getByText("Seaman's Book")).toBeTruthy();
    expect(within(screen.getByText("X-1").closest("tr")!).getByText("old_code")).toBeTruthy();
  });

  it("flags an expired date, one within 30 days, and nothing for a far or missing date", () => {
    render(<GovernmentIdsCard {...base} records={RECORDS} canUpdate={false} />);

    expect(within(screen.getByText("P1234567").closest("tr")!).getByTestId("expiry-chip")).toHaveTextContent("Expired");
    expect(within(screen.getByText("0028-1").closest("tr")!).getByTestId("expiry-chip")).toHaveTextContent("Expiring soon");
    expect(within(screen.getByText("SB-9").closest("tr")!).queryByTestId("expiry-chip")).toBeNull();
    expect(within(screen.getByText("X-1").closest("tr")!).queryByTestId("expiry-chip")).toBeNull();
  });

  it("invites adding the first ID when there are none", () => {
    render(<GovernmentIdsCard {...base} records={[]} canUpdate />);
    expect(screen.getByText("No additional government IDs yet.")).toBeTruthy();
    expect(screen.getByTestId("government-id-add-button")).toBeTruthy();
  });

  it("shows no controls to someone who can't update", () => {
    render(<GovernmentIdsCard {...base} records={RECORDS} canUpdate={false} />);
    expect(screen.queryByTestId("government-id-add-button")).toBeNull();
    expect(screen.queryByTestId("government-id-edit-r1")).toBeNull();
    expect(screen.queryByTestId("government-id-remove-r1")).toBeNull();
  });

  it("gives an editor add, edit and remove controls", () => {
    render(<GovernmentIdsCard {...base} records={RECORDS} canUpdate />);
    expect(screen.getByTestId("government-id-add-button")).toBeTruthy();
    expect(screen.getByTestId("government-id-edit-r1")).toBeTruthy();
    expect(screen.getByTestId("government-id-remove-r1")).toBeTruthy();
  });
});
