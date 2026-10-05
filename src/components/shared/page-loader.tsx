import { Bone, CardSkeleton, HeaderSkeleton, RecordHeaderSkeleton, StripSkeleton, TableSkeleton, TabsSkeleton } from "./skeletons";

/**
 * Route-level loading state (loading.tsx): an indeterminate progress bar
 * pinned to the top of the viewport plus a skeleton shaped like the page
 * that's coming, so content settles into place instead of popping in.
 * Announced once as a single status.
 *
 * Pass the page's own shape as children (built from ./skeletons); without
 * children a variant is drawn: `page` (header, figures, table), `detail`
 * (a record: identity, tabs, a main card beside a side card) or `compact`
 * (the self-service portal).
 */
export function PageLoader({ variant = "page", label = "Loading page…", children }: { variant?: "page" | "compact" | "detail"; label?: string; children?: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="relative">
      <span className="sr-only">{label}</span>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15" aria-hidden="true" data-testid="page-loader-progress">
        <div className="page-loader-bar h-full w-1/3 rounded-full bg-primary" />
      </div>

      <div aria-hidden="true" data-testid="page-loader-skeleton" className="flex flex-col gap-6">
        {children ?? (variant === "detail" ? <DetailSkeleton /> : variant === "compact" ? <CompactSkeleton /> : <DefaultSkeleton />)}
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <StripSkeleton columns={4} />
      <TableSkeleton rows={6} columns={4} avatar testId="page-loader-table" />
    </>
  );
}

function DetailSkeleton() {
  return (
    <div data-testid="page-loader-detail" className="flex flex-col gap-6">
      <RecordHeaderSkeleton />
      <TabsSkeleton />
      <div className="grid gap-5 lg:grid-cols-3">
        <CardSkeleton lines={6} className="lg:col-span-2" />
        <CardSkeleton lines={3} />
      </div>
    </div>
  );
}

/** The clock-in portal: the shift card and the clock panel. */
function CompactSkeleton() {
  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-2.5 p-5">
          <Bone className="h-3 w-32" />
          <Bone className="h-6 w-52" />
          <Bone className="h-3.5 w-24" />
        </div>
        <div className="flex items-center gap-3 border-t px-5 py-3">
          <Bone className="size-9 rounded-lg" />
          <div className="flex flex-col gap-1.5">
            <Bone className="h-3 w-20" />
            <Bone className="h-3.5 w-36" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <Bone className="h-4 w-28" />
        <Bone className="h-3.5 w-44" />
        <Bone className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-2">
          <Bone className="h-14 rounded-lg" />
          <Bone className="h-14 rounded-lg" />
          <Bone className="h-14 rounded-lg" />
        </div>
      </div>
    </>
  );
}
