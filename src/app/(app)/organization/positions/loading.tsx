import { PageLoader } from "@/components/shared/page-loader";
import { HeaderSkeleton, StripSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading positions…">
      <HeaderSkeleton actions={1} />
      <StripSkeleton columns={4} />
      <TableSkeleton rows={8} columns={4} />
    </PageLoader>
  );
}
