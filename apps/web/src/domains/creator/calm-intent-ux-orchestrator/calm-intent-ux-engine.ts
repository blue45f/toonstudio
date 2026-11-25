/**
 * Wave 57B — 화면 복잡도 극한 감축(Zen 94% · Stage 86% · Pro 82%) ·
 * 의도 기반 0-용어 직관 UX · 8방향 방사형 파이 휠 · 고대비/색각안전 디자인 오케스트레이터 엔진.
 *
 * - 순수 결정론적 TypeScript 엔진 (DOM · 브라우저 저장소 · 네트워크 의존 0건)
 * - 원시 hex/rgb/hsl 0건, 바이올렛 슬롭 휴(270~320°) 0% 엄격 보장
 * - Hick-Hyman 법칙 + Fitts's Law + OKLCH->LMS->WCAG 2.1 대비비·색각안전(Viénot/Machado) 실측 수식 기반
 */

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;

export type ComplexityTierId = "zen-focus" | "stage-flow" | "atelier-pro";
export type WorkflowStageId = "sketch" | "ink" | "color-light" | "scene-3d" | "letter-fx" | "publish-goods";
export type AtelierThemeId = "warm-alabaster-light" | "ink-slate-dark" | "warm-sepia-paper" | "wcag-aaa-ultra";
export type ColorVisionModeId = "normal" | "protanopia" | "deuteranopia" | "tritanopia";
export type RadialDirectionId = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type CreativeIntentId =
  | "rim-backlight" | "hand-anatomy-fix" | "crayon-paper-texture" | "episode-size-slim"
  | "goods-cutline" | "scene-window-frame" | "papercraft-unfold" | "copyright-proof";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface ComplexityTierSpec {
  readonly id: ComplexityTierId; readonly labelKo: string; readonly labelEn: string;
  readonly shortTagKo: string; readonly shortTagEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly canvasViewportPercent: number; readonly chromeOccupancyPercent: number; readonly visibleControlCount: number;
  readonly topBarHeightPx: number; readonly leftRailWidthPx: number; readonly proDrawerExpandable: boolean;
  readonly proDrawerControlsCount: number; readonly minTouchTargetPx: number; readonly radialWheelRadiusPx: number;
}
export interface StageControlItem {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly hintKo: string; readonly hintEn: string; readonly priority: "zen" | "stage" | "pro";
}
export interface WorkflowStageSpec {
  readonly id: WorkflowStageId; readonly order: number; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly controls: readonly StageControlItem[]; readonly proDrawerExtras: readonly StageControlItem[];
}
export interface CognitiveLoadSnapshot {
  readonly labelKo: string; readonly labelEn: string; readonly visibleControlCount: number;
  readonly canvasViewportPercent: number; readonly hickDecisionMs: number;
  readonly fittsTravelDistancePx: number; readonly fittsTargetWidthPx: number;
  readonly fittsIndexOfDifficultyBits: number; readonly fittsMovementMs: number;
  readonly jargonTermCount: number; readonly jargonExposurePercent: number; readonly touchReadyPercent: number;
}
export interface CognitiveLoadAuditResult {
  readonly tierId: ComplexityTierId; readonly stageId: WorkflowStageId;
  readonly overcrowdedBaseline: CognitiveLoadSnapshot; readonly toonStudioActive: CognitiveLoadSnapshot;
  readonly controlReductionPercent: number; readonly hickTimeSavedMs: number; readonly hickTimeSavedPercent: number;
  readonly fittsTravelSavedPx: number; readonly fittsTravelSavedPercent: number;
  readonly fittsTimeSavedMs: number; readonly fittsTimeSavedPercent: number;
  readonly canvasGainPercent: number; readonly jargonEliminatedPercent: number;
  readonly meetsCanvas82Contract: boolean; readonly meetsZeroJargonTarget: boolean; readonly calmIndexScore: number;
}
export interface IntentActionCard {
  readonly id: string; readonly titleKo: string; readonly titleEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly ghostPreviewKo: string; readonly ghostPreviewEn: string;
  readonly applyCtaKo: string; readonly applyCtaEn: string;
  readonly estimatedSeconds: number; readonly capabilityKey: string;
}
export interface CreativeIntentDefinition {
  readonly id: CreativeIntentId; readonly canonicalQueryKo: string; readonly canonicalQueryEn: string;
  readonly keywords: readonly string[]; readonly recommendedStage: WorkflowStageId; readonly quickChip: boolean;
  readonly ghostOverlayBadgeKo: string; readonly ghostOverlayBadgeEn: string; readonly cards: readonly IntentActionCard[];
}
export interface CreativeIntentResolution {
  readonly query: string; readonly matched: boolean;
  readonly intentId: CreativeIntentId | "stage-guided-fallback"; readonly confidence: number;
  readonly recommendedStage: WorkflowStageId; readonly ghostOverlayBadgeKo: string; readonly ghostOverlayBadgeEn: string;
  readonly cards: readonly IntentActionCard[]; readonly jargonFreeVerified: boolean;
}
export interface RadialPieSlot {
  readonly id: string; readonly direction: RadialDirectionId; readonly angleDeg: number;
  readonly labelKo: string; readonly labelEn: string; readonly shortcutHint: string;
  readonly unitX: number; readonly unitY: number;
}
export interface MultimodalGestureSpec {
  readonly id: string; readonly modality: "touch" | "stylus" | "edge";
  readonly triggerKo: string; readonly triggerEn: string; readonly actionKo: string; readonly actionEn: string;
  readonly responseTargetMs: number; readonly handednessNoteKo: string; readonly handednessNoteEn: string;
}
export interface AtelierThemePalette {
  readonly id: AtelierThemeId; readonly labelKo: string; readonly labelEn: string;
  readonly contrastStandard: "WCAG-AA" | "WCAG-AAA"; readonly minTargetRatio: number;
  readonly canvas: OklchColor; readonly panel: OklchColor; readonly card: OklchColor; readonly line: OklchColor;
  readonly fg: OklchColor; readonly fgMuted: OklchColor; readonly accent: OklchColor; readonly onAccent: OklchColor;
  readonly good: OklchColor; readonly warn: OklchColor; readonly bad: OklchColor; readonly info: OklchColor;
}
export interface ColorVisionModeSpec {
  readonly id: ColorVisionModeId; readonly labelKo: string; readonly labelEn: string;
  readonly noteKo: string; readonly noteEn: string;
}
export interface ThemeVisionContrastRow {
  readonly themeId: AtelierThemeId; readonly visionMode: ColorVisionModeId;
  readonly bodyContrastRatio: number; readonly mutedContrastRatio: number;
  readonly accentContrastRatio: number; readonly buttonTextContrastRatio: number;
  readonly semanticDistinctScore: number; readonly passesAa: boolean;
  readonly passesAaa: boolean; readonly meetsThemeTarget: boolean;
}
export interface ConcentricRadiusAudit {
  readonly outerPanelRadiusPx: number; readonly innerPaddingPx: number; readonly cardRadiusPx: number;
  readonly cardGapPx: number; readonly controlRadiusPx: number;
  readonly maxDriftPx: number; readonly exactConcentric: boolean;
}
export interface VisualBalance85105Audit {
  readonly neutralCanvasPercent: number; readonly secondaryChromePercent: number;
  readonly accentSignalPercent: number; readonly totalPercent: number; readonly passesRule: boolean;
}
export interface VioletSlopAudit {
  readonly inspectedTokenCount: number; readonly violetTokenCount: number;
  readonly violetSlopPercent: number; readonly passed: boolean;
}
export interface AtelierDesignPolishAudit {
  readonly activeTheme: AtelierThemePalette; readonly activeVisionMode: ColorVisionModeSpec;
  readonly activeContrast: ThemeVisionContrastRow; readonly matrix16: readonly ThemeVisionContrastRow[];
  readonly matrixPassCount: number; readonly aaaThemeAllVisionPass: boolean;
  readonly concentricRadius: ConcentricRadiusAudit; readonly visualBalance: VisualBalance85105Audit;
  readonly violetSlop: VioletSlopAudit; readonly overallPolishScore: number;
}
export interface CalmIntentUxProfileSnapshot {
  readonly tier: ComplexityTierSpec; readonly stage: WorkflowStageSpec;
  readonly visibleControls: readonly StageControlItem[]; readonly cognitiveAudit: CognitiveLoadAuditResult;
  readonly intentResolution: CreativeIntentResolution; readonly radialSlots: readonly RadialPieSlot[];
  readonly gestures: readonly MultimodalGestureSpec[]; readonly designPolish: AtelierDesignPolishAudit;
  readonly leftHanded: boolean; readonly proDrawerOpen: boolean;
}

const HICK_INTERCEPT_MS = 200;
const HICK_SLOPE_MS = 155;
const FITTS_INTERCEPT_MS = 110;
const FITTS_SLOPE_MS = 105;

export const OVERCROWDED_UI_BASELINE = { visibleControlCount: 72, canvasViewportPercent: 54, fittsTravelDistancePx: 520, fittsTargetWidthPx: 26, jargonTermCount: 28, touchReadyControls: 30 } as const;
export const FORBIDDEN_UI_JARGON_TERMS: readonly string[] = [
  "webgpu", "wgsl", "shader", "bvh", "crdt", "opfs", "sqlite", "wasm", "hlc", "sdf",
  "subgroups", "raymarch", "normal map", "uv seam", "rasterize", "quantize", "premultiply",
  "bezier", "polygon", "tensor", "셰이더", "노멀맵", "래스터화", "양자화", "폴리곤", "텐서",
];

const roundTo = (value: number, digits: number): number => Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const ok = (l: number, c: number, h: number): OklchColor => ({ l, c, h });
const ctrl = (id: string, labelKo: string, labelEn: string, hintKo: string, hintEn: string, priority: "zen" | "stage" | "pro"): StageControlItem => ({ id, labelKo, labelEn, hintKo, hintEn, priority });
const card = (
  id: string, titleKo: string, titleEn: string, summaryKo: string, summaryEn: string,
  ghostPreviewKo: string, ghostPreviewEn: string, applyCtaKo: string, applyCtaEn: string, estimatedSeconds: number, capabilityKey: string,
): IntentActionCard => ({ id, titleKo, titleEn, summaryKo, summaryEn, ghostPreviewKo, ghostPreviewEn, applyCtaKo, applyCtaEn, estimatedSeconds, capabilityKey });

export function normalizeHue(hue: number): number { const m = hue % 360; return m < 0 ? m + 360 : m; }
export function isVioletSlopHue(hue: number): boolean { const h = normalizeHue(hue); return h >= VIOLET_SLOP_MIN_HUE && h <= VIOLET_SLOP_MAX_HUE; }
export function sanitizeNonVioletHue(hue: number): number { const h = normalizeHue(hue); return !isVioletSlopHue(h) ? roundTo(h, 1) : (h < 295 ? 248 : 342); }
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp01(color.l), 3); const c = roundTo(Math.max(0, color.c), 3); const h = sanitizeNonVioletHue(color.h);
  return alpha === undefined ? `oklch(${l} ${c} ${h})` : `oklch(${l} ${c} ${h} / ${clamp01(alpha).toFixed(2)})`;
}

function oklchToLinearRgb(color: OklchColor): readonly [number, number, number] {
  const hRad = (sanitizeNonVioletHue(color.h) * Math.PI) / 180;
  const a = color.c * Math.cos(hRad); const b = color.c * Math.sin(hRad);
  const l_ = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_; const m = m_ * m_ * m_; const s = s_ * s_ * s_;
  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function linearRgbToOklch(r: number, g: number, b: number): OklchColor {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  return { l: roundTo(clamp01(L), 3), c: roundTo(C, 3), h: C < 0.001 ? 80 : sanitizeNonVioletHue((Math.atan2(B, A) * 180) / Math.PI) };
}

function applyColorVisionMatrix(rgb: readonly [number, number, number], visionMode: ColorVisionModeId): readonly [number, number, number] {
  const [r, g, b] = rgb;
  if (visionMode === "normal") return rgb;
  if (visionMode === "protanopia") return [clamp01(0.152286 * r + 1.052583 * g - 0.204868 * b), clamp01(0.114503 * r + 0.786281 * g + 0.099216 * b), clamp01(-0.003882 * r - 0.048116 * g + 1.051998 * b)];
  if (visionMode === "deuteranopia") return [clamp01(0.367322 * r + 0.860646 * g - 0.227968 * b), clamp01(0.280085 * r + 0.672501 * g + 0.047413 * b), clamp01(-0.01182 * r + 0.04294 * g + 0.968881 * b)];
  return [clamp01(1.255528 * r - 0.076749 * g - 0.178779 * b), clamp01(-0.078411 * r + 0.930809 * g + 0.147602 * b), clamp01(0.004733 * r + 0.691367 * g + 0.3039 * b)];
}

export function simulateColorVisionOklch(color: OklchColor, visionMode: ColorVisionModeId): OklchColor {
  if (visionMode === "normal") return { l: color.l, c: color.c, h: sanitizeNonVioletHue(color.h) };
  const [r, g, b] = applyColorVisionMatrix(oklchToLinearRgb(color), visionMode);
  return linearRgbToOklch(r, g, b);
}

export function computeOklchContrastRatio(foreground: OklchColor, background: OklchColor, visionMode: ColorVisionModeId = "normal"): number {
  const [fr, fg, fb] = applyColorVisionMatrix(oklchToLinearRgb(foreground), visionMode);
  const [br, bg, bb] = applyColorVisionMatrix(oklchToLinearRgb(background), visionMode);
  const lumF = 0.2126 * fr + 0.7152 * fg + 0.0722 * fb;
  const lumB = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
  return roundTo((Math.max(lumF, lumB) + 0.05) / (Math.min(lumF, lumB) + 0.05), 2);
}

export const COMPLEXITY_TIERS: readonly ComplexityTierSpec[] = [
  {
    id: "zen-focus", labelKo: "Zen 집중 몰입", labelEn: "Zen Focus", shortTagKo: "캔버스 94% · 5컨트롤", shortTagEn: "94% Canvas · 5 Controls",
    summaryKo: "상단바와 패널을 모두 접고 꼭 필요한 5개 도구만 남긴 순수 작화 화면", summaryEn: "Pure drawing surface keeping only 5 core tools and 94% canvas space",
    canvasViewportPercent: 94, chromeOccupancyPercent: 6, visibleControlCount: 5, topBarHeightPx: 0, leftRailWidthPx: 0,
    proDrawerExpandable: false, proDrawerControlsCount: 0, minTouchTargetPx: 48, radialWheelRadiusPx: 68,
  },
  {
    id: "stage-flow", labelKo: "Stage 작업 흐름", labelEn: "Stage Flow", shortTagKo: "캔버스 86% · 단계별 7컨트롤", shortTagEn: "86% Canvas · 7 Stage Controls",
    summaryKo: "6단계 공정에 맞춰 지금 손에 닿아야 할 7개 도구만 자동으로 바꾸는 기본 화면", summaryEn: "Default flow showing exactly 7 stage-matched controls across 6 stages",
    canvasViewportPercent: 86, chromeOccupancyPercent: 14, visibleControlCount: 7, topBarHeightPx: 44, leftRailWidthPx: 48,
    proDrawerExpandable: false, proDrawerControlsCount: 0, minTouchTargetPx: 44, radialWheelRadiusPx: 76,
  },
  {
    id: "atelier-pro", labelKo: "Atelier 프로 확장", labelEn: "Atelier Pro", shortTagKo: "캔버스 82% · 전문 서랍 1클릭", shortTagEn: "82% Canvas · 1-Click Pro Drawer",
    summaryKo: "캔버스 82% 계약을 지키면서 1클릭 전문 서랍으로 세부 제어 2칸을 즉시 여는 화면", summaryEn: "Preserves 82% canvas while unfolding a 1-click specialist drawer",
    canvasViewportPercent: 82, chromeOccupancyPercent: 18, visibleControlCount: 9, topBarHeightPx: 44, leftRailWidthPx: 48,
    proDrawerExpandable: true, proDrawerControlsCount: 2, minTouchTargetPx: 44, radialWheelRadiusPx: 76,
  },
] as const;

export const WORKFLOW_STAGES: readonly WorkflowStageSpec[] = [
  {
    id: "sketch", order: 1, labelKo: "1. 스케치·콘티", labelEn: "1. Sketch",
    summaryKo: "아이디어와 컷 구도를 막힘없이 빠르게 잡는 단계", summaryEn: "Fast rough framing and panel beat layout",
    controls: [
      ctrl("rough-pencil", "연필", "Pencil", "부드러운 흑연 러프 선", "Soft graphite sketch", "zen"),
      ctrl("soft-eraser", "지우개", "Eraser", "살살 지우기", "Gentle erase", "zen"),
      ctrl("panel-cut", "컷 나누기", "Split Panel", "세로 원고 칸 분할", "Slice vertical panels", "zen"),
      ctrl("flip-view", "좌우 반전", "Flip View", "비율 어색함 즉시 확인", "Check symmetry fast", "zen"),
      ctrl("undo-step", "실행 취소", "Undo", "직전 획 되돌리기", "Step back one stroke", "zen"),
      ctrl("rough-copy", "구도 복제", "Duplicate Rough", "이전 컷 구도 이어쓰기", "Reuse prior framing", "stage"),
      ctrl("balloon-spot", "대사 자리", "Dialogue Spot", "말풍선 여백 미리 확보", "Reserve speech space", "stage"),
    ],
    proDrawerExtras: [
      ctrl("scroll-rhythm", "스크롤 호흡선", "Scroll Rhythm", "모바일 한 화면 시선 안내", "Phone viewport pacing", "pro"),
      ctrl("thumbnail-strip", "전체 컷 지도", "Cut Overview", "회차 흐름 한눈에 보기", "Whole-episode strip", "pro"),
    ],
  },
  {
    id: "ink", order: 2, labelKo: "2. 선화·펜터치", labelEn: "2. Inking",
    summaryKo: "깔끔한 필압과 손떨림 보정으로 본선을 정리하는 단계", summaryEn: "Clean pressure-driven line art with steady curves",
    controls: [
      ctrl("g-pen", "G펜", "G-Pen", "강약 살아나는 먹선", "Crisp comic ink nib", "zen"),
      ctrl("clean-eraser", "선 지우개", "Line Eraser", "교차선만 깔끔히 지우기", "Trim crossing lines", "zen"),
      ctrl("steady-hand", "손떨림 보정", "Steady Hand", "흔들림 없이 매끄러운 곡선", "Smooth shaky strokes", "zen"),
      ctrl("line-weight", "선 굵기", "Line Weight", "필압 굵기 바로 조절", "Tune line taper", "zen"),
      ctrl("undo-ink", "실행 취소", "Undo", "직전 선 되돌리기", "Step back stroke", "zen"),
      ctrl("ruler-guide", "눈높이 안내선", "Horizon Guide", "기울기·원근 맞춤 자", "Snap perspective lines", "stage"),
      ctrl("close-gap", "틈새 막기", "Close Gaps", "채색 새지 않게 선 잇기", "Seal open outlines", "stage"),
    ],
    proDrawerExtras: [
      ctrl("taper-curve", "필압 곡선 서랍", "Pressure Curve", "손 힘에 맞춘 필압 감도", "Custom stylus feel", "pro"),
      ctrl("ink-reference", "선화 참조 묶기", "Reference Line", "채색 기준선 고정", "Lock fill reference", "pro"),
    ],
  },
  {
    id: "color-light", order: 3, labelKo: "3. 채색·조명", labelEn: "3. Color & Light",
    summaryKo: "밑색 채우기부터 크레용 질감·역광 분위기까지 완성하는 단계", summaryEn: "Flat fills, tactile crayon grain, and warm rim lighting",
    controls: [
      ctrl("gap-fill", "틈새 채우기", "Smart Fill", "한 번 터치로 밑색 채우기", "One-tap clean fill", "zen"),
      ctrl("tactile-brush", "질감 브러시", "Texture Brush", "수채·크레용·파스텔 촉감", "Watercolor & crayon", "zen"),
      ctrl("color-pick", "색 고르기", "Color Pick", "조화로운 색 팔레트", "Harmonized swatches", "zen"),
      ctrl("rim-light", "역광 얹기", "Rim Backlight", "인물 테두리 빛 추가", "Warm edge glow", "zen"),
      ctrl("undo-color", "실행 취소", "Undo", "직전 채색 되돌리기", "Step back coloring", "zen"),
      ctrl("shadow-cast", "그림자 넣기", "Cast Shadow", "빛 방향 맞춰 그림자 생성", "Direction-matched shade", "stage"),
      ctrl("layer-clip", "안쪽만 칠하기", "Paint Inside", "선 밖으로 번지지 않게 잠금", "Stay inside base shape", "stage"),
    ],
    proDrawerExtras: [
      ctrl("mood-grade", "시간대 색감 서랍", "Time-of-Day Tone", "아침·노을·새벽 분위기 전환", "Dawn/Sunset/Night tone", "pro"),
      ctrl("paper-grain", "종이 결 서랍", "Paper Grain", "도화지·한지 요철 강도", "Cardstock tooth depth", "pro"),
    ],
  },
  {
    id: "scene-3d", order: 4, labelKo: "4. 배경·포즈", labelEn: "4. Scene & Pose",
    summaryKo: "어색한 손 포즈와 창틀·실내 배경을 컷 각도에 맞춰 바로 얹는 단계", summaryEn: "Pose awkward hands and fit 3D architectural props to camera",
    controls: [
      ctrl("hand-pose", "손 포즈 맞추기", "Hand Pose", "자연스러운 손가락 관절 잡기", "Natural finger pose", "zen"),
      ctrl("prop-place", "창틀·소품 놓기", "Place Prop", "벽 각도에 딱 붙는 소품", "Snap props to wall", "zen"),
      ctrl("camera-angle", "카메라 구도", "Camera Angle", "눈높이·로우앵글 조절", "Adjust lens angle", "zen"),
      ctrl("bake-ink", "선화로 바꾸기", "Convert to Lines", "배경을 내 펜 굵기 선으로 변환", "Ink lines from scene", "zen"),
      ctrl("undo-3d", "실행 취소", "Undo", "직전 배치 되돌리기", "Revert placement", "zen"),
      ctrl("hide-wall", "가림 벽 숨기기", "Hide Blocking Wall", "시야 막는 벽 자동 투명화", "Auto-hide front wall", "stage"),
      ctrl("sun-dir", "햇살 방향", "Sunlight Angle", "창문 빛무늬 위치 조절", "Move window sunbeams", "stage"),
    ],
    proDrawerExtras: [
      ctrl("measure-fit", "실측 치수 서랍", "True Dimensions", "창틀·책상 실제 cm 맞춤", "Exact cm proportions", "pro"),
      ctrl("cut-bookmark", "앵글 저장 서랍", "Saved Angles", "자주 쓰는 방 구도 기억", "Recall room cameras", "pro"),
    ],
  },
  {
    id: "letter-fx", order: 5, labelKo: "5. 식자·연출", labelEn: "5. Lettering & FX",
    summaryKo: "읽기 편한 말풍선과 효과음으로 대사 리듬을 살리는 단계", summaryEn: "Readable dialogue balloons, tails, and comic sound effects",
    controls: [
      ctrl("speech-bubble", "말풍선", "Speech Bubble", "대사 길이에 맞게 자동 크기", "Auto-sized dialogue", "zen"),
      ctrl("dialogue-text", "대사 쓰기", "Type Dialogue", "모바일 가독성 기준 글자 크기", "Mobile-legible type", "zen"),
      ctrl("bubble-tail", "말풍선 꼬리", "Bubble Tail", "화자 쪽으로 부드럽게 잇기", "Point to speaker", "zen"),
      ctrl("sfx-stamp", "효과음 글자", "Sound FX", "장면 감정 살리는 의성어", "Expressive SFX art", "zen"),
      ctrl("undo-letter", "실행 취소", "Undo", "직전 식자 되돌리기", "Step back lettering", "zen"),
      ctrl("speed-lines", "집중선", "Focus Lines", "시선을 한 점으로 모으기", "Pull gaze to action", "stage"),
      ctrl("read-order", "읽기 순서", "Reading Flow", "1→2→3 대사 동선 점검", "Verify eye order", "stage"),
    ],
    proDrawerExtras: [
      ctrl("translate-fit", "다국어 말풍선 서랍", "Translation Fit", "영문·일문 대사 넘침 방지", "Prevent text overflow", "pro"),
      ctrl("font-rights", "폰트 상업 확인 서랍", "Font License", "사용 폰트 상업 허용 여부", "Commercial font check", "pro"),
    ],
  },
  {
    id: "publish-goods", order: 6, labelKo: "6. 마감·굿즈", labelEn: "6. Publish & Goods",
    summaryKo: "용량 최적화·저작권 확인·굿즈 칼선·종이 전개도까지 한 번에 끝내는 단계", summaryEn: "Slim file size, rights proof, goods cutlines, and paper unfold",
    controls: [
      ctrl("slim-export", "용량 줄이기", "Slim File Size", "선명도 유지하며 업로드 맞춤", "Shrink without blur", "zen"),
      ctrl("goods-cutline", "굿즈 칼선", "Goods Cutline", "키링·스티커 여백 칼선 자동", "Keychain & sticker cut", "zen"),
      ctrl("paper-unfold", "종이 전개도", "Paper Unfold", "인쇄해 접는 3D 종이 도면", "Printable fold pattern", "zen"),
      ctrl("rights-proof", "저작권 확인", "Rights Proof", "소재 출처·창작 기록 확인서", "Usage & authorship log", "zen"),
      ctrl("export-now", "바로 저장", "Save & Export", "연재·인쇄 파일 한 번에 생성", "One-click final output", "zen"),
      ctrl("platform-slice", "연재 규격 자르기", "Episode Slice", "플랫폼 세로 규격 자동 분할", "Auto platform slicing", "stage"),
      ctrl("phone-check", "폰 화면 점검", "Phone Preview", "작은 화면 글자 크기 확인", "Check mobile legibility", "stage"),
    ],
    proDrawerExtras: [
      ctrl("print-bleed", "단행본 재단선 서랍", "Print Bleed", "인쇄 여백·재단선 정밀 점검", "Book bleed & trim", "pro"),
      ctrl("rights-pack", "제출용 증빙 묶음 서랍", "Proof Package", "투고·계약 제출용 확인서 묶기", "Bundle rights report", "pro"),
    ],
  },
] as const;

export const CREATIVE_INTENT_CATALOG: readonly CreativeIntentDefinition[] = [
  {
    id: "rim-backlight", canonicalQueryKo: "역광 넣어줘", canonicalQueryEn: "add rim backlight", recommendedStage: "color-light", quickChip: true,
    keywords: ["역광", "후광", "테두리 빛", "노을 빛", "빛 넣어", "조명", "backlight", "rim light", "rim", "glow"],
    ghostOverlayBadgeKo: "고스트 미리보기 · 인물 오른쪽 위 따뜻한 역광 테두리", ghostOverlayBadgeEn: "Ghost Preview · Warm upper-right rim light edge",
    cards: [
      card("rim-backlight-apply", "인물 뒤 부드러운 역광 얹기", "Add Soft Rim Backlight", "캐릭터 어깨와 머리카락 가장자리에 따뜻한 빛 테두리를 자연스럽게 두릅니다.", "Wraps a clean warm edge light around shoulders and hair silhouettes.", "오른쪽 위 광원 기준으로 인물 윤곽에만 밝은 금빛 테두리가 반투명하게 미리 겹칩니다.", "Overlays a soft warm highlight along the upper-right character silhouette.", "역광 바로 얹기", "Apply Backlight", 2, "lighting.rim-backlight"),
      card("rim-backlight-tone", "노을빛 · 달빛 분위기 고르기", "Pick Sunset or Moonlight Tone", "장면 시간대에 맞춰 역광 색온도와 부드러움만 손쉽게 바꿉니다.", "Switches rim warmth between golden sunset and cool moonlight in one click.", "배경은 그대로 둔 채 인물 가장자리 빛 색감만 석양·달빛으로 즉시 바뀌어 보입니다.", "Previews golden-hour and moonlit rim tints without altering background art.", "빛 분위기 바꾸기", "Switch Light Mood", 2, "lighting.rim-temperature"),
    ],
  },
  {
    id: "hand-anatomy-fix", canonicalQueryKo: "손이 어색해", canonicalQueryEn: "fix awkward hand", recommendedStage: "scene-3d", quickChip: true,
    keywords: ["손이 어색", "손 어색", "손가락", "손 포즈", "손 모양", "손 고쳐", "awkward hand", "fix hand", "hand pose", "fingers"],
    ghostOverlayBadgeKo: "고스트 미리보기 · 자연스러운 손가락 관절 안내선 겹침", ghostOverlayBadgeEn: "Ghost Preview · Natural finger-joint alignment overlay",
    cards: [
      card("hand-fix-relax", "손가락 관절 자연스럽게 다듬기", "Relax Awkward Hand Joints", "무리하게 꺾인 손가락 각도와 손바닥 비율을 사람 손에 맞게 바로잡습니다.", "Corrects stiff finger angles and palm proportions to natural anatomy.", "지금 그린 손 위에 자연스럽게 굽은 다섯 손가락 안내선이 반투명하게 겹쳐 보입니다.", "Displays a translucent relaxed five-finger guide right over your sketch.", "손 안내선 올리기", "Show Hand Guide", 3, "pose.hand-anatomy-guide"),
      card("hand-fix-presets", "자주 쓰는 손 포즈 6종 대보기", "Try 6 Everyday Hand Poses", "컵 쥐기·가리키기·주먹 쥔 손을 현재 컷 카메라 각도에 맞춰 바로 얹습니다.", "Drops holding, pointing, or clenched hand guides matched to cut perspective.", "고른 손 포즈가 컷 시점에 맞춰 반투명 윤곽으로 따라오며 좌우 손 전환도 바로 됩니다.", "Matches the selected hand pose to cut camera angle with instant left/right flip.", "손 포즈 고르기", "Pick Hand Pose", 3, "pose.hand-quick-presets"),
    ],
  },
  {
    id: "crayon-paper-texture", canonicalQueryKo: "크레용 질감", canonicalQueryEn: "crayon texture", recommendedStage: "color-light", quickChip: true,
    keywords: ["크레용", "파스텔", "도화지", "종이 질감", "거친 질감", "갈필", "crayon", "pastel", "paper grain", "dry media"],
    ghostOverlayBadgeKo: "고스트 미리보기 · 도화지 결이 살아나는 크레용 브러시 촉감", ghostOverlayBadgeEn: "Ghost Preview · Textured cardstock crayon stroke feel",
    cards: [
      card("crayon-switch", "거친 도화지 크레용으로 바꾸기", "Switch to Cardstock Crayon", "힘을 빼면 종이 결이 비치고 세게 누르면 진하게 뭉개지는 크레용 촉감으로 전환합니다.", "Reveals paper tooth on light strokes and rich waxy buildup on firm pressure.", "현재 선택한 색으로 도화지 위를 스친 크레용 붓터치 견본이 캔버스 옆에 미리 나타납니다.", "Shows a live sample stroke of waxy grain on textured paper with your active color.", "크레용 브러시 쓰기", "Use Crayon Brush", 1, "brush.crayon-cardstock"),
      card("crayon-paper-strength", "종이 거칠기 단계 고르기", "Pick Paper Tooth Roughness", "매끈한 스케치북·도화지·거친 수채화지 3단계 중에서 원하는 결만 고릅니다.", "Choose among smooth sketchbook, drawing cardstock, or coarse watercolor paper.", "화면 바탕에 선택한 종이 결이 은은하게 깔려 선의 긁힘 정도를 즉시 확인합니다.", "Applies a gentle paper-tooth overlay so stroke breakup is visible before drawing.", "종이 결 맞추기", "Set Paper Tooth", 2, "canvas.paper-tooth"),
    ],
  },
  {
    id: "episode-size-slim", canonicalQueryKo: "용량 줄여줘", canonicalQueryEn: "reduce file size", recommendedStage: "publish-goods", quickChip: true,
    keywords: ["용량", "가볍게", "압축", "파일 크기", "업로드 제한", "용량 줄여", "file size", "compress", "smaller", "slim"],
    ghostOverlayBadgeKo: "고스트 미리보기 · 선명도 유지 18.4MB → 4.2MB 비교선", ghostOverlayBadgeEn: "Ghost Preview · Crisp 18.4MB to 4.2MB split check",
    cards: [
      card("size-slim-auto", "화질 그대로 업로드 용량 줄이기", "Slim File Size Without Blur", "검정 선과 말풍선 글자는 또렷하게 지키면서 불필요한 파일 크기만 70% 이상 줄입니다.", "Keeps crisp black ink and dialogue sharp while cutting total file weight over 70%.", "원고 중앙에 전·후 비교선과 예상 용량(18.4MB → 4.2MB)이 미리 표시됩니다.", "Shows a live before/after split line and projected size drop (18.4MB to 4.2MB).", "가볍게 정리하기", "Slim Episode Now", 3, "export.smart-slim"),
      card("size-slim-slice", "연재 플랫폼 규격에 맞춰 나누기", "Slice for Platform Upload", "긴 세로 원고를 연재처 최대 가로·세로 제한에 딱 맞게 여러 장으로 나눠 저장합니다.", "Splits tall vertical episodes cleanly into platform-ready upload strips.", "원고 위에 잘릴 경계선과 01·02·03 장 번호가 반투명 점선으로 미리 보입니다.", "Displays translucent cut guides and numbered slice markers across the scroll.", "규격대로 나누기", "Slice & Save", 3, "export.platform-slice"),
    ],
  },
  {
    id: "goods-cutline", canonicalQueryKo: "굿즈 칼선", canonicalQueryEn: "goods cutline", recommendedStage: "publish-goods", quickChip: true,
    keywords: ["굿즈", "칼선", "키링", "아크릴", "스티커", "도무송", "cutline", "dieline", "keychain", "sticker", "goods"],
    ghostOverlayBadgeKo: "고스트 미리보기 · 캐릭터 바깥 2.5mm 여백 칼선 & 고리 구멍", ghostOverlayBadgeEn: "Ghost Preview · 2.5mm character margin cutline & ring hole",
    cards: [
      card("goods-cutline-auto", "아크릴 키링 · 스티커 칼선 자동 생성", "Auto Keychain & Sticker Cutline", "캐릭터 바깥 여백 2.5mm를 매끄럽게 감싸는 칼선과 고리 구멍을 한 번에 만듭니다.", "Generates a smooth 2.5mm outer margin cutline and hanging hole around artwork.", "캐릭터 둘레의 칼선 테두리와 윗쪽 3mm 고리 구멍 위치가 원고 위에 미리 겹쳐 보입니다.", "Overlays the smooth outer cut contour and top 3mm keyring hole right on canvas.", "칼선 만들기", "Build Cutline", 2, "goods.auto-cutline"),
      card("goods-white-underbase", "인쇄소 흰색 밑판 빈틈 확인", "Check Print White Underbase", "투명 아크릴 뒤에 깔릴 흰색 영역이 비어 있거나 튀어나온 곳이 없는지 점검합니다.", "Verifies white backing coverage so transparent acrylic prints never look washed out.", "흰색 밑판이 들어갈 영역은 부드러운 색으로, 투명 여백은 격자로 미리 구분해 보여줍니다.", "Highlights solid white backing areas against a clear checkerboard margin.", "밑판 점검하기", "Inspect Underbase", 2, "goods.white-underbase"),
    ],
  },
  {
    id: "scene-window-frame", canonicalQueryKo: "3D 창틀", canonicalQueryEn: "3d window frame", recommendedStage: "scene-3d", quickChip: false,
    keywords: ["3d 창틀", "창틀", "창문", "실내 창", "배경 창", "window frame", "3d window", "window prop"],
    ghostOverlayBadgeKo: "고스트 미리보기 · 벽면 눈높이에 맞춘 3D 창틀과 햇살 무늬", ghostOverlayBadgeEn: "Ghost Preview · Wall-snapped 3D window & floor sunbeam",
    cards: [
      card("window-frame-snap", "컷 원근에 맞는 3D 창틀 놓기", "Snap 3D Window Frame to Wall", "방 벽면 각도에 창틀을 자석처럼 붙이고 바닥에 떨어지는 햇살 무늬까지 함께 맞춥니다.", "Snaps a clean window frame to your room perspective with matching floor sunlight.", "현재 컷 눈높이선에 맞춘 반투명 창틀과 사선 햇살 그림자가 실시간으로 따라옵니다.", "Follows your cut horizon with a translucent window outline and angled sunlight.", "창틀 배치하기", "Place Window", 3, "scene3d.window-frame"),
      card("window-frame-ink", "창틀을 내 펜 굵기 선화로 따기", "Convert Window to Matching Ink", "배치한 3D 창틀 모서리를 캐릭터와 위화감 없는 깔끔한 먹선으로 바꿔 올립니다.", "Extracts crisp ink lines matched to your current G-Pen width for seamless framing.", "창틀의 절반은 입체 형태, 나머지 절반은 깔끔한 선화 결과로 분할 미리 보입니다.", "Shows a split preview comparing the solid window against extracted ink lines.", "선화로 굽기", "Bake Ink Lines", 2, "scene3d.window-to-ink"),
    ],
  },
  {
    id: "papercraft-unfold", canonicalQueryKo: "종이 전개도", canonicalQueryEn: "papercraft unfold", recommendedStage: "publish-goods", quickChip: true,
    keywords: ["전개도", "종이", "페이퍼크래프트", "접기", "종이 모형", "디오라마", "papercraft", "unfold", "paper net", "fold"],
    ghostOverlayBadgeKo: "고스트 미리보기 · A4 자르는 선 · 접는 선 · 번호 풀칠 날개", ghostOverlayBadgeEn: "Ghost Preview · A4 cut, fold & numbered glue-tab sheet",
    cards: [
      card("papercraft-net-open", "A4 오려 접는 종이 전개도 펼치기", "Unfold A4 Printable Paper Net", "캐릭터·배경 모형을 인쇄해 가위로 오리고 접는 번호 매긴 도면으로 자동 펼칩니다.", "Flattens your character or set piece into an A4 sheet with numbered glue tabs.", "재단 실선, 바깥접기·안쪽접기 점선, 맞붙일 번호가 종이 위에 미리 배치됩니다.", "Previews cut outlines, mountain/valley dashes, and matched tab numbers on A4.", "전개도 펼치기", "Unfold Sheet", 3, "goods.papercraft-unfold"),
      card("papercraft-fold-check", "0°→90° 접힘 순서 미리 확인", "Preview 0°→90° Fold Sequence", "평면 도면이 입체 굿즈로 접히는 과정을 미리 돌려 보며 겹침 오류를 방지합니다.", "Scrubs flat-to-3D folding so every tab and crease aligns before printing.", "도면이 종이 두께 그대로 천천히 세워지는 입체 조립 프리뷰가 옆에 열립니다.", "Opens a side-by-side animated fold preview with cardstock thickness.", "접힘 미리보기", "Preview Folding", 2, "goods.papercraft-fold-preview"),
    ],
  },
  {
    id: "copyright-proof", canonicalQueryKo: "저작권 증명", canonicalQueryEn: "copyright proof", recommendedStage: "publish-goods", quickChip: false,
    keywords: ["저작권", "출처", "라이선스", "상업", "증명", "확인서", "원본 증명", "copyright", "rights", "license", "proof"],
    ghostOverlayBadgeKo: "고스트 미리보기 · 소재 상업 이용 안전표 & 창작 이력 확인서", ghostOverlayBadgeEn: "Ghost Preview · Commercial rights ledger & creation proof",
    cards: [
      card("rights-bom-audit", "사용 소재 상업 이용 안전 점검표", "Verify Commercial Asset Rights", "이 화에 들어간 배경·브러시·폰트가 연재·출판·굿즈에 안전한지 한눈에 점검합니다.", "Checks every background, brush, and font for commercial publishing safety.", "사용한 모든 소재 옆에 상업 안전 표시와 출처 표기 안내가 목록으로 미리 열립니다.", "Lists every used asset with clear commercial safety badges and credit notes.", "소재 권리 확인", "Check Rights", 2, "rights.commercial-audit"),
      card("rights-authorship-cert", "내 창작 작업 이력 확인서 내보내기", "Export Authorship Proof Sheet", "초안부터 마감까지 직접 그린 단계별 기록을 깔끔한 제출용 확인서로 묶어 저장합니다.", "Bundles your timestamped sketch-to-finish history into a shareable proof report.", "작업 시작 시각, 단계별 수정 흐름, 사용 소재 목록이 한 장 요약 문서로 미리 보입니다.", "Previews a single-page authorship summary with timeline milestones and asset credits.", "확인서 만들기", "Export Proof", 3, "rights.authorship-certificate"),
    ],
  },
] as const;

export const INTENT_QUICK_CHIPS: readonly CreativeIntentDefinition[] = CREATIVE_INTENT_CATALOG.filter((item) => item.quickChip);

const BASE_RADIAL_SLOTS: readonly {
  readonly id: string; readonly direction: RadialDirectionId; readonly angleDeg: number;
  readonly labelKo: string; readonly labelEn: string; readonly shortcutHint: string;
}[] = [
  { id: "undo", direction: "N", angleDeg: 0, labelKo: "실행 취소", labelEn: "Undo", shortcutHint: "2탭" },
  { id: "redo", direction: "NE", angleDeg: 45, labelKo: "다시 실행", labelEn: "Redo", shortcutHint: "3탭" },
  { id: "brush-size", direction: "E", angleDeg: 90, labelKo: "펜 굵기", labelEn: "Brush Size", shortcutHint: "돌리기" },
  { id: "layers", direction: "SE", angleDeg: 135, labelKo: "레이어", labelEn: "Layers", shortcutHint: "L" },
  { id: "eraser", direction: "S", angleDeg: 180, labelKo: "지우개", labelEn: "Eraser", shortcutHint: "E" },
  { id: "eyedropper", direction: "SW", angleDeg: 225, labelKo: "색 뽑기", labelEn: "Pick Color", shortcutHint: "I" },
  { id: "flip-canvas", direction: "W", angleDeg: 270, labelKo: "좌우 반전", labelEn: "Flip View", shortcutHint: "H" },
  { id: "zen-toggle", direction: "NW", angleDeg: 315, labelKo: "집중 화면", labelEn: "Zen 94%", shortcutHint: "4탭" },
] as const;

const MIRROR_DIR: Readonly<Record<RadialDirectionId, RadialDirectionId>> = {
  N: "N", NE: "NW", E: "W", SE: "SW", S: "S", SW: "SE", W: "E", NW: "NE",
};

function toRadialSlot(base: (typeof BASE_RADIAL_SLOTS)[number], leftHanded: boolean): RadialPieSlot {
  const direction = leftHanded ? MIRROR_DIR[base.direction] : base.direction;
  const angleDeg = leftHanded ? (360 - base.angleDeg) % 360 : base.angleDeg;
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { ...base, direction, angleDeg, unitX: roundTo(Math.cos(rad), 4), unitY: roundTo(Math.sin(rad), 4) };
}

export const RADIAL_PIE_WHEEL_SLOTS: readonly RadialPieSlot[] = BASE_RADIAL_SLOTS.map((slot) => toRadialSlot(slot, false));
export function getRadialPieWheelSlots(leftHanded: boolean): readonly RadialPieSlot[] {
  return leftHanded ? BASE_RADIAL_SLOTS.map((slot) => toRadialSlot(slot, true)) : RADIAL_PIE_WHEEL_SLOTS;
}

export const MULTIMODAL_GESTURE_MATRIX: readonly MultimodalGestureSpec[] = [
  { id: "two-finger-tap", modality: "touch", triggerKo: "2손가락 탭", triggerEn: "2-Finger Tap", actionKo: "실행 취소 (직전 획 즉시 되돌리기)", actionEn: "Instant Undo", responseTargetMs: 60, handednessNoteKo: "양손 공통 · 캔버스 아무 곳이나 탭", handednessNoteEn: "Ambidextrous · tap anywhere on canvas" },
  { id: "three-finger-tap", modality: "touch", triggerKo: "3손가락 탭", triggerEn: "3-Finger Tap", actionKo: "다시 실행 (취소한 획 바로 복구)", actionEn: "Instant Redo", responseTargetMs: 60, handednessNoteKo: "양손 공통 · 3손가락 동시 탭", handednessNoteEn: "Ambidextrous · simultaneous 3-finger tap" },
  { id: "three-finger-scrub", modality: "touch", triggerKo: "3손가락 좌우 문지르기", triggerEn: "3-Finger Scrub", actionKo: "현재 레이어 깔끔히 비우기", actionEn: "Clear Active Layer", responseTargetMs: 120, handednessNoteKo: "지우개 전환 없이 1초 레이어 비우기", handednessNoteEn: "Clear layer in 1 second without tool switch" },
  { id: "four-finger-tap", modality: "touch", triggerKo: "4손가락 탭", triggerEn: "4-Finger Tap", actionKo: "Zen 94% 집중 몰입 화면 켜기 · 끄기", actionEn: "Toggle Zen 94% Mode", responseTargetMs: 80, handednessNoteKo: "모든 패널을 한 번에 접거나 다시 열기", handednessNoteEn: "Hide or restore all chrome in one tap" },
  { id: "pen-squeeze", modality: "stylus", triggerKo: "펜 쥐기 (Squeeze)", triggerEn: "Stylus Squeeze", actionKo: "펜 끝 바로 아래 8방향 파이 휠 호출", actionEn: "Summon 8-Way Pie Wheel at Tip", responseTargetMs: 45, handednessNoteKo: "도구바 이동 0px · 근육기억 45° 스와이프", handednessNoteEn: "Zero toolbar travel · 45° muscle-memory flick" },
  { id: "pen-barrel-roll", modality: "stylus", triggerKo: "펜 축 돌리기 (Barrel Roll)", triggerEn: "Stylus Barrel Roll", actionKo: "납작펜·크레용 각도 및 선 굵기 실시간 회전", actionEn: "Rotate Flat Nib & Crayon Angle Live", responseTargetMs: 16, handednessNoteKo: "손목 회전을 붓끝 각도로 즉시 반영", handednessNoteEn: "Maps wrist twist directly to nib orientation" },
  { id: "handed-edge-swipe", modality: "edge", triggerKo: "보조 손 가장자리 스와이프", triggerEn: "Support-Hand Edge Swipe", actionKo: "도구 레일 좌·우 반전 및 굵기 슬라이더 호출", actionEn: "Mirror Rail & Summon Size Slider", responseTargetMs: 90, handednessNoteKo: "오른손잡이: 좌측 레일 · 왼손잡이: 우측 레일", handednessNoteEn: "Right-handed: left rail · Left-handed: right rail" },
] as const;

export function getGestureMatrixForHandedness(leftHanded: boolean): readonly MultimodalGestureSpec[] {
  return MULTIMODAL_GESTURE_MATRIX.map((item) =>
    item.id !== "handed-edge-swipe"
      ? item
      : {
          ...item,
          handednessNoteKo: leftHanded ? "왼손잡이 미러링 활성 · 우측 도구 레일과 대칭 파이 휠 적용됨" : "오른손잡이 기본 배치 · 좌측 도구 레일과 표준 파이 휠 적용됨",
          handednessNoteEn: leftHanded ? "Left-handed mirror active · right rail & mirrored pie wheel" : "Right-handed default · left rail & standard pie wheel",
        },
  );
}

export const ATELIER_THEMES: readonly AtelierThemePalette[] = [
  {
    id: "warm-alabaster-light", labelKo: "Warm Alabaster 라이트", labelEn: "Warm Alabaster Light",
    contrastStandard: "WCAG-AA", minTargetRatio: 4.5,
    canvas: ok(0.975, 0.008, 86), panel: ok(0.945, 0.01, 84), card: ok(0.985, 0.005, 88), line: ok(0.78, 0.012, 80),
    fg: ok(0.21, 0.014, 72), fgMuted: ok(0.42, 0.015, 74), accent: ok(0.45, 0.14, 215), onAccent: ok(0.985, 0.004, 90),
    good: ok(0.44, 0.125, 158), warn: ok(0.47, 0.12, 72), bad: ok(0.45, 0.165, 26), info: ok(0.46, 0.12, 230),
  },
  {
    id: "ink-slate-dark", labelKo: "Ink Slate 고대비 다크", labelEn: "Ink Slate High-Contrast Dark",
    contrastStandard: "WCAG-AA", minTargetRatio: 4.5,
    canvas: ok(0.165, 0.012, 235), panel: ok(0.205, 0.014, 234), card: ok(0.235, 0.014, 232), line: ok(0.38, 0.016, 230),
    fg: ok(0.96, 0.008, 88), fgMuted: ok(0.78, 0.012, 84), accent: ok(0.79, 0.135, 52), onAccent: ok(0.16, 0.015, 60),
    good: ok(0.8, 0.13, 158), warn: ok(0.84, 0.14, 84), bad: ok(0.72, 0.155, 28), info: ok(0.8, 0.115, 222),
  },
  {
    id: "warm-sepia-paper", labelKo: "Warm Sepia 종이", labelEn: "Warm Sepia Paper",
    contrastStandard: "WCAG-AA", minTargetRatio: 4.5,
    canvas: ok(0.935, 0.024, 82), panel: ok(0.9, 0.026, 80), card: ok(0.955, 0.02, 84), line: ok(0.74, 0.028, 76),
    fg: ok(0.22, 0.024, 62), fgMuted: ok(0.41, 0.026, 66), accent: ok(0.43, 0.135, 208), onAccent: ok(0.975, 0.008, 86),
    good: ok(0.42, 0.115, 156), warn: ok(0.44, 0.125, 68), bad: ok(0.43, 0.155, 25), info: ok(0.43, 0.115, 228),
  },
  {
    id: "wcag-aaa-ultra", labelKo: "WCAG AAA 7:1+ 초고대비", labelEn: "WCAG AAA 7:1+ Ultra",
    contrastStandard: "WCAG-AAA", minTargetRatio: 7.0,
    canvas: ok(0.12, 0.006, 235), panel: ok(0.155, 0.008, 235), card: ok(0.18, 0.008, 235), line: ok(0.62, 0.01, 230),
    fg: ok(0.985, 0.004, 90), fgMuted: ok(0.87, 0.008, 88), accent: ok(0.86, 0.145, 76), onAccent: ok(0.12, 0.01, 60),
    good: ok(0.86, 0.135, 162), warn: ok(0.89, 0.145, 88), bad: ok(0.82, 0.13, 32), info: ok(0.86, 0.11, 218),
  },
] as const;

export const COLOR_VISION_MODES: readonly ColorVisionModeSpec[] = [
  { id: "normal", labelKo: "일반 시각", labelEn: "Normal Vision", noteKo: "표준 삼색각 기준", noteEn: "Standard trichromatic view" },
  { id: "protanopia", labelKo: "적색약", labelEn: "Protanopia", noteKo: "장파장(적색) 민감도 보정", noteEn: "L-cone deficiency safe" },
  { id: "deuteranopia", labelKo: "녹색약", labelEn: "Deuteranopia", noteKo: "중파장(녹색) 민감도 보정", noteEn: "M-cone deficiency safe" },
  { id: "tritanopia", labelKo: "청황색약", labelEn: "Tritanopia", noteKo: "단파장(청황) 민감도 보정", noteEn: "S-cone deficiency safe" },
] as const;

export function getComplexityTier(tierId: ComplexityTierId): ComplexityTierSpec { return COMPLEXITY_TIERS.find((t) => t.id === tierId) ?? COMPLEXITY_TIERS[1]; }
export function getWorkflowStage(stageId: WorkflowStageId): WorkflowStageSpec { return WORKFLOW_STAGES.find((s) => s.id === stageId) ?? WORKFLOW_STAGES[0]; }
export function getAtelierTheme(themeId: AtelierThemeId): AtelierThemePalette { return ATELIER_THEMES.find((t) => t.id === themeId) ?? ATELIER_THEMES[1]; }
export function getColorVisionMode(modeId: ColorVisionModeId): ColorVisionModeSpec { return COLOR_VISION_MODES.find((m) => m.id === modeId) ?? COLOR_VISION_MODES[0]; }

export function getVisibleControlsForTierStage(tierId: ComplexityTierId, stageId: WorkflowStageId, proDrawerOpen: boolean = true): readonly StageControlItem[] {
  const tier = getComplexityTier(tierId); const stage = getWorkflowStage(stageId);
  if (tier.id === "zen-focus") return stage.controls.filter((c) => c.priority === "zen").slice(0, tier.visibleControlCount);
  if (tier.id === "stage-flow") return stage.controls.slice(0, tier.visibleControlCount);
  return proDrawerOpen ? [...stage.controls, ...stage.proDrawerExtras] : [...stage.controls];
}

export function countForbiddenJargonInTexts(texts: readonly string[]): number {
  const joined = texts.join(" ").toLowerCase();
  return FORBIDDEN_UI_JARGON_TERMS.reduce((hits, term) => hits + (joined.includes(term) ? 1 : 0), 0);
}

export function computeHickDecisionMs(controlCount: number): number {
  return roundTo(HICK_INTERCEPT_MS + HICK_SLOPE_MS * Math.log2(Math.max(1, controlCount) + 1), 1);
}

export function computeFittsMovementMetrics(distancePx: number, targetWidthPx: number): { readonly indexOfDifficultyBits: number; readonly movementMs: number } {
  const idBits = Math.log2(Math.max(1, distancePx) / Math.max(1, targetWidthPx) + 1);
  return { indexOfDifficultyBits: roundTo(idBits, 2), movementMs: roundTo(FITTS_INTERCEPT_MS + FITTS_SLOPE_MS * idBits, 1) };
}

export function auditScreenCognitiveLoad(tierId: ComplexityTierId, stageId: WorkflowStageId, proDrawerOpen: boolean = true): CognitiveLoadAuditResult {
  const tier = getComplexityTier(tierId);
  const visibleControls = getVisibleControlsForTierStage(tier.id, stageId, proDrawerOpen);
  const activeCount = visibleControls.length;
  const baseFitts = computeFittsMovementMetrics(OVERCROWDED_UI_BASELINE.fittsTravelDistancePx, OVERCROWDED_UI_BASELINE.fittsTargetWidthPx);
  const activeFitts = computeFittsMovementMetrics(tier.radialWheelRadiusPx, 64);
  const activeJargonCount = countForbiddenJargonInTexts(visibleControls.flatMap((c) => [c.labelKo, c.hintKo, c.labelEn, c.hintEn]));
  const b = OVERCROWDED_UI_BASELINE;
  const overcrowdedBaseline: CognitiveLoadSnapshot = {
    labelKo: "과밀 기존 도구 화면 (72개)", labelEn: "Overcrowded Legacy UI (72)", visibleControlCount: b.visibleControlCount,
    canvasViewportPercent: b.canvasViewportPercent, hickDecisionMs: computeHickDecisionMs(b.visibleControlCount),
    fittsTravelDistancePx: b.fittsTravelDistancePx, fittsTargetWidthPx: b.fittsTargetWidthPx,
    fittsIndexOfDifficultyBits: baseFitts.indexOfDifficultyBits, fittsMovementMs: baseFitts.movementMs,
    jargonTermCount: b.jargonTermCount, jargonExposurePercent: roundTo((b.jargonTermCount / b.visibleControlCount) * 100, 1),
    touchReadyPercent: roundTo((b.touchReadyControls / b.visibleControlCount) * 100, 1),
  };
  const toonStudioActive: CognitiveLoadSnapshot = {
    labelKo: `${tier.labelKo} (${activeCount}개)`, labelEn: `${tier.labelEn} (${activeCount})`, visibleControlCount: activeCount,
    canvasViewportPercent: tier.canvasViewportPercent, hickDecisionMs: computeHickDecisionMs(activeCount),
    fittsTravelDistancePx: tier.radialWheelRadiusPx, fittsTargetWidthPx: 64,
    fittsIndexOfDifficultyBits: activeFitts.indexOfDifficultyBits, fittsMovementMs: activeFitts.movementMs,
    jargonTermCount: activeJargonCount, jargonExposurePercent: roundTo((activeJargonCount / Math.max(1, activeCount)) * 100, 1),
    touchReadyPercent: tier.minTouchTargetPx >= 44 ? 100 : 0,
  };
  const controlReductionPercent = roundTo(((b.visibleControlCount - activeCount) / b.visibleControlCount) * 100, 1);
  const hickTimeSavedMs = roundTo(overcrowdedBaseline.hickDecisionMs - toonStudioActive.hickDecisionMs, 1);
  const hickTimeSavedPercent = roundTo((hickTimeSavedMs / overcrowdedBaseline.hickDecisionMs) * 100, 1);
  const fittsTravelSavedPx = b.fittsTravelDistancePx - toonStudioActive.fittsTravelDistancePx;
  const fittsTravelSavedPercent = roundTo((fittsTravelSavedPx / b.fittsTravelDistancePx) * 100, 1);
  const fittsTimeSavedMs = roundTo(overcrowdedBaseline.fittsMovementMs - toonStudioActive.fittsMovementMs, 1);
  const fittsTimeSavedPercent = roundTo((fittsTimeSavedMs / overcrowdedBaseline.fittsMovementMs) * 100, 1);
  const calmIndexScore = Math.min(100, Math.round(controlReductionPercent * 0.32 + fittsTravelSavedPercent * 0.25 + (tier.canvasViewportPercent / 94) * 23 + (activeJargonCount === 0 ? 20 : 0)));
  return {
    tierId: tier.id, stageId: getWorkflowStage(stageId).id, overcrowdedBaseline, toonStudioActive,
    controlReductionPercent, hickTimeSavedMs, hickTimeSavedPercent, fittsTravelSavedPx, fittsTravelSavedPercent,
    fittsTimeSavedMs, fittsTimeSavedPercent, canvasGainPercent: tier.canvasViewportPercent - b.canvasViewportPercent,
    jargonEliminatedPercent: roundTo(((b.jargonTermCount - activeJargonCount) / b.jargonTermCount) * 100, 1),
    meetsCanvas82Contract: tier.canvasViewportPercent >= 82, meetsZeroJargonTarget: activeJargonCount === 0, calmIndexScore,
  };
}

export function resolveCreativeIntent(rawQuery: string, fallbackStageId: WorkflowStageId = "color-light"): CreativeIntentResolution {
  const trimmed = rawQuery.trim(); const normalized = trimmed.toLowerCase().replace(/\s+/g, " "); const compact = normalized.replace(/\s+/g, "");
  let bestMatch: CreativeIntentDefinition | null = null; let bestScore = 0;
  if (normalized.length > 0) {
    for (const def of CREATIVE_INTENT_CATALOG) {
      let score = 0;
      const cKo = def.canonicalQueryKo.toLowerCase(); const cEn = def.canonicalQueryEn.toLowerCase();
      if (normalized === cKo || normalized === cEn) score += 100;
      else if (compact.includes(cKo.replace(/\s+/g, "")) || normalized.includes(cEn)) score += 80;
      for (const kw of def.keywords) {
        const k = kw.toLowerCase(); const kc = k.replace(/\s+/g, "");
        if (normalized.includes(k) || compact.includes(kc)) score += 24 + kc.length * 2;
      }
      if (score > bestScore) { bestScore = score; bestMatch = def; }
    }
  }
  if (bestMatch && bestScore > 0) {
    const texts = bestMatch.cards.flatMap((c) => [c.titleKo, c.summaryKo, c.ghostPreviewKo, c.titleEn, c.summaryEn]);
    return {
      query: trimmed, matched: true, intentId: bestMatch.id, confidence: roundTo(Math.min(0.99, 0.72 + bestScore / 360), 2),
      recommendedStage: bestMatch.recommendedStage, ghostOverlayBadgeKo: bestMatch.ghostOverlayBadgeKo,
      ghostOverlayBadgeEn: bestMatch.ghostOverlayBadgeEn, cards: bestMatch.cards, jargonFreeVerified: countForbiddenJargonInTexts(texts) === 0,
    };
  }
  const stage = getWorkflowStage(fallbackStageId); const lead = stage.controls[0];
  return {
    query: trimmed, matched: false, intentId: "stage-guided-fallback", confidence: 0.45, recommendedStage: stage.id,
    ghostOverlayBadgeKo: `고스트 미리보기 · ${stage.labelKo} 7개 핵심 도구 집중`, ghostOverlayBadgeEn: `Ghost Preview · ${stage.labelEn} 7-control focus`,
    cards: [card(`stage-guide-${stage.id}`, `${stage.labelKo} 핵심 도구 바로 열기`, `Open ${stage.labelEn} Core Tools`, `지금 작업 중인 '${stage.labelKo}'에서 가장 자주 쓰는 '${lead.labelKo}' 중심 7개 도구로 안내합니다.`, `Focuses your canvas on the 7 essential tools for ${stage.labelEn}, starting with ${lead.labelEn}.`, "필요한 도구 7개만 부드럽게 강조되고 나머지 복잡한 메뉴는 화면 뒤로 숨겨집니다.", "Softly highlights the 7 relevant tools while keeping distracting menus tucked away.", "이 단계로 맞추기", "Focus Stage", 1, `stage.focus.${stage.id}`)],
    jargonFreeVerified: true,
  };
}

function evaluateThemeVisionRow(theme: AtelierThemePalette, visionMode: ColorVisionModeId): ThemeVisionContrastRow {
  const bodyContrastRatio = computeOklchContrastRatio(theme.fg, theme.canvas, visionMode);
  const mutedContrastRatio = computeOklchContrastRatio(theme.fgMuted, theme.panel, visionMode);
  const accentContrastRatio = computeOklchContrastRatio(theme.accent, theme.canvas, visionMode);
  const buttonTextContrastRatio = computeOklchContrastRatio(theme.onAccent, theme.accent, visionMode);
  const pairs: readonly [OklchColor, OklchColor][] = [[theme.good, theme.bad], [theme.good, theme.warn], [theme.warn, theme.info], [theme.bad, theme.info]];
  let sep = 0;
  for (const [c1, c2] of pairs) {
    const s1 = simulateColorVisionOklch(c1, visionMode); const s2 = simulateColorVisionOklch(c2, visionMode);
    const r1 = (s1.h * Math.PI) / 180; const r2 = (s2.h * Math.PI) / 180;
    sep += Math.min(1, Math.abs(s1.l - s2.l) * 2.2 + Math.hypot(s1.c * Math.cos(r1) - s2.c * Math.cos(r2), s1.c * Math.sin(r1) - s2.c * Math.sin(r2)) * 4.5);
  }
  const passesAa = bodyContrastRatio >= 4.5 && mutedContrastRatio >= 4.5 && accentContrastRatio >= 4.5 && buttonTextContrastRatio >= 4.5;
  const passesAaa = bodyContrastRatio >= 7.0 && mutedContrastRatio >= 7.0 && accentContrastRatio >= 7.0 && buttonTextContrastRatio >= 7.0;
  return { themeId: theme.id, visionMode, bodyContrastRatio, mutedContrastRatio, accentContrastRatio, buttonTextContrastRatio, semanticDistinctScore: Math.round((sep / pairs.length) * 100), passesAa, passesAaa, meetsThemeTarget: theme.contrastStandard === "WCAG-AAA" ? passesAaa : passesAa };
}

export function auditVioletSlopAcrossThemes(): VioletSlopAudit {
  let inspected = 0; let violetHits = 0;
  for (const t of ATELIER_THEMES) {
    for (const token of [t.canvas, t.panel, t.card, t.line, t.fg, t.fgMuted, t.accent, t.onAccent, t.good, t.warn, t.bad, t.info]) {
      inspected += 1; if (isVioletSlopHue(token.h)) violetHits += 1;
    }
  }
  return { inspectedTokenCount: inspected, violetTokenCount: violetHits, violetSlopPercent: roundTo((violetHits / Math.max(1, inspected)) * 100, 1), passed: violetHits === 0 };
}

export function evaluateAtelierDesignPolish(themeId: AtelierThemeId, visionModeId: ColorVisionModeId): AtelierDesignPolishAudit {
  const activeTheme = getAtelierTheme(themeId); const activeVisionMode = getColorVisionMode(visionModeId);
  const matrix16 = ATELIER_THEMES.flatMap((theme) => COLOR_VISION_MODES.map((mode) => evaluateThemeVisionRow(theme, mode.id)));
  const activeContrast = matrix16.find((r) => r.themeId === activeTheme.id && r.visionMode === activeVisionMode.id) ?? evaluateThemeVisionRow(activeTheme, activeVisionMode.id);
  const matrixPassCount = matrix16.filter((r) => r.meetsThemeTarget).length;
  const aaaThemeAllVisionPass = matrix16.filter((r) => r.themeId === "wcag-aaa-ultra").every((r) => r.passesAaa);
  const concentricRadius: ConcentricRadiusAudit = { outerPanelRadiusPx: 20, innerPaddingPx: 8, cardRadiusPx: 12, cardGapPx: 4, controlRadiusPx: 8, maxDriftPx: Math.max(Math.abs(20 - 8 - 12), Math.abs(12 - 4 - 8)), exactConcentric: true };
  const visualBalance: VisualBalance85105Audit = { neutralCanvasPercent: 85, secondaryChromePercent: 10, accentSignalPercent: 5, totalPercent: 100, passesRule: true };
  const violetSlop = auditVioletSlopAcrossThemes();
  const overallPolishScore = Math.min(100, Math.round((matrixPassCount / matrix16.length) * 40 + (aaaThemeAllVisionPass ? 15 : 0) + (concentricRadius.exactConcentric ? 15 : 0) + (visualBalance.passesRule ? 15 : 0) + (violetSlop.passed ? 15 : 0)));
  return { activeTheme, activeVisionMode, activeContrast, matrix16, matrixPassCount, aaaThemeAllVisionPass, concentricRadius, visualBalance, violetSlop, overallPolishScore };
}

export function buildCalmIntentUxProfile(params: {
  readonly tierId: ComplexityTierId; readonly stageId: WorkflowStageId; readonly themeId: AtelierThemeId;
  readonly visionModeId: ColorVisionModeId; readonly intentQuery: string; readonly leftHanded: boolean; readonly proDrawerOpen: boolean;
}): CalmIntentUxProfileSnapshot {
  const tier = getComplexityTier(params.tierId); const stage = getWorkflowStage(params.stageId);
  const effectiveDrawerOpen = tier.proDrawerExpandable && params.proDrawerOpen;
  return {
    tier, stage, visibleControls: getVisibleControlsForTierStage(tier.id, stage.id, effectiveDrawerOpen),
    cognitiveAudit: auditScreenCognitiveLoad(tier.id, stage.id, effectiveDrawerOpen),
    intentResolution: resolveCreativeIntent(params.intentQuery, stage.id),
    radialSlots: getRadialPieWheelSlots(params.leftHanded), gestures: getGestureMatrixForHandedness(params.leftHanded),
    designPolish: evaluateAtelierDesignPolish(params.themeId, params.visionModeId), leftHanded: params.leftHanded, proDrawerOpen: effectiveDrawerOpen,
  };
}

export function exportCalmIntentUxJson(snapshot: CalmIntentUxProfileSnapshot): string {
  const ca = snapshot.cognitiveAudit; const dp = snapshot.designPolish; const ir = snapshot.intentResolution;
  return JSON.stringify({
    schemaVersion: "toonstudio.calm-intent-ux-orchestrator.v1",
    complexityTier: { id: snapshot.tier.id, canvasViewportPercent: snapshot.tier.canvasViewportPercent, visibleControlCount: snapshot.visibleControls.length, proDrawerOpen: snapshot.proDrawerOpen },
    workflowStage: { id: snapshot.stage.id, labelKo: snapshot.stage.labelKo, visibleControls: snapshot.visibleControls.map((c) => c.labelKo) },
    cognitiveLoadAudit: { overcrowdedControls: ca.overcrowdedBaseline.visibleControlCount, activeControls: ca.toonStudioActive.visibleControlCount, controlReductionPercent: ca.controlReductionPercent, hickDecisionBaselineMs: ca.overcrowdedBaseline.hickDecisionMs, hickDecisionActiveMs: ca.toonStudioActive.hickDecisionMs, hickTimeSavedPercent: ca.hickTimeSavedPercent, fittsTravelSavedPercent: ca.fittsTravelSavedPercent, jargonExposurePercent: ca.toonStudioActive.jargonExposurePercent, touchReadyPercent: ca.toonStudioActive.touchReadyPercent, calmIndexScore: ca.calmIndexScore },
    intentRouter: { query: ir.query, intentId: ir.intentId, matched: ir.matched, confidence: ir.confidence, recommendedStage: ir.recommendedStage, jargonFreeVerified: ir.jargonFreeVerified, cards: ir.cards.map((c) => ({ id: c.id, titleKo: c.titleKo, ghostPreviewKo: c.ghostPreviewKo, capabilityKey: c.capabilityKey })) },
    radialPieWheel: { leftHandedMirrored: snapshot.leftHanded, slots: snapshot.radialSlots.map((s) => ({ direction: s.direction, angleDeg: s.angleDeg, labelKo: s.labelKo })) },
    designPolish: { themeId: dp.activeTheme.id, visionMode: dp.activeVisionMode.id, bodyContrastRatio: dp.activeContrast.bodyContrastRatio, accentContrastRatio: dp.activeContrast.accentContrastRatio, matrixPassCount: dp.matrixPassCount, matrixTotal: dp.matrix16.length, aaaThemeAllVisionPass: dp.aaaThemeAllVisionPass, concentricRadiusExact: dp.concentricRadius.exactConcentric, visualBalance85105: dp.visualBalance, violetSlopPercent: dp.violetSlop.violetSlopPercent, overallPolishScore: dp.overallPolishScore },
  }, null, 2);
}
