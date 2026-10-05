import { PageLoader } from "@/components/shared/page-loader";
import { CalendarSkeleton, HeaderSkeleton, StripSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the company calendar…">
      <HeaderSkeleton actions={0} />
      <StripSkeleton columns={3} />
      <CalendarSkeleton />
    </PageLoader>
  );
}
