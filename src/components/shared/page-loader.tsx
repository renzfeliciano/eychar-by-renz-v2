import { cn } from "@/lib/utils";

function Bone({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

/**
 * Route-level loading state (used by loading.tsx): an indeterminate progress
 * bar pinned to the top of the viewport plus a skeleton shaped like the
 * standard page — header, metric strip, table — so content settles into
 * place instead of popping in. Announced once as a single status.
 * `detail` is shaped like a record page (profile, payroll run, clearance,
 * settlement): identity header, tab strip, a main card beside a side card.
 */
export function PageLoader({ variant = "page", label = "Loading page…" }: { variant?: "page" | "compact" | "detail"; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="relative">
      <span className="sr-only">{label}</span>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15" aria-hidden="true" data-testid="page-loader-progress">
        <div className="page-loader-bar h-full w-1/3 rounded-full bg-primary" />
      </div>

      <div aria-hidden="true" data-testid="page-loader-skeleton" className="flex flex-col gap-6">
        {variant === "detail" ? (
          <DetailSkeleton />
        ) : variant === "compact" ? (
          <>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="h-1 bg-primary/40" />
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
            <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
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
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-2.5">
                <Bone className="h-7 w-56" />
                <Bone className="h-4 w-80 max-w-[70vw]" />
              </div>
              <Bone className="h-9 w-32" />
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <Bone className="h-3.5 w-20" />
                    <Bone className="size-8 rounded-lg" />
                  </div>
                  <Bone className="h-7 w-16" />
                  <Bone className="h-3 w-28" />
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border bg-card" data-testid="page-loader-table">
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <Bone className="h-8 w-60 max-w-[50vw]" />
                <Bone className="ml-auto h-8 w-24" />
              </div>
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
                  <Bone className="size-8 shrink-0 rounded-full" />
                  <Bone className="h-3.5 w-40" />
                  <Bone className="hidden h-3.5 w-28 sm:block" />
                  <Bone className="ml-auto h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div data-testid="page-loader-detail" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Bone className="size-14 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Bone className="h-7 w-56 max-w-full" />
          <div className="flex flex-wrap gap-2">
            <Bone className="h-5 w-20 rounded-full" />
            <Bone className="h-5 w-28 rounded-full" />
          </div>
        </div>
        <Bone className="h-9 w-28" />
      </div>
      <div className="flex gap-4 overflow-hidden border-b pb-2.5">
        {[0, 1, 2, 3, 4].map((tab) => (
          <Bone key={tab} className="h-4 w-20 shrink-0" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 lg:col-span-2">
          <Bone className="h-4 w-32" />
          {[0, 1, 2, 3, 4, 5].map((line) => (
            <div key={line} className="flex items-center justify-between gap-4">
              <Bone className="h-3.5 w-28" />
              <Bone className="h-3.5 w-40 max-w-[45%]" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <Bone className="h-4 w-24" />
          <Bone className="h-10 w-full rounded-lg" />
          <Bone className="h-3.5 w-3/4" />
          <Bone className="h-3.5 w-1/2" />
        </div>
      </div>
    </div>
  );
}
