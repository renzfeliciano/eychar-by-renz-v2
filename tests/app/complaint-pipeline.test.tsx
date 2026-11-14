// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ComplaintPipeline } from "@/app/(app)/complaints/complaint-pipeline";
import { ComplaintFormDialog } from "@/app/(app)/complaints/complaint-form-dialog";
import { withOrphanedStages } from "@/domains/complaints/pipeline";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const STAGES = [
  { code: "received", name: "Received IR/complaint" },
  { code: "nte_scheduled", name: "Set a date for NTE" },
  { code: "administrative_hearing", name: "Administrative Hearing" },
  { code: "sanction", name: "Sanction", isTerminal: true },
];
const EMPLOYEES = [
  { id: "e1", label: "Juan Dela Cruz" },
  { id: "e2", label: "Maria Santos" },
];
const COMPLAINTS = [
  { _id: "c1", irNumber: "IR-0001", employeeId: "e1", respondentName: "Juan Dela Cruz", stage: "received", receivedDate: "2026-11-10T00:00:00.000Z", remarks: "Reported by the shift lead" },
  { _id: "c2", irNumber: "IR-0002", employeeId: "e2", respondentName: "Maria Santos", stage: "administrative_hearing", receivedDate: "2026-11-01T00:00:00.000Z", remarks: null },
];

const fetchMock = vi.fn();

async function topDialog() {
  const dialogs = await screen.findAllByRole("dialog");
  return dialogs[dialogs.length - 1];
}

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPipeline(overrides: Partial<Parameters<typeof ComplaintPipeline>[0]> = {}) {
  return render(<ComplaintPipeline organizationId="org1" stages={STAGES} complaints={COMPLAINTS} employees={EMPLOYEES} projects={[]} canUpdate {...overrides} />);
}

describe("ComplaintPipeline", () => {
  it("shows each complaint in its stage's column with the column count", () => {
    renderPipeline();
    const received = screen.getByRole("group", { name: /Received IR\/complaint, 1 complaint/ });
    expect(within(received).getByText("Juan Dela Cruz")).toBeInTheDocument();
    expect(within(received).getByText("IR-0001")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Administrative Hearing, 1 complaint/ })).toHaveTextContent("Maria Santos");
    expect(screen.getByRole("group", { name: /Sanction, 0 complaints/ })).toBeInTheDocument();
  });

  it("filters the board by IR number or respondent", async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.type(screen.getByLabelText("Search complaints"), "IR-0002");
    expect(screen.queryByText("Juan Dela Cruz")).not.toBeInTheDocument();
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
  });

  it("switches to a list with one row per complaint", async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.click(screen.getByRole("radio", { name: "List" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2
    expect(within(table).getByText("Juan Dela Cruz")).toBeInTheDocument();
  });

  it("opens a complaint's details and moves it to another stage, then confirms with a toast", async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.click(screen.getByRole("button", { name: "Open IR-0001" }));

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Reported by the shift lead")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Received IR/complaint" })).toHaveAttribute("aria-current", "step");

    await user.click(within(panel).getByRole("button", { name: "Administrative Hearing" }));
    // Administrative Hearing has its own details form; this move skips it.
    await user.click(within(await topDialog()).getByTestId("complaint-stage-form-skip"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/complaints/c1/stage",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ organizationId: "org1", stage: "administrative_hearing" }) }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("IR-0001 moved to Administrative Hearing");
  });

  it("moves a complaint to a closing stage from the details panel", async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.click(screen.getByRole("button", { name: "Open IR-0002" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Sanction" }));
    await user.click(within(await topDialog()).getByTestId("complaint-stage-form-skip"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/complaints/c2/stage", expect.objectContaining({ body: JSON.stringify({ organizationId: "org1", stage: "sanction" }) })));
  });

  it("keeps the card where it was and shows the server's reason when a move is refused", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "That stage is not available" }) });
    const user = userEvent.setup();
    renderPipeline();
    await user.click(screen.getByRole("button", { name: "Open IR-0001" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Sanction" }));
    const form = await topDialog();
    await user.click(within(form).getByTestId("complaint-stage-form-skip"));

    expect(await within(form).findByText("That stage is not available")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /Received IR\/complaint, 1 complaint/, hidden: true })).toHaveTextContent("Juan Dela Cruz");
    expect(screen.getByRole("group", { name: /Sanction, 0 complaints/, hidden: true })).toBeInTheDocument();
  });

  it("still shows a complaint whose stage is no longer in the catalog, in its own column", () => {
    const stray = { ...COMPLAINTS[0], _id: "c3", irNumber: "IR-0003", stage: "retired_stage" };
    const complaints = [...COMPLAINTS, stray];
    renderPipeline({ complaints, stages: withOrphanedStages(STAGES, complaints) });
    expect(screen.getByRole("group", { name: /retired_stage, 1 complaint/ })).toHaveTextContent("IR-0003");
  });

  it("shows a complaint whose respondent record is gone without breaking", () => {
    renderPipeline({ complaints: [{ ...COMPLAINTS[0], respondentName: "—" }] });
    const received = screen.getByRole("group", { name: /Received IR\/complaint, 1 complaint/ });
    // The avatar repeats the dash as its initials, so check the card's open button rather than counting text matches.
    expect(within(received).getByRole("button", { name: "Open IR-0001" })).toHaveTextContent("—");
    expect(within(received).getByText("IR-0001")).toBeInTheDocument();
  });

  it("lets HR edit a complaint whose respondent is no longer on the roster without changing who it is about", async () => {
    const user = userEvent.setup();
    const gone = { ...COMPLAINTS[0], employeeId: "gone", respondentName: "—" };
    renderPipeline({ complaints: [gone] });
    await user.click(screen.getByRole("button", { name: "Open IR-0001" }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByTestId("complaint-edit-button"));

    const dialogs = await screen.findAllByRole("dialog");
    const form = dialogs[dialogs.length - 1];
    expect(within(form).getByRole("option", { selected: true })).toHaveTextContent("Unknown employee");
    await user.click(within(form).getByTestId("complaint-save-button"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/complaints/c1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ organizationId: "org1", employeeId: "gone", receivedDate: "2026-11-10", projectId: "", description: "", what: "", where: "", incidentDate: "", complainantName: "", remarks: "Reported by the shift lead" }) }),
      ),
    );
  });

  it("offers no drag handle or move menu to someone who cannot update", () => {
    renderPipeline({ canUpdate: false });
    expect(screen.queryByLabelText(/Drag/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Actions for/)).not.toBeInTheDocument();
  });
});

describe("ComplaintFormDialog", () => {
  async function openDialog() {
    const user = userEvent.setup();
    render(<ComplaintFormDialog organizationId="org1" employees={EMPLOYEES} projects={[]} />);
    await user.click(screen.getByTestId("complaints-create-button"));
    return { user, dialog: await screen.findByRole("dialog") };
  }

  it("adds a complaint about the chosen employee and confirms with a toast", async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Juan Dela Cruz" }));
    await user.type(within(dialog).getByLabelText(/Date received/), "2026-11-10");
    await user.type(within(dialog).getByLabelText("Remarks"), "Reported by the shift lead");
    await user.click(within(dialog).getByTestId("complaints-create-submit-button"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/complaints",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ organizationId: "org1", employeeId: "e1", receivedDate: "2026-11-10", projectId: "", description: "", what: "", where: "", incidentDate: "", complainantName: "", remarks: "Reported by the shift lead" }) }),
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Complaint added"));
    expect(refresh).toHaveBeenCalled();
  });

  it("asks for the respondent before sending anything", async () => {
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByLabelText(/Date received/), "2026-11-10");
    await user.click(within(dialog).getByTestId("complaints-create-submit-button"));
    expect(await within(dialog).findByText("Select the employee the complaint is about.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's message when the save is refused", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Employee not found in this organization" }) });
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Juan Dela Cruz" }));
    await user.type(within(dialog).getByLabelText(/Date received/), "2026-11-10");
    await user.click(within(dialog).getByTestId("complaints-create-submit-button"));
    expect(await within(dialog).findByText("Employee not found in this organization")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
