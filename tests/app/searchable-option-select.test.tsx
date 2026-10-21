// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SearchableOptionSelect } from "@/components/shared/searchable-option-select";

afterEach(cleanup);

const options = [
  { id: "1", label: "Juan Dela Cruz" },
  { id: "2", label: "Maria Santos" },
  { id: "3", label: "Maria Cruz" },
];

function setup(value = "") {
  const onChange = vi.fn();
  render(<SearchableOptionSelect label="Employee" value={value} onChange={onChange} options={options} placeholder="Search by name…" />);
  return { onChange, input: screen.getByPlaceholderText("Search by name…") as HTMLInputElement };
}

describe("SearchableOptionSelect", () => {
  it("lists everyone until something is typed", () => {
    setup();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("narrows as you type, matching every word in any order", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "cruz maria" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Maria Cruz"]);
  });

  it("says so when nothing matches", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No match.")).toBeTruthy();
  });

  it("chooses on click, and on Enter when only one person matches", () => {
    const { input, onChange } = setup();
    fireEvent.click(screen.getByText("Maria Santos"));
    expect(onChange).toHaveBeenLastCalledWith("2");

    fireEvent.change(input, { target: { value: "juan" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("1");
  });

  it("marks the chosen row and clears it when clicked again", () => {
    const { onChange } = setup("2");
    const chosen = screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true");
    expect(chosen?.textContent).toBe("Maria Santos");
    fireEvent.click(screen.getByText("Maria Santos"));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
