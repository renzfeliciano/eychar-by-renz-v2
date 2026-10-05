import { PageLoader } from "@/components/shared/page-loader";
import { FilterBarSkeleton, HeaderSkeleton, StripSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading clearances…">
      <HeaderSkeleton actions={2} />
      <StripSkeleton columns={4} />
      <FilterBarSkeleton segments={4} search={false} />
      <TableSkeleton rows={8} columns={5} />
    </PageLoader>
  );
}
