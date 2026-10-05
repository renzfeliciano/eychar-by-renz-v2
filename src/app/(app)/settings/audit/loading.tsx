import { PageLoader } from "@/components/shared/page-loader";
import { FilterBarSkeleton, HeaderSkeleton, StripSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the audit log…">
      <HeaderSkeleton actions={0} />
      <StripSkeleton columns={4} />
      <FilterBarSkeleton segments={0} search={true} selects={3} />
      <TableSkeleton rows={10} columns={5} />
    </PageLoader>
  );
}
