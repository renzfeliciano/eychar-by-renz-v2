import { EmptyState } from "@/components/shared/empty-state";
import { PartyPopper } from "lucide-react";

type Celebrant = {
  employeeId: string;
  name: string;
  birthDate: Date;
  turningAge: number;
};

export function BirthdayList({ celebrants }: { celebrants: Celebrant[] }) {
  if (celebrants.length === 0) {
    return <EmptyState title="No birthdays this month" description="No one on record celebrates a birthday this month." />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {celebrants.map((celebrant) => (
        <li key={celebrant.employeeId} className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-events/12 text-events">
            <PartyPopper className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{celebrant.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            Turns {celebrant.turningAge} · {celebrant.birthDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </li>
      ))}
    </ul>
  );
}
