// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateNav } from "@/app/(app)/attendance/date-nav";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => vi.restoreAllMocks());

describe("DateNav", () => {
  it("follows the date in the URL without React/Base UI uncontrolled-input warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<DateNav date="2026-09-28" />);
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-28");

    // Navigating (a new date, or the browser's Back button) re-renders with a new prop.
    rerender(<DateNav date="2026-09-27" />);

    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-27");
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/uncontrolled|default value/i);
  });
});
