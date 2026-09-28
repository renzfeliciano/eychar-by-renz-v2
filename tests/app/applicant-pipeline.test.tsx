// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicantPipeline } from "@/app/(app)/recruitment/tracking/applicant-pipeline";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const STAGES = [
  { code: "applied", name: "Applied" },
  { code: "interview", name: "Interview" },
  { code: "hired", name: "Hired", isTerminal: true },
];
const POSITIONS = [
  { id: "p1", label: "Security Guard" },
  { id: "p2", label: "Janitor" },
];
const APPLICANTS = [
  { _id: "a1", positionId: "p1", positionTitle: "Security Guard", applicantName: "Maria Santos", email: "maria@example.ph", phone: "0917 555 0142", stage: "applied", appliedDate: "2026-09-20T00:00:00.000Z", remarks: "Referred by site lead" },
  { _id: "a2", positionId: "p2", positionTitle: "Janitor", applicantName: "Jose Mercado", email: null, phone: null, stage: "interview", appliedDate: "2026-09-10T00:00:00.000Z", remarks: null },
];

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPipeline() {
  return render(<ApplicantPipeline organizationId="org1" stages={STAGES} applicants={APPLICANTS} positions={POSITIONS} canUpdate />);
}

describe("ApplicantPipeline", () => {
  it("shows each applicant in their stage's column with the column count", () => {
    renderPipeline();
    const applied = screen.getByRole("group", { name: /Applied, 1 applicant/ });
    expect(within(applied).getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Interview, 1 applicant/ })).toHaveTextContent("Jose Mercado");
    expect(screen.getByRole("group", { name: /Hired, 0 applicants/ })).toBeInTheDocument();
  });

  it("filters the board by search", async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.type(screen.getByLabelText("Search applicants"), "janitor");
    expect(screen.queryByText("Maria Santos")).not.toBeInTheDocument();
    expect(screen.getByText("Jose Mercado")).toBeInTheDocument();
  });

  it("switches to a list with one row per applicant", async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.click(screen.getByRole("radio", { name: "List" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
    expect(within(table).getByText("Maria Santos")).toBeInTheDocument();
  });

  it("opens an applicant's details and moves them to another stage", async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.click(screen.getByRole("button", { name: "Open Maria Santos" }));

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("maria@example.ph")).toBeInTheDocument();
    expect(within(panel).getByText("Referred by site lead")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Applied" })).toHaveAttribute("aria-current", "step");

    await user.click(within(panel).getByRole("button", { name: "Interview" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/applicants/a1/stage",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ organizationId: "org1", stage: "interview" }) }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
