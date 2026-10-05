import { PageLoader } from "@/components/shared/page-loader";
import { HeaderSkeleton, PanelSkeleton } from "@/components/shared/skeletons";

// Shaped like the page it stands in for, so nothing jumps when the data arrives.
export default function Loading() {
  return (
    <PageLoader label="Loading your dashboard…">
      <HeaderSkeleton actions={0} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <PanelSkeleton rows={5} action />
          <PanelSkeleton rows={3} action />
        </div>
        <div className="flex flex-col gap-5">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={5} />
        </div>
      </div>
    </PageLoader>
  );
}
