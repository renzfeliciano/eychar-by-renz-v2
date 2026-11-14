// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditEmployeeDialog } from "@/app/(app)/people/[id]/edit-employee-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const LEVELS = [
  { id: "bachelors_degree", label: "Bachelor’s Degree" },
  { id: "masters_degree", label: "Master’s Degree" },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const base = { organizationId: "org1", employeeId: "e1", educationLevels: LEVELS };
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

describe("EditEmployeeDialog: educational attainment", () => {
  it("shows the level on file and sends it back unchanged when nothing else is touched", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} initialValue={{ ...person, educationLevelCode: "bachelors_degree" }} />);

    const { save } = await openAndSave(user);
    expect(screen.getByTestId("edit-employee-education")).toHaveTextContent("Bachelor’s Degree");
    expect((await save()).educationLevelCode).toBe("bachelors_degree");
  });

  it("sends the newly chosen level", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} initialValue={{ ...person, educationLevelCode: "bachelors_degree" }} />);

    const { save } = await openAndSave(user);
    await user.click(screen.getByTestId("edit-employee-education"));
    await user.click(await screen.findByRole("option", { name: "Master’s Degree" }));
    expect((await save()).educationLevelCode).toBe("masters_degree");
  });

  it("sends an empty value to clear it, which is how the API removes the field", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} initialValue={{ ...person, educationLevelCode: "bachelors_degree" }} />);

    const { save } = await openAndSave(user);
    await user.click(screen.getByTestId("edit-employee-education"));
    await user.click(await screen.findByRole("option", { name: "Not specified" }));
    expect((await save()).educationLevelCode).toBe("");
  });

  it("starts as Not specified for someone with no level on file", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} initialValue={person} />);

    const { save } = await openAndSave(user);
    expect(screen.getByTestId("edit-employee-education")).toHaveTextContent("Not specified");
    expect((await save()).educationLevelCode).toBe("");
  });

  it("shows a level HR has since retired, so opening the form never silently blanks it", async () => {
    const user = setupUser();
    render(<EditEmployeeDialog {...base} educationLevels={[...LEVELS, { id: "old_level", label: "Old level (retired)" }]} initialValue={{ ...person, educationLevelCode: "old_level" }} />);

    const { save } = await openAndSave(user);
    expect(screen.getByTestId("edit-employee-education")).toHaveTextContent("Old level (retired)");
    expect((await save()).educationLevelCode).toBe("old_level");
  });
});
