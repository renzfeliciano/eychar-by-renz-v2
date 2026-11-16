// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GovernmentIdDialog, RemoveGovernmentIdButton } from "@/app/(app)/people/[id]/government-id-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args) } }));

const TYPES = [
  { code: "passport", name: "Passport", status: "active", sortOrder: 1 },
  { code: "umid", name: "UMID", status: "inactive", sortOrder: 2 },
];
const base = { organizationId: "org1", employeeId: "e1", employeeName: "Jane Doe", types: TYPES };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ record: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);
// jsdom never finishes positioning a select popup, so the click library's pointer-events check is turned off.
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });
async function chooseType(user: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  await user.click(screen.getByTestId("government-id-type"));
  await user.click(await screen.findByRole("option", { name }));
}

describe("GovernmentIdDialog (add)", () => {
  it("adds an ID of a catalog type: sends the type code, number and validity, then refreshes", async () => {
    const user = setupUser();
    render(<GovernmentIdDialog {...base} />);

    await user.click(screen.getByTestId("government-id-add-button"));
    await chooseType(user, "Passport");
    await user.type(screen.getByLabelText(/^ID number/), "P1234567");
    await user.type(screen.getByLabelText(/^Valid until/), "2030-06-30");
    await user.click(screen.getByTestId("government-id-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/government-ids");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(sentBody()).toEqual({ organizationId: "org1", typeCode: "passport", idNumber: "P1234567", validUntil: "2030-06-30" });
    expect(success).toHaveBeenCalledWith("Government ID added");
  });

  it("offers only active types plus Other, and leaves the validity out when blank", async () => {
    const user = setupUser();
    render(<GovernmentIdDialog {...base} />);

    await user.click(screen.getByTestId("government-id-add-button"));
    await user.click(screen.getByTestId("government-id-type"));
    expect(await screen.findByRole("option", { name: "Passport" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Other (type a name)" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /UMID/ })).toBeNull();
  });

  it("with Other, asks for a name and sends it instead of a type code", async () => {
    const user = setupUser();
    render(<GovernmentIdDialog {...base} />);

    await user.click(screen.getByTestId("government-id-add-button"));
    expect(screen.queryByTestId("government-id-other-name")).toBeNull();
    await chooseType(user, "Other (type a name)");
    await user.type(screen.getByTestId("government-id-other-name"), "Seaman's Book");
    await user.type(screen.getByLabelText(/^ID number/), "SB-9");
    await user.click(screen.getByTestId("government-id-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ organizationId: "org1", otherTypeName: "Seaman's Book", idNumber: "SB-9" });
  });

  it("makes HR choose a type (and name for Other) and enter a number before sending", async () => {
    const user = setupUser();
    render(<GovernmentIdDialog {...base} />);

    await user.click(screen.getByTestId("government-id-add-button"));
    await user.click(screen.getByTestId("government-id-submit"));
    expect(await screen.findByText("Choose the ID type.")).toBeTruthy();

    await chooseType(user, "Other (type a name)");
    await user.click(screen.getByTestId("government-id-submit"));
    expect(await screen.findByText("Type the name of the ID.")).toBeTruthy();

    await user.type(screen.getByTestId("government-id-other-name"), "Seaman's Book");
    await user.click(screen.getByTestId("government-id-submit"));
    expect(await screen.findByText("Enter the ID number.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason and stays open", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Employee not found in this organization" }), { status: 404 }));
    const user = setupUser();
    render(<GovernmentIdDialog {...base} />);

    await user.click(screen.getByTestId("government-id-add-button"));
    await chooseType(user, "Passport");
    await user.type(screen.getByLabelText(/^ID number/), "P1");
    await user.click(screen.getByTestId("government-id-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Employee not found");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("GovernmentIdDialog (edit)", () => {
  const retired = { id: "r1", typeCode: "umid", otherTypeName: null, idNumber: "U1", validUntil: "2027-01-01" };

  it("pre-fills the ID, keeps its retired type, and sends a changed number with the type and date", async () => {
    const user = setupUser();
    render(<GovernmentIdDialog {...base} record={retired} />);

    await user.click(screen.getByTestId("government-id-edit-r1"));
    expect(screen.getByTestId("government-id-type")).toHaveTextContent("UMID (retired)");
    expect(screen.getByLabelText(/^ID number/)).toHaveValue("U1");
    expect(screen.getByLabelText(/^Valid until/)).toHaveValue("2027-01-01");

    await user.clear(screen.getByLabelText(/^ID number/));
    await user.type(screen.getByLabelText(/^ID number/), "U2");
    await user.click(screen.getByTestId("government-id-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/government-ids/r1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(sentBody()).toEqual({ organizationId: "org1", typeCode: "umid", idNumber: "U2", validUntil: "2027-01-01" });
    expect(success).toHaveBeenCalledWith("Government ID saved");
  });

  it("clears the validity with null, and shows a typed-name ID as Other with its name", async () => {
    const user = setupUser();
    render(<GovernmentIdDialog {...base} record={{ id: "r2", typeCode: null, otherTypeName: "Seaman's Book", idNumber: "SB-9", validUntil: "2027-01-01" }} />);

    await user.click(screen.getByTestId("government-id-edit-r2"));
    expect(screen.getByTestId("government-id-other-name")).toHaveValue("Seaman's Book");
    await user.clear(screen.getByLabelText(/^Valid until/));
    await user.click(screen.getByTestId("government-id-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ organizationId: "org1", otherTypeName: "Seaman's Book", idNumber: "SB-9", validUntil: null });
  });
});

describe("RemoveGovernmentIdButton", () => {
  it("asks to confirm, then deletes the ID and refreshes", async () => {
    const user = setupUser();
    render(<RemoveGovernmentIdButton organizationId="org1" employeeId="e1" recordId="r1" label="Passport P1234567" />);

    await user.click(screen.getByTestId("government-id-remove-r1"));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Remove ID" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/government-ids/r1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(sentBody()).toEqual({ organizationId: "org1" });
  });

  it("shows the server's reason in the confirmation and leaves the ID", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Government ID not found for this employee" }), { status: 404 }));
    const user = setupUser();
    render(<RemoveGovernmentIdButton organizationId="org1" employeeId="e1" recordId="r1" label="Passport P1234567" />);

    await user.click(screen.getByTestId("government-id-remove-r1"));
    await user.click(await screen.findByRole("button", { name: "Remove ID" }));

    expect(await screen.findByText(/not found for this employee/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
