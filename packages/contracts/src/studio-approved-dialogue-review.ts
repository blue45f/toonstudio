import { z } from "zod";

export const ApprovedDialoguePairSchema = z.object({
  approvedDialogue: z.string().max(2_000),
  currentDialogue: z.string().max(2_000),
}).strict().refine(
  (pair) => pair.approvedDialogue.trim() !== pair.currentDialogue.trim(),
  { message: "비교할 대사가 같습니다." },
);

export type ApprovedDialoguePair = z.infer<typeof ApprovedDialoguePairSchema>;

export const ApprovedDialogueFindingKind = z.enum(["negation", "deadline", "actor", "relationship", "other"]);

export const ApprovedDialogueReviewSchema = z.object({
  findings: z.array(z.object({
    kind: ApprovedDialogueFindingKind,
    approvedQuote: z.string().max(300),
    currentQuote: z.string().max(300),
    explanation: z.string().trim().min(1).max(260),
  }).strict()).max(6),
}).strict();

export type ApprovedDialogueReview = z.infer<typeof ApprovedDialogueReviewSchema>;

/** 대사 추가·삭제 때만 빈 쪽 인용을 허용하며, 공급자가 만들어 낸 인용을 버린다. */
export function parseGroundedDialogueReview(input: ApprovedDialoguePair, value: unknown): ApprovedDialogueReview | null {
  const review = ApprovedDialogueReviewSchema.safeParse(value);
  if (!review.success) return null;
  const matches = (dialogue: string, quote: string) =>
    dialogue.trim() ? quote.trim().length > 0 && dialogue.includes(quote) : quote === "";
  return review.data.findings.every((finding) =>
    matches(input.approvedDialogue, finding.approvedQuote) && matches(input.currentDialogue, finding.currentQuote),
  ) ? review.data : null;
}
