const DAY_MS = 86_400_000;

type ReviewLike = { employeeId: { toString(): string }; status: string; ratingCode?: string | null };

/**
 * Where a review cycle stands: how much of the current staff has a review,
 * how many are submitted, who's still missing, how ratings spread, and how
 * long is left in the period.
 */
export function summarizeReviewCycle(input: { staffIds: string[]; reviews: ReviewLike[]; ratings: { code: string; name: string }[]; periodEnd: Date; now: Date }) {
  const reviewedIds = new Set(input.reviews.map((review) => review.employeeId.toString()));
  const submitted = input.reviews.filter((review) => review.status === "submitted");
  const staffReviewed = input.staffIds.filter((id) => reviewedIds.has(id)).length;
  const countByRating = new Map<string, number>();
  for (const review of submitted) if (review.ratingCode) countByRating.set(review.ratingCode, (countByRating.get(review.ratingCode) ?? 0) + 1);

  return {
    staff: input.staffIds.length,
    /** Current staff with a review in this cycle (reviews of people since separated don't count toward coverage). */
    reviewed: staffReviewed,
    submitted: submitted.length,
    drafts: input.reviews.length - submitted.length,
    notReviewedIds: input.staffIds.filter((id) => !reviewedIds.has(id)),
    completion: input.staffIds.length ? Math.round((staffReviewed / input.staffIds.length) * 100) : 0,
    daysLeft: Math.max(0, Math.ceil((input.periodEnd.getTime() - input.now.getTime()) / DAY_MS)),
    distribution: input.ratings.map((rating) => ({ code: rating.code, name: rating.name, count: countByRating.get(rating.code) ?? 0 })),
  };
}
