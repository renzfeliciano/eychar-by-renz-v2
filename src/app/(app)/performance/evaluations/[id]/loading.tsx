import { PageLoader } from "@/components/shared/page-loader";
import { HeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <PageLoader label="Loading evaluation…">
      <HeaderSkeleton actions={1} />
      <TableSkeleton rows={10} columns={4} />
    </PageLoader>
  );
}
