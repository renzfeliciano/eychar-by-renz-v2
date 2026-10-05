import { PageLoader } from "@/components/shared/page-loader";
import { Bone, RecordHeaderSkeleton, StripSkeleton, TableSkeleton, TabsSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the review cycle…">
      <Bone className="h-4 w-36" />
      <RecordHeaderSkeleton avatar={false} actions={2} />
      <StripSkeleton columns={4} />
      <TabsSkeleton tabs={3} />
      <TableSkeleton rows={8} columns={5} avatar />
    </PageLoader>
  );
}
