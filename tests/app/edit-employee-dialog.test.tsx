// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditEmployeeDialog } from "@/app/(app)/people/[id]/edit-employee-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const base = { organizationId: "org1", employeeId: "e1" };
const person = { firstName: "Jane", lastName: "Doe" };

async function openAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("edit-employee-button"));
  return {
    save: async () => {
      await user.click(screen.getByTestId("edit-employee-submit-button"));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      return JSON.parse(fetchMock.mock.calls[0][1].body);
    },
  };
}

// jsdom never finishes positioning a select popup: it can stay at pointer-events: none (a limit of the test
// environment, not of the dialog), so the click library's pointer-events check is turned off for these tests.
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

// Highest educational attainment was dropped from the form (the Educational background card records schooling).
// Saving leaves out the field, so a level already on file is kept as it is rather than cleared.
describe("EditEmployeeDialog: no educational attainment field", () => {
  it("doesn't show the field and doesn't send a level, so the one on file is untouched", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} initialValue={person} />);

    const { save } = await openAndSave(user);
    expect(screen.queryByTestId("edit-employee-education")).toBeNull();
    expect(screen.queryByText("Highest educational attainment")).toBeNull();
    expect(await save()).not.toHaveProperty("educationLevelCode");
  });
});

const CIVIL_STATUSES = [
  { id: "single", label: "Single" },
  { id: "married", label: "Married" },
];

describe("EditEmployeeDialog: civil status", () => {
  it("sends the status on file back unchanged when nothing else is touched", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} civilStatuses={CIVIL_STATUSES} initialValue={{ ...person, civilStatusCode: "single" }} />);

    const { save } = await openAndSave(user);
    expect((await save()).civilStatusCode).toBe("single");
  });

  it("sends the newly chosen status's catalog code", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} civilStatuses={CIVIL_STATUSES} initialValue={{ ...person, civilStatusCode: "single" }} />);

    const { save } = await openAndSave(user);
    await user.click(screen.getByLabelText(/Civil status/));
    await user.click(await screen.findByRole("option", { name: "Married" }));
    expect((await save()).civilStatusCode).toBe("married");
  });

  it("sends an empty value for someone with none on file, which leaves it unset", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} civilStatuses={CIVIL_STATUSES} initialValue={person} />);

    const { save } = await openAndSave(user);
    expect((await save()).civilStatusCode).toBe("");
  });
});

describe("EditEmployeeDialog: RDO and ZIP codes (gaps B26)", () => {
  it("sends the RDO and ZIP codes HR enters, for BIR Form 2316", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} initialValue={{ ...person, rdoCode: "039" }} />);
    const { save } = await openAndSave(user);
    expect(screen.getByLabelText(/RDO code/)).toHaveValue("039");
    await user.type(screen.getByLabelText(/ZIP code/), "1100");
    expect(await save()).toMatchObject({ rdoCode: "039", zipCode: "1100" });
  });
});
