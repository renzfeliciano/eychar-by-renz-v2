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
const EMPLOYEES = [{ id: "e1", label: "Juan Dela Cruz" }];
const PROJECTS = [
  { id: "p1", label: "Tower A" },
  { id: "p2", label: "Tower B" },
];
const BASE = { employeeId: "e1", respondentName: "Juan Dela Cruz", receivedDate: "2026-11-10T00:00:00.000Z" };
const COMPLAINTS = [
  { ...BASE, _id: "c1", irNumber: "IR-0001", stage: "received", projectId: "p1", projectName: "Tower A", complainantName: "Unit owner" },
  { ...BASE, _id: "c2", irNumber: "IR-0002", stage: "administrative_hearing", stageDetails: { administrative_hearing: { hearingDate: "2026-12-03T00:00:00.000Z", mode: "virtual", remarks: "Sent by email" } } },
];

const fetchMock = vi.fn();

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
  return render(<ComplaintPipeline organizationId="org1" stages={STAGES} complaints={COMPLAINTS} employees={EMPLOYEES} projects={PROJECTS} canUpdate {...overrides} />);
}

async function openSheet(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Open ${name}` }));
  return screen.findByRole("dialog");
}

async function topDialog() {
  const dialogs = await screen.findAllByRole("dialog");
  return dialogs[dialogs.length - 1];
}

const stageCall = (id: string, body: unknown) => [`/api/complaints/${id}/stage`, expect.objectContaining({ method: "PATCH", body: JSON.stringify(body) })] as const;

describe("moving a complaint to a stage with details", () => {
  it("opens that stage's form and sends nothing until a button is pressed", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0001");
    await user.click(within(sheet).getByRole("button", { name: "Set a date for NTE" }));

    const form = await topDialog();
    expect(within(form).getByLabelText(/Violations/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Date sent by email")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the details and moves the card in one request", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0001");
    await user.click(within(sheet).getByRole("button", { name: "Set a date for NTE" }));
    const form = await topDialog();
    await user.type(within(form).getByLabelText("Date"), "2026-11-20");
    await user.type(within(form).getByLabelText(/Violations/), "Tardiness");
    await user.click(within(form).getByTestId("complaint-stage-form-save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(...stageCall("c1", { organizationId: "org1", stage: "nte_scheduled", details: { date: "2026-11-20", violations: "Tardiness" } })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("IR-0001 moved to Set a date for NTE"));
    expect(refresh).toHaveBeenCalled();
  });

  it("moves without details when asked to, writing no section", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0001");
    await user.click(within(sheet).getByRole("button", { name: "Set a date for NTE" }));
    await user.click(within(await topDialog()).getByTestId("complaint-stage-form-skip"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(...stageCall("c1", { organizationId: "org1", stage: "nte_scheduled" })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("IR-0001 moved to Set a date for NTE"));
  });

  it("cancels the move when the form is closed: no request, and the card stays put", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0001");
    await user.click(within(sheet).getByRole("button", { name: "Set a date for NTE" }));
    await topDialog();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByTestId("complaint-stage-form-save")).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /Received IR\/complaint, 1 complaint/, hidden: true })).toHaveTextContent("Juan Dela Cruz");
  });

  it("keeps the card where it was and shows the reason in the form when the server refuses", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Invalid stage details (mode): nope" }) });
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0001");
    await user.click(within(sheet).getByRole("button", { name: "Set a date for NTE" }));
    const form = await topDialog();
    await user.click(within(form).getByTestId("complaint-stage-form-skip"));

    expect(await within(form).findByText("Invalid stage details (mode): nope")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /Received IR\/complaint, 1 complaint/, hidden: true })).toHaveTextContent("Juan Dela Cruz");
  });

  it("moves straight away, with no form, when that stage's details are already filled in", async () => {
    const user = userEvent.setup();
    renderPipeline({ complaints: [{ ...COMPLAINTS[0], stageDetails: { administrative_hearing: { remarks: "Already scheduled" } } }] });
    const sheet = await openSheet(user, "IR-0001");
    await user.click(within(sheet).getByRole("button", { name: "Administrative Hearing" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(...stageCall("c1", { organizationId: "org1", stage: "administrative_hearing" })));
    expect(screen.queryByTestId("complaint-stage-form-save")).not.toBeInTheDocument();
  });

  it("moves straight away to the first stage, whose details are the incident fields", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0002");
    await user.click(within(sheet).getByRole("button", { name: "Received IR/complaint" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(...stageCall("c2", { organizationId: "org1", stage: "received" })));
    expect(screen.queryByTestId("complaint-stage-form-save")).not.toBeInTheDocument();
  });

  it("puts the card back and shows the server's reason when a move without a form is refused", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "That stage is not available" }) });
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0002");
    await user.click(within(sheet).getByRole("button", { name: "Received IR/complaint" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That stage is not available"));
    expect(screen.getByRole("group", { name: /Administrative Hearing, 1 complaint/, hidden: true })).toHaveTextContent("IR-0002");
  });

  it("offers the hearing mode as face to face or virtual", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0001");
    await user.click(within(sheet).getByRole("button", { name: "Administrative Hearing" }));
    const form = await topDialog();
    await user.type(within(form).getByLabelText("Possible date of hearing"), "2026-12-03");
    await user.click(within(form).getByLabelText("Hearing mode"));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Not set", "Face to face", "Virtual"]);
    await user.click(screen.getByRole("option", { name: "Virtual" }));
    await user.click(within(form).getByTestId("complaint-stage-form-save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(...stageCall("c1", { organizationId: "org1", stage: "administrative_hearing", details: { hearingDate: "2026-12-03", mode: "virtual" } })));
  });
});

describe("the details panel", () => {
  it("shows the incident details and one block per stage, with 'Not filled in yet' for empty ones", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0001");
    expect(within(sheet).getByText("Tower A")).toBeInTheDocument();
    expect(within(sheet).getByText("Unit owner")).toBeInTheDocument();
    expect(within(sheet).getByRole("region", { name: "Set a date for NTE details" })).toHaveTextContent("Not filled in yet");
    expect(within(sheet).getByRole("region", { name: "Sanction details" })).toHaveTextContent("Not filled in yet");
    expect(within(sheet).queryByRole("region", { name: "Received IR/complaint details" })).not.toBeInTheDocument();
  });

  it("shows a filled section's values, and saves an edit through the details route", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0002");
    const block = within(sheet).getByRole("region", { name: "Administrative Hearing details" });
    expect(block).toHaveTextContent("Virtual");
    expect(block).toHaveTextContent("Sent by email");

    await user.click(within(block).getByRole("button", { name: "Edit Administrative Hearing details" }));
    const form = await topDialog();
    const remarks = within(form).getByLabelText("Remarks");
    await user.clear(remarks);
    await user.type(remarks, "Signed by the employee");
    await user.click(within(form).getByTestId("complaint-stage-form-save"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/complaints/c2/details",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ organizationId: "org1", stage: "administrative_hearing", details: { hearingDate: "2026-12-03", mode: "virtual", remarks: "Signed by the employee" } }),
        }),
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Details saved"));
    expect(refresh).toHaveBeenCalled();
  });

  it("clears a field that is blanked when the section is saved", async () => {
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0002");
    await user.click(within(sheet).getByRole("button", { name: "Edit Administrative Hearing details" }));
    const form = await topDialog();
    await user.clear(within(form).getByLabelText("Remarks"));
    await user.click(within(form).getByTestId("complaint-stage-form-save"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/complaints/c2/details",
        expect.objectContaining({ body: JSON.stringify({ organizationId: "org1", stage: "administrative_hearing", details: { hearingDate: "2026-12-03", mode: "virtual" } }) }),
      ),
    );
  });

  it("shows the reason in the form when a section save is refused", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Complaint not found in this organization" }) });
    const user = userEvent.setup();
    renderPipeline();
    const sheet = await openSheet(user, "IR-0002");
    await user.click(within(sheet).getByRole("button", { name: "Edit Administrative Hearing details" }));
    const form = await topDialog();
    await user.click(within(form).getByTestId("complaint-stage-form-save"));
    expect(await within(form).findByText("Complaint not found in this organization")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers no edit buttons to someone who cannot update", async () => {
    const user = userEvent.setup();
    renderPipeline({ canUpdate: false });
    const sheet = await openSheet(user, "IR-0002");
    expect(within(sheet).queryByRole("button", { name: /Edit .* details/ })).not.toBeInTheDocument();
  });

  it("still shows and edits the sections of a complaint whose stage was retired from the catalog", async () => {
    const stray = { ...BASE, _id: "c3", irNumber: "IR-0003", stage: "retired_stage", stageDetails: { retired_stage: { remarks: "Old note" } } };
    const complaints = [stray];
    const user = userEvent.setup();
    renderPipeline({ complaints, stages: withOrphanedStages(STAGES, complaints) });
    const sheet = await openSheet(user, "IR-0003");
    const block = within(sheet).getByRole("region", { name: "retired_stage details" });
    expect(block).toHaveTextContent("Old note");
    await user.click(within(block).getByRole("button", { name: "Edit retired_stage details" }));
    const form = await topDialog();
    await user.click(within(form).getByTestId("complaint-stage-form-save"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/complaints/c3/details", expect.objectContaining({ body: JSON.stringify({ organizationId: "org1", stage: "retired_stage", details: { remarks: "Old note" } }) })));
  });

  it("renders an old complaint that has none of the new fields, on the board, in the list and in the panel", async () => {
    const old = { ...BASE, _id: "c9", irNumber: "IR-0009", stage: "received" };
    const user = userEvent.setup();
    renderPipeline({ complaints: [old] });
    expect(screen.getByRole("button", { name: "Open IR-0009" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "List" }));
    expect(within(screen.getByRole("table")).getByText("IR-0009")).toBeInTheDocument();
    const sheet = await openSheet(user, "IR-0009");
    expect(within(sheet).getByRole("region", { name: "Sanction details" })).toHaveTextContent("Not filled in yet");
  });
});

describe("the board card", () => {
  it("shows the project and a one-line summary of the current stage's details", () => {
    renderPipeline();
    const received = screen.getByRole("group", { name: /Received IR\/complaint, 1 complaint/ });
    expect(received).toHaveTextContent("Tower A");
    const hearing = screen.getByRole("group", { name: /Administrative Hearing, 1 complaint/ });
    expect(hearing).toHaveTextContent("Dec 3, 2026 · Virtual");
  });
});

describe("the project dropdown", () => {
  it("offers the organization's projects, and only those", async () => {
    const user = userEvent.setup();
    render(<ComplaintFormDialog organizationId="org1" employees={EMPLOYEES} projects={PROJECTS} />);
    await user.click(screen.getByTestId("complaints-create-button"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText("Project/Site"));
    // The employee picker keeps its own options in the page too; look only at the project ones.
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent).filter((text) => text !== "Juan Dela Cruz");
    expect(options).toEqual(["None", "Tower A", "Tower B"]);
  });

  it("keeps a project that is no longer on the list selectable, so saving does not drop it", async () => {
    const user = userEvent.setup();
    render(
      <ComplaintFormDialog
        organizationId="org1"
        employees={EMPLOYEES}
        projects={PROJECTS}
        initialComplaint={{ id: "c1", employeeId: "e1", receivedDate: "2026-11-10T00:00:00.000Z", projectId: "gone" }}
      />,
    );
    await user.click(screen.getByTestId("complaint-edit-button"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Project/Site")).toHaveTextContent("Unknown project");
    await user.click(within(dialog).getByTestId("complaint-save-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/complaints/c1", expect.objectContaining({ body: expect.stringContaining('"projectId":"gone"') })));
  });
});

describe("ComplaintFormDialog with incident details", () => {
  async function openDialog(props: Partial<Parameters<typeof ComplaintFormDialog>[0]> = {}) {
    const user = userEvent.setup();
    render(<ComplaintFormDialog organizationId="org1" employees={EMPLOYEES} projects={PROJECTS} {...props} />);
    await user.click(screen.getByTestId(props.initialComplaint ? "complaint-edit-button" : "complaints-create-button"));
    return { user, dialog: await screen.findByRole("dialog") };
  }

  it("sends the incident details along with the respondent and date received", async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Juan Dela Cruz" }));
    await user.type(within(dialog).getByLabelText(/Date received/), "2026-11-10");
    await user.click(within(dialog).getByLabelText("Project/Site"));
    await user.click(await screen.findByRole("option", { name: "Tower A" }));
    await user.type(within(dialog).getByLabelText("Complainant name"), "Unit owner");
    await user.type(within(dialog).getByLabelText("Where"), "Gate 2");
    await user.type(within(dialog).getByLabelText("Date of incident"), "2026-11-08");
    await user.click(within(dialog).getByTestId("complaints-create-submit-button"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/complaints",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ organizationId: "org1", employeeId: "e1", receivedDate: "2026-11-10", projectId: "p1", description: "", what: "", where: "Gate 2", incidentDate: "2026-11-08", complainantName: "Unit owner", remarks: "" }),
        }),
      ),
    );
  });

  it("sends a blanked field as blank so the edit clears it", async () => {
    const { user, dialog } = await openDialog({
      initialComplaint: { id: "c1", employeeId: "e1", receivedDate: "2026-11-10T00:00:00.000Z", projectId: "p1", complainantName: "Unit owner", remarks: "Note" },
    });
    expect(within(dialog).getByLabelText("Project/Site")).toHaveTextContent("Tower A");
    await user.click(within(dialog).getByLabelText("Project/Site"));
    await user.click(await screen.findByRole("option", { name: "None" }));
    await user.click(within(dialog).getByTestId("complaint-save-button"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/complaints/c1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ organizationId: "org1", employeeId: "e1", receivedDate: "2026-11-10", projectId: "", description: "", what: "", where: "", incidentDate: "", complainantName: "Unit owner", remarks: "Note" }),
        }),
      ),
    );
  });
});
