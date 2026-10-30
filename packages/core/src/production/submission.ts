import type { ProductionTaskOutputEvidence } from "./task-output-contract";
import type { RevisionRef } from "./types";

export interface Submission {
  readonly id: string;
  readonly projectId: string;
  readonly deliverableId: string;
  readonly revisionRef: RevisionRef;
  readonly submittedByAssignmentId: string;
  readonly submittedAt: string;
  readonly status: "submitted" | "in-review" | "changes-requested" | "approved" | "superseded";
  readonly inputRevisionRefs: readonly RevisionRef[];
  readonly evidenceRefs: readonly string[];
  readonly sourceEvidence?: ProductionTaskOutputEvidence;
}

/** 객체 키의 삽입 순서와 무관하게 서버가 고정한 사용 근거를 대조한다. */
export function sameSubmissionSourceEvidence(
  left: ProductionTaskOutputEvidence | undefined,
  right: ProductionTaskOutputEvidence | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.version === right.version && left.kind === right.kind && left.taskId === right.taskId
    && left.documentRole === right.documentRole && left.sourceServerRevision === right.sourceServerRevision
    && left.captureSequence === right.captureSequence && left.selectionMode === right.selectionMode
    && left.scope.kind === right.scope.kind && left.scope.id === right.scope.id
    && left.scope.ancestors.length === right.scope.ancestors.length
    && left.scope.ancestors.every((ancestor, index) => {
      const other = right.scope.ancestors[index];
      return other?.kind === ancestor.kind && other.id === ancestor.id;
    })
    && left.subject.schemaVersion === right.subject.schemaVersion && left.subject.workId === right.subject.workId
    && left.subject.projectId === right.subject.projectId && left.subject.artifactId === right.subject.artifactId
    && left.subject.reviewId === right.subject.reviewId && left.subject.revisionId === right.subject.revisionId
    && left.subject.rootGraphHash === right.subject.rootGraphHash && left.pages.length === right.pages.length
    && left.pages.every((page, index) => {
      const other = right.pages[index];
      return other?.pageId === page.pageId && other.ordinal === page.ordinal && other.sha256 === page.sha256
        && other.frameIds.length === page.frameIds.length && page.frameIds.every((id, frame) => other.frameIds[frame] === id);
    });
}
