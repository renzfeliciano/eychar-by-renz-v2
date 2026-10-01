// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SectionError } from "@/components/shared/section-error";

describe("SectionError", () => {
  it("explains what to do, shows the reference and retries", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = vi.fn();
    render(<SectionError error={Object.assign(new Error("boom"), { digest: "abc123" })} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't load");
    expect(screen.getByTestId("section-error-reference")).toHaveTextContent("abc123");
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
    fireEvent.click(screen.getByTestId("section-error-retry"));
    expect(reset).toHaveBeenCalled();
  });

  it("leaves out the reference when there isn't one", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<SectionError error={new Error("boom")} reset={() => undefined} homeHref="/clock" homeLabel="Back to clock-in" />);
    expect(screen.queryByTestId("section-error-reference")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to clock-in" })).toHaveAttribute("href", "/clock");
  });
});
