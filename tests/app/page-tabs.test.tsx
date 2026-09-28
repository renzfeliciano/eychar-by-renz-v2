// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTabs } from "@/components/shared/page-tabs";

describe("PageTabs", () => {
  it("renders each tab as a link, marks the current one, and shows counts", () => {
    render(
      <PageTabs
        label="Employee sections"
        active="leave"
        tabs={[
          { value: "overview", label: "Overview", href: "/people/1" },
          { value: "leave", label: "Leave", href: "/people/1?tab=leave", count: 3 },
          { value: "documents", label: "Documents", href: "/people/1?tab=documents", count: 0 },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Employee sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Leave/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Overview/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Leave/ })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Documents/ })).toHaveAttribute("href", "/people/1?tab=documents");
  });
});
