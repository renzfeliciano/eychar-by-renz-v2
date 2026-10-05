import { PageLoader } from "@/components/shared/page-loader";
import { CanvasSkeleton, HeaderSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the organization chart…">
      <HeaderSkeleton actions={0} />
      <CanvasSkeleton />
    </PageLoader>
  );
}
