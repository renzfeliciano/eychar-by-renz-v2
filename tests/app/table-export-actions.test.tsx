// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseExportActions, type CaseExportRow } from "@/app/(app)/cases/case-export-actions";

const downloadBlob = vi.fn();
vi.mock("@/lib/export/download", () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }));

const ROWS: CaseExportRow[] = [
  { caseName: "Santos v. Acme", caseNumber: "NLRC-01", project: "EGI Rufino", classification: "Labor", status: "Open", legalCounsel: "Atty. Cruz", briefHistory: "Filed in May." },
];

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

beforeEach(() => downloadBlob.mockReset());

describe("module export (Excel or CSV)", () => {
  it("offers both formats and downloads a CSV of every row", async () => {
    const user = userEvent.setup();
    render(<CaseExportActions rows={ROWS} organizationName="Acme Inc." />);

    await user.click(screen.getByTestId("cases-export-button"));
    expect(screen.getByText(/1 case will be exported/)).toBeInTheDocument();
    await user.click(screen.getByTestId("cases-export-csv"));

    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(filename).toMatch(/^acme-inc-case-monitoring-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readBlob(blob);
    expect(csv).toContain('"#","Project","Case name","Case number","Classification","Status","Legal counsel","Brief history"');
    expect(csv).toContain('"1","EGI Rufino","Santos v. Acme","NLRC-01","Labor","Open","Atty. Cruz","Filed in May."');
  });

  it("builds the formatted Excel file on request", async () => {
    const user = userEvent.setup();
    render(<CaseExportActions rows={ROWS} organizationName="Acme Inc." />);

    await user.click(screen.getByTestId("cases-export-button"));
    await user.click(screen.getByTestId("cases-export-xlsx"));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(filename).toMatch(/^acme-inc-case-monitoring-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("can't export an empty list", () => {
    render(<CaseExportActions rows={[]} organizationName="Acme Inc." />);
    expect(screen.getByTestId("cases-export-button")).toBeDisabled();
  });
});
