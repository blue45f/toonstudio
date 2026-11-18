/** 사업계획서 보드의 v1 교환 계약. 사용자 원문과 실행 권한은 기본 데이터에 포함하지 않는다. */
export const STATUS = Object.freeze([
  "초안", "검토 필요", "근거 확인 중", "보완 완료", "승인 대기", "최종 확인",
] as const);
export const FACT_STATUS = Object.freeze([
  "미확인", "검증 중", "근거 확인", "출처 상충", "근거 부족",
] as const);
export const CLAIM_KINDS = Object.freeze([
  "정성 주장", "수치", "시장 규모", "매출 전망", "비교표", "제품 구현",
] as const);
export const APPROVAL_TYPES = Object.freeze([
  "코드 수정", "외부 제출", "계정 설정 변경", "외부 배포",
] as const);

export const BUSINESS_PLAN_SCHEMA_VERSION = 1 as const;
export const BUSINESS_PLAN_MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const BUSINESS_PLAN_DOCUMENT_HISTORY_LIMIT = 50;

export type BusinessPlanTaskStatus = (typeof STATUS)[number];
export type BusinessPlanFactStatus = (typeof FACT_STATUS)[number];
export type BusinessPlanEffectiveFactStatus = BusinessPlanFactStatus | "가정·산식 검토";
export type BusinessPlanClaimKind = (typeof CLAIM_KINDS)[number];
export type BusinessPlanApprovalType = (typeof APPROVAL_TYPES)[number];

export interface BusinessPlanDeadline {
  id: string;
  label: string;
  /** 미확인 슬롯은 빈 문자열, 등록한 일정은 시간대가 있는 ISO 시각이다. */
  at: string;
  sourceUrl: string;
  verified: boolean;
  note: string;
}

export interface BusinessPlanProject {
  title: string;
  subtitle: string;
  createdAt: string;
  deadlines: BusinessPlanDeadline[];
}

export interface BusinessPlanTask {
  id: string;
  title: string;
  category: string;
  status: BusinessPlanTaskStatus;
  priority: string;
  description: string;
  owner: string;
  assignment: string;
  nextAction: string;
  notes: string;
  evidenceUrl: string;
  sourceTitle: string;
  verifiedAt: string;
  dueDate: string;
  updatedAt: string;
  /** 초기 v1 백업에 사용 가능한 별칭은 가져올 때 보존한다. */
  assignedWork?: string;
  note?: string;
  sourceUrl?: string;
  documentId?: string;
}

export interface BusinessPlanClaim {
  id: string;
  taskId: string;
  title: string;
  text: string;
  kind: BusinessPlanClaimKind;
  /** 미확인은 빈 문자열이다. 확인된 0은 문자열 "0"으로 보존한다. */
  value: string;
  unit: string;
  period: string;
  scope: string;
  factStatus: BusinessPlanFactStatus;
  sourceUrl: string;
  sourceTitle: string;
  publisher: string;
  publishedAt: string;
  sourceLocation: string;
  originalExcerpt: string;
  crossSourceUrl: string;
  crossSourceTitle: string;
  crossNotes: string;
  verifiedAt: string;
  reviewer: string;
  reviewDays: number;
  notes: string;
  assumptions: string;
  formula: string;
  updatedAt: string;
}

export interface BusinessPlanDocumentSnapshot {
  label: string;
  text: string;
  createdAt: string;
  sourceUpdatedAt: string;
}

export interface BusinessPlanDocumentHistoryEntry {
  label: string;
  text: string;
  type: "작업용" | "제출 후보";
  createdAt?: string;
  /** 초기 v1 이력의 날짜 필드도 읽을 수 있다. */
  at?: string;
  sourceUpdatedAt?: string;
}

export interface BusinessPlanDocument {
  id: string;
  title: string;
  sourceUrl: string;
  fileName: string;
  workingLabel: string;
  workingText: string;
  previousLabel: string;
  previousText: string;
  updatedAt: string;
  submission: BusinessPlanDocumentSnapshot | null;
  history: BusinessPlanDocumentHistoryEntry[];
  notes: string;
  fileUrl?: string;
}

export interface BusinessPlanMentorRequest {
  id: string;
  title: string;
  request: string;
  round: string;
  sourceUrl: string;
  taskId: string;
  documentId: string;
  location: string;
  reflected: boolean;
  evidence: string;
  note: string;
  updatedAt?: string;
}

export interface BusinessPlanManualCheck {
  id: string;
  title: string;
  checked: boolean;
  note: string;
  evidenceUrl: string;
  group: string;
  updatedAt?: string;
}

export interface BusinessPlanApproval {
  id: string;
  type: BusinessPlanApprovalType;
  title: string;
  /** 승인 기록은 실행을 허용하는 토큰이나 명령이 아니다. */
  status: "승인 대기";
  scope: string;
  note: string;
  updatedAt?: string;
}

export interface BusinessPlanActivity {
  id: string;
  at: string;
  type: string;
  text: string;
}

export interface BusinessPlanState {
  schemaVersion: typeof BUSINESS_PLAN_SCHEMA_VERSION;
  project: BusinessPlanProject;
  tasks: BusinessPlanTask[];
  claims: BusinessPlanClaim[];
  documents: BusinessPlanDocument[];
  mentor: BusinessPlanMentorRequest[];
  checks: BusinessPlanManualCheck[];
  approvals: BusinessPlanApproval[];
  activity: BusinessPlanActivity[];
  /** 백업의 클라이언트 기록 시각이며 서버 revision을 대신하지 않는다. */
  savedAt?: string;
}

export interface BusinessPlanRecord {
  board: BusinessPlanState | null;
  revision: number;
  updatedAt: string | null;
}

export interface SaveBusinessPlanRequest {
  board: BusinessPlanState;
  expectedRevision: number;
  mutationId: string;
}

export interface BusinessPlanValidationResult {
  ok: boolean;
  errors: string[];
}

export type BusinessPlanParseResult<T = BusinessPlanState> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export interface BusinessPlanFreshness {
  level: "unknown" | "danger" | "warn" | "good";
  label: string;
  detail: string;
}

export interface BusinessPlanAutomaticCheck {
  id: string;
  title: string;
  pass: boolean;
  detail: string;
  target: "claims" | "documents" | "mentor" | "tasks" | "review";
}

export interface BusinessPlanStats {
  totalTasks: number;
  completedTasks: number;
  finalTasks: number;
  unknownClaims: number;
  staleClaims: number;
  verifiedClaims: number;
  mentorDone: number;
  mentorTotal: number;
  approvalCount: number;
  blockers: number;
}

export interface BusinessPlanDiffLine {
  type: "equal" | "remove" | "add";
  text: string;
}
