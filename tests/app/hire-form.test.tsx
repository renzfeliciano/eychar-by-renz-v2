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

// Highest educational attainment was dropped from the form: the Educational background card on the profile
// records schooling, so the roster form no longer asks for it.
describe("HireForm: no educational attainment field", () => {
  it("doesn't show the field or send a level", async () => {
    const user = setupUser();
    render(<HireForm {...props} />);
    await fillRequired(user);

    expect(screen.queryByTestId("hire-education")).toBeNull();
    expect(screen.queryByText("Highest educational attainment")).toBeNull();
    const body = await submit(user);
    expect(body).not.toHaveProperty("educationLevelCode");
  });
});

const CIVIL_STATUSES = [
  { id: "single", label: "Single" },
  { id: "married", label: "Married" },
];

describe("HireForm: civil status", () => {
  it("is optional: leaving it out sends nothing for it", async () => {
    const user = setupUser();
    render(<HireForm {...props} />);
    await fillRequired(user);

    const body = await submit(user);
    expect(body).not.toHaveProperty("civilStatusCode");
  });

  it("sends the chosen status's catalog code", async () => {
    const user = setupUser();
    render(<HireForm {...props} civilStatuses={CIVIL_STATUSES} />);
    await fillRequired(user);
    await user.click(screen.getByLabelText(/Civil status/));
    await user.click(await screen.findByRole("option", { name: "Married" }));

    const body = await submit(user);
    expect(body.civilStatusCode).toBe("married");
  });

  it("offers only the statuses it was given", async () => {
    const user = setupUser();
    render(<HireForm {...props} civilStatuses={[{ id: "solo_parent", label: "Solo parent" }]} />);
    await user.click(screen.getByLabelText(/Civil status/));

    expect(await screen.findByRole("option", { name: "Solo parent" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Married" })).toBeNull();
  });
});
