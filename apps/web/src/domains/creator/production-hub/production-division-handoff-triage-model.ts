/**
 * Webtoon 8-Stage Division-of-Labor Handoff, Linear Triage (/intake, /asks) & Figma Branch-Merge Engine
 *
 * Clean-room internalization of REA reverse-engineering evidence:
 * - Linear (`https://linear.app/`, capture `ev_f9d2e8ef642ee7614237f8887bf8d5bd0d6823e0ee33470348746515882be875`,
 *   AST `ev_1a0767916ccd345cf27bf77a2cd11acf76697f2eb9d006e04d6c05c3e7584be6`, routes `/intake`, `/asks`, `/plan`, `/build`, `/quality`)
 * - Figma (`https://www.figma.com/`, capture `ev_274345ca8f8511df4e8b903db915ccc3ef4cc10028fa190e088a52368a38d43b`,
 *   AST `ev_a80571a33b32a20a10c311f732617d28a87a580fea1b50898be743fc6a921357`, Ready-for-Stage & Branch/Merge boundary validation)
 */

export type WebtoonDivisionStageKey =
  | "story_script"
  | "storyboard_layout"
  | "bg_3d_layout"
  | "line_art"
  | "flat_color"
  | "shading_render"
  | "compositing_vfx"
  | "lettering_qc";

export type HandoffGateStatus = "ready-for-handoff" | "triage-required" | "blocked-by-spec";

export type TriageAskPriority = "urgent" | "high" | "normal";

export type TriageAskState = "intake-triage" | "accepted-in-cycle" | "resolved-merged";

export interface WebtoonDivisionStageSpec {
  readonly key: WebtoonDivisionStageKey;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly ownerRoleKo: string;
  readonly ownerRoleEn: string;
  readonly defaultSlaHours: number;
  readonly requiredLayers: readonly string[];
}

export interface HandoffPreflightChecklistItem {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly mandatory: boolean;
  readonly passed: boolean;
}

export interface DivisionHandoffPacket {
  readonly id: string;
  readonly fromStage: WebtoonDivisionStageKey;
  readonly toStage: WebtoonDivisionStageKey;
  readonly branchName: string;
  readonly cutRangeLabel: string;
  readonly totalCuts: number;
  readonly completedCuts: number;
  readonly canvasWidthPx: number;
  readonly dpi: number;
  readonly slaRemainingHours: number;
  readonly layerConflictCount: number;
  readonly checklist: readonly HandoffPreflightChecklistItem[];
}

export interface HandoffPreflightEvaluation {
  readonly packetId: string;
  readonly readinessScore: number;
  readonly gateStatus: HandoffGateStatus;
  readonly cutCompletionPct: number;
  readonly mandatoryFailedCount: number;
  readonly specValid: boolean;
  readonly blockersKo: readonly string[];
  readonly blockersEn: readonly string[];
}

export interface DivisionTriageAskItem {
  readonly id: string;
  readonly code: string;
  readonly fromStage: WebtoonDivisionStageKey;
  readonly toStage: WebtoonDivisionStageKey;
  readonly cutNumbers: readonly number[];
  readonly titleKo: string;
  readonly titleEn: string;
  readonly priority: TriageAskPriority;
  readonly state: TriageAskState;
  readonly slaHoursLeft: number;
  readonly assigneeName: string;
}

export interface CanvasStageBranch {
  readonly id: string;
  readonly branchName: string;
  readonly stageKey: WebtoonDivisionStageKey;
  readonly authorName: string;
  readonly baseRevision: string;
  readonly headRevision: string;
  readonly modifiedCuts: number;
  readonly conflictingLayers: readonly string[];
  readonly readyForStage: boolean;
}

export interface BranchMergeSimulationResult {
  readonly canAutoMerge: boolean;
  readonly totalBranches: number;
  readonly readyBranches: number;
  readonly totalConflictingLayers: number;
  readonly mergedCutCount: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export const WEBTOON_DIVISION_STAGES: readonly WebtoonDivisionStageSpec[] = [
  {
    key: "story_script",
    order: 1,
    labelKo: "1. 글콘티·대본",
    labelEn: "1. Script & Beat",
    ownerRoleKo: "스토리 작가 / PD",
    ownerRoleEn: "Story Writer / PD",
    defaultSlaHours: 12,
    requiredLayers: ["DIALOGUE_TEXT", "SCENE_NOTE"],
  },
  {
    key: "storyboard_layout",
    order: 2,
    labelKo: "2. 그림콘티·연출",
    labelEn: "2. Storyboard & Cut Flow",
    ownerRoleKo: "연출·콘티 작가",
    ownerRoleEn: "Storyboard Artist",
    defaultSlaHours: 18,
    requiredLayers: ["CUT_FRAME", "ROUGH_POSE", "CAMERA_GUIDE"],
  },
  {
    key: "bg_3d_layout",
    order: 3,
    labelKo: "3. 3D 배경·소품",
    labelEn: "3. 3D Background & Props",
    ownerRoleKo: "3D 배경 어시스턴트",
    ownerRoleEn: "3D BG Specialist",
    defaultSlaHours: 16,
    requiredLayers: ["BG_LINE_EXPORT", "BG_DEPTH_MAP", "BG_SHADOW_PASS"],
  },
  {
    key: "line_art",
    order: 4,
    labelKo: "4. 선화·펜선",
    labelEn: "4. Line Art & Inking",
    ownerRoleKo: "메인 작화 / 선화 어시",
    ownerRoleEn: "Lead Line Artist",
    defaultSlaHours: 24,
    requiredLayers: ["CHAR_VECTOR_LINE", "PROP_LINE", "CLOSED_GAP_GUIDE"],
  },
  {
    key: "flat_color",
    order: 5,
    labelKo: "5. 밑색·분리 마스킹",
    labelEn: "5. Flat Color & ID Mask",
    ownerRoleKo: "밑색 전담 어시스턴트",
    ownerRoleEn: "Flat Colorist",
    defaultSlaHours: 14,
    requiredLayers: ["SKIN_FLAT", "HAIR_FLAT", "COSTUME_FLAT", "CLIPPING_MASK"],
  },
  {
    key: "shading_render",
    order: 6,
    labelKo: "6. 명암·채색 렌더링",
    labelEn: "6. Shading & Rendering",
    ownerRoleKo: "채색·명암 메인 어시",
    ownerRoleEn: "Shading Artist",
    defaultSlaHours: 20,
    requiredLayers: ["SHADOW_MULTIPLY", "RIM_LIGHT_ADD", "HAIR_HIGHLIGHT"],
  },
  {
    key: "compositing_vfx",
    order: 7,
    labelKo: "7. 후보정·원꾸·이펙트",
    labelEn: "7. Compositing & VFX",
    ownerRoleKo: "후보정·조명 아티스트",
    ownerRoleEn: "Compositing & VFX",
    defaultSlaHours: 10,
    requiredLayers: ["LUT_COLOR_GRADE", "GLOW_BLOOM", "SFX_BRUSH"],
  },
  {
    key: "lettering_qc",
    order: 8,
    labelKo: "8. 식자·최종 검수(QC)",
    labelEn: "8. Lettering & Final QC",
    ownerRoleKo: "식자 디자이너 / 편집부",
    ownerRoleEn: "Letterer & QC Lead",
    defaultSlaHours: 6,
    requiredLayers: ["BALLOON_VECTOR", "DIALOGUE_TYPO", "EXPORT_SLICE_SPEC"],
  },
];

export const DEFAULT_DIVISION_HANDOFF_PACKETS: readonly DivisionHandoffPacket[] = [
  {
    id: "pkt-story-to-board",
    fromStage: "story_script",
    toStage: "storyboard_layout",
    branchName: "handoff/ep-current-script-lock",
    cutRangeLabel: "C001 ~ C072 (전 컷)",
    totalCuts: 72,
    completedCuts: 72,
    canvasWidthPx: 1440,
    dpi: 350,
    slaRemainingHours: 9,
    layerConflictCount: 0,
    checklist: [
      { id: "chk-1", labelKo: "대사 글자수 상한(컷당 55자 이내) 검증 통과", labelEn: "Dialogue character cap (<=55 chars/cut) verified", mandatory: true, passed: true },
      { id: "chk-2", labelKo: "필수 감정선·연출 지시문 고정 태그 지정", labelEn: "Mandatory emotion & camera direction tags locked", mandatory: true, passed: true },
      { id: "chk-3", labelKo: "회차 엔딩 클리프행어 컷 번호 확정", labelEn: "Episode cliffhanger cut index locked", mandatory: false, passed: true },
    ],
  },
  {
    id: "pkt-line-to-flat",
    fromStage: "line_art",
    toStage: "flat_color",
    branchName: "handoff/ep-current-lineart-c01-c45",
    cutRangeLabel: "C001 ~ C045 (1차 배턴)",
    totalCuts: 45,
    completedCuts: 43,
    canvasWidthPx: 1440,
    dpi: 350,
    slaRemainingHours: 4,
    layerConflictCount: 1,
    checklist: [
      { id: "chk-4", labelKo: "벡터 펜선 레이어(CHAR_VECTOR_LINE) 병합 금지 준수", labelEn: "Vector line layer kept unmerged", mandatory: true, passed: true },
      { id: "chk-5", labelKo: "밑색 채우기용 폐곡선(Closed Gap) 누락 0건", labelEn: "Zero open gaps for flat-fill bucket tool", mandatory: true, passed: false },
      { id: "chk-6", labelKo: "배경 은선(BG_LINE_EXPORT)과 캐릭터 선화 폴더 분리", labelEn: "BG linework separated from character folder", mandatory: true, passed: true },
    ],
  },
  {
    id: "pkt-bg3d-to-comp",
    fromStage: "bg_3d_layout",
    toStage: "compositing_vfx",
    branchName: "handoff/ep-current-3dbg-palace",
    cutRangeLabel: "C018 ~ C036 (황궁 연회장 씬)",
    totalCuts: 19,
    completedCuts: 19,
    canvasWidthPx: 1440,
    dpi: 350,
    slaRemainingHours: 11,
    layerConflictCount: 0,
    checklist: [
      { id: "chk-7", labelKo: "3D 배경 에셋 상업적 라이선스·귀속 증명서 매핑", labelEn: "3D asset commercial license & attribution mapped", mandatory: true, passed: true },
      { id: "chk-8", labelKo: "Z-Depth 안개 패스 및 그림자 멀티플라이 레이어 분리", labelEn: "Z-Depth fog pass & shadow multiply separated", mandatory: true, passed: true },
      { id: "chk-9", labelKo: "소실점 가이드라인(Perspective Ruler) 포함", labelEn: "Perspective ruler guide layer included", mandatory: false, passed: true },
    ],
  },
  {
    id: "pkt-shading-to-qc",
    fromStage: "shading_render",
    toStage: "lettering_qc",
    branchName: "handoff/ep-current-render-final",
    cutRangeLabel: "C001 ~ C072 (최종 식자 인계)",
    totalCuts: 72,
    completedCuts: 64,
    canvasWidthPx: 690,
    dpi: 72,
    slaRemainingHours: 2,
    layerConflictCount: 2,
    checklist: [
      { id: "chk-10", labelKo: "출판·글로벌 연재용 원본 해상도(1440px / 300DPI 이상) 유지", labelEn: "Master resolution (>=1440px / >=300 DPI) preserved", mandatory: true, passed: false },
      { id: "chk-11", labelKo: "말풍선 레이어 최상단 폴더 분리(BALLOON_VECTOR)", labelEn: "Speech balloon layer isolated in top folder", mandatory: true, passed: true },
      { id: "chk-12", labelKo: "효과음(SFX) 다국어 로컬라이징용 배경 원본 보존", labelEn: "Clean background preserved under SFX for localization", mandatory: true, passed: true },
    ],
  },
];

export const DEFAULT_DIVISION_TRIAGE_ASKS: readonly DivisionTriageAskItem[] = [
  {
    id: "ask-101",
    code: "ASK-LINE-41",
    fromStage: "flat_color",
    toStage: "line_art",
    cutNumbers: [41, 42],
    titleKo: "C041~C042 여주인공 머리카락 끝단 폐곡선 미마감으로 밑색 버킷 누수 발생",
    titleEn: "C041-C042 heroine hair tips have open line gaps causing flat-color bucket leak",
    priority: "urgent",
    state: "intake-triage",
    slaHoursLeft: 2,
    assigneeName: "김선화 메인어시",
  },
  {
    id: "ask-102",
    code: "ASK-BG3D-24",
    fromStage: "line_art",
    toStage: "bg_3d_layout",
    cutNumbers: [24, 25, 28],
    titleKo: "C024 마차 내부 로우앵글 카메라 FOV 35→28도 재추출 요청 (인물 투시 정합)",
    titleEn: "Re-export C024 carriage interior low-angle camera FOV 35->28 deg for character perspective match",
    priority: "high",
    state: "accepted-in-cycle",
    slaHoursLeft: 5,
    assigneeName: "박배경 3D실장",
  },
  {
    id: "ask-103",
    code: "ASK-COMP-58",
    fromStage: "lettering_qc",
    toStage: "compositing_vfx",
    cutNumbers: [58],
    titleKo: "C058 각성 이펙트 광원 레이어가 말풍선 텍스트 가독성을 침범하여 마스크 분리 요청",
    titleEn: "C058 awakening glow overlaps dialogue balloon; isolate glow below balloon folder",
    priority: "normal",
    state: "resolved-merged",
    slaHoursLeft: 9,
    assigneeName: "최보정 VFX팀장",
  },
];

export const DEFAULT_CANVAS_STAGE_BRANCHES: readonly CanvasStageBranch[] = [
  {
    id: "br-line-main",
    branchName: "branch/ep-lineart-c01-c45",
    stageKey: "line_art",
    authorName: "김선화 메인어시",
    baseRevision: "rev-14.0",
    headRevision: "rev-14.3",
    modifiedCuts: 45,
    conflictingLayers: [],
    readyForStage: true,
  },
  {
    id: "br-bg-palace",
    branchName: "branch/ep-3dbg-palace-c18-c36",
    stageKey: "bg_3d_layout",
    authorName: "박배경 3D실장",
    baseRevision: "rev-14.0",
    headRevision: "rev-14.2",
    modifiedCuts: 19,
    conflictingLayers: [],
    readyForStage: true,
  },
  {
    id: "br-flat-batch1",
    branchName: "branch/ep-flatcolor-c01-c30",
    stageKey: "flat_color",
    authorName: "이밑색 어시스턴트",
    baseRevision: "rev-14.1",
    headRevision: "rev-14.4",
    modifiedCuts: 30,
    conflictingLayers: ["CHAR_VECTOR_LINE"],
    readyForStage: false,
  },
];

export function getDivisionStageSpec(key: WebtoonDivisionStageKey): WebtoonDivisionStageSpec {
  const found = WEBTOON_DIVISION_STAGES.find((stage) => stage.key === key);
  return found ?? WEBTOON_DIVISION_STAGES[0];
}

export function evaluateHandoffPreflightGate(packet: DivisionHandoffPacket): HandoffPreflightEvaluation {
  const cutCompletionPct = packet.totalCuts > 0
    ? Math.min(100, Math.round((packet.completedCuts / packet.totalCuts) * 100))
    : 0;
  const mandatoryItems = packet.checklist.filter((item) => item.mandatory);
  const mandatoryFailed = mandatoryItems.filter((item) => !item.passed);
  const specValid = packet.canvasWidthPx >= 1200 && packet.dpi >= 300;

  const blockersKo: string[] = [];
  const blockersEn: string[] = [];

  if (!specValid) {
    blockersKo.push(`캔버스 규격 미달 (${packet.canvasWidthPx}px / ${packet.dpi}DPI — 최소 1200px / 300DPI 필요)`);
    blockersEn.push(`Canvas spec below threshold (${packet.canvasWidthPx}px / ${packet.dpi}DPI — requires >=1200px / >=300DPI)`);
  }
  if (packet.layerConflictCount > 0) {
    blockersKo.push(`레이어 충돌 ${packet.layerConflictCount}건 감지 (병합 전 레이어 이름·폴더 분리 필요)`);
    blockersEn.push(`${packet.layerConflictCount} layer conflict(s) detected (resolve layer folder naming before merge)`);
  }
  for (const item of mandatoryFailed) {
    blockersKo.push(`필수 체크리스트 미통과: ${item.labelKo}`);
    blockersEn.push(`Mandatory check failed: ${item.labelEn}`);
  }
  if (cutCompletionPct < 100) {
    blockersKo.push(`인계 대상 컷 미완료 (${packet.completedCuts}/${packet.totalCuts}컷, ${cutCompletionPct}%)`);
    blockersEn.push(`Incomplete cut batch (${packet.completedCuts}/${packet.totalCuts} cuts, ${cutCompletionPct}%)`);
  }

  let score = cutCompletionPct * 0.5;
  const passedChecks = packet.checklist.filter((item) => item.passed).length;
  const checklistRatio = packet.checklist.length > 0 ? passedChecks / packet.checklist.length : 1;
  score += checklistRatio * 30;
  if (specValid) score += 10;
  if (packet.layerConflictCount === 0) score += 10;
  const readinessScore = Math.max(0, Math.min(100, Math.round(score)));

  let gateStatus: HandoffGateStatus = "ready-for-handoff";
  if (!specValid || mandatoryFailed.length > 0) {
    gateStatus = "blocked-by-spec";
  } else if (packet.layerConflictCount > 0 || cutCompletionPct < 100) {
    gateStatus = "triage-required";
  }

  return {
    packetId: packet.id,
    readinessScore,
    gateStatus,
    cutCompletionPct,
    mandatoryFailedCount: mandatoryFailed.length,
    specValid,
    blockersKo,
    blockersEn,
  };
}

export function simulateStageBranchMerge(
  branches: readonly CanvasStageBranch[],
): BranchMergeSimulationResult {
  const readyBranches = branches.filter((branch) => branch.readyForStage).length;
  const totalConflictingLayers = branches.reduce(
    (sum, branch) => sum + branch.conflictingLayers.length,
    0,
  );
  const mergedCutCount = branches.reduce(
    (maxCuts, branch) => Math.max(maxCuts, branch.modifiedCuts),
    0,
  );
  const canAutoMerge = branches.length > 0 && readyBranches === branches.length && totalConflictingLayers === 0;

  return {
    canAutoMerge,
    totalBranches: branches.length,
    readyBranches,
    totalConflictingLayers,
    mergedCutCount,
    summaryKo: canAutoMerge
      ? `모든 작업 브랜치(${branches.length}개)가 Ready for Stage 상태이며 레이어 충돌 없이 즉시 병합 가능합니다.`
      : `총 ${branches.length}개 브랜치 중 ${readyBranches}개 준비 완료 · 레이어 충돌 ${totalConflictingLayers}건을 먼저 해결해야 자동 병합됩니다.`,
    summaryEn: canAutoMerge
      ? `All ${branches.length} stage branches are Ready for Stage and can auto-merge with zero layer conflicts.`
      : `${readyBranches}/${branches.length} branches ready · resolve ${totalConflictingLayers} layer conflict(s) before auto-merge.`,
  };
}
