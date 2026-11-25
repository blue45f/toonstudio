import { assertCalmContext, assertCalmSession, calmMember, nextCalmHistory, validateCalmFeatures, validateCalmGestures, validateCalmGuards, validateCalmSnapshot, validateCalmSuggestions } from "./calm-input-contract";

export { exportAdaptiveCalmConfigJson } from "./calm-report-export";

/**
 * Wave 50B — 문맥 적응형 UI 단순화 · 스마트 스태킹 & 저사양 기기 메모리/발열 가드 엔진.
 *
 * 1. 5대 창작 단계 문맥 프로파일(`STUDIO_CONTEXT_PROFILES`)과 결정론적 UI 다이어트 플랜 산출
 *    - 각 단계 핵심 컨트롤 5~7개만 노출하고 보조 패널을 서랍으로 정리해 복잡도(UI Complexity Index) 60%+ 절감
 * 2. 스마트 어시스턴트 스태킹(`rankAndStackAssistantSuggestions`)
 *    - 표정·조명·카메라·말풍선·설정집·화풍 동시 제안 시 문맥 관련도·긴급도(180° 월선·얼굴 가림 우선)·충돌 여부를 계산해
 *      최상단 최대 2개 카드만 노출하고 나머지는 백그라운드 큐로 보류
 * 3. 저사양/모바일 기기 메모리·발열·프레임 가드(`evaluateDeviceThermalBudget`)
 *    - 4대 기기 티어 × 4대 고부하 기능 조합의 추정 VRAM/RAM(MB)·프레임(ms/fps)·열 부하(%) 산출 및 비파괴 안전 강등 제안
 * 4. 단일 제스처 매크로 4종 커스텀, 비파괴 적용/원복 상태 머신, JSON 직렬화
 */

export type StudioContextId = "rough-conti" | "line-inking" | "color-lighting" | "lettering-sfx" | "qa-export";
export type StudioControlCategory = "canvas-tool" | "panel-drawer" | "assistant" | "export-gate";
export type StudioControlId =
  | "pen-brush" | "eraser-toggle" | "panel-gutter" | "camera-angle-guide" | "pose-skeleton"
  | "layer-stack" | "line-stabilizer" | "vector-anchor" | "symmetry-ruler" | "color-wheel"
  | "fill-lasso" | "lighting-mood" | "impasto-material" | "bg3d-viewport" | "balloon-tail"
  | "sfx-stamp" | "font-kerning" | "expression-coach" | "modelsheet-drift" | "style-transfer"
  | "preflight-rights-bom" | "platform-slice-export";
export type AssistantDomainId = "expression" | "lighting" | "camera" | "balloon" | "modelsheet" | "style";
export type SuggestionSeverity = "critical" | "warning" | "advisory";
export type SuggestionConflictGroup = "canvas-framing" | "character-face" | "lighting-color" | "dialogue-layout" | "continuity-spec";
export type DeviceTierId = "flagship-desktop" | "apple-silicon-laptop" | "ipad-pro-tablet" | "entry-mobile-4gb";
export type DeviceFeatureId = "canvas4k" | "bg3dViewport" | "impastoTexture" | "localAiAssist";
export type ThermalBudgetStatus = "safe" | "caution" | "critical";
export type SafeDegradationId = "pause-bg3d-viewport" | "lower-impasto-lod" | "throttle-background-precache" | "tile-4k-stream-cap";
export type GestureTriggerId = "two-finger-tap" | "three-finger-swipe" | "pen-double-tap" | "four-finger-pinch";
export type GestureActionId =
  | "undo-stroke" | "redo-stroke" | "toggle-focus-mode" | "swap-eraser-gpen"
  | "overview-cut-rhythm" | "toggle-assistant-drawer" | "quick-save-snapshot" | "flip-canvas-horizontal";
export type AdaptiveCalmSessionStatus = "idle" | "applied" | "reverted";

export interface StudioSurfaceControl {
  readonly id: StudioControlId; readonly category: StudioControlCategory;
  readonly cognitiveWeight: number; readonly viewportCostPct: number;
  readonly labelKo: string; readonly labelEn: string; readonly shortcutHint: string;
}
export interface StudioContextProfile {
  readonly id: StudioContextId; readonly labelKo: string; readonly labelEn: string;
  readonly focusGoalKo: string; readonly focusGoalEn: string;
  readonly pinnedControlIds: readonly StudioControlId[];
  readonly focusBoostControlIds: readonly StudioControlId[];
  readonly primaryAssistantDomains: readonly AssistantDomainId[];
  readonly drawerGroupLabelsKo: readonly string[]; readonly drawerGroupLabelsEn: readonly string[];
  readonly baselineViewportPct: number;
}
export interface AdaptiveCalmLayoutPlan {
  readonly contextId: StudioContextId; readonly contextLabelKo: string; readonly contextLabelEn: string;
  readonly focusBoost: boolean;
  readonly pinnedControls: readonly StudioSurfaceControl[]; readonly drawerControls: readonly StudioSurfaceControl[];
  readonly totalControlCount: number; readonly visibleControlCount: number; readonly collapsedControlCount: number;
  readonly baselineComplexityIndex: number; readonly adaptedComplexityIndex: number; readonly complexityReductionPct: number;
  readonly baselineViewportPct: number; readonly adaptedViewportPct: number; readonly viewportGainPct: number;
  readonly meetsViewportTarget: boolean; readonly meetsComplexityDietTarget: boolean;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface AssistantSuggestion {
  readonly id: string; readonly domain: AssistantDomainId; readonly severity: SuggestionSeverity;
  readonly conflictGroup: SuggestionConflictGroup; readonly confidence: number;
  readonly titleKo: string; readonly titleEn: string;
  readonly detailKo: string; readonly detailEn: string; readonly cutLabel: string;
}
export interface RankedAssistantCard {
  readonly suggestion: AssistantSuggestion;
  readonly priorityScore: number; readonly severityScore: number;
  readonly contextRelevanceScore: number; readonly confidenceScore: number;
  readonly stackSlot: 1 | 2 | null;
  readonly queueReason: "visible" | "conflict-deferred" | "capacity-cap";
  readonly conflictWithId: string | null;
}
export interface AssistantStackInput {
  readonly contextId: StudioContextId; readonly suggestions?: readonly AssistantSuggestion[];
  readonly maxVisible?: number; readonly dismissedIds?: readonly string[];
}
export interface AssistantStackResult {
  readonly contextId: StudioContextId; readonly maxVisible: number;
  readonly visibleCards: readonly RankedAssistantCard[]; readonly queuedCards: readonly RankedAssistantCard[];
  readonly dismissedCount: number; readonly deferredConflictCount: number;
  readonly criticalInVisibleCount: number; readonly unshownCriticalCount: number;
  readonly cognitiveLoadStatus: "calm" | "guarded";
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface DeviceFeatureFlags {
  readonly canvas4k: boolean; readonly bg3dViewport: boolean;
  readonly impastoTexture: boolean; readonly localAiAssist: boolean;
}
export interface DeviceTierSpec {
  readonly id: DeviceTierId; readonly labelKo: string; readonly labelEn: string;
  readonly hardwareSummaryKo: string; readonly hardwareSummaryEn: string;
  readonly memoryBudgetMb: number; readonly targetFrameMs: number;
  readonly thermalHeadroom: number; readonly featureLoadMultiplier: number;
}
export interface DeviceFeatureLoadSpec {
  readonly id: DeviceFeatureId; readonly labelKo: string; readonly labelEn: string;
  readonly memoryMb: number; readonly frameMs: number; readonly thermalPoints: number;
}
export interface SafeDegradationProposal {
  readonly id: SafeDegradationId; readonly titleKo: string; readonly titleEn: string;
  readonly effectKo: string; readonly effectEn: string;
  readonly targetFeature: DeviceFeatureId | "precache";
  readonly savedMemoryMb: number; readonly savedFrameMs: number; readonly savedThermalPoints: number;
  readonly nonDestructive: true; readonly reversible: true;
}
export interface ThermalBudgetMetrics {
  readonly estimatedMemoryMb: number; readonly memoryUtilizationPct: number;
  readonly estimatedFrameMs: number; readonly estimatedFps: number;
  readonly thermalLoadPct: number; readonly status: ThermalBudgetStatus;
}
export interface DeviceThermalBudgetReport {
  readonly deviceTier: DeviceTierSpec; readonly features: DeviceFeatureFlags;
  readonly activeFeatureCount: number; readonly appliedDegradationIds: readonly SafeDegradationId[];
  readonly raw: ThermalBudgetMetrics; readonly current: ThermalBudgetMetrics;
  readonly projectedAfterAllGuards: ThermalBudgetMetrics;
  readonly degradationProposals: readonly SafeDegradationProposal[];
  readonly needsDegradation: boolean; readonly summaryKo: string; readonly summaryEn: string;
}
export interface GestureActionOption {
  readonly id: GestureActionId; readonly labelKo: string; readonly labelEn: string;
}
export interface GestureMacroBinding {
  readonly triggerId: GestureTriggerId; readonly triggerLabelKo: string; readonly triggerLabelEn: string;
  readonly actionId: GestureActionId; readonly enabled: boolean;
}
export interface AdaptiveCalmConfigSnapshot {
  readonly contextId: StudioContextId; readonly focusBoost: boolean; readonly deviceTierId: DeviceTierId;
  readonly features: DeviceFeatureFlags; readonly appliedDegradationIds: readonly SafeDegradationId[];
  readonly gestures: readonly GestureMacroBinding[];
}
export interface AdaptiveCalmSessionState {
  readonly status: AdaptiveCalmSessionStatus;
  readonly baseline: AdaptiveCalmConfigSnapshot; readonly working: AdaptiveCalmConfigSnapshot;
  readonly applied: AdaptiveCalmConfigSnapshot | null; readonly historyCount: number;
}
export interface AdaptiveCalmExportInput {
  readonly session: AdaptiveCalmSessionState; readonly layoutPlan: AdaptiveCalmLayoutPlan;
  readonly assistantStack: AssistantStackResult; readonly thermalReport: DeviceThermalBudgetReport;
}

export const COMPLEXITY_DIET_TARGET_PCT = 60;
export const CANVAS_VIEWPORT_TARGET_PCT = 82;
export const MAX_VISIBLE_ASSISTANT_CARDS = 2;
export const CORE_CONTROL_MIN_COUNT = 5;
export const CORE_CONTROL_MAX_COUNT = 7;

const BASE_STUDIO_MEMORY_MB = 180;
const BASE_STUDIO_FRAME_MS = 4.2;
const BASE_STUDIO_THERMAL_POINTS = 16;

export const STUDIO_SURFACE_CONTROLS: readonly StudioSurfaceControl[] = [
  { id: "pen-brush", category: "canvas-tool", cognitiveWeight: 3, viewportCostPct: 1.5, labelKo: "G펜 · 드로잉 브러시", labelEn: "G-Pen & Brush", shortcutHint: "B" },
  { id: "eraser-toggle", category: "canvas-tool", cognitiveWeight: 2, viewportCostPct: 1.0, labelKo: "지우개 빠른 전환", labelEn: "Quick Eraser", shortcutHint: "E" },
  { id: "panel-gutter", category: "canvas-tool", cognitiveWeight: 3, viewportCostPct: 1.6, labelKo: "컷 분할 · 여백 가터", labelEn: "Panel & Gutter", shortcutHint: "K" },
  { id: "camera-angle-guide", category: "assistant", cognitiveWeight: 3, viewportCostPct: 1.8, labelKo: "카메라 구도 · 180° 가이드", labelEn: "Camera 180° Guide", shortcutHint: "C" },
  { id: "pose-skeleton", category: "assistant", cognitiveWeight: 3, viewportCostPct: 1.8, labelKo: "포즈 관절 가이드", labelEn: "Pose Skeleton", shortcutHint: "P" },
  { id: "layer-stack", category: "panel-drawer", cognitiveWeight: 3, viewportCostPct: 2.4, labelKo: "레이어 콤팩트 스택", labelEn: "Compact Layers", shortcutHint: "L" },
  { id: "line-stabilizer", category: "canvas-tool", cognitiveWeight: 2, viewportCostPct: 1.1, labelKo: "필압 · 손떨림 보정", labelEn: "Stroke Stabilizer", shortcutHint: "S" },
  { id: "vector-anchor", category: "canvas-tool", cognitiveWeight: 3, viewportCostPct: 1.5, labelKo: "벡터 선폭 · 교차 정리", labelEn: "Vector Line Trim", shortcutHint: "V" },
  { id: "symmetry-ruler", category: "canvas-tool", cognitiveWeight: 2, viewportCostPct: 1.2, labelKo: "투시 · 대칭 자", labelEn: "Perspective Ruler", shortcutHint: "R" },
  { id: "color-wheel", category: "panel-drawer", cognitiveWeight: 3, viewportCostPct: 2.2, labelKo: "안료 컬러 휠", labelEn: "Pigment Wheel", shortcutHint: "I" },
  { id: "fill-lasso", category: "canvas-tool", cognitiveWeight: 2, viewportCostPct: 1.3, labelKo: "올가미 · 닫힌 영역 채우기", labelEn: "Lasso & Gap Fill", shortcutHint: "G" },
  { id: "lighting-mood", category: "assistant", cognitiveWeight: 3, viewportCostPct: 1.9, labelKo: "컷 조명 · 분위기 프리셋", labelEn: "Cut Lighting Mood", shortcutHint: "M" },
  { id: "impasto-material", category: "panel-drawer", cognitiveWeight: 4, viewportCostPct: 2.3, labelKo: "임파스토 질감 · 캔버스 결", labelEn: "Impasto Material", shortcutHint: "T" },
  { id: "bg3d-viewport", category: "panel-drawer", cognitiveWeight: 5, viewportCostPct: 3.1, labelKo: "3D 배경 뷰포트", labelEn: "3D Scene Viewport", shortcutHint: "3" },
  { id: "balloon-tail", category: "canvas-tool", cognitiveWeight: 3, viewportCostPct: 1.7, labelKo: "말풍선 · 꼬리 배치", labelEn: "Speech Balloon", shortcutHint: "Q" },
  { id: "sfx-stamp", category: "canvas-tool", cognitiveWeight: 3, viewportCostPct: 1.7, labelKo: "효과음(SFX) 스탬프", labelEn: "SFX Stamp", shortcutHint: "X" },
  { id: "font-kerning", category: "panel-drawer", cognitiveWeight: 3, viewportCostPct: 2.0, labelKo: "식자 자간 · 행간", labelEn: "Type & Kerning", shortcutHint: "F" },
  { id: "expression-coach", category: "assistant", cognitiveWeight: 3, viewportCostPct: 1.9, labelKo: "표정 · 입모양 어시스턴트", labelEn: "Expression Coach", shortcutHint: "J" },
  { id: "modelsheet-drift", category: "assistant", cognitiveWeight: 4, viewportCostPct: 2.1, labelKo: "설정집 비율 드리프트 점검", labelEn: "Model-Sheet Drift", shortcutHint: "D" },
  { id: "style-transfer", category: "assistant", cognitiveWeight: 4, viewportCostPct: 2.2, labelKo: "화풍 · 톤 일관성 코치", labelEn: "Style Tone Coach", shortcutHint: "H" },
  { id: "preflight-rights-bom", category: "export-gate", cognitiveWeight: 3, viewportCostPct: 1.9, labelKo: "저작권 BOM 프리플라이트", labelEn: "Rights BOM Preflight", shortcutHint: "O" },
  { id: "platform-slice-export", category: "export-gate", cognitiveWeight: 3, viewportCostPct: 1.8, labelKo: "연재 규격 슬라이스 출고", labelEn: "Platform Slice Export", shortcutHint: "W" },
];

export const STUDIO_CONTEXT_PROFILES: readonly [
  StudioContextProfile, StudioContextProfile, StudioContextProfile, StudioContextProfile, StudioContextProfile,
] = [
  {
    id: "rough-conti", labelKo: "콘티·구도", labelEn: "Rough & Storyboard",
    focusGoalKo: "컷 흐름과 카메라 시선 동선에 집중하고 채색·식자·출고 패널은 접어둡니다.",
    focusGoalEn: "Keep focus on panel rhythm and camera eyeline while tucking color, lettering, and export panels.",
    pinnedControlIds: ["pen-brush", "eraser-toggle", "panel-gutter", "camera-angle-guide", "pose-skeleton", "layer-stack"],
    focusBoostControlIds: ["pen-brush", "eraser-toggle", "panel-gutter", "camera-angle-guide", "layer-stack"],
    primaryAssistantDomains: ["camera", "expression", "modelsheet"],
    drawerGroupLabelsKo: ["채색·임파스토", "말풍선·식자", "출고·BOM"],
    drawerGroupLabelsEn: ["Color & Impasto", "Lettering & SFX", "Preflight & Export"],
    baselineViewportPct: 58,
  },
  {
    id: "line-inking", labelKo: "선화·펜터치", labelEn: "Line & Inking",
    focusGoalKo: "필압·손떨림 보정과 벡터 선 정리만 남기고 3D·조명·출고 서랍을 숨깁니다.",
    focusGoalEn: "Expose only stroke stabilization and vector line controls while collapsing 3D, lighting, and export drawers.",
    pinnedControlIds: ["pen-brush", "eraser-toggle", "line-stabilizer", "vector-anchor", "symmetry-ruler", "layer-stack"],
    focusBoostControlIds: ["pen-brush", "eraser-toggle", "line-stabilizer", "vector-anchor", "layer-stack"],
    primaryAssistantDomains: ["modelsheet", "expression", "style"],
    drawerGroupLabelsKo: ["3D 배경·조명", "말풍선·식자", "출고·BOM"],
    drawerGroupLabelsEn: ["3D & Lighting", "Lettering & SFX", "Preflight & Export"],
    baselineViewportPct: 58,
  },
  {
    id: "color-lighting", labelKo: "채색·조명", labelEn: "Color & Lighting",
    focusGoalKo: "안료 휠·올가미 채우기·컷 조명·임파스토·3D 배경만 노출해 색감 판단 방해를 줄입니다.",
    focusGoalEn: "Pin pigment wheel, lasso fill, cut lighting, impasto, and 3D scene while stowing line and lettering tools.",
    pinnedControlIds: ["color-wheel", "fill-lasso", "lighting-mood", "impasto-material", "bg3d-viewport", "layer-stack"],
    focusBoostControlIds: ["color-wheel", "fill-lasso", "lighting-mood", "impasto-material", "layer-stack"],
    primaryAssistantDomains: ["lighting", "style", "modelsheet"],
    drawerGroupLabelsKo: ["선화·투시 자", "말풍선·식자", "출고·BOM"],
    drawerGroupLabelsEn: ["Inking & Rulers", "Lettering & SFX", "Preflight & Export"],
    baselineViewportPct: 58,
  },
  {
    id: "lettering-sfx", labelKo: "말풍선·식자", labelEn: "Lettering & SFX",
    focusGoalKo: "말풍선 꼬리·SFX 스탬프·자간 행간·컷 여백 5개만 띄워 가독성 조율에 집중합니다.",
    focusGoalEn: "Surface only 5 lettering and gutter controls so dialogue flow stays readable without drawing clutter.",
    pinnedControlIds: ["balloon-tail", "sfx-stamp", "font-kerning", "panel-gutter", "layer-stack"],
    focusBoostControlIds: ["balloon-tail", "sfx-stamp", "font-kerning", "panel-gutter", "layer-stack"],
    primaryAssistantDomains: ["balloon", "camera", "expression"],
    drawerGroupLabelsKo: ["드로잉·선화", "채색·3D 배경", "출고·BOM"],
    drawerGroupLabelsEn: ["Drawing & Inking", "Color & 3D Scene", "Preflight & Export"],
    baselineViewportPct: 58,
  },
  {
    id: "qa-export", labelKo: "최종 검수·출고", labelEn: "QA & Export",
    focusGoalKo: "설정집 비율 점검·저작권 BOM·연재 슬라이스 출고만 열어 마감 실수를 차단합니다.",
    focusGoalEn: "Pin model-sheet QA, rights BOM preflight, and platform slice export to prevent shipping mistakes.",
    pinnedControlIds: ["modelsheet-drift", "preflight-rights-bom", "platform-slice-export", "camera-angle-guide", "balloon-tail", "layer-stack"],
    focusBoostControlIds: ["modelsheet-drift", "preflight-rights-bom", "platform-slice-export", "balloon-tail", "layer-stack"],
    primaryAssistantDomains: ["modelsheet", "balloon", "camera"],
    drawerGroupLabelsKo: ["드로잉 브러시", "3D·임파스토", "포즈·투시"],
    drawerGroupLabelsEn: ["Drawing Brushes", "3D & Impasto", "Pose & Perspective"],
    baselineViewportPct: 57,
  },
];

export const ASSISTANT_DOMAIN_META: Readonly<Record<AssistantDomainId, { readonly labelKo: string; readonly labelEn: string }>> = {
  expression: { labelKo: "표정", labelEn: "Expression" },
  lighting: { labelKo: "조명", labelEn: "Lighting" },
  camera: { labelKo: "카메라", labelEn: "Camera" },
  balloon: { labelKo: "말풍선", labelEn: "Balloon" },
  modelsheet: { labelKo: "설정집", labelEn: "Model Sheet" },
  style: { labelKo: "화풍", labelEn: "Style" },
};

export const DEFAULT_ASSISTANT_SUGGESTIONS: readonly AssistantSuggestion[] = [
  {
    id: "cam-axis-180-cut14", domain: "camera", severity: "critical", conflictGroup: "canvas-framing", confidence: 0.96,
    titleKo: "14컷 카메라 180° 월선 감지", titleEn: "Cut 14: 180° Axis Crossing Detected",
    detailKo: "직전 컷(+52°) 대비 반대 반구(-48°)로 넘어가 대화 시선이 뒤집혔습니다. 안전 반구 보정을 권장합니다.",
    detailEn: "Camera crossed from +52° to -48°, reversing dialogue eyelines. Mirror yaw back to safe hemisphere.",
    cutLabel: "Cut 14",
  },
  {
    id: "balloon-face-occlude-cut14", domain: "balloon", severity: "critical", conflictGroup: "character-face", confidence: 0.94,
    titleKo: "14컷 말풍선 꼬리가 주인공 얼굴을 가림", titleEn: "Cut 14: Balloon Tail Occludes Lead Face",
    detailKo: "우측 대사 말풍선이 눈·코 영역과 34% 겹쳤습니다. 좌상단 네거티브 스페이스로 비파괴 이동할 수 있습니다.",
    detailEn: "Right speech balloon overlaps 34% of eyes and nose. Shift to top-left negative space non-destructively.",
    cutLabel: "Cut 14",
  },
  {
    id: "expr-brow-tension-cut14", domain: "expression", severity: "warning", conflictGroup: "character-face", confidence: 0.88,
    titleKo: "대사 긴장도 대비 눈썹 각도 완화됨", titleEn: "Brow Tension Soft for High-Stakes Line",
    detailKo: "충격 대사와 달리 눈매가 평온합니다. 얼굴 영역 조정으로 말풍선 제안과 충돌해 큐로 보류됩니다.",
    detailEn: "Eyes look calm despite urgent dialogue; deferred while balloon face-clearance card holds face slot.",
    cutLabel: "Cut 14",
  },
  {
    id: "modelsheet-ratio-cut18", domain: "modelsheet", severity: "warning", conflictGroup: "continuity-spec", confidence: 0.91,
    titleKo: "18컷 주인공 등신 비율 +11.4% 드리프트", titleEn: "Cut 18: Head-to-Body Ratio +11.4% Drift",
    detailKo: "설정집 7.0등신 기준에서 6.2등신으로 축소되었습니다. 붉은 펜 기준선 오버레이로 미세 보정할 수 있습니다.",
    detailEn: "Dropped from 7.0H spec to 6.2H. Apply subtle red-pen overlay correction before ink lock.",
    cutLabel: "Cut 18",
  },
  {
    id: "lighting-rim-contrast-cut14", domain: "lighting", severity: "warning", conflictGroup: "lighting-color", confidence: 0.86,
    titleKo: "역광 림라이트 대비 보강 제안", titleEn: "Boost Backlit Rim Contrast",
    detailKo: "배경 채도와 인물 실루엣 명도 차가 14% 미만입니다. 따뜻한 림라이트 레이어를 추가하면 시선이 모입니다.",
    detailEn: "Figure-ground luminance gap is below 14%. Add a warm rim-light layer to separate silhouette.",
    cutLabel: "Cut 14",
  },
  {
    id: "style-halftone-cohesion-cut15", domain: "style", severity: "advisory", conflictGroup: "lighting-color", confidence: 0.82,
    titleKo: "이전 컷과 그림자 색온도 편차 정리", titleEn: "Align Shadow Temperature With Prior Cut",
    detailKo: "13컷 대비 그림자 톤이 차갑게 이동했습니다. 조명 제안과 동일 색보정 축이라 우선순위 순으로 순차 노출합니다.",
    detailEn: "Shadow tint shifted cooler than Cut 13; shares lighting-color channel so queued behind lighting.",
    cutLabel: "Cut 15",
  },
  {
    id: "camera-dutch-emphasis-cut16", domain: "camera", severity: "advisory", conflictGroup: "canvas-framing", confidence: 0.79,
    titleKo: "16컷 반전 대사에 9° 더치 틸트 후보", titleEn: "Cut 16: Optional 9° Dutch Tilt on Reveal",
    detailKo: "180° 월선 경고 해결 후 검토할 수 있는 보조 구도 제안입니다.",
    detailEn: "Secondary framing suggestion queued behind the critical 180° axis-crossing fix.",
    cutLabel: "Cut 16",
  },
];

export const DEVICE_TIER_SPECS: readonly [
  DeviceTierSpec, DeviceTierSpec, DeviceTierSpec, DeviceTierSpec,
] = [
  { id: "flagship-desktop", labelKo: "플래그십 데스크톱", labelEn: "Flagship Desktop", hardwareSummaryKo: "32GB RAM · 외장 GPU 12GB VRAM", hardwareSummaryEn: "32GB RAM · Discrete 12GB VRAM", memoryBudgetMb: 3200, targetFrameMs: 16.6, thermalHeadroom: 105, featureLoadMultiplier: 0.82 },
  { id: "apple-silicon-laptop", labelKo: "애플 실리콘 노트북", labelEn: "Apple Silicon Laptop", hardwareSummaryKo: "16GB 통합 메모리 · 저소음 경량 열설계", hardwareSummaryEn: "16GB Unified Memory · Thin Thermal Envelope", memoryBudgetMb: 2100, targetFrameMs: 16.6, thermalHeadroom: 86, featureLoadMultiplier: 0.95 },
  { id: "ipad-pro-tablet", labelKo: "아이패드 프로 태블릿", labelEn: "iPad Pro Tablet", hardwareSummaryKo: "8GB 통합 메모리 · 패시브 쿨링 · 120Hz 펜슬", hardwareSummaryEn: "8GB Unified Memory · Passive Cooling · Pencil", memoryBudgetMb: 1280, targetFrameMs: 16.6, thermalHeadroom: 68, featureLoadMultiplier: 1.08 },
  { id: "entry-mobile-4gb", labelKo: "보급형 모바일 4GB", labelEn: "Entry Mobile 4GB", hardwareSummaryKo: "4GB RAM · 브라우저 탭 안전 상한 680MB", hardwareSummaryEn: "4GB RAM · 680MB Safe Tab Memory Cap", memoryBudgetMb: 680, targetFrameMs: 16.6, thermalHeadroom: 50, featureLoadMultiplier: 1.25 },
];

export const DEVICE_FEATURE_LOADS: readonly DeviceFeatureLoadSpec[] = [
  { id: "canvas4k", labelKo: "4K 캔버스", labelEn: "4K Canvas", memoryMb: 360, frameMs: 3.1, thermalPoints: 16 },
  { id: "bg3dViewport", labelKo: "3D 배경 뷰포트", labelEn: "3D Background", memoryMb: 340, frameMs: 5.0, thermalPoints: 24 },
  { id: "impastoTexture", labelKo: "임파스토 질감", labelEn: "Impasto Texture", memoryMb: 220, frameMs: 3.6, thermalPoints: 18 },
  { id: "localAiAssist", labelKo: "로컬 AI 어시스턴트", labelEn: "Local AI Assist", memoryMb: 440, frameMs: 4.4, thermalPoints: 22 },
];

export const DEFAULT_DEVICE_FEATURES: DeviceFeatureFlags = {
  canvas4k: true, bg3dViewport: true, impastoTexture: true, localAiAssist: false,
};

export const GESTURE_ACTION_OPTIONS: readonly [GestureActionOption, ...GestureActionOption[]] = [
  { id: "undo-stroke", labelKo: "되돌리기 (Undo)", labelEn: "Undo Stroke" },
  { id: "redo-stroke", labelKo: "다시 실행 (Redo)", labelEn: "Redo Stroke" },
  { id: "toggle-focus-mode", labelKo: "집중 모드 전환", labelEn: "Toggle Focus Mode" },
  { id: "swap-eraser-gpen", labelKo: "지우개 ↔ G펜 전환", labelEn: "Swap Eraser ↔ G-Pen" },
  { id: "overview-cut-rhythm", labelKo: "전체 컷 리듬 보기", labelEn: "Cut Rhythm Overview" },
  { id: "toggle-assistant-drawer", labelKo: "어시스턴트 서랍 토글", labelEn: "Toggle Assistant Drawer" },
  { id: "quick-save-snapshot", labelKo: "로컬 스냅샷 즉시 저장", labelEn: "Quick Save Snapshot" },
  { id: "flip-canvas-horizontal", labelKo: "캔버스 좌우 반전", labelEn: "Flip Canvas Horizontally" },
];

export const DEFAULT_GESTURE_MACROS: readonly GestureMacroBinding[] = [
  { triggerId: "two-finger-tap", triggerLabelKo: "2손가락 탭", triggerLabelEn: "2-Finger Tap", actionId: "undo-stroke", enabled: true },
  { triggerId: "three-finger-swipe", triggerLabelKo: "3손가락 쓸기", triggerLabelEn: "3-Finger Swipe", actionId: "toggle-focus-mode", enabled: true },
  { triggerId: "pen-double-tap", triggerLabelKo: "펜 더블탭", triggerLabelEn: "Stylus Double-Tap", actionId: "swap-eraser-gpen", enabled: true },
  { triggerId: "four-finger-pinch", triggerLabelKo: "4손가락 핀치", triggerLabelEn: "4-Finger Pinch", actionId: "overview-cut-rhythm", enabled: true },
];

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getStudioContextProfile(contextId?: StudioContextId): StudioContextProfile {
  return STUDIO_CONTEXT_PROFILES.find((profile) => profile.id === contextId) ?? STUDIO_CONTEXT_PROFILES[0];
}

export function getDeviceTierSpec(tierId?: DeviceTierId): DeviceTierSpec {
  return DEVICE_TIER_SPECS.find((tier) => tier.id === tierId) ?? DEVICE_TIER_SPECS[2];
}

export function getGestureActionOption(actionId: GestureActionId): GestureActionOption {
  return GESTURE_ACTION_OPTIONS.find((item) => item.id === actionId) ?? GESTURE_ACTION_OPTIONS[0];
}

/** 5대 창작 단계 문맥에 맞춰 노출 컨트롤 5~7개만 엄선하고 UI 복잡도 60%+ 절감 플랜을 계산한다. */
export function computeAdaptiveCalmLayoutPlan(
  contextId: StudioContextId,
  options?: { readonly focusBoost?: boolean },
): AdaptiveCalmLayoutPlan {
  assertCalmContext(contextId);
  const profile = getStudioContextProfile(contextId);
  const focusBoost = Boolean(options?.focusBoost);
  const selectedSet = new Set<StudioControlId>(focusBoost ? profile.focusBoostControlIds : profile.pinnedControlIds);

  const pinnedControls: StudioSurfaceControl[] = [];
  const drawerControls: StudioSurfaceControl[] = [];
  for (const control of STUDIO_SURFACE_CONTROLS) {
    if (selectedSet.has(control.id)) pinnedControls.push(control);
    else drawerControls.push(control);
  }

  const totalWeight = STUDIO_SURFACE_CONTROLS.reduce((sum, item) => sum + item.cognitiveWeight, 0);
  const pinnedWeight = pinnedControls.reduce((sum, item) => sum + item.cognitiveWeight, 0);
  const adaptedComplexityIndex = round1((pinnedWeight / Math.max(1, totalWeight)) * 100);
  const complexityReductionPct = round1(100 - adaptedComplexityIndex);

  const savedViewportPct = drawerControls.reduce((sum, item) => sum + item.viewportCostPct, 0);
  const adaptedViewportPct = round1(
    clampNumber(profile.baselineViewportPct + savedViewportPct * 0.96 + (focusBoost ? 2.4 : 0), 60, 94),
  );
  const viewportGainPct = round1(adaptedViewportPct - profile.baselineViewportPct);

  return {
    contextId: profile.id, contextLabelKo: profile.labelKo, contextLabelEn: profile.labelEn, focusBoost,
    pinnedControls, drawerControls,
    totalControlCount: STUDIO_SURFACE_CONTROLS.length,
    visibleControlCount: pinnedControls.length,
    collapsedControlCount: drawerControls.length,
    baselineComplexityIndex: 100, adaptedComplexityIndex, complexityReductionPct,
    baselineViewportPct: profile.baselineViewportPct, adaptedViewportPct, viewportGainPct,
    meetsViewportTarget: adaptedViewportPct >= CANVAS_VIEWPORT_TARGET_PCT,
    meetsComplexityDietTarget: complexityReductionPct >= COMPLEXITY_DIET_TARGET_PCT,
    summaryKo: `${profile.labelKo} 단계 핵심 컨트롤 ${pinnedControls.length}개만 고정하고 보조 ${drawerControls.length}개를 서랍으로 정리해 복잡도를 ${complexityReductionPct}% 줄였습니다(캔버스 ${adaptedViewportPct}%).`,
    summaryEn: `Pinned ${pinnedControls.length} core controls for ${profile.labelEn} and tucked ${drawerControls.length} secondary panels (-${complexityReductionPct}% UI complexity, ${adaptedViewportPct}% canvas).`,
  };
}

const severityWeight = (s: SuggestionSeverity): number => (s === "critical" ? 56 : s === "warning" ? 30 : 12);
const severityOrder = (s: SuggestionSeverity): number => (s === "critical" ? 3 : s === "warning" ? 2 : 1);

function contextDomainRelevance(contextId: StudioContextId, domain: AssistantDomainId): number {
  const idx = getStudioContextProfile(contextId).primaryAssistantDomains.indexOf(domain);
  return idx === 0 ? 30 : idx === 1 ? 24 : idx === 2 ? 18 : 6;
}

/** 여러 어시스턴트 동시 제안 시 문맥 관련도·긴급도·충돌 그룹을 계산해 최상단 최대 2개만 노출한다. */
export function rankAndStackAssistantSuggestions(input: AssistantStackInput): AssistantStackResult {
  const suggestions = validateCalmSuggestions(input, DEFAULT_ASSISTANT_SUGGESTIONS);
  const maxVisible = Math.round(clampNumber(input.maxVisible ?? MAX_VISIBLE_ASSISTANT_CARDS, 1, MAX_VISIBLE_ASSISTANT_CARDS));
  const dismissedSet = new Set<string>(input.dismissedIds ?? []);
  const active = suggestions.filter((item) => !dismissedSet.has(item.id));
  const dismissedCount = suggestions.length - active.length;

  const scored = active
    .map((suggestion) => {
      const sevScore = severityWeight(suggestion.severity);
      const relScore = contextDomainRelevance(input.contextId, suggestion.domain);
      const confScore = Math.round(clampNumber(suggestion.confidence, 0, 1) * 14);
      const priorityScore = Math.round(clampNumber(sevScore + relScore + confScore, 0, 100));
      return { suggestion, sevScore, relScore, confScore, priorityScore };
    })
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      const sevDiff = severityOrder(b.suggestion.severity) - severityOrder(a.suggestion.severity);
      if (sevDiff !== 0) return sevDiff;
      if (b.relScore !== a.relScore) return b.relScore - a.relScore;
      return a.suggestion.id.localeCompare(b.suggestion.id);
    });

  const visibleCards: RankedAssistantCard[] = [];
  const queuedCards: RankedAssistantCard[] = [];
  const claimedConflictGroups: Partial<Record<SuggestionConflictGroup, string>> = {};
  let deferredConflictCount = 0;

  for (const item of scored) {
    const winnerId = claimedConflictGroups[item.suggestion.conflictGroup] ?? null;
    if (winnerId !== null) {
      deferredConflictCount += 1;
      queuedCards.push({
        suggestion: item.suggestion, priorityScore: item.priorityScore, severityScore: item.sevScore,
        contextRelevanceScore: item.relScore, confidenceScore: item.confScore,
        stackSlot: null, queueReason: "conflict-deferred", conflictWithId: winnerId,
      });
      continue;
    }

    if (visibleCards.length < maxVisible) {
      const slot: 1 | 2 = visibleCards.length === 0 ? 1 : 2;
      claimedConflictGroups[item.suggestion.conflictGroup] = item.suggestion.id;
      visibleCards.push({
        suggestion: item.suggestion, priorityScore: item.priorityScore, severityScore: item.sevScore,
        contextRelevanceScore: item.relScore, confidenceScore: item.confScore,
        stackSlot: slot, queueReason: "visible", conflictWithId: null,
      });
    } else {
      queuedCards.push({
        suggestion: item.suggestion, priorityScore: item.priorityScore, severityScore: item.sevScore,
        contextRelevanceScore: item.relScore, confidenceScore: item.confScore,
        stackSlot: null, queueReason: "capacity-cap", conflictWithId: null,
      });
    }
  }

  const criticalInVisibleCount = visibleCards.filter((c) => c.suggestion.severity === "critical").length;
  const unshownCriticalCount = queuedCards.filter((c) => c.suggestion.severity === "critical").length;

  return {
    contextId: input.contextId, maxVisible, visibleCards, queuedCards,
    dismissedCount, deferredConflictCount, criticalInVisibleCount, unshownCriticalCount,
    cognitiveLoadStatus: unshownCriticalCount > 0 ? "guarded" : "calm",
    summaryKo: `동시 제안 ${active.length}건 중 최상단 ${visibleCards.length}건만 표시하고 ${queuedCards.length}건은 백그라운드 큐로 보류했습니다(충돌 보류 ${deferredConflictCount}건).`,
    summaryEn: `Surfaced top ${visibleCards.length} of ${active.length} active suggestions and held ${queuedCards.length} in background queue (${deferredConflictCount} conflict-deferred).`,
  };
}

function classifyThermalMetrics(
  memoryMb: number, frameMs: number, thermalPoints: number, tier: DeviceTierSpec,
): ThermalBudgetMetrics {
  const estimatedMemoryMb = Math.max(120, Math.round(memoryMb));
  const memoryUtilizationPct = round1((estimatedMemoryMb / Math.max(1, tier.memoryBudgetMb)) * 100);
  const estimatedFrameMs = round1(Math.max(4.0, frameMs));
  const estimatedFps = Math.min(60, Math.max(12, Math.round(1000 / estimatedFrameMs)));
  const thermalLoadPct = round1(clampNumber((thermalPoints / Math.max(1, tier.thermalHeadroom)) * 100, 12, 100));
  const status: ThermalBudgetStatus =
    memoryUtilizationPct >= 92 || estimatedFrameMs > 22.0 || thermalLoadPct >= 88
      ? "critical"
      : memoryUtilizationPct >= 75 || estimatedFrameMs > tier.targetFrameMs || thermalLoadPct >= 72
        ? "caution"
        : "safe";
  return { estimatedMemoryMb, memoryUtilizationPct, estimatedFrameMs, estimatedFps, thermalLoadPct, status };
}

function buildDegradationCatalog(
  features: DeviceFeatureFlags, tier: DeviceTierSpec, raw: ThermalBudgetMetrics,
): readonly SafeDegradationProposal[] {
  if (raw.status === "safe") return [];
  const proposals: SafeDegradationProposal[] = [];
  const mult = tier.featureLoadMultiplier;

  if (features.bg3dViewport) {
    proposals.push({
      id: "pause-bg3d-viewport", titleKo: "3D 배경 뷰포트 일시정지", titleEn: "Pause Live 3D Viewport",
      effectKo: "현재 카메라 각도를 정적 2D 레퍼런스 스냅샷으로 고정해 드로잉 중 GPU 점유를 즉시 내립니다.",
      effectEn: "Freeze current 3D angle into a lightweight 2D snapshot while sketching; resume anytime with 1 tap.",
      targetFeature: "bg3dViewport",
      savedMemoryMb: Math.round(280 * mult), savedFrameMs: round1(4.3 * mult), savedThermalPoints: Math.round(20 * mult),
      nonDestructive: true, reversible: true,
    });
  }
  if (features.impastoTexture) {
    proposals.push({
      id: "lower-impasto-lod", titleKo: "임파스토 질감 LOD 하향", titleEn: "Lower Impasto LOD",
      effectKo: "편집 미리보기만 1/2 높이맵으로 낮추고 저장·출고 시에는 원본 임파스토 두께를 그대로 유지합니다.",
      effectEn: "Halve live impasto heightmap preview while preserving full-resolution pigment height on save/export.",
      targetFeature: "impastoTexture",
      savedMemoryMb: Math.round(150 * mult), savedFrameMs: round1(2.8 * mult), savedThermalPoints: Math.round(14 * mult),
      nonDestructive: true, reversible: true,
    });
  }
  proposals.push({
    id: "throttle-background-precache", titleKo: "백그라운드 프리캐시 스로틀링", titleEn: "Throttle Background Precache",
    effectKo: "인접 컷 선행 디코딩과 유휴 AI 임베딩을 펜 입력 멈춤 이후로 지연해 프레임 드롭과 발열을 막습니다.",
    effectEn: "Defer neighbor-cut precaching and idle AI warmups until stylus lift to stabilize frame pacing.",
    targetFeature: "precache",
    savedMemoryMb: Math.round((features.localAiAssist ? 250 : 140) * mult),
    savedFrameMs: round1((features.localAiAssist ? 3.2 : 2.1) * mult),
    savedThermalPoints: Math.round((features.localAiAssist ? 17 : 11) * mult),
    nonDestructive: true, reversible: true,
  });
  if (features.canvas4k && (tier.id === "entry-mobile-4gb" || tier.id === "ipad-pro-tablet" || raw.memoryUtilizationPct >= 95)) {
    proposals.push({
      id: "tile-4k-stream-cap", titleKo: "4K 비가시 타일 OPFS 스왑 압축", titleEn: "Swap Off-Screen 4K Tiles to OPFS",
      effectKo: "화면 밖 4K 타일을 무손실 OPFS 캐시로 내려 RAM 피크를 줄이고 줌인 시 원본 해상도를 즉시 복원합니다.",
      effectEn: "Stream off-viewport 4K tiles to lossless OPFS cache without downsampling the master canvas.",
      targetFeature: "canvas4k",
      savedMemoryMb: Math.round(210 * mult), savedFrameMs: round1(1.7 * mult), savedThermalPoints: Math.round(9 * mult),
      nonDestructive: true, reversible: true,
    });
  }
  return proposals;
}

/** 기기 티어 × 활성 기능 조합의 VRAM/RAM·프레임·발열 부하를 평가하고 비파괴 안전 강등을 제안한다. */
export function evaluateDeviceThermalBudget(
  deviceTierId: DeviceTierId,
  features: DeviceFeatureFlags,
  appliedDegradationIds: readonly SafeDegradationId[] = [],
): DeviceThermalBudgetReport {
  calmMember(deviceTierId, ["flagship-desktop", "apple-silicon-laptop", "ipad-pro-tablet", "entry-mobile-4gb"]);
  features = validateCalmFeatures(features); appliedDegradationIds = validateCalmGuards(appliedDegradationIds);
  const tier = getDeviceTierSpec(deviceTierId);
  let rawMemoryMb = BASE_STUDIO_MEMORY_MB;
  let rawFrameMs = BASE_STUDIO_FRAME_MS;
  let rawThermalPoints = BASE_STUDIO_THERMAL_POINTS;
  let activeFeatureCount = 0;

  for (const spec of DEVICE_FEATURE_LOADS) {
    if (features[spec.id]) {
      activeFeatureCount += 1;
      rawMemoryMb += spec.memoryMb * tier.featureLoadMultiplier;
      rawFrameMs += spec.frameMs * tier.featureLoadMultiplier;
      rawThermalPoints += spec.thermalPoints * tier.featureLoadMultiplier;
    }
  }

  const raw = classifyThermalMetrics(rawMemoryMb, rawFrameMs, rawThermalPoints, tier);
  const proposals = buildDegradationCatalog(features, tier, raw);
  const validAppliedIds = appliedDegradationIds.filter((id) => proposals.some((item) => item.id === id));
  const appliedSet = new Set<SafeDegradationId>(validAppliedIds);

  let curSavedMem = 0, curSavedMs = 0, curSavedThermal = 0;
  let allSavedMem = 0, allSavedMs = 0, allSavedThermal = 0;
  for (const prop of proposals) {
    allSavedMem += prop.savedMemoryMb;
    allSavedMs += prop.savedFrameMs;
    allSavedThermal += prop.savedThermalPoints;
    if (appliedSet.has(prop.id)) {
      curSavedMem += prop.savedMemoryMb;
      curSavedMs += prop.savedFrameMs;
      curSavedThermal += prop.savedThermalPoints;
    }
  }

  const current = classifyThermalMetrics(rawMemoryMb - curSavedMem, rawFrameMs - curSavedMs, rawThermalPoints - curSavedThermal, tier);
  const projectedAfterAllGuards = classifyThermalMetrics(rawMemoryMb - allSavedMem, rawFrameMs - allSavedMs, rawThermalPoints - allSavedThermal, tier);
  const needsDegradation = current.status !== "safe";

  return {
    deviceTier: tier, features: { ...features }, activeFeatureCount,
    appliedDegradationIds: validAppliedIds, raw, current, projectedAfterAllGuards,
    degradationProposals: proposals, needsDegradation,
    summaryKo: needsDegradation
      ? `${tier.labelKo} 기준 추정 메모리 ${current.estimatedMemoryMb}MB(${current.memoryUtilizationPct}%)·열 부하 ${current.thermalLoadPct}%로 임계치를 넘었습니다. 비파괴 안전 강등 ${proposals.length}건을 권장합니다.`
      : `${tier.labelKo} 안전 예산 안에서 구동 중입니다(${current.estimatedMemoryMb}MB / ${tier.memoryBudgetMb}MB, ${current.estimatedFps}fps).`,
    summaryEn: needsDegradation
      ? `${tier.labelEn} exceeds safe headroom at ${current.estimatedMemoryMb}MB (${current.memoryUtilizationPct}%) and ${current.thermalLoadPct}% thermal load. ${proposals.length} non-destructive guards recommended.`
      : `Within ${tier.labelEn} budget (${current.estimatedMemoryMb}MB / ${tier.memoryBudgetMb}MB, ${current.estimatedFps}fps).`,
  };
}

export function updateGestureMacro(
  macros: readonly GestureMacroBinding[],
  triggerId: GestureTriggerId,
  patch: { readonly actionId?: GestureActionId; readonly enabled?: boolean },
): readonly GestureMacroBinding[] {
  const source = validateCalmGestures(macros);
  const next = source.map((macro) => (macro.triggerId !== triggerId ? macro : {
    ...macro,
    actionId: patch.actionId ?? macro.actionId,
    enabled: patch.enabled ?? macro.enabled,
  }));
  return validateCalmGestures(next);
}

export function resetGestureMacros(): readonly GestureMacroBinding[] {
  return DEFAULT_GESTURE_MACROS.map((macro) => ({ ...macro }));
}

export function findDuplicateGestureActions(macros: readonly GestureMacroBinding[]): readonly GestureActionId[] {
  const seen = new Set<GestureActionId>();
  const duplicates = new Set<GestureActionId>();
  for (const macro of validateCalmGestures(macros)) {
    if (!macro.enabled) continue;
    if (seen.has(macro.actionId)) duplicates.add(macro.actionId);
    else seen.add(macro.actionId);
  }
  return Array.from(duplicates);
}

function cloneSnapshot(snapshot: AdaptiveCalmConfigSnapshot): AdaptiveCalmConfigSnapshot {
  return validateCalmSnapshot(snapshot);
}

export function createAdaptiveCalmSession(options?: {
  readonly initialContextId?: StudioContextId | undefined;
  readonly initialDeviceTier?: DeviceTierId | undefined;
  readonly initialFeatures?: Partial<DeviceFeatureFlags> | undefined;
}): AdaptiveCalmSessionState {
  const context = getStudioContextProfile(options?.initialContextId);
  const tier = getDeviceTierSpec(options?.initialDeviceTier);
  const baseline: AdaptiveCalmConfigSnapshot = {
    contextId: context.id, focusBoost: false, deviceTierId: tier.id,
    features: {
      canvas4k: options?.initialFeatures?.canvas4k ?? DEFAULT_DEVICE_FEATURES.canvas4k,
      bg3dViewport: options?.initialFeatures?.bg3dViewport ?? DEFAULT_DEVICE_FEATURES.bg3dViewport,
      impastoTexture: options?.initialFeatures?.impastoTexture ?? DEFAULT_DEVICE_FEATURES.impastoTexture,
      localAiAssist: options?.initialFeatures?.localAiAssist ?? DEFAULT_DEVICE_FEATURES.localAiAssist,
    },
    appliedDegradationIds: [],
    gestures: resetGestureMacros(),
  };
  return { status: "idle", baseline, working: cloneSnapshot(baseline), applied: null, historyCount: 0 };
}

export function updateWorkingCalmSnapshot(
  session: AdaptiveCalmSessionState,
  updater: (working: AdaptiveCalmConfigSnapshot) => AdaptiveCalmConfigSnapshot,
): AdaptiveCalmSessionState {
  assertCalmSession(session);
  const working = cloneSnapshot(updater(cloneSnapshot(session.working)));
  return JSON.stringify(working) === JSON.stringify(cloneSnapshot(session.working))
    ? session : { ...session, status: "idle", working };
}

export function applyRecommendedDegradations(
  session: AdaptiveCalmSessionState,
  report: DeviceThermalBudgetReport,
): AdaptiveCalmSessionState {
  assertCalmSession(session);
  if (report.deviceTier.id !== session.working.deviceTierId || JSON.stringify(validateCalmFeatures(report.features)) !== JSON.stringify(validateCalmFeatures(session.working.features))) throw new RangeError("권장 가드가 현재 기기·기능 예제와 다릅니다.");
  const current = evaluateDeviceThermalBudget(session.working.deviceTierId, session.working.features, session.working.appliedDegradationIds);
  const allIds = current.degradationProposals.map((item) => item.id);
  return updateWorkingCalmSnapshot(session, (working) => ({ ...working, appliedDegradationIds: allIds }));
}

export function toggleDegradationGuard(
  session: AdaptiveCalmSessionState,
  degradationId: SafeDegradationId,
): AdaptiveCalmSessionState {
  validateCalmGuards([degradationId]);
  return updateWorkingCalmSnapshot(session, (working) => {
    const exists = working.appliedDegradationIds.includes(degradationId);
    const nextIds = exists
      ? working.appliedDegradationIds.filter((id) => id !== degradationId)
      : [...working.appliedDegradationIds, degradationId];
    return { ...working, appliedDegradationIds: nextIds };
  });
}

export function applyAdaptiveCalmSession(session: AdaptiveCalmSessionState): AdaptiveCalmSessionState {
  assertCalmSession(session);
  return { ...session, status: "applied", applied: cloneSnapshot(session.working), historyCount: nextCalmHistory(session) };
}

export function revertAdaptiveCalmSession(session: AdaptiveCalmSessionState): AdaptiveCalmSessionState {
  assertCalmSession(session);
  return { ...session, status: "reverted", working: cloneSnapshot(session.baseline), applied: null, historyCount: nextCalmHistory(session) };
}
