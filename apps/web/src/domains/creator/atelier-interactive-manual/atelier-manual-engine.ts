/**
 * Wave 65A — AtelierGuide 서비스 내장 인터랙티브 매뉴얼 · 0→프로 5단계 로드맵 · 숨은 기능 전수 해설 엔진.
 *
 * - 전체 서비스 7단계 비주얼 지하철 노선도(`STUDIO_JOURNEY_SUBWAY_STATIONS`)
 * - 입문자→프로 5단계 학습 커리큘럼(`LEARNING_LEVEL_ROADMAP`)
 * - 매일 쓰는 핵심 6종 + 주간 활용 5종 + 숨은 고수 기능 9종 = 총 20종 전수 가이드(`STUDIO_COMPLETE_FEATURE_GUIDES`)
 * - 일상어 의도 검색기(`searchManualGuides`), 작업 컨텍스트 코치(`recommendNextGuideForContext`),
 *   학습 진도·배지 계산기(`computeMasteryProgress`), JSON 내보내기(`exportInteractiveManualJson`)
 */

export const ATELIER_MANUAL_SCHEMA_VERSION = "toonstudio.atelier-guide.manual-os.v1" as const;
export const ATELIER_MANUAL_BRAND_NAME = "AtelierGuide" as const;
export const ATELIER_MANUAL_UPDATED_AT = "2026-11-26" as const;

export type LearningLevel = 1 | 2 | 3 | 4 | 5;
export type FeatureUsageFrequency = "daily" | "weekly" | "hidden-gem";
export type ManualFeatureCategory = "drawing" | "layout-lettering" | "spatial-3d" | "style-ai" | "qa-accessibility" | "collab-export";
export type StudioJourneyStationId =
  | "station-1-canvas" | "station-2-cut" | "station-3-cast" | "station-4-solid"
  | "station-5-paint" | "station-6-qa" | "station-7-ship";
export type ManualWorkContext =
  | "first-open" | "inking" | "panel-lettering" | "scene-3d" | "coloring-ai" | "qa-check" | "team-export";
export type ManualSearchMatchKind = "catalog" | "shortcut" | "everyday-intent" | "title" | "guide-detail";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }

export interface StudioJourneyStationSpec {
  readonly id: StudioJourneyStationId; readonly order: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly code: string; readonly level: LearningLevel;
  readonly titleKo: string; readonly titleEn: string; readonly subtitleKo: string; readonly subtitleEn: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly accentOklch: OklchColor;
}

export interface LearningLevelSpec {
  readonly level: LearningLevel; readonly code: `Lv.${LearningLevel}`;
  readonly titleKo: string; readonly titleEn: string; readonly taglineKo: string; readonly taglineEn: string;
  readonly estimatedMinutes: number; readonly outcomeKo: string; readonly outcomeEn: string;
  readonly stationIds: readonly StudioJourneyStationId[]; readonly accentOklch: OklchColor;
}

export interface ManualFollowStep {
  readonly stepNo: 1 | 2 | 3 | 4;
  readonly titleKo: string; readonly titleEn: string; readonly actionKo: string; readonly actionEn: string;
}

export interface StudioFeatureGuide {
  readonly id: string; readonly level: LearningLevel; readonly stationId: StudioJourneyStationId;
  readonly frequency: FeatureUsageFrequency; readonly category: ManualFeatureCategory; readonly atelierSuite: string;
  readonly titleKo: string; readonly titleEn: string; readonly plainOneLineKo: string; readonly plainOneLineEn: string;
  readonly whenToUseKo: string; readonly whenToUseEn: string; readonly steps: readonly ManualFollowStep[];
  readonly shortcut: string; readonly commonMistakeKo: string; readonly commonMistakeEn: string;
  readonly proTipKo: string; readonly proTipEn: string; readonly quickTooltipKo: string; readonly quickTooltipEn: string;
  readonly studioHref: string; readonly relatedHiddenIds: readonly string[];
  readonly everydayIntents: readonly string[]; readonly workContexts: readonly ManualWorkContext[];
}

export interface ManualSearchFilters { readonly level?: LearningLevel | "all"; readonly frequency?: FeatureUsageFrequency | "all"; readonly stationId?: StudioJourneyStationId | "all"; readonly category?: ManualFeatureCategory | "all"; }
export interface ManualSearchHit { readonly guide: StudioFeatureGuide; readonly score: number; readonly matchedBy: ManualSearchMatchKind; readonly matchedTerms: readonly string[]; }
export interface ManualWorkContextSpec { readonly id: ManualWorkContext; readonly labelKo: string; readonly labelEn: string; readonly situationKo: string; readonly situationEn: string; readonly primaryGuideIds: readonly string[]; readonly hiddenGemIds: readonly string[]; }
export interface ContextCoachInput { readonly currentContext: ManualWorkContext; readonly completedGuideIds?: readonly string[]; readonly currentLevel?: LearningLevel; readonly preferHiddenGem?: boolean; }
export interface ManualContextRecommendation { readonly context: ManualWorkContext; readonly primaryGuide: StudioFeatureGuide; readonly hiddenGemGuide: StudioFeatureGuide; readonly allContextCleared: boolean; readonly tooltip5sKo: string; readonly tooltip5sEn: string; readonly rationaleKo: string; readonly rationaleEn: string; }
export interface ManualLevelProgress { readonly level: LearningLevel; readonly code: `Lv.${LearningLevel}`; readonly titleKo: string; readonly titleEn: string; readonly completed: number; readonly total: number; readonly percent: number; readonly isCleared: boolean; }
export interface ManualMasteryBadge { readonly id: string; readonly titleKo: string; readonly titleEn: string; readonly summaryKo: string; readonly summaryEn: string; }
export interface ManualMasteryRank { readonly rankId: "novice" | "cut-finisher" | "spatial-builder" | "style-auditor" | "grandmaster"; readonly titleKo: string; readonly titleEn: string; readonly nextMilestoneKo: string; readonly nextMilestoneEn: string; }
export interface InteractiveManualExportOptions { readonly completedGuideIds?: readonly string[]; readonly currentContext?: ManualWorkContext; readonly query?: string; readonly filters?: ManualSearchFilters; }
export interface InteractiveManualExportBundle { readonly payload: InteractiveManualExportPayload; readonly json: string; }

export interface ManualMasteryProgress {
  readonly totalGuides: number; readonly completedCount: number; readonly overallPercent: number;
  readonly hiddenGemTotal: number; readonly hiddenGemCompleted: number; readonly hiddenGemPercent: number;
  readonly byFrequency: {
    readonly daily: { readonly completed: number; readonly total: number };
    readonly weekly: { readonly completed: number; readonly total: number };
    readonly hiddenGem: { readonly completed: number; readonly total: number };
  };
  readonly byLevel: readonly ManualLevelProgress[]; readonly currentRank: ManualMasteryRank;
  readonly unlockedBadges: readonly ManualMasteryBadge[]; readonly validCompletedIds: readonly string[];
}

export interface InteractiveManualExportPayload {
  readonly schemaVersion: typeof ATELIER_MANUAL_SCHEMA_VERSION;
  readonly brandName: typeof ATELIER_MANUAL_BRAND_NAME;
  readonly updatedAt: typeof ATELIER_MANUAL_UPDATED_AT;
  readonly totalLevels: number; readonly totalStations: number; readonly totalGuides: number; readonly hiddenGemCount: number;
  readonly progress: ManualMasteryProgress; readonly contextRecommendation: ManualContextRecommendation;
  readonly filteredGuideIds: readonly string[]; readonly levels: readonly LearningLevelSpec[];
  readonly stations: readonly StudioJourneyStationSpec[]; readonly guides: readonly StudioFeatureGuide[];
}

const VIOLET_MIN_HUE = 265;
const VIOLET_MAX_HUE = 325;
const SAFE_BLUE_FALLBACK_HUE = 224;

export function isVioletSlopHue(hue: number): boolean {
  const normalized = ((hue % 360) + 360) % 360;
  return normalized >= VIOLET_MIN_HUE && normalized <= VIOLET_MAX_HUE;
}

export function sanitizeNonVioletHue(hue: number): number {
  const normalized = Math.round((((hue % 360) + 360) % 360) * 10) / 10;
  return isVioletSlopHue(normalized) ? SAFE_BLUE_FALLBACK_HUE : normalized;
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = Math.min(1, Math.max(0, color.l));
  const c = Math.min(0.4, Math.max(0, color.c));
  const h = sanitizeNonVioletHue(color.h);
  return alpha !== undefined ? `oklch(${l} ${c} ${h} / ${Math.min(1, Math.max(0, alpha)).toFixed(2)})` : `oklch(${l} ${c} ${h})`;
}

const step = (
  stepNo: 1 | 2 | 3 | 4, titleKo: string, titleEn: string, actionKo: string, actionEn: string,
): ManualFollowStep => ({ stepNo, titleKo, titleEn, actionKo, actionEn });

export const STUDIO_JOURNEY_SUBWAY_STATIONS: readonly StudioJourneyStationSpec[] = [
  { id: "station-1-canvas", order: 1, code: "S1", level: 1, titleKo: "캔버스·펜", titleEn: "Canvas & Ink", subtitleKo: "첫 1획·필압·미러", subtitleEn: "Stroke, Pressure, Mirror", summaryKo: "새 원고를 열고 손떨림 보정, 레이어 분리, 16K 필압, 왼손/오른손 미러를 맞춥니다.", summaryEn: "Open a canvas and configure smoothing, layers, 16K pressure, and handedness mirror.", accentOklch: { l: 0.54, c: 0.14, h: 224 } },
  { id: "station-2-cut", order: 2, code: "S2", level: 2, titleKo: "컷·말풍선", titleEn: "Panels & Text", subtitleKo: "분할·음성식자·톤", subtitleEn: "Split, Voice, Tone", summaryKo: "세로 스크롤 컷을 나누고 음성 받아쓰기 말풍선과 스크린톤·효과음을 배치합니다.", summaryEn: "Slice scroll panels, dictate speech bubbles, and layer screentones and SFX.", accentOklch: { l: 0.54, c: 0.13, h: 198 } },
  { id: "station-3-cast", order: 3, code: "S3", level: 3, titleKo: "3D 캐릭터", titleEn: "AtelierCast", subtitleKo: "체형·포즈·카메라", subtitleEn: "Body, Pose, Lens", summaryKo: "AtelierCast로 캐릭터 비율과 손 포즈, 카메라 화각을 1분 안에 잡아 밑그림에 얹습니다.", summaryEn: "Stage character proportions, hand grips, and camera lens presets in AtelierCast.", accentOklch: { l: 0.55, c: 0.13, h: 154 } },
  { id: "station-4-solid", order: 4, code: "S4", level: 3, titleKo: "3D 배경·CAD", titleEn: "Solid & LT", subtitleKo: "솔리드·단면·조명", subtitleEn: "Cutaway, LT, Light", summaryKo: "AtelierSolid로 소품·실내 단면을 자르고 LT 선화 추출과 PrismLight 림라이트를 입힙니다.", summaryEn: "Slice architectural props in AtelierSolid, extract LT ink, and cast PrismLight.", accentOklch: { l: 0.54, c: 0.13, h: 178 } },
  { id: "station-5-paint", order: 5, code: "S5", level: 4, titleKo: "화풍·광학", titleEn: "Ink & AI", subtitleKo: "밑색·백런·필터", subtitleEn: "Flat, Backrun, Optics", summaryKo: "온디바이스 AI 자동 밑색, AtelierInk 수채화 모세관 백런, 광학 필터로 화풍을 완성합니다.", summaryEn: "Finish style with local AI flats, AtelierInk watercolor backrun, and optical filters.", accentOklch: { l: 0.57, c: 0.14, h: 48 } },
  { id: "station-6-qa", order: 6, code: "S6", level: 4, titleKo: "검수·가독성", titleEn: "QA & Reader", subtitleKo: "작붕·색각·390px", subtitleEn: "Continuity, Vision, PiP", summaryKo: "390px 폰뷰 PiP, 작화 연속성 자동 검수, 색각 이상 시뮬레이터로 출고 전 결함을 잡습니다.", summaryEn: "Catch defects before shipping using 390px phone PiP, continuity checks, and vision simulation.", accentOklch: { l: 0.58, c: 0.14, h: 76 } },
  { id: "station-7-ship", order: 7, code: "S7", level: 5, titleKo: "협업·출고", titleEn: "Stage & Ship", subtitleKo: "CRDT·BOM·C2PA·4K", subtitleEn: "Sync, BOM, C2PA, 4K", summaryKo: "AtelierStage 협업, HLC CRDT 복구, Rights BOM 차단, C2PA 머클 증명, 4K WebCodecs로 출고합니다.", summaryEn: "Collaborate in AtelierStage, recover HLC CRDT sync, clear Rights BOM, sign C2PA, and export 4K.", accentOklch: { l: 0.55, c: 0.15, h: 28 } },
] as const;

export const LEARNING_LEVEL_ROADMAP: readonly LearningLevelSpec[] = [
  { level: 1, code: "Lv.1", titleKo: "Lv.1 첫 5분 첫 선 긋기", titleEn: "Lv.1 First 5 Minutes: First Ink Stroke", taglineKo: "캔버스 · 브러시 · 필압 · 되돌리기 · 왼손 미러", taglineEn: "Canvas, Brush, 16K Pressure, Undo & Handedness Mirror", estimatedMinutes: 5, outcomeKo: "선화·밑색 레이어를 분리하고 손목에 맞춘 필압으로 첫 캐릭터 얼굴을 흔들림 없이 그립니다.", outcomeEn: "Separate ink/flat layers and draw a crisp first portrait tuned to your stylus pressure.", stationIds: ["station-1-canvas"], accentOklch: { l: 0.54, c: 0.14, h: 224 } },
  { level: 2, code: "Lv.2", titleKo: "Lv.2 웹툰 1컷 완성", titleEn: "Lv.2 Finish Your First Webtoon Panel", taglineKo: "컷 분할 · 말풍선 · 음성 식자 · 스크린톤 · 390px 폰뷰", taglineEn: "Panel Split, Voice Balloons, Screentone & 390px Phone PiP", estimatedMinutes: 12, outcomeKo: "독자 스마트폰 화면에서 읽기 편한 대사·효과음·망점 톤이 들어간 웹툰 1컷을 완성합니다.", outcomeEn: "Deliver one mobile-readable webtoon cut with voice lettering, screentones, and 390px preview.", stationIds: ["station-2-cut", "station-6-qa"], accentOklch: { l: 0.54, c: 0.13, h: 198 } },
  { level: 3, code: "Lv.3", titleKo: "Lv.3 3D 배경·캐릭터·솔리드 CAD", titleEn: "Lv.3 3D Backgrounds, Cast & Solid CAD", taglineKo: "AtelierCast · AtelierSolid · LT 선화 · PrismLight 조명", taglineEn: "AtelierCast, AtelierSolid Cutaway, LT Ink & PrismLight", estimatedMinutes: 18, outcomeKo: "어려운 투시와 인체 구도를 3D로 1분 만에 잡고 단면 도면과 선화·조명까지 한 번에 뽑습니다.", outcomeEn: "Block complex anatomy and architecture in 3D, slice cutaways, and extract LT ink + lighting.", stationIds: ["station-3-cast", "station-4-solid"], accentOklch: { l: 0.55, c: 0.13, h: 154 } },
  { level: 4, code: "Lv.4", titleKo: "Lv.4 화풍·광학 필터·온디바이스 AI", titleEn: "Lv.4 Style, Optical Filters & On-Device AI", taglineKo: "AtelierInk · AtelierFilter · 자동 밑색 · 작화 붕괴·색각 검수", taglineEn: "AtelierInk, AtelierFilter, Local AI Flats, Continuity & Vision QA", estimatedMinutes: 15, outcomeKo: "로컬 WebGPU AI로 채색 시간을 줄이고 수채화 백런·광학 필터·작화·색각 검수까지 끝냅니다.", outcomeEn: "Speed up coloring on-device while mastering watercolor backruns, continuity QA, and color-vision audits.", stationIds: ["station-5-paint", "station-6-qa"], accentOklch: { l: 0.57, c: 0.14, h: 48 } },
  { level: 5, code: "Lv.5", titleKo: "Lv.5 팀 협업·가상 작업실·출고", titleEn: "Lv.5 Team Collaboration, Virtual Stage & Shipping", taglineKo: "AtelierStage · HLC CRDT · Rights BOM · C2PA 머클 인증 · 4K WebCodecs", taglineEn: "AtelierStage, HLC CRDT, Rights BOM, C2PA Merkle & 4K WebCodecs", estimatedMinutes: 20, outcomeKo: "팀원과 오프라인 충돌 없이 동시 마감하고 저작권·인간 작화 증명까지 통과한 4K 완성본을 출고합니다.", outcomeEn: "Co-author offline-safely with a team and ship Rights-BOM-clean, C2PA-signed 4K deliverables.", stationIds: ["station-7-ship"], accentOklch: { l: 0.55, c: 0.15, h: 28 } },
] as const;

export const STUDIO_COMPLETE_FEATURE_GUIDES: readonly StudioFeatureGuide[] = [
  // ── Lv.1 첫 5분 첫 선 긋기 (4종) ───────────────────────────────────────────
  {
    id: "guide-first-canvas-ink", level: 1, stationId: "station-1-canvas", frequency: "daily", category: "drawing", atelierSuite: "ToonCore",
    titleKo: "첫 캔버스 열기 · 1획 잉크 펜 · 즉시 되돌리기", titleEn: "Open Canvas, 1-Stroke Ink Pen & Instant Undo",
    plainOneLineKo: "새 웹툰 캔버스를 열고 떨림 없는 펜으로 첫 선을 그은 뒤 실수를 바로 되돌립니다.", plainOneLineEn: "Create a scroll canvas, draw a stabilized first stroke, and undo slips instantly.",
    whenToUseKo: "툰스튜디오를 처음 켰거나 새 회차 콘티·선화 작업을 시작할 때 가장 먼저 씁니다.", whenToUseEn: "Use first when opening ToonStudio or starting a fresh episode rough and ink pass.",
    steps: [
      step(1, "새 웹툰 원고 선택", "Pick Webtoon Preset", "상단 [새 작품]에서 세로 스크롤(가로 1600px) 프리셋을 클릭합니다.", "Open New Work and choose the 1600px vertical scroll preset."),
      step(2, "잉크 펜과 손떨림 보정 켜기", "Enable Stabilized Ink", "B 키를 눌러 잉크 펜을 고르고 상단 바에서 손떨림 보정을 35%로 맞춥니다.", "Press B for the ink pen and set stroke stabilization to 35%."),
      step(3, "한 획 긋기 & 되돌리기 연습", "Stroke & Undo", "얼굴 윤곽을 한 번에 긋고 어긋나면 Ctrl+Z(태블릿은 두 손가락 탭)로 즉시 되돌립니다.", "Draw one contour stroke and undo with Ctrl+Z or two-finger tap."),
    ],
    shortcut: "B / Ctrl+Z", studioHref: "/studio/new?preset=webtoon-scroll&tool=ink-pen",
    commonMistakeKo: "손떨림 보정을 90% 이상 높이면 선이 펜 끝을 너무 늦게 따라옵니다. 25~45%가 웹툰 선화에 가장 자연스럽습니다.", commonMistakeEn: "Setting stabilization above 90% causes cursor lag; 25-45% feels most natural for comic ink.",
    proTipKo: "로컬 OPFS가 5초마다 자동 스냅샷을 남기므로 브라우저를 실수로 닫아도 마지막 획까지 복구됩니다.", proTipEn: "Local OPFS snapshots every 5 seconds recover your exact stroke even after an accidental tab close.",
    quickTooltipKo: "B로 잉크 펜을 켜고 보정 35%로 선을 그으세요. 실수는 Ctrl+Z나 두 손가락 탭 한 번이면 됩니다.", quickTooltipEn: "Press B with 35% smoothing for clean lines; tap Ctrl+Z or two fingers to undo.",
    relatedHiddenIds: ["guide-pchip-pressure-16k", "guide-handedness-mirror-0px"], workContexts: ["first-open", "inking"],
    everydayIntents: ["처음", "시작", "선 긋기", "펜", "브러시", "손이 떨려요", "되돌리기", "실수 취소", "초보"],
  },
  {
    id: "guide-layer-clipping-basics", level: 1, stationId: "station-1-canvas", frequency: "daily", category: "drawing", atelierSuite: "InkRaster",
    titleKo: "선화·밑색 레이어 분리와 클리핑 마스크", titleEn: "Ink/Flat Layer Separation & Clipping Mask",
    plainOneLineKo: "선화와 색칠 층을 투명 필름처럼 나누고 색이 선 밖으로 절대 삐져나가지 않게 잠급니다.", plainOneLineEn: "Separate ink from color like acetate sheets and lock shading inside your flat shapes.",
    whenToUseKo: "선화 위에 색을 칠했다가 선까지 지워지는 사고를 막고 명암을 깔끔하게 얹고 싶을 때 씁니다.", whenToUseEn: "Use whenever you want to color and shade freely without touching your line art.",
    steps: [
      step(1, "밑색 레이어를 선화 아래에 생성", "Create Flat Layer Below Ink", "Ctrl+Shift+N으로 새 레이어를 만들고 선화 레이어 바로 아래로 드래그합니다.", "Press Ctrl+Shift+N and drag the new layer beneath the ink layer."),
      step(2, "명암 레이어 추가 후 클리핑 잠금", "Clip Shading Layer", "밑색 위에 레이어를 하나 더 올린 뒤 Ctrl+Alt+G로 아래 밑색 영역에 클리핑합니다.", "Add a shading layer above flats and press Ctrl+Alt+G to clip it."),
      step(3, "곱하기 모드로 그림자 칠하기", "Paint Multiply Shadows", "혼합 모드를 [곱하기]로 바꾸고 큰 브러시로 쓱 칠해도 밑색 안쪽에만 깔끔하게 남습니다.", "Switch blend mode to Multiply and brush shadows strictly inside the flat mask."),
    ],
    shortcut: "Ctrl+Shift+N / Ctrl+Alt+G", studioHref: "/studio?panel=layers&action=clipping-mask",
    commonMistakeKo: "선화 레이어 자체에 채색하면 나중에 선 색만 바꾸기 어렵습니다. 선화 레이어 자물쇠(투명 픽셀 잠금)를 켜 두세요.", commonMistakeEn: "Painting directly on the ink layer prevents line recoloring; enable Alpha Lock on ink.",
    proTipKo: "클리핑 그룹을 폴더로 묶어 두면 인물 1명의 피부·옷·머리카락 색감을 한 번에 보정할 수 있습니다.", proTipEn: "Group clipped layers per character to grade skin, hair, and outfit tones together.",
    quickTooltipKo: "선화 아래에 밑색을 깔고, 그 위 명암 레이어에 Ctrl+Alt+G를 걸면 색이 밖으로 번지지 않습니다.", quickTooltipEn: "Place flats below ink and clip shading above with Ctrl+Alt+G so paint never spills.",
    relatedHiddenIds: ["guide-watercolor-backrun-capillary", "guide-pchip-pressure-16k"], workContexts: ["first-open", "inking", "coloring-ai"],
    everydayIntents: ["레이어", "색이 삐져나가", "선 밖으로 번짐", "클리핑", "명암", "그림자 넣기", "선화 보호"],
  },
  {
    id: "guide-pchip-pressure-16k", level: 1, stationId: "station-1-canvas", frequency: "hidden-gem", category: "drawing", atelierSuite: "ToonCore",
    titleKo: "16K PCHIP 필압 곡선 커스터마이징", titleEn: "16K PCHIP Stylus Pressure Curve Calibration",
    plainOneLineKo: "손목 힘이 약하거나 세도 펜 끝 굵기가 꺾이지 않도록 16,384단계 단조 곡선으로 내 손에 맞춥니다.", plainOneLineEn: "Calibrate 16,384-level monotonic pressure curves so light or heavy hands get smooth line taper.",
    whenToUseKo: "펜을 세게 눌러야 겨우 굵어지거나, 살짝만 대도 굵은 선이 찍혀 손목이 아플 때 숨은 핵심 도구입니다.", whenToUseEn: "Essential hidden tool when light strokes vanish or heavy strokes max out too early.",
    steps: [
      step(1, "필압 곡선 튜너 열기", "Open Pressure Tuner", "Alt+Shift+P를 눌러 ToonCore 16K PCHIP 필압 곡선 패널을 엽니다.", "Press Alt+Shift+P to open the ToonCore 16K PCHIP curve panel."),
      step(2, "3초 필압 테스트 획 긋기", "Run 3-Second Sample Stroke", "패널 우측 테스트 패드에 평소 힘으로 얇게→굵게→얇게 한 획을 그어 분포를 측정합니다.", "Draw one thin-thick-thin sample stroke on the calibration pad."),
      step(3, "중간 제어점 미세 조정", "Tune Monotonic Control Point", "PCHIP 단조 보간이 오버슈트 없이 이어지므로 중간점을 위로 올리면 약한 필압도 또렷해집니다.", "Raise the midpoint for lighter hands; PCHIP prevents curve overshoot."),
      step(4, "브러시별 또는 전역 저장", "Save Per-Brush or Global", "[펜촉 전역 적용]을 누르면 모든 잉크·연필 브러시에 0.1ms 지연 없이 반영됩니다.", "Apply globally or per brush with sub-millisecond evaluation."),
    ],
    shortcut: "Alt+Shift+P", studioHref: "/studio?panel=brush-pressure&curve=pchip-16k",
    commonMistakeKo: "일반 스플라인 곡선처럼 끝점을 급격히 꺾으면 중간 필압이 튑니다. PCHIP 모드를 켜 두면 항상 단조 증가가 유지됩니다.", commonMistakeEn: "Sharp spline kinks cause pressure jumps; PCHIP guarantees monotonic continuity.",
    proTipKo: "장시간 마감으로 손목이 피로한 날에는 [라이트 터치 +18%] 프리셋으로 바꾸면 손힘을 절반으로 줄일 수 있습니다.", proTipEn: "Switch to Light Touch +18% during long deadlines to cut wrist pressure in half.",
    quickTooltipKo: "Alt+Shift+P에서 테스트 획 1번만 그으면 16K PCHIP 곡선이 내 손목 필압에 자동 맞춰집니다.", quickTooltipEn: "Press Alt+Shift+P and draw one sample stroke to auto-fit your 16K PCHIP pressure curve.",
    relatedHiddenIds: ["guide-handedness-mirror-0px", "guide-watercolor-backrun-capillary"], workContexts: ["first-open", "inking"],
    everydayIntents: ["필압", "손목 아파요", "펜이 너무 얇아", "세게 눌러야 나와요", "16k", "pchip", "압력 곡선", "태블릿 펜"],
  },
  {
    id: "guide-handedness-mirror-0px", level: 1, stationId: "station-1-canvas", frequency: "hidden-gem", category: "drawing", atelierSuite: "CalmChrome",
    titleKo: "왼손/오른손 0px 미러 전환", titleEn: "Left/Right Handed 0px Canvas-Shift Mirror",
    plainOneLineKo: "그리던 캔버스 위치가 단 1픽셀도 흔들리지 않은 채 도구 막대와 브러시 슬라이더만 좌우 반전합니다.", plainOneLineEn: "Mirror tool rails and brush sliders for left- or right-hand use with zero canvas reflow.",
    whenToUseKo: "왼손잡이 작가이거나 태블릿에서 한 손으로 브러시 크기·투명도를 엄지로 바로 조절하고 싶을 때 최고입니다.", whenToUseEn: "Ideal for left-handed artists or single-thumb tablet slider reach without shifting artwork.",
    steps: [
      step(1, "미러 전환 단축키 실행", "Trigger Handedness Mirror", "Alt+Shift+H를 누르거나 상단 크롬 메뉴에서 [왼손/오른손 미러]를 선택합니다.", "Press Alt+Shift+H or toggle Left/Right Mirror in the top bar."),
      step(2, "0px 캔버스 고정 확인", "Verify 0px Canvas Anchor", "도구 슬라이더와 실행취소 버튼만 반대편 엄지존으로 이동하고 작업 중이던 컷 중심은 0px 고정됩니다.", "Tool rails flip to the opposite thumb arc while the canvas stays anchored at 0px shift."),
      step(3, "엄지존 수직 슬라이더 미세 조절", "Adjust Vertical Thumb Slider", "반대편 손 엄지로 브러시 굵기와 불투명도를 그리면서 동시에 밀어 조절합니다.", "Slide brush size and opacity live with your non-drawing thumb."),
    ],
    shortcut: "Alt+Shift+H", studioHref: "/studio?chrome=mirror-handedness",
    commonMistakeKo: "패널을 일일이 드래그해서 옮기면 도킹 폭이 바뀌어 캔버스가 밀립니다. 전용 미러 전환은 레이아웃 폭을 동일하게 유지합니다.", commonMistakeEn: "Dragging panels manually shifts the canvas; the mirror toggle preserves exact chrome width.",
    proTipKo: "태블릿에서 가로/세로 화면 회전 시에도 선택한 주손 방향이 그대로 유지됩니다.", proTipEn: "Your chosen dominant-hand side persists across portrait and landscape tablet rotations.",
    quickTooltipKo: "Alt+Shift+H 한 번이면 캔버스 흔들림 0px 상태로 툴바와 엄지 슬라이더가 좌우 반전됩니다.", quickTooltipEn: "Press Alt+Shift+H to mirror toolbars and thumb sliders with 0px canvas shift.",
    relatedHiddenIds: ["guide-pchip-pressure-16k", "guide-reader-phone-pip-390"], workContexts: ["first-open", "inking"],
    everydayIntents: ["왼손잡이", "오른손", "툴바 왼쪽", "툴바 오른쪽", "좌우 반전", "엄지 슬라이더", "손바닥 가림", "미러"],
  },

  // ── Lv.2 웹툰 1컷 완성 (4종) ───────────────────────────────────────────────
  {
    id: "guide-panel-frame-split", level: 2, stationId: "station-2-cut", frequency: "daily", category: "layout-lettering", atelierSuite: "CalmChrome",
    titleKo: "웹툰 컷 프레임 분할과 세로 스크롤 여백 호흡", titleEn: "Panel Frame Splitting & Vertical Scroll Pacing",
    plainOneLineKo: "칼로 자르듯 컷을 쪼개고 컷 사이 여백 간격을 조절해 긴장감·여운이 살아나는 스크롤 리듬을 만듭니다.", plainOneLineEn: "Slice frames cleanly and tune vertical gutter spacing to control dramatic scroll pacing.",
    whenToUseKo: "콘티를 실제 웹툰 컷 틀로 옮기거나 액션·감정 씬의 스크롤 속도를 조절할 때 매일 씁니다.", whenToUseEn: "Use daily when turning rough storyboards into crisp scroll-paced panels.",
    steps: [
      step(1, "컷 분할 칼 도구 선택", "Select Frame Cutter", "K 키를 눌러 컷 분할 도구를 활성화하고 컷 테두리 두께(4~6px)를 고릅니다.", "Press K to activate the frame cutter and choose border weight (4-6px)."),
      step(2, "대각선·수평 1획 분할", "Slice Horizontal or Diagonal", "컷 위를 가로질러 드래그하면 자동으로 새 컷 폴더와 클리핑 영역이 분리 생성됩니다.", "Drag across a panel to auto-create isolated frame masks and sub-folders."),
      step(3, "여백 핸들로 호흡 조절", "Tune Gutter Rhythm", "컷 사이 흰 여백 핸들을 위아래로 끌어 빠른 대화(80px)와 정적 여운(260px)을 조절합니다.", "Drag the gutter handle between cuts for brisk banter (80px) or quiet beats (260px)."),
    ],
    shortcut: "K", studioHref: "/studio?tool=frame-cutter",
    commonMistakeKo: "모든 컷 간격을 똑같이 두면 화면이 단조로워집니다. 반전 컷 직전만 여백을 2배로 넓히면 몰입감이 살아납니다.", commonMistakeEn: "Uniform gutters flatten pacing; double the gutter before a reveal panel for impact.",
    proTipKo: "컷 테두리 밖으로 캐릭터 손이나 검이 튀어나오게 하려면 해당 레이어만 [컷 마스크 예외]를 켜면 됩니다.", proTipEn: "Toggle Frame Mask Pop-Out on one layer so hands or weapons break cleanly past panel borders.",
    quickTooltipKo: "K 키로 컷을 긋기만 하면 마스크 폴더가 자동 분할되고, 컷 사이 핸들로 스크롤 여백을 조절합니다.", quickTooltipEn: "Slice any panel with K to auto-split clipped folders and drag gutters for scroll tempo.",
    relatedHiddenIds: ["guide-reader-phone-pip-390", "guide-handedness-mirror-0px"], workContexts: ["panel-lettering", "first-open"],
    everydayIntents: ["컷 나누기", "컷 분할", "프레임", "테두리", "여백 간격", "스크롤 리듬", "웹툰 1컷"],
  },
  {
    id: "guide-voice-balloon-lettering", level: 2, stationId: "station-2-cut", frequency: "daily", category: "layout-lettering", atelierSuite: "CalmChrome",
    titleKo: "말풍선 자동 여백 · 음성 받아쓰기 식자", titleEn: "Auto-Padded Speech Balloons & Voice Lettering",
    plainOneLineKo: "타자를 치거나 마이크로 대사를 말하면 말풍선 크기·줄바꿈·화자 말꼬리가 모바일 가독성에 맞게 자동 정렬됩니다.", plainOneLineEn: "Type or dictate dialogue to auto-size balloon padding, line breaks, and speaker tails.",
    whenToUseKo: "대사가 많은 회차에서 말풍선 모양을 일일이 늘렸다 줄였다 하는 반복 작업을 없애고 싶을 때 씁니다.", whenToUseEn: "Use on dialogue-heavy episodes to eliminate manual balloon resizing and hyphenation.",
    steps: [
      step(1, "말풍선 또는 음성 식자 시작", "Open Balloon or Voice Mode", "T 키로 말풍선을 놓거나 Alt+V를 눌러 대사를 말하면 즉시 텍스트 레이어로 들어갑니다.", "Press T to place a balloon or Alt+V to dictate lines directly into a speech layer."),
      step(2, "감정 프리셋 선택", "Pick Emotion Preset", "일반 대사·속마음·외침(뾰족 테두리)·나레이션 박스 중 1개를 탭합니다.", "Pick Normal, Thought, Shout spike, or Narration box style."),
      step(3, "말꼬리 화자 스냅", "Snap Tail to Speaker", "꼬리 핸들을 캐릭터 얼굴 쪽으로 끌어당기면 말풍선 여백을 해치지 않고 자연스럽게 꺾입니다.", "Drag the tail handle toward the speaker without distorting inner margins."),
    ],
    shortcut: "T / Alt+V", studioHref: "/studio?tool=balloon-voice",
    commonMistakeKo: "한 말풍선에 5줄 이상 넣으면 스마트폰에서 벽글처럼 보입니다. 2~3줄 단위로 말풍선 두 개를 이어 붙이세요.", commonMistakeEn: "Stuffing 5+ lines into one bubble hurts mobile readability; chain two 2-3 line bubbles.",
    proTipKo: "다국어 연재를 준비 중이라면 식자 텍스트를 래스터화하지 말고 벡터 식자 레이어로 유지하세요.", proTipEn: "Keep lettering as live vector text instead of rasterizing so multilingual export stays editable.",
    quickTooltipKo: "T(입력) 또는 Alt+V(음성 식자)로 대사를 넣으면 3줄 가독성 여백과 말꼬리가 자동 정렬됩니다.", quickTooltipEn: "Use T to type or Alt+V to dictate dialogue with automatic mobile-safe balloon padding.",
    relatedHiddenIds: ["guide-reader-phone-pip-390", "guide-rights-bom-gate"], workContexts: ["panel-lettering"],
    everydayIntents: ["말풍선", "대사 넣기", "식자", "글씨", "폰트", "음성 입력", "말로 대사", "말꼬리"],
  },
  {
    id: "guide-screentone-sfx-layer", level: 2, stationId: "station-2-cut", frequency: "weekly", category: "layout-lettering", atelierSuite: "InkRaster",
    titleKo: "스크린톤 망점·모아래 방지 & 다국어 효과음(SFX)", titleEn: "Moire-Safe Screentones & Localizable SFX Layers",
    plainOneLineKo: "감정선·배경에 망점 톤을 입히고 해외 수출 시 글자만 갈아끼울 수 있게 효과음(SFX)을 분리 관리합니다.", plainOneLineEn: "Apply moire-free screentones and keep sound-effect lettering isolated for translation.",
    whenToUseKo: "흑백·하프톤 연출이나 액션 컷의 큰 의성어(쾅·두근)를 깔끔하게 넣고 싶을 때 씁니다.", whenToUseEn: "Use for monochrome accents, dramatic gradients, and clean action sound effects.",
    steps: [
      step(1, "스크린톤 패널 열기", "Open Screentone Panel", "Shift+M을 눌러 망점(60L/45°) 또는 감정 그라데이션 톤을 선택합니다.", "Press Shift+M and pick a 60L/45° halftone or mood gradient."),
      step(2, "모아래 방지 잠금 확인", "Verify Moire Guard", "축소 화면에서 얼룩이 생기지 않도록 [모바일 390px 안티모아래] 옵션을 켭니다.", "Enable Mobile 390px Anti-Moire so downscaled phones render clean dots."),
      step(3, "SFX 전용 레이어에 외곽선 효과 적용", "Style Dedicated SFX Layer", "효과음은 [SFX-로컬라이즈] 레이어에 적어 배경 그림을 지우지 않고 언어별 교체할 수 있게 합니다.", "Place SFX on the localizable layer so foreign editions swap text cleanly."),
    ],
    shortcut: "Shift+M", studioHref: "/studio?panel=screentone-sfx",
    commonMistakeKo: "톤을 겹쳐 붙일 때 각도가 같으면 지글거리는 모아래 무늬가 생깁니다. 보조 톤은 15° 또는 75°로 자동 회전하세요.", commonMistakeEn: "Stacking identical halftone angles causes moire; offset secondary tones by 30 degrees.",
    proTipKo: "지우개 브러시 대신 톤 마스크에 구름 브러시로 깎아 내면 출판 만화 같은 부드러운 톤 깎기가 됩니다.", proTipEn: "Carve the tone mask with a soft cloud brush for classic print-style feathering.",
    quickTooltipKo: "Shift+M으로 안티모아래 스크린톤을 입히고, 효과음은 전용 SFX 레이어로 분리해 두세요.", quickTooltipEn: "Press Shift+M for moire-safe tones and isolate SFX on a dedicated translation layer.",
    relatedHiddenIds: ["guide-reader-phone-pip-390", "guide-rights-bom-gate"], workContexts: ["panel-lettering", "coloring-ai"],
    everydayIntents: ["스크린톤", "망점", "모아래", "효과음", "의성어", "sfx", "글자 테두리", "감정선"],
  },
  {
    id: "guide-reader-phone-pip-390", level: 2, stationId: "station-6-qa", frequency: "hidden-gem", category: "qa-accessibility", atelierSuite: "CalmChrome",
    titleKo: "390px 독자 폰뷰 PiP 실시간 창", titleEn: "390px Reader Phone-View PiP Window",
    plainOneLineKo: "큰 모니터로 작업하면서 구석의 390px 스마트폰 미니 창으로 실제 독자가 스크롤할 화면과 글자 크기를 실시간 확인합니다.", plainOneLineEn: "Float a live 390px smartphone viewport beside your canvas to inspect scroll flow and font size.",
    whenToUseKo: "모니터에서는 시원해 보였는데 폰으로 보니 말풍선 글씨가 깨알 같거나 컷이 잘리는 실수를 막을 때 최고입니다.", whenToUseEn: "Hidden lifesaver to prevent tiny unreadable fonts or awkward phone-screen panel crops.",
    steps: [
      step(1, "390px 독자 폰뷰 PiP 띄우기", "Launch 390px PiP", "Ctrl+Shift+M을 눌러 캔버스 우측 하단에 390×844px 독자 화면 PiP 창을 띄웁니다.", "Press Ctrl+Shift+M to dock the 390x844px live reader PiP."),
      step(2, "실시간 휠 스크롤로 호흡 점검", "Scroll-Test Cut Timing", "PiP 안에서 마우스 휠을 굴려 한 화면에 컷이 몇 개 걸리는지, 반전 컷이 미리 스포일러되지 않는지 봅니다.", "Scroll inside the PiP to check panel framing and ensure reveals stay hidden."),
      step(3, "최소 가독성 경고(11pt 미만) 확인", "Check Min Readability Guard", "폰 기준 11pt 이하로 작아진 말풍선은 PiP 위에 노란 테두리로 표시되니 즉시 키웁니다.", "Any text rendering below 11pt on phone highlights in amber for instant fixing."),
    ],
    shortcut: "Ctrl+Shift+M", studioHref: "/studio?preview=reader-pip-390",
    commonMistakeKo: "작업이 다 끝난 뒤 출고해서 폰으로 옮겨 보면 수정 시간이 3배 듭니다. 식자 단계부터 PiP를 띄워 두세요.", commonMistakeEn: "Waiting until final export to test on a phone triples rework; keep PiP open while lettering.",
    proTipKo: "PiP 상단의 [야간 다크 독자 모드] 토글을 누르면 어두운 배경 뷰어에서 흰 말풍선이 눈부신지도 함께 점검할 수 있습니다.", proTipEn: "Toggle Night Reader Mode inside the PiP to inspect glare on dark-mode webtoon apps.",
    quickTooltipKo: "Ctrl+Shift+M을 켜 두면 독자 스마트폰(390px)에서 대사 크기와 컷 잘림을 그리면서 바로 봅니다.", quickTooltipEn: "Press Ctrl+Shift+M to preview real 390px phone readability and scroll pacing live.",
    relatedHiddenIds: ["guide-color-vision-readability", "guide-handedness-mirror-0px"], workContexts: ["panel-lettering", "qa-check"],
    everydayIntents: ["폰에서 어떻게 보여", "모바일 미리보기", "글자 안 보일까 봐", "390px", "독자 화면", "pip", "스마트폰 확인"],
  },

  // ── Lv.3 3D 배경·캐릭터·솔리드 CAD (4종) ───────────────────────────────────
  {
    id: "guide-atelier-cast-pose", level: 3, stationId: "station-3-cast", frequency: "daily", category: "spatial-3d", atelierSuite: "AtelierCast",
    titleKo: "AtelierCast 3D 캐릭터 체형·포즈·표정 1분 세팅", titleEn: "AtelierCast 3D Character Body, Pose & Expression",
    plainOneLineKo: "어려운 인체 각도와 손동작을 3D 인형으로 1분 만에 잡은 뒤 반투명 가이드로 캔버스에 바로 얹어 그립니다.", plainOneLineEn: "Pose 3D anatomy, hands, and facial expressions in 1 minute and drop them as tracing guides.",
    whenToUseKo: "하이앵글·로우앵글이나 복잡한 액션 포즈에서 인체 비율이 무너질 때 매일 쓰는 핵심 기능입니다.", whenToUseEn: "Use daily for high/low angles and dynamic poses where hand-drawn anatomy breaks.",
    steps: [
      step(1, "AtelierCast 인형 불러오기", "Open AtelierCast Figure", "Shift+3으로 AtelierCast를 열고 작품 등신대(6.5등신·7.5등신 등) 체형 프리셋을 선택합니다.", "Press Shift+3 and pick your series head-to-body ratio preset."),
      step(2, "관절 IK 드래그 또는 포즈 적용", "Pose via IK or Library", "손목·발목 핀을 끌어 자세를 잡거나 [감정·액션 포즈] 카드 한 번 클릭으로 바로 적용합니다.", "Drag IK limb pins or apply a one-click action/emotion pose card."),
      step(3, "캔버스 가이드 레이어로 투영", "Project to Canvas Guide", "[현재 각도 컷에 삽입]을 누르면 선화 아래 연한 청사진 가이드 레이어로 얹힙니다.", "Click Insert to Cut to place a low-opacity blueprint guide below your ink layer."),
    ],
    shortcut: "Shift+3", studioHref: "/studio/poser",
    commonMistakeKo: "3D 인형 외곽선을 그대로 베끼면 경직되어 보입니다. 어깨선과 옷 주름만 참고해 내 화풍으로 10% 과장해 그리세요.", commonMistakeEn: "Tracing raw 3D silhouettes looks stiff; use shoulder/hip lines as guides and exaggerate 10%.",
    proTipKo: "주인공 체형 슬라이더를 [캐스트 프리셋 저장]해 두면 화수가 바뀌어도 키·어깨 비율이 흔들리지 않습니다.", proTipEn: "Save each lead's body proportions as a Cast preset so character height stays consistent.",
    quickTooltipKo: "Shift+3으로 AtelierCast 캐릭터 포즈와 표정을 잡고 [컷에 삽입]하면 인체 가이드가 바로 얹힙니다.", quickTooltipEn: "Press Shift+3 to pose a 3D character in AtelierCast and drop it directly onto your cut.",
    relatedHiddenIds: ["guide-atelier-solid-cutaway-gdt", "guide-pchip-pressure-16k"], workContexts: ["scene-3d", "inking"],
    everydayIntents: ["인체 구도", "3d 캐릭터", "포즈 잡기", "손 그리기 어려워", "등신대", "표정", "ateliercast"],
  },
  {
    id: "guide-atelier-cast-camera-prop", level: 3, stationId: "station-3-cast", frequency: "weekly", category: "spatial-3d", atelierSuite: "AtelierCast",
    titleKo: "3D 카메라 화각(24mm~85mm) & 소품 그립 스냅", titleEn: "3D Camera Focal Length (24-85mm) & Prop Grip Snap",
    plainOneLineKo: "카메라 렌즈 화각으로 원근 박력을 키우고 칼·컵·스마트폰 같은 소품을 손가락에 자석처럼 딱 붙입니다.", plainOneLineEn: "Dial dramatic lens perspective and magnet-snap props cleanly into 3D hands.",
    whenToUseKo: "주먹이나 무기가 화면 앞으로 튀어나오는 박진감 있는 컷, 또는 소품을 쥔 손 구도를 빨리 잡을 때 씁니다.", whenToUseEn: "Use for dramatic foreshortening shots or natural hand-holding-prop silhouettes.",
    steps: [
      step(1, "렌즈 화각 프리셋 선택", "Set Camera Focal Length", "C 키로 카메라 바를 열고 액션은 24mm 광각, 인물 감정은 85mm 망원으로 맞춥니다.", "Press C and choose 24mm wide for action impact or 85mm telephoto for portraits."),
      step(2, "소품 선택 후 그립 스냅", "Magnet-Snap Prop to Hand", "소품을 씬에 올린 뒤 Alt+3 [손 그립 자동 스냅]을 누르면 다섯 손가락이 손잡이에 감깁니다.", "Place a prop and press Alt+3 to auto-wrap fingers around the grip."),
      step(3, "실루엣 명암 체크", "Inspect Silhouette Read", "화면 상단 [실루엣 보기]로 손과 소품 윤곽이 겹쳐 뭉개지지 않는지 2초 확인합니다.", "Toggle Silhouette mode for 2 seconds to verify hand and prop contours stay distinct."),
    ],
    shortcut: "C / Alt+3", studioHref: "/studio/assets/characters/new",
    commonMistakeKo: "광각(18~24mm)으로 일상 대화 컷을 찍으면 얼굴이 왜곡됩니다. 일상 컷은 50mm 표준 화각이 안정적입니다.", commonMistakeEn: "Wide 18-24mm lenses distort calm dialogue faces; keep routine shots near 50mm.",
    proTipKo: "자주 쓰는 구도(복도 투시·옥상 대치)는 [카메라 북마크]에 저장해 다음 화에서도 1클릭 재호출하세요.", proTipEn: "Bookmark recurring hallway or rooftop camera angles for 1-click reuse in later episodes.",
    quickTooltipKo: "C 키로 24mm(박력)~85mm(인물) 화각을 바꾸고, Alt+3으로 소품을 캐릭터 손에 자동 부착하세요.", quickTooltipEn: "Switch 24-85mm lens drama with C and auto-snap props to character hands with Alt+3.",
    relatedHiddenIds: ["guide-atelier-solid-cutaway-gdt", "guide-reader-phone-pip-390"], workContexts: ["scene-3d"],
    everydayIntents: ["카메라 구도", "원근감", "화각", "소품 쥐기", "손에 칼", "광각", "망원"],
  },
  {
    id: "guide-bg3d-lt-lighting", level: 3, stationId: "station-4-solid", frequency: "weekly", category: "spatial-3d", atelierSuite: "PrismLight",
    titleKo: "3D 배경 LT(선화·톤) 추출 & PrismLight 광학 조명", titleEn: "3D Background LT Ink Extraction & PrismLight Lighting",
    plainOneLineKo: "3D 건물·거리 배경을 만화 선화와 그림자 톤 레이어로 자동 변환하고 시간대별 역광·림라이트를 입힙니다.", plainOneLineEn: "Convert 3D sets into comic ink and shadow tone layers with time-of-day PrismLight rim lighting.",
    whenToUseKo: "복잡한 학교 복도·카페·도시 배경을 일일이 펜으로 따지 않고 내 작품 화풍에 맞춰 자연스럽게 녹일 때 씁니다.", whenToUseEn: "Use to turn dense architectural 3D scenes into hand-drawn-feeling backgrounds in seconds.",
    steps: [
      step(1, "3D 배경 배치 및 각도 확정", "Frame 3D Background", "배경 3D 씬을 열고 캐릭터 눈높이(수평선 가이드)에 맞춰 카메라를 고정합니다.", "Align the 3D scene horizon line with your character's eye level."),
      step(2, "LT 선화·톤 레이어 추출 실행", "Run LT Line & Tone Extraction", "Ctrl+Alt+L을 눌러 외곽선 굵기(0.8~2.0px)와 내부 디테일 밀도를 슬라이더로 정합니다.", "Press Ctrl+Alt+L and tune outer line weight and interior detail density."),
      step(3, "PrismLight 시간대 조명 적용", "Apply PrismLight Mood", "노을·형광등·새벽 역광 중 1개를 고르면 전역 조명 그림자와 창문 빛줄기가 별도 레이어로 뽑힙니다.", "Pick Sunset, Fluorescent, or Dawn rim light to export GI shadows on a separate layer."),
    ],
    shortcut: "Ctrl+Alt+L", studioHref: "/studio?panel=scene3d-lt-lighting",
    commonMistakeKo: "3D 선화를 완전한 순흑 100%로 두면 캐릭터보다 배경이 튀어 보입니다. 배경 선화 색을 어두운 남색/갈색으로 20% 낮추세요.", commonMistakeEn: "Pure heavy black 3D ink overpowers characters; tint background lines slightly muted.",
    proTipKo: "추출된 선화 레이어를 벡터 상태로 유지하면 원경의 복잡한 창틀 선만 굵기 보정 브러시로 얇게 줄일 수 있습니다.", proTipEn: "Keep extracted ink as vectors so you can thin distant window lines with one brush pass.",
    quickTooltipKo: "Ctrl+Alt+L로 3D 배경을 선화·톤으로 뽑고 PrismLight로 노을·역광 그림자를 자동 생성하세요.", quickTooltipEn: "Press Ctrl+Alt+L to extract 3D ink/tones and layer PrismLight global illumination.",
    relatedHiddenIds: ["guide-atelier-solid-cutaway-gdt", "guide-color-vision-readability"], workContexts: ["scene-3d", "coloring-ai"],
    everydayIntents: ["배경 선 따기", "3d 선화", "lt 변환", "노을 조명", "림라이트", "배경 넣기", "건물 그리기"],
  },
  {
    id: "guide-atelier-solid-cutaway-gdt", level: 3, stationId: "station-4-solid", frequency: "hidden-gem", category: "spatial-3d", atelierSuite: "AtelierSolid",
    titleKo: "AtelierSolid 3D 솔리드 단면 컷어웨이 & GD&T 도면", titleEn: "AtelierSolid 3D Section Cutaway & GD&T Blueprint",
    plainOneLineKo: "벽에 가려진 실내나 기계·판타지 무기 내부를 칼로 자른 듯 단면 컷어웨이로 보여 주고 정확한 치수 도면까지 뽑습니다.", plainOneLineEn: "Slice walls or mechanical props open with live section planes and export crisp GD&T dimension sheets.",
    whenToUseKo: "좁은 방 안을 카메라가 벽에 걸리지 않고 찍고 싶거나, SF·판타지 무기·건물 설정집 도면이 필요할 때 빛나는 숨은 기능입니다.", whenToUseEn: "Hidden gem for tight-room camera shots without wall clipping or sci-fi prop blueprint lore sheets.",
    steps: [
      step(1, "AtelierSolid 단면 평면 활성화", "Enable Section Cutaway Plane", "Ctrl+Alt+X를 눌러 3D 솔리드 뷰에 X/Y/Z 절단 평면 기즈모를 띄웁니다.", "Press Ctrl+Alt+X to spawn an X/Y/Z cutaway plane gizmo."),
      step(2, "벽·외피만 밀어 내부 노출", "Slide Plane to Reveal Interior", "단면 화살표를 밀어 시야를 막는 앞벽만 숨기면 내부 가구와 캐릭터 조명은 그대로 유지됩니다.", "Push the plane past the front wall while keeping interior furniture and lighting intact."),
      step(3, "GD&T 치수·공차 도면 오버레이 켜기", "Toggle GD&T Dimension Sheet", "[GD&T 3면도 추출]을 클릭하면 정면·측면·단면 치수선과 해칭이 벡터 설정 시트로 생성됩니다.", "Click Extract GD&T Views to generate hatched front/side/section blueprint vectors."),
    ],
    shortcut: "Ctrl+Alt+X", studioHref: "/studio?panel=atelier-solid&mode=cutaway-gdt",
    commonMistakeKo: "벽 오브젝트를 통째로 삭제하면 바깥 빛이 쏟아져 실내 조명 분위기가 깨집니다. 단면 컷어웨이의 [그림자 벽 유지]를 켜세요.", commonMistakeEn: "Deleting walls leaks outdoor light inside; keep Cast Hidden Wall Shadows enabled.",
    proTipKo: "판타지 마법검이나 메카닉 기체 설정집 컷에 GD&T 치수선을 반투명으로 얹으면 프로 디자이너급 디테일이 완성됩니다.", proTipEn: "Overlay faint GD&T callouts on lore panels to give sci-fi props authentic technical polish.",
    quickTooltipKo: "Ctrl+Alt+X로 앞벽만 깔끔하게 단면 절단하고, 원클릭으로 설정집용 GD&T 치수 도면을 뽑으세요.", quickTooltipEn: "Press Ctrl+Alt+X to slice blocking walls cleanly and export GD&T blueprint sheets.",
    relatedHiddenIds: ["guide-rights-bom-gate", "guide-c2pa-human-merkle"], workContexts: ["scene-3d"],
    everydayIntents: ["단면", "컷어웨이", "벽 가림", "좁은 방 카메라", "도면", "치수선", "gd&t", "설계도", "솔리드", "cad"],
  },

  // ── Lv.4 화풍·광학 필터·온디바이스 AI (4종) ─────────────────────────────────
  {
    id: "guide-ondevice-ai-flat-color", level: 4, stationId: "station-5-paint", frequency: "daily", category: "style-ai", atelierSuite: "SpectrumCompute",
    titleKo: "온디바이스 AI 자동 밑색 & AtelierFilter 광학 보정", titleEn: "On-Device AI Auto Flats & AtelierFilter Optical Grade",
    plainOneLineKo: "서버 전송 없이 내 기기 WebGPU에서 선화 밑색을 3초 만에 채우고 블룸·색수차·필름 그레인으로 영화 같은 마감을 더합니다.", plainOneLineEn: "Auto-fill base flats locally on WebGPU in 3 seconds, then finish with optical bloom and grain.",
    whenToUseKo: "수십 컷의 밑색 채우기 노가다를 줄이고 마지막에 화면 전체 톤을 통일하고 싶을 때 매일 씁니다.", whenToUseEn: "Use daily to cut flat-coloring repetition and unify final cut atmosphere.",
    steps: [
      step(1, "선화 참조 지정 후 온디바이스 밑색 실행", "Run Local Auto Flats", "선화 레이어를 참조로 두고 G 키 → [온디바이스 AI 자동 밑색]을 누르면 캐릭터 팔레트에 맞춰 채워집니다.", "Mark ink as reference, press G, and run On-Device AI Auto Flats using your character palette."),
      step(2, "AtelierFilter 광학 보정 열기", "Open AtelierFilter Optics", "Ctrl+Shift+F를 눌러 하이라이트 블룸, 미세 색수차, 그라데이션 맵 필터를 비파괴 레이어로 올립니다.", "Press Ctrl+Shift+F to stack non-destructive bloom, chromatic fringe, and gradient map."),
      step(3, "전/후 분할 커튼으로 과보정 점검", "Inspect Before/After Curtain", "분할 커튼을 좌우로 밀어 피부색이 탁해지지 않았는지 확인한 뒤 [회차 전체 프리셋 적용]을 누릅니다.", "Scrub the split curtain to verify skin tones stay clean, then save as an episode preset."),
    ],
    shortcut: "G / Ctrl+Shift+F", studioHref: "/studio/ai-lab#auto-flat-color",
    commonMistakeKo: "블룸과 채도를 동시에 과하게 올리면 대사 가독성이 떨어집니다. 광학 필터는 불투명도 18~30%에서 가장 세련됩니다.", commonMistakeEn: "Heavy bloom plus high saturation hurts readability; keep optical layers around 18-30% opacity.",
    proTipKo: "모든 연산이 내 기기 WebGPU에서 로컬 실행되므로 미공개 원고가 외부 클라우드로 전송되지 않습니다.", proTipEn: "All inference runs locally on WebGPU, so unreleased manuscripts never leave your device.",
    quickTooltipKo: "G(자동 밑색)로 3초 채색 후 Ctrl+Shift+F 광학 필터를 20% 강도로 얹으면 컷 분위기가 살아납니다.", quickTooltipEn: "Fill base colors locally with G, then layer subtle 20% optical grading via Ctrl+Shift+F.",
    relatedHiddenIds: ["guide-watercolor-backrun-capillary", "guide-color-vision-readability"], workContexts: ["coloring-ai"],
    everydayIntents: ["자동 채색", "밑색", "채색 빨리", "노가다 줄이기", "광학 필터", "블룸", "색보정", "온디바이스 ai"],
  },
  {
    id: "guide-continuity-qa-guard", level: 4, stationId: "station-6-qa", frequency: "weekly", category: "qa-accessibility", atelierSuite: "AtelierFilter",
    titleKo: "온디바이스 작화 붕괴·얼굴 비율·의상 연속성 자동 검수", titleEn: "On-Device Continuity & Model-Sheet QA Guard",
    plainOneLineKo: "앞 컷과 비교해 주인공 얼굴 비율이 달라졌거나 귀걸이·단추·옷 색깔이 빠진 작화 붕괴를 자동으로 집어냅니다.", plainOneLineEn: "Automatically flag off-model facial proportions and missing accessories across episode panels.",
    whenToUseKo: "마감 직전 피곤해서 눈이 무뎌졌을 때 50~70컷 전체의 작화 실수를 1분 만에 훑고 싶을 때 씁니다.", whenToUseEn: "Run before deadlines to scan 50-70 panels in one minute when eyes are fatigued.",
    steps: [
      step(1, "캐릭터 기준 시트 연결", "Bind Character Sheet", "Ctrl+Shift+Q로 연속성 검수기를 열고 작품 바이블의 주인공 기준 컬러·얼굴 시트를 선택합니다.", "Press Ctrl+Shift+Q and select your series character sheet reference."),
      step(2, "회차 전체 스캔 실행", "Scan Full Episode", "[로컬 검수 시작]을 누르면 눈 간격 편차, 머리카락 명도 이탈, 누락 장신구를 컷 번호별로 표시합니다.", "Run Local Scan to list eye-ratio drift, hair-tone mismatch, and missing props per cut."),
      step(3, "지적 컷 점프 & 즉시 수정", "Jump & Patch Cut", "경고 카드를 클릭하면 해당 컷 좌표로 화면이 바로 이동해 10초 안에 수정할 수 있습니다.", "Click any warning card to jump directly to that cut coordinate and fix it."),
    ],
    shortcut: "Ctrl+Shift+Q", studioHref: "/studio?panel=continuity-qa",
    commonMistakeKo: "개그 컷의 의도적 데포르메까지 경고로 뜰 수 있습니다. 해당 컷만 [연출 예외 허용]을 체크해 두면 다음 스캔에서 제외됩니다.", commonMistakeEn: "Comedic chibi distortions may flag as drift; mark those panels as Intentional Style.",
    proTipKo: "배경의 시간대(낮→밤) 전환이 어색한 컷도 색온도 그래프로 한눈에 찾아낼 수 있습니다.", proTipEn: "Check the color-temperature strip to spot unintended daytime-to-night lighting jumps.",
    quickTooltipKo: "Ctrl+Shift+Q로 마감 전 회차 전체를 스캔하면 의상 누락과 얼굴 비율 이탈 컷을 바로 찾아줍니다.", quickTooltipEn: "Press Ctrl+Shift+Q before deadlines to catch missing props and off-model faces.",
    relatedHiddenIds: ["guide-color-vision-readability", "guide-reader-phone-pip-390"], workContexts: ["qa-check", "coloring-ai"],
    everydayIntents: ["작붕", "작화 붕괴", "얼굴 달라졌", "옷 색깔 틀림", "귀걸이 빠짐", "연속성 검수", "마감 체크"],
  },
  {
    id: "guide-watercolor-backrun-capillary", level: 4, stationId: "station-5-paint", frequency: "hidden-gem", category: "style-ai", atelierSuite: "AtelierInk",
    titleKo: "AtelierInk 수채화 백런 모세관 테두리 제어", titleEn: "AtelierInk Watercolor Backrun Capillary Edge Control",
    plainOneLineKo: "진짜 물감이 젖은 한지·코튼지 가장자리로 밀려 마르며 생기는 선명한 수채화 백런(물얼룩) 테두리를 물리 수치로 조종합니다.", plainOneLineEn: "Control realistic pigment-to-edge capillary migration and dried watercolor backrun rims.",
    whenToUseKo: "로맨스·감성 일러스트 표지나 회상 씬에 디지털 티가 전혀 안 나는 손그림 수채화 번짐을 넣고 싶을 때 숨은 보석입니다.", whenToUseEn: "Hidden gem for romance covers and flashback cuts that demand authentic wet-media blooms.",
    steps: [
      step(1, "AtelierInk 습식 용지 활성화", "Enable Wet Paper Substrate", "Alt+Shift+W로 AtelierInk 습식 엔진을 켜고 황목 코튼지 또는 한지 높이맵을 고릅니다.", "Press Alt+Shift+W and pick Cold-Press Cotton or Hanji paper heightmap."),
      step(2, "모세관 백런 강도와 수분량 조절", "Tune Capillary Backrun & Water", "물 함량 65% · 모세관 테두리(Backrun) 42%로 맞춘 뒤 붓을 떼면 안료가 가장자리로 모입니다.", "Set Water 65% and Capillary Backrun 42% so pigment migrates to stroke edges as it dries."),
      step(3, "부분 건조(드라이어)로 번짐 고정", "Freeze Wash with Instant Dry", "원하는 번짐 테두리가 잡힌 순간 [레이어 즉시 건조]를 눌러 다음 겹칠 시 밑색이 섞이지 않게 고정합니다.", "Hit Instant Dry at the exact bloom peak so the next glaze layers cleanly without muddying."),
    ],
    shortcut: "Alt+Shift+W", studioHref: "/studio?panel=atelier-ink&preset=watercolor-backrun",
    commonMistakeKo: "건조 버튼을 안 누르고 어두운 색을 계속 덧칠하면 물감이 섞여 탁해집니다. 1차 번짐이 마음에 들면 즉시 건조하세요.", commonMistakeEn: "Glazing dark colors over an undried layer muddies hues; trigger Instant Dry between washes.",
    proTipKo: "투명 물 브러시 한 방울을 마르기 직전 붓질 가장자리에 톡 떨어뜨리면 꽃잎 같은 감성 백런 꽃무늬가 생깁니다.", proTipEn: "Drop one clean water dab near a half-dry edge to bloom delicate floral backruns.",
    quickTooltipKo: "Alt+Shift+W에서 수분 65%·백런 42%로 칠한 뒤 [즉시 건조]를 누르면 손그림 수채화 테두리가 완성됩니다.", quickTooltipEn: "Use Alt+Shift+W (Water 65%, Backrun 42%) and hit Instant Dry to lock authentic watercolor rims.",
    relatedHiddenIds: ["guide-pchip-pressure-16k", "guide-color-vision-readability"], workContexts: ["coloring-ai"],
    everydayIntents: ["수채화", "백런", "물감 번짐", "모세관", "테두리 얼룩", "한지 질감", "손그림 느낌", "atelierink"],
  },
  {
    id: "guide-color-vision-readability", level: 4, stationId: "station-6-qa", frequency: "hidden-gem", category: "qa-accessibility", atelierSuite: "AtelierFilter",
    titleKo: "색각 이상(적록/청황) 실시간 가독성 검수", titleEn: "Real-Time Color-Vision (Deutan/Protan/Tritan) Readability Audit",
    plainOneLineKo: "적록·청황 색각 다양성을 가진 독자 눈에도 캐릭터와 효과음, 강조 대사가 배경에 묻히지 않는지 실시간 필터로 확인합니다.", plainOneLineEn: "Preview cuts through red-green and blue-yellow color-vision filters so key details never vanish.",
    whenToUseKo: "붉은 마법 이펙트와 초록 숲이 겹치거나, 컬러 말풍선·강조 자막의 명도 대비가 애매할 때 필수인 숨은 품질 도구입니다.", whenToUseEn: "Essential hidden QA check when red effects sit over green foliage or colored captions risk blending.",
    steps: [
      step(1, "색각 시뮬레이션 단축키 전환", "Toggle Vision Simulator", "Ctrl+Alt+C를 눌러 적록(제1·제2색각)과 청황(제3색각) 프리뷰 모드를 순환합니다.", "Press Ctrl+Alt+C to cycle Protanopia, Deuteranopia, and Tritanopia live views."),
      step(2, "묻히는 경계와 명도 대비 확인", "Spot Merged Contours", "배경과 캐릭터가 같은 밝기로 뭉개져 보이는 구역이 있는지 확인합니다.", "Identify regions where foreground characters merge into background luminance."),
      step(3, "명도 차 보강 또는 림라이트 추가", "Boost Luminance Separation", "색상만 바꾸지 말고 밝기(명도) 차이를 25% 이상 벌리거나 얇은 흰 테두리를 넣어 가독성을 확보합니다.", "Separate luminance by 25%+ or add a subtle rim highlight rather than shifting hue alone."),
    ],
    shortcut: "Ctrl+Alt+C", studioHref: "/studio?preview=color-vision-audit",
    commonMistakeKo: "채도만 높이면 색각 이상 시뮬레이션에서는 여전히 회색 덩어리로 합쳐집니다. 반드시 명도(밝고 어두움) 차이를 주세요.", commonMistakeEn: "Boosting saturation alone still merges under color blindness; separate lightness values.",
    proTipKo: "색각 검수 패널의 [흑백 명도 확인]을 함께 켜면 전체 구도의 시선 집중도까지 동시에 검증됩니다.", proTipEn: "Pair with Grayscale Value Check to verify overall focal hierarchy at the same time.",
    quickTooltipKo: "Ctrl+Alt+C로 적록/청황 시야에서 글자와 캐릭터가 묻히지 않는지 3초 만에 검수하세요.", quickTooltipEn: "Press Ctrl+Alt+C to check red-green and blue-yellow readability in 3 seconds.",
    relatedHiddenIds: ["guide-reader-phone-pip-390", "guide-watercolor-backrun-capillary"], workContexts: ["qa-check", "coloring-ai"],
    everydayIntents: ["색약", "색맹", "적록", "청황", "색각 이상", "가독성", "글자 묻힘", "접근성", "명도 대비"],
  },

  // ── Lv.5 팀 협업·가상 작업실·출고 (4종) ───────────────────────────────────
  {
    id: "guide-atelier-stage-webcodecs-4k", level: 5, stationId: "station-7-ship", frequency: "weekly", category: "collab-export", atelierSuite: "AtelierStage",
    titleKo: "AtelierStage 가상 작업실 리뷰 & 4K WebCodecs 로컬 출고", titleEn: "AtelierStage Virtual Studio Review & Local 4K WebCodecs Export",
    plainOneLineKo: "팀원과 3D 가상 작업실에서 원고 핀을 짚으며 피드백하고, 브라우저 내 WebCodecs로 서버 대기 없이 4K 영상·컷을 출고합니다.", plainOneLineEn: "Review pinned cuts together in AtelierStage and render 4K WebCodecs exports locally with zero queue.",
    whenToUseKo: "PD·어시스턴트와 회차 최종 리뷰를 하거나 연재용 컷 분할·홍보용 4K 타임랩스 영상을 뽑을 때 씁니다.", whenToUseEn: "Use for team episode sign-off and direct local 4K teaser or episode package delivery.",
    steps: [
      step(1, "AtelierStage 작업실 입장 및 핀 리뷰", "Enter AtelierStage & Pin Notes", "상단 [가상 작업실]로 들어가 원고 보드에 수정 핀을 꽂고 공간 음성으로 논의합니다.", "Open AtelierStage, drop review pins on cuts, and discuss over spatial audio."),
      step(2, "KilnExport 4K WebCodecs 설정", "Configure KilnExport WebCodecs", "Ctrl+Shift+E를 눌러 연재 플랫폼 규격(세로 분할 PNG/JPG) 또는 4K 60fps MP4 타임랩스를 고릅니다.", "Press Ctrl+Shift+E and pick platform slice preset or 4K 60fps WebCodecs MP4."),
      step(3, "하드웨어 가속 로컬 인코딩 완료", "Run Local Hardware Export", "[로컬 출고 실행]을 누르면 클라우드 렌더링 대기열 0초, 서버 업로드 비용 0원으로 즉시 저장됩니다.", "Export locally via WebCodecs with zero cloud queue and zero render fees."),
    ],
    shortcut: "Ctrl+Shift+E", studioHref: "/studio/space",
    commonMistakeKo: "4K 출고 직전 임시 스케치·가이드 레이어 눈 아이콘을 끄지 않으면 결과물에 파란 가이드 선이 함께 출력됩니다.", commonMistakeEn: "Leaving guide layers visible bakes blueprint lines into final slices; enable Exclude Guides.",
    proTipKo: "출고 프리셋에서 [가이드·메모 레이어 자동 제외]를 체크해 두면 매번 눈 아이콘을 끌 필요가 없습니다.", proTipEn: "Check Auto-Exclude Guide & Note Layers once so every export stays clean automatically.",
    quickTooltipKo: "AtelierStage에서 팀 핀 리뷰를 끝낸 뒤 Ctrl+Shift+E로 대기열 없이 4K 로컬 출고하세요.", quickTooltipEn: "Finish team pin reviews in AtelierStage, then export locally in 4K via Ctrl+Shift+E.",
    relatedHiddenIds: ["guide-hlc-crdt-offline-merge", "guide-rights-bom-gate", "guide-c2pa-human-merkle"], workContexts: ["team-export"],
    everydayIntents: ["가상 작업실", "팀 협업", "리뷰", "피드백", "4k 출고", "내보내기", "타임랩스", "webcodecs", "atelierstage"],
  },
  {
    id: "guide-hlc-crdt-offline-merge", level: 5, stationId: "station-7-ship", frequency: "hidden-gem", category: "collab-export", atelierSuite: "LoomSync",
    titleKo: "HLC CRDT 오프라인 충돌 병합 복구", titleEn: "HLC CRDT Offline Conflict Merge & Tile Recovery",
    plainOneLineKo: "카페 와이파이나 비행기 안에서 각자 따로 그린 레이어가 다시 연결됐을 때 덮어쓰기 없이 타일 단위로 안전하게 합칩니다.", plainOneLineEn: "Reconcile offline strokes safely at the tile level using Hybrid Logical Clock CRDT merge when reconnecting.",
    whenToUseKo: "어시스턴트와 동시에 채색하다 인터넷이 끊겼거나, 노트북과 태블릿에서 같은 회차를 따로 수정했을 때 원고를 살리는 숨은 안전망입니다.", whenToUseEn: "Hidden safety net when teammates lose Wi-Fi mid-deadline or edit across two devices offline.",
    steps: [
      step(1, "LoomSync 충돌 타임라인 열기", "Open LoomSync Conflict View", "재연결 배지가 뜨면 Ctrl+Alt+R을 눌러 HLC(하이브리드 논리 시계) 기준 분기 타일 목록을 엽니다.", "Press Ctrl+Alt+R on reconnect to inspect HLC-ordered divergent tiles."),
      step(2, "충돌 타일 좌/우·겹침 비교", "Compare Divergent Tiles", "겹친 타일만 하이라이트되므로 [내 변경 · 팀원 변경 · 자동 양쪽 보존(레이어 분기)] 중 고릅니다.", "Inspect only conflicting tiles and pick Mine, Teammate, or Keep Both as Layers."),
      step(3, "무손실 커밋 및 스냅샷 확정", "Commit Lossless Merge", "[타일 병합 확정]을 누르면 이전 상태도 복구 지점으로 남아 언제든 되돌릴 수 있습니다.", "Confirm merge; the pre-merge snapshot stays recoverable in local history."),
    ],
    shortcut: "Ctrl+Alt+R", studioHref: "/studio?panel=loom-sync&view=conflict-merge",
    commonMistakeKo: "인터넷이 끊겼다고 탭을 강제 새로고침하면 로컬 큐를 기다리지 못할 수 있습니다. 상단 [오프라인 로컬 저장됨] 초록 점을 확인하세요.", commonMistakeEn: "Never force-reload when offline; verify the green Offline Local Saved indicator first.",
    proTipKo: "같은 컷이라도 선화(작가)와 밑색(어시스턴트)이 서로 다른 레이어면 100% 무충돌로 자동 병합됩니다.", proTipEn: "Edits on separate layers (ink vs. flats) merge with zero conflicts automatically.",
    quickTooltipKo: "인터넷 끊김 후 충돌이 나도 Ctrl+Alt+R에서 타일 단위로 양쪽 그림을 손실 없이 합칠 수 있습니다.", quickTooltipEn: "Press Ctrl+Alt+R after offline edits to merge conflicting tiles losslessly.",
    relatedHiddenIds: ["guide-rights-bom-gate", "guide-c2pa-human-merkle"], workContexts: ["team-export"],
    everydayIntents: ["인터넷 끊겼", "와이파이 끊김", "오프라인", "충돌", "덮어쓰기", "복구", "crdt", "hlc", "동기화"],
  },
  {
    id: "guide-rights-bom-gate", level: 5, stationId: "station-7-ship", frequency: "hidden-gem", category: "collab-export", atelierSuite: "KilnExport",
    titleKo: "Rights BOM 저작권 오염 차단 게이트", titleEn: "Rights BOM Commercial License Contamination Gate",
    plainOneLineKo: "원고에 들어간 모든 폰트·3D 배경·브러시·음원의 상업적 연재 가능 여부를 출고 직전에 전수 검사해 저작권 사고를 막습니다.", plainOneLineEn: "Audit every font, 3D prop, brush, and audio track for commercial rights clearance before export.",
    whenToUseKo: "유료 연재·단행본·외주 납품 직전에 비상업용(NC) 무료 소재나 만료된 폰트가 섞여 있지 않은지 확실히 걸러낼 때 씁니다.", whenToUseEn: "Must-run hidden gate before paid serialization, print runs, or client delivery.",
    steps: [
      step(1, "Rights BOM 전수 원장 열기", "Open Rights BOM Ledger", "Ctrl+Shift+B를 눌러 이 회차에 쓰인 폰트·3D·브러시·오디오 목록을 자동 수집합니다.", "Press Ctrl+Shift+B to auto-inventory every font, 3D asset, brush, and audio cue."),
      step(2, "오염(비상업/출처미상) 항목 차단 확인", "Review Blocked Assets", "빨간색 [상업 불가 · 출처 확인 필요] 배지가 뜬 소재를 클릭해 어느 컷에 쓰였는지 바로 이동합니다.", "Click any red non-commercial flag to jump straight to the exact cut using it."),
      step(3, "대체 소재 스왑 후 출고 잠금 해제", "Swap & Clear Export Gate", "CC0/상업 허용 대체 소재로 교체하면 Rights BOM 통과 영수증(JSON/PDF)이 발급됩니다.", "Replace flagged assets with cleared alternatives to issue your Rights BOM clearance receipt."),
    ],
    shortcut: "Ctrl+Shift+B", studioHref: "/studio/publish#rights-bom",
    commonMistakeKo: "팀원이 개인 PC에 깔아 둔 무료 폰트를 쓰면 내 기기에서는 보이지만 상업 연재 계약 위반이 될 수 있습니다. 출고 전 BOM 검사가 안전합니다.", commonMistakeEn: "Personal free fonts on a teammate's PC often forbid commercial comics; always clear BOM.",
    proTipKo: "출판사·플랫폼 담당자에게 Rights BOM 영수증을 함께 제출하면 검수 회신 속도가 빨라집니다.", proTipEn: "Attach the exported Rights BOM receipt to publisher deliveries to speed up legal review.",
    quickTooltipKo: "Ctrl+Shift+B로 원고 속 폰트·3D·브러시의 상업 라이선스를 전수 검사해 저작권 사고를 미리 막으세요.", quickTooltipEn: "Press Ctrl+Shift+B to catch non-commercial fonts or 3D assets before publishing.",
    relatedHiddenIds: ["guide-c2pa-human-merkle", "guide-hlc-crdt-offline-merge"], workContexts: ["team-export", "qa-check"],
    everydayIntents: ["저작권", "라이선스", "상업용", "폰트 괜찮을까", "무료 소재", "rights bom", "오염 차단", "납품"],
  },
  {
    id: "guide-c2pa-human-merkle", level: 5, stationId: "station-7-ship", frequency: "hidden-gem", category: "collab-export", atelierSuite: "KilnExport",
    titleKo: "C2PA 인간 작화 머클 검증 서명", titleEn: "C2PA Human-Authored Merkle Provenance Proof",
    plainOneLineKo: "작가가 직접 그은 획·필압·레이어 편집 이력을 암호화 머클 트리로 봉인해 사람이 그린 원고임을 객관적으로 증명합니다.", plainOneLineEn: "Seal real pen strokes, pressure telemetry, and layer history into a C2PA Merkle tree proving human authorship.",
    whenToUseKo: "공모전 제출, 플랫폼 원본 인증, AI 생성 오해 방지, 2차 판권 계약 시 내 창작 이력을 증빙할 때 결정적인 숨은 기능입니다.", whenToUseEn: "Decisive hidden proof for contests, platform authenticity checks, and IP licensing contracts.",
    steps: [
      step(1, "작화 이력 머클 체인 열기", "Open Provenance Merkle Chain", "Ctrl+Shift+K로 KilnExport C2PA 패널을 열어 이 회차의 인간 획 비율과 타임스탬프를 확인합니다.", "Press Ctrl+Shift+K to inspect recorded human stroke counts and timestamps."),
      step(2, "C2PA 서명 포함 출고 선택", "Attach C2PA Signature", "[C2PA 머클 매니페스트 삽입]을 켜면 PNG/JPG/MP4 메타데이터에 위변조 방지 해시가 결합됩니다.", "Enable Embed C2PA Merkle Manifest to bind tamper-evident hashes into exported files."),
      step(3, "독립 검증기로 진위 즉시 검증", "Verify Authenticity", "[검증 리포트 복사]를 눌러 외부 심사위원이 원본 변경 여부를 바로 확인할 수 있는 요약을 첨부합니다.", "Copy the verification summary so editors or judges can independently verify authenticity."),
    ],
    shortcut: "Ctrl+Shift+K", studioHref: "/studio/publish#c2pa-merkle",
    commonMistakeKo: "외부 메신저로 이미지를 재압축 전송하면 메타데이터가 벗겨질 수 있습니다. 원본 출고 파일과 별도 `.c2pa.json` 증빙을 함께 보관하세요.", commonMistakeEn: "Chat apps strip image metadata on recompression; archive the sidecar proof alongside the file.",
    proTipKo: "AI 보조 도구를 일부 쓴 경우에도 어느 레이어가 보조이고 어느 선화가 100% 수작업인지 투명하게 구분 기록됩니다.", proTipEn: "The manifest transparently separates 100% hand-inked layers from local assistive flat-fill layers.",
    quickTooltipKo: "Ctrl+Shift+K로 내 필압·선화 이력을 C2PA 머클 체인으로 서명해 인간 작화 진위를 증명하세요.", quickTooltipEn: "Press Ctrl+Shift+K to sign stroke history into a tamper-evident C2PA Merkle proof.",
    relatedHiddenIds: ["guide-rights-bom-gate", "guide-hlc-crdt-offline-merge"], workContexts: ["team-export"],
    everydayIntents: ["인간 작화 증명", "ai 아니라고 증명", "공모전 증빙", "c2pa", "머클", "원본 증명", "서명", "진위"],
  },
] as const;

export const MANUAL_WORK_CONTEXT_SPECS: readonly ManualWorkContextSpec[] = [
  { id: "first-open", labelKo: "처음 열었어요", labelEn: "Just Opened", situationKo: "첫 5분 안에 떨림 없는 선을 긋고 내 손에 맞게 환경을 맞춥니다.", situationEn: "Draw a clean first stroke and fit ergonomics in 5 minutes.", primaryGuideIds: ["guide-first-canvas-ink", "guide-layer-clipping-basics"], hiddenGemIds: ["guide-pchip-pressure-16k", "guide-handedness-mirror-0px"] },
  { id: "inking", labelKo: "선화·펜 터치 중", labelEn: "Inking Strokes", situationKo: "필압 피로를 줄이고 선 밖 번짐 없는 레이어 구조를 잡습니다.", situationEn: "Reduce wrist fatigue and lock ink layers cleanly.", primaryGuideIds: ["guide-pchip-pressure-16k", "guide-layer-clipping-basics", "guide-first-canvas-ink"], hiddenGemIds: ["guide-handedness-mirror-0px", "guide-pchip-pressure-16k"] },
  { id: "panel-lettering", labelKo: "컷·말풍선 작업 중", labelEn: "Panels & Lettering", situationKo: "스크롤 호흡, 음성 식자, 390px 폰 가독성을 한 번에 잡습니다.", situationEn: "Balance scroll gutters, voice balloons, and 390px phone readability.", primaryGuideIds: ["guide-panel-frame-split", "guide-voice-balloon-lettering", "guide-screentone-sfx-layer"], hiddenGemIds: ["guide-reader-phone-pip-390", "guide-rights-bom-gate"] },
  { id: "scene-3d", labelKo: "3D 배경·캐릭터 배치 중", labelEn: "3D Cast & Solid", situationKo: "포즈·화각·LT 선화와 벽 가림 없는 솔리드 단면을 다룹니다.", situationEn: "Pose cast figures, extract LT ink, and cutaway blocking walls.", primaryGuideIds: ["guide-atelier-cast-pose", "guide-bg3d-lt-lighting", "guide-atelier-cast-camera-prop"], hiddenGemIds: ["guide-atelier-solid-cutaway-gdt", "guide-reader-phone-pip-390"] },
  { id: "coloring-ai", labelKo: "채색·화풍 마감 중", labelEn: "Color & Style AI", situationKo: "온디바이스 AI 자동 밑색과 수채화 백런·광학 보정으로 마감합니다.", situationEn: "Accelerate flats on-device and craft watercolor backrun finishes.", primaryGuideIds: ["guide-ondevice-ai-flat-color", "guide-watercolor-backrun-capillary"], hiddenGemIds: ["guide-watercolor-backrun-capillary", "guide-color-vision-readability"] },
  { id: "qa-check", labelKo: "마감 전 품질 검수 중", labelEn: "Pre-Ship QA", situationKo: "작화 붕괴, 색각 가독성, 390px 폰뷰를 3분 안에 전수 확인합니다.", situationEn: "Verify continuity, color-vision contrast, and 390px readability.", primaryGuideIds: ["guide-continuity-qa-guard", "guide-reader-phone-pip-390", "guide-color-vision-readability"], hiddenGemIds: ["guide-color-vision-readability", "guide-rights-bom-gate"] },
  { id: "team-export", labelKo: "팀 협업·최종 출고 중", labelEn: "Team & Export", situationKo: "오프라인 충돌 병합, 저작권 BOM 차단, C2PA 서명, 4K 출고를 마칩니다.", situationEn: "Merge offline sync, pass Rights BOM, sign C2PA, and export 4K.", primaryGuideIds: ["guide-atelier-stage-webcodecs-4k", "guide-rights-bom-gate", "guide-c2pa-human-merkle"], hiddenGemIds: ["guide-hlc-crdt-offline-merge", "guide-rights-bom-gate", "guide-c2pa-human-merkle"] },
] as const;

export const EVERYDAY_QUICK_SEARCH_CHIPS: readonly { readonly queryKo: string; readonly queryEn: string }[] = [
  { queryKo: "손이 떨려요", queryEn: "pressure curve" }, { queryKo: "왼손잡이", queryEn: "left handed" },
  { queryKo: "폰에서 글자", queryEn: "390px phone" }, { queryKo: "수채화 테두리", queryEn: "watercolor backrun" },
  { queryKo: "벽 가림 단면", queryEn: "cutaway GD&T" }, { queryKo: "저작권 괜찮을까", queryEn: "Rights BOM" },
  { queryKo: "와이파이 끊김", queryEn: "offline merge" },
] as const;

const GUIDE_BY_ID: Readonly<Record<string, StudioFeatureGuide>> =
  STUDIO_COMPLETE_FEATURE_GUIDES.reduce((acc, g) => { acc[g.id] = g; return acc; }, {} as Record<string, StudioFeatureGuide>);
const CONTEXT_BY_ID: Readonly<Record<ManualWorkContext, ManualWorkContextSpec>> =
  MANUAL_WORK_CONTEXT_SPECS.reduce((acc, s) => { acc[s.id] = s; return acc; }, {} as Record<ManualWorkContext, ManualWorkContextSpec>);

export function getManualGuideById(id: string): StudioFeatureGuide | undefined { return GUIDE_BY_ID[id]; }
export function getGuidesForStation(stationId: StudioJourneyStationId): readonly StudioFeatureGuide[] {
  return STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.stationId === stationId);
}
export function getRelatedHiddenGuides(guideId: string): readonly StudioFeatureGuide[] {
  const guide = GUIDE_BY_ID[guideId];
  if (!guide) return [];
  return guide.relatedHiddenIds.map((id) => GUIDE_BY_ID[id]).filter((t): t is StudioFeatureGuide => Boolean(t && t.frequency === "hidden-gem" && t.id !== guide.id));
}

function matchesFilters(guide: StudioFeatureGuide, filters?: ManualSearchFilters): boolean {
  if (!filters) return true;
  if (filters.level && filters.level !== "all" && guide.level !== filters.level) return false;
  if (filters.frequency && filters.frequency !== "all" && guide.frequency !== filters.frequency) return false;
  if (filters.stationId && filters.stationId !== "all" && guide.stationId !== filters.stationId) return false;
  if (filters.category && filters.category !== "all" && guide.category !== filters.category) return false;
  return true;
}

/** 일상어 의도 · 단축키 · 제목 · 상세 단계 통합 매뉴얼 검색기. */
export function searchManualGuides(query: string, filters?: ManualSearchFilters): readonly ManualSearchHit[] {
  const candidates = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => matchesFilters(g, filters));
  const normalized = query.trim().toLowerCase().replace(/\s+/gu, " ");
  if (!normalized) return candidates.map((guide) => ({ guide, score: 1, matchedBy: "catalog", matchedTerms: [] }));

  const tokens = normalized.split(/[\s,/·]+/u).map((t) => t.trim()).filter((t) => t.length > 0);
  const hits: ManualSearchHit[] = [];

  for (const guide of candidates) {
    const shortcutLower = guide.shortcut.toLowerCase();
    const titleBlob = `${guide.titleKo} ${guide.titleEn} ${guide.atelierSuite}`.toLowerCase();
    const intentList = guide.everydayIntents.map((item) => item.toLowerCase());
    const detailBlob = [
      guide.plainOneLineKo, guide.plainOneLineEn, guide.whenToUseKo, guide.whenToUseEn,
      guide.commonMistakeKo, guide.commonMistakeEn, guide.proTipKo, guide.proTipEn,
      guide.quickTooltipKo, guide.quickTooltipEn,
      ...guide.steps.flatMap((s) => [s.titleKo, s.titleEn, s.actionKo, s.actionEn]),
    ].join(" ").toLowerCase();

    let score = 0;
    let matchedBy: ManualSearchMatchKind = "guide-detail";
    const matchedTerms = new Set<string>();

    if (shortcutLower === normalized || shortcutLower.split("/").some((s) => s.trim() === normalized)) {
      score += 220; matchedBy = "shortcut"; matchedTerms.add(guide.shortcut);
    } else if (shortcutLower.includes(normalized) && normalized.length >= 2) {
      score += 75; matchedBy = "shortcut"; matchedTerms.add(guide.shortcut);
    }

    const allowSubstring = normalized.length >= 2 || /[\uAC00-\uD7A3]/u.test(normalized);
    for (const intent of intentList) {
      if (intent === normalized) { score += 100; if (matchedBy !== "shortcut") matchedBy = "everyday-intent"; matchedTerms.add(intent); }
      else if (allowSubstring && (intent.includes(normalized) || (intent.length >= 2 && normalized.includes(intent)))) {
        score += 60; if (matchedBy !== "shortcut") matchedBy = "everyday-intent"; matchedTerms.add(intent);
      }
    }

    if (allowSubstring && titleBlob.includes(normalized)) {
      score += 80; if (matchedBy === "guide-detail") matchedBy = "title"; matchedTerms.add(normalized);
    }

    let tokenHits = 0;
    for (const tok of tokens) {
      const tokSub = tok.length >= 2 || /[\uAC00-\uD7A3]/u.test(tok);
      let hitThis = false;
      if (tokSub && intentList.some((intent) => intent.includes(tok) || (intent.length >= 2 && tok.includes(intent)))) {
        score += 36; if (matchedBy === "guide-detail") matchedBy = "everyday-intent"; matchedTerms.add(tok); hitThis = true;
      }
      if (tokSub && titleBlob.includes(tok)) { score += 28; if (matchedBy === "guide-detail") matchedBy = "title"; matchedTerms.add(tok); hitThis = true; }
      if (tokSub && detailBlob.includes(tok)) { score += 14; matchedTerms.add(tok); hitThis = true; }
      if (hitThis) tokenHits += 1;
    }

    if (tokens.length > 1 && tokenHits === tokens.length) score += 24;
    if (score > 0) hits.push({ guide, score, matchedBy, matchedTerms: [...matchedTerms] });
  }
  return hits.sort((a, b) => b.score - a.score || a.guide.level - b.guide.level);
}

/** 현재 작업 컨텍스트 + 완료 이력 기반 다음 추천 기능 & 5초 `?` 툴팁 코치. */
export function recommendNextGuideForContext(input: ContextCoachInput): ManualContextRecommendation {
  const spec = CONTEXT_BY_ID[input.currentContext] ?? CONTEXT_BY_ID["first-open"];
  const completedSet = new Set(input.completedGuideIds ?? []);
  const primaryCandidates = spec.primaryGuideIds.map((id) => GUIDE_BY_ID[id]).filter((g): g is StudioFeatureGuide => Boolean(g));
  const hiddenCandidates = spec.hiddenGemIds.map((id) => GUIDE_BY_ID[id]).filter((g): g is StudioFeatureGuide => Boolean(g));

  const uncompletedPrimary = primaryCandidates.find((g) => !completedSet.has(g.id));
  const uncompletedHidden =
    hiddenCandidates.find((g) => !completedSet.has(g.id)) ??
    STUDIO_COMPLETE_FEATURE_GUIDES.find((g) => g.frequency === "hidden-gem" && !completedSet.has(g.id)) ??
    hiddenCandidates[0] ?? STUDIO_COMPLETE_FEATURE_GUIDES[0];
  const fallbackAny = STUDIO_COMPLETE_FEATURE_GUIDES.find(
    (g) => !completedSet.has(g.id) && (input.currentLevel === undefined || g.level >= input.currentLevel),
  );
  const allContextCleared = !uncompletedPrimary && hiddenCandidates.every((g) => completedSet.has(g.id));
  const primaryGuide = input.preferHiddenGem
    ? uncompletedHidden
    : (uncompletedPrimary ?? fallbackAny ?? primaryCandidates[0] ?? STUDIO_COMPLETE_FEATURE_GUIDES[0]);
  const hiddenGemGuide =
    uncompletedHidden.id === primaryGuide.id
      ? (hiddenCandidates.find((g) => g.id !== primaryGuide.id) ??
        STUDIO_COMPLETE_FEATURE_GUIDES.find((g) => g.frequency === "hidden-gem" && g.id !== primaryGuide.id) ?? uncompletedHidden)
      : uncompletedHidden;

  return {
    context: spec.id, primaryGuide, hiddenGemGuide, allContextCleared,
    tooltip5sKo: primaryGuide.quickTooltipKo, tooltip5sEn: primaryGuide.quickTooltipEn,
    rationaleKo: allContextCleared
      ? `${spec.labelKo} 단계의 핵심·숨은 기능을 모두 실습했습니다. 다음 추천 기능으로 숙련도를 넓혀 보세요.`
      : `${spec.situationKo} 지금 바로 [${primaryGuide.titleKo}] (${primaryGuide.shortcut})를 익히면 작업 속도가 크게 올라갑니다.`,
    rationaleEn: allContextCleared
      ? `You have practiced every guide in "${spec.labelEn}". Continue with the next skill to expand mastery.`
      : `${spec.situationEn} Learning "${primaryGuide.titleEn}" (${primaryGuide.shortcut}) next gives the highest immediate payoff.`,
  };
}

/** 20종 전수 가이드 학습 진도율 · 랭크 · 배지 계산기. */
export function computeMasteryProgress(completedGuideIds: readonly string[]): ManualMasteryProgress {
  const validSet = new Set<string>();
  for (const id of completedGuideIds) { if (GUIDE_BY_ID[id]) validSet.add(id); }
  const validCompletedIds = [...validSet];
  const totalGuides = STUDIO_COMPLETE_FEATURE_GUIDES.length;
  const completedCount = validCompletedIds.length;
  const overallPercent = totalGuides > 0 ? Math.round((completedCount / totalGuides) * 100) : 0;

  const dailyGuides = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.frequency === "daily");
  const weeklyGuides = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.frequency === "weekly");
  const hiddenGuides = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.frequency === "hidden-gem");

  const dailyCompleted = dailyGuides.filter((g) => validSet.has(g.id)).length;
  const weeklyCompleted = weeklyGuides.filter((g) => validSet.has(g.id)).length;
  const hiddenGemCompleted = hiddenGuides.filter((g) => validSet.has(g.id)).length;
  const hiddenGemTotal = hiddenGuides.length;
  const hiddenGemPercent = hiddenGemTotal > 0 ? Math.round((hiddenGemCompleted / hiddenGemTotal) * 100) : 0;

  const byLevel: ManualLevelProgress[] = LEARNING_LEVEL_ROADMAP.map((lv) => {
    const items = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.level === lv.level);
    const done = items.filter((g) => validSet.has(g.id)).length;
    const total = items.length;
    return {
      level: lv.level, code: lv.code, titleKo: lv.titleKo, titleEn: lv.titleEn,
      completed: done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0, isCleared: total > 0 && done === total,
    };
  });

  const currentRank: ManualMasteryRank =
    completedCount >= totalGuides
      ? { rankId: "grandmaster", titleKo: "AtelierGuide 그랜드마스터", titleEn: "AtelierGuide Grandmaster", nextMilestoneKo: "20종 전수 기능과 9종 숨은 기능을 모두 정복했습니다.", nextMilestoneEn: "Mastered all 20 features and all 9 hidden pro gems." }
      : completedCount >= 14
        ? { rankId: "style-auditor", titleKo: "화풍·검수 프로 작가", titleEn: "Style & QA Pro", nextMilestoneKo: `그랜드마스터까지 ${totalGuides - completedCount}개 남았습니다.`, nextMilestoneEn: `${totalGuides - completedCount} guides remaining to Grandmaster.` }
        : completedCount >= 9
          ? { rankId: "spatial-builder", titleKo: "3D 아틀리에 제작자", titleEn: "3D Atelier Builder", nextMilestoneKo: `프로 작가 랭크까지 ${14 - completedCount}개 남았습니다.`, nextMilestoneEn: `${14 - completedCount} guides to Style & QA Pro.` }
          : completedCount >= 4
            ? { rankId: "cut-finisher", titleKo: "웹툰 1컷 완주자", titleEn: "First-Cut Finisher", nextMilestoneKo: `3D 아틀리에 제작자까지 ${9 - completedCount}개 남았습니다.`, nextMilestoneEn: `${9 - completedCount} guides to 3D Atelier Builder.` }
            : { rankId: "novice", titleKo: "입문 견습생", titleEn: "Atelier Apprentice", nextMilestoneKo: `웹툰 1컷 완주자까지 ${4 - completedCount}개 남았습니다.`, nextMilestoneEn: `${4 - completedCount} guides to First-Cut Finisher.` };

  const unlockedBadges: ManualMasteryBadge[] = [];
  if (completedCount >= 1) unlockedBadges.push({ id: "badge-first-stroke", titleKo: "첫 따라하기 완료", titleEn: "First Practice Clear", summaryKo: "첫 기능을 직접 실습했습니다.", summaryEn: "Completed your first guided studio practice." });
  for (const lv of byLevel) {
    if (lv.isCleared) unlockedBadges.push({ id: `badge-lv${lv.level}-clear`, titleKo: `${lv.code} 완주`, titleEn: `${lv.code} Cleared`, summaryKo: `${lv.titleKo} 전 과정을 마쳤습니다.`, summaryEn: `Completed all guides in ${lv.titleEn}.` });
  }
  if (hiddenGemCompleted >= 3) unlockedBadges.push({ id: "badge-hidden-scout", titleKo: "숨은 기능 탐험가", titleEn: "Hidden-Gem Explorer", summaryKo: "자주 안 쓰는 프로 숨은 기능 3종 이상을 익혔습니다.", summaryEn: "Practiced 3 or more hidden pro features." });
  if (hiddenGemCompleted >= hiddenGemTotal && hiddenGemTotal > 0) unlockedBadges.push({ id: "badge-hidden-master", titleKo: "숨은 기능 9종 정복", titleEn: "Hidden-Gem Master", summaryKo: "숨은 프로 기능 9종을 빠짐없이 마스터했습니다.", summaryEn: "Mastered all 9 hidden pro studio features." });
  if (completedCount >= totalGuides) unlockedBadges.push({ id: "badge-complete-20", titleKo: "전수 20종 완전 정복", titleEn: "All 20 Features Cleared", summaryKo: "입문부터 4K 출고까지 전 과정을 완료했습니다.", summaryEn: "Completed the full 0-to-Pro AtelierGuide curriculum." });

  return {
    totalGuides, completedCount, overallPercent, hiddenGemTotal, hiddenGemCompleted, hiddenGemPercent,
    byFrequency: {
      daily: { completed: dailyCompleted, total: dailyGuides.length },
      weekly: { completed: weeklyCompleted, total: weeklyGuides.length },
      hiddenGem: { completed: hiddenGemCompleted, total: hiddenGemTotal },
    },
    byLevel, currentRank, unlockedBadges, validCompletedIds,
  };
}

/** 현재 진도·검색 결과·컨텍스트 추천을 포함한 인터랙티브 매뉴얼 JSON 내보내기. */
export function exportInteractiveManualJson(options?: InteractiveManualExportOptions): InteractiveManualExportBundle {
  const completedGuideIds = options?.completedGuideIds ?? [];
  const currentContext = options?.currentContext ?? "first-open";
  const query = options?.query ?? "";
  const progress = computeMasteryProgress(completedGuideIds);
  const contextRecommendation = recommendNextGuideForContext({ currentContext, completedGuideIds: progress.validCompletedIds });
  const filteredHits = searchManualGuides(query, options?.filters);

  const payload: InteractiveManualExportPayload = {
    schemaVersion: ATELIER_MANUAL_SCHEMA_VERSION, brandName: ATELIER_MANUAL_BRAND_NAME, updatedAt: ATELIER_MANUAL_UPDATED_AT,
    totalLevels: LEARNING_LEVEL_ROADMAP.length, totalStations: STUDIO_JOURNEY_SUBWAY_STATIONS.length,
    totalGuides: STUDIO_COMPLETE_FEATURE_GUIDES.length, hiddenGemCount: progress.hiddenGemTotal,
    progress, contextRecommendation, filteredGuideIds: filteredHits.map((hit) => hit.guide.id),
    levels: LEARNING_LEVEL_ROADMAP, stations: STUDIO_JOURNEY_SUBWAY_STATIONS, guides: STUDIO_COMPLETE_FEATURE_GUIDES,
  };

  return { payload, json: JSON.stringify(payload, null, 2) };
}
