// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "@/components/shared/account-menu";

const push = vi.fn();
const signOut = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));

beforeEach(() => {
  push.mockReset();
  signOut.mockReset();
});

const PROPS = {
  displayName: "Renzo Payod",
  username: "renzy_admin",
  email: "renzo@example.com",
  organizationName: "Project Concepts and Administrative Services, Inc.",
  roleNames: ["HR Administrator", "Payroll Approver"],
  canManageAccess: true,
};

describe("AccountMenu", () => {
  it("shows who is signed in, where, and with which roles", async () => {
    const user = userEvent.setup();
    render(<AccountMenu {...PROPS} />);

    const trigger = screen.getByRole("button", { name: "Account menu for Renzo Payod" });
    expect(trigger).toHaveTextContent("RP");
    await user.click(trigger);

    expect(await screen.findByText("@renzy_admin")).toBeInTheDocument();
    expect(screen.getByText("renzo@example.com")).toBeInTheDocument();
    expect(screen.getByText("Project Concepts and Administrative Services, Inc.")).toBeInTheDocument();
    const roles = within(screen.getByLabelText("Your roles"));
    expect(roles.getByText("HR Administrator")).toBeInTheDocument();
    expect(roles.getByText("Payroll Approver")).toBeInTheDocument();
  });

  it("opens access settings, and signs out back to the login page", async () => {
    const user = userEvent.setup();
    render(<AccountMenu {...PROPS} />);

    await user.click(screen.getByRole("button", { name: /Account menu/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Users & access/ }));
    expect(push).toHaveBeenCalledWith("/settings/access");

    await user.click(screen.getByRole("button", { name: /Account menu/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Sign out/ }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("opens everyone's own Security page, even without access rights", async () => {
    const user = userEvent.setup();
    render(<AccountMenu {...PROPS} canManageAccess={false} roleNames={[]} />);
    await user.click(screen.getByRole("button", { name: /Account menu/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Security/ }));
    expect(push).toHaveBeenCalledWith("/account/security");
  });

  it("hides access settings from people who can't manage them", async () => {
    const user = userEvent.setup();
    render(<AccountMenu {...PROPS} canManageAccess={false} roleNames={[]} />);
    await user.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(await screen.findByRole("menuitem", { name: /Sign out/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Users & access/ })).not.toBeInTheDocument();
  });
});
