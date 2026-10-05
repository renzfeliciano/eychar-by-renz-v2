import { PageLoader } from "@/components/shared/page-loader";
import { FilterBarSkeleton, HeaderSkeleton, StripSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the daily roster…">
      <HeaderSkeleton actions={1} />
      <StripSkeleton columns={5} />
      <FilterBarSkeleton segments={0} search={false} selects={1} />
      <TableSkeleton rows={8} columns={5} avatar />
    </PageLoader>
  );
}
