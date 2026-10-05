import { PageLoader } from "@/components/shared/page-loader";
import { FilterBarSkeleton, HeaderSkeleton, StripSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading roles and access…">
      <HeaderSkeleton actions={2} />
      <StripSkeleton columns={4} />
      <TableSkeleton rows={5} columns={4} />
      <FilterBarSkeleton search />
      <TableSkeleton rows={6} columns={5} avatar />
    </PageLoader>
  );
}
