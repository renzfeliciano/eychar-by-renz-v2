export const CLEARANCE_STATUS_LABELS: Record<string, string> = { in_clearance: "In clearance", cleared: "Cleared", cancelled: "Cancelled", closed: "Closed" };
export const CLEARANCE_STATUS_TONES: Record<string, "warning" | "success" | "neutral"> = { in_clearance: "warning", cleared: "success", cancelled: "neutral", closed: "neutral" };
export const ITEM_STATUS_LABELS: Record<string, string> = { pending: "Pending", cleared: "Cleared", flagged: "Flagged", waived: "Waived", not_applicable: "Not applicable" };
export const ITEM_STATUS_TONES: Record<string, "warning" | "success" | "danger" | "info" | "neutral"> = {
  pending: "warning",
  cleared: "success",
  flagged: "danger",
  waived: "info",
  not_applicable: "neutral",
};
