// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrgChartNode } from "@/domains/workforce/org-chart-service";
import { OrgChartView } from "@/app/(app)/organization/chart/org-chart-view";

const person = (employeeId: string, name: string, positionTitle: string, organizationUnitName: string, children: OrgChartNode[] = []): OrgChartNode => ({
  employeeId,
  name,
  employmentStatus: "active",
  positionTitle,
  organizationUnitName,
  projectName: null,
  children,
});

const ROOTS = [
  person("e1", "Maria Reyes", "President", "Executive", [
    person("e2", "Carlos Villanueva", "Operations Manager", "Operations", [person("e4", "Jose Mercado", "Security Guard", "Operations")]),
    person("e3", "Bea Ramirez", "Accounting Head", "Finance"),
  ]),
];

describe("OrgChartView", () => {
  it("draws everyone as a card with their title and team size", () => {
    render(<OrgChartView roots={ROOTS} />);
    const chart = screen.getByRole("tree", { name: "Organization chart" });
    expect(within(chart).getByText("Maria Reyes")).toBeInTheDocument();
    expect(within(chart).getByText("President")).toBeInTheDocument();
    expect(within(chart).getByText("Jose Mercado")).toBeInTheDocument();
    expect(within(chart).getByLabelText("2 direct reports")).toBeInTheDocument();
  });

  it("collapses and expands a manager's team, and all teams at once", async () => {
    const user = userEvent.setup();
    render(<OrgChartView roots={ROOTS} />);

    await user.click(screen.getByRole("button", { name: "Hide Carlos Villanueva's team" }));
    expect(screen.queryByText("Jose Mercado")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show Carlos Villanueva's team (1)" }));
    expect(screen.getByText("Jose Mercado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("Carlos Villanueva")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Jose Mercado")).toBeInTheDocument();
  });

  it("zooms in and out", async () => {
    const user = userEvent.setup();
    render(<OrgChartView roots={ROOTS} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("110%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("90%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("opens a person's panel with their manager chain and direct reports", async () => {
    const user = userEvent.setup();
    render(<OrgChartView roots={ROOTS} />);
    await user.click(screen.getByRole("button", { name: "Open Carlos Villanueva" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Operations Manager")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Maria Reyes/ })).toHaveAttribute("href", "/people/e1");
    expect(within(panel).getByRole("link", { name: /Jose Mercado/ })).toHaveAttribute("href", "/people/e4");
    expect(within(panel).getByRole("link", { name: /View full profile/ })).toHaveAttribute("href", "/people/e2");
  });

  it("switches to a list with one row per person, indented under their manager", async () => {
    const user = userEvent.setup();
    render(<OrgChartView roots={ROOTS} />);
    await user.click(screen.getByRole("radio", { name: "List" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("Jose Mercado").closest("tr")).toHaveTextContent("Carlos Villanueva");
  });
});
