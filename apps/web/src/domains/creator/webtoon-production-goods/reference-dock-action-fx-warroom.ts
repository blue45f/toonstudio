/**
 * 웹툰 현업 제작 엔진:
 * 1) 캐릭터 턴어라운드 & 표정·팔레트 자동 추종 도크 (`resolveCutCharacterReferenceDock`)
 * 2) 액션·판타지 물리 궤적 이펙트 생성기 (`generateActionTrajectoryVfx`)
 * 3) 60컷 연재 마감 워룸 병목 분석 & 어시스턴트 원클릭 배분 (`analyzeDeadlineWarRoom`, `autoAssignBottleneckCuts`)
 * 색상은 전수 OKLCH 토큰만 사용하며(raw color 금지), 브라우저 스토리지에 의존하지 않는다.
 */

export type TurnaroundAngle = "front" | "side" | "back";
export type ExpressionPresetId = "neutral" | "smile" | "angry" | "shocked" | "tearful" | "smirk";
export type CutLightingMood = "daylight" | "sunset" | "night-cool" | "indoor-warm";
export type SwatchRole = "skin-base" | "skin-shadow" | "hair-base" | "hair-highlight" | "outfit-primary" | "outfit-accent" | "eye-iris";
export type DockMatchReason = "id-match" | "tag-match" | "script-mention";
export type ActionTrajectoryVfxKind = "sword-arc" | "flame-ribbon" | "water-splash" | "impact-shatter";
export type ProductionStageId = "lineart" | "flatting" | "shading" | "background" | "lettering";
export type CutComplexity = "simple" | "standard" | "action-heavy";

export interface TurnaroundSlot {
  readonly angle: TurnaroundAngle; readonly labelKo: string; readonly labelEn: string;
  readonly silhouetteCueKo: string; readonly silhouetteCueEn: string;
  readonly eyeLineRatio: number; readonly shoulderRatio: number;
}

export interface ExpressionPreset {
  readonly id: ExpressionPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly browTiltDeg: number; readonly eyeOpenRatio: number; readonly mouthCurve: number;
  readonly drawingCueKo: string; readonly drawingCueEn: string;
}

export interface CharacterPaletteSwatch {
  readonly role: SwatchRole; readonly labelKo: string; readonly labelEn: string; readonly oklch: string;
}

export interface ResolvedPaletteSwatch extends CharacterPaletteSwatch {
  readonly lightingAdjustedOklch: string;
}

export type SixExpressionPresets = readonly [
  ExpressionPreset, ExpressionPreset, ExpressionPreset,
  ExpressionPreset, ExpressionPreset, ExpressionPreset,
];

export interface CharacterReferenceSheet {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly roleTagKo: string; readonly roleTagEn: string; readonly tags: readonly string[];
  readonly heightCm: number; readonly headBodyRatio: number;
  readonly silhouetteNoteKo: string; readonly silhouetteNoteEn: string;
  readonly defaultExpression: ExpressionPresetId;
  readonly turnarounds: readonly [TurnaroundSlot, TurnaroundSlot, TurnaroundSlot];
  readonly expressions: SixExpressionPresets;
  readonly swatches: readonly CharacterPaletteSwatch[];
}

export interface CutReferenceContext {
  readonly cutId: string; readonly cutNumber: number;
  readonly sceneTitleKo: string; readonly sceneTitleEn: string;
  readonly characterIds?: readonly string[]; readonly tags?: readonly string[];
  readonly dialogueOrMemo?: string; readonly lightingMood?: CutLightingMood;
  readonly preferredExpression?: ExpressionPresetId;
}

export interface ResolvedCharacterDockEntry {
  readonly character: CharacterReferenceSheet; readonly matchReason: DockMatchReason;
  readonly matchedTokens: readonly string[]; readonly recommendedExpressionId: ExpressionPresetId;
  readonly turnarounds: readonly [TurnaroundSlot, TurnaroundSlot, TurnaroundSlot];
  readonly expressions: SixExpressionPresets; readonly swatches: readonly ResolvedPaletteSwatch[];
}

export interface CharacterReferenceDockResult {
  readonly cutId: string; readonly cutNumber: number; readonly lightingMood: CutLightingMood;
  readonly matchedCharacters: readonly ResolvedCharacterDockEntry[];
  readonly primaryCharacter: ResolvedCharacterDockEntry | null;
  readonly unmatchedIds: readonly string[];
  readonly syncSummaryKo: string; readonly syncSummaryEn: string;
}

export interface Point2D { readonly x: number; readonly y: number; }
export interface TrajectoryPoint extends Point2D { readonly pressure?: number; }

export interface ActionTrajectoryVfxInput {
  readonly kind: ActionTrajectoryVfxKind; readonly points: readonly TrajectoryPoint[];
  readonly baseWidthPx?: number; readonly perspectiveTaper?: number; readonly intensity?: number;
  readonly seed?: number; readonly canvasWidth?: number; readonly canvasHeight?: number;
}

export interface VfxSpeedLine {
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly strokeWidth: number; readonly opacity: number;
}

export interface ActionTrajectoryVfxPalette {
  readonly primaryOklch: string; readonly coreOklch: string;
  readonly accentOklch: string; readonly speedLineOklch: string;
}

export interface ActionTrajectoryVfxMetrics {
  readonly arcLengthPx: number; readonly peakWidthPx: number; readonly minWidthPx: number;
  readonly polygonCount: number; readonly debrisCount: number; readonly speedLineCount: number;
  readonly peakAccelerationRatio: number;
}

export interface ActionTrajectoryVfxResult {
  readonly kind: ActionTrajectoryVfxKind; readonly labelKo: string; readonly labelEn: string;
  readonly seed: number; readonly viewBox: string; readonly palette: ActionTrajectoryVfxPalette;
  readonly primaryPolygons: readonly (readonly Point2D[])[];
  readonly corePolygons: readonly (readonly Point2D[])[];
  readonly debrisPolygons: readonly (readonly Point2D[])[];
  readonly speedLines: readonly VfxSpeedLine[];
  readonly metrics: ActionTrajectoryVfxMetrics; readonly svg: string;
}

export interface WarRoomCutRecord {
  readonly cutId: string; readonly cutNumber: number; readonly complexity: CutComplexity;
  readonly stageProgress: Readonly<Record<ProductionStageId, number>>;
  readonly assignedByStage: Readonly<Partial<Record<ProductionStageId, string>>>;
}

export interface WarRoomAssistant {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly specialties: readonly ProductionStageId[];
  readonly availableHours: number; readonly speedFactor?: number;
}

export interface DeadlineWarRoomInput {
  readonly episodeLabel: string; readonly hoursUntilDeadline: number;
  readonly cuts: readonly WarRoomCutRecord[]; readonly assistants: readonly WarRoomAssistant[];
}

export interface StageBottleneckSummary {
  readonly stageId: ProductionStageId; readonly labelKo: string; readonly labelEn: string;
  readonly completedCuts: number; readonly inProgressCuts: number; readonly notStartedCuts: number;
  readonly completionPct: number; readonly remainingWorkHours: number;
  readonly specialistAvailableHours: number; readonly capacityGapHours: number;
  readonly bottleneckScore: number; readonly status: "on-track" | "watch" | "bottleneck";
}

export interface WarRoomDelayedCut {
  readonly cutId: string; readonly cutNumber: number; readonly complexity: CutComplexity;
  readonly blockingStage: ProductionStageId; readonly completionPct: number;
  readonly remainingHours: number; readonly urgencyScore: number;
  readonly reasonKo: string; readonly reasonEn: string;
}

export interface DeadlineWarRoomAnalysis {
  readonly episodeLabel: string; readonly hoursUntilDeadline: number;
  readonly totalCuts: number; readonly fullyCompletedCuts: number; readonly overallProgressPct: number;
  readonly totalRemainingHours: number; readonly totalTeamAvailableHours: number;
  readonly projectedDeficitHours: number; readonly estimatedFinishHours: number;
  readonly deadlineRisk: "safe" | "tight" | "critical";
  readonly stageSummaries: readonly StageBottleneckSummary[];
  readonly primaryBottleneckStage: StageBottleneckSummary | null;
  readonly delayedCuts: readonly WarRoomDelayedCut[];
}

export interface CutStageAssignment {
  readonly cutId: string; readonly cutNumber: number; readonly stageId: ProductionStageId;
  readonly previousAssistantId: string | null; readonly assignedAssistantId: string;
  readonly estimatedHours: number; readonly isCrossSkill: boolean;
  readonly reasonKo: string; readonly reasonEn: string;
}

export interface AssistantWorkloadSummary {
  readonly assistantId: string; readonly nameKo: string; readonly nameEn: string;
  readonly availableHours: number; readonly assignedHours: number;
  readonly utilizationPct: number; readonly assignedTaskCount: number;
}

export interface WarRoomAssignmentPlan {
  readonly beforeAnalysis: DeadlineWarRoomAnalysis;
  readonly assignments: readonly CutStageAssignment[];
  readonly updatedCuts: readonly WarRoomCutRecord[];
  readonly assistantLoads: readonly AssistantWorkloadSummary[];
  readonly loadBalanceSpreadPct: number;
  readonly unassignedOverflowTasks: readonly { readonly cutId: string; readonly stageId: ProductionStageId; readonly remainingHours: number }[];
  readonly summaryKo: string; readonly summaryEn: string;
}

export const PRODUCTION_STAGES: readonly {
  readonly id: ProductionStageId; readonly labelKo: string; readonly labelEn: string;
  readonly baseHoursPerCut: number; readonly downstreamWeight: number;
}[] = [
  { id: "lineart", labelKo: "선화", labelEn: "Lineart", baseHoursPerCut: 0.42, downstreamWeight: 1.45 },
  { id: "flatting", labelKo: "밑색", labelEn: "Flatting", baseHoursPerCut: 0.24, downstreamWeight: 1.25 },
  { id: "shading", labelKo: "명암", labelEn: "Shading", baseHoursPerCut: 0.34, downstreamWeight: 1.15 },
  { id: "background", labelKo: "배경", labelEn: "Background", baseHoursPerCut: 0.38, downstreamWeight: 1.05 },
  { id: "lettering", labelKo: "식자", labelEn: "Lettering", baseHoursPerCut: 0.16, downstreamWeight: 0.9 },
];

const COMPLEXITY_MULTIPLIER: Readonly<Record<CutComplexity, number>> = { simple: 0.72, standard: 1.0, "action-heavy": 1.52 };

const EXPRESSION_TEMPLATE: SixExpressionPresets = [
  { id: "neutral", labelKo: "기본", labelEn: "Neutral", browTiltDeg: 0, eyeOpenRatio: 0.82, mouthCurve: 0, drawingCueKo: "눈썹 수평, 동공 상단 15% 가림, 입꼬리 수평", drawingCueEn: "Level brows, upper 15% iris covered, neutral mouth" },
  { id: "smile", labelKo: "미소", labelEn: "Warm Smile", browTiltDeg: -6, eyeOpenRatio: 0.68, mouthCurve: 0.72, drawingCueKo: "눈꼬리 완만한 호, 하안검 상승, 뺨 하이라이트", drawingCueEn: "Soft curved lower lids, lifted cheeks, relaxed brows" },
  { id: "angry", labelKo: "분노", labelEn: "Fierce Anger", browTiltDeg: 18, eyeOpenRatio: 0.94, mouthCurve: -0.68, drawingCueKo: "미간 주름 2선 강조, 동공 수축, 하악 긴장선", drawingCueEn: "Sharp brow furrow, tightened iris, tense jawline" },
  { id: "shocked", labelKo: "경악", labelEn: "Shocked", browTiltDeg: -14, eyeOpenRatio: 1.0, mouthCurve: -0.42, drawingCueKo: "상안검 최고점 개방, 점 동공, 안면 세로 음영", drawingCueEn: "Wide open lids, pinpoint iris, vertical face shadow" },
  { id: "tearful", labelKo: "눈물", labelEn: "Tearful", browTiltDeg: -16, eyeOpenRatio: 0.76, mouthCurve: -0.5, drawingCueKo: "눈썹 안쪽 상향, 하안검 눈물 하이라이트 2점", drawingCueEn: "Upturned inner brows, twin lower-lid tear speculars" },
  { id: "smirk", labelKo: "자신감", labelEn: "Confident Smirk", browTiltDeg: 8, eyeOpenRatio: 0.72, mouthCurve: 0.48, drawingCueKo: "한쪽 눈썹 4도 상향, 비대칭 입꼬리, 사선 시선", drawingCueEn: "Asymmetric raised brow and corner smile, sidelong gaze" },
];

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

function makeTurnarounds(fKo: string, fEn: string, sKo: string, sEn: string, bKo: string, bEn: string, sh: number): readonly [TurnaroundSlot, TurnaroundSlot, TurnaroundSlot] {
  return [
    { angle: "front", labelKo: "정면", labelEn: "Front", silhouetteCueKo: fKo, silhouetteCueEn: fEn, eyeLineRatio: 0.48, shoulderRatio: sh },
    { angle: "side", labelKo: "측면", labelEn: "Side", silhouetteCueKo: sKo, silhouetteCueEn: sEn, eyeLineRatio: 0.48, shoulderRatio: round2(sh * 0.54) },
    { angle: "back", labelKo: "후면", labelEn: "Back", silhouetteCueKo: bKo, silhouetteCueEn: bEn, eyeLineRatio: 0.48, shoulderRatio: sh },
  ];
}

export const DEFAULT_CHARACTER_REFERENCE_LIBRARY: readonly CharacterReferenceSheet[] = [
  {
    id: "char-seoyeon", nameKo: "강서연", nameEn: "Kang Seoyeon", roleTagKo: "주인공 · 은월 검객", roleTagEn: "Lead · Silver-Moon Swordsman",
    tags: ["강서연", "서연", "seoyeon", "검객", "heroine", "주인공"], heightCm: 169, headBodyRatio: 7.4, defaultExpression: "angry",
    silhouetteNoteKo: "하이 포니테일 3갈래, 비대칭 좌측 어깨 망토, 은장 장검", silhouetteNoteEn: "3-tip high ponytail, asymmetric left cloak, silver-hilt blade",
    turnarounds: makeTurnarounds("좌측 칼집 스트랩 대각선, 앞머리 중앙 1가닥", "Diagonal left scabbard strap, single bangs lock", "콧대 직선, 포니테일 후두부 상단 15도", "Straight nose bridge, ponytail 15deg above occiput", "등 중앙 은월 자수, 허리띠 이중 매듭", "Silver-moon back crest, double sash knot", 1.68),
    expressions: EXPRESSION_TEMPLATE,
    swatches: [
      { role: "skin-base", labelKo: "피부 기본", labelEn: "Skin Base", oklch: "oklch(0.89 0.038 58)" },
      { role: "skin-shadow", labelKo: "피부 명암", labelEn: "Skin Shadow", oklch: "oklch(0.77 0.058 46)" },
      { role: "hair-base", labelKo: "은청 머리", labelEn: "Silver Hair", oklch: "oklch(0.78 0.042 246)" },
      { role: "hair-highlight", labelKo: "머리 광택", labelEn: "Hair Specular", oklch: "oklch(0.93 0.024 238)" },
      { role: "outfit-primary", labelKo: "감색 검복", labelEn: "Indigo Coat", oklch: "oklch(0.28 0.055 258)" },
      { role: "outfit-accent", labelKo: "주홍 허리끈", labelEn: "Persimmon Sash", oklch: "oklch(0.62 0.19 36)" },
      { role: "eye-iris", labelKo: "호박 홍채", labelEn: "Amber Iris", oklch: "oklch(0.69 0.16 74)" },
    ],
  },
  {
    id: "char-doyun", nameKo: "한도윤", nameEn: "Han Doyun", roleTagKo: "조력자 · 화염 서기관", roleTagEn: "Ally · Flame Archivist",
    tags: ["한도윤", "도윤", "doyun", "화염", "마도사", "조력자"], heightCm: 183, headBodyRatio: 7.8, defaultExpression: "smirk",
    silhouetteNoteKo: "웨이브 흑갈 단발, 오른손 방염 장갑, 동판 아티팩트 벨트", silhouetteNoteEn: "Wavy espresso hair, fireproof right glove, brass relic belt",
    turnarounds: makeTurnarounds("깃 높은 코트 칼라, 좌측 흉부 동판 브로치", "High coat collar, left-chest brass brooch", "각진 턱선, 목 뒤 머리카락 2단 뻗침", "Angular jawline, two-tier nape hair flips", "롱코트 중앙 트임, 우측 탄띠 대각선", "Center coat vent, diagonal right pouch belt", 1.92),
    expressions: EXPRESSION_TEMPLATE,
    swatches: [
      { role: "skin-base", labelKo: "피부 기본", labelEn: "Skin Base", oklch: "oklch(0.84 0.048 56)" },
      { role: "skin-shadow", labelKo: "피부 명암", labelEn: "Skin Shadow", oklch: "oklch(0.71 0.068 42)" },
      { role: "hair-base", labelKo: "흑갈 머리", labelEn: "Espresso Hair", oklch: "oklch(0.24 0.032 48)" },
      { role: "hair-highlight", labelKo: "머리 반사광", labelEn: "Hair Highlight", oklch: "oklch(0.45 0.065 52)" },
      { role: "outfit-primary", labelKo: "차콜 롱코트", labelEn: "Charcoal Coat", oklch: "oklch(0.32 0.018 72)" },
      { role: "outfit-accent", labelKo: "화염 동판", labelEn: "Flame Brass", oklch: "oklch(0.72 0.16 68)" },
      { role: "eye-iris", labelKo: "적동 홍채", labelEn: "Copper Iris", oklch: "oklch(0.58 0.17 34)" },
    ],
  },
  {
    id: "char-harin", nameKo: "윤하린", nameEn: "Yoon Harin", roleTagKo: "라이벌 · 수경 전략가", roleTagEn: "Rival · Hydro Strategist",
    tags: ["윤하린", "하린", "harin", "라이벌", "전략가", "수경"], heightCm: 174, headBodyRatio: 7.6, defaultExpression: "neutral",
    silhouetteNoteKo: "칼단발 보브컷, 무테 모노클, 청록 실크 숄", silhouetteNoteEn: "Sharp bob cut, rimless monocle, teal silk shawl",
    turnarounds: makeTurnarounds("좌우 대칭 칼단발 턱선 정렬, 좌안 모노클 체인", "Symmetrical chin bob, left monocle chain", "수직 목선, 숄 매듭 쇄골 아래 3cm", "Vertical neck, shawl clasp 3cm below clavicle", "숄 삼각 드레이프, 후면 단발 일자 컷", "Triangular shawl drape, straight bob back", 1.74),
    expressions: EXPRESSION_TEMPLATE,
    swatches: [
      { role: "skin-base", labelKo: "피부 기본", labelEn: "Skin Base", oklch: "oklch(0.91 0.028 62)" },
      { role: "skin-shadow", labelKo: "피부 명암", labelEn: "Skin Shadow", oklch: "oklch(0.79 0.044 252)" },
      { role: "hair-base", labelKo: "먹남 보브컷", labelEn: "Ink-Navy Hair", oklch: "oklch(0.22 0.045 256)" },
      { role: "hair-highlight", labelKo: "청백 림라이트", labelEn: "Ice Rimlight", oklch: "oklch(0.68 0.075 232)" },
      { role: "outfit-primary", labelKo: "상아 제복", labelEn: "Ivory Uniform", oklch: "oklch(0.92 0.014 86)" },
      { role: "outfit-accent", labelKo: "청록 숄", labelEn: "Teal Shawl", oklch: "oklch(0.54 0.12 214)" },
      { role: "eye-iris", labelKo: "빙청 홍채", labelEn: "Glacier Iris", oklch: "oklch(0.71 0.11 228)" },
    ],
  },
];

export const DEFAULT_CUT_REFERENCE_CONTEXTS: readonly CutReferenceContext[] = [
  { cutId: "EP24-CUT-14", cutNumber: 14, sceneTitleKo: "붉은 다리 위 일격 대치", sceneTitleEn: "Red Bridge Clash", characterIds: ["char-seoyeon", "char-harin"], tags: ["전투", "분노", "검기", "야간"], dialogueOrMemo: "강서연: 여기서 끝낸다. 윤하린, 검을 뽑아.", lightingMood: "night-cool" },
  { cutId: "EP24-CUT-29", cutNumber: 29, sceneTitleKo: "노을 서고 작전 회의", sceneTitleEn: "Sunset Archive Briefing", characterIds: ["char-doyun"], tags: ["강서연", "작전", "자신감", "화염"], dialogueOrMemo: "한도윤이 자신만만하게 웃으며 지도를 펼친다.", lightingMood: "sunset" },
  { cutId: "EP24-CUT-48", cutNumber: 48, sceneTitleKo: "폭우 속 붕괴 직전", sceneTitleEn: "Collapse Under Storm", tags: ["윤하린", "경악", "물보라"], dialogueOrMemo: "다리가 무너지며 윤하린이 경악한다.", lightingMood: "daylight" },
];

function createMulberry32(seed: number): () => number {
  let state = (Math.floor(Number.isFinite(seed) ? seed : 23) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function adjustOklchForLighting(oklch: string, mood: CutLightingMood): string {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/u.exec(oklch.trim());
  if (!m) return oklch;
  let l = Number(m[1]), c = Number(m[2]), h = Number(m[3]);
  if (mood === "sunset") { l = clamp(l * 0.96, 0.14, 0.96); c = clamp(c * 1.12 + 0.012, 0.005, 0.32); h += (42 - h) * 0.18; }
  else if (mood === "night-cool") { l = clamp(l * 0.84, 0.12, 0.92); c = clamp(c * 0.9 + 0.008, 0.005, 0.28); h += (248 - h) * 0.22; }
  else if (mood === "indoor-warm") { l = clamp(l * 0.98, 0.15, 0.97); c = clamp(c * 1.04 + 0.005, 0.005, 0.3); h += (72 - h) * 0.12; }
  const nh = ((h % 360) + 360) % 360;
  return m[4] !== undefined ? `oklch(${round3(l)} ${round3(c)} ${round2(nh)} / ${m[4]})` : `oklch(${round3(l)} ${round3(c)} ${round2(nh)})`;
}

function inferExpressionFromCut(cut: CutReferenceContext, fallback: ExpressionPresetId): ExpressionPresetId {
  if (cut.preferredExpression) return cut.preferredExpression;
  const text = `${(cut.tags ?? []).join(" ")} ${cut.dialogueOrMemo ?? ""} ${cut.sceneTitleKo} ${cut.sceneTitleEn}`.toLowerCase();
  if (/경악|충격|놀람|shock|gasp|무너지/.test(text)) return "shocked";
  if (/분노|전투|격돌|일격|끝낸다|angry|rage|clash/.test(text)) return "angry";
  if (/눈물|오열|슬픔|tear|cry|grief/.test(text)) return "tearful";
  if (/비웃|자신|여유|smirk|confident|작전/.test(text)) return "smirk";
  if (/미소|웃|기쁨|smile|warm|happy/.test(text)) return "smile";
  return fallback;
}

export function resolveCutCharacterReferenceDock(
  cut: CutReferenceContext,
  library: readonly CharacterReferenceSheet[] = DEFAULT_CHARACTER_REFERENCE_LIBRARY,
): CharacterReferenceDockResult {
  const lightingMood: CutLightingMood = cut.lightingMood ?? "daylight";
  const reqIds = (cut.characterIds ?? []).map((id) => id.trim()).filter(Boolean);
  const normTags = (cut.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const scriptLower = (cut.dialogueOrMemo ?? "").toLowerCase();
  const matched = new Map<string, ResolvedCharacterDockEntry>();
  const knownIds = new Set(library.map((s) => s.id));
  const unmatchedIds = reqIds.filter((id) => !knownIds.has(id));

  const add = (sheet: CharacterReferenceSheet, matchReason: DockMatchReason, matchedTokens: readonly string[]): void => {
    if (matched.has(sheet.id)) return;
    matched.set(sheet.id, {
      character: sheet,
      matchReason,
      matchedTokens,
      recommendedExpressionId: inferExpressionFromCut(cut, sheet.defaultExpression),
      turnarounds: sheet.turnarounds,
      expressions: sheet.expressions,
      swatches: sheet.swatches.map((sw) => ({ ...sw, lightingAdjustedOklch: adjustOklchForLighting(sw.oklch, lightingMood) })),
    });
  };

  for (const id of reqIds) {
    const sheet = library.find((item) => item.id === id);
    if (sheet) add(sheet, "id-match", [id]);
  }
  for (const sheet of library) {
    const tokens = [sheet.nameKo, sheet.nameEn, ...sheet.tags].map((t) => t.toLowerCase());
    const hits = normTags.filter((tag) => tokens.includes(tag));
    if (hits.length > 0) add(sheet, "tag-match", hits);
  }
  if (scriptLower.length > 0) {
    for (const sheet of library) {
      const hits = [sheet.nameKo, sheet.nameEn, ...sheet.tags.filter((t) => t.length >= 2)].filter((n) => scriptLower.includes(n.toLowerCase()));
      if (hits.length > 0) add(sheet, "script-mention", hits.slice(0, 3));
    }
  }

  const matchedCharacters = [...matched.values()];
  return {
    cutId: cut.cutId,
    cutNumber: Math.max(1, Math.round(cut.cutNumber)),
    lightingMood,
    matchedCharacters,
    primaryCharacter: matchedCharacters[0] ?? null,
    unmatchedIds,
    syncSummaryKo: matchedCharacters.length > 0 ? `컷 #${cut.cutNumber} 등장인물 ${matchedCharacters.length}명 자동 동기화 (${matchedCharacters.map((e) => e.character.nameKo).join(", ")})` : `컷 #${cut.cutNumber}에 일치하는 등록 캐릭터가 없습니다.`,
    syncSummaryEn: matchedCharacters.length > 0 ? `Auto-synced ${matchedCharacters.length} character(s) for Cut #${cut.cutNumber} (${matchedCharacters.map((e) => e.character.nameEn).join(", ")})` : `No registered characters matched Cut #${cut.cutNumber}.`,
  };
}

// ---------------------------------------------------------------------------
// 2) 액션·판타지 물리 궤적 이펙트 생성기 (검기 / 불꽃 / 물보라 / 타격 파편)
// ---------------------------------------------------------------------------

export const ACTION_VFX_PRESETS: Readonly<Record<ActionTrajectoryVfxKind, {
  readonly labelKo: string; readonly labelEn: string; readonly descriptionKo: string; readonly descriptionEn: string;
  readonly palette: ActionTrajectoryVfxPalette;
}>> = {
  "sword-arc": {
    labelKo: "검기 궤적", labelEn: "Sword Arc",
    descriptionKo: "원근 폭 테이퍼 초승달 검기 + 백열 코어 + 접선 속도선", descriptionEn: "Perspective-tapered crescent slash, white-hot core & speedlines",
    palette: { primaryOklch: "oklch(0.76 0.16 232 / 0.88)", coreOklch: "oklch(0.97 0.02 220 / 0.96)", accentOklch: "oklch(0.62 0.2 252 / 0.72)", speedLineOklch: "oklch(0.86 0.08 232 / 0.75)" },
  },
  "flame-ribbon": {
    labelKo: "불꽃 화염띠", labelEn: "Flame Ribbon",
    descriptionKo: "와류 진동 화염 리본 + 고열 중심띠 + 가속 불티 파편", descriptionEn: "Turbulent flame ribbon, incandescent core & rising embers",
    palette: { primaryOklch: "oklch(0.67 0.22 38 / 0.9)", coreOklch: "oklch(0.92 0.14 88 / 0.96)", accentOklch: "oklch(0.56 0.23 24 / 0.78)", speedLineOklch: "oklch(0.82 0.16 64 / 0.72)" },
  },
  "water-splash": {
    labelKo: "물보라 유체", labelEn: "Water Splash",
    descriptionKo: "원심 파고 리본 + 수면 포말 + 접선 비산 물방울", descriptionEn: "Centrifugal wave crest, foam highlight & ballistic droplets",
    palette: { primaryOklch: "oklch(0.68 0.14 218 / 0.84)", coreOklch: "oklch(0.96 0.024 210 / 0.94)", accentOklch: "oklch(0.52 0.14 236 / 0.75)", speedLineOklch: "oklch(0.84 0.08 212 / 0.74)" },
  },
  "impact-shatter": {
    labelKo: "타격 파편", labelEn: "Impact Shatter",
    descriptionKo: "충격 진원지 코어 + 방사형 쐐기 파편 + 충격파 집중선", descriptionEn: "Impact epicenter burst, radial wedge shards & shockwave lines",
    palette: { primaryOklch: "oklch(0.74 0.19 46 / 0.9)", coreOklch: "oklch(0.98 0.03 82 / 0.96)", accentOklch: "oklch(0.36 0.04 260 / 0.86)", speedLineOklch: "oklch(0.9 0.06 68 / 0.82)" },
  },
};

export const DEFAULT_TRAJECTORY_STROKES: readonly { readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly points: readonly TrajectoryPoint[] }[] = [
  { id: "diagonal-slash", labelKo: "대각 일섬 호선", labelEn: "Diagonal Slash Arc", points: [{ x: 90, y: 360, pressure: 0.32 }, { x: 220, y: 270, pressure: 0.78 }, { x: 410, y: 185, pressure: 1.0 }, { x: 605, y: 132, pressure: 0.84 }, { x: 725, y: 98, pressure: 0.25 }] },
  { id: "serpent-wave", labelKo: "S자 와류 선회", labelEn: "S-Curve Vortex", points: [{ x: 85, y: 320, pressure: 0.4 }, { x: 230, y: 150, pressure: 0.86 }, { x: 410, y: 265, pressure: 0.98 }, { x: 575, y: 120, pressure: 0.82 }, { x: 720, y: 225, pressure: 0.3 }] },
  { id: "overhead-smash", labelKo: "내려찍기 강타", labelEn: "Overhead Smash", points: [{ x: 180, y: 78, pressure: 0.36 }, { x: 315, y: 135, pressure: 0.74 }, { x: 425, y: 245, pressure: 0.96 }, { x: 485, y: 342, pressure: 1.0 }] },
];

interface SpineSample { readonly x: number; readonly y: number; readonly tx: number; readonly ty: number; readonly nx: number; readonly ny: number; readonly t: number; readonly pressure: number; }

function resampleSpine(points: readonly TrajectoryPoint[], w: number, h: number, count: number): { readonly samples: readonly SpineSample[]; readonly totalLength: number } {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: clamp(p.x, 0, w), y: clamp(p.y, 0, h), pressure: clamp(p.pressure ?? 0.75, 0.15, 1.0) }));
  const src = valid.length >= 2 && Math.hypot(valid[valid.length - 1].x - valid[0].x, valid[valid.length - 1].y - valid[0].y) >= 4
    ? valid : [{ x: w * 0.14, y: h * 0.74, pressure: 0.35 }, { x: w * 0.52, y: h * 0.44, pressure: 1.0 }, { x: w * 0.86, y: h * 0.24, pressure: 0.28 }];
  const cum: number[] = [0];
  for (let i = 1; i < src.length; i += 1) cum.push(cum[i - 1] + Math.max(0.001, Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y)));
  const total = cum[cum.length - 1];
  const raw = Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0;
    const dist = t * total;
    let seg = 0;
    while (seg < cum.length - 2 && cum[seg + 1] < dist) seg += 1;
    const lt = clamp((dist - cum[seg]) / Math.max(0.001, cum[seg + 1] - cum[seg]), 0, 1);
    const a = src[seg], b = src[seg + 1];
    return { x: a.x + (b.x - a.x) * lt, y: a.y + (b.y - a.y) * lt, pressure: a.pressure + (b.pressure - a.pressure) * lt, t };
  });
  const samples = raw.map((curr, idx) => {
    const prev = raw[Math.max(0, idx - 1)], next = raw[Math.min(raw.length - 1, idx + 1)];
    const dx = next.x - prev.x, dy = next.y - prev.y, len = Math.max(0.001, Math.hypot(dx, dy));
    return { x: round2(curr.x), y: round2(curr.y), tx: dx / len, ty: dy / len, nx: -dy / len, ny: dx / len, t: curr.t, pressure: curr.pressure };
  });
  return { samples, totalLength: round2(total) };
}

function buildRibbon(samples: readonly SpineSample[], halfW: readonly number[], shifts: readonly number[]): readonly Point2D[] {
  const left: Point2D[] = [], right: Point2D[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i], hw = Math.max(0.6, halfW[i]), sh = shifts[i];
    left.push({ x: round2(s.x + s.nx * (sh + hw)), y: round2(s.y + s.ny * (sh + hw)) });
    right.push({ x: round2(s.x + s.nx * (sh - hw)), y: round2(s.y + s.ny * (sh - hw)) });
  }
  return [...left, ...right.reverse()];
}

const polyPoints = (poly: readonly Point2D[]): string => poly.map((p) => `${round2(p.x)},${round2(p.y)}`).join(" ");

export function generateActionTrajectoryVfx(input: ActionTrajectoryVfxInput): ActionTrajectoryVfxResult {
  const w = clamp(Math.round(input.canvasWidth ?? 800), 200, 4096);
  const h = clamp(Math.round(input.canvasHeight ?? 450), 200, 4096);
  const baseW = clamp(input.baseWidthPx ?? 32, 6, 160);
  const taper = clamp(input.perspectiveTaper ?? 0.72, 0.05, 1.0);
  const intensity = clamp(input.intensity ?? 1.0, 0.25, 2.0);
  const seed = Math.floor(Number.isFinite(input.seed ?? 23) ? (input.seed ?? 23) : 23);
  const rng = createMulberry32(seed + input.kind.length * 97);
  const { samples, totalLength } = resampleSpine(input.points, w, h, 22);
  const preset = ACTION_VFX_PRESETS[input.kind];

  const halfW: number[] = [], coreW: number[] = [], shifts: number[] = [];
  for (const s of samples) {
    const env = Math.sin(Math.pow(s.t, 0.78) * Math.PI);
    const persp = 0.58 + taper * (0.28 + s.t * 0.96);
    let hw = baseW * 0.5 * Math.max(0.08, env) * persp * (0.65 + 0.35 * s.pressure);
    let sh = 0;
    if (input.kind === "sword-arc") sh = Math.sin(s.t * Math.PI) * baseW * 0.14;
    else if (input.kind === "flame-ribbon") { hw *= 0.72 + 0.45 * Math.abs(Math.sin(s.t * Math.PI * 4.5 + seed * 0.3)); sh = Math.sin(s.t * Math.PI * 5 + seed * 0.2) * baseW * 0.26 * intensity; }
    else if (input.kind === "water-splash") { hw *= 0.78 + 0.38 * Math.sin(s.t * Math.PI * 3.0); sh = Math.cos(s.t * Math.PI * 2.5) * baseW * 0.18; }
    else hw *= 0.45 + Math.pow(s.t, 1.3) * 1.15;
    halfW.push(round2(hw));
    coreW.push(round2(hw * (input.kind === "sword-arc" ? 0.34 : 0.42)));
    shifts.push(round2(sh));
  }

  const primaryPolygons: (readonly Point2D[])[] = [buildRibbon(samples, halfW, shifts)];
  const corePolygons: (readonly Point2D[])[] = [buildRibbon(samples, coreW, shifts)];
  const debrisPolygons: (readonly Point2D[])[] = [];
  const speedLines: VfxSpeedLine[] = [];
  const fragN = Math.max(5, Math.round(9 * intensity));
  const lineN = Math.max(6, Math.round(10 * intensity));

  if (input.kind === "impact-shatter") {
    const epi = samples[samples.length - 1];
    primaryPolygons.push(Array.from({ length: 20 }, (_, k) => {
      const ang = (k / 20) * Math.PI * 2 + seed * 0.1;
      const r = k % 2 === 0 ? baseW * (1.25 + rng() * 0.55) : baseW * 0.45;
      return { x: round2(epi.x + Math.cos(ang) * r), y: round2(epi.y + Math.sin(ang) * r) };
    }));
    for (let i = 0; i < fragN; i += 1) {
      const ang = (i / fragN) * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const d = baseW * (1.35 + rng() * 2.2 * intensity), sl = baseW * (0.45 + rng() * 0.7), sw = baseW * (0.18 + rng() * 0.24);
      const cx = epi.x + Math.cos(ang) * d, cy = epi.y + Math.sin(ang) * d, px = -Math.sin(ang), py = Math.cos(ang);
      debrisPolygons.push([
        { x: round2(cx + Math.cos(ang) * sl), y: round2(cy + Math.sin(ang) * sl) }, { x: round2(cx + px * sw), y: round2(cy + py * sw) },
        { x: round2(cx - Math.cos(ang) * sl * 0.45), y: round2(cy - Math.sin(ang) * sl * 0.45) }, { x: round2(cx - px * sw * 0.75), y: round2(cy - py * sw * 0.75) },
      ]);
    }
    for (let i = 0; i < lineN; i += 1) {
      const ang = (i / lineN) * Math.PI * 2 + (rng() - 0.5) * 0.14;
      const r0 = baseW * (1.1 + rng() * 0.5), r1 = r0 + baseW * (1.8 + rng() * 2.2 * intensity);
      speedLines.push({ x1: round2(epi.x + Math.cos(ang) * r0), y1: round2(epi.y + Math.sin(ang) * r0), x2: round2(epi.x + Math.cos(ang) * r1), y2: round2(epi.y + Math.sin(ang) * r1), strokeWidth: round2(1.4 + rng() * 2.4), opacity: round2(0.48 + rng() * 0.42) });
    }
  } else {
    for (let i = 0; i < fragN; i += 1) {
      const idx = clamp(Math.floor(((i + 0.5) / fragN) * (samples.length - 2)) + 1, 1, samples.length - 1);
      const s = samples[idx], side = i % 2 === 0 ? 1 : -1;
      const lat = (halfW[idx] + baseW * (0.45 + rng() * 0.95)) * side;
      const cx = s.x + s.nx * lat, cy = s.y + s.ny * lat;
      const sz = baseW * (input.kind === "water-splash" ? 0.22 + rng() * 0.2 : 0.18 + rng() * 0.28);
      const st = input.kind === "sword-arc" ? 2.4 : input.kind === "flame-ribbon" ? 1.85 : 1.5;
      debrisPolygons.push([
        { x: round2(cx + s.tx * sz * st), y: round2(cy + s.ty * sz * st) }, { x: round2(cx + s.nx * sz * 0.65), y: round2(cy + s.ny * sz * 0.65) },
        { x: round2(cx - s.tx * sz * 0.9), y: round2(cy - s.ty * sz * 0.9) }, { x: round2(cx - s.nx * sz * 0.55), y: round2(cy - s.ny * sz * 0.55) },
      ]);
    }
    for (let i = 0; i < lineN; i += 1) {
      const idx = clamp(Math.floor((i / lineN) * (samples.length - 2)) + 1, 1, samples.length - 1);
      const s = samples[idx], side = i % 2 === 0 ? 1 : -1;
      const off = (halfW[idx] * 0.9 + baseW * (0.28 + rng() * 0.72)) * side;
      const ll = Math.max(24, totalLength * (0.1 + rng() * 0.14) * intensity);
      const bx = s.x + s.nx * off, by = s.y + s.ny * off;
      speedLines.push({ x1: round2(bx - s.tx * ll * 0.45), y1: round2(by - s.ty * ll * 0.45), x2: round2(bx + s.tx * ll * 0.55), y2: round2(by + s.ty * ll * 0.55), strokeWidth: round2(1.1 + rng() * 2.1), opacity: round2(0.42 + rng() * 0.46) });
    }
  }

  const fullW = halfW.map((v) => round2(v * 2));
  const peakWidthPx = Math.max(...fullW), minWidthPx = Math.min(...fullW);
  const viewBox = `0 0 ${w} ${h}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" data-vfx-kind="${input.kind}" data-seed="${seed}">`,
    `<rect width="${w}" height="${h}" fill="oklch(0.155 0.008 70)" />`,
    `<g id="vfx-speedlines">${speedLines.map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${preset.palette.speedLineOklch}" stroke-width="${l.strokeWidth}" stroke-linecap="round" opacity="${l.opacity}" />`).join("")}</g>`,
    `<g id="vfx-ribbon-body">${primaryPolygons.map((p) => `<polygon points="${polyPoints(p)}" fill="${preset.palette.primaryOklch}" />`).join("")}</g>`,
    `<g id="vfx-core-highlight">${corePolygons.map((p) => `<polygon points="${polyPoints(p)}" fill="${preset.palette.coreOklch}" />`).join("")}</g>`,
    `<g id="vfx-debris-shards">${debrisPolygons.map((p) => `<polygon points="${polyPoints(p)}" fill="${preset.palette.accentOklch}" />`).join("")}</g>`,
    `</svg>`,
  ].join("");

  return {
    kind: input.kind, labelKo: preset.labelKo, labelEn: preset.labelEn, seed, viewBox, palette: preset.palette,
    primaryPolygons, corePolygons, debrisPolygons, speedLines,
    metrics: { arcLengthPx: totalLength, peakWidthPx, minWidthPx, polygonCount: primaryPolygons.length + corePolygons.length + debrisPolygons.length, debrisCount: debrisPolygons.length, speedLineCount: speedLines.length, peakAccelerationRatio: round2(peakWidthPx / Math.max(1, minWidthPx)) },
    svg,
  };
}

// ---------------------------------------------------------------------------
// 3) 60컷 연재 마감 워룸 병목 분석 & 어시스턴트 원클릭 최적 배분
// ---------------------------------------------------------------------------

function remainingHoursForCutStage(cut: WarRoomCutRecord, stageId: ProductionStageId): number {
  const base = PRODUCTION_STAGES.find((s) => s.id === stageId)?.baseHoursPerCut ?? 0.3;
  return round3(base * COMPLEXITY_MULTIPLIER[cut.complexity] * ((100 - clamp(cut.stageProgress[stageId] ?? 0, 0, 100)) / 100));
}

export function analyzeDeadlineWarRoom(input: DeadlineWarRoomInput): DeadlineWarRoomAnalysis {
  const hoursUntilDeadline = Math.max(0, Number.isFinite(input.hoursUntilDeadline) ? input.hoursUntilDeadline : 0);
  const stageSummaries: StageBottleneckSummary[] = PRODUCTION_STAGES.map((stage) => {
    let completedCuts = 0, inProgressCuts = 0, notStartedCuts = 0, pctSum = 0, remSum = 0;
    for (const cut of input.cuts) {
      const pct = clamp(cut.stageProgress[stage.id] ?? 0, 0, 100);
      pctSum += pct;
      if (pct >= 100) completedCuts += 1; else if (pct > 0) inProgressCuts += 1; else notStartedCuts += 1;
      remSum += remainingHoursForCutStage(cut, stage.id);
    }
    const specAvail = round2(input.assistants.filter((a) => a.specialties.includes(stage.id)).reduce((acc, a) => {
      const hrs = Math.max(0, Number.isFinite(a.availableHours) ? a.availableHours : 0);
      return acc + (hrs / Math.max(1, a.specialties.length)) * clamp(a.speedFactor ?? 1, 0.5, 2);
    }, 0));
    const rem = round2(remSum);
    const gap = round2(rem - specAvail);
    const completionPct = input.cuts.length > 0 ? round2(pctSum / input.cuts.length) : 100;
    const pressure = hoursUntilDeadline > 0 ? rem / Math.max(1, hoursUntilDeadline * 0.45) : rem;
    const bottleneckScore = rem <= 0.01 ? 0 : round2((rem * stage.downstreamWeight + Math.max(0, gap) * 1.4 + pressure) * 10);
    const status: StageBottleneckSummary["status"] = rem <= 0.01 ? "on-track" : gap > 1.0 || completionPct < 55 ? "bottleneck" : gap > -1.0 || completionPct < 80 ? "watch" : "on-track";
    return { stageId: stage.id, labelKo: stage.labelKo, labelEn: stage.labelEn, completedCuts, inProgressCuts, notStartedCuts, completionPct, remainingWorkHours: rem, specialistAvailableHours: specAvail, capacityGapHours: gap, bottleneckScore, status };
  });

  const primaryBottleneckStage = [...stageSummaries].filter((s) => s.remainingWorkHours > 0).sort((a, b) => b.bottleneckScore - a.bottleneckScore)[0] ?? null;
  let fullyCompletedCuts = 0, totalProgressAccum = 0;
  const delayedCuts: WarRoomDelayedCut[] = [];

  for (const cut of input.cuts) {
    let pctSum = 0, remSum = 0;
    let blockingStage: ProductionStageId | null = null;
    for (const stage of PRODUCTION_STAGES) {
      const pct = clamp(cut.stageProgress[stage.id] ?? 0, 0, 100);
      pctSum += pct;
      remSum += remainingHoursForCutStage(cut, stage.id);
      if (blockingStage === null && pct < 100) blockingStage = stage.id;
    }
    const cutPct = round2(pctSum / PRODUCTION_STAGES.length);
    totalProgressAccum += cutPct;
    if (blockingStage === null) { fullyCompletedCuts += 1; continue; }
    const stageMeta = PRODUCTION_STAGES.find((s) => s.id === blockingStage) ?? PRODUCTION_STAGES[0];
    const isBn = primaryBottleneckStage?.stageId === blockingStage;
    const urgencyScore = round2(remSum * stageMeta.downstreamWeight * (isBn ? 1.35 : 1.0) * (1 + (100 - cutPct) / 100));
    if (cutPct < 80 || remSum >= 0.45 || isBn) {
      delayedCuts.push({ cutId: cut.cutId, cutNumber: cut.cutNumber, complexity: cut.complexity, blockingStage, completionPct: cutPct, remainingHours: round2(remSum), urgencyScore, reasonKo: `${stageMeta.labelKo} 공정 미완료 · 잔여 ${round2(remSum)}h`, reasonEn: `${stageMeta.labelEn} pending · ${round2(remSum)}h left` });
    }
  }
  delayedCuts.sort((a, b) => b.urgencyScore - a.urgencyScore || a.cutNumber - b.cutNumber);

  const totalRemainingHours = round2(stageSummaries.reduce((s, x) => s + x.remainingWorkHours, 0));
  const totalTeamAvailableHours = round2(input.assistants.reduce((s, a) => s + Math.max(0, Number.isFinite(a.availableHours) ? a.availableHours : 0) * clamp(a.speedFactor ?? 1, 0.5, 2), 0));
  const projectedDeficitHours = round2(Math.max(0, totalRemainingHours - totalTeamAvailableHours));
  const teamSpeed = Math.max(0.5, input.assistants.reduce((s, a) => s + clamp(a.speedFactor ?? 1, 0.5, 2), 0));
  const estimatedFinishHours = round2(totalRemainingHours / teamSpeed);
  const overallProgressPct = input.cuts.length > 0 ? round2(totalProgressAccum / input.cuts.length) : 100;
  const deadlineRisk: DeadlineWarRoomAnalysis["deadlineRisk"] =
    totalRemainingHours <= 0.01 ? "safe" : projectedDeficitHours > 0.5 || estimatedFinishHours > hoursUntilDeadline ? "critical" : totalRemainingHours > totalTeamAvailableHours * 0.8 || estimatedFinishHours > hoursUntilDeadline * 0.78 ? "tight" : "safe";

  return { episodeLabel: input.episodeLabel, hoursUntilDeadline, totalCuts: input.cuts.length, fullyCompletedCuts, overallProgressPct, totalRemainingHours, totalTeamAvailableHours, projectedDeficitHours, estimatedFinishHours, deadlineRisk, stageSummaries, primaryBottleneckStage, delayedCuts };
}

export function autoAssignBottleneckCuts(input: DeadlineWarRoomInput): WarRoomAssignmentPlan {
  const beforeAnalysis = analyzeDeadlineWarRoom(input);
  const stageScores = new Map(beforeAnalysis.stageSummaries.map((s) => [s.stageId, s.bottleneckScore]));
  const tasks: { cutIndex: number; cutId: string; cutNumber: number; stageId: ProductionStageId; stageOrder: number; remainingHours: number; priority: number; previousAssistantId: string | null }[] = [];

  input.cuts.forEach((cut, cutIndex) => {
    PRODUCTION_STAGES.forEach((stage, stageOrder) => {
      const rem = remainingHoursForCutStage(cut, stage.id);
      if (rem > 0.005) {
        tasks.push({ cutIndex, cutId: cut.cutId, cutNumber: cut.cutNumber, stageId: stage.id, stageOrder, remainingHours: rem, priority: (stageScores.get(stage.id) ?? 0) * 10 + (5 - stageOrder) * 15 + rem * 20, previousAssistantId: cut.assignedByStage[stage.id] ?? null });
      }
    });
  });
  tasks.sort((a, b) => b.priority - a.priority || a.cutNumber - b.cutNumber);

  const loads = input.assistants.map((assistant) => ({
    assistant, availableHours: Math.max(0, Number.isFinite(assistant.availableHours) ? assistant.availableHours : 0),
    speedFactor: clamp(assistant.speedFactor ?? 1.0, 0.5, 2.0), assignedHours: 0, assignedTaskCount: 0,
  }));
  const mutableAssigned: Record<ProductionStageId, string | undefined>[] = input.cuts.map((c) => ({
    lineart: c.assignedByStage.lineart, flatting: c.assignedByStage.flatting, shading: c.assignedByStage.shading, background: c.assignedByStage.background, lettering: c.assignedByStage.lettering,
  }));
  const assignments: CutStageAssignment[] = [];
  const unassignedOverflowTasks: { cutId: string; stageId: ProductionStageId; remainingHours: number }[] = [];

  for (const task of tasks) {
    let chosen: { entry: (typeof loads)[number]; cost: number; isCrossSkill: boolean; score: number } | null = null;
    for (const entry of loads) {
      if (entry.availableHours <= 0) continue;
      const isSpecialist = entry.assistant.specialties.includes(task.stageId);
      const cost = round3((task.remainingHours * (isSpecialist ? 1.0 : 1.18)) / entry.speedFactor);
      if (entry.assignedHours + cost > entry.availableHours + 0.05) continue;
      const postRatio = (entry.assignedHours + cost) / Math.max(0.1, entry.availableHours);
      // 전문 공정 우선(+0.00)하되 팀원 간 가동률 편차가 12%p 이상 벌어지면 교차 지원으로 병목을 해소한다
      const score = postRatio + (isSpecialist ? 0 : 0.12);
      if (!chosen || score < chosen.score) chosen = { entry, cost, isCrossSkill: !isSpecialist, score };
    }
    if (!chosen) { unassignedOverflowTasks.push({ cutId: task.cutId, stageId: task.stageId, remainingHours: round2(task.remainingHours) }); continue; }
    chosen.entry.assignedHours = round3(chosen.entry.assignedHours + chosen.cost);
    chosen.entry.assignedTaskCount += 1;
    mutableAssigned[task.cutIndex][task.stageId] = chosen.entry.assistant.id;
    const st = PRODUCTION_STAGES[task.stageOrder];
    assignments.push({
      cutId: task.cutId, cutNumber: task.cutNumber, stageId: task.stageId, previousAssistantId: task.previousAssistantId,
      assignedAssistantId: chosen.entry.assistant.id, estimatedHours: round2(chosen.cost), isCrossSkill: chosen.isCrossSkill,
      reasonKo: chosen.isCrossSkill ? `${st.labelKo} 병목 교차 지원 (${chosen.entry.assistant.nameKo})` : `${st.labelKo} 전문 가용 부하 균등 배정 (${chosen.entry.assistant.nameKo})`,
      reasonEn: chosen.isCrossSkill ? `Cross-skill support for ${st.labelEn} (${chosen.entry.assistant.nameEn})` : `Balanced specialist assignment for ${st.labelEn} (${chosen.entry.assistant.nameEn})`,
    });
  }

  const updatedCuts = input.cuts.map((cut, idx) => ({ ...cut, assignedByStage: mutableAssigned[idx] }));
  const assistantLoads: AssistantWorkloadSummary[] = loads.map((e) => ({
    assistantId: e.assistant.id, nameKo: e.assistant.nameKo, nameEn: e.assistant.nameEn,
    availableHours: round2(e.availableHours), assignedHours: round2(e.assignedHours),
    utilizationPct: e.availableHours > 0 ? round2((e.assignedHours / e.availableHours) * 100) : 0, assignedTaskCount: e.assignedTaskCount,
  }));
  const activeUtils = assistantLoads.filter((x) => x.availableHours > 0).map((x) => x.utilizationPct);
  const loadBalanceSpreadPct = activeUtils.length >= 2 ? round2(Math.max(...activeUtils) - Math.min(...activeUtils)) : 0;

  return {
    beforeAnalysis, assignments, updatedCuts, assistantLoads, loadBalanceSpreadPct, unassignedOverflowTasks,
    summaryKo: `${assignments.length}건 병목 공정을 ${assistantLoads.length}명 어시스턴트에 재배분했습니다 (가동률 편차 ${loadBalanceSpreadPct}%p · 미배정 초과 ${unassignedOverflowTasks.length}건).`,
    summaryEn: `Rebalanced ${assignments.length} pending cut-stage tasks across ${assistantLoads.length} assistants (load spread ${loadBalanceSpreadPct}pp · overflow ${unassignedOverflowTasks.length}).`,
  };
}

export function createDefaultSixtyCutWarRoomInput(): DeadlineWarRoomInput {
  const cuts: WarRoomCutRecord[] = Array.from({ length: 60 }, (_, index) => {
    const cutNumber = index + 1;
    const complexity: CutComplexity = cutNumber % 7 === 0 ? "action-heavy" : cutNumber % 4 === 0 ? "simple" : "standard";
    return {
      cutId: `CUT-${String(cutNumber).padStart(2, "0")}`, cutNumber, complexity,
      stageProgress: {
        lineart: cutNumber <= 54 ? 100 : cutNumber <= 57 ? 70 : 40,
        flatting: cutNumber <= 46 ? 100 : cutNumber <= 52 ? 60 : 20,
        shading: cutNumber <= 28 ? 100 : cutNumber <= 38 ? 45 : 0,
        background: cutNumber <= 32 ? 100 : cutNumber <= 44 ? 35 : 0,
        lettering: cutNumber <= 36 ? 100 : cutNumber <= 46 ? 50 : 0,
      },
      assignedByStage: { lineart: "asst-mina", flatting: "asst-jiho", shading: cutNumber <= 40 ? "asst-jiho" : undefined, background: cutNumber <= 42 ? "asst-sora" : undefined, lettering: "asst-tae" },
    };
  });
  return {
    episodeLabel: "제24화 — 붉은 다리의 결투 (60컷)",
    hoursUntilDeadline: 16,
    cuts,
    assistants: [
      { id: "asst-mina", nameKo: "김민아 (선화·명암)", nameEn: "Mina Kim (Line/Shade)", specialties: ["lineart", "shading"], availableHours: 11, speedFactor: 1.1 },
      { id: "asst-jiho", nameKo: "박지호 (밑색·명암)", nameEn: "Jiho Park (Flat/Shade)", specialties: ["flatting", "shading"], availableHours: 12, speedFactor: 1.05 },
      { id: "asst-sora", nameKo: "이소라 (배경·3D)", nameEn: "Sora Lee (BG/3D)", specialties: ["background", "shading"], availableHours: 12, speedFactor: 1.0 },
      { id: "asst-tae", nameKo: "최태훈 (식자·밑색)", nameEn: "Taehoon Choi (Letter/Flat)", specialties: ["lettering", "flatting", "background"], availableHours: 10, speedFactor: 1.0 },
    ],
  };
}
