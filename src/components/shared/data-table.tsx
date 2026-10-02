import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { TableHeader, TableRow, TableHead, TableCell, TableCaption } from "@/components/ui/table";
import { DataTableFrame } from "./data-table-frame";
import { PAGE_SIZE_OPTIONS } from "./table-constants";
import { TruncatedCell } from "./truncated-cell";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Set to make this column's header a sort toggle — requires `sort` on DataTable itself. */
  sortKey?: string;
  /**
   * Standard column width (the house rule: no bespoke pixel widths). Long
   * text is cut with an ellipsis at this width and shown in full on hover.
   * Defaults: the first column `fill` (takes the spare room), an actions
   * column (empty header) `auto`, everything else `md`.
   */
  width?: DataTableColumnWidth;
  /** Set false for content that must never be cut (badges, buttons, multi-line cells). */
  truncate?: boolean;
  /**
   * Where this column goes when the table collapses into stacked cards below
   * the md breakpoint (phones). Defaults: the first column is the card's
   * `title`, a column with an empty header is its `actions`,
   * a "…Status" column is a `badge` beside the title, and everything else
   * is a labelled `meta` line. Use `hidden` for columns that only make sense
   * side by side (long ids, secondary dates) and `subtitle` for a muted
   * second line under the title (a code, an employee number).
   */
  mobile?: DataTableMobileRole;
};

export type DataTableMobileRole = "title" | "subtitle" | "badge" | "meta" | "actions" | "hidden";

export type DataTableColumnWidth = "xs" | "sm" | "md" | "lg" | "xl" | "fill" | "auto";

// md and up (phones stack rows as cards). A sized column shrinks to its
// content and cuts it (ellipsis + tooltip) at its standard maximum; the "fill"
// column takes whatever room is left and cuts only when it truly runs out
// (max-w-0 + w-full); "auto" hugs its content (buttons).
const COLUMN_WIDTH: Record<DataTableColumnWidth, { head: string; cell: string; content: string }> = {
  xs: { head: "", cell: "", content: "md:max-w-20" },
  sm: { head: "", cell: "", content: "md:max-w-32" },
  md: { head: "", cell: "", content: "md:max-w-48" },
  lg: { head: "", cell: "", content: "md:max-w-64" },
  xl: { head: "", cell: "", content: "md:max-w-96" },
  fill: { head: "md:w-full md:min-w-40", cell: "md:w-full md:max-w-0 md:min-w-40", content: "" },
  auto: { head: "md:w-px md:whitespace-nowrap", cell: "md:w-px md:whitespace-nowrap", content: "" },
};

/** The width a column gets (see `DataTableColumn.width`). */
export function widthOf<T>(column: DataTableColumn<T>, index: number): DataTableColumnWidth {
  if (column.width) return column.width;
  if (column.header.trim() === "") return "auto";
  return index === 0 ? "fill" : "md";
}

/** The role a column plays in the phone card layout (see `DataTableColumn.mobile`). */
export function mobileRoleOf<T>(column: DataTableColumn<T>, index: number): DataTableMobileRole {
  if (column.mobile) return column.mobile;
  if (index === 0) return "title";
  if (column.header.trim() === "") return "actions";
  if (/\bstatus$/i.test(column.header)) return "badge";
  return "meta";
}

// Below md each row is a card: title (+ badge) on top, then an optional
// subtitle, then "Label  value" lines, then the row's actions. It's the same
// <tr>/<td> DOM restyled — nothing renders twice, links stay links — and at
// md+ the classes fall away and it's a plain table again.
const MOBILE_CELL: Record<DataTableMobileRole, string> = {
  title: "max-md:static max-md:order-1 max-md:min-w-0 max-md:border-r-0 max-md:bg-transparent max-md:flex-1 max-md:basis-0 max-md:p-0 max-md:font-medium max-md:whitespace-normal",
  badge: "max-md:order-2 max-md:shrink-0 max-md:p-0",
  subtitle: "max-md:order-3 max-md:basis-full max-md:p-0 max-md:text-[13px] max-md:whitespace-normal max-md:text-muted-foreground",
  meta: "max-md:order-4 max-md:flex max-md:basis-full max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:p-0 max-md:text-[13px] max-md:whitespace-normal max-md:before:shrink-0 max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]",
  actions: "max-md:order-5 max-md:flex max-md:basis-full max-md:justify-end max-md:p-0 max-md:pt-1",
  hidden: "max-md:hidden",
};

export type DataTableSort = {
  sortBy?: string;
  sortDir: "asc" | "desc";
  buildHref: (sortKey: string) => string;
};

export type DataTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number, pageSize?: number) => string;
  pageSizeOptions?: number[];
};

/**
 * A thin, generic wrapper over the shadcn Table primitives shared by every
 * list page (organization units/positions/locations/projects, people) —
 * each page supplies its own column definitions rather than a bespoke
 * `<table>` block repeated per page. `caption` is screen-reader-only (the
 * page's own visible heading already names the table for sighted users).
 *
 * Every table follows the same standard (see DataTableFrame): a body about
 * 10 rows tall that scrolls inside itself under a pinned header, standard
 * column widths with ellipsis + tooltip, and pagination. Sorting and server
 * pagination are link-driven (URL searchParams) — the page filters, sorts and
 * slices its rows via `applyTableQuery` or the database. A table without
 * `pagination` is paged in the browser, 10 rows at a time.
 */
export function DataTable<T extends { _id?: unknown; id?: unknown }>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  emptyDescription,
  emptyAction,
  caption,
  testId,
  sort,
  pagination,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage: string;
  /** A line on what to do next, under the empty message. */
  emptyDescription?: string;
  /** The action that fills the table (e.g. the page's "Add" button). */
  emptyAction?: React.ReactNode;
  caption?: string;
  testId?: string;
  sort?: DataTableSort;
  pagination?: DataTablePagination;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center shadow-[var(--shadow-soft)]"
        role="status"
        data-testid={testId}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Inbox className="size-6" aria-hidden="true" />
        </div>
        <div className="flex max-w-md flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
          {emptyDescription && <p className="text-sm text-muted-foreground">{emptyDescription}</p>}
        </div>
        {emptyAction && <div className="mt-1">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-soft)]" data-testid={testId}>
      {sort && <MobileSortBar columns={columns} sort={sort} />}
      <DataTableFrame
        tableClassName="max-md:block"
        bodyClassName="max-md:block"
        serverFooter={pagination ? <PaginationFooter pagination={pagination} /> : undefined}
        head={
          <>
            {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
            {/* Pinned while the body scrolls; solid so rows don't show through. */}
            <TableHeader className="max-md:hidden md:sticky md:top-0 md:z-20 [&_th]:bg-muted">
              <TableRow className="hover:bg-transparent">
                {columns.map((column, index) => {
                  const width = widthOf(column, index);
                  return (
                    <TableHead
                      key={column.key}
                      className={cn("h-10 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase", COLUMN_WIDTH[width].head, column.className)}
                    >
                      {column.sortKey && sort ? (
                        <Link
                          href={sort.buildHref(column.sortKey)}
                          className="group/sort inline-flex items-center gap-1 hover:text-foreground"
                          aria-label={`Sort by ${column.header}${sort.sortBy === column.sortKey ? (sort.sortDir === "asc" ? ", ascending, click for descending" : ", descending, click for ascending") : ""}`}
                        >
                          {column.header}
                          {sort.sortBy === column.sortKey ? (
                            sort.sortDir === "asc" ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowDown className="size-3.5" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 text-muted-foreground/50 group-hover/sort:text-muted-foreground" />
                          )}
                        </Link>
                      ) : (
                        column.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
          </>
        }
        rows={rows.map((row) => (
          <TableRow
            key={getRowKey(row)}
            data-testid="data-table-row"
            className="max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-4 max-md:py-3.5"
          >
            {columns.map((column, index) => {
              const role = mobileRoleOf(column, index);
              const width = widthOf(column, index);
              const cut = column.truncate ?? (width !== "auto" && role !== "badge" && role !== "actions");
              const content = cut ? <TruncatedCell className={COLUMN_WIDTH[width].content}>{column.render(row)}</TruncatedCell> : column.render(row);
              return (
                <TableCell key={column.key} data-label={column.header} data-mobile={role} className={cn("px-3 py-2.5", COLUMN_WIDTH[width].cell, column.className, MOBILE_CELL[role])}>
                  {/* Right-aligned only in the phone card ("Label   value"); on desktop the column's own alignment applies. */}
                  {role === "meta" ? <div className="min-w-0 max-md:text-right md:contents">{content}</div> : content}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      />
    </div>
  );
}

function PaginationFooter({ pagination }: { pagination: DataTablePagination }) {
  const { page, pageSize, total, buildHref, pageSizeOptions = PAGE_SIZE_OPTIONS } = pagination;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      <span>
        Showing <span className="font-medium text-foreground">{start}</span>–<span className="font-medium text-foreground">{end}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1">
          Rows per page
          {pageSizeOptions.map((size) => (
            <Link
              key={size}
              href={buildHref(1, size)}
              className={cn(
                "inline-flex min-h-10 min-w-10 items-center justify-center rounded-md px-1.5 tabular-nums md:min-h-7 md:min-w-7",
                size === pageSize ? "bg-primary/10 font-semibold text-primary" : "hover:text-foreground",
              )}
              aria-current={size === pageSize ? "true" : undefined}
            >
              {size}
            </Link>
          ))}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={buildHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn("flex size-10 items-center justify-center rounded-md border md:size-8", page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted")}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-14 text-center tabular-nums">
            {page} / {totalPages}
          </span>
          <Link
            href={buildHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={cn("flex size-10 items-center justify-center rounded-md border md:size-8", page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-muted")}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Phones don't get the header row, so the sortable columns' toggles move to
 * a small strip above the cards.
 */
function MobileSortBar<T>({ columns, sort }: { columns: DataTableColumn<T>[]; sort: DataTableSort }) {
  const sortable = columns.filter((column) => column.sortKey);
  if (sortable.length === 0) return null;
  return (
    <nav aria-label="Sort" className="flex items-center gap-1 overflow-x-auto border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground md:hidden" data-testid="data-table-mobile-sort">
      <span className="shrink-0 pr-1 font-medium tracking-wide uppercase">Sort</span>
      {sortable.map((column) => {
        const active = sort.sortBy === column.sortKey;
        return (
          <Link
            key={column.key}
            href={sort.buildHref(column.sortKey!)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md px-2.5 whitespace-nowrap",
              active ? "bg-primary/10 font-semibold text-primary" : "hover:text-foreground",
            )}
          >
            {column.header}
            {active && (sort.sortDir === "asc" ? <ArrowUp className="size-3.5" aria-label="ascending" /> : <ArrowDown className="size-3.5" aria-label="descending" />)}
          </Link>
        );
      })}
    </nav>
  );
}
