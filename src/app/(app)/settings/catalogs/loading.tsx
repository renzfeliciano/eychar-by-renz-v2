import { PageLoader } from "@/components/shared/page-loader";
import { Bone, HeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading catalogs…">
      <HeaderSkeleton actions={0} />
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="hidden flex-col gap-2 lg:flex">
          {Array.from({ length: 10 }, (_, index) => (
            <Bone key={index} className="h-4 w-36" />
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <TableSkeleton rows={5} columns={4} />
          <TableSkeleton rows={4} columns={4} />
        </div>
      </div>
    </PageLoader>
  );
}
