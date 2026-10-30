import {
  canonicalJson,
  reviewPenStrokesSchema,
  validateStudioReviewPenStrokes,
  validateStudioReviewSpatialAnchor,
  type ReviewPenStroke,
} from "@toonstudio/studio-project-model";
import type { PoolClient } from "pg";

import type { CreateStudioReviewComment } from "./studio-project-graph.dto";
import { studioReviewMappingFromOperation } from "./studio-review-source-map";

export interface StudioReviewCommentRecord {
  readonly id: string;
  readonly reviewId: string;
  readonly authorUserId: string | null;
  readonly anchor: Record<string, unknown>;
  readonly strokes: readonly ReviewPenStroke[];
  readonly body: string;
  readonly severity: "required" | "recommended" | "note";
  readonly status: "open" | "resolved" | "reopened" | "dismissed";
  readonly dueAt: string | null;
  readonly resolutionRevisionId: string | null;
  readonly resolvedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assigneeIds: readonly string[];
}

export type StudioReviewCommentRow = Omit<StudioReviewCommentRecord,
  "strokes" | "dueAt" | "createdAt" | "updatedAt"> & {
  strokes: unknown;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StudioReviewExistingCommentRow = Pick<StudioReviewCommentRow,
  "reviewId" | "authorUserId" | "body" | "severity" | "anchor" | "strokes" | "createdAt" | "assigneeIds"> & {
  dueAtMatches: boolean;
};

export function mapStudioReviewComment(row: StudioReviewCommentRow): StudioReviewCommentRecord {
  return Object.freeze({
    ...row,
    strokes: Object.freeze(reviewPenStrokesSchema.parse(row.strokes)),
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assigneeIds: Object.freeze([...row.assigneeIds]),
  });
}

/** 기존 무첨삭 요청과 빈 배열은 같지만, 작성자와 획 정본이 다른 요청은 재실행이 아니다. */
export function sameStudioReviewCommentMutation(current: StudioReviewExistingCommentRow, actorUserId: string,
  reviewId: string, input: CreateStudioReviewComment, anchor: CreateStudioReviewComment["anchor"], strokes: readonly ReviewPenStroke[]): boolean {
  return current.authorUserId === actorUserId && current.reviewId === reviewId
    && current.body === input.body && current.severity === input.severity && current.dueAtMatches
    && canonicalJson([...current.assigneeIds].sort()) === canonicalJson([...input.assigneeIds].sort())
    && canonicalJson(current.anchor) === canonicalJson(anchor)
    && canonicalJson(reviewPenStrokesSchema.parse(current.strokes)) === canonicalJson(strokes);
}

/** 호출자는 현재 comment ACL과 열린 review를 확인한다. mapping은 불변 캡처에서만 복구한다. */
export async function validateStudioReviewCommentSource(client: Pick<PoolClient, "query">,
  pin: { workId: string; projectId: string; artifactId: string; reviewId: string; revisionId: string },
  anchor: CreateStudioReviewComment["anchor"], strokes: readonly ReviewPenStroke[]): Promise<"valid" | "anchor-mismatch" | "strokes-mismatch"> {
  if (!anchor.source) return strokes.length ? "strokes-mismatch" : "valid";
  const source = await client.query<{ rootGraphHash: string; operation: unknown; hash: string; captureReceipt: unknown }>(
    `SELECT revision."rootGraphHash", capture.operation, ref."blobHash" AS hash,
       jsonb_build_object('actorUserId', receipt."actorUserId", 'idempotencyKeyHash', receipt."idempotencyKeyHash", 'response', receipt.response) AS "captureReceipt"
     FROM studio_revision revision
     JOIN studio_operation capture ON capture."artifactId" = revision."artifactId"
       AND capture."resultRevisionId" = revision.id AND capture.sequence = revision."operationLast"
       AND revision."operationFirst" = revision."operationLast" AND capture."commandType" = 'review.snapshot-create'
     JOIN studio_revision_blob ref ON ref."revisionId" = revision.id AND ref.role = 'preview' AND ref.ordinal = $3
     JOIN studio_mutation_receipt receipt ON receipt."artifactId"=revision."artifactId" AND receipt."resultRevisionId"=revision.id
       AND receipt.response->>'status'='completed' AND receipt.response->'subject'->>'reviewId'=$4
     WHERE revision.id = $1 AND revision."artifactId" = $2 AND revision.kind = 'review-snapshot'`,
    [pin.revisionId, pin.artifactId, anchor.source.pageOrdinal, pin.reviewId]);
  const row = source.rows.length === 1 ? source.rows[0] : undefined;
  const mapping = row ? studioReviewMappingFromOperation(row.operation, {
    ...pin, rootGraphHash: row.rootGraphHash,
  }, anchor.source.pageOrdinal, row.hash, row.captureReceipt) : { status: "unmapped" as const, reason: "source-unavailable" as const };
  if (!validateStudioReviewSpatialAnchor(mapping, anchor)) return "anchor-mismatch";
  return strokes.length && !validateStudioReviewPenStrokes(mapping, anchor, strokes) ? "strokes-mismatch" : "valid";
}
