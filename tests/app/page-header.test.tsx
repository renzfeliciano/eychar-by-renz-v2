// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/shared/page-header";

// A page with several actions (Payroll runs has four) used to push its action row wider than a phone screen,
// because the row neither shrinks (shrink-0) nor was capped to its container. jsdom has no layout, so this pins
// the classes that stop it (measured in a real browser at 390 px: 450 px wide before, 358 px after).
describe("PageHeader", () => {
  it("shows the title, description and actions", () => {
    render(<PageHeader title="Payroll runs" description="Prepare each cutoff." action={<button>New run</button>} testId="header" />);
    expect(screen.getByRole("heading", { name: "Payroll runs" })).toBeTruthy();
    expect(screen.getByText("Prepare each cutoff.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New run" })).toBeTruthy();
  });

  it("lets the actions wrap and never be wider than the screen", () => {
    render(<PageHeader title="Payroll runs" action={<button>New run</button>} />);
    const actions = screen.getByRole("button", { name: "New run" }).parentElement!;
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).toContain("max-w-full");
  });

  it("renders no action row when there are no actions", () => {
    const { container } = render(<PageHeader title="Payroll runs" />);
    expect(container.querySelectorAll("header > div")).toHaveLength(1);
  });
});
