import { sha256Schema, studioEntityIdSchema } from "@toonstudio/studio-project-model";
import { z } from "zod";

/** 실제 Graph 캡처의 식별 계약이며 Production 작업이나 댓글 접근 권한을 부여하지 않는다. */
export const studioReviewCaptureSubjectSchema = z.object({
  schemaVersion: z.literal(1), projectId: studioEntityIdSchema, workId: studioEntityIdSchema,
  artifactId: studioEntityIdSchema, reviewId: studioEntityIdSchema, revisionId: studioEntityIdSchema,
  rootGraphHash: sha256Schema,
}).strict();

export type StudioReviewCaptureSubject = z.infer<typeof studioReviewCaptureSubjectSchema>;
