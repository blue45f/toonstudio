import { createHash } from "node:crypto";
import { canonicalJson, isoTimestampSchema, scopeRefSchema, sha256Schema, studioEntityIdSchema } from "@toonstudio/studio-project-model";
import { z } from "zod";

export const studioReviewCaptureSourceRevisionSchema = z.object({
  artifactId: studioEntityIdSchema, revisionId: studioEntityIdSchema, rootGraphHash: sha256Schema,
}).strict();
export const studioReviewAttestedSourceRevisionSchema = studioReviewCaptureSourceRevisionSchema.extend({ scope: scopeRefSchema });
export type StudioReviewAttestedSourceRevision = z.infer<typeof studioReviewAttestedSourceRevisionSchema>;

export const studioReviewPreviewCaptureSchema = z.object({
  intentId: studioEntityIdSchema,
  workId: studioEntityIdSchema,
  sourceServerRevision: z.number().int().positive().max(2_147_483_647),
  /** SHA-256 of canonicalJson(the exact saved CreatorWork.doc). */
  sourceContentDigest: sha256Schema,
  pageCount: z.number().int().positive().max(100_000),
  title: z.string().trim().min(1).max(240),
  deviceId: studioEntityIdSchema,
  createdAt: isoTimestampSchema,
  sourceRevision: studioReviewCaptureSourceRevisionSchema.optional(),
}).strict();
export const studioReviewPreviewIntentSchema = studioReviewPreviewCaptureSchema.extend({
  projectId: studioEntityIdSchema, artifactId: studioEntityIdSchema,
  expectedHeadRevisionId: studioEntityIdSchema,
  expectedHeadRootGraphHash: sha256Schema,
  sourceRevisionScope: scopeRefSchema.optional(),
}).strict().superRefine((intent, context) => {
  if (Boolean(intent.sourceRevision) !== Boolean(intent.sourceRevisionScope)
    || (intent.sourceRevisionScope && intent.sourceRevisionScope.projectId !== intent.projectId)
    || (intent.sourceRevision && intent.sourceRevision.rootGraphHash !== intent.sourceContentDigest)) {
    context.addIssue({ code: "custom", path: ["sourceRevision"], message: "원본 revision과 저장 원고의 식별·범위를 함께 고정해야 합니다." });
  }
});
export const studioReviewPreviewCompleteSchema = z.object({
  intent: studioReviewPreviewIntentSchema,
  pages: z.array(z.object({ ordinal: z.number().int().nonnegative().max(99_999), sha256: sha256Schema }).strict()).min(1).max(100_000),
}).strict().superRefine(({ intent, pages }, context) => {
  if (pages.length !== intent.pageCount || pages.some((page, i) => page.ordinal !== i)
    || new Set(pages.map((page) => page.sha256)).size !== pages.length) {
    context.addIssue({ code: "custom", path: ["pages"], message: "Every captured page must appear exactly once in source order" });
  }
});
export type StudioReviewPreviewCapture = z.infer<typeof studioReviewPreviewCaptureSchema>;
export type StudioReviewPreviewIntent = z.infer<typeof studioReviewPreviewIntentSchema>;
export type StudioReviewPreviewComplete = z.infer<typeof studioReviewPreviewCompleteSchema>;

export function studioReviewPreviewDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export function studioReviewPreviewIntentKey(actorUserId: string, intent: StudioReviewPreviewIntent): string {
  return studioReviewPreviewDigest({ actorUserId, workId: intent.workId, intentId: intent.intentId });
}
export function studioReviewPreviewPageAsset(key: string, ordinal: number): string {
  return `review-preview-${key}-${ordinal}`;
}
