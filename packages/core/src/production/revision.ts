import type { ProductionLineage } from "./types";

export interface RevisionRef {
  readonly id: string;
  readonly lineage: ProductionLineage;
  readonly revision: number;
  readonly digest: string;
  readonly createdAt: string;
  /** 같은 원본을 사용하는 서로 다른 업무 산출물은 실제 제출 ID로 구분한다. */
  readonly productionSubmissionId?: string;
}

/** 원본 정본과 선택 범위를 고정한 실제 Production 제출을 함께 대조한다. */
export function sameProductionRevision(left: RevisionRef, right: RevisionRef): boolean {
  return left.id === right.id && left.digest === right.digest && left.lineage === right.lineage
    && left.revision === right.revision && left.productionSubmissionId === right.productionSubmissionId;
}

export function productionRevisionKey(ref: RevisionRef): string {
  return JSON.stringify([ref.id, ref.digest, ref.lineage, ref.revision, ref.productionSubmissionId ?? null]);
}
