import { REQUIRED_APPROVALS } from "./types";

import type { BoardState, DocumentRecord, Task } from "./types";

export function createFinalSubmissionDocument(id: string, label: string): DocumentRecord {
  return {
    id, label, fileName: "", version: "", versionBasis: "", authoredAt: "", modifiedAt: "", metadataNote: "", sourceUrl: "",
    availability: "미확보", candidateState: "미확인", candidateEvidence: "", finalizedAt: "", expectedFormat: "", formatStatus: "미확인",
    fileHash: "", bytes: "", lastConfirmedAt: "", notes: "",
    platform: { status: "미확인", fileName: "", version: "", hash: "", uploadedAt: "", submittedAt: "", evidenceUrl: "", receipt: "", observedAt: "", comparison: "미확인", comparisonNote: "" },
  };
}

export function createFinalSubmissionTask(id: string, title: string, category: string, docId = ""): Task {
  return {
    id, title, category, docId, status: "미확인", priority: "보통", issueType: "미확인", fileName: "", version: "", authoredAt: "", modifiedAt: "",
    evidenceLinks: [], attachments: [], discrepancy: "", nextAction: "", lastConfirmedAt: "", confirmedBy: "", confirmationNote: "",
    approvalRequired: false, unresolved: true, updatedAt: "", provenance: "사용자 확인 필요",
  };
}

/** 공개 기본값에는 개인 파일명·링크·금액·관측 결과를 포함하지 않는다. */
export function createEmptyFinalSubmissionBoard(): BoardState {
  const checks = [
    ["DOC-01", "활동보고서 최종 후보 확인", "최종본", "report"],
    ["DOC-02", "사업계획서 최종 후보 확인", "최종본", "business"],
    ["DOC-03", "지출 증빙 대장 최종 후보 확인", "최종본", "ledger"],
    ["CHECK-01", "필수 파일 누락 여부 확인", "첨부 파일", "report"],
    ["CHECK-02", "사업계획서 붙임 구성 확인", "첨부 파일", "business"],
    ["CHECK-03", "증빙 첨부 누락 여부 확인", "첨부 파일", "ledger"],
    ["MATCH-01", "보고서와 증빙 대장 대조", "증빙 대조", "ledger"],
    ["MATCH-02", "증빙 참조 위치와 파일 대조", "증빙 대조", "report"],
    ["FORMAT-01", "활동보고서 파일 형식 확인", "파일 형식", "report"],
    ["FORMAT-02", "사업계획서 파일 형식 확인", "파일 형식", "business"],
    ["FORMAT-03", "증빙 대장 파일 형식 확인", "파일 형식", "ledger"],
    ["MENTOR-01", "멘토 검토본 최종 반영 여부 확인", "기존 검토 반영", "business"],
    ["PLATFORM-01", "구버전 첨부 여부·플랫폼 접수 근거 확인", "플랫폼", "report"],
  ] as const;
  return {
    schemaVersion: 1, revision: 0, updatedAt: "", sources: [],
    documents: [createFinalSubmissionDocument("report", "활동보고서"), createFinalSubmissionDocument("business", "사업계획서"), createFinalSubmissionDocument("ledger", "지출 증빙 대장")],
    tasks: [
      ...checks.map(([id, title, category, docId]) => createFinalSubmissionTask(id, title, category, docId)),
      ...REQUIRED_APPROVALS.map(({ id, title }): Task => ({ ...createFinalSubmissionTask(id, title, "승인 대기", "report"), status: "승인 대기", approvalRequired: true, nextAction: "대상·근거·필요 조치 기록만 관리", provenance: "실행하지 않고 승인 대기로 관리" })),
    ],
  };
}
