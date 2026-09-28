/**
 * Pure helpers behind the dashboard: what needs someone's attention, the
 * greeting, the day's attendance split and the events coming up. The page
 * gathers the counts (each only when the user may see that module) and these
 * decide what to show and in which order.
 */

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export type AttentionKey =
  | "payrollApproved"
  | "payrollSubmitted"
  | "pendingLeave"
  | "payrollDrafts"
  | "contractsEnding"
  | "missingPayTerms"
  | "missingGovernmentIds"
  | "openCases";

/** A missing key means the queue doesn't apply to this user (no permission). */
export type AttentionCounts = Partial<Record<AttentionKey, number>>;

export type AttentionTone = "danger" | "warning" | "info";

export type AttentionItem = {
  key: AttentionKey;
  count: number;
  title: string;
  description: string;
  href: string;
  tone: AttentionTone;
};

// Listed most urgent first: pay that is ready to go out, then decisions
// people are waiting on, then records that would make the next payroll or a
// government filing wrong, then open cases. Today's attendance has its own
// panel on the dashboard, so it isn't repeated here.
const ATTENTION_QUEUES: Omit<AttentionItem, "count">[] = [
  { key: "payrollApproved", title: "Payroll to release", description: "Approved runs waiting to be paid and marked released.", href: "/payroll?status=approved", tone: "warning" },
  { key: "payrollSubmitted", title: "Payroll to approve", description: "Submitted runs waiting for an approver.", href: "/payroll?status=submitted", tone: "warning" },
  { key: "pendingLeave", title: "Leave requests to decide", description: "Approve or decline before the dates arrive.", href: "/leave?status=pending", tone: "warning" },
  { key: "payrollDrafts", title: "Payroll drafts", description: "Review, adjust and submit for approval.", href: "/payroll?status=draft", tone: "info" },
  { key: "contractsEnding", title: "Contracts ending soon", description: "End of contract within the next 30 days.", href: "/people", tone: "warning" },
  { key: "missingPayTerms", title: "Employees without pay terms", description: "They'll be left out of payroll until a rate is set.", href: "/payroll/compensation", tone: "danger" },
  { key: "missingGovernmentIds", title: "Incomplete government IDs", description: "Missing SSS, PhilHealth, Pag-IBIG or TIN numbers.", href: "/people", tone: "warning" },
  { key: "openCases", title: "Open cases", description: "Labor cases not yet closed or dismissed.", href: "/cases", tone: "info" },
];

export function buildAttentionItems(counts: AttentionCounts): AttentionItem[] {
  return ATTENTION_QUEUES.flatMap((queue) => {
    const count = counts[queue.key];
    return count ? [{ ...queue, count }] : [];
  });
}

export type AttendanceCounts = { present: number; late: number; absent: number; onLeave: number; notRecorded: number };

export type AttendanceSegment = { key: keyof AttendanceCounts; label: string; count: number; share: number };

const ATTENDANCE_SEGMENTS: { key: keyof AttendanceCounts; label: string }[] = [
  { key: "present", label: "Present" },
  { key: "late", label: "Late" },
  { key: "absent", label: "Absent" },
  { key: "onLeave", label: "On leave" },
  { key: "notRecorded", label: "Not recorded" },
];

/** The day's attendance as shares of everyone counted, in a fixed order, empty statuses dropped. */
export function attendanceSegments(counts: AttendanceCounts): AttendanceSegment[] {
  const total = ATTENDANCE_SEGMENTS.reduce((sum, segment) => sum + counts[segment.key], 0);
  if (total === 0) return [];
  return ATTENDANCE_SEGMENTS.filter((segment) => counts[segment.key] > 0).map((segment) => ({
    ...segment,
    count: counts[segment.key],
    share: Math.round((counts[segment.key] / total) * 100),
  }));
}

/** Active events on or after `todayKey` (YYYY-MM-DD), soonest first. */
export function upcomingEvents<T extends { date: Date; status?: string | null }>(events: T[], todayKey: string, limit: number): T[] {
  return events
    .filter((event) => event.status !== "cancelled" && new Date(event.date).toISOString().slice(0, 10) >= todayKey)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, limit);
}
