/**
 * Story Living Spec 단일 상태 저장소 공개 진입점.
 *
 * - 단일 정규화 상태 위에서 그래프·디렉토리·도큐먼트 3개 뷰를 동기화한다.
 * - 책임별 모듈(`-types`, `-core`, `-proposals`, `-review`)의 공개 API를
 *   동작 보존 상태로 재노출한다.
 */

export {
  CUT_READINESS_SLOT_KEYS,
  CUT_READINESS_SLOT_META,
  MEETING_DECISION_LABELS_KO,
  REVIEW_SEVERITY_LABELS_KO,
  STORY_NODE_PREFIXES,
  STORY_NODE_PREFIX_LABELS_KO,
  STORY_REVIEW_PERSPECTIVES,
  STORY_REVIEW_PERSPECTIVE_LABELS_KO,
  STORY_THREE_VIEWS,
  type AiChangeProposal,
  type CreateAiProposalInput,
  type CutReadinessOpenQuestion,
  type CutReadinessSlotKey,
  type CutReadinessSlotMeta,
  type CutReadinessSlots,
  type CutReadinessSummary,
  type IncrementalReviewReport,
  type MeetingDecisionItem,
  type MeetingDecisionStatus,
  type ProposalEvidenceCitation,
  type ProposalOp,
  type ProposalSource,
  type ProposalStatus,
  type ReviewFindingStatus,
  type ReviewPerspective,
  type ReviewQuickFixOption,
  type ReviewSeverity,
  type StoryAgeRating,
  type StoryGraphLayoutNode,
  type StoryLivingNode,
  type StoryLivingSpecState,
  type StoryNodeEdge,
  type StoryNodeId,
  type StoryNodePrefix,
  type StoryNodeRelation,
  type StoryNodeSnapshot,
  type StoryReviewFinding,
  type StoryRightsAssetTag,
  type StoryRightsLicenseTier,
  type StorySensitiveCue,
  type StoryThreeViewMode,
  type StoryWorkLogEntry,
  type StoryboardDriftBadge,
  type WorkLogAction,
} from "./studio-story-living-spec-types";

export {
  answerCutReadinessQuestion,
  buildStoryGraphLayout,
  computeStableContentHash,
  computeStoryNodeContentHash,
  createEmptyCutReadinessSlots,
  createStoryLivingSpecState,
  createStoryNode,
  createStoryNodeId,
  cycleStoryThreeView,
  evaluateCutReadiness,
  evaluateDriftBadges,
  formatStoryNodeKey,
  parseStoryNodeId,
  recordCanvasContentChange,
  selectStoryNode,
  setStoryActiveView,
  syncCutDriftBadge,
  toggleCutReadinessSlotVisibility,
  updateCutReadinessSlot,
} from "./studio-story-living-spec-core";

export {
  approveAiProposal,
  convertConfirmedDecisionsToProposals,
  countPendingProposals,
  draftAiProposal,
  editAndApproveAiProposal,
  enqueuePendingAiProposal,
  extractMeetingDecisions,
  rejectAiProposal,
  submitAiProposal,
} from "./studio-story-living-spec-proposals";

export {
  proposeReviewQuickFix,
  runIncrementalSixPerspectiveReview,
  triageReviewFinding,
} from "./studio-story-living-spec-review";
