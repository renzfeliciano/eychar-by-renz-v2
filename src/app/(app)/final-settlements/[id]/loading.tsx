import { PageLoader } from "@/components/shared/page-loader";
import { Bone, CardSkeleton, RecordHeaderSkeleton, StripSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the final settlement…">
      <Bone className="h-4 w-36" />
      <RecordHeaderSkeleton actions={2} />
      <StripSkeleton columns={4} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <CardSkeleton lines={8} className="lg:col-span-2" />
        <CardSkeleton lines={3} />
      </div>
    </PageLoader>
  );
}
