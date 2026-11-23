/**
 * 다중 직무 결재선 및 컷별 부분 승인/반려 엔진 (순수 로컬 상태, 외부 서버 호출 0건).
 *
 * - 7단계 한국 웹툰 결재선: conti -> lineart -> bg3d -> flatting -> shading -> lettering -> pd-final
 * - 순차(sequential) 및 병렬(parallel, 예: 선화 + 3D배경 동시 진행) 게이트 전환 지원
 * - 컷별 독립 상태(cut-01..cut-12): 특정 컷이 반려되어도 이미 승인된 타 컷의 승인은 무효화되지 않는다.
 */

export type SignoffStageId = "conti" | "lineart" | "bg3d" | "flatting" | "shading" | "lettering" | "pd-final";
export type SignoffGateMode = "sequential" | "parallel";
export type CutSignoffStatus = "pending" | "in-review" | "approved" | "changes-requested";
export type RejectionReasonTag = "art" | "lettering" | "pacing" | "color" | "rating";
export type SignoffDecisionSource = "studio-internal" | "external-pd";
export type EpisodeSignoffOverallStatus = "in-progress" | "changes-requested" | "ready-to-advance" | "final-approved";

export interface SignoffStageMeta {
  readonly id: SignoffStageId;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly roleKo: string;
  readonly roleEn: string;
  readonly defaultSlaMinutes: number;
  readonly defaultAssigneeName: string;
}

export interface RejectionReasonMeta {
  readonly id: RejectionReasonTag;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface SignoffGateDefinition {
  readonly stageId: SignoffStageId;
  readonly order: number;
  readonly mode: SignoffGateMode;
  readonly parallelGroupId?: string;
  readonly requiredPredecessors: readonly SignoffStageId[];
}

export interface InternalStudioNote {
  readonly id: string;
  readonly authorName: string;
  readonly authorRole: string;
  readonly body: string;
  readonly createdAtIso: string;
  readonly cutId?: string;
}

export interface CutSignoffHistoryEntry {
  readonly stageId: SignoffStageId;
  readonly status: CutSignoffStatus;
  readonly reviewerName: string;
  readonly reasonTags: readonly RejectionReasonTag[];
  readonly comment: string;
  readonly decisionSource: SignoffDecisionSource;
  readonly decidedAtIso: string;
}

export interface CutStageSignoffState {
  readonly stageId: SignoffStageId;
  readonly status: CutSignoffStatus;
  readonly assigneeName: string;
  readonly reviewerName?: string;
  readonly reasonTags: readonly RejectionReasonTag[];
  readonly comment: string;
  readonly decisionSource: SignoffDecisionSource;
  readonly updatedAtIso: string;
  readonly approvedAtIso?: string;
  readonly revisionCount: number;
  readonly history: readonly CutSignoffHistoryEntry[];
}

export interface EpisodeCutItem {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneTitleKo: string;
  readonly sceneTitleEn: string;
  readonly externalPreviewNoteKo: string;
  readonly externalPreviewNoteEn: string;
  readonly internalStudioNotes: readonly InternalStudioNote[];
  readonly stageStates: Readonly<Record<SignoffStageId, CutStageSignoffState>>;
}

export interface GateTransitionRecord {
  readonly fromStageIds: readonly SignoffStageId[];
  readonly toStageIds: readonly SignoffStageId[];
  readonly transitionedAtIso: string;
  readonly triggeredByCutId: string;
  readonly triggeredByReviewer: string;
}

export interface EpisodeSignoffBoard {
  readonly episodeId: string;
  readonly workTitle: string;
  readonly episodeTitle: string;
  readonly gates: readonly SignoffGateDefinition[];
  readonly activeStageIds: readonly SignoffStageId[];
  readonly completedStageIds: readonly SignoffStageId[];
  readonly episodeStatus: EpisodeSignoffOverallStatus;
  readonly cuts: readonly EpisodeCutItem[];
  readonly internalNotes: readonly InternalStudioNote[];
  readonly gateTransitionLog: readonly GateTransitionRecord[];
  readonly updatedAtIso: string;
}

export interface CutSignoffDecisionInput {
  readonly cutId: string;
  readonly stageId?: SignoffStageId;
  readonly status: CutSignoffStatus;
  readonly reviewerName: string;
  readonly reasonTags?: readonly RejectionReasonTag[];
  readonly comment?: string;
  readonly decisionSource?: SignoffDecisionSource;
  readonly decidedAtIso?: string;
  /** 선행 필수 단계 완료·미해결 반려 0건 충족 시 다음 결재선 자동 승격 여부 (기본값 true). */
  readonly autoAdvance?: boolean;
}

export interface GateAdvancementCheckResult {
  readonly canAdvance: boolean;
  readonly isEpisodeFullyApproved: boolean;
  readonly activeStageIds: readonly SignoffStageId[];
  readonly completedStageIds: readonly SignoffStageId[];
  readonly nextStageIds: readonly SignoffStageId[];
  readonly blockedByStageIds: readonly SignoffStageId[];
  readonly unresolvedRejectionCount: number;
  readonly pendingCutCount: number;
  readonly rejectedCutIdsByStage: Readonly<Partial<Record<SignoffStageId, readonly string[]>>>;
  readonly pendingCutIdsByStage: Readonly<Partial<Record<SignoffStageId, readonly string[]>>>;
  readonly blockingReasonsKo: readonly string[];
  readonly blockingReasonsEn: readonly string[];
}

export interface StageProgressSummary {
  readonly stageId: SignoffStageId;
  readonly mode: SignoffGateMode;
  readonly parallelGroupId?: string;
  readonly totalCuts: number;
  readonly approvedCount: number;
  readonly rejectedCount: number;
  readonly inReviewCount: number;
  readonly pendingCount: number;
  readonly completionPct: number;
  readonly isComplete: boolean;
  readonly isUnlocked: boolean;
  readonly isActive: boolean;
}

export interface BoardOverviewSummary {
  readonly totalStages: number;
  readonly completedStageCount: number;
  readonly totalCuts: number;
  readonly activeStageApprovedCuts: number;
  readonly activeStageRejectedCuts: number;
  readonly overallCompletionPct: number;
  readonly activeStageIds: readonly SignoffStageId[];
  readonly episodeStatus: EpisodeSignoffOverallStatus;
}

export interface CreateEpisodeSignoffBoardOptions {
  readonly episodeId?: string;
  readonly workTitle?: string;
  readonly episodeTitle?: string;
  readonly cutCount?: number;
  readonly parallelLineartAndBg3d?: boolean;
  readonly preset?: "fresh" | "in-progress";
  readonly timestampIso?: string;
}

export const SIGNOFF_STAGE_ORDER: readonly SignoffStageId[] = [
  "conti", "lineart", "bg3d", "flatting", "shading", "lettering", "pd-final",
];

export const SIGNOFF_STAGE_META: Readonly<Record<SignoffStageId, SignoffStageMeta>> = {
  conti: { id: "conti", order: 1, labelKo: "콘티", labelEn: "Storyboard", roleKo: "메인 작가", roleEn: "Lead Author", defaultSlaMinutes: 45, defaultAssigneeName: "정하윤 작가" },
  lineart: { id: "lineart", order: 2, labelKo: "선화", labelEn: "Lineart", roleKo: "선화 어시스턴트", roleEn: "Lineart Artist", defaultSlaMinutes: 90, defaultAssigneeName: "박도현 어시" },
  bg3d: { id: "bg3d", order: 3, labelKo: "3D 배경", labelEn: "3D Background", roleKo: "배경 어시스턴트", roleEn: "3D BG Artist", defaultSlaMinutes: 75, defaultAssigneeName: "이채린 어시" },
  flatting: { id: "flatting", order: 4, labelKo: "밑색", labelEn: "Flatting", roleKo: "채색 어시스턴트", roleEn: "Flatting Artist", defaultSlaMinutes: 60, defaultAssigneeName: "윤서우 어시" },
  shading: { id: "shading", order: 5, labelKo: "명암·후보정", labelEn: "Shading & FX", roleKo: "후보정 담당", roleEn: "Shading Artist", defaultSlaMinutes: 85, defaultAssigneeName: "최지안 담당" },
  lettering: { id: "lettering", order: 6, labelKo: "식자·효과음", labelEn: "Lettering & SFX", roleKo: "식자 담당", roleEn: "Letterer", defaultSlaMinutes: 40, defaultAssigneeName: "강민재 식자" },
  "pd-final": { id: "pd-final", order: 7, labelKo: "PD 최종", labelEn: "PD Final", roleKo: "담당 PD", roleEn: "Managing PD", defaultSlaMinutes: 50, defaultAssigneeName: "김서연 PD" },
};

export const REJECTION_REASON_TAGS: readonly RejectionReasonTag[] = ["art", "lettering", "pacing", "color", "rating"];

export const REJECTION_REASON_META: Readonly<Record<RejectionReasonTag, RejectionReasonMeta>> = {
  art: { id: "art", labelKo: "작화·인체", labelEn: "Art & Anatomy" },
  lettering: { id: "lettering", labelKo: "식자·말풍선", labelEn: "Lettering" },
  pacing: { id: "pacing", labelKo: "연출·스크롤 템포", labelEn: "Pacing" },
  color: { id: "color", labelKo: "채색·톤 일관성", labelEn: "Color & Tone" },
  rating: { id: "rating", labelKo: "심의·표현 수위", labelEn: "Content Rating" },
};

const VALID_REASON_TAG_SET: ReadonlySet<string> = new Set(REJECTION_REASON_TAGS);
const DEFAULT_TIMESTAMP_ISO = "2026-11-23T09:00:00+09:00";

const DEFAULT_CUT_SCENES: readonly {
  readonly titleKo: string;
  readonly titleEn: string;
  readonly previewKo: string;
  readonly previewEn: string;
}[] = [
  { titleKo: "공방 옥상 야경 도입", titleEn: "Rooftop Atelier Opening", previewKo: "세로 도입부 원경과 회차 타이틀 배치", previewEn: "Establishing vertical skyline with episode title" },
  { titleKo: "주인공 계약서 발견", titleEn: "Contract Discovery", previewKo: "책상 위 봉인 서류 클로즈업 컷", previewEn: "Close-up of sealed contract on desk" },
  { titleKo: "파트너 등장 리액션", titleEn: "Partner Entrance Reaction", previewKo: "말풍선 2단 분배 및 시선 유도 확인", previewEn: "Two-tier balloon split and eye-line flow" },
  { titleKo: "복도 대치 투샷", titleEn: "Hallway Confrontation", previewKo: "3D 복도 소실점과 인물 투시 정합", previewEn: "3D hallway vanishing point with character perspective" },
  { titleKo: "회상 컷 전환 여백", titleEn: "Flashback Transition Gutter", previewKo: "스크롤 호흡을 위한 암전 그라데이션", previewEn: "Dark gutter fade for scroll pacing" },
  { titleKo: "마법진 점등 롱컷", titleEn: "Sigil Ignition Long Cut", previewKo: "종스크롤 세로 2화면 분량 강조 컷", previewEn: "Double-viewport vertical accent panel" },
  { titleKo: "검집 발도 클로즈업", titleEn: "Blade Draw Close-Up", previewKo: "손가락 파지 각도 및 속도선 강조", previewEn: "Hand grip angle and speedline emphasis" },
  { titleKo: "충격파 배경 붕괴", titleEn: "Shockwave Debris", previewKo: "3D 파편 레이어와 효과음 중첩 정리", previewEn: "3D debris layer with SFX separation" },
  { titleKo: "조력자 대사 반전", titleEn: "Ally Twist Dialogue", previewKo: "핵심 반전 대사 가독성·줄바꿈 확인", previewEn: "Key twist dialogue legibility and line breaks" },
  { titleKo: "적대 세력 실루엣", titleEn: "Antagonist Silhouette", previewKo: "역광 림라이트와 심의 수위 점검", previewEn: "Rim lighting and rating compliance check" },
  { titleKo: "절벽 끝 대치 풀샷", titleEn: "Cliff Edge Standoff", previewKo: "원경 대비와 인물 명도 분리", previewEn: "Background contrast and figure value separation" },
  { titleKo: "엔딩 절단 훅 컷", titleEn: "Cliffhanger Ending Hook", previewKo: "다음 화 예고 연결 클로즈업 컷", previewEn: "Final hook close-up into next-episode teaser" },
];

export function isRejectionReasonTag(value: string): value is RejectionReasonTag {
  return VALID_REASON_TAG_SET.has(value);
}

export function sanitizeRejectionReasonTags(
  tags: readonly string[] | undefined,
  fallbackIfEmpty: readonly RejectionReasonTag[] = [],
): readonly RejectionReasonTag[] {
  const unique: RejectionReasonTag[] = [];
  if (tags) {
    for (const raw of tags) {
      if (isRejectionReasonTag(raw) && !unique.includes(raw)) unique.push(raw);
    }
  }
  return unique.length > 0 ? unique : fallbackIfEmpty;
}

/** 기본 7단계 결재선 생성 (`parallelLineartAndBg3d = true` 시 선화+3D배경 병렬 진행). */
export function createSignoffGates(parallelLineartAndBg3d = true): readonly SignoffGateDefinition[] {
  if (!parallelLineartAndBg3d) {
    return [
      { stageId: "conti", order: 1, mode: "sequential", requiredPredecessors: [] },
      { stageId: "lineart", order: 2, mode: "sequential", requiredPredecessors: ["conti"] },
      { stageId: "bg3d", order: 3, mode: "sequential", requiredPredecessors: ["lineart"] },
      { stageId: "flatting", order: 4, mode: "sequential", requiredPredecessors: ["bg3d"] },
      { stageId: "shading", order: 5, mode: "sequential", requiredPredecessors: ["flatting"] },
      { stageId: "lettering", order: 6, mode: "sequential", requiredPredecessors: ["shading"] },
      { stageId: "pd-final", order: 7, mode: "sequential", requiredPredecessors: ["lettering"] },
    ];
  }
  return [
    { stageId: "conti", order: 1, mode: "sequential", requiredPredecessors: [] },
    { stageId: "lineart", order: 2, mode: "parallel", parallelGroupId: "art-foundation", requiredPredecessors: ["conti"] },
    { stageId: "bg3d", order: 3, mode: "parallel", parallelGroupId: "art-foundation", requiredPredecessors: ["conti"] },
    { stageId: "flatting", order: 4, mode: "sequential", requiredPredecessors: ["lineart", "bg3d"] },
    { stageId: "shading", order: 5, mode: "sequential", requiredPredecessors: ["flatting"] },
    { stageId: "lettering", order: 6, mode: "sequential", requiredPredecessors: ["shading"] },
    { stageId: "pd-final", order: 7, mode: "sequential", requiredPredecessors: ["lettering"] },
  ];
}

function isAllCutsApprovedInStage(cuts: readonly EpisodeCutItem[], stageId: SignoffStageId): boolean {
  return cuts.length > 0 && cuts.every((cut) => cut.stageStates[stageId].status === "approved");
}

function computeCompletedStageSet(
  gates: readonly SignoffGateDefinition[],
  cuts: readonly EpisodeCutItem[],
): Set<SignoffStageId> {
  const completed = new Set<SignoffStageId>();
  for (const gate of [...gates].sort((a, b) => a.order - b.order)) {
    const predecessorsDone = gate.requiredPredecessors.every((pred) => completed.has(pred));
    if (predecessorsDone && isAllCutsApprovedInStage(cuts, gate.stageId)) {
      completed.add(gate.stageId);
    }
  }
  return completed;
}

function computeUnlockedIncompleteStageIds(
  gates: readonly SignoffGateDefinition[],
  completed: ReadonlySet<SignoffStageId>,
): readonly SignoffStageId[] {
  const unlocked: SignoffStageId[] = [];
  for (const gate of [...gates].sort((a, b) => a.order - b.order)) {
    if (!completed.has(gate.stageId) && gate.requiredPredecessors.every((pred) => completed.has(pred))) {
      unlocked.push(gate.stageId);
    }
  }
  return unlocked;
}

function deriveOverallStatus(
  gates: readonly SignoffGateDefinition[],
  cuts: readonly EpisodeCutItem[],
  activeStageIds: readonly SignoffStageId[],
  completed: ReadonlySet<SignoffStageId>,
  nextUnlockableIds: readonly SignoffStageId[],
): EpisodeSignoffOverallStatus {
  if (gates.length > 0 && gates.every((gate) => completed.has(gate.stageId))) return "final-approved";
  if (activeStageIds.some((stageId) => cuts.some((cut) => cut.stageStates[stageId].status === "changes-requested"))) {
    return "changes-requested";
  }
  if (nextUnlockableIds.some((stageId) => !activeStageIds.includes(stageId))) return "ready-to-advance";
  return "in-progress";
}

function createEmptyStageState(stageId: SignoffStageId, timestampIso: string): CutStageSignoffState {
  return {
    stageId,
    status: "pending",
    assigneeName: SIGNOFF_STAGE_META[stageId].defaultAssigneeName,
    reasonTags: [],
    comment: "",
    decisionSource: "studio-internal",
    updatedAtIso: timestampIso,
    revisionCount: 0,
    history: [],
  };
}

function createEmptyStageStates(timestampIso: string): Record<SignoffStageId, CutStageSignoffState> {
  return {
    conti: createEmptyStageState("conti", timestampIso),
    lineart: createEmptyStageState("lineart", timestampIso),
    bg3d: createEmptyStageState("bg3d", timestampIso),
    flatting: createEmptyStageState("flatting", timestampIso),
    shading: createEmptyStageState("shading", timestampIso),
    lettering: createEmptyStageState("lettering", timestampIso),
    "pd-final": createEmptyStageState("pd-final", timestampIso),
  };
}

/**
 * 회차 다중 직무 결재 보드 생성기.
 * - `preset: "fresh"`는 모든 컷이 `conti` 대기 상태인 깨끗한 보드 반환
 * - `preset: "in-progress"`(기본값)는 콘티 승인 완료 -> 선화+3D배경 병렬 진행, cut-07만 부분 반려된 현실적 보드 반환
 */
export function createInitialEpisodeSignoffBoard(
  options: CreateEpisodeSignoffBoardOptions = {},
): EpisodeSignoffBoard {
  const cutCount = Math.max(1, Math.min(24, Math.floor(options.cutCount ?? 12)));
  const parallel = options.parallelLineartAndBg3d ?? true;
  const preset = options.preset ?? "in-progress";
  const timestampIso = options.timestampIso ?? DEFAULT_TIMESTAMP_ISO;
  const gates = createSignoffGates(parallel);

  const cuts: EpisodeCutItem[] = Array.from({ length: cutCount }, (_, idx) => {
    const cutNumber = idx + 1;
    const cutId = `cut-${String(cutNumber).padStart(2, "0")}`;
    const tpl = DEFAULT_CUT_SCENES[idx % DEFAULT_CUT_SCENES.length];
    const internalStudioNotes: InternalStudioNote[] =
      cutNumber === 4
        ? [{ id: `note-${cutId}-1`, authorName: "이채린 어시", authorRole: "배경 어시스턴트", body: "내부잡담: 복도 소품 텍스처 임시 저해상도 파일 먼저 올렸습니다. 외부 PD 노출 금지!", createdAtIso: timestampIso, cutId }]
        : cutNumber === 7
          ? [{ id: `note-${cutId}-1`, authorName: "박도현 어시", authorRole: "선화 어시스턴트", body: "내부메모: 야근 작업이라 손가락 비율 재확인 필요. 정산 단가 건은 팀장님 별도 공유.", createdAtIso: timestampIso, cutId }]
          : [];
    return {
      cutId,
      cutNumber,
      sceneTitleKo: tpl.titleKo,
      sceneTitleEn: tpl.titleEn,
      externalPreviewNoteKo: tpl.previewKo,
      externalPreviewNoteEn: tpl.previewEn,
      internalStudioNotes,
      stageStates: createEmptyStageStates(timestampIso),
    };
  });

  const internalNotes: readonly InternalStudioNote[] = [
    { id: "studio-note-schedule", authorName: "정하윤 작가", authorRole: "메인 작가", body: "내부공지: 이번 주 원고 마감 야근 식대 영수증은 금요일 오전까지 팀 공유 폴더에 제출해 주세요.", createdAtIso: timestampIso },
    { id: "studio-note-assist", authorName: "윤서우 어시", authorRole: "채색 어시스턴트", body: "어시메모: 선화 7컷 반려 풀리면 바로 밑색 착수합니다. 출판사 편집자 전달 전 내부 톤 시트 숨김 필수.", createdAtIso: timestampIso },
  ];

  let board: EpisodeSignoffBoard = {
    episodeId: options.episodeId?.trim() || "ep-014",
    workTitle: options.workTitle?.trim() || "달빛 공방의 계약자",
    episodeTitle: options.episodeTitle?.trim() || "EP.14 봉인의 균열",
    gates,
    activeStageIds: ["conti"],
    completedStageIds: [],
    episodeStatus: "in-progress",
    cuts,
    internalNotes,
    gateTransitionLog: [],
    updatedAtIso: timestampIso,
  };

  if (preset === "fresh") return board;

  for (const cut of board.cuts) {
    board = recordCutSignoffDecision(board, {
      cutId: cut.cutId, stageId: "conti", status: "approved", reviewerName: "정하윤 작가",
      comment: "콘티 동선 및 스크롤 호흡 확정", decidedAtIso: "2026-11-23T09:10:00+09:00",
    });
  }

  for (const cut of board.cuts) {
    if (cut.cutNumber <= 6) {
      board = recordCutSignoffDecision(board, { cutId: cut.cutId, stageId: "lineart", status: "approved", reviewerName: "정하윤 작가", comment: "선화 밀도 통과", decidedAtIso: "2026-11-23T10:20:00+09:00" });
    } else if (cut.cutNumber === 7) {
      board = recordCutSignoffDecision(board, { cutId: cut.cutId, stageId: "lineart", status: "changes-requested", reviewerName: "정하윤 작가", reasonTags: ["art"], comment: "오른손 검집 파지 각도와 손목 굵기 보정 요청", decidedAtIso: "2026-11-23T10:35:00+09:00" });
    } else if (cut.cutNumber <= 10) {
      board = recordCutSignoffDecision(board, { cutId: cut.cutId, stageId: "lineart", status: "in-review", reviewerName: "정하윤 작가", comment: "선화 1차 검수 대기", decidedAtIso: "2026-11-23T10:40:00+09:00" });
    }
    if (parallel) {
      if (cut.cutNumber <= 9) {
        board = recordCutSignoffDecision(board, { cutId: cut.cutId, stageId: "bg3d", status: "approved", reviewerName: "정하윤 작가", comment: "3D 카메라 화각·소실점 정합 완료", decidedAtIso: "2026-11-23T10:50:00+09:00" });
      } else if (cut.cutNumber === 10) {
        board = recordCutSignoffDecision(board, { cutId: cut.cutId, stageId: "bg3d", status: "in-review", reviewerName: "정하윤 작가", comment: "역광 3D 셰이더 톤 확인 중", decidedAtIso: "2026-11-23T10:55:00+09:00" });
      }
    }
  }
  return board;
}

/** 선행 필수 단계 완료 및 컷별 미해결 반려 0건 여부를 검사해 다음 결재선 승격 가능성을 판정한다. */
export function canAdvanceEpisodeToNextGate(
  board: EpisodeSignoffBoard,
  inspectStageId?: SignoffStageId,
): GateAdvancementCheckResult {
  const completedSet = computeCompletedStageSet(board.gates, board.cuts);
  const completedStageIds = SIGNOFF_STAGE_ORDER.filter((id) => completedSet.has(id));
  const isEpisodeFullyApproved =
    board.gates.length > 0 && board.gates.every((gate) => completedSet.has(gate.stageId));
  const unlockedIncomplete = computeUnlockedIncompleteStageIds(board.gates, completedSet);
  const stagesToInspect: readonly SignoffStageId[] = inspectStageId
    ? [inspectStageId]
    : board.activeStageIds.length > 0
      ? board.activeStageIds
      : unlockedIncomplete;

  const rejectedCutIdsByStage: Partial<Record<SignoffStageId, readonly string[]>> = {};
  const pendingCutIdsByStage: Partial<Record<SignoffStageId, readonly string[]>> = {};
  const blockedByStageIds: SignoffStageId[] = [];
  const blockingReasonsKo: string[] = [];
  const blockingReasonsEn: string[] = [];
  let unresolvedRejectionCount = 0;
  let pendingCutCount = 0;

  for (const stageId of stagesToInspect) {
    const gate = board.gates.find((item) => item.stageId === stageId);
    const meta = SIGNOFF_STAGE_META[stageId];
    if (gate) {
      const missingPredecessors = gate.requiredPredecessors.filter((pred) => !completedSet.has(pred));
      if (missingPredecessors.length > 0) {
        for (const pred of missingPredecessors) {
          if (!blockedByStageIds.includes(pred)) blockedByStageIds.push(pred);
        }
        blockingReasonsKo.push(`${meta.labelKo} 선행 필수 단계(${missingPredecessors.map((id) => SIGNOFF_STAGE_META[id].labelKo).join(", ")}) 미완료`);
        blockingReasonsEn.push(`${meta.labelEn} requires predecessor stage(s): ${missingPredecessors.map((id) => SIGNOFF_STAGE_META[id].labelEn).join(", ")}`);
      }
    }

    const rejectedIds: string[] = [];
    const pendingIds: string[] = [];
    for (const cut of board.cuts) {
      const status = cut.stageStates[stageId].status;
      if (status === "changes-requested") rejectedIds.push(cut.cutId);
      else if (status !== "approved") pendingIds.push(cut.cutId);
    }
    if (rejectedIds.length > 0) {
      rejectedCutIdsByStage[stageId] = rejectedIds;
      unresolvedRejectionCount += rejectedIds.length;
      if (!blockedByStageIds.includes(stageId)) blockedByStageIds.push(stageId);
      blockingReasonsKo.push(`${meta.labelKo} 미해결 반려 ${rejectedIds.length}건 (${rejectedIds.join(", ")})`);
      blockingReasonsEn.push(`${meta.labelEn} has ${rejectedIds.length} unresolved rejection(s) (${rejectedIds.join(", ")})`);
    }
    if (pendingIds.length > 0) {
      pendingCutIdsByStage[stageId] = pendingIds;
      pendingCutCount += pendingIds.length;
      if (!blockedByStageIds.includes(stageId)) blockedByStageIds.push(stageId);
      blockingReasonsKo.push(`${meta.labelKo} 미승인 컷 ${pendingIds.length}건 대기`);
      blockingReasonsEn.push(`${meta.labelEn} has ${pendingIds.length} unapproved cut(s)`);
    }
  }

  if (!inspectStageId) {
    for (const gate of board.gates) {
      if (completedSet.has(gate.stageId)) continue;
      if (
        gate.requiredPredecessors.some((pred) => completedSet.has(pred)) &&
        !gate.requiredPredecessors.every((pred) => completedSet.has(pred))
      ) {
        for (const pred of gate.requiredPredecessors.filter((p) => !completedSet.has(p))) {
          if (!blockedByStageIds.includes(pred)) blockedByStageIds.push(pred);
        }
      }
    }
  }

  const nextStageIds = inspectStageId
    ? completedSet.has(inspectStageId)
      ? board.gates
          .filter(
            (gate) =>
              !completedSet.has(gate.stageId) &&
              gate.requiredPredecessors.includes(inspectStageId) &&
              gate.requiredPredecessors.every((pred) => completedSet.has(pred)),
          )
          .map((gate) => gate.stageId)
      : []
    : unlockedIncomplete.filter((stageId) => !board.activeStageIds.includes(stageId));

  return {
    canAdvance: !isEpisodeFullyApproved && unresolvedRejectionCount === 0 && nextStageIds.length > 0,
    isEpisodeFullyApproved,
    activeStageIds: board.activeStageIds,
    completedStageIds,
    nextStageIds,
    blockedByStageIds,
    unresolvedRejectionCount,
    pendingCutCount,
    rejectedCutIdsByStage,
    pendingCutIdsByStage,
    blockingReasonsKo,
    blockingReasonsEn,
  };
}

/** 준비된 다음 결재선으로 회차 보드를 명시 승격한다. */
export function advanceEpisodeToNextGate(
  board: EpisodeSignoffBoard,
  triggeredByCutId = "gate-check",
  triggeredByReviewer = "시스템 게이트",
  timestampIso = DEFAULT_TIMESTAMP_ISO,
): EpisodeSignoffBoard {
  const check = canAdvanceEpisodeToNextGate(board);
  const completedSet = computeCompletedStageSet(board.gates, board.cuts);
  const unlockedIncomplete = computeUnlockedIncompleteStageIds(board.gates, completedSet);
  if (check.isEpisodeFullyApproved) {
    return { ...board, activeStageIds: [], completedStageIds: check.completedStageIds, episodeStatus: "final-approved", updatedAtIso: timestampIso };
  }
  if (!check.canAdvance) return board;

  return {
    ...board,
    activeStageIds: unlockedIncomplete,
    completedStageIds: check.completedStageIds,
    episodeStatus: deriveOverallStatus(board.gates, board.cuts, unlockedIncomplete, completedSet, unlockedIncomplete),
    gateTransitionLog: [
      ...board.gateTransitionLog,
      { fromStageIds: board.activeStageIds, toStageIds: unlockedIncomplete, transitionedAtIso: timestampIso, triggeredByCutId, triggeredByReviewer },
    ],
    updatedAtIso: timestampIso,
  };
}

/**
 * 컷별 부분 승인/반려 결정을 불변 기록한다.
 * - 지정된 `(cutId, stageId)`만 갱신하므로 이미 승인된 타 컷의 승인은 무효화되지 않는다.
 * - `autoAdvance !== false` 시 선행 필수 단계 완료 + 미해결 반려 0건이면 다음 결재선으로 자동 승격한다.
 */
export function recordCutSignoffDecision(
  board: EpisodeSignoffBoard,
  decision: CutSignoffDecisionInput,
): EpisodeSignoffBoard {
  const targetStageId: SignoffStageId = decision.stageId ?? board.activeStageIds[0] ?? "conti";
  const cutIndex = board.cuts.findIndex((cut) => cut.cutId === decision.cutId);
  if (cutIndex < 0) return board;

  const decidedAtIso = decision.decidedAtIso ?? board.updatedAtIso ?? DEFAULT_TIMESTAMP_ISO;
  const reviewerName = decision.reviewerName.trim() || "검수 담당자";
  const decisionSource: SignoffDecisionSource = decision.decisionSource ?? "studio-internal";
  const normalizedTags: readonly RejectionReasonTag[] =
    decision.status === "changes-requested" ? sanitizeRejectionReasonTags(decision.reasonTags, ["art"]) : [];
  const comment = (decision.comment ?? "").trim();

  const updatedCuts = board.cuts.map((cut, index) => {
    if (index !== cutIndex) return cut;
    const prev = cut.stageStates[targetStageId];
    const nextStageState: CutStageSignoffState = {
      ...prev,
      status: decision.status,
      reviewerName,
      reasonTags: normalizedTags,
      comment,
      decisionSource,
      updatedAtIso: decidedAtIso,
      approvedAtIso:
        decision.status === "approved" ? decidedAtIso : decision.status === "changes-requested" ? undefined : prev.approvedAtIso,
      revisionCount: decision.status === "changes-requested" ? prev.revisionCount + 1 : prev.revisionCount,
      history: [...prev.history, { stageId: targetStageId, status: decision.status, reviewerName, reasonTags: normalizedTags, comment, decisionSource, decidedAtIso }],
    };
    return { ...cut, stageStates: { ...cut.stageStates, [targetStageId]: nextStageState } };
  });

  const completedSet = computeCompletedStageSet(board.gates, updatedCuts);
  const completedStageIds = SIGNOFF_STAGE_ORDER.filter((id) => completedSet.has(id));
  const unlockedIncomplete = computeUnlockedIncompleteStageIds(board.gates, completedSet);
  const autoAdvance = decision.autoAdvance ?? true;

  let nextActiveStageIds = board.activeStageIds;
  let nextTransitionLog = board.gateTransitionLog;

  if (autoAdvance && board.activeStageIds.join(",") !== unlockedIncomplete.join(",")) {
    nextActiveStageIds = unlockedIncomplete;
    if (unlockedIncomplete.length > 0 || completedStageIds.length === board.gates.length) {
      nextTransitionLog = [
        ...board.gateTransitionLog,
        { fromStageIds: board.activeStageIds, toStageIds: unlockedIncomplete, transitionedAtIso: decidedAtIso, triggeredByCutId: decision.cutId, triggeredByReviewer: reviewerName },
      ];
    }
  }

  return {
    ...board,
    cuts: updatedCuts,
    activeStageIds: nextActiveStageIds,
    completedStageIds,
    episodeStatus: deriveOverallStatus(board.gates, updatedCuts, nextActiveStageIds, completedSet, unlockedIncomplete),
    gateTransitionLog: nextTransitionLog,
    updatedAtIso: decidedAtIso,
  };
}

/** 선화 + 3D 배경 병렬 게이트 모드를 순차/병렬로 전환하고 활성 결재선을 재계산한다. */
export function toggleParallelBgLineartMode(
  board: EpisodeSignoffBoard,
  parallelEnabled: boolean,
  timestampIso = board.updatedAtIso,
): EpisodeSignoffBoard {
  const nextGates = createSignoffGates(parallelEnabled);
  const completedSet = computeCompletedStageSet(nextGates, board.cuts);
  const completedStageIds = SIGNOFF_STAGE_ORDER.filter((id) => completedSet.has(id));
  const unlockedIncomplete = computeUnlockedIncompleteStageIds(nextGates, completedSet);
  return {
    ...board,
    gates: nextGates,
    activeStageIds: unlockedIncomplete,
    completedStageIds,
    episodeStatus: deriveOverallStatus(nextGates, board.cuts, unlockedIncomplete, completedSet, unlockedIncomplete),
    updatedAtIso: timestampIso,
  };
}

/** 지정 단계의 잔여 미승인 컷을 일괄 승인한다(반려 컷 포함 여부는 옵션 제어). */
export function approveRemainingCutsInStage(
  board: EpisodeSignoffBoard,
  stageId: SignoffStageId,
  reviewerName: string,
  includeChangesRequested = false,
  timestampIso = DEFAULT_TIMESTAMP_ISO,
): EpisodeSignoffBoard {
  let nextBoard = board;
  for (const cut of board.cuts) {
    const status = cut.stageStates[stageId].status;
    if (status === "approved" || (status === "changes-requested" && !includeChangesRequested)) continue;
    nextBoard = recordCutSignoffDecision(nextBoard, {
      cutId: cut.cutId, stageId, status: "approved", reviewerName, comment: "잔여 컷 일괄 승인", decidedAtIso: timestampIso,
    });
  }
  return nextBoard;
}

export function summarizeStageProgress(board: EpisodeSignoffBoard, stageId: SignoffStageId): StageProgressSummary {
  const gate = board.gates.find((item) => item.stageId === stageId);
  const completedSet = computeCompletedStageSet(board.gates, board.cuts);
  let approvedCount = 0;
  let rejectedCount = 0;
  let inReviewCount = 0;
  let pendingCount = 0;
  for (const cut of board.cuts) {
    const status = cut.stageStates[stageId].status;
    if (status === "approved") approvedCount += 1;
    else if (status === "changes-requested") rejectedCount += 1;
    else if (status === "in-review") inReviewCount += 1;
    else pendingCount += 1;
  }
  const totalCuts = board.cuts.length;
  return {
    stageId,
    mode: gate?.mode ?? "sequential",
    parallelGroupId: gate?.parallelGroupId,
    totalCuts,
    approvedCount,
    rejectedCount,
    inReviewCount,
    pendingCount,
    completionPct: totalCuts > 0 ? Math.round((approvedCount / totalCuts) * 100) : 0,
    isComplete: completedSet.has(stageId),
    isUnlocked: gate ? gate.requiredPredecessors.every((pred) => completedSet.has(pred)) : false,
    isActive: board.activeStageIds.includes(stageId),
  };
}

export function summarizeBoardOverview(board: EpisodeSignoffBoard): BoardOverviewSummary {
  const totalStages = board.gates.length;
  const totalCuts = board.cuts.length;
  let approvedSlots = 0;
  for (const gate of board.gates) {
    for (const cut of board.cuts) {
      if (cut.stageStates[gate.stageId].status === "approved") approvedSlots += 1;
    }
  }
  let activeStageApprovedCuts = 0;
  let activeStageRejectedCuts = 0;
  const primaryActive = board.activeStageIds[0];
  if (primaryActive) {
    for (const cut of board.cuts) {
      const status = cut.stageStates[primaryActive].status;
      if (status === "approved") activeStageApprovedCuts += 1;
      if (status === "changes-requested") activeStageRejectedCuts += 1;
    }
  } else if (board.episodeStatus === "final-approved") {
    activeStageApprovedCuts = totalCuts;
  }
  const totalSlots = totalStages * totalCuts;
  return {
    totalStages,
    completedStageCount: board.completedStageIds.length,
    totalCuts,
    activeStageApprovedCuts,
    activeStageRejectedCuts,
    overallCompletionPct: totalSlots > 0 ? Math.round((approvedSlots / totalSlots) * 100) : 0,
    activeStageIds: board.activeStageIds,
    episodeStatus: board.episodeStatus,
  };
}
