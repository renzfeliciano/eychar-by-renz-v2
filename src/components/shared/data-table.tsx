import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Set to make this column's header a sort toggle — requires `sort` on DataTable itself. */
  sortKey?: string;
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
 * Sorting and pagination are link-driven (URL searchParams), not client
 * state — the page itself filters/sorts/slices its rows server-side via
 * `applyTableQuery` before handing them to this component, matching the
 * searchParams-filter convention already used elsewhere in this app.
 */
export function DataTable<T extends { _id?: unknown; id?: unknown }>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  caption,
  testId,
  sort,
  pagination,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage: string;
  caption?: string;
  testId?: string;
  sort?: DataTableSort;
  pagination?: DataTablePagination;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-10 py-14 text-center shadow-[var(--shadow-soft)]"
        role="status"
        data-testid={testId}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
          <Inbox className="size-6" />
        </div>
        <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-soft)]" data-testid={testId}>
      <Table>
        {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
        <TableHeader className="bg-muted/40">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
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
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)} data-testid="data-table-row">
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pagination && <PaginationFooter pagination={pagination} />}
    </div>
  );
}

function PaginationFooter({ pagination }: { pagination: DataTablePagination }) {
  const { page, pageSize, total, buildHref, pageSizeOptions = [10, 25, 50] } = pagination;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      <span>
        Showing <span className="font-medium text-foreground">{start}</span>–<span className="font-medium text-foreground">{end}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </span>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          Rows per page
          {pageSizeOptions.map((size) => (
            <Link
              key={size}
              href={buildHref(1, size)}
              className={cn("rounded px-1.5 py-0.5 tabular-nums", size === pageSize ? "bg-primary/10 font-semibold text-primary" : "hover:text-foreground")}
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
            className={cn("flex size-7 items-center justify-center rounded-md border", page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted")}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Link>
          <span className="min-w-14 text-center tabular-nums">
            {page} / {totalPages}
          </span>
          <Link
            href={buildHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={cn("flex size-7 items-center justify-center rounded-md border", page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-muted")}
            aria-label="Next page"
          >
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
