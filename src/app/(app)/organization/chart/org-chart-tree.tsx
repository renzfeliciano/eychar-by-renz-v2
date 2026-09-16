import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import type { OrgChartNode } from "@/domains/workforce/org-chart-service";

function NodeRow({ node, depth }: { node: OrgChartNode; depth: number }) {
  const secondary = [node.positionTitle, node.organizationUnitName, node.projectName].filter(Boolean).join(" · ");

  return (
    <li>
      <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/40" style={{ paddingLeft: depth * 20 + 8 }}>
        <StatusBadge status={node.employmentStatus} />
        <div className="min-w-0">
          <Link href={`/people/${node.employeeId}`} className="text-sm font-medium text-primary hover:underline">
            {node.name}
          </Link>
          {secondary && <p className="truncate text-xs text-muted-foreground">{secondary}</p>}
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <NodeRow key={child.employeeId} node={child} depth={depth + 1} />
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
    <ul className="flex flex-col gap-0.5">
      {roots.map((root) => (
        <NodeRow key={root.employeeId} node={root} depth={0} />
      ))}
    </ul>
  );
}
