import { z } from "zod";

import { api } from "@/platform/api";

const assignedReviewersSchema = z
  .object({
    id: z.string(),
    reviewerIds: z.array(z.string()),
  })
  .strict();

export async function assignStudioReviewers(
  reviewId: string,
  reviewerIds: readonly string[],
): Promise<{ readonly id: string; readonly reviewerIds: readonly string[] }> {
  const body = await api.post<unknown>(
    `/studio-project-graph/reviews/${encodeURIComponent(reviewId)}/reviewers`,
    { reviewerIds },
  );
  return assignedReviewersSchema.parse(body);
}
