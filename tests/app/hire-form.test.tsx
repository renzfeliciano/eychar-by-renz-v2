// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HireForm } from "@/app/(app)/people/new/hire-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ person: {} }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

const props = {
  organizationId: "org1",
  positions: [],
  projects: [],
  employmentTypes: [{ id: "regular", label: "Regular", requiresEndOfContract: false }],
  educationLevels: [
    { id: "bachelors_degree", label: "Bachelor’s Degree" },
    { id: "masters_degree", label: "Master’s Degree" },
  ],
};

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/First name/), "Jane");
  await user.type(screen.getByLabelText(/Last name/), "Doe");
  await user.click(screen.getByLabelText(/Employment type/));
  await user.click(await screen.findByRole("option", { name: "Regular" }));
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add employee" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

// jsdom never finishes positioning a select popup: it can stay at pointer-events: none (a limit of the test
// environment, not of the dialog), so the click library's pointer-events check is turned off for these tests.
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

describe("HireForm: educational attainment", () => {
  it("is optional: leaving it out sends nothing for it", async () => {
    const user = setupUser();
    render(<HireForm {...props} />);
    await fillRequired(user);

    expect(screen.getByTestId("hire-education")).toHaveTextContent("Not specified");
    const body = await submit(user);
    expect(body).not.toHaveProperty("educationLevelCode");
  });

  it("sends the chosen level", async () => {
    const user = setupUser();
    render(<HireForm {...props} />);
    await fillRequired(user);
    await user.click(screen.getByTestId("hire-education"));
    await user.click(await screen.findByRole("option", { name: "Master’s Degree" }));

    const body = await submit(user);
    expect(body.educationLevelCode).toBe("masters_degree");
  });

  it("offers only the levels it was given", async () => {
    const user = setupUser();
    render(<HireForm {...props} educationLevels={[{ id: "associate_degree", label: "Associate Degree" }]} />);
    await user.click(screen.getByTestId("hire-education"));

    expect(await screen.findByRole("option", { name: "Associate Degree" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Master’s Degree" })).toBeNull();
  });
});
