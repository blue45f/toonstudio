import { sha256Schema, studioEntityIdSchema } from "@toonstudio/studio-project-model";
import { z } from "zod";

export const studioReviewCaptureSourceRevisionSchema = z.object({
  artifactId: studioEntityIdSchema, revisionId: studioEntityIdSchema, rootGraphHash: sha256Schema,
}).strict();
export type StudioReviewCaptureSourceRevision = z.infer<typeof studioReviewCaptureSourceRevisionSchema>;
export interface StudioReviewCaptureSourceRequest {
  readonly sourceRevision: StudioReviewCaptureSourceRevision;
  readonly returnContext: { readonly projectId: string; readonly taskId: string } | null;
}

/** 원본 정본 식별자만 전달한다. URL·원고·서명 값은 전달하지 않는다. */
export function studioReviewCaptureSourceHref(workId: string, source: StudioReviewCaptureSourceRevision,
  returnContext: StudioReviewCaptureSourceRequest["returnContext"] = null): string {
  const parsed = studioReviewCaptureSourceRevisionSchema.parse(source);
  const query = new URLSearchParams({ captureArtifact: parsed.artifactId, captureRevision: parsed.revisionId,
    captureDigest: parsed.rootGraphHash, artifact: parsed.artifactId });
  if (returnContext) {
    query.set("captureProductionProject", studioEntityIdSchema.parse(returnContext.projectId));
    query.set("captureProductionTask", studioEntityIdSchema.parse(returnContext.taskId));
  }
  return `/studio/work/${encodeURIComponent(studioEntityIdSchema.parse(workId))}/canvas?${query}`;
}

export function studioReviewCaptureSourceFromSearch(search: string): StudioReviewCaptureSourceRequest | null {
  const query = new URLSearchParams(search);
  const keys = ["captureArtifact", "captureRevision", "captureDigest"];
  if (keys.some((key) => query.getAll(key).length !== 1)) return null;
  const source = studioReviewCaptureSourceRevisionSchema.safeParse({ artifactId: query.get("captureArtifact"),
    revisionId: query.get("captureRevision"), rootGraphHash: query.get("captureDigest") });
  if (!source.success) return null;
  const projectId = query.getAll("captureProductionProject"), taskId = query.getAll("captureProductionTask");
  if (projectId.length > 1 || taskId.length > 1) return null;
  const target = z.object({ projectId: studioEntityIdSchema, taskId: studioEntityIdSchema }).safeParse({ projectId: projectId[0], taskId: taskId[0] });
  if ((projectId.length || taskId.length) && !target.success) return null;
  return { sourceRevision: source.data, returnContext: target.success ? target.data : null };
}

export function studioReviewCaptureSourceReturnHref(request: StudioReviewCaptureSourceRequest): string | null {
  return request.returnContext ? `/production/projects/${encodeURIComponent(request.returnContext.projectId)}/review?task=${encodeURIComponent(request.returnContext.taskId)}` : null;
}
