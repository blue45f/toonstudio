import { canonicalJson, scopeRefSchema } from "@toonstudio/studio-project-model";
import type { PoolClient } from "pg";

import { loadStudioReviewResolutionCaptures } from "./studio-review-capture-attestation";
import type { StudioReviewAttestedSourceRevision, StudioReviewPreviewCapture } from "./studio-review-preview-producer.contract";

/** 제출자가 붙인 회차 대신 같은 작품의 실제 원본 artifact 범위를 읽는다. */
export async function loadStudioReviewCaptureSourceRevision(client: PoolClient, input: StudioReviewPreviewCapture,
  projectId?: string, lock = false): Promise<StudioReviewAttestedSourceRevision | null> {
  const source = input.sourceRevision;
  if (!source || source.rootGraphHash !== input.sourceContentDigest) return null;
  const result = await client.query<{ projectId: string; workId: string; rootGraphHash: string; scope: unknown }>(
    `SELECT artifact."projectId", project."workId", revision."rootGraphHash", artifact.scope
     FROM studio_revision revision JOIN studio_artifact artifact ON artifact.id=revision."artifactId"
     JOIN studio_project_graph project ON project.id=artifact."projectId"
     WHERE revision.id=$1 AND artifact.id=$2${lock ? " FOR SHARE OF revision, artifact FOR KEY SHARE OF project" : ""}`, [source.revisionId, source.artifactId]);
  const row = result.rows[0], scope = scopeRefSchema.safeParse(row?.scope);
  if (!row || !scope.success || row.workId !== input.workId || row.rootGraphHash !== source.rootGraphHash
    || scope.data.projectId !== row.projectId || (projectId !== undefined && row.projectId !== projectId)) return null;
  return { ...source, scope: scope.data };
}

/** 완료 receipt·operation·불변 revision chain이 증명한 명시적 원본 연결만 내보낸다. */
export async function attachStudioReviewCaptureSources<T extends { readonly id: string }>(client: PoolClient,
  artifactId: string, reviews: readonly T[]): Promise<readonly (T & { readonly sourceRevision?: StudioReviewAttestedSourceRevision })[]> {
  if (reviews.length === 0) return Object.freeze([]);
  const captures = await loadStudioReviewResolutionCaptures(client, artifactId, reviews.map((review) => review.id), true);
  const sources = new Map<string, StudioReviewAttestedSourceRevision>();
  for (const capture of captures) {
    if (!capture?.sourceRevision || !capture.sourceRevisionScope || !capture.intent) continue;
    const current = await loadStudioReviewCaptureSourceRevision(client, {
      ...capture.intent, sourceRevision: capture.sourceRevision,
    }, capture.subject.projectId);
    if (current && canonicalJson(current.scope) === canonicalJson(capture.sourceRevisionScope)) sources.set(capture.subject.reviewId, current);
  }
  return Object.freeze(reviews.map((review) => {
    const sourceRevision = sources.get(review.id);
    return Object.freeze({ ...review, ...(sourceRevision ? { sourceRevision } : {}) });
  }));
}
