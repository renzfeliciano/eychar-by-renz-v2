// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MetricCard } from "@/components/shared/metric-card";

afterEach(cleanup);

describe("MetricCard", () => {
  it("renders a static card when there's nowhere to go", () => {
    render(<MetricCard label="Open cases" value={3} hint="Not closed" />);
    expect(screen.getByText("Open cases")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("becomes one link to its module, named by its label and value, when given an href", () => {
    render(<MetricCard label="On leave today" value={2} hint="Approved leave" href="/leave" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/leave");
    expect(link.textContent).toContain("On leave today");
    expect(link.textContent).toContain("2");
  });
});
