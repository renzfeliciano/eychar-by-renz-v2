import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from "@/components/ui/table";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
};

/**
 * A thin, generic wrapper over the shadcn Table primitives shared by every
 * list page (organization units/positions/locations/projects, people) —
 * each page supplies its own column definitions rather than a bespoke
 * `<table>` block repeated per page. `caption` is screen-reader-only (the
 * page's own visible heading already names the table for sighted users).
 */
export function DataTable<T extends { _id?: unknown; id?: unknown }>({
  columns,
  rows,
  getRowKey,
  emptyMessage,
  caption,
  testId,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage: string;
  caption?: string;
  testId?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground" role="status">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border shadow-[var(--shadow-soft)]" data-testid={testId}>
      <Table>
        {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
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
    </div>
  );
}
