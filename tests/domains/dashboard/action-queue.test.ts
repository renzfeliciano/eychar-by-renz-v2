import { describe, it, expect } from "vitest";
import { collapseKind, daysBetween, rankActions, relativeDue, urgencyFor, type ActionItem } from "@/domains/dashboard/action-queue";

const item = (id: string, urgency: ActionItem["urgency"], dueKey?: string): ActionItem => ({ id, kind: "k", title: id, detail: "", href: "/", actionLabel: "Open", urgency, dueKey });

describe("dashboard action queue", () => {
  it("puts urgent items first, then the earliest due, then the rest", () => {
    const ranked = rankActions([item("later", "later"), item("soon-late", "soon", "2026-10-20"), item("now", "now", "2026-10-04"), item("soon-early", "soon", "2026-10-08")]);
    expect(ranked.map((row) => row.id)).toEqual(["now", "soon-early", "soon-late", "later"]);
  });

  it("decides urgency from how many days are left", () => {
    expect(urgencyFor("2026-10-03", "2026-10-05", 2, 7)).toBe("now");
    expect(urgencyFor("2026-10-03", "2026-10-01", 2, 7)).toBe("now"); // overdue
    expect(urgencyFor("2026-10-03", "2026-10-09", 2, 7)).toBe("soon");
    expect(urgencyFor("2026-10-03", "2026-11-01", 2, 7)).toBe("later");
    expect(urgencyFor("2026-10-03", undefined, 2, 7)).toBe("later");
  });

  it("says when in words", () => {
    expect(daysBetween("2026-10-03", "2026-10-10")).toBe(7);
    expect(relativeDue("2026-10-03", "2026-10-03")).toBe("today");
    expect(relativeDue("2026-10-03", "2026-10-04")).toBe("tomorrow");
    expect(relativeDue("2026-10-03", "2026-10-08")).toBe("in 5 days");
    expect(relativeDue("2026-10-03", "2026-10-01")).toBe("2 days ago");
  });

  it("collapses a long list of one kind into one summary row", () => {
    const many = Array.from({ length: 6 }, (_, index) => item(`p${index}`, "later"));
    expect(collapseKind(many, 3, (count) => item(`${count} people`, "later"))).toEqual([item("6 people", "later")]);
    expect(collapseKind(many.slice(0, 3), 3, () => item("x", "later"))).toHaveLength(3);
  });
});
