// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceLayout } from "@/components/shared/workspace-layout";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const ACCOUNT = { displayName: "Renzy Admin", username: "renzy_admin", email: null, organizationName: "PCAS", roleNames: ["Admin"], canManageAccess: true };

describe("WorkspaceLayout mobile navigation", () => {
  it("puts the mobile menu's links in their own scroll area, so modules below the fold stay reachable", async () => {
    render(
      <WorkspaceLayout account={ACCOUNT}>
        <p>content</p>
      </WorkspaceLayout>,
    );

    await userEvent.click(screen.getByTestId("mobile-nav-open-button"));

    const scrollArea = await screen.findByTestId("mobile-nav-scroll");
    expect(scrollArea.className).toMatch(/(^| )overflow-y-auto( |$)/);
    // min-h-0 + flex-1 lets it shrink inside the full-height sheet instead of overflowing it.
    expect(scrollArea.className).toMatch(/(^| )min-h-0( |$)/);
    expect(scrollArea.className).toMatch(/(^| )flex-1( |$)/);
    expect(within(scrollArea).getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });
});
