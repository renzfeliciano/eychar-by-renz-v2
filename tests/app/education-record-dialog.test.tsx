// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EducationRecordDialog, RemoveEducationButton } from "@/app/(app)/people/[id]/education-record-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args) } }));

const LEVELS = [
  { code: "high_school_graduate", name: "High School Graduate", status: "active", sortOrder: 1 },
  { code: "bachelors_degree", name: "Bachelor’s Degree", status: "active", sortOrder: 6 },
  { code: "masters_degree", name: "Master’s Degree", status: "inactive", sortOrder: 8 },
];
const base = { organizationId: "org1", employeeId: "e1", employeeName: "Jane Doe", levels: LEVELS };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ record: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

async function chooseLevel(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByTestId("education-level"));
  const option = await screen.findByRole("option", { name });
  await user.click(option);
}
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

// jsdom never finishes positioning a select popup: it can stay at pointer-events: none (a limit of the test
// environment, not of the dialog), so the click library's pointer-events check is turned off for these tests.
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

describe("EducationRecordDialog (add)", () => {
  it("adds an entry: sends level, school, course and year, then refreshes", async () => {
    const user = setupUser();
    render(<EducationRecordDialog {...base} />);

    await user.click(screen.getByTestId("education-add-button"));
    await chooseLevel(user, "Bachelor’s Degree");
    await user.type(screen.getByLabelText(/School/), "PUP");
    await user.type(screen.getByLabelText(/Course or degree/), "BS Accountancy");
    await user.type(screen.getByLabelText(/Year graduated/), "2014");
    await user.click(screen.getByTestId("education-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/education");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(sentBody()).toEqual({ organizationId: "org1", levelCode: "bachelors_degree", school: "PUP", course: "BS Accountancy", yearGraduated: 2014 });
    expect(success).toHaveBeenCalledWith("Education entry added");
  });

  it("leaves the course and year out when blank", async () => {
    const user = setupUser();
    render(<EducationRecordDialog {...base} />);

    await user.click(screen.getByTestId("education-add-button"));
    await chooseLevel(user, "High School Graduate");
    await user.type(screen.getByLabelText(/School/), "Rizal High");
    await user.click(screen.getByTestId("education-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({ organizationId: "org1", levelCode: "high_school_graduate", school: "Rizal High" });
  });

  it("makes HR choose a level and enter a school before sending", async () => {
    const user = setupUser();
    render(<EducationRecordDialog {...base} />);

    await user.click(screen.getByTestId("education-add-button"));
    await user.click(screen.getByTestId("education-submit"));
    expect(await screen.findByText("Choose a level.")).toBeTruthy();

    await chooseLevel(user, "Bachelor’s Degree");
    await user.click(screen.getByTestId("education-submit"));
    expect(await screen.findByText("Enter the school.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a year outside 1900 and next year before sending", async () => {
    const user = setupUser();
    render(<EducationRecordDialog {...base} />);

    await user.click(screen.getByTestId("education-add-button"));
    await chooseLevel(user, "Bachelor’s Degree");
    await user.type(screen.getByLabelText(/School/), "PUP");
    await user.type(screen.getByLabelText(/Year graduated/), "1850");
    await user.click(screen.getByTestId("education-submit"));

    expect(await screen.findByText(/between 1900 and/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers only active levels when adding", async () => {
    const user = setupUser();
    render(<EducationRecordDialog {...base} />);

    await user.click(screen.getByTestId("education-add-button"));
    await user.click(screen.getByTestId("education-level"));
    expect(await screen.findByRole("option", { name: "Bachelor’s Degree" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Master/ })).toBeNull();
  });

  it("shows the server's reason and stays open", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Employee not found in this organization" }), { status: 404 }));
    const user = setupUser();
    render(<EducationRecordDialog {...base} />);

    await user.click(screen.getByTestId("education-add-button"));
    await chooseLevel(user, "Bachelor’s Degree");
    await user.type(screen.getByLabelText(/School/), "PUP");
    await user.click(screen.getByTestId("education-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Employee not found");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("EducationRecordDialog (edit)", () => {
  const record = { id: "r1", levelCode: "masters_degree", school: "UP", course: "MBA", yearGraduated: 2020 };

  it("pre-fills the entry, keeps its retired level, and sends a change to the school only as itself", async () => {
    const user = setupUser();
    render(<EducationRecordDialog {...base} record={record} />);

    await user.click(screen.getByTestId("education-edit-r1"));
    expect(screen.getByTestId("education-level")).toHaveTextContent("Master’s Degree (retired)");
    expect(screen.getByLabelText(/School/)).toHaveValue("UP");
    expect(screen.getByLabelText(/Course or degree/)).toHaveValue("MBA");
    expect(screen.getByLabelText(/Year graduated/)).toHaveValue("2020");

    await user.clear(screen.getByLabelText(/School/));
    await user.type(screen.getByLabelText(/School/), "UP Diliman");
    await user.click(screen.getByTestId("education-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/education/r1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(sentBody()).toEqual({ organizationId: "org1", levelCode: "masters_degree", school: "UP Diliman", course: "MBA", yearGraduated: 2020 });
    expect(success).toHaveBeenCalledWith("Education entry saved");
  });

  it("clears the course and the year with an empty course and a null year", async () => {
    const user = setupUser();
    render(<EducationRecordDialog {...base} record={record} />);

    await user.click(screen.getByTestId("education-edit-r1"));
    await user.clear(screen.getByLabelText(/Course or degree/));
    await user.clear(screen.getByLabelText(/Year graduated/));
    await user.click(screen.getByTestId("education-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ course: "", yearGraduated: null });
  });
});

describe("RemoveEducationButton", () => {
  it("asks to confirm, then deletes the entry and refreshes", async () => {
    const user = setupUser();
    render(<RemoveEducationButton organizationId="org1" employeeId="e1" recordId="r1" label="BS Accountancy at PUP" />);

    await user.click(screen.getByTestId("education-remove-r1"));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Remove entry" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/education/r1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(sentBody()).toEqual({ organizationId: "org1" });
  });

  it("shows the server's reason in the confirmation and leaves the entry", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Education entry not found for this employee" }), { status: 404 }));
    const user = setupUser();
    render(<RemoveEducationButton organizationId="org1" employeeId="e1" recordId="r1" label="BS Accountancy at PUP" />);

    await user.click(screen.getByTestId("education-remove-r1"));
    await user.click(await screen.findByRole("button", { name: "Remove entry" }));

    expect(await screen.findByText(/not found for this employee/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
