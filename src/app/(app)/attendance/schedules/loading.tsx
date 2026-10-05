import { PageLoader } from "@/components/shared/page-loader";
import { Bone, HeaderSkeleton, ScheduleGridSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading schedules…">
      <HeaderSkeleton actions={3} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bone className="h-9 w-60 rounded-lg" />
        <Bone className="h-8 w-28 rounded-lg" />
      </div>
      <ScheduleGridSkeleton />
    </PageLoader>
  );
}
