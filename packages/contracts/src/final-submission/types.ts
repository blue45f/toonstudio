/** Sites와 어드민이 교환하는 제출 점검 기록. 외부 작업의 실행 권한은 포함하지 않는다. */
export const STATUSES = ["미확인", "검토 필요", "보완 중", "승인 대기", "최종 확인"] as const;
export const FINAL_SUBMISSION_MAX_BYTES = 2 * 1024 * 1024;
export const REQUIRED_DOCUMENT_IDS = ["report", "business", "ledger"] as const;
export const GLOBAL_PLATFORM_TASK_ID = "PLATFORM-01";
export const REQUIRED_APPROVALS = [
  { id: "ACTION-01", title: "문서 수정" },
  { id: "ACTION-02", title: "제출 파일 교체" },
  { id: "ACTION-03", title: "플랫폼 실제 제출" },
  { id: "ACTION-04", title: "외부 계정 접근" },
] as const;

export type Status = (typeof STATUSES)[number];
export type Link = { label: string; url: string };
export type DocumentRecord = {
  id: string;
  label: string;
  fileName: string;
  version: string;
  versionBasis: string;
  authoredAt: string;
  modifiedAt: string;
  metadataNote: string;
  sourceUrl: string;
  availability: "미확보" | "메타데이터 확인" | "내용 확인";
  candidateState: "미확인" | "검토 후보" | "최종본 확정";
  candidateEvidence: string;
  finalizedAt: string;
  expectedFormat: string;
  formatStatus: "미확인" | "적합 확인" | "문제 확인";
  fileHash: string;
  bytes: string;
  lastConfirmedAt: string;
  notes: string;
  platform: {
    status: "미확인" | "제출 확인" | "미제출 확인";
    fileName: string;
    version: string;
    hash: string;
    uploadedAt: string;
    submittedAt: string;
    evidenceUrl: string;
    receipt: string;
    observedAt: string;
    comparison: "미확인" | "일치 확인" | "차이 확인";
    comparisonNote: string;
  };
};
export type Task = {
  id: string;
  title: string;
  category: string;
  docId: string;
  status: Status;
  priority: "높음" | "보통";
  issueType: "미확인" | "차이 확인" | "확인 필요";
  fileName: string;
  version: string;
  authoredAt: string;
  modifiedAt: string;
  evidenceLinks: Link[];
  attachments: Link[];
  discrepancy: string;
  nextAction: string;
  lastConfirmedAt: string;
  confirmedBy: string;
  confirmationNote: string;
  approvalRequired: boolean;
  unresolved: boolean;
  updatedAt: string;
  provenance: string;
};
export type Source = { id: string; title: string; url: string; type: string; observedAt: string; note: string };
export type BoardState = {
  schemaVersion: 1;
  documents: DocumentRecord[];
  tasks: Task[];
  sources: Source[];
  revision: number;
  updatedAt: string;
};
export type HistoryEntry = { id: string; revision: number; changedAt: string; summary: string };
export type FinalSubmissionRecord = { ownerUserId: string; board: BoardState | null; revision: number; updatedAt: string | null; history: HistoryEntry[] };
export type SaveFinalSubmissionRequest = { board: BoardState; expectedRevision: number; mutationId: string; summary: string };
export type FinalSubmissionParseResult = { ok: true; value: BoardState } | { ok: false; errors: string[] };
