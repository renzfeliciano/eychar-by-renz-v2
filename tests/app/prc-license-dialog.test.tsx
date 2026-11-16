// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrcLicenseDialog, RemovePrcLicenseButton } from "@/app/(app)/people/[id]/prc-license-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args) } }));

const PROFESSIONS = [
  { code: "nurse", name: "Nurse", status: "active", sortOrder: 1 },
  { code: "teacher", name: "Professional Teacher", status: "inactive", sortOrder: 2 },
];
const base = { organizationId: "org1", employeeId: "e1", employeeName: "Jane Doe", professions: PROFESSIONS };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ record: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });
async function chooseProfession(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByTestId("prc-license-profession"));
  await user.click(await screen.findByRole("option", { name }));
}

describe("PrcLicenseDialog (add)", () => {
  it("adds a license: sends profession, number and validity, then refreshes", async () => {
    const user = setupUser();
    render(<PrcLicenseDialog {...base} />);

    await user.click(screen.getByTestId("prc-license-add-button"));
    await chooseProfession(user, "Nurse");
    await user.type(screen.getByLabelText(/^License number/), "0123456");
    await user.type(screen.getByLabelText(/^Valid until/), "2029-08-15");
    await user.click(screen.getByTestId("prc-license-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/prc-licenses");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(sentBody()).toEqual({ organizationId: "org1", professionCode: "nurse", licenseNumber: "0123456", validUntil: "2029-08-15" });
    expect(success).toHaveBeenCalledWith("PRC license added");
  });

  it("offers only active professions, and leaves the validity out when blank", async () => {
    const user = setupUser();
    render(<PrcLicenseDialog {...base} />);

    await user.click(screen.getByTestId("prc-license-add-button"));
    await user.click(screen.getByTestId("prc-license-profession"));
    expect(await screen.findByRole("option", { name: "Nurse" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Teacher/ })).toBeNull();
    await user.click(screen.getByRole("option", { name: "Nurse" }));
    await user.type(screen.getByLabelText(/^License number/), "N-1");
    await user.click(screen.getByTestId("prc-license-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ organizationId: "org1", professionCode: "nurse", licenseNumber: "N-1" });
  });

  it("makes HR choose a profession and enter a number before sending", async () => {
    const user = setupUser();
    render(<PrcLicenseDialog {...base} />);

    await user.click(screen.getByTestId("prc-license-add-button"));
    await user.click(screen.getByTestId("prc-license-submit"));
    expect(await screen.findByText("Choose the profession.")).toBeTruthy();

    await chooseProfession(user, "Nurse");
    await user.click(screen.getByTestId("prc-license-submit"));
    expect(await screen.findByText("Enter the license number.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason and stays open", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Employee not found in this organization" }), { status: 404 }));
    const user = setupUser();
    render(<PrcLicenseDialog {...base} />);

    await user.click(screen.getByTestId("prc-license-add-button"));
    await chooseProfession(user, "Nurse");
    await user.type(screen.getByLabelText(/^License number/), "N-1");
    await user.click(screen.getByTestId("prc-license-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Employee not found");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("PrcLicenseDialog (edit)", () => {
  const record = { id: "r1", professionCode: "teacher", licenseNumber: "T-1", validUntil: "2027-01-01" };

  it("pre-fills the license, keeps its retired profession, and sends the change as a whole", async () => {
    const user = setupUser();
    render(<PrcLicenseDialog {...base} record={record} />);

    await user.click(screen.getByTestId("prc-license-edit-r1"));
    expect(screen.getByTestId("prc-license-profession")).toHaveTextContent("Professional Teacher (retired)");
    expect(screen.getByLabelText(/^License number/)).toHaveValue("T-1");
    await user.clear(screen.getByLabelText(/^License number/));
    await user.type(screen.getByLabelText(/^License number/), "T-2");
    await user.click(screen.getByTestId("prc-license-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/prc-licenses/r1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(sentBody()).toEqual({ organizationId: "org1", professionCode: "teacher", licenseNumber: "T-2", validUntil: "2027-01-01" });
    expect(success).toHaveBeenCalledWith("PRC license saved");
  });

  it("clears the validity with null", async () => {
    const user = setupUser();
    render(<PrcLicenseDialog {...base} record={record} />);

    await user.click(screen.getByTestId("prc-license-edit-r1"));
    await user.clear(screen.getByLabelText(/^Valid until/));
    await user.click(screen.getByTestId("prc-license-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ validUntil: null });
  });
});

describe("RemovePrcLicenseButton", () => {
  it("asks to confirm, then deletes the license and refreshes", async () => {
    const user = setupUser();
    render(<RemovePrcLicenseButton organizationId="org1" employeeId="e1" recordId="r1" label="Nurse license 0123456" />);

    await user.click(screen.getByTestId("prc-license-remove-r1"));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Remove license" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/prc-licenses/r1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(sentBody()).toEqual({ organizationId: "org1" });
  });
});
