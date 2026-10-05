import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

// One status language across the app: a dot plus the word, so a status
// reads without relying on color. Waiting-on-someone states are amber,
// done/healthy green, blocked/negative red, in-progress blue.
const TONE_BY_STATUS: Record<string, Tone> = {
  active: "success",
  approved: "success",
  hired: "success",
  present: "success",
  released: "success",
  completed: "success",
  resolved: "success",
  on_leave: "warning",
  pending: "warning",
  submitted: "warning",
  ongoing: "warning",
  mediation: "warning",
  late: "warning",
  probationary: "warning",
  open: "info",
  in_progress: "info",
  scheduled: "info",
  draft: "neutral",
  inactive: "neutral",
  cancelled: "neutral",
  closed: "neutral",
  dismissed: "neutral",
  resigned: "neutral",
  terminated: "danger",
  rejected: "danger",
  absent: "danger",
  awol: "danger",
};

// Ledger style: no filled pill, just the colored dot and the word in ink.
// Only a negative state also colors its word, so it can't be skimmed past.
const TONE_CLASSES: Record<Tone, string> = {
  success: "text-foreground [--dot:var(--color-success)]",
  warning: "text-foreground [--dot:var(--color-warning)]",
  danger: "text-destructive [--dot:var(--color-destructive)]",
  info: "text-foreground [--dot:var(--color-primary)]",
  neutral: "text-muted-foreground [--dot:color-mix(in_oklch,var(--color-muted-foreground)_60%,transparent)]",
};

function labelFor(status: string): string {
  const words = status.replaceAll("_", " ").replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusBadge({ status, label, tone, className }: { status?: string | null; label?: string; tone?: Tone; className?: string }) {
  if (!status) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap",
        TONE_CLASSES[tone ?? TONE_BY_STATUS[status] ?? "neutral"],
        className,
      )}
    >
      <span className="size-2 shrink-0 rounded-full bg-(--dot)" aria-hidden="true" />
      {label ?? labelFor(status)}
    </span>
  );
}
