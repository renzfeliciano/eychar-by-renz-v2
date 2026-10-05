import { PageLoader } from "@/components/shared/page-loader";
import { Bone, CardSkeleton, RecordHeaderSkeleton, StripSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the clearance…">
      <Bone className="h-4 w-28" />
      <RecordHeaderSkeleton actions={1} />
      <StripSkeleton columns={4} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <CardSkeleton lines={7} className="lg:col-span-2" />
        <CardSkeleton lines={4} />
      </div>
    </PageLoader>
  );
}
