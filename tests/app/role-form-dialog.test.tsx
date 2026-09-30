// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoleFormDialog } from "@/app/(app)/settings/access/role-form-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const PERMISSIONS = [
  { key: "leave.read", description: "View leave", category: "leave" },
  { key: "leave.create", description: "File leave", category: "leave" },
  { key: "events.read", description: "View events", category: "events" },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ role: {} }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("RoleFormDialog permission groups", () => {
  it("checks every permission in a group from the group's own checkbox, and clears them again", async () => {
    const user = userEvent.setup();
    render(<RoleFormDialog organizationId="org1" availablePermissions={PERMISSIONS} />);
    await user.click(screen.getByTestId("roles-create-button"));

    const group = screen.getByRole("checkbox", { name: "All leave permissions" });
    await user.click(group);
    expect(screen.getByRole("checkbox", { name: "View leave" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "File leave" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "View events" })).not.toBeChecked();

    await user.click(group);
    expect(screen.getByRole("checkbox", { name: "View leave" })).not.toBeChecked();
  });

  it("shows a group as partly selected, and completes it on click", async () => {
    const user = userEvent.setup();
    render(<RoleFormDialog organizationId="org1" availablePermissions={PERMISSIONS} />);
    await user.click(screen.getByTestId("roles-create-button"));

    await user.click(screen.getByRole("checkbox", { name: "View leave" }));
    const group = screen.getByRole("checkbox", { name: "All leave permissions" });
    expect(group).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    await user.click(group);
    await user.type(screen.getByLabelText(/^Name/), "Leave clerk");
    await user.click(screen.getByTestId("roles-create-submit-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).permissionKeys.sort()).toEqual(["leave.create", "leave.read"]);
  });
});
