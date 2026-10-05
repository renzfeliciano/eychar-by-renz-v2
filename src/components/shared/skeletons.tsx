import { cn } from "@/lib/utils";

/**
 * Skeleton pieces for route loading states (loading.tsx). Each page's
 * loading file assembles the pieces in the same order as the page itself,
 * so the real content lands where the placeholders were and nothing jumps.
 * Everything here is decorative: PageLoader wraps it in one aria-hidden
 * block and announces a single status line instead.
 */

export function Bone({ className }: { className?: string }) {
  return <div className={cn("rounded-[4px] bg-muted motion-safe:animate-pulse dark:bg-muted/80", className)} />;
}

/** Title, description and the page's action buttons, closed by the header rule. */
export function HeaderSkeleton({ actions = 1, description = true }: { actions?: number; description?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2.5">
        <Bone className="h-7 w-56 max-w-full" />
        {description && <Bone className="h-4 w-96 max-w-[85%]" />}
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, index) => (
            <Bone key={index} className={cn("h-8 rounded-lg", index === actions - 1 ? "w-32" : "w-24")} />
          ))}
        </div>
      )}
    </div>
  );
}

const STRIP_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

/** A MetricStrip: ruled cells with a label, a figure and a hint. */
export function StripSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className={cn("-mr-px -mb-px grid", STRIP_COLUMNS[columns] ?? STRIP_COLUMNS[4])}>
        {Array.from({ length: columns }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 border-r border-b px-4 py-3.5">
            <Bone className="h-3.5 w-24" />
            <Bone className="h-6 w-16" />
            <Bone className="h-3 w-32 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Status segments and/or a search box above a table. */
export function FilterBarSkeleton({ segments = 0, search = true, selects = 0 }: { segments?: number; search?: boolean; selects?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {segments > 0 && (
        <div className="flex gap-0.5 rounded-lg border bg-card p-0.5">
          {Array.from({ length: segments }, (_, index) => (
            <Bone key={index} className={cn("h-7 rounded-md", index === 0 ? "w-14" : "w-20")} />
          ))}
        </div>
      )}
      {Array.from({ length: selects }, (_, index) => (
        <Bone key={index} className="h-9 w-36 rounded-lg" />
      ))}
      {search && <Bone className="h-9 w-64 max-w-full rounded-lg sm:ml-auto" />}
    </div>
  );
}

const CELL_WIDTHS = ["w-40", "w-28", "w-24", "w-20", "w-32", "w-16", "w-24", "w-20"];

/** A DataTable: header row, ruled body rows, optional leading avatar. */
export function TableSkeleton({ rows = 8, columns = 5, avatar = false, testId }: { rows?: number; columns?: number; avatar?: boolean; testId?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card" data-testid={testId}>
      <div className="flex items-center gap-6 border-b bg-muted/60 px-4 py-2.5">
        {Array.from({ length: columns }, (_, index) => (
          <Bone key={index} className={cn("h-3 bg-foreground/[0.07]", index === 0 ? "w-24" : "w-16", index >= 3 && "max-sm:hidden")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-6 border-b border-rule px-4 py-3 last:border-b-0">
          {avatar && <Bone className="size-7 shrink-0 rounded-full" />}
          {Array.from({ length: columns }, (_, column) => (
            <Bone key={column} className={cn("h-3.5", CELL_WIDTHS[(column + row) % CELL_WIDTHS.length], column >= 3 && "max-sm:hidden", column === columns - 1 && "ml-auto w-16")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A Card with a title and some label/value lines. */
export function CardSkeleton({ lines = 4, title = true, className }: { lines?: number; title?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border bg-card p-5", className)}>
      {title && (
        <div className="flex flex-col gap-2">
          <Bone className="h-4 w-36" />
          <Bone className="h-3 w-56 max-w-full" />
        </div>
      )}
      {Array.from({ length: lines }, (_, line) => (
        <div key={line} className="flex items-center justify-between gap-4">
          <Bone className="h-3.5 w-28" />
          <Bone className={cn("h-3.5 max-w-[45%]", line % 2 ? "w-24" : "w-40")} />
        </div>
      ))}
    </div>
  );
}

/** A settings or create form: labelled fields in one or two columns and a save bar. */
export function FormSkeleton({ fields = 6, columns = 2, sections = 1 }: { fields?: number; columns?: 1 | 2; sections?: number }) {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: sections }, (_, section) => (
        <div key={section} className="flex flex-col gap-5 rounded-lg border bg-card p-5">
          <div className="flex flex-col gap-2 border-b pb-4">
            <Bone className="h-4 w-40" />
            <Bone className="h-3 w-72 max-w-full" />
          </div>
          <div className={cn("grid gap-x-5 gap-y-4", columns === 2 && "sm:grid-cols-2")}>
            {Array.from({ length: fields }, (_, field) => (
              <div key={field} className="flex flex-col gap-2">
                <Bone className="h-3.5 w-24" />
                <Bone className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Bone className="h-8 w-20 rounded-lg" />
        <Bone className="h-8 w-28 rounded-lg" />
      </div>
    </div>
  );
}

/** Underlined tabs (a record's sections or a module's screens). */
export function TabsSkeleton({ tabs = 5 }: { tabs?: number }) {
  return (
    <div className="flex gap-5 overflow-hidden border-b pb-3">
      {Array.from({ length: tabs }, (_, tab) => (
        <Bone key={tab} className={cn("h-4 shrink-0", tab % 2 ? "w-20" : "w-16")} />
      ))}
    </div>
  );
}

/** A record's identity line: avatar or mark, name, a few facts, an action. */
export function RecordHeaderSkeleton({ avatar = true, actions = 1 }: { avatar?: boolean; actions?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b pb-5">
      {avatar && <Bone className="size-14 shrink-0 rounded-full" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Bone className="h-3 w-24" />
        <Bone className="h-7 w-60 max-w-full" />
        <div className="flex flex-wrap gap-3">
          <Bone className="h-3.5 w-20" />
          <Bone className="h-3.5 w-28" />
          <Bone className="h-3.5 w-24" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, index) => (
          <Bone key={index} className="h-8 w-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** A month calendar: weekday heads and a 6-week grid with an entry or two per day. */
export function CalendarSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Bone className="h-5 w-36" />
        <div className="flex gap-2">
          <Bone className="size-8 rounded-lg" />
          <Bone className="h-8 w-16 rounded-lg" />
          <Bone className="size-8 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-7 border-b bg-muted/60">
        {Array.from({ length: 7 }, (_, day) => (
          <div key={day} className="px-2 py-2">
            <Bone className="h-3 w-8 bg-foreground/[0.07]" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }, (_, cell) => (
          <div key={cell} className="flex h-20 flex-col gap-1.5 border-r border-b border-rule p-2 sm:h-24 [&:nth-child(7n)]:border-r-0">
            <Bone className="h-3 w-4" />
            {cell % 5 === 1 && <Bone className="h-4 w-full max-w-24 rounded-sm" />}
            {cell % 9 === 3 && <Bone className="h-4 w-3/4 rounded-sm" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The monthly schedule grid: a name column and one narrow column per day. */
export function ScheduleGridSkeleton({ rows = 10, days = 14 }: { rows?: number; days?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex border-b bg-muted/60">
        <div className="w-44 shrink-0 border-r px-3 py-2.5">
          <Bone className="h-3 w-20 bg-foreground/[0.07]" />
        </div>
        {Array.from({ length: days }, (_, day) => (
          <div key={day} className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-rule py-2">
            <Bone className="h-2.5 w-5 bg-foreground/[0.07]" />
            <Bone className="h-3 w-4 bg-foreground/[0.07]" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex border-b border-rule last:border-b-0">
          <div className="flex w-44 shrink-0 flex-col gap-1.5 border-r px-3 py-2.5">
            <Bone className="h-3.5 w-28" />
            <Bone className="h-2.5 w-16" />
          </div>
          {Array.from({ length: days }, (_, day) => (
            <div key={day} className="flex w-14 shrink-0 items-center justify-center border-r border-rule p-1.5">
              {(row + day) % 7 < 5 && <Bone className="h-6 w-full rounded-sm" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The recruitment board: stage columns of applicant cards. */
export function KanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: columns }, (_, column) => (
        <div key={column} className="flex w-72 shrink-0 flex-col gap-2.5 rounded-lg border bg-muted/40 p-2.5">
          <div className="flex items-center justify-between px-1 py-1">
            <Bone className="h-4 w-24" />
            <Bone className="h-4 w-6" />
          </div>
          {Array.from({ length: 3 - (column % 2) }, (_, card) => (
            <div key={card} className="flex flex-col gap-2 rounded-md border bg-card p-3">
              <Bone className="h-3.5 w-36" />
              <Bone className="h-3 w-24" />
              <Bone className="h-3 w-16" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The org chart canvas: a toolbar over a framed drawing area with a small tree of cards. */
export function CanvasSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bone className="h-8 w-28 rounded-lg" />
        <Bone className="h-8 w-24 rounded-lg" />
        <Bone className="ml-auto h-8 w-32 rounded-lg" />
      </div>
      <div className="relative flex h-[60vh] min-h-96 flex-col items-center gap-10 overflow-hidden rounded-lg border bg-card bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:20px_20px] pt-12">
        <Bone className="h-16 w-52 rounded-md" />
        <div className="flex gap-8">
          <Bone className="h-16 w-44 rounded-md" />
          <Bone className="h-16 w-44 rounded-md" />
          <Bone className="h-16 w-44 rounded-md max-sm:hidden" />
        </div>
        <div className="flex gap-6">
          <Bone className="h-14 w-36 rounded-md" />
          <Bone className="h-14 w-36 rounded-md" />
          <Bone className="h-14 w-36 rounded-md max-md:hidden" />
          <Bone className="h-14 w-36 rounded-md max-md:hidden" />
        </div>
      </div>
    </div>
  );
}

/** A ruled panel with a heading and list rows (the dashboard's sections). */
export function PanelSkeleton({ rows = 4, action = false }: { rows?: number; action?: boolean }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-col gap-2 border-b px-5 pt-4 pb-3.5">
        <Bone className="h-4 w-40" />
        <Bone className="h-3 w-64 max-w-full" />
      </div>
      <div className="flex flex-col divide-y divide-rule px-5 py-1">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-3 py-3">
            <Bone className="size-2 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Bone className={cn("h-3.5", row % 2 ? "w-44" : "w-60", "max-w-full")} />
              <Bone className="h-3 w-32" />
            </div>
            {action && <Bone className="h-7 w-20 rounded-lg" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A printable document page (payslips): a letterhead block and ruled lines. */
export function DocumentSkeleton({ pages = 2 }: { pages?: number }) {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: pages }, (_, page) => (
        <div key={page} className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-lg border bg-card p-6">
          <div className="flex items-start justify-between gap-4 border-b pb-4">
            <div className="flex flex-col gap-2">
              <Bone className="h-5 w-48" />
              <Bone className="h-3 w-32" />
            </div>
            <Bone className="h-10 w-28" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {[0, 1].map((side) => (
              <div key={side} className="flex flex-col gap-2.5">
                <Bone className="h-3.5 w-24" />
                {[0, 1, 2, 3, 4].map((line) => (
                  <div key={line} className="flex justify-between">
                    <Bone className="h-3 w-28" />
                    <Bone className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t pt-4">
            <Bone className="h-4 w-20" />
            <Bone className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
