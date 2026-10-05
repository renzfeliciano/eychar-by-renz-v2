import { PageLoader } from "@/components/shared/page-loader";
import { Bone } from "@/components/shared/skeletons";

// The centered card this page shows, while it loads.
export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <PageLoader label="Loading…">
          <div className="flex flex-col gap-5 rounded-lg border bg-card p-6">
            <div className="flex items-center gap-3">
              <Bone className="size-9 rounded-lg" />
              <Bone className="h-4 w-32" />
            </div>
            <div className="flex flex-col gap-2">
              <Bone className="h-6 w-56" />
              <Bone className="h-3.5 w-full" />
              <Bone className="h-3.5 w-3/4" />
            </div>
            <Bone className="mx-auto size-44 rounded-lg" />
            <div className="flex flex-col gap-2">
              <Bone className="h-3.5 w-28" />
              <Bone className="h-10 w-full rounded-lg" />
            </div>
            <Bone className="h-10 w-full rounded-lg" />
          </div>
        </PageLoader>
      </div>
    </main>
  );
}
