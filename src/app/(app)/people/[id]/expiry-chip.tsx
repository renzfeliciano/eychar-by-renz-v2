import { Badge } from "@/components/ui/badge";
import { expiryStatus } from "@/domains/people/expiry-status";

/** "Expired" or "Expiring soon" beside a validity date; nothing for a date that is far off or missing. */
export function ExpiryChip({ validUntil, todayKey }: { validUntil: string | null | undefined; todayKey: string }) {
  const status = expiryStatus(validUntil, todayKey);
  if (status === "expired") return <Badge variant="destructive" data-testid="expiry-chip">Expired</Badge>;
  if (status === "expiring") return <Badge variant="outline" className="border-warning/40 text-warning" data-testid="expiry-chip">Expiring soon</Badge>;
  return null;
}
