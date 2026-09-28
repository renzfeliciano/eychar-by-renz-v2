// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartFilters } from "@/app/(app)/organization/chart/chart-filters";

const push = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => params }));

const OPTIONS = {
  units: [{ id: "u1", label: "Operations" }],
  positions: [{ id: "p1", label: "Security Guard" }],
  projects: [{ id: "j1", label: "EGI Albergo" }],
};

beforeEach(() => {
  push.mockReset();
  params = new URLSearchParams();
});

describe("ChartFilters", () => {
  it("searches by name when Enter is pressed", async () => {
    const user = userEvent.setup();
    render(<ChartFilters {...OPTIONS} />);
    await user.type(screen.getByLabelText("Search people"), "maria{Enter}");
    expect(push).toHaveBeenCalledWith("/organization/chart?search=maria");
  });

  it("shows how many filters are on and clears them all at once", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams("organizationUnitId=u1&search=maria");
    render(<ChartFilters {...OPTIONS} />);
    expect(screen.getByText("2 filters on")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(push).toHaveBeenCalledWith("/organization/chart");
  });

  it("has no Clear button when nothing is filtered", () => {
    render(<ChartFilters {...OPTIONS} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});
