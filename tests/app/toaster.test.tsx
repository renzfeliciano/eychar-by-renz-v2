// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { Toaster, TOAST_DURATION_MS, TOAST_TOP_OFFSET } from "@/components/ui/sonner";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));

describe("Toaster (house style)", () => {
  it("shows typed toasts top-right, below the top bar, with a title, detail line, close button and a 6-second countdown", async () => {
    render(<Toaster />);

    act(() => {
      toast.success("Project added", { description: "Makati Tower is ready for assignments." });
      toast.error("Couldn't save", { description: "That code is already in use. Try another." });
    });

    const success = (await screen.findByText("Project added")).closest("[data-sonner-toast]")!;
    expect(success.getAttribute("data-type")).toBe("success");
    expect(success.className).toContain("app-toast");
    expect(success).toHaveTextContent("Makati Tower is ready for assignments.");
    expect(success.querySelector("[data-close-button]")).not.toBeNull();
    expect((await screen.findByText("Couldn't save")).closest("[data-sonner-toast]")?.getAttribute("data-type")).toBe("error");

    expect(document.querySelector("[data-sonner-toaster]")?.getAttribute("data-y-position")).toBe("top");
    expect(document.querySelector("[data-sonner-toaster]")?.getAttribute("data-x-position")).toBe("right");
    expect(TOAST_DURATION_MS).toBe(6000);
    // Below the 64px top bar, so it never covers the account menu.
    expect(TOAST_TOP_OFFSET).toBeGreaterThan(64);
    expect((document.querySelector("[data-sonner-toaster]") as HTMLElement).style.getPropertyValue("--offset-top")).toBe(`${TOAST_TOP_OFFSET}px`);
  });

  it("can carry an action such as Undo", async () => {
    const onUndo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success("Test Project is hidden", { description: "Only you can see it now.", action: { label: "Undo", onClick: onUndo } });
    });
    const undo = await screen.findByRole("button", { name: "Undo" });
    act(() => undo.click());
    expect(onUndo).toHaveBeenCalled();
  });
});
