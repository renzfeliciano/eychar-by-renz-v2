"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./table-constants";

/**
 * The scrolling frame every DataTable sits in: at most about 10 rows tall on
 * tablet and desktop (the table scrolls inside itself, the header stays
 * pinned), and paged in the browser when the page doesn't page it on the
 * server (`serverFooter`). Rows arrive already rendered from the server.
 */
export function DataTableFrame({
  head,
  rows,
  serverFooter,
  tableClassName,
  bodyClassName,
  testId = "data-table",
}: {
  head: React.ReactNode;
  rows: React.ReactNode[];
  /** The server page's own pagination footer; when absent, rows are paged here. */
  serverFooter?: React.ReactNode;
  tableClassName?: string;
  bodyClassName?: string;
  testId?: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const clientPaged = !serverFooter;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const visible = clientPaged ? rows.slice((current - 1) * pageSize, current * pageSize) : rows;

  return (
    <>
      <Table className={tableClassName} containerClassName="md:max-h-[31rem] md:overflow-y-auto" data-testid={testId}>
        {head}
        <TableBody className={bodyClassName}>{visible}</TableBody>
      </Table>
      {serverFooter}
      {clientPaged && total > DEFAULT_PAGE_SIZE && (
        <ClientPaginationFooter
          page={current}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </>
  );
}

function ClientPaginationFooter({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pager = "flex size-10 items-center justify-center rounded-md border md:size-8 disabled:pointer-events-none disabled:opacity-40 hover:bg-muted";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 text-sm text-muted-foreground" data-testid="data-table-pagination">
      <span>
        Showing <span className="font-medium text-foreground">{start}</span>–<span className="font-medium text-foreground">{end}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1">
          Rows per page
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onPageSize(size)}
              aria-pressed={size === pageSize}
              className={cn(
                "inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md px-1.5 tabular-nums md:min-h-7 md:min-w-7",
                size === pageSize ? "bg-primary/10 font-semibold text-primary" : "hover:text-foreground",
              )}
            >
              {size}
            </button>
          ))}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" className={pager} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-14 text-center tabular-nums" aria-live="polite">
            {page} / {totalPages}
          </span>
          <button type="button" className={pager} onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
