import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";

type RecentHire = {
  employeeId: string;
  name: string;
  dateHired: Date;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function RecentHiresList({ hires }: { hires: RecentHire[] }) {
  if (hires.length === 0) return <EmptyState title="No recent hires" description="New employees will show up here as they're added." />;

  return (
    <ul className="flex flex-col gap-3">
      {hires.map((hire) => (
        <li key={hire.employeeId}>
          <Link href={`/people/${hire.employeeId}`} className="flex items-center gap-3 rounded-lg p-1 -m-1 transition-colors hover:bg-accent/40">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-primary/10 text-xs font-semibold text-primary">
              {initials(hire.name)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{hire.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {hire.dateHired.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
