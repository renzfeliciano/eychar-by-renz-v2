// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SearchableMultiSelect } from "@/components/shared/searchable-multi-select";

afterEach(cleanup);

const options = [
  { id: "1", label: "Juan Dela Cruz" },
  { id: "2", label: "Maria Santos" },
  { id: "3", label: "Maria Cruz" },
];

function setup(values: string[] = []) {
  const onChange = vi.fn();
  render(<SearchableMultiSelect label="Employees" values={values} onChange={onChange} options={options} placeholder="Search by name…" />);
  return { onChange, input: screen.getByPlaceholderText("Search by name…") as HTMLInputElement };
}

describe("SearchableMultiSelect", () => {
  it("lists everyone until something is typed", () => {
    setup();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("narrows as you type, matching every word in any order, like the single-select", () => {
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

  it("adds a person on click and removes them on a second click, keeping the others", () => {
    const { onChange } = setup(["1"]);
    fireEvent.click(screen.getByText("Maria Santos"));
    expect(onChange).toHaveBeenLastCalledWith(["1", "2"]);
    fireEvent.click(screen.getByText("Juan Dela Cruz"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("marks chosen rows, and says how many are chosen", () => {
    setup(["1", "3"]);
    const selected = screen.getAllByRole("option").filter((option) => option.getAttribute("aria-selected") === "true");
    expect(selected.map((option) => option.textContent)).toEqual(["Juan Dela Cruz", "Maria Cruz"]);
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("counts people who are chosen but filtered out of view", () => {
    const { input } = setup(["1"]);
    fireEvent.change(input, { target: { value: "santos" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("toggles on Enter when only one person matches, and does nothing when several do", () => {
    const { input, onChange } = setup();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "juan" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(["1"]);
  });

  it("clears everyone with one button, shown only when someone is chosen", () => {
    const { onChange } = setup(["1", "2"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    cleanup();
    setup([]);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("shows the empty message for an empty list", () => {
    render(<SearchableMultiSelect label="Employees" values={[]} onChange={() => {}} options={[]} emptyMessage="No employees yet." />);
    expect(screen.getByText("No employees yet.")).toBeTruthy();
  });

  it("is a multi-select list for assistive technology", () => {
    setup();
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
  });
});
