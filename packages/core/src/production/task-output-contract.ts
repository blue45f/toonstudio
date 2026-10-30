import type { ProductionStudioDocumentRole, RevisionRef, ScopeRef } from "./types";

/** Graph 프로젝트와 Production 프로젝트의 ID를 서로 대체하지 않는다. */
export interface ProductionTaskOutputSubject {
  readonly schemaVersion: 1;
  readonly workId: string;
  readonly projectId: string;
  readonly artifactId: string;
  readonly reviewId: string;
  readonly revisionId: string;
  readonly rootGraphHash: string;
}

export interface ProductionTaskOutputCaptureInput {
  readonly subject: ProductionTaskOutputSubject;
}

export type ProductionTaskOutputSelection =
  | { readonly mode: "document" }
  | { readonly mode: "pages"; readonly pages: readonly { readonly pageId: string; readonly ordinal: number }[] }
  | { readonly mode: "frames"; readonly pages: readonly { readonly pageId: string; readonly ordinal: number; readonly frameIds: readonly string[] }[] };

export interface ProductionTaskOutputPageEvidence {
  readonly pageId: string;
  readonly ordinal: number;
  readonly sha256: string;
  readonly frameIds: readonly string[];
}

/** 서버가 검증한 원고 사용 근거이며 편집 권한을 부여하지 않는다. */
export interface ProductionTaskOutputEvidence {
  readonly version: 1;
  readonly kind: "studio-review-capture";
  readonly taskId: string;
  readonly scope: ScopeRef;
  readonly documentRole: ProductionStudioDocumentRole;
  readonly subject: ProductionTaskOutputSubject;
  readonly sourceServerRevision: number;
  readonly captureSequence: number;
  readonly selectionMode: ProductionTaskOutputSelection["mode"];
  readonly pages: readonly ProductionTaskOutputPageEvidence[];
}

/** 같은 DB transaction에서 만들며 클라이언트의 주장으로 직접 구성하지 않는다. */
export interface VerifiedProductionTaskOutputCapture {
  readonly subject: ProductionTaskOutputSubject;
  readonly sourceServerRevision: number;
  readonly captureSequence: number;
  readonly createdAt: string;
  readonly pages: readonly ProductionTaskOutputPageEvidence[];
}

export interface ProductionTaskOutputCaptures {
  readonly output: VerifiedProductionTaskOutputCapture;
  readonly initial?: VerifiedProductionTaskOutputCapture;
}

export interface ProductionTaskOutputSources {
  readonly output: ProductionTaskOutputCaptureInput;
  readonly initial?: ProductionTaskOutputCaptureInput;
}

export interface SubmitProductionTaskOutputCommand {
  readonly type: "submit-task-output";
  readonly taskId: string;
  readonly submissionId: string;
  readonly submittedByAssignmentId: string;
  readonly documentRole: ProductionStudioDocumentRole;
  readonly source: ProductionTaskOutputCaptureInput;
  readonly selection: ProductionTaskOutputSelection;
  readonly inputs:
    | { readonly mode: "current" }
    | { readonly mode: "approved-dependencies" }
    | { readonly mode: "initial-capture"; readonly source: ProductionTaskOutputCaptureInput };
  readonly target:
    | { readonly kind: "existing"; readonly deliverableId: string }
    | { readonly kind: "create"; readonly deliverableId: string; readonly type: string;
        readonly expectedFormat: string; readonly completionCriteria: readonly string[] };
}

/** 원고 번호는 검증된 CreatorWork server revision이며 목록 순위나 제출 회차가 아니다. */
export function productionTaskOutputRevision(
  capture: VerifiedProductionTaskOutputCapture,
  lineage: RevisionRef["lineage"],
): RevisionRef {
  return { id: capture.subject.revisionId, lineage, revision: capture.sourceServerRevision,
    digest: `sha256:${capture.subject.rootGraphHash}`, createdAt: capture.createdAt };
}
