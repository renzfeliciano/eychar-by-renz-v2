import { PageLoader } from "@/components/shared/page-loader";
import { HeaderSkeleton, KanbanSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading complaints…">
      <HeaderSkeleton actions={1} />
      <KanbanSkeleton />
    </PageLoader>
  );
}
