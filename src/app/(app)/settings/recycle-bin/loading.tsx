import { PageLoader } from "@/components/shared/page-loader";
import { HeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading the recycle bin…">
      <HeaderSkeleton actions={0} />
      <TableSkeleton rows={8} columns={5} />
    </PageLoader>
  );
}
