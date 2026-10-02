// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { NavLinks, NAV_SECTIONS, NAV_PAGES, CATALOG_READ_PERMISSIONS, canSeeNavItem } from "@/components/shared/nav-links";
import { NoAccessCard, accessRequestText } from "@/components/shared/no-access-card";
import { mobileBackTarget } from "@/components/shared/breadcrumbs";

vi.mock("next/navigation", () => ({ usePathname: () => "/people", useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

// Sidebar links (a merged module is one link) and every page behind them (each tab).
const LINKS = NAV_SECTIONS.flatMap((section) => section.items);
const ITEMS = NAV_PAGES;

describe("navigation by permission", () => {
  it("lists only what the viewer's permissions open, and drops sections left empty", () => {
    render(<NavLinks heldPermissions={["employees.read", "leave.read"]} />);
    expect(screen.getByTestId("nav-link-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-people")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-organization-chart")).toBeInTheDocument();
    // Leave is one link (Requests | Balances are tabs), opening the first tab the viewer can see.
    expect(screen.getByTestId("nav-link-leave")).toHaveAttribute("href", "/leave");
    expect(screen.queryByTestId("nav-link-payroll")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-setup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-settings-security")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-section-toggle-admin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-section-toggle-more")).not.toBeInTheDocument();
    expect(screen.getByTestId("nav-section-toggle-organization")).toBeInTheDocument();
  });

  it("opens a merged module on the first screen the viewer may use (Setup lives under More)", () => {
    render(<NavLinks heldPermissions={["leave-policies.read"]} />);
    fireEvent.click(screen.getByTestId("nav-section-toggle-more"));
    expect(screen.getByTestId("nav-link-setup")).toHaveAttribute("href", "/leave/policies");
  });

  it("starts with More collapsed", () => {
    render(<NavLinks isSuperAdmin heldPermissions={[]} />);
    expect(screen.getByTestId("nav-section-toggle-more")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("nav-link-cases")).not.toBeInTheDocument();
  });

  it("shows every link to the Super Administrator (More aside), and everything but Super-Administrator-only links when permissions aren't known", () => {
    const more = NAV_SECTIONS.find((section) => section.label === "More")!.items.length;
    const { unmount } = render(<NavLinks isSuperAdmin heldPermissions={[]} />);
    expect(screen.getAllByRole("link")).toHaveLength(LINKS.length - more);
    unmount();
    render(<NavLinks />);
    expect(screen.getAllByRole("link")).toHaveLength(LINKS.filter((item) => !item.superAdminOnly).length - more);
  });

  it("opens Catalogs to anyone who can read one catalog", () => {
    const catalogs = ITEMS.find((item) => item.href === "/settings/catalogs")!;
    expect(canSeeNavItem(catalogs, { heldPermissions: ["case-statuses.read"] })).toBe(true);
    expect(canSeeNavItem(catalogs, { heldPermissions: ["employees.read"] })).toBe(false);
  });

  it("gates every item on the same permission its page checks", () => {
    for (const item of ITEMS) {
      if (!item.permission) continue;
      const source = readFileSync(`src/app/(app)${item.href}/page.tsx`, "utf8");
      // Organization-wide pages check hasPermission; project-aware pages (ADR-043) check accessibleProjects.
      const gated = [`hasPermission("${item.permission}"`, `accessibleProjects("${item.permission}"`].some((check) => source.includes(check));
      expect(gated, `${item.href} should check "${item.permission}"`).toBe(true);
    }
    // Every page but the dashboard is gated somehow.
    expect(ITEMS.filter((item) => !item.permission && !item.anyPermission && !item.superAdminOnly).map((item) => item.href)).toEqual(["/dashboard"]);
    // Nothing that was in the sidebar before the regrouping got lost.
    expect(ITEMS).toHaveLength(32);
  });

  it("keeps the catalog permission list in step with the catalog registry", async () => {
    const { CATALOG_REGISTRY } = await import("@/domains/catalog/catalog-registry");
    const fromRegistry = Object.values(CATALOG_REGISTRY).map((entry) => `${entry.permissionPrefix}.read`);
    expect([...CATALOG_READ_PERMISSIONS].sort()).toEqual(fromRegistry.sort());
  });
});

describe("NoAccessCard", () => {
  it("names the missing access, the viewer's roles, and offers a request and a way back", () => {
    render(
      <NoAccessCard message="You don't have access to view payroll runs." permission="payroll-runs.read" permissionLabel="View payroll runs" signedInAs="ana.reyes" roleNames={["Recruiter"]} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: /can.t open this page/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You don't have access to view payroll runs.");
    expect(screen.getByText("payroll-runs.read")).toBeInTheDocument();
    expect(screen.getByText("View payroll runs")).toBeInTheDocument();
    expect(screen.getByText("Recruiter")).toBeInTheDocument();
    expect(screen.getByText("ana.reyes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: /Copy request/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go back/ })).toBeInTheDocument();
  });

  it("says so plainly when the person has no roles, or the page is Super Administrator only", () => {
    render(<NoAccessCard message="Only the Super Administrator can see the recycle bin." superAdminOnly roleNames={[]} />);
    expect(screen.getByText("No roles yet")).toBeInTheDocument();
    expect(screen.getAllByText(/Super Administrator/).length).toBeGreaterThan(1);
  });

  it("writes a request an administrator can act on", () => {
    const text = accessRequestText({ permission: "payroll-runs.read", permissionLabel: "View payroll runs", signedInAs: "ana.reyes" }, "https://example.test/payroll");
    expect(text).toContain('"View payroll runs" (payroll-runs.read)');
    expect(text).toContain("My account: ana.reyes");
    expect(text).toContain("Page: https://example.test/payroll");
  });
});

describe("mobile back link", () => {
  it("goes up to the list from a record, to the record from a sub-page, and nowhere from a top-level page", () => {
    expect(mobileBackTarget("/people/64b7f0c2a1b2c3d4e5f60718")).toEqual({ href: "/people", label: "People" });
    expect(mobileBackTarget("/payroll/64b7f0c2a1b2c3d4e5f60718/payslips")).toEqual({ href: "/payroll/64b7f0c2a1b2c3d4e5f60718", label: "Back" });
    expect(mobileBackTarget("/payroll/rule-versions/new")).toEqual({ href: "/payroll/rule-versions", label: "Rule versions" });
    expect(mobileBackTarget("/people")).toBeNull();
    expect(mobileBackTarget("/dashboard")).toBeNull();
  });
});
