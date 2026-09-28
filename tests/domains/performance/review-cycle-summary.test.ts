import { describe, it, expect } from "vitest";
import { summarizeReviewCycle } from "@/domains/performance/review-cycle-summary";

const review = (employeeId: string, status: "draft" | "submitted", ratingCode?: string) => ({ employeeId: { toString: () => employeeId }, status, ratingCode });

describe("summarizeReviewCycle", () => {
  it("measures coverage against current staff, counts drafts and submissions, and spreads ratings in catalog order", () => {
    const summary = summarizeReviewCycle({
      staffIds: ["a", "b", "c", "d"],
      reviews: [review("a", "submitted", "exceeds"), review("b", "submitted", "meets"), review("c", "draft"), review("x", "submitted", "meets")],
      ratings: [
        { code: "exceeds", name: "Exceeds" },
        { code: "meets", name: "Meets" },
        { code: "below", name: "Below" },
      ],
      periodEnd: new Date("2026-10-08T00:00:00.000Z"),
      now: new Date("2026-09-28T00:00:00.000Z"),
    });

    expect(summary.reviewed).toBe(3);
    expect(summary.staff).toBe(4);
    expect(summary.submitted).toBe(3);
    expect(summary.drafts).toBe(1);
    expect(summary.notReviewedIds).toEqual(["d"]);
    expect(summary.completion).toBe(75);
    expect(summary.daysLeft).toBe(10);
    expect(summary.distribution).toEqual([
      { code: "exceeds", name: "Exceeds", count: 1 },
      { code: "meets", name: "Meets", count: 2 },
      { code: "below", name: "Below", count: 0 },
    ]);
  });

  it("reports an ended period and an empty cycle sensibly", () => {
    const summary = summarizeReviewCycle({ staffIds: [], reviews: [], ratings: [], periodEnd: new Date("2026-09-01"), now: new Date("2026-09-28") });
    expect(summary.daysLeft).toBe(0);
    expect(summary.completion).toBe(0);
  });
});
