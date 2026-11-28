/**
 * Wave 129 — 웹툰 연재 스튜디오 협업 레드라인 핀 교정 마크업·역할별 수정 라운드 합의 & PD 출고 승인 게이트 타입 계약.
 *
 * - 7개 스튜디오 협업 역할 및 검수 권한 역할(담당 PD · 아트 디렉터) 정의
 * - 6개 교정 카테고리, 3단계 심각도, 5단계 상태 머신 및 거부 사유 코드 정의
 * - 공간 중복·상충 핀 군집, 수정 라운드 차분, PD 출고 승인 게이트 결과 계약 정의
 */

export type StudioCollaboratorRole =
  | "pd-editor"
  | "art-director"
  | "lead-artist"
  | "inker"
  | "colorist"
  | "typesetter"
  | "bg3d-artist";

export const STUDIO_COLLABORATOR_ROLES: readonly StudioCollaboratorRole[] = [
  "pd-editor",
  "art-director",
  "lead-artist",
  "inker",
  "colorist",
  "typesetter",
  "bg3d-artist",
];

export const STUDIO_VERIFIER_ROLES: readonly StudioCollaboratorRole[] = [
  "pd-editor",
  "art-director",
];

export const STUDIO_ROLE_LABELS_KO: Readonly<Record<StudioCollaboratorRole, string>> = {
  "pd-editor": "담당 PD",
  "art-director": "아트 디렉터",
  "lead-artist": "메인 작가",
  inker: "선화",
  colorist: "채색",
  typesetter: "식자",
  "bg3d-artist": "3D 배경",
};

export type RedlinePinCategory =
  | "anatomy"
  | "continuity"
  | "coloring"
  | "typesetting"
  | "censorship-rating"
  | "background";

export const REDLINE_PIN_CATEGORIES: readonly RedlinePinCategory[] = [
  "anatomy",
  "continuity",
  "coloring",
  "typesetting",
  "censorship-rating",
  "background",
];

export const REDLINE_CATEGORY_LABELS_KO: Readonly<Record<RedlinePinCategory, string>> = {
  anatomy: "인체·비율",
  continuity: "연속성",
  coloring: "채색·조명",
  typesetting: "식자·말풍선",
  "censorship-rating": "심의·등급",
  background: "배경·투시",
};

export type RedlinePinSeverity = "blocker" | "major" | "polish";

export const REDLINE_PIN_SEVERITIES: readonly RedlinePinSeverity[] = [
  "blocker",
  "major",
  "polish",
];

export const REDLINE_SEVERITY_LABELS_KO: Readonly<Record<RedlinePinSeverity, string>> = {
  blocker: "출고 차단",
  major: "주요 수정",
  polish: "마감 보완",
};

export const REDLINE_SEVERITY_BADGE_LABELS: Readonly<Record<RedlinePinSeverity, string>> = {
  blocker: "BLOCKER",
  major: "MAJOR",
  polish: "POLISH",
};

export type RedlinePinStatus =
  | "open"
  | "in-progress"
  | "resolved-pending-verify"
  | "verified-closed"
  | "reopened";

export const REDLINE_PIN_STATUSES: readonly RedlinePinStatus[] = [
  "open",
  "in-progress",
  "resolved-pending-verify",
  "verified-closed",
  "reopened",
];

export const REDLINE_STATUS_LABELS_KO: Readonly<Record<RedlinePinStatus, string>> = {
  open: "미착수",
  "in-progress": "수정 중",
  "resolved-pending-verify": "검수 대기",
  "verified-closed": "검수 완료",
  reopened: "재수정 요청",
};

export type RedlineTransitionRejectionCode =
  | "INVALID_STATE_TRANSITION"
  | "SELF_APPROVAL_FORBIDDEN"
  | "INSUFFICIENT_VERIFIER_ROLE"
  | "REOPEN_REASON_REQUIRED"
  | "INVALID_ACTOR_ID"
  | "MISSING_RESOLVER_ACTOR";

export interface RedlinePinTransitionEvent {
  readonly sequence: number;
  readonly fromStatus: RedlinePinStatus;
  readonly toStatus: RedlinePinStatus;
  readonly actorId: string;
  readonly actorRole: StudioCollaboratorRole;
  readonly roundNumber: number;
  readonly reasonKo?: string;
  readonly timestampIso?: string;
}

export interface RedlinePinItem {
  readonly pinId: string;
  readonly cutId: string;
  readonly normX: number;
  readonly normY: number;
  readonly category: RedlinePinCategory;
  readonly severity: RedlinePinSeverity;
  readonly authorId: string;
  readonly authorRole: StudioCollaboratorRole;
  readonly assigneeRole: StudioCollaboratorRole;
  readonly noteKo: string;
  readonly roundNumber: number;
  readonly status: RedlinePinStatus;
  readonly claimedByActorId?: string;
  readonly resolvedByActorId?: string;
  readonly resolvedByRole?: StudioCollaboratorRole;
  readonly verifiedByActorId?: string;
  readonly verifiedByRole?: StudioCollaboratorRole;
  readonly reopenCount?: number;
  readonly lastReopenReasonKo?: string;
  readonly history?: readonly RedlinePinTransitionEvent[];
}

export interface RedlinePinTransitionInput {
  readonly targetStatus: RedlinePinStatus;
  readonly actorId: string;
  readonly actorRole: StudioCollaboratorRole;
  readonly reasonKo?: string;
  readonly roundNumber?: number;
  readonly timestampIso?: string;
  readonly requireResolverActorId?: boolean;
}

export interface RedlinePinTransitionResult {
  readonly rejected: boolean;
  readonly rejectionCode?: RedlineTransitionRejectionCode;
  readonly reasonKo?: string;
  readonly previousStatus: RedlinePinStatus;
  readonly nextStatus: RedlinePinStatus;
  readonly pin: RedlinePinItem;
  readonly event?: RedlinePinTransitionEvent;
}

export interface RedlineClusterDetectionOptions {
  readonly clusterRadiusNorm?: number;
  readonly activeOnly?: boolean;
}

export interface RedlinePinCluster {
  readonly clusterId: string;
  readonly cutId: string;
  readonly pinIds: readonly string[];
  readonly pinCount: number;
  readonly centroidNormX: number;
  readonly centroidNormY: number;
  readonly boundingRadiusNorm: number;
  readonly minPairwiseDistanceNorm: number;
  readonly maxPairwiseDistanceNorm: number;
  readonly distinctAuthorIds: readonly string[];
  readonly distinctAssigneeRoles: readonly StudioCollaboratorRole[];
  readonly distinctCategories: readonly RedlinePinCategory[];
  readonly hasActivePin: boolean;
  readonly potentialConflict: boolean;
  readonly conflictSummaryKo: string;
}

export interface RedlineOverlapDetectionResult {
  readonly clusterRadiusNorm: number;
  readonly evaluatedPinCount: number;
  readonly clusters: readonly RedlinePinCluster[];
  readonly overlappingPinIds: readonly string[];
  readonly conflictClusterCount: number;
  readonly potentialConflictPinIds: readonly string[];
}

export interface RoleRemainingDetail {
  readonly role: StudioCollaboratorRole;
  readonly labelKo: string;
  readonly total: number;
  readonly blocker: number;
  readonly major: number;
  readonly polish: number;
  readonly open: number;
  readonly inProgress: number;
  readonly pendingVerify: number;
  readonly reopened: number;
  readonly pinIds: readonly string[];
}

export interface RevisionRoundDiffOptions {
  readonly fromRoundNumber?: number;
  readonly toRoundNumber?: number;
}

export interface RevisionRoundDiffResult {
  readonly fromRoundNumber: number;
  readonly toRoundNumber: number;
  readonly addedPinIds: readonly string[];
  readonly removedPinIds: readonly string[];
  readonly closedPinIds: readonly string[];
  readonly reopenedPinIds: readonly string[];
  readonly progressedPinIds: readonly string[];
  readonly unchangedPinIds: readonly string[];
  readonly remainingByRole: Readonly<Record<StudioCollaboratorRole, number>>;
  readonly remainingDetailByRole: Readonly<Record<StudioCollaboratorRole, RoleRemainingDetail>>;
  readonly roundATotalCount: number;
  readonly roundBTotalCount: number;
  readonly roundARemainingCount: number;
  readonly roundBRemainingCount: number;
  readonly netRemainingDelta: number;
  readonly closureRateRatio: number;
  readonly roundALedgerSha256Hex: string;
  readonly roundBLedgerSha256Hex: string;
}

export type EpisodeSignOffDecision =
  | "approved"
  | "conditional-pass-with-polish"
  | "blocked";

export type EpisodeSignOffBlockingCode =
  | "UNRESOLVED_BLOCKER_PINS"
  | "UNRESOLVED_MAJOR_PINS"
  | "UNRESOLVED_POLISH_PINS"
  | "UNRESOLVED_PIN_CONFLICT";

export interface EpisodeSignOffOptions {
  readonly episodeId?: string;
  readonly episodeTitleKo?: string;
  readonly roundNumber?: number;
  readonly allowUnresolvedPolish?: boolean;
  readonly allowUnresolvedMajor?: boolean;
  readonly blockOnPotentialConflicts?: boolean;
  readonly clusterRadiusNorm?: number;
}

export interface EpisodeRevisionSignOffResult {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly roundNumber: number;
  readonly episodeSignOffReady: boolean;
  readonly signOffDecision: EpisodeSignOffDecision;
  readonly blockingCodes: readonly EpisodeSignOffBlockingCode[];
  readonly blockingReasonsKo: readonly string[];
  readonly advisoryNotesKo: readonly string[];
  readonly totalPinCount: number;
  readonly closedPinCount: number;
  readonly remainingPinCount: number;
  readonly completionRatio: number;
  readonly unresolvedBySeverity: Readonly<Record<RedlinePinSeverity, number>>;
  readonly totalBySeverity: Readonly<Record<RedlinePinSeverity, number>>;
  readonly countsByStatus: Readonly<Record<RedlinePinStatus, number>>;
  readonly remainingByRole: Readonly<Record<StudioCollaboratorRole, number>>;
  readonly remainingDetailByRole: Readonly<Record<StudioCollaboratorRole, RoleRemainingDetail>>;
  readonly unresolvedBlockerPinIds: readonly string[];
  readonly unresolvedMajorPinIds: readonly string[];
  readonly unresolvedPolishPinIds: readonly string[];
  readonly deferredPolishPinIds: readonly string[];
  readonly overlapReport: RedlineOverlapDetectionResult;
  readonly activeConflictClusterCount: number;
  readonly ledgerSha256Hex: string;
}

export interface RedlineRevisionBoardSvgOptions {
  readonly titleKo?: string;
  readonly featuredCutId?: string;
  readonly maxLegendRows?: number;
}

export interface RedlineRevisionLedgerSession {
  readonly getPins: () => readonly RedlinePinItem[];
  readonly getPin: (pinId: string) => RedlinePinItem | undefined;
  readonly transitionPin: (
    pinId: string,
    input: RedlinePinTransitionInput,
  ) => RedlinePinTransitionResult | undefined;
  readonly evaluateSignOff: (
    overrideOptions?: EpisodeSignOffOptions,
  ) => EpisodeRevisionSignOffResult;
  readonly getLedgerSha256Hex: () => string;
  readonly snapshot: () => readonly RedlinePinItem[];
}
