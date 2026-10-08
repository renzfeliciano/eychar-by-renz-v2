// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageLoader } from "@/components/shared/page-loader";

describe("PageLoader", () => {
  it("announces loading once to assistive tech and hides the decorative skeleton", () => {
    render(<PageLoader />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading page…");
    expect(screen.getByTestId("page-loader-progress")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("page-loader-skeleton")).toHaveAttribute("aria-hidden", "true");
  });

  it("centres the brand loader in the main panel over the skeleton (click-through), announcing once", () => {
    render(<PageLoader />);

    const brand = screen.getByTestId("page-loader-brand");
    expect(brand).toHaveAttribute("aria-hidden", "true");
    expect(brand).toHaveClass("pointer-events-none", "sticky");
    expect(brand.querySelector(".brand-loader-stage")).not.toBeNull();
    expect(screen.getByTestId("page-loader-skeleton")).toHaveClass("page-loader-skeleton-in");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("renders a compact variant for the self-service portal", () => {
    render(<PageLoader variant="compact" label="Loading your clock…" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your clock…");
    expect(screen.queryByTestId("page-loader-table")).not.toBeInTheDocument();
  });
});
