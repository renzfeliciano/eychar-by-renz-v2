import { PageLoader } from "@/components/shared/page-loader";
import { Bone, FilterBarSkeleton, RecordHeaderSkeleton, StripSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the payroll run…">
      <Bone className="h-4 w-32" />
      <RecordHeaderSkeleton avatar={false} actions={2} />
      <StripSkeleton columns={5} />
      <FilterBarSkeleton search />
      <TableSkeleton rows={8} columns={7} avatar />
    </PageLoader>
  );
}
