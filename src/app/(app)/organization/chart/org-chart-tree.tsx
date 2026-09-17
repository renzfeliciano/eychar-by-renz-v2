import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import type { OrgChartNode } from "@/domains/workforce/org-chart-service";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function NodeCard({ node }: { node: OrgChartNode }) {
  const secondary = [node.positionTitle, node.organizationUnitName, node.projectName].filter(Boolean).join(" · ");
  // Every node here is already active headcount (see OrgChartService) — a
  // plain "Active" badge on every single card would just be noise, so it
  // only shows up when the status is something worth calling out, like
  // "On Leave".
  const showStatus = Boolean(node.employmentStatus) && node.employmentStatus !== "active";

  return (
    <div className="inline-flex w-44 flex-col items-center gap-1 rounded-xl border bg-card p-3 text-center shadow-sm transition-shadow hover:shadow-md">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {initials(node.name)}
      </div>
      <Link href={`/people/${node.employeeId}`} className="text-sm font-semibold text-primary hover:underline">
        {node.name}
      </Link>
      {secondary && <p className="w-full truncate text-xs text-muted-foreground">{secondary}</p>}
      {showStatus && <StatusBadge status={node.employmentStatus} />}
    </div>
  );
}

/** Non-root branch: draws the connector lines up to its parent and sideways to its siblings, in pure Tailwind (no globals.css additions). */
function ChildBranch({ node }: { node: OrgChartNode }) {
  return (
    <li
      className="relative flex flex-col items-center px-4 pt-8
        before:absolute before:right-1/2 before:top-0 before:h-8 before:w-1/2 before:border-t before:border-r before:border-border
        after:absolute after:left-1/2 after:top-0 after:h-8 after:w-1/2 after:border-t after:border-l after:border-border
        first:before:border-transparent last:after:border-transparent
        only:before:border-transparent only:after:border-transparent"
    >
      <NodeCard node={node} />
      {node.children.length > 0 && (
        <ul className="relative mt-0 flex pt-8 before:absolute before:left-1/2 before:top-0 before:h-8 before:w-px before:-translate-x-1/2 before:bg-border">
          {node.children.map((child) => (
            <ChildBranch key={child.employeeId} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

function RootBranch({ node }: { node: OrgChartNode }) {
  return (
    <li className="flex flex-col items-center px-4">
      <NodeCard node={node} />
      {node.children.length > 0 && (
        <ul className="relative mt-0 flex pt-8 before:absolute before:left-1/2 before:top-0 before:h-8 before:w-px before:-translate-x-1/2 before:bg-border">
          {node.children.map((child) => (
            <ChildBranch key={child.employeeId} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrgChartTree({ roots }: { roots: OrgChartNode[] }) {
  if (roots.length === 0) {
    return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No employees match these filters.</div>;
  }

  return (
    <div className="overflow-x-auto pb-4">
      <ul className="flex w-fit min-w-full justify-center">
        {roots.map((root) => (
          <RootBranch key={root.employeeId} node={root} />
        ))}
      </ul>
    </div>
  );
}
