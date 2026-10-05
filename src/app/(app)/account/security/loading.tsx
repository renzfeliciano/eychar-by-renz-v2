import { PageLoader } from "@/components/shared/page-loader";
import { CardSkeleton, FormSkeleton, HeaderSkeleton, StripSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading your account…">
      <HeaderSkeleton actions={0} />
      <StripSkeleton columns={3} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <FormSkeleton fields={3} columns={1} />
        <CardSkeleton lines={4} />
      </div>
    </PageLoader>
  );
}
