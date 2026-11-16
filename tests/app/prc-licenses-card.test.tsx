// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PrcLicensesCard } from "@/app/(app)/people/[id]/prc-licenses-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const PROFESSIONS = [
  { code: "nurse", name: "Nurse", status: "active", sortOrder: 1 },
  { code: "teacher", name: "Professional Teacher", status: "inactive", sortOrder: 2 },
];
const RECORDS = [
  { id: "r1", professionCode: "nurse", licenseNumber: "0123456", validUntil: "2026-11-01" },
  { id: "r2", professionCode: "teacher", licenseNumber: "T-77", validUntil: "2026-11-30" },
  { id: "r3", professionCode: "gone_code", licenseNumber: "G-1", validUntil: null },
];
const base = { organizationId: "org1", employeeId: "e1", employeeName: "Jane Doe", professions: PROFESSIONS, todayKey: "2026-11-16" };

describe("PrcLicensesCard", () => {
  it("lists each license by its profession's name (retired too) or the stored code, with number and validity", () => {
    render(<PrcLicensesCard {...base} records={RECORDS} canUpdate={false} />);

    expect(screen.getByText("PRC licenses")).toBeTruthy();
    const nurse = screen.getByText("0123456").closest("tr")!;
    expect(within(nurse).getByText("Nurse")).toBeTruthy();
    expect(within(nurse).getByText("2026-11-01")).toBeTruthy();
    expect(within(screen.getByText("T-77").closest("tr")!).getByText("Professional Teacher")).toBeTruthy();
    expect(within(screen.getByText("G-1").closest("tr")!).getByText("gone_code")).toBeTruthy();
  });

  it("flags an expired license, one expiring within 30 days, and nothing without a date", () => {
    render(<PrcLicensesCard {...base} records={RECORDS} canUpdate={false} />);

    expect(within(screen.getByText("0123456").closest("tr")!).getByTestId("expiry-chip")).toHaveTextContent("Expired");
    expect(within(screen.getByText("T-77").closest("tr")!).getByTestId("expiry-chip")).toHaveTextContent("Expiring soon");
    expect(within(screen.getByText("G-1").closest("tr")!).queryByTestId("expiry-chip")).toBeNull();
  });

  it("invites adding the first license when there are none", () => {
    render(<PrcLicensesCard {...base} records={[]} canUpdate />);
    expect(screen.getByText("No PRC licenses yet.")).toBeTruthy();
    expect(screen.getByTestId("prc-license-add-button")).toBeTruthy();
  });

  it("shows controls only to someone who can update", () => {
    const { unmount } = render(<PrcLicensesCard {...base} records={RECORDS} canUpdate={false} />);
    expect(screen.queryByTestId("prc-license-add-button")).toBeNull();
    expect(screen.queryByTestId("prc-license-edit-r1")).toBeNull();
    unmount();
    render(<PrcLicensesCard {...base} records={RECORDS} canUpdate />);
    expect(screen.getByTestId("prc-license-edit-r1")).toBeTruthy();
    expect(screen.getByTestId("prc-license-remove-r1")).toBeTruthy();
  });
});
