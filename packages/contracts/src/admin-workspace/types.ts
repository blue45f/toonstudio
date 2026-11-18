import type { AdminWorkspaceAccess, AdminWorkspaceScope } from "./access-types";
import type { WorkspaceChangeIdentity, WorkspaceOperationalState } from "./change-identity";
import type { WorkspaceEvidence, WorkspaceEvidenceTarget } from "./evidence";

/** 관리자 기록은 사실 확인·승인 현황만 관리하며 외부 작업을 실행하지 않는다. */
export const WORKSPACE_STATUSES = ["초안", "검토 필요", "근거 확인 중", "보완 완료", "승인 대기", "최종 확인"] as const;
export const WORKSPACE_FACT_STATUSES = ["미확인", "확인 중", "확인", "상충", "제외"] as const;
export const WORKSPACE_MODULES = [
  { id: "coordination", label: "통합 검토" },
  { id: "business", label: "사업계획·제출" },
  { id: "cloud", label: "클라우드 작업" },
  { id: "nestjs", label: "NestJS 호환성" },
  { id: "dependency", label: "의존성·CI" },
  { id: "ai", label: "AI·무료 운영" },
] as const;
export const WORKSPACE_CLAIM_KINDS = ["일반", "숫자", "시장 규모", "매출 전망", "비교"] as const;
export const WORKSPACE_APPROVAL_TYPES = ["코드 수정", "외부 제출", "계정 설정 변경", "외부 배포"] as const;
export const MAX_WORKSPACE_BYTES = 12 * 1024 * 1024;
export const MAX_WORKSPACE_RECOVERY_BYTES = 64 * 1024 * 1024;
export type WorkspaceStatus = typeof WORKSPACE_STATUSES[number];
export type WorkspaceFactStatus = typeof WORKSPACE_FACT_STATUSES[number];
export type WorkspaceModule = typeof WORKSPACE_MODULES[number]["id"];
export type WorkspaceClaimKind = typeof WORKSPACE_CLAIM_KINDS[number];
export type WorkspaceApprovalType = typeof WORKSPACE_APPROVAL_TYPES[number];
export type WorkspaceJson = null | boolean | number | string | WorkspaceJson[] | { [key: string]: WorkspaceJson };
export type WorkspaceResult<T> = { ok: true; value: T; errors: [] } | { ok: false; value: null; errors: string[] };
export interface WorkspaceOrigin { importId: string; sourceId: string; sourceRecordId: string; raw: WorkspaceJson }
export interface WorkspaceRecord {
  id: string;
  module: WorkspaceModule;
  recordType: "task" | "claim" | "operation";
  taskId: string;
  project: string;
  title: string;
  category: string;
  status: WorkspaceStatus;
  factStatus: WorkspaceFactStatus;
  owner: string;
  assignment: string;
  nextAction: string;
  notes: string;
  text: string;
  kind: WorkspaceClaimKind;
  value: number | string | null;
  unit: string;
  period: string;
  scope: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceDate: string;
  quote: string;
  secondSourceTitle: string;
  secondSourceUrl: string;
  verifiedAt: string;
  reviewer: string;
  verificationNote: string;
  formula: string;
  assumptions: string;
  freshnessDays: number;
  localSha: string;
  remoteSha: string;
  mainSha: string;
  deployedSha: string;
  approvalOnly: boolean;
  approvalReason: string;
  origin: WorkspaceOrigin | null;
  /** 옛 기록은 비어 있는 증거를 성공으로 자동 승격하지 않고 그대로 읽을 수 있다. */
  evidence?: WorkspaceEvidence[];
  evidenceTarget?: WorkspaceEvidenceTarget;
  changeIdentity?: WorkspaceChangeIdentity;
  operationalState?: WorkspaceOperationalState;
}
export interface WorkspaceDocumentContent { label: string; url: string; content: string; updatedAt: string }
export interface WorkspaceMentorItem {
  id: string; text: string; taskId: string; status: "미반영" | "반영 중" | "반영 완료";
  source: string; location: string; evidence: string; notes: string;
}
export interface WorkspaceCheckItem { id: string; label: string; done: boolean; source: string; notes: string; verifiedAt: string }
export interface WorkspaceApproval {
  id: string; type: WorkspaceApprovalType; title: string; description: string; status: "승인 대기"; notes: string;
}
export interface WorkspaceSettings { freshnessDays: number; deadline: string; deadlineSource: string }
export interface WorkspaceBasis {
  document: { id: string; title: string; purpose: "submission" | "reference" };
  records: WorkspaceRecord[]; mentor: WorkspaceMentorItem[]; checklist: WorkspaceCheckItem[]; settings: WorkspaceSettings;
}
export interface WorkspaceSnapshot extends WorkspaceDocumentContent {
  id: string; frozenAt: string; status: "승인 대기"; basis: WorkspaceBasis | null;
}
export interface WorkspaceDocument {
  id: string; title: string; purpose: "submission" | "reference";
  working: WorkspaceDocumentContent; submission: WorkspaceSnapshot | null; history: WorkspaceSnapshot[];
}
export interface WorkspaceImport {
  id: string; label: string; importedAt: string; format: "legacy-unified" | "legacy-business" | "native-backup"; archive: WorkspaceJson;
}
export interface AdminWorkspace {
  kind: "toonstudio-admin-workspace"; schemaVersion: 1;
  records: WorkspaceRecord[]; documents: WorkspaceDocument[]; mentor: WorkspaceMentorItem[];
  checklist: WorkspaceCheckItem[]; approvals: WorkspaceApproval[]; imports: WorkspaceImport[]; settings: WorkspaceSettings;
}
export interface AdminWorkspaceView {
  boardId: "toonstudio"; revision: number; state: AdminWorkspace | null; updatedAt: string | null; canEdit: boolean;
  scope: AdminWorkspaceScope; access: AdminWorkspaceAccess;
}
export interface AdminWorkspaceSave { expectedRevision: number; mutationId: string; state: AdminWorkspace; scope?: AdminWorkspaceScope; claimBusinessOwnership?: boolean }
export interface WorkspaceGate { id: string; title: string; count: number; detail: string; tone: "good" | "warn" | "bad" }
export interface WorkspaceFreshness { label: string; tone: "good" | "warn" | "bad" | "neutral"; ageDays: number | null }
export interface AdminWorkspaceSaveAck { boardId: "toonstudio"; revision: number; updatedAt: string; replayed: boolean; scope: AdminWorkspaceScope }
export type AdminWorkspaceSaveResult = AdminWorkspaceSaveAck;
