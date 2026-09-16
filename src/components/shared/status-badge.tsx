import { cn } from "@/lib/utils";

const TONE_BY_STATUS: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  on_leave: "bg-warning/15 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
  terminated: "bg-destructive/10 text-destructive border-destructive/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-sm text-muted-foreground">—</span>;

  const tone = TONE_BY_STATUS[status] ?? "bg-muted text-muted-foreground border-border";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        tone,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
