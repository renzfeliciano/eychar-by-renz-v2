import { PageLoader } from "@/components/shared/page-loader";
import { FilterBarSkeleton, HeaderSkeleton, StripSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading payroll runs…">
      <HeaderSkeleton actions={1} />
      <StripSkeleton columns={4} />
      <FilterBarSkeleton segments={5} search={false} />
      <TableSkeleton rows={8} columns={7} />
    </PageLoader>
  );
}
