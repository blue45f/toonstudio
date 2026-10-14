/**
 * 제작 관리 화면의 사람이 읽는 이름표.
 *
 * 서버·도메인 상태 코드(`approve-with-conditions`, `MUST_PRESERVE`, `line-art` 등)를
 * 화면에 그대로 노출하지 않도록 한곳에서 한국어·영어 이름으로 바꾼다.
 * 알 수 없는 코드가 들어오면 원문을 그대로 보여 주어 데이터를 숨기지 않는다.
 */
import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type { CollaborationRole } from "@toonstudio/core/collaboration";
import type {
  AssignmentStatus,
  ClarificationCategory,
  ClarificationStatus,
  CreativeInstructionPriority,
  CreativeLatitude,
  EpisodeCollaboration,
  PlanningDocumentStatus,
  ProductionProjectAggregate,
  ProductionRoleType,
  ProductionScopeKind,
  ProductionTaskStatus,
  ReviewDecisionValue,
  ReviewLane,
  Submission,
} from "@toonstudio/core/production";

import type { ProductionTone } from "./production-ui";
import type { EpisodeDeadlineHealth } from "./production-episode-operations";
import type { ProductionClientCommand } from "./production-api";
import type { ProductionProjectAccess } from "./production-dashboard-api";

export interface BilingualLabel {
  readonly ko: string;
  readonly en: string;
}

/** `useBilingual()`가 돌려주는 번역 함수와 같은 모양. */
export type ProductionLocalize = (ko: string, en: string) => string;

function pick<K extends string>(
  map: Readonly<Record<K, BilingualLabel>>,
  key: K,
  localize: ProductionLocalize,
): string {
  const label = map[key];
  return label ? localize(label.ko, label.en) : key;
}

/** 공정 이름표. 팀 공정 설정에 이름이 있으면 그 이름이 우선한다. */
export const PRODUCTION_PROCESS_LABELS: Readonly<Record<string, BilingualLabel>> = Object.freeze({
  planning: { ko: "기획", en: "Planning" },
  "story-lock": { ko: "스토리", en: "Story" },
  storyboard: { ko: "콘티", en: "Storyboard" },
  "name-board": { ko: "네임", en: "Name board" },
  sketch: { ko: "스케치·데생", en: "Sketch" },
  "line-art": { ko: "선화", en: "Line art" },
  ink: { ko: "펜화", en: "Inking" },
  background: { ko: "배경", en: "Background" },
  "background-draft": { ko: "배경 원화", en: "Background art" },
  "background-compose": { ko: "배경 합성", en: "Background composite" },
  undercolor: { ko: "밑색", en: "Undercolor" },
  color: { ko: "채색", en: "Color" },
  tone: { ko: "톤·마무리", en: "Tone finish" },
  lettering: { ko: "식자", en: "Lettering" },
  "first-proof": { ko: "1차 교정", en: "First proof" },
  "proof-revision": { ko: "수정 반영", en: "Proof revision" },
  "final-proof": { ko: "최종 검수", en: "Final review" },
  "rights-preflight": { ko: "권리 점검", en: "Rights check" },
  "joint-proof": { ko: "최종 교정", en: "Final proof" },
  publication: { ko: "게시 준비", en: "Publishing" },
});

/** 공정 칸반의 기본 열 순서. 팀 공정 설정이 없을 때 사용한다. */
export const PRODUCTION_DEFAULT_PROCESS_ORDER: readonly string[] = Object.freeze([
  "story-lock",
  "storyboard",
  "sketch",
  "line-art",
  "background",
  "undercolor",
  "color",
  "lettering",
  "rights-preflight",
  "joint-proof",
  "publication",
]);

export function productionProcessLabel(
  aggregate: Pick<ProductionProjectAggregate, "workflowProfile">,
  processKey: string,
  localize: ProductionLocalize,
): string {
  const canonical = canonicalProductionProcessKey(processKey);
  const step = aggregate.workflowProfile?.steps.find(
    (candidate) => canonicalProductionProcessKey(candidate.key) === canonical,
  );
  if (step) return step.name;
  const label = PRODUCTION_PROCESS_LABELS[canonical];
  return label ? localize(label.ko, label.en) : processKey;
}

/**
 * 팀 설정과 무관한 공정 표시 이름 — 내부 코드를 화면에 내보내지 않는다.
 * 별칭(story·thumbnail)은 정본 키로 접은 뒤 이름표에서 찾고,
 * 이름표에 없는 키는 대체 이름(기타 공정)으로 돌려준다.
 */
export function productionProcessDisplayLabel(processKey: string, localize: ProductionLocalize): string {
  const label = PRODUCTION_PROCESS_LABELS[canonicalProductionProcessKey(processKey)];
  if (label) return localize(label.ko, label.en);
  return localize("기타 공정", "Other step");
}

/**
 * 기본 공정에는 들어가지 않지만, 팀이 골라서 켤 수 있는 선택 단계.
 * 구인 게시판이 독립 분야로 세는 스케치·데생과 밑색이 기본 프로필에는 없어
 * 분업 스튜디오가 단계를 직접 만들어야 했던 불일치를 메운다.
 * 순서는 `insertAfter` 공정 바로 뒤이며, 켜지 않은 팀의 보드에는 열이 생기지 않는다
 * (공정 열은 실제 단계·작업이 있을 때만 만들어진다).
 */
export interface ProductionOptionalProcessStep {
  readonly key: string;
  readonly insertAfter: string;
  readonly defaultRole: ProductionRoleType;
  readonly estimateHours: number;
}

export const PRODUCTION_OPTIONAL_PROCESS_STEPS: readonly ProductionOptionalProcessStep[] = Object.freeze([
  { key: "sketch", insertAfter: "storyboard", defaultRole: "line-artist", estimateHours: 8 },
  { key: "undercolor", insertAfter: "line-art", defaultRole: "colorist", estimateHours: 6 },
]);

export function productionOptionalProcessStep(processKey: string): ProductionOptionalProcessStep | null {
  const canonical = canonicalProductionProcessKey(processKey);
  return PRODUCTION_OPTIONAL_PROCESS_STEPS.find((step) => step.key === canonical) ?? null;
}

/**
 * 구인·의뢰 분야 분류와 제작 공정의 정본 매핑표.
 * 구인 게시판(CollaborationBoardPage)의 작업 분야 필터와 제작 표면이 이 표 하나를 소비한다.
 * 분야 이름(ko)은 core `COLLABORATION_ROLES`의 문구와 같아야 하고,
 * `processKeys`의 모든 키는 `PRODUCTION_PROCESS_LABELS`에 이름표가 있어야 한다.
 * 대응하는 공정이 없는 분야(3D 모델·소재, 모션·영상, 기타·복합 작업)는 빈 목록으로 명시한다.
 */
export interface CollaborationRoleProcessMapping {
  readonly label: BilingualLabel;
  readonly processKeys: readonly string[];
}

export const COLLABORATION_ROLE_PROCESS_MAP: Readonly<
  Record<CollaborationRole, CollaborationRoleProcessMapping>
> = Object.freeze({
  story: {
    label: { ko: "스토리·콘티", en: "Story · storyboards" },
    processKeys: Object.freeze(["story-lock", "storyboard"]),
  },
  sketch: {
    label: { ko: "러프·스케치", en: "Roughs · sketches" },
    processKeys: Object.freeze(["sketch"]),
  },
  ink: {
    label: { ko: "선화", en: "Line art" },
    processKeys: Object.freeze(["line-art"]),
  },
  flat: {
    label: { ko: "밑색", en: "Flats" },
    processKeys: Object.freeze(["undercolor"]),
  },
  color: {
    label: { ko: "채색·명암", en: "Coloring · shading" },
    processKeys: Object.freeze(["color"]),
  },
  background: {
    label: { ko: "배경", en: "Backgrounds" },
    processKeys: Object.freeze(["background"]),
  },
  model3d: {
    label: { ko: "3D 모델·소재", en: "3D models · assets" },
    processKeys: Object.freeze([]),
  },
  lettering: {
    label: { ko: "식자·편집", en: "Lettering · editing" },
    processKeys: Object.freeze(["lettering"]),
  },
  animation: {
    label: { ko: "모션·영상", en: "Motion · video" },
    processKeys: Object.freeze([]),
  },
  other: {
    label: { ko: "기타·복합 작업", en: "Other · mixed" },
    processKeys: Object.freeze([]),
  },
});

/** 구인 분야의 이름표. 모르는 분야 키면 null을 돌려주어 호출자가 기존 문구로 폴백할 수 있게 한다. */
export function collaborationRoleBilingualLabel(role: string): BilingualLabel | null {
  return (
    (COLLABORATION_ROLE_PROCESS_MAP as Readonly<Record<string, CollaborationRoleProcessMapping>>)[
      role
    ]?.label ?? null
  );
}

/** 구인 분야가 대응하는 제작 공정 키 목록. 대응 공정이 없거나 모르는 분야면 빈 목록이다. */
export function collaborationRoleProcessKeys(role: string): readonly string[] {
  return (
    (COLLABORATION_ROLE_PROCESS_MAP as Readonly<Record<string, CollaborationRoleProcessMapping>>)[
      role
    ]?.processKeys ?? Object.freeze([])
  );
}

/** 제작 공정 키가 속한 구인 분야. 어느 분야에도 속하지 않는 공정이면 null이다. */
export function productionProcessCollaborationRole(processKey: string): CollaborationRole | null {
  const canonical = canonicalProductionProcessKey(processKey);
  for (const [role, mapping] of Object.entries(COLLABORATION_ROLE_PROCESS_MAP)) {
    if (mapping.processKeys.includes(canonical)) return role as CollaborationRole;
  }
  return null;
}

export const REVIEW_LANE_LABELS: Readonly<Record<ReviewLane, BilingualLabel>> = Object.freeze({
  narrative: { ko: "서사", en: "Narrative" },
  "canon-continuity": { ko: "설정·연속성", en: "Canon & continuity" },
  "visual-direction": { ko: "시각 연출", en: "Visual direction" },
  production: { ko: "제작", en: "Production" },
  "lettering-localization": { ko: "식자·현지화", en: "Lettering & localization" },
  accessibility: { ko: "접근성", en: "Accessibility" },
  "rights-compliance": { ko: "권리·준법", en: "Rights & compliance" },
  "client-publisher": { ko: "발주처·플랫폼", en: "Client & publisher" },
});

export function reviewLaneLabel(lane: ReviewLane, localize: ProductionLocalize): string {
  return pick(REVIEW_LANE_LABELS, lane, localize);
}

export const REVIEW_DECISION_LABELS: Readonly<Record<ReviewDecisionValue, BilingualLabel & { readonly tone: ProductionTone }>> = Object.freeze({
  approve: { ko: "승인", en: "Approved", tone: "success" },
  "approve-with-conditions": { ko: "조건부 승인", en: "Approved with conditions", tone: "warning" },
  "request-changes": { ko: "수정 요청", en: "Changes requested", tone: "warning" },
  veto: { ko: "거부", en: "Vetoed", tone: "danger" },
  abstain: { ko: "기권", en: "Abstained", tone: "neutral" },
});

export function reviewDecisionLabel(value: ReviewDecisionValue, localize: ProductionLocalize): string {
  return pick(REVIEW_DECISION_LABELS, value, localize);
}

export function reviewDecisionTone(value: ReviewDecisionValue): ProductionTone {
  return REVIEW_DECISION_LABELS[value]?.tone ?? "neutral";
}

export const CLARIFICATION_STATUS_LABELS: Readonly<Record<ClarificationStatus, BilingualLabel>> = Object.freeze({
  open: { ko: "답변 대기", en: "Awaiting answer" },
  answered: { ko: "답변됨", en: "Answered" },
  "decision-recorded": { ko: "결정 기록됨", en: "Decision recorded" },
  "accepted-risk": { ko: "위험 감수", en: "Risk accepted" },
  closed: { ko: "종료", en: "Closed" },
});

export function clarificationStatusLabel(status: ClarificationStatus, localize: ProductionLocalize): string {
  return pick(CLARIFICATION_STATUS_LABELS, status, localize);
}

export const CLARIFICATION_CATEGORY_LABELS: Readonly<Record<ClarificationCategory, BilingualLabel>> = Object.freeze({
  "narrative-ambiguity": { ko: "서사 해석", en: "Narrative" },
  "visual-reference": { ko: "시각 참고", en: "Visual reference" },
  continuity: { ko: "연속성", en: "Continuity" },
  technical: { ko: "기술", en: "Technical" },
  schedule: { ko: "일정", en: "Schedule" },
  rights: { ko: "권리", en: "Rights" },
  credit: { ko: "크레딧", en: "Credit" },
});

export function clarificationCategoryLabel(category: ClarificationCategory, localize: ProductionLocalize): string {
  return pick(CLARIFICATION_CATEGORY_LABELS, category, localize);
}

export const INSTRUCTION_PRIORITY_LABELS: Readonly<Record<CreativeInstructionPriority, BilingualLabel & { readonly tone: ProductionTone }>> = Object.freeze({
  MUST_PRESERVE: { ko: "반드시 보존", en: "Must preserve", tone: "danger" },
  INTENT: { ko: "의도", en: "Intent", tone: "accent" },
  SUGGESTION: { ko: "제안", en: "Suggestion", tone: "neutral" },
  ARTIST_CHOICE: { ko: "작가 선택", en: "Artist's choice", tone: "success" },
  REFERENCE_ONLY: { ko: "참고만", en: "Reference only", tone: "neutral" },
  DO_NOT_USE: { ko: "사용 금지", en: "Do not use", tone: "danger" },
});

export function instructionPriorityLabel(priority: CreativeInstructionPriority, localize: ProductionLocalize): string {
  return pick(INSTRUCTION_PRIORITY_LABELS, priority, localize);
}

export function instructionPriorityTone(priority: CreativeInstructionPriority): ProductionTone {
  return INSTRUCTION_PRIORITY_LABELS[priority]?.tone ?? "neutral";
}

export const LATITUDE_LABELS: Readonly<Record<CreativeLatitude, BilingualLabel>> = Object.freeze({
  exact: { ko: "그대로 지키기", en: "Keep exactly" },
  bounded: { ko: "범위 안에서 조정", en: "Adjust within bounds" },
  open: { ko: "자유롭게", en: "Open" },
  exploratory: { ko: "실험 가능", en: "Exploratory" },
});

export function latitudeLabel(latitude: CreativeLatitude, localize: ProductionLocalize): string {
  return pick(LATITUDE_LABELS, latitude, localize);
}

export const PLANNING_STATUS_LABELS: Readonly<Record<PlanningDocumentStatus, BilingualLabel>> = Object.freeze({
  draft: { ko: "초안", en: "Draft" },
  review: { ko: "검토 중", en: "In review" },
  approved: { ko: "승인됨", en: "Approved" },
  locked: { ko: "잠금", en: "Locked" },
  superseded: { ko: "대체됨", en: "Superseded" },
  archived: { ko: "보관됨", en: "Archived" },
});

export function planningStatusLabel(status: PlanningDocumentStatus, localize: ProductionLocalize): string {
  return pick(PLANNING_STATUS_LABELS, status, localize);
}

export const ASSIGNMENT_STATUS_LABELS: Readonly<Record<AssignmentStatus, BilingualLabel>> = Object.freeze({
  invited: { ko: "초대됨", en: "Invited" },
  onboarding: { ko: "합류 중", en: "Onboarding" },
  active: { ko: "참여 중", en: "Active" },
  paused: { ko: "잠시 쉼", en: "Paused" },
  ending: { ko: "종료 예정", en: "Ending" },
  ended: { ko: "종료", en: "Ended" },
});

export function assignmentStatusLabel(status: AssignmentStatus, localize: ProductionLocalize): string {
  return pick(ASSIGNMENT_STATUS_LABELS, status, localize);
}

export const SUBMISSION_STATUS_LABELS: Readonly<Record<Submission["status"], BilingualLabel>> = Object.freeze({
  submitted: { ko: "제출됨", en: "Submitted" },
  "in-review": { ko: "검수 중", en: "In review" },
  "changes-requested": { ko: "수정 요청", en: "Changes requested" },
  approved: { ko: "승인됨", en: "Approved" },
  superseded: { ko: "이전 제출본", en: "Superseded" },
});

export function submissionStatusLabel(status: Submission["status"], localize: ProductionLocalize): string {
  return pick(SUBMISSION_STATUS_LABELS, status, localize);
}

/**
 * 활동 기록(감사 기록)의 명령 이름. 서버는 명령 종류(`upsert-clarification` 등)를 그대로 남기므로
 * 화면에서는 사람이 읽는 이름으로 바꾼다. 모르는 기록은 원문을 그대로 보여 준다.
 */
/** 활동 기록에 남는 동작: 모든 클라이언트 명령 + 서버가 직접 남기는 기록. 새 명령이 생기면 이름표가 없다는 타입 오류가 난다. */
export type ProductionActivityAction = ProductionClientCommand["type"] | "project-created" | "external-review-response";

export const PRODUCTION_ACTIVITY_LABELS: Readonly<Record<ProductionActivityAction, BilingualLabel>> = Object.freeze({
  "project-created": { ko: "프로젝트 생성", en: "Project created" },
  "external-review-response": { ko: "외부 검수 응답", en: "External review response" },
  "amend-scope-package": { ko: "작업 범위 수정", en: "Scope amended" },
  "apply-automation-execution": { ko: "자동화 결과 반영", en: "Automation applied" },
  "apply-schedule-scenario": { ko: "일정 조정안 적용", en: "Schedule scenario applied" },
  "configure-collaboration": { ko: "협업 설정 변경", en: "Collaboration settings changed" },
  "configure-workflow": { ko: "공정 설정 변경", en: "Workflow settings changed" },
  "create-planning-snapshot": { ko: "기획 고정본 저장", en: "Planning snapshot saved" },
  "evaluate-risks": { ko: "위험 점검", en: "Risks evaluated" },
  "instantiate-workflow": { ko: "공정 작업 만들기", en: "Workflow tasks created" },
  "publish-scope-package": { ko: "작업 범위 확정", en: "Scope published" },
  "rebaseline-task": { ko: "작업 일정 다시 잡기", en: "Task rescheduled" },
  "record-review-decision": { ko: "검수 결정 기록", en: "Review decision recorded" },
  "set-board-order": { ko: "카드 순서 변경", en: "Card order changed" },
  "set-project-cover": { ko: "프로젝트 표지 변경", en: "Project cover changed" },
  "suppress-risk-signal": { ko: "위험 신호 숨김", en: "Risk signal suppressed" },
  "transition-risk": { ko: "위험 상태 변경", en: "Risk status changed" },
  "transition-risk-response": { ko: "위험 대응 상태 변경", en: "Risk response status changed" },
  "transition-task-batch": { ko: "작업 상태 일괄 변경", en: "Task statuses changed" },
  "update-risk-policy": { ko: "위험 기준 변경", en: "Risk policy updated" },
  "upsert-branch": { ko: "작업 갈래 저장", en: "Branch saved" },
  "upsert-change-request": { ko: "변경 요청 저장", en: "Change request saved" },
  "upsert-clarification": { ko: "질문·답변 저장", en: "Question saved" },
  "upsert-commercial-record": { ko: "계약·거래 기록 저장", en: "Commercial record saved" },
  "upsert-compensation-plan": { ko: "보상 계획 저장", en: "Compensation plan saved" },
  "upsert-contribution": { ko: "기여 기록 저장", en: "Contribution saved" },
  "upsert-credit-manifest": { ko: "크레딧 저장", en: "Credits saved" },
  "upsert-deliverable": { ko: "납품물 저장", en: "Deliverable saved" },
  "upsert-episode": { ko: "회차 저장", en: "Episode saved" },
  "upsert-episode-operations": { ko: "회차 운영 정보 저장", en: "Episode operations saved" },
  "upsert-handoff": { ko: "인계 저장", en: "Handoff saved" },
  "upsert-merge-request": { ko: "합치기 요청 저장", en: "Merge request saved" },
  "upsert-operations-record": { ko: "운영 기록 저장", en: "Operations record saved" },
  "upsert-planning-record": { ko: "기획 저장", en: "Planning saved" },
  "upsert-review-policy": { ko: "검수 기준 저장", en: "Review rules saved" },
  "upsert-rights-interest": { ko: "권리 지분 저장", en: "Rights interest saved" },
  "upsert-risk": { ko: "위험 저장", en: "Risk saved" },
  "upsert-risk-response": { ko: "위험 대응 저장", en: "Risk response saved" },
  "upsert-studio-revision-link": { ko: "원고 버전 연결", en: "Manuscript version linked" },
  "upsert-submission": { ko: "제출본 저장", en: "Submission saved" },
  "upsert-task": { ko: "작업 저장", en: "Task saved" },
  "upsert-task-batch": { ko: "작업 일괄 저장", en: "Tasks saved" },
});

function isProductionActivityAction(action: string): action is ProductionActivityAction {
  return Object.hasOwn(PRODUCTION_ACTIVITY_LABELS, action);
}

export function productionActivityLabel(action: string, localize: ProductionLocalize): string {
  return isProductionActivityAction(action) ? pick(PRODUCTION_ACTIVITY_LABELS, action, localize) : action;
}

export const ROLE_TYPE_LABELS: Readonly<Record<ProductionRoleType, BilingualLabel>> = Object.freeze({
  "story-lead": { ko: "메인 스토리 작가", en: "Story lead" },
  writer: { ko: "글 작가", en: "Writer" },
  "adaptation-writer": { ko: "각색 작가", en: "Adaptation writer" },
  "storyboard-artist": { ko: "콘티 작가", en: "Storyboard artist" },
  "art-lead": { ko: "메인 그림 작가", en: "Art lead" },
  "line-artist": { ko: "선화 작가", en: "Line artist" },
  colorist: { ko: "채색 작가", en: "Colorist" },
  "background-artist": { ko: "배경 작가", en: "Background artist" },
  letterer: { ko: "식자", en: "Letterer" },
  localizer: { ko: "현지화", en: "Localizer" },
  editor: { ko: "편집자", en: "Editor" },
  producer: { ko: "PD", en: "Producer" },
  "rights-reviewer": { ko: "권리 검토", en: "Rights reviewer" },
  assistant: { ko: "어시스턴트", en: "Assistant" },
  vendor: { ko: "외주 파트너", en: "Vendor" },
});

export function roleTypeLabel(role: ProductionRoleType, localize: ProductionLocalize): string {
  return pick(ROLE_TYPE_LABELS, role, localize);
}

export const EPISODE_STATE_LABELS: Readonly<Record<EpisodeCollaboration["state"], BilingualLabel>> = Object.freeze({
  "episode-planning": { ko: "회차 기획", en: "Planning" },
  "story-drafting": { ko: "스토리 초안", en: "Story draft" },
  "story-review": { ko: "스토리 검수", en: "Story review" },
  "story-ready-for-art": { ko: "작화 준비", en: "Ready for art" },
  "art-clarification": { ko: "작화 질문", en: "Art questions" },
  thumbnailing: { ko: "콘티 제작", en: "Storyboarding" },
  "thumbnail-joint-review": { ko: "공동 콘티 검수", en: "Storyboard review" },
  "thumbnail-locked": { ko: "콘티 확정", en: "Storyboard locked" },
  "final-art-production": { ko: "최종 작화", en: "Final art" },
  "lettering-and-integration": { ko: "식자·통합", en: "Lettering" },
  "joint-proof": { ko: "공동 교정", en: "Joint proof" },
  "publish-ready": { ko: "공개 준비", en: "Ready to publish" },
  published: { ko: "공개됨", en: "Published" },
  blocked: { ko: "막힘", en: "Blocked" },
  "paused-health": { ko: "건강 사유 휴식", en: "Health pause" },
  "paused-contract": { ko: "계약 보류", en: "Contract hold" },
  "change-request-open": { ko: "변경 검토", en: "Change review" },
  "creator-replacement": { ko: "창작자 교체", en: "Creator change" },
  cancelled: { ko: "취소", en: "Cancelled" },
});

export function episodeStateLabel(state: EpisodeCollaboration["state"], localize: ProductionLocalize): string {
  return pick(EPISODE_STATE_LABELS, state, localize);
}

export function episodeStateTone(state: EpisodeCollaboration["state"]): ProductionTone {
  if (state === "published" || state === "publish-ready") return "success";
  if (state === "blocked" || state === "cancelled") return "danger";
  if (state.startsWith("paused") || state === "change-request-open" || state === "art-clarification") return "warning";
  if (state === "story-drafting" || state === "thumbnailing" || state === "final-art-production" || state === "lettering-and-integration") return "accent";
  return "neutral";
}

/** 프로젝트 접근 역할. 설명은 "무엇을 할 수 있는지"를 사람의 말로 쓴다. */
export const PROJECT_ACCESS_ROLE_LABELS: Readonly<Record<NonNullable<ProductionProjectAccess["role"]>, BilingualLabel>> = Object.freeze({
  owner: { ko: "소유자", en: "Owner" },
  admin: { ko: "관리자", en: "Admin" },
  editor: { ko: "편집자", en: "Editor" },
  commenter: { ko: "댓글 작성자", en: "Commenter" },
  viewer: { ko: "보기 전용", en: "Viewer" },
});

export function projectAccessRoleLabel(role: ProductionProjectAccess["role"], localize: ProductionLocalize): string {
  if (!role) return localize("보기 전용", "View only");
  return pick(PROJECT_ACCESS_ROLE_LABELS, role, localize);
}

/** 참여 배정 id를 사람 이름으로. 모르는 id는 그대로 보여 준다. */
export function productionAssignmentName(
  aggregate: Pick<ProductionProjectAggregate, "assignments" | "parties">,
  assignmentId: string,
): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : undefined;
  return party?.publicDisplayName ?? assignmentId;
}

/**
 * 일정·회차 운영 라벨 정본 (schedule-labels-canonical).
 * ProductionScheduleWorkspace와 ProductionEpisodeOperationsWorkspace가 쓰던
 * 로컬 STATUS_LABEL 계열을 한곳으로 모은다 — 화면에 로컬 맵을 두지 않는다.
 */
export const TASK_STATUS_LABELS: Readonly<Record<ProductionTaskStatus, BilingualLabel>> = Object.freeze({
  draft: { ko: "초안", en: "Draft" },
  "needs-input": { ko: "입력 필요", en: "Input needed" },
  ready: { ko: "시작 가능", en: "Ready to start" },
  "in-progress": { ko: "진행 중", en: "In progress" },
  "internal-review": { ko: "내부 검수", en: "Internal review" },
  "external-review": { ko: "외부 검수", en: "External review" },
  "changes-requested": { ko: "수정 요청", en: "Changes requested" },
  "conditionally-approved": { ko: "조건부 승인", en: "Conditionally approved" },
  approved: { ko: "승인", en: "Approved" },
  done: { ko: "완료", en: "Done" },
  blocked: { ko: "차단", en: "Blocked" },
  paused: { ko: "일시 중지", en: "Paused" },
  cancelled: { ko: "취소", en: "Cancelled" },
  "out-of-scope": { ko: "범위 밖", en: "Out of scope" },
});

export function taskStatusLabel(status: ProductionTaskStatus, localize: ProductionLocalize): string {
  return pick(TASK_STATUS_LABELS, status, localize);
}

export const SCOPE_KIND_LABELS: Readonly<Record<ProductionScopeKind, BilingualLabel>> = Object.freeze({
  project: { ko: "프로젝트", en: "Project" },
  season: { ko: "시즌", en: "Season" },
  episode: { ko: "회차", en: "Episode" },
  scene: { ko: "장면", en: "Scene" },
  "scroll-segment": { ko: "스크롤", en: "Scroll segment" },
  cut: { ko: "컷", en: "Cut" },
  "layer-group": { ko: "레이어 그룹", en: "Layer group" },
  asset: { ko: "에셋", en: "Asset" },
  deliverable: { ko: "산출물", en: "Deliverable" },
});

export function scopeKindLabel(kind: ProductionScopeKind, localize: ProductionLocalize): string {
  return pick(SCOPE_KIND_LABELS, kind, localize);
}

/** 일정 위험 5단계 — 예측·예상은 근거가 있을 때만, 초과는 실제 기한을 넘겼을 때만. */
export type ScheduleRiskLevel = "normal" | "attention" | "predicted" | "forecast" | "overdue";

export const SCHEDULE_RISK_LABELS: Readonly<Record<ScheduleRiskLevel, BilingualLabel>> = Object.freeze({
  normal: { ko: "정상", en: "Normal" },
  attention: { ko: "주의", en: "Attention" },
  predicted: { ko: "예측 위험", en: "Predicted risk" },
  forecast: { ko: "예상 초과", en: "Forecast overrun" },
  overdue: { ko: "기한 초과", en: "Overdue" },
});

export function scheduleRiskLabel(risk: ScheduleRiskLevel, localize: ProductionLocalize): string {
  return pick(SCHEDULE_RISK_LABELS, risk, localize);
}

export const EPISODE_DEADLINE_HEALTH_LABELS: Readonly<Record<EpisodeDeadlineHealth, BilingualLabel>> =
  Object.freeze({
    published: { ko: "공개 완료", en: "Published" },
    critical: { ko: "즉시 조치", en: "Immediate action" },
    risk: { ko: "일정 주의", en: "Schedule risk" },
    healthy: { ko: "일정 정상", en: "On schedule" },
    unplanned: { ko: "마감 미정", en: "Unscheduled" },
  });

export function episodeDeadlineHealthLabel(health: EpisodeDeadlineHealth, localize: ProductionLocalize): string {
  return pick(EPISODE_DEADLINE_HEALTH_LABELS, health, localize);
}
