import { PageLoader } from "@/components/shared/page-loader";
import { Bone, DocumentSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading payslips…">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Bone className="h-4 w-32" />
          <Bone className="h-6 w-56" />
        </div>
        <Bone className="h-8 w-28 rounded-lg" />
      </div>
      <DocumentSkeleton />
    </PageLoader>
  );
}
