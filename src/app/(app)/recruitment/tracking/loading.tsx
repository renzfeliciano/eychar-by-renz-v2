import { PageLoader } from "@/components/shared/page-loader";
import { HeaderSkeleton, KanbanSkeleton, StripSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading applicants…">
      <HeaderSkeleton actions={1} />
      <StripSkeleton columns={4} />
      <KanbanSkeleton />
    </PageLoader>
  );
}
