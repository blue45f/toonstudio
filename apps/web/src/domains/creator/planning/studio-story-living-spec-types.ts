/**
 * Story Living Spec 도메인 타입과 불변 상수 정의.
 */

export const STORY_NODE_PREFIXES = [
  "ARC",
  "EP",
  "BEAT",
  "CUT",
  "CHAR",
  "LOC",
  "RULE",
] as const;

export type StoryNodePrefix = (typeof STORY_NODE_PREFIXES)[number];

export interface StoryNodeId {
  readonly prefix: StoryNodePrefix;
  readonly code: string;
}

export type StoryNodeRelation =
  | "parent"
  | "appears"
  | "located_at"
  | "governs"
  | "foreshadows"
  | "follows";

export interface StoryNodeEdge {
  readonly id: string;
  readonly fromKey: string;
  readonly toKey: string;
  readonly relation: StoryNodeRelation;
  readonly label?: string;
}

export const CUT_READINESS_SLOT_KEYS = [
  "location",
  "timeLighting",
  "actors",
  "emotionalBeat",
  "cameraAngleLens",
  "keyAction",
  "keyDialogue",
  "propsAndContinuity",
  "foreshadowOrRuleRef",
] as const;

export type CutReadinessSlotKey = (typeof CUT_READINESS_SLOT_KEYS)[number];

export interface CutReadinessSlotMeta {
  readonly key: CutReadinessSlotKey;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly placeholderKo: string;
}

export const CUT_READINESS_SLOT_META: readonly CutReadinessSlotMeta[] = Object.freeze([
  { key: "location", labelKo: "장소", hintKo: "컷이 펼쳐지는 공간", placeholderKo: "예: 학교 옥상 난간" },
  { key: "timeLighting", labelKo: "시간·광원", hintKo: "시간대와 주광원 방향", placeholderKo: "예: 해 질 녘 역광" },
  { key: "actors", labelKo: "등장인물", hintKo: "화면에 잡히는 인물 목록", placeholderKo: "예: 하진, 서연" },
  { key: "emotionalBeat", labelKo: "감정 목표", hintKo: "독자가 느껴야 할 핵심 감정", placeholderKo: "예: 배신감과 망설임" },
  { key: "cameraAngleLens", labelKo: "카메라 앵글·렌즈", hintKo: "샷 크기, 앵글, 초점 거리", placeholderKo: "예: 로우앵글 바스트샷 35mm" },
  { key: "keyAction", labelKo: "핵심 동작", hintKo: "인물과 사물의 중심 움직임", placeholderKo: "예: 손에 쥔 편지를 구김" },
  { key: "keyDialogue", labelKo: "핵심 대사", hintKo: "컷의 리듬을 이끄는 대표 대사", placeholderKo: "예: 처음부터 알고 있었어." },
  { key: "propsAndContinuity", labelKo: "소품·연속성", hintKo: "의상, 상처, 소품 유지 메모", placeholderKo: "예: 왼손 붕대 유지, 젖은 교복" },
  { key: "foreshadowOrRuleRef", labelKo: "복선·규칙 연결", hintKo: "세계관 규칙이나 회수할 복선", placeholderKo: "예: RULE-01 금기 발동 징후" },
]);

export interface CutReadinessOpenQuestion {
  readonly id: string;
  readonly slot: CutReadinessSlotKey;
  readonly question: string;
  readonly options: readonly string[];
  readonly aiRecommendedIndex: number;
}

export interface CutReadinessSlots {
  readonly location?: string;
  readonly timeLighting?: string;
  readonly actors?: readonly string[];
  readonly emotionalBeat?: string;
  readonly cameraAngleLens?: string;
  readonly keyAction?: string;
  readonly keyDialogue?: string;
  readonly propsAndContinuity?: string;
  readonly foreshadowOrRuleRef?: string;
  readonly hiddenSlots: readonly CutReadinessSlotKey[];
  readonly openQuestions: readonly CutReadinessOpenQuestion[];
}

export interface CutReadinessSummary {
  readonly filledCount: number;
  readonly visibleTotal: number;
  readonly totalSlots: 9;
  readonly hiddenCount: number;
  readonly ratio01: number;
  readonly percent: number;
  readonly label: string;
  readonly filledKeys: readonly CutReadinessSlotKey[];
  readonly missingKeys: readonly CutReadinessSlotKey[];
}

export type StoryRightsLicenseTier =
  | "commercial-clear"
  | "attribution-required"
  | "reference-only"
  | "unverified";

export interface StoryRightsAssetTag {
  readonly id: string;
  readonly name: string;
  readonly license: StoryRightsLicenseTier;
  readonly sourceRef?: string;
}

export type StoryAgeRating = "all" | "12+" | "15+" | "19+";

export type StorySensitiveCue =
  | "violence-graphic"
  | "profanity-strong"
  | "self-harm"
  | "sexual-explicit";

export interface StoryLivingNode {
  readonly id: StoryNodeId;
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly parentKey: string | null;
  readonly order: number;
  readonly contentHash: string;
  readonly cutSlots?: CutReadinessSlots;
  readonly dialogueLines?: readonly string[];
  readonly rightsAssets?: readonly StoryRightsAssetTag[];
  readonly sensitiveCues?: readonly StorySensitiveCue[];
  readonly updatedAt: string;
}

export interface StoryNodeSnapshot {
  readonly id?: StoryNodeId;
  readonly title?: string;
  readonly summary?: string;
  readonly parentKey?: string | null;
  readonly order?: number;
  readonly cutSlots?: CutReadinessSlots;
  readonly dialogueLines?: readonly string[];
  readonly rightsAssets?: readonly StoryRightsAssetTag[];
  readonly sensitiveCues?: readonly StorySensitiveCue[];
}

export type ProposalOp = "create" | "update" | "delete";
export type ProposalSource =
  | "studio_chat"
  | "review_fix"
  | "cross_doc_sync"
  | "external_mcp"
  | "meeting_decision";
export type ProposalStatus = "draft" | "pending" | "approved" | "rejected";

export interface ProposalEvidenceCitation {
  readonly sourceDocId: string;
  readonly quote: string;
}

export interface AiChangeProposal<T = StoryNodeSnapshot> {
  readonly id: string;
  readonly targetEntityId: string;
  readonly op: ProposalOp;
  readonly source: ProposalSource;
  readonly title: string;
  readonly rationale: string;
  readonly beforeSnapshot?: T;
  readonly proposedSnapshot?: T;
  readonly userEditedSnapshot?: T;
  readonly userEdited: boolean;
  readonly status: ProposalStatus;
  readonly evidenceCitations: readonly ProposalEvidenceCitation[];
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

export interface CreateAiProposalInput {
  readonly id?: string;
  readonly targetEntityId: string;
  readonly op: ProposalOp;
  readonly source: ProposalSource;
  readonly title: string;
  readonly rationale: string;
  readonly proposedSnapshot?: StoryNodeSnapshot;
  readonly evidenceCitations?: readonly ProposalEvidenceCitation[];
  readonly allowEmptyDocShortcut?: boolean;
  readonly createdAt?: string;
}

export interface StoryboardDriftBadge {
  readonly cutId: string;
  readonly canvasContentHash: string;
  readonly syncedScriptHash: string;
  readonly isStale: boolean;
  readonly lastSyncedAt?: string;
}

export type ReviewSeverity = "critical" | "warning" | "suggestion";

export const STORY_REVIEW_PERSPECTIVES = [
  "narrative_pacing",
  "continuity_lore",
  "visual_directing",
  "dialogue_readability",
  "rights_bom",
  "content_rating",
] as const;

export type ReviewPerspective = (typeof STORY_REVIEW_PERSPECTIVES)[number];

export const STORY_REVIEW_PERSPECTIVE_LABELS_KO: Readonly<Record<ReviewPerspective, string>> =
  Object.freeze({
    narrative_pacing: "서사·페이싱",
    continuity_lore: "설정·일관성",
    visual_directing: "연출 다양성",
    dialogue_readability: "대사 가독성",
    rights_bom: "권리·Rights BOM",
    content_rating: "심의·등급",
  });

export const REVIEW_SEVERITY_LABELS_KO: Readonly<Record<ReviewSeverity, string>> = Object.freeze({
  critical: "심각",
  warning: "주의",
  suggestion: "제안",
});

export type ReviewFindingStatus = "open" | "resolved" | "deferred";

export interface ReviewQuickFixOption {
  readonly label: string;
  readonly summary: string;
  readonly patch: StoryNodeSnapshot;
}

export interface StoryReviewFinding {
  readonly id: string;
  readonly perspective: ReviewPerspective;
  readonly severity: ReviewSeverity;
  readonly ruleCode: string;
  readonly targetNodeKey: string;
  readonly evaluatedNodeHash: string;
  readonly title: string;
  readonly message: string;
  readonly quote: string;
  readonly status: ReviewFindingStatus;
  readonly isStale: boolean;
  readonly quickFixOptions: readonly ReviewQuickFixOption[];
}

export interface IncrementalReviewReport {
  readonly evaluatedAt: string;
  readonly preservedNodeKeys: readonly string[];
  readonly reevaluatedNodeKeys: readonly string[];
  readonly openCount: number;
  readonly resolvedCount: number;
  readonly deferredCount: number;
}

export type WorkLogAction =
  | "proposal_drafted"
  | "proposal_submitted"
  | "proposal_approved"
  | "proposal_edited_approved"
  | "proposal_rejected"
  | "bootstrap_committed"
  | "slot_updated"
  | "drift_synced"
  | "meeting_extracted"
  | "review_triaged";

export interface StoryWorkLogEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: "creator" | "ai_proposal" | "meeting_sync" | "review_engine";
  readonly action: WorkLogAction;
  readonly targetEntityId: string;
  readonly summary: string;
  readonly userEdited?: boolean;
  readonly proposalId?: string;
}

export type MeetingDecisionStatus = "confirmed" | "undecided" | "rejected";

export const MEETING_DECISION_LABELS_KO: Readonly<Record<MeetingDecisionStatus, string>> =
  Object.freeze({
    confirmed: "확정",
    undecided: "미정",
    rejected: "기각",
  });

export interface MeetingDecisionItem {
  readonly id: string;
  readonly status: MeetingDecisionStatus;
  readonly summary: string;
  readonly targetEntityId: string | null;
  readonly speaker?: string;
  readonly quote: string;
  readonly sourceDocId: string;
}

export const STORY_THREE_VIEWS = ["graph", "directory", "document"] as const;
export type StoryThreeViewMode = (typeof STORY_THREE_VIEWS)[number];

export interface StoryLivingSpecState {
  readonly projectId: string;
  readonly targetRating: StoryAgeRating;
  readonly activeView: StoryThreeViewMode;
  readonly selectedNodeKey: string | null;
  readonly nodes: readonly StoryLivingNode[];
  readonly edges: readonly StoryNodeEdge[];
  readonly proposals: readonly AiChangeProposal[];
  readonly driftBadges: Readonly<Record<string, StoryboardDriftBadge>>;
  readonly reviewFindings: readonly StoryReviewFinding[];
  readonly reviewNodeHashes: Readonly<Record<string, string>>;
  readonly lastReviewReport: IncrementalReviewReport | null;
  readonly workLog: readonly StoryWorkLogEntry[];
  readonly sequence: number;
}

export const STORY_NODE_PREFIX_LABELS_KO: Readonly<Record<StoryNodePrefix, string>> = Object.freeze({
  ARC: "아크",
  EP: "회차",
  BEAT: "비트",
  CUT: "컷",
  CHAR: "인물",
  LOC: "장소",
  RULE: "규칙",
});

export interface StoryGraphLayoutNode {
  readonly node: StoryLivingNode;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
}
