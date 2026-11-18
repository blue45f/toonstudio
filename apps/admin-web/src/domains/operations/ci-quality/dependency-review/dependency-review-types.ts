export const workflowStatuses = ["미확인", "진행 중", "검토 필요", "승인 대기", "검증 완료", "main 머지 완료"] as const;
export type WorkflowStatus = typeof workflowStatuses[number];
export type ReviewCategory = "cause" | "check" | "approval" | "archive";
export type ReviewProvenance = "repository-snapshot" | "manual-record" | "sites-import";
export interface ReviewLink { label: string; url: string }

/** Sites 내보내기의 원래 필드를 유지하고 관리자의 기록과 관측 결과를 구분한다. */
export interface ReviewRecord {
  id: string; title: string; category: ReviewCategory; group: string; status: WorkflowStatus;
  result: string; historicalResult: string; confidence: string; regression: string;
  summary: string; owner: string; priority: string; currentVersion: string;
  expectedVersion: string; lockInterpretation: string; workspace: string;
  impact: string; relatedFiles: string; testResults: string; ciLinks: string;
  hypothesis: string; evidence: string; minimalFiles: string; patchDraft: string;
  validation: string; nextAction: string; verifiedAt: string; notes: string;
  links: ReviewLink[]; snapshotSha: string; causeIds: string[];
  provenance: ReviewProvenance; sourceStatus: string; sourceResult: string;
  verificationSha: string; recordedResult: string;
  revision: number; updatedAt: string; edited: boolean;
}

export const recordDefinitions = {
  remotion: { category: "cause", causeIds: [] },
  deepmerge: { category: "cause", causeIds: [] },
  build: { category: "check", causeIds: ["remotion"] },
  marketplace: { category: "check", causeIds: ["remotion"] },
  player: { category: "check", causeIds: ["remotion"] },
  core: { category: "check", causeIds: ["deepmerge"] },
  discovery: { category: "check", causeIds: [] },
  "approval-code": { category: "approval", causeIds: [] },
  "approval-push": { category: "approval", causeIds: [] },
  "approval-merge": { category: "approval", causeIds: [] },
  "approval-deploy": { category: "approval", causeIds: [] },
  archive2789: { category: "archive", causeIds: [] },
} as const;

export const recordFieldLabels = {
  owner: "담당자", priority: "우선순위", currentVersion: "현재 버전", expectedVersion: "기대 버전",
  lockInterpretation: "잠금파일 해석", workspace: "워크스페이스 위치", impact: "영향 범위",
  relatedFiles: "관련 파일", testResults: "테스트 결과", ciLinks: "CI 링크",
  hypothesis: "원인 가설", evidence: "확정 근거", minimalFiles: "최소 변경 파일",
  patchDraft: "패치 초안 / 기존 적용 패치", validation: "저비용 검증 방법",
  nextAction: "다음 조치", verifiedAt: "검증일 · ISO 8601", notes: "메모",
  verificationSha: "수동 검증 SHA · 40자리", recordedResult: "수동 검사 결과 · 미확인/통과/실패/취소/미실행",
} as const;
export const editableRecordFields = Object.keys(recordFieldLabels) as (keyof typeof recordFieldLabels)[];

export interface ReviewSnapshot {
  sha: string; checkedAt: string; commitAt: string; commitUrl: string; ciUrl: string; summary: string;
}
export interface DependencyRow {
  name: string; workspace: string; declared: string; resolved: string;
  expected: string; interpretation: string; url: string;
}
export interface PrComparison {
  number: number; title: string; mergedAt: string; sha: string; url: string;
  commitUrl: string; changes: string[]; judgement: string; files: string; role: string;
  baseSha?: string; headSha?: string; checkoutSha?: string; ciLinks?: ReviewLink[];
}
export interface ValidationCommand { title: string; command: string; scope: string; cost: string; limitations: string }
export interface ReviewHistory { id: string; recordId: string; summary: string; createdAt: string }
export interface ImportReceipt {
  fingerprint: string; importedAt: string; snapshotSha: string; exportedAt: string;
  /** 검증한 원본 JSON을 보존한다. 실행하거나 저장소 소유자 신원으로 사용하지 않는다. */
  sourceJson: string;
}
export interface DependencyReviewBoard {
  schemaVersion: 1; kind: "toonstudio-dependency-review";
  snapshot: ReviewSnapshot; ttlHours: number; records: ReviewRecord[];
  dependencies: DependencyRow[]; prs: PrComparison[]; commands: ValidationCommand[];
  history: ReviewHistory[]; imports: ImportReceipt[];
}
export interface RecordFreshness { kind: "missing" | "stale" | "review" | "recorded"; label: string; reason: string }
export interface DependencyImportPlan {
  fingerprint: string; kind: "sites" | "native"; sourceJson: string; exportedAt: string;
  snapshotSha: string; records: ReviewRecord[]; identical: boolean;
  changes: { id: string; title: string; conflict: boolean; fields: string[] }[];
  originalRecordCount: number;
  targetJson: string;
}
