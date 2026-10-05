import { PageLoader } from "@/components/shared/page-loader";
import { Bone, CardSkeleton, HeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the rule version…">
      <Bone className="h-4 w-36" />
      <HeaderSkeleton actions={1} />
      <TableSkeleton rows={6} columns={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
    </PageLoader>
  );
}
