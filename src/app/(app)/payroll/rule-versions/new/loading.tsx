import { PageLoader } from "@/components/shared/page-loader";
import { FormSkeleton, HeaderSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the rule editor…">
      <HeaderSkeleton actions={0} />
      <FormSkeleton fields={6} sections={2} />
    </PageLoader>
  );
}
