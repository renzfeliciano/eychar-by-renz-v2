// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Link from "next/link";
import { DataTable, mobileRoleOf, type DataTableColumn } from "@/components/shared/data-table";

type Row = { id: string; name: string; code: string; status: string; notes: string };

const ROWS: Row[] = [
  { id: "1", name: "Ana Reyes", code: "E-001", status: "Active", notes: "Long note" },
  { id: "2", name: "Ben Cruz", code: "E-002", status: "On leave", notes: "" },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", sortKey: "name", render: (row) => <Link href={`/people/${row.id}`}>{row.name}</Link> },
  { key: "code", header: "Employee #", mobile: "subtitle", render: (row) => row.code },
  { key: "status", header: "Status", render: (row) => <span>{row.status}</span> },
  { key: "project", header: "Project", render: () => "Site A" },
  { key: "notes", header: "Notes", mobile: "hidden", render: (row) => row.notes },
  { key: "actions", header: "", render: (row) => <button type="button">Edit {row.name}</button> },
];

function renderTable(extra: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(<DataTable columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} emptyMessage="None" caption="People" {...extra} />);
}

describe("DataTable mobile cards", () => {
  it("defaults the first column to the card title, an empty header to actions, a status column to a badge and the rest to meta lines", () => {
    expect(COLUMNS.map((column, index) => mobileRoleOf(column, index))).toEqual(["title", "subtitle", "badge", "meta", "hidden", "actions"]);
  });

  it("renders each row once — the same cells restyled as a card below md, labelled for the key: value lines", () => {
    renderTable();
    const [first] = screen.getAllByTestId("data-table-row");
    expect(screen.getAllByTestId("data-table-row")).toHaveLength(2);
    // Nothing is rendered twice for the phone layout.
    expect(screen.getAllByText("Ana Reyes")).toHaveLength(1);
    expect(first.className).toMatch(/max-md:flex/);

    const cells = within(first).getAllByRole("cell");
    expect(cells.map((cell) => cell.getAttribute("data-mobile"))).toEqual(["title", "subtitle", "badge", "meta", "hidden", "actions"]);
    expect(cells[3]).toHaveAttribute("data-label", "Project");
    expect(cells[3].className).toMatch(/max-md:before:content-\[attr\(data-label\)\]/);
    expect(cells[4].className).toMatch(/max-md:hidden/);
    // The header row is replaced by the per-line labels on phones, kept at md+.
    expect(screen.getAllByRole("rowgroup")[0].className).toMatch(/max-md:hidden/);
  });

  it("keeps row links and actions clickable in the card layout", () => {
    renderTable();
    expect(screen.getByRole("link", { name: "Ana Reyes" })).toHaveAttribute("href", "/people/1");
    expect(screen.getByRole("button", { name: "Edit Ben Cruz" })).toBeInTheDocument();
  });

  it("moves sort toggles into a strip above the cards on phones, and gives pagination thumb-sized targets", () => {
    renderTable({
      sort: { sortBy: "name", sortDir: "asc", buildHref: (key) => `?sort=${key}` },
      pagination: { page: 1, pageSize: 10, total: 25, buildHref: (page, size) => `?page=${page}&size=${size ?? 10}` },
    });
    const strip = screen.getByTestId("data-table-mobile-sort");
    expect(strip.className).toMatch(/md:hidden/);
    const sortLink = within(strip).getByRole("link", { name: /Name/ });
    expect(sortLink).toHaveAttribute("href", "?sort=name");
    expect(sortLink.className).toMatch(/min-h-10/);

    for (const label of ["Previous page", "Next page"]) {
      expect(screen.getByRole("link", { name: label }).className).toMatch(/(^| )size-10( |$)/);
    }
    expect(screen.getByRole("link", { name: "25" }).className).toMatch(/min-h-10 min-w-10/);
  });
});
