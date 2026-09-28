// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseDetailSheet } from "@/app/(app)/cases/case-detail-sheet";

afterEach(cleanup);

const CASE = {
  caseName: "Dela Cruz vs. PCAS",
  caseNumber: "NLRC-NCR-09-12345-26",
  projectName: "EGI Albergo Di Ferroca",
  classificationName: "Illegal dismissal",
  statusCode: "mediation",
  statusName: "Mediation",
  legalCounsel: "Atty. Leonora Bautista",
  briefHistory: "Complaint filed 2 Sep.\nFirst mediation conference set for 30 Sep.",
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-25T00:00:00.000Z",
};

describe("CaseDetailSheet", () => {
  it("opens from the case name and shows the full record", async () => {
    const user = userEvent.setup();
    render(<CaseDetailSheet item={CASE} nowIso="2026-09-28T00:00:00.000Z" />);

    await user.click(screen.getByRole("button", { name: "Dela Cruz vs. PCAS" }));
    const panel = await screen.findByRole("dialog");

    expect(within(panel).getByText("NLRC-NCR-09-12345-26")).toBeInTheDocument();
    expect(within(panel).getByText("Mediation")).toBeInTheDocument();
    expect(within(panel).getByText("Atty. Leonora Bautista")).toBeInTheDocument();
    expect(within(panel).getByText(/First mediation conference/)).toBeInTheDocument();
    expect(within(panel).getByText("3 days ago")).toBeInTheDocument();
  });

  it("says when there's no counsel or history yet", async () => {
    const user = userEvent.setup();
    render(<CaseDetailSheet item={{ ...CASE, legalCounsel: null, briefHistory: null }} nowIso="2026-09-28T00:00:00.000Z" />);

    await user.click(screen.getByRole("button", { name: "Dela Cruz vs. PCAS" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("No counsel assigned")).toBeInTheDocument();
    expect(within(panel).getByText("No history recorded yet.")).toBeInTheDocument();
  });
});
