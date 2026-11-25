import { assertPlacementGridInput, assertPlacementInput, assertPlacementExport } from "./placement-input-contract";

/**
 * Wave 48C — 얼굴 회피 네거티브 스페이스 & 세로 스크롤 읽기 순서 기반
 * 말풍선 꼬리·한글 효과음(SFX) 자리 자동 추천 엔진.
 *
 * 순수 결정론적(pure & deterministic) 계산 모듈:
 * - 800×1200 웹툰 컷 2D 네거티브 스페이스 점수 그리드 계산
 * - 얼굴·눈·손·소품 보호 영역 가림률 0% 목표 배치 탐색
 * - 세로 스크롤 시선 흐름(y1 < y2, Z-패턴) 유지 및 꼬리 방향 계산
 * - 감정별 맞춤 한글 SFX("두근", "콰앙!", "스윽…", "버럭!", "정적", "쿵—") 배치
 * - 비파괴 미리보기·적용·되돌리기 상태 머신 + JSON/SVG 내보내기
 */

export const DEFAULT_CUT_WIDTH = 800;
export const DEFAULT_CUT_HEIGHT = 1200;
export const DEFAULT_SAFE_MARGIN = 36;
export const MIN_SAFE_MARGIN = 16;
export const MAX_SAFE_MARGIN = 84;
export const MAX_DIALOGUE_BALLOONS = 3;
export const DEFAULT_GRID_COLS = 16;
export const DEFAULT_GRID_ROWS = 24;
export const PROPOSER_SCHEMA_VERSION = "toonstudio.balloon-sfx-placement-proposer.v1";

export type EmotionTone = "normal" | "whisper" | "shout" | "thought" | "tension";
export type BalloonStyle = "oval" | "shout-burst" | "whisper-dashed" | "thought-cloud" | "tension-jagged";
export type TailStyle = "pointed" | "jagged" | "thought-dots" | "soft";
export type TailDirection = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type ProtectedZoneKind = "face" | "eyes" | "hand" | "prop";
export type CutPresetId = "closeup-monologue" | "two-person-standoff" | "action-impact" | "romance-twoshot" | "corridor-chase";
export type LayoutStrategyId = "balanced-flow" | "compact-anchor" | "dramatic-breathing";
export type SfxAccentStyle = "impact" | "pulse" | "whisper" | "tension";
export type PlacementSessionStatus = "baseline" | "previewing" | "applied" | "reverted";

export interface RectBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Point2D { readonly x: number; readonly y: number }
export interface ProtectedZone { readonly id: string; readonly kind: ProtectedZoneKind; readonly labelKo: string; readonly labelEn: string; readonly box: RectBox; readonly weight: number }
export interface DialogueItem { readonly id: string; readonly speakerNameKo: string; readonly speakerNameEn: string; readonly text: string; readonly mouthX: number; readonly mouthY: number; readonly emotion: EmotionTone }
export interface CutCompositionPreset { readonly id: CutPresetId; readonly labelKo: string; readonly labelEn: string; readonly summaryKo: string; readonly summaryEn: string; readonly canvasWidth: number; readonly canvasHeight: number; readonly protectedZones: readonly ProtectedZone[]; readonly dialogues: readonly DialogueItem[] }
export interface NegativeSpaceGridInput { readonly canvasWidth?: number; readonly canvasHeight?: number; readonly protectedZones: readonly ProtectedZone[]; readonly safeMargin?: number; readonly cols?: number; readonly rows?: number; readonly focusMouth?: Point2D; readonly preferredBand?: { readonly minY: number; readonly maxY: number } }
export interface NegativeSpaceCell { readonly col: number; readonly row: number; readonly box: RectBox; readonly centerX: number; readonly centerY: number; readonly occlusionRatio: number; readonly faceOcclusionRatio: number; readonly safeMarginScore: number; readonly mouthProximityScore: number; readonly readingFlowScore: number; readonly score: number }
export interface NegativeSpaceGrid { readonly canvasWidth: number; readonly canvasHeight: number; readonly safeMargin: number; readonly cols: number; readonly rows: number; readonly cellWidth: number; readonly cellHeight: number; readonly cells: readonly NegativeSpaceCell[]; readonly averageScore: number; readonly openCellRatio: number; readonly bestCells: readonly NegativeSpaceCell[] }
export interface PlacedBalloon { readonly order: number; readonly dialogueId: string; readonly speakerNameKo: string; readonly speakerNameEn: string; readonly text: string; readonly emotion: EmotionTone; readonly style: BalloonStyle; readonly box: RectBox; readonly tailStyle: TailStyle; readonly tailOriginX: number; readonly tailOriginY: number; readonly tailTipX: number; readonly tailTipY: number; readonly tailBaseLeftX: number; readonly tailBaseLeftY: number; readonly tailBaseRightX: number; readonly tailBaseRightY: number; readonly tailDirection: TailDirection; readonly mouthDistancePx: number; readonly faceOcclusionPct: number }
export interface PlacedSfx { readonly text: string; readonly tone: EmotionTone; readonly accentStyle: SfxAccentStyle; readonly box: RectBox; readonly centerX: number; readonly centerY: number; readonly rotationDeg: number; readonly fontSize: number; readonly faceOcclusionPct: number; readonly rationaleKo: string; readonly rationaleEn: string }
export interface LayoutProposalMetrics { readonly faceOcclusionPct: number; readonly totalProtectedOcclusionPct: number; readonly readingOrderValid: boolean; readonly marginBalanceScore: number; readonly balloonOverlapCount: number; readonly overallScore: number }
export interface BalloonSfxLayoutProposal { readonly id: string; readonly rank: 1 | 2 | 3; readonly strategyId: LayoutStrategyId; readonly titleKo: string; readonly titleEn: string; readonly summaryKo: string; readonly summaryEn: string; readonly balloons: readonly PlacedBalloon[]; readonly sfx: PlacedSfx; readonly metrics: LayoutProposalMetrics; readonly warningsKo: readonly string[]; readonly warningsEn: readonly string[] }
export interface ProposeLayoutsInput { readonly canvasWidth?: number; readonly canvasHeight?: number; readonly safeMargin?: number; readonly protectedZones: readonly ProtectedZone[]; readonly dialogues: readonly DialogueItem[] }
export interface BalloonSfxRecommendationBundle { readonly sourceDialogues?: readonly DialogueItem[]; readonly canvasWidth: number; readonly canvasHeight: number; readonly safeMargin: number; readonly grid: NegativeSpaceGrid; readonly proposals: readonly [BalloonSfxLayoutProposal, BalloonSfxLayoutProposal, BalloonSfxLayoutProposal] }
export interface CutLayoutSnapshot { readonly labelKo: string; readonly labelEn: string; readonly proposalId: string | null; readonly strategyId: LayoutStrategyId | null; readonly balloons: readonly PlacedBalloon[]; readonly sfx: PlacedSfx | null; readonly faceOcclusionPct: number; readonly readingOrderValid: boolean; readonly marginBalanceScore: number }
export interface PlacementSessionState { readonly status: PlacementSessionStatus; readonly baseline: CutLayoutSnapshot; readonly current: CutLayoutSnapshot; readonly previewingProposalId: string | null; readonly appliedProposalId: string | null; readonly canRevert: boolean; readonly revision: number }
export interface EmotionToneMeta { readonly id: EmotionTone; readonly labelKo: string; readonly labelEn: string; readonly defaultStyle: BalloonStyle; readonly tailStyle: TailStyle; readonly sfxPool: readonly string[]; readonly accentStyle: SfxAccentStyle }

export const EMOTION_TONE_META: readonly EmotionToneMeta[] = [
  { id: "normal", labelKo: "평온", labelEn: "Normal", defaultStyle: "oval", tailStyle: "pointed", sfxPool: ["스윽…", "정적", "두근"], accentStyle: "whisper" },
  { id: "whisper", labelKo: "속삭임", labelEn: "Whisper", defaultStyle: "whisper-dashed", tailStyle: "soft", sfxPool: ["스윽…", "정적", "두근"], accentStyle: "whisper" },
  { id: "shout", labelKo: "외침", labelEn: "Shout", defaultStyle: "shout-burst", tailStyle: "jagged", sfxPool: ["콰앙!", "버럭!", "쿵—"], accentStyle: "impact" },
  { id: "thought", labelKo: "속마음", labelEn: "Thought", defaultStyle: "thought-cloud", tailStyle: "thought-dots", sfxPool: ["두근", "정적", "스윽…"], accentStyle: "pulse" },
  { id: "tension", labelKo: "긴장", labelEn: "Tension", defaultStyle: "tension-jagged", tailStyle: "pointed", sfxPool: ["쿵—", "정적", "두근"], accentStyle: "tension" },
] as const;

export const BALLOON_STYLE_LABELS: Readonly<Record<BalloonStyle, { readonly ko: string; readonly en: string }>> = {
  oval: { ko: "타원", en: "Oval" },
  "shout-burst": { ko: "외침", en: "Shout" },
  "whisper-dashed": { ko: "속삭임", en: "Whisper" },
  "thought-cloud": { ko: "생각", en: "Thought" },
  "tension-jagged": { ko: "긴장", en: "Tension" },
};

const z = (id: string, kind: ProtectedZoneKind, labelKo: string, labelEn: string, x: number, y: number, width: number, height: number, weight: number): ProtectedZone => ({
  id, kind, labelKo, labelEn, box: { x, y, width, height }, weight,
});
const dlg = (id: string, speakerNameKo: string, speakerNameEn: string, text: string, mouthX: number, mouthY: number, emotion: EmotionTone): DialogueItem => ({
  id, speakerNameKo, speakerNameEn, text, mouthX, mouthY, emotion,
});

export const CUT_COMPOSITION_PRESETS: readonly CutCompositionPreset[] = [
  {
    id: "closeup-monologue", labelKo: "클로즈업 독백", labelEn: "Close-up Monologue",
    summaryKo: "정면 얼굴과 눈빛을 중앙에 두고 상·하단 여백에 독백과 긴장감을 쌓는 구도",
    summaryEn: "Centered portrait close-up using upper and lower space for inner monologue",
    canvasWidth: DEFAULT_CUT_WIDTH, canvasHeight: DEFAULT_CUT_HEIGHT,
    protectedZones: [
      z("z-face-1", "face", "주인공 얼굴", "Lead Face", 255, 425, 290, 325, 1.0),
      z("z-eyes-1", "eyes", "눈·시선", "Eyes & Gaze", 295, 520, 210, 74, 1.35),
      z("z-hand-1", "hand", "옷깃 쥔 손", "Collar Hand", 185, 785, 155, 140, 0.72),
      z("z-prop-1", "prop", "열쇠 펜던트", "Key Pendant", 525, 795, 130, 120, 0.65),
    ],
    dialogues: [
      dlg("d1", "지안", "Jian", "그날 들었던 목소리가 아직도 귓가에 맴돈다.", 400, 682, "thought"),
      dlg("d2", "지안", "Jian", "지금 문을 열면 다신 돌아갈 수 없어.", 400, 682, "tension"),
    ],
  },
  {
    id: "two-person-standoff", labelKo: "2인 대치", labelEn: "Two-Person Standoff",
    summaryKo: "좌상·우하 대각선으로 맞선 두 화자의 시선을 가리지 않고 3단 대화를 교차 배치",
    summaryEn: "Diagonal two-speaker confrontation with staggered three-beat vertical dialogue",
    canvasWidth: DEFAULT_CUT_WIDTH, canvasHeight: DEFAULT_CUT_HEIGHT,
    protectedZones: [
      z("z-face-l", "face", "강현 얼굴", "Kanghyun Face", 96, 315, 192, 220, 1.0),
      z("z-eyes-l", "eyes", "강현 눈", "Kanghyun Eyes", 122, 384, 142, 52, 1.35),
      z("z-face-r", "face", "서윤 얼굴", "Seoyun Face", 512, 585, 192, 220, 1.0),
      z("z-eyes-r", "eyes", "서윤 눈", "Seoyun Eyes", 538, 656, 142, 52, 1.35),
      z("z-hand-c", "hand", "맞잡은 팔", "Clashing Hand", 332, 695, 136, 118, 0.72),
    ],
    dialogues: [
      dlg("d1", "강현", "Kanghyun", "여기까지 쫓아올 줄은 몰랐군.", 215, 486, "tension"),
      dlg("d2", "서윤", "Seoyun", "도망칠 생각 마! 이번엔 끝장낸다!!", 586, 758, "shout"),
      dlg("d3", "강현", "Kanghyun", "…아직 패를 다 보여주진 않았어.", 215, 486, "whisper"),
    ],
  },
  {
    id: "action-impact", labelKo: "액션 타격", labelEn: "Action Impact",
    summaryKo: "타격 순간의 주먹·충격점과 얼굴을 살리고 상·하단에 외침 말풍선과 강렬한 SFX 배치",
    summaryEn: "Dynamic strike preserving impact fist and face with explosive shout balloon and SFX",
    canvasWidth: DEFAULT_CUT_WIDTH, canvasHeight: DEFAULT_CUT_HEIGHT,
    protectedZones: [
      z("z-face-a", "face", "진우 얼굴", "Jinwoo Face", 432, 392, 196, 216, 1.0),
      z("z-eyes-a", "eyes", "진우 눈", "Jinwoo Eyes", 462, 458, 138, 50, 1.35),
      z("z-hand-a", "hand", "타격 주먹", "Strike Fist", 184, 545, 204, 158, 0.72),
      z("z-prop-a", "prop", "충격 파편", "Impact Debris", 116, 432, 128, 108, 0.65),
    ],
    dialogues: [
      dlg("d1", "진우", "Jinwoo", "지금이다! 정면으로 뚫는다!!", 516, 556, "shout"),
      dlg("d2", "진우", "Jinwoo", "이 한 방으로 전세를 뒤집어!", 516, 556, "tension"),
    ],
  },
  {
    id: "romance-twoshot", labelKo: "로맨스 투샷", labelEn: "Romance Two-Shot",
    summaryKo: "나란히 선 두 인물의 눈맞춤과 맞잡은 손을 보호하며 속삭임·심박 SFX를 조화롭게 배치",
    summaryEn: "Side-by-side romance frame protecting eye contact and linked hands with heartbeat SFX",
    canvasWidth: DEFAULT_CUT_WIDTH, canvasHeight: DEFAULT_CUT_HEIGHT,
    protectedZones: [
      z("z-face-ra", "face", "하린 얼굴", "Harin Face", 152, 440, 182, 210, 1.0),
      z("z-eyes-ra", "eyes", "하린 눈", "Harin Eyes", 178, 508, 130, 48, 1.35),
      z("z-face-rb", "face", "도현 얼굴", "Dohyun Face", 468, 458, 182, 210, 1.0),
      z("z-eyes-rb", "eyes", "도현 눈", "Dohyun Eyes", 494, 526, 130, 48, 1.35),
      z("z-hand-r", "hand", "맞잡은 손", "Linked Hands", 332, 702, 136, 112, 0.72),
      z("z-prop-r", "prop", "꽃다발", "Bouquet", 642, 694, 92, 106, 0.65),
    ],
    dialogues: [
      dlg("d1", "하린", "Harin", "손이… 조금 떨리고 있어.", 254, 604, "whisper"),
      dlg("d2", "도현", "Dohyun", "심장 소리가 들릴 것 같아.", 544, 622, "thought"),
      dlg("d3", "도현", "Dohyun", "괜찮아, 천천히 걸어도 돼.", 544, 622, "normal"),
    ],
  },
  {
    id: "corridor-chase", labelKo: "복도 추격", labelEn: "Corridor Chase",
    summaryKo: "전경 도주자와 후경 추격자, 비상구 표지판을 살려 긴박한 세로 추격 리듬을 구성",
    summaryEn: "Deep-perspective corridor chase preserving runner, pursuer, and exit sign",
    canvasWidth: DEFAULT_CUT_WIDTH, canvasHeight: DEFAULT_CUT_HEIGHT,
    protectedZones: [
      z("z-face-run", "face", "유진 얼굴", "Yujin Face", 438, 468, 184, 210, 1.0),
      z("z-eyes-run", "eyes", "유진 눈", "Yujin Eyes", 464, 534, 132, 48, 1.35),
      z("z-face-pur", "face", "추격자 얼굴", "Pursuer Face", 184, 326, 120, 142, 1.0),
      z("z-hand-run", "hand", "문고리 손", "Door Handle Hand", 348, 698, 142, 114, 0.72),
      z("z-prop-exit", "prop", "비상구 표지", "Exit Sign", 622, 316, 92, 122, 0.65),
    ],
    dialogues: [
      dlg("d1", "유진", "Yujin", "발소리가 점점 가까워져…!", 520, 632, "tension"),
      dlg("d2", "추격자", "Pursuer", "거기 서! 비상구 쪽을 막아라!", 244, 430, "shout"),
      dlg("d3", "유진", "Yujin", "코너만 돌면 옥상 계단이야.", 520, 632, "whisper"),
    ],
  },
] as const;

interface StrategySpec {
  readonly id: LayoutStrategyId; readonly titleKo: string; readonly titleEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly idealMouthDist: number; readonly mouthWeight: number; readonly haloWeight: number;
  readonly zPatternWeight: number; readonly verticalStepMin: number; readonly sfxScale: number; readonly sfxPoolIndex: number;
}

const LAYOUT_STRATEGIES: readonly [StrategySpec, StrategySpec, StrategySpec] = [
  {
    id: "balanced-flow", titleKo: "균형 시선 흐름", titleEn: "Balanced Scroll Flow",
    summaryKo: "세로 Z-패턴 읽기 순서와 화자 근접도, 상·하단 여백을 균형 있게 배분합니다.",
    summaryEn: "Balances vertical Z-pattern flow, mouth proximity, and edge breathing room.",
    idealMouthDist: 255, mouthWeight: 26, haloWeight: 55, zPatternWeight: 28, verticalStepMin: 56, sfxScale: 1.0, sfxPoolIndex: 0,
  },
  {
    id: "compact-anchor", titleKo: "화자 밀착 집중", titleEn: "Speaker Anchor Focus",
    summaryKo: "꼬리 길이를 줄여 화자 인식 속도를 높이고 반대 여백에 한글 효과음을 세웁니다.",
    summaryEn: "Shortens balloon tails near speaker mouths and counterbalances SFX in open space.",
    idealMouthDist: 185, mouthWeight: 42, haloWeight: 38, zPatternWeight: 16, verticalStepMin: 44, sfxScale: 0.94, sfxPoolIndex: 1,
  },
  {
    id: "dramatic-breathing", titleKo: "여백 강조 연출", titleEn: "Dramatic Breathing Space",
    summaryKo: "인물 주변 여백을 넉넉히 비워 감정선과 큰 효과음의 시각적 여운을 키웁니다.",
    summaryEn: "Maximizes negative space around figures with generous vertical cadence and bold SFX.",
    idealMouthDist: 330, mouthWeight: 16, haloWeight: 92, zPatternWeight: 24, verticalStepMin: 84, sfxScale: 1.12, sfxPoolIndex: 2,
  },
];

const SFX_SPECS: Readonly<Record<string, { readonly size: number; readonly rot: number; readonly ko: string; readonly en: string }>> = {
  "콰앙!": { size: 66, rot: -13, ko: "외침·타격 구도의 충격 에너지를 대각선 여백에 각인", en: "Anchors impact energy in open diagonal space" },
  "버럭!": { size: 60, rot: -10, ko: "격앙된 대사의 성량을 짧고 날카로운 한글 의성어로 강조", en: "Amplifies raised-voice punch with sharp Hangul SFX" },
  "쿵—": { size: 62, rot: -5, ko: "긴장감이 내려앉는 컷 하단 무게중심에 묵직한 울림 배치", en: "Grounds tension drop with heavy weighted resonance" },
  "두근": { size: 52, rot: -7, ko: "인물 표정과 손짓을 가리지 않는 위치에 심박 리듬 연출", en: "Places heartbeat cue cleanly away from faces and hands" },
  "스윽…": { size: 48, rot: -6, ko: "속삭임·이동 흐름을 방해하지 않는 부드러운 잔향 효과음", en: "Adds quiet movement texture without crowding speech" },
  "정적": { size: 46, rot: 0, ko: "수평 정렬된 정적 효과음으로 대사 사이의 호흡을 강조", en: "Horizontal silence cue emphasizes emotional pause" },
};

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;
const expandRect = (b: RectBox, pad: number): RectBox => ({ x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 });
const boxCenter = (b: RectBox): Point2D => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const isFaceCritical = (zone: ProtectedZone): boolean => zone.kind === "face" || zone.kind === "eyes";

export function clampSafeMargin(margin: number): number {
  return Number.isFinite(margin) ? Math.round(clamp(margin, MIN_SAFE_MARGIN, MAX_SAFE_MARGIN)) : DEFAULT_SAFE_MARGIN;
}

export function getCutPreset(id: CutPresetId): CutCompositionPreset {
  return CUT_COMPOSITION_PRESETS.find((p) => p.id === id) ?? CUT_COMPOSITION_PRESETS[0];
}

export function getEmotionToneMeta(tone: EmotionTone): EmotionToneMeta {
  return EMOTION_TONE_META.find((m) => m.id === tone) ?? EMOTION_TONE_META[0];
}

export function rectIntersectionArea(a: RectBox, b: RectBox): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function computeZoneOcclusionPct(boxes: readonly RectBox[], zones: readonly ProtectedZone[]): number {
  if (boxes.length === 0 || zones.length === 0) return 0;
  let totalZoneArea = 0;
  let totalOverlapArea = 0;
  for (const zone of zones) {
    const zArea = Math.max(1, zone.box.width * zone.box.height);
    totalZoneArea += zArea;
    let overlap = 0;
    for (const box of boxes) overlap += rectIntersectionArea(box, zone.box);
    totalOverlapArea += Math.min(zArea, overlap);
  }
  return totalZoneArea <= 0 || totalOverlapArea <= 0 ? 0 : Math.max(0.1, round1(clamp((totalOverlapArea / totalZoneArea) * 100, 0, 100)));
}

/** 800×1200 컷의 2D 네거티브 스페이스 점수 그리드를 순수 결정론적으로 계산한다. */
export function computeNegativeSpaceGrid(input: NegativeSpaceGridInput): NegativeSpaceGrid {
  assertPlacementGridInput(input);
  const canvasWidth = Math.max(320, Math.round(input.canvasWidth ?? DEFAULT_CUT_WIDTH));
  const canvasHeight = Math.max(480, Math.round(input.canvasHeight ?? DEFAULT_CUT_HEIGHT));
  const safeMargin = clampSafeMargin(input.safeMargin ?? DEFAULT_SAFE_MARGIN);
  const cols = clamp(Math.round(input.cols ?? DEFAULT_GRID_COLS), 6, 32);
  const rows = clamp(Math.round(input.rows ?? DEFAULT_GRID_ROWS), 8, 48);
  const cellWidth = canvasWidth / cols;
  const cellHeight = canvasHeight / rows;
  const cellArea = Math.max(1, cellWidth * cellHeight);
  const cells: NegativeSpaceCell[] = [];
  let totalScore = 0;
  let openCount = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const box: RectBox = { x: Math.round(col * cellWidth), y: Math.round(row * cellHeight), width: Math.round(cellWidth), height: Math.round(cellHeight) };
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      let rawOverlap = 0;
      let weightedOverlap = 0;
      let faceOverlap = 0;
      for (const zone of input.protectedZones) {
        const area = rectIntersectionArea(box, zone.box);
        if (area > 0) {
          const ratio = clamp(area / cellArea, 0, 1);
          rawOverlap = Math.max(rawOverlap, ratio);
          weightedOverlap += ratio * zone.weight;
          if (isFaceCritical(zone)) faceOverlap = Math.max(faceOverlap, ratio);
        }
      }

      const occlusionRatio = rawOverlap > 0 ? Math.max(0.001, round1(clamp(rawOverlap, 0, 1) * 100) / 100) : 0;
      const faceOcclusionRatio = faceOverlap > 0 ? Math.max(0.001, round1(clamp(faceOverlap, 0, 1) * 100) / 100) : 0;
      const edgeClearance = Math.min(box.x, box.y, canvasWidth - (box.x + box.width), canvasHeight - (box.y + box.height));
      const safeMarginScore = edgeClearance >= safeMargin ? 1 : clamp((edgeClearance + cellWidth * 0.35) / Math.max(1, safeMargin + cellWidth * 0.35), 0.1, 0.85);
      const mouthProximityScore = input.focusMouth
        ? clamp(Math.exp(-Math.pow((Math.hypot(centerX - input.focusMouth.x, centerY - input.focusMouth.y) - 250) / 240, 2) / 2), 0.15, 1)
        : 0.72;
      let readingFlowScore = 0.8;
      if (input.preferredBand) {
        const { minY, maxY } = input.preferredBand;
        readingFlowScore = centerY >= minY && centerY <= maxY ? 1 : clamp(1 - (centerY < minY ? minY - centerY : centerY - maxY) / (canvasHeight * 0.45), 0.12, 0.9);
      }

      const score = Math.round(clamp(
        clamp(1 - weightedOverlap * 0.95, 0, 1) * 52 + safeMarginScore * 20 + mouthProximityScore * 14 + readingFlowScore * 14 - (faceOcclusionRatio > 0 ? 70 * faceOcclusionRatio + 20 : 0),
        0, 100,
      ));
      totalScore += score;
      if (occlusionRatio === 0 && edgeClearance >= safeMargin) openCount += 1;
      cells.push({
        col, row, box, centerX: Math.round(centerX), centerY: Math.round(centerY),
        occlusionRatio, faceOcclusionRatio,
        safeMarginScore: round1(safeMarginScore * 100) / 100,
        mouthProximityScore: round1(mouthProximityScore * 100) / 100,
        readingFlowScore: round1(readingFlowScore * 100) / 100,
        score,
      });
    }
  }

  const bestCells = [...cells].sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col).slice(0, 12);
  return {
    canvasWidth, canvasHeight, safeMargin, cols, rows, cellWidth: round1(cellWidth), cellHeight: round1(cellHeight),
    cells, averageScore: Math.round(totalScore / Math.max(1, cells.length)),
    openCellRatio: round1((openCount / Math.max(1, cells.length)) * 100) / 100, bestCells,
  };
}

function estimateBalloonSize(dialogue: DialogueItem, innerWidth: number, compactScale: number): { readonly width: number; readonly height: number } {
  const len = (dialogue.text.trim() || "…").length;
  const baseW = dialogue.emotion === "shout" ? 250 + Math.min(82, len * 3.8) : dialogue.emotion === "whisper" ? 200 + Math.min(72, len * 3.4) : 220 + Math.min(84, len * 3.6);
  const width = Math.round(clamp(baseW * compactScale, 176, Math.min(316, innerWidth - 16)));
  const lines = clamp(Math.ceil(len / Math.max(8, Math.floor((width - 42) / 14))), 1, 3);
  return { width, height: Math.round(clamp((54 + lines * 24 + (dialogue.emotion === "shout" ? 14 : 6)) * compactScale, 76, 134)) };
}

function computeTailGeometry(box: RectBox, mouthX: number, mouthY: number, eyesZones: readonly ProtectedZone[]) {
  const c = boxCenter(box);
  const dx = mouthX - c.x;
  const dy = mouthY - c.y;
  const fullDist = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / fullDist;
  const uy = dy / fullDist;
  const scale = 1 / Math.max(0.001, Math.hypot(ux / (box.width * 0.44), uy / (box.height * 0.44)));
  const originX = c.x + ux * scale;
  const originY = c.y + uy * scale;
  const desiredLen = clamp(Math.max(0, fullDist - scale) - 30, 26, 148);
  let tipX = originX + ux * desiredLen;
  let tipY = originY + uy * desiredLen;

  for (const eye of eyesZones) {
    const p = expandRect(eye.box, 8);
    if (tipX >= p.x && tipX <= p.x + p.width && tipY >= p.y && tipY <= p.y + p.height) {
      const safeLen = Math.max(22, desiredLen * 0.52);
      tipX = originX + ux * safeLen;
      tipY = originY + uy * safeLen;
    }
  }

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const tailDirection: TailDirection =
    deg >= -22.5 && deg < 22.5 ? "right"
      : deg >= 22.5 && deg < 67.5 ? "bottom-right"
        : deg >= 67.5 && deg < 112.5 ? "bottom"
          : deg >= 112.5 && deg < 157.5 ? "bottom-left"
            : deg >= 157.5 || deg < -157.5 ? "left"
              : deg >= -157.5 && deg < -112.5 ? "top-left"
                : deg >= -112.5 && deg < -67.5 ? "top" : "top-right";

  return {
    tailOriginX: Math.round(originX), tailOriginY: Math.round(originY),
    tailTipX: Math.round(tipX), tailTipY: Math.round(tipY),
    tailBaseLeftX: Math.round(originX - uy * 13), tailBaseLeftY: Math.round(originY + ux * 13),
    tailBaseRightX: Math.round(originX + uy * 13), tailBaseRightY: Math.round(originY - ux * 13),
    tailDirection, mouthDistancePx: Math.round(fullDist),
  };
}

function sampleGridScoreForBox(grid: NegativeSpaceGrid, box: RectBox): number {
  let sum = 0;
  let count = 0;
  for (const cell of grid.cells) {
    if (rectIntersectionArea(box, cell.box) > 0) { sum += cell.score; count += 1; }
  }
  return count > 0 ? sum / count : 50;
}

function selectKoreanSfx(dialogues: readonly DialogueItem[], strategy: StrategySpec) {
  const combined = dialogues.map((d) => d.text).join(" ");
  const dominant = dialogues.find((d) => d.emotion === "shout") ?? dialogues.find((d) => d.emotion === "tension") ??
    dialogues.find((d) => d.emotion === "thought") ?? dialogues.find((d) => d.emotion === "whisper") ?? dialogues[0];
  const tone: EmotionTone = dominant?.emotion ?? "normal";
  const meta = getEmotionToneMeta(tone);
  let text = meta.sfxPool[strategy.sfxPoolIndex % meta.sfxPool.length] ?? "스윽…";

  if (strategy.sfxPoolIndex === 0) {
    if (/심장|떨리|좋아|두근|손이/u.test(combined)) text = "두근";
    else if (/뚫|방어|충격|터져|정면|끝장|!!/u.test(combined)) text = "콰앙!";
    else if (/도망|거기 서|멈춰|비상구/u.test(combined)) text = "버럭!";
    else if (/발소리|조용|코너|귓가/u.test(combined)) text = "스윽…";
    else if (/문|돌아갈 수 없|패를/u.test(combined)) text = "쿵—";
  } else if (strategy.sfxPoolIndex === 1) {
    if (/심장|떨리|두근|손이/u.test(combined)) text = "두근";
    else if (/!!|뚫|끝장|서!/u.test(combined)) text = "버럭!";
  } else if (strategy.sfxPoolIndex === 2 && /심장|손이|떨리/u.test(combined)) {
    text = "정적";
  }

  const spec = SFX_SPECS[text] ?? { size: 50, rot: -6, ko: "컷 감정선에 맞춘 한글 효과음 추천", en: "Emotion-matched Hangul SFX placement" };
  const rotOffset = strategy.id === "compact-anchor" ? 4 : strategy.id === "dramatic-breathing" ? -3 : 0;
  return {
    text, tone, accentStyle: meta.accentStyle,
    fontSize: Math.round(clamp(spec.size * strategy.sfxScale, 40, 74)),
    rotationDeg: text === "정적" ? 0 : clamp(spec.rot + rotOffset, -18, 16),
    rationaleKo: spec.ko, rationaleEn: spec.en,
  };
}

/** 세로 스크롤 읽기 순서(y1 < y2 또는 동일 높이 Z-패턴 x1 < x2) 일관성을 검증한다. */
export function validateReadingOrder(balloons: readonly PlacedBalloon[]): boolean {
  for (let i = 1; i < balloons.length; i += 1) {
    const prev = balloons[i - 1];
    const cur = balloons[i];
    if (prev && cur && !(cur.box.y > prev.box.y || (Math.abs(cur.box.y - prev.box.y) <= 24 && cur.box.x > prev.box.x))) return false;
  }
  return true;
}

function countBalloonOverlaps(balloons: readonly PlacedBalloon[]): number {
  let overlaps = 0;
  for (let i = 0; i < balloons.length; i += 1) {
    for (let j = i + 1; j < balloons.length; j += 1) {
      const a = balloons[i];
      const b = balloons[j];
      if (a && b && rectIntersectionArea(a.box, b.box) > 0) overlaps += 1;
    }
  }
  return overlaps;
}

function computeMarginBalanceScore(boxes: readonly RectBox[], w: number, h: number, m: number): number {
  if (boxes.length === 0) return 100;
  let inside = 0;
  let sumX = 0;
  let minEdge = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    const clearance = Math.min(box.x, box.y, w - (box.x + box.width), h - (box.y + box.height));
    minEdge = Math.min(minEdge, clearance);
    if (clearance >= m - 1) inside += 1;
    sumX += box.x + box.width / 2;
  }
  return Math.round(clamp(
    (inside / boxes.length) * 62 +
      clamp(1 - Math.abs(sumX / boxes.length - w / 2) / (w * 0.42), 0, 1) * 23 +
      clamp(minEdge / Math.max(1, m * 1.4), 0, 1) * 15,
    0, 100,
  ));
}

function findBestBalloonBox(
  dialogue: DialogueItem, index: number, total: number, strategy: StrategySpec,
  w: number, h: number, m: number, grid: NegativeSpaceGrid,
  faceZones: readonly ProtectedZone[], otherZones: readonly ProtectedZone[], placed: readonly RectBox[],
): RectBox {
  const innerW = Math.max(200, w - m * 2);
  let bestBox: RectBox | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const scale of [1.0, 0.88] as const) {
    const { width, height } = estimateBalloonSize(dialogue, innerW, scale);
    const prev = placed[placed.length - 1];
    const rawMaxY = h - m - height - (total - 1 - index) * 96;
    const minY = prev ? Math.min(prev.y + strategy.verticalStepMin, Math.max(prev.y + 28, rawMaxY)) : m;
    const maxY = Math.max(minY, rawMaxY);
    const maxX = Math.max(m, w - m - width);
    const bandY = m + ((h - m * 2 - height) * (index + 0.35)) / Math.max(1, total);
    const targetX = index % 2 === 1 ? w - m - width - 16 : m + 16;

    let scaleBest: RectBox | null = null;
    let scaleScore = Number.NEGATIVE_INFINITY;
    let zeroFaceFound = false;

    for (let y = minY; y <= maxY; y += 20) {
      for (let x = m; x <= maxX; x += 20) {
        const cand: RectBox = { x: Math.round(x), y: Math.round(y), width, height };
        if (placed.some((p) => rectIntersectionArea(cand, expandRect(p, 12)) > 0)) continue;
        let faceHit = 0;
        let haloHit = 0;
        for (const fz of faceZones) {
          faceHit += rectIntersectionArea(cand, fz.box);
          haloHit += rectIntersectionArea(cand, expandRect(fz.box, 16));
        }
        let otherHit = 0;
        for (const oz of otherZones) otherHit += rectIntersectionArea(cand, oz.box);

        const area = Math.max(1, width * height);
        const c = boxCenter(cand);
        const mouthDist = Math.hypot(c.x - dialogue.mouthX, c.y - dialogue.mouthY);
        let score =
          sampleGridScoreForBox(grid, cand) * 0.45 +
          Math.exp(-Math.pow((mouthDist - strategy.idealMouthDist) / 220, 2)) * strategy.mouthWeight +
          Math.exp(-Math.pow((cand.y - bandY) / 290, 2)) * 22 +
          Math.exp(-Math.pow((cand.x - targetX) / 280, 2)) * strategy.zPatternWeight +
          (scale === 1.0 ? 8 : 0) - (haloHit / area) * strategy.haloWeight - (otherHit / area) * 560;
        if (faceHit > 0) score -= 25_000 + (faceHit / area) * 80_000;
        else zeroFaceFound = true;

        if (score > scaleScore) { scaleScore = score; scaleBest = cand; }
      }
    }
    if (scaleBest && scaleScore > bestScore) { bestScore = scaleScore; bestBox = scaleBest; }
    if (zeroFaceFound && scale === 1.0) break;
  }

  if (bestBox) return bestBox;
  const fb = estimateBalloonSize(dialogue, innerW, 0.85);
  return { x: m, y: clamp(m + index * 116, m, h - m - fb.height), width: fb.width, height: fb.height };
}

function placeSfxInNegativeSpace(
  sfxSpec: ReturnType<typeof selectKoreanSfx>, strategy: StrategySpec,
  w: number, h: number, m: number, grid: NegativeSpaceGrid,
  faceZones: readonly ProtectedZone[], otherZones: readonly ProtectedZone[], placed: readonly RectBox[],
): PlacedSfx {
  const sfxW = Math.round(clamp(Math.max(2, sfxSpec.text.length) * sfxSpec.fontSize * 0.92 + 28, 128, 260));
  const sfxH = Math.round(clamp(sfxSpec.fontSize * 1.42 + 16, 74, 126));
  const meanX = placed.length > 0 ? placed.reduce((a, b) => a + b.x + b.width / 2, 0) / placed.length : w * 0.5;
  const meanY = placed.length > 0 ? placed.reduce((a, b) => a + b.y + b.height / 2, 0) / placed.length : h * 0.35;
  const cwX = w - meanX;
  const cwY = strategy.id === "dramatic-breathing" ? h * 0.82 : clamp(h - meanY, m + 80, h - m - sfxH - 20);
  const maxX = Math.max(m, w - m - sfxW);
  const maxY = Math.max(m, h - m - sfxH);
  const area = Math.max(1, sfxW * sfxH);

  let bestBox: RectBox = { x: m, y: maxY, width: sfxW, height: sfxH };
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let y = m; y <= maxY; y += 22) {
    for (let x = m; x <= maxX; x += 22) {
      const cand: RectBox = { x: Math.round(x), y: Math.round(y), width: sfxW, height: sfxH };
      let bHit = 0;
      for (const b of placed) bHit += rectIntersectionArea(cand, expandRect(b, 14));
      let fHit = 0;
      for (const fz of faceZones) fHit += rectIntersectionArea(cand, expandRect(fz.box, 6));
      let oHit = 0;
      for (const oz of otherZones) oHit += rectIntersectionArea(cand, oz.box);
      const c = boxCenter(cand);
      let score = sampleGridScoreForBox(grid, cand) * 0.6 + Math.exp(-Math.pow(Math.hypot(c.x - cwX, c.y - cwY) / 360, 2)) * 28 - (oHit / area) * 420;
      if (bHit > 0) score -= 18_000 + (bHit / area) * 40_000;
      if (fHit > 0) score -= 28_000 + (fHit / area) * 60_000;
      if (score > bestScore) { bestScore = score; bestBox = cand; }
    }
  }
  const center = boxCenter(bestBox);
  return {
    text: sfxSpec.text, tone: sfxSpec.tone, accentStyle: sfxSpec.accentStyle, box: bestBox,
    centerX: Math.round(center.x), centerY: Math.round(center.y),
    rotationDeg: sfxSpec.rotationDeg, fontSize: sfxSpec.fontSize,
    faceOcclusionPct: computeZoneOcclusionPct([bestBox], faceZones),
    rationaleKo: sfxSpec.rationaleKo, rationaleEn: sfxSpec.rationaleEn,
  };
}

/** 비파괴 Top-3 말풍선·꼬리·한글 SFX 배치안을 결정론적으로 생성한다. */
export function proposeBalloonSfxLayoutsTop3(input: ProposeLayoutsInput): BalloonSfxRecommendationBundle {
  assertPlacementInput(input);
  const canvasWidth = Math.max(320, Math.round(input.canvasWidth ?? DEFAULT_CUT_WIDTH));
  const canvasHeight = Math.max(480, Math.round(input.canvasHeight ?? DEFAULT_CUT_HEIGHT));
  const safeMargin = clampSafeMargin(input.safeMargin ?? DEFAULT_SAFE_MARGIN);
  const dialogues = input.dialogues.slice(0, MAX_DIALOGUE_BALLOONS);
  const faceZones = input.protectedZones.filter(isFaceCritical);
  const eyesZones = input.protectedZones.filter((zone) => zone.kind === "eyes");
  const otherZones = input.protectedZones.filter((zone) => !isFaceCritical(zone));

  const grid = computeNegativeSpaceGrid({
    canvasWidth, canvasHeight, protectedZones: input.protectedZones, safeMargin,
    focusMouth: dialogues[0] ? { x: dialogues[0].mouthX, y: dialogues[0].mouthY } : undefined,
  });

  const rawProposals: BalloonSfxLayoutProposal[] = LAYOUT_STRATEGIES.map((strategy) => {
    const placedBalloons: PlacedBalloon[] = [];
    const placedBoxes: RectBox[] = [];
    for (let i = 0; i < dialogues.length; i += 1) {
      const d = dialogues[i];
      if (!d) continue;
      const box = findBestBalloonBox(d, i, dialogues.length, strategy, canvasWidth, canvasHeight, safeMargin, grid, faceZones, otherZones, placedBoxes);
      placedBoxes.push(box);
      const toneMeta = getEmotionToneMeta(d.emotion);
      placedBalloons.push({
        order: i + 1, dialogueId: d.id, speakerNameKo: d.speakerNameKo, speakerNameEn: d.speakerNameEn,
        text: d.text, emotion: d.emotion, style: toneMeta.defaultStyle, box, tailStyle: toneMeta.tailStyle,
        ...computeTailGeometry(box, d.mouthX, d.mouthY, eyesZones),
        faceOcclusionPct: computeZoneOcclusionPct([box], faceZones),
      });
    }

    const sfx = placeSfxInNegativeSpace(selectKoreanSfx(dialogues, strategy), strategy, canvasWidth, canvasHeight, safeMargin, grid, faceZones, otherZones, placedBoxes);
    const allBoxes: readonly RectBox[] = [...placedBoxes, sfx.box];
    const faceOcclusionPct = computeZoneOcclusionPct(allBoxes, faceZones);
    const totalProtectedOcclusionPct = computeZoneOcclusionPct(allBoxes, input.protectedZones);
    const readingOrderValid = validateReadingOrder(placedBalloons);
    const marginBalanceScore = computeMarginBalanceScore(allBoxes, canvasWidth, canvasHeight, safeMargin);
    const balloonOverlapCount = countBalloonOverlaps(placedBalloons);
    const avgGridScore = allBoxes.reduce((acc, b) => acc + sampleGridScoreForBox(grid, b), 0) / Math.max(1, allBoxes.length);
    const avgMouthDist = placedBalloons.length > 0 ? placedBalloons.reduce((acc, b) => acc + b.mouthDistancePx, 0) / placedBalloons.length : 220;
    const overallScore = Math.round(clamp(
      avgGridScore * 0.34 + marginBalanceScore * 0.28 + clamp(100 - Math.abs(avgMouthDist - 235) * 0.16, 55, 100) * 0.18 +
        (readingOrderValid ? 20 : 0) - faceOcclusionPct * 3.5 - totalProtectedOcclusionPct * 0.6 - balloonOverlapCount * 22,
      0, 100,
    ));

    const warningsKo: string[] = [];
    const warningsEn: string[] = [];
    if (faceOcclusionPct > 0) {
      warningsKo.push(`얼굴·눈 보호 영역 가림률 ${faceOcclusionPct}% 감지 — 여백 안전거리를 줄여 보세요.`);
      warningsEn.push(`Face/eye occlusion at ${faceOcclusionPct}% — try reducing safe margin.`);
    }
    if (!readingOrderValid) {
      warningsKo.push("세로 스크롤 읽기 순서 역전 가능성을 점검하세요.");
      warningsEn.push("Check vertical scroll reading order for potential reversal.");
    }

    return {
      id: `proposal-${strategy.id}`, rank: 1, strategyId: strategy.id,
      titleKo: strategy.titleKo, titleEn: strategy.titleEn, summaryKo: strategy.summaryKo, summaryEn: strategy.summaryEn,
      balloons: placedBalloons, sfx,
      metrics: { faceOcclusionPct, totalProtectedOcclusionPct, readingOrderValid, marginBalanceScore, balloonOverlapCount, overallScore },
      warningsKo, warningsEn,
    };
  });

  const ranked = [...rawProposals]
    .sort((a, b) => a.metrics.faceOcclusionPct - b.metrics.faceOcclusionPct || b.metrics.overallScore - a.metrics.overallScore)
    .map((p, idx) => ({ ...p, rank: (idx + 1) as 1 | 2 | 3 }));

  const [first, second, third] = ranked;
  if (!first || !second || !third) throw new Error("Top-3 proposals failed to materialize.");
  return { sourceDialogues: input.dialogues.map((item) => ({ id: item.id, speakerNameKo: item.speakerNameKo, speakerNameEn: item.speakerNameEn, text: item.text, mouthX: item.mouthX, mouthY: item.mouthY, emotion: item.emotion })), canvasWidth, canvasHeight, safeMargin, grid, proposals: [first, second, third] };
}

export function createBaselineSnapshot(): CutLayoutSnapshot {
  return {
    labelKo: "원본 컷 (말풍선·SFX 미배치)", labelEn: "Original Cut (Unplaced Baseline)",
    proposalId: null, strategyId: null, balloons: [], sfx: null, faceOcclusionPct: 0, readingOrderValid: true, marginBalanceScore: 100,
  };
}

export function snapshotFromProposal(p: BalloonSfxLayoutProposal): CutLayoutSnapshot {
  assertPlacementExport(p);
  return {
    labelKo: `${p.rank}안 · ${p.titleKo} 적용됨`, labelEn: `Applied · #${p.rank} ${p.titleEn}`,
    proposalId: p.id, strategyId: p.strategyId, balloons: p.balloons, sfx: p.sfx,
    faceOcclusionPct: p.metrics.faceOcclusionPct, readingOrderValid: p.metrics.readingOrderValid, marginBalanceScore: p.metrics.marginBalanceScore,
  };
}

export function createPlacementSessionState(baseline?: CutLayoutSnapshot): PlacementSessionState {
  const base = baseline ?? createBaselineSnapshot();
  assertPlacementExport(base);
  return { status: "baseline", baseline: base, current: base, previewingProposalId: null, appliedProposalId: null, canRevert: false, revision: 0 };
}

export function previewLayoutProposal(state: PlacementSessionState, proposalId: string | null): PlacementSessionState {
  assertPlacementExport(state);
  const nextPreviewId = proposalId && state.previewingProposalId === proposalId ? null : proposalId;
  const status: PlacementSessionStatus = nextPreviewId ? "previewing" : state.appliedProposalId ? "applied" : state.status === "reverted" ? "reverted" : "baseline";
  return { ...state, status, previewingProposalId: nextPreviewId };
}

export function applyLayoutProposal(state: PlacementSessionState, proposal: BalloonSfxLayoutProposal): PlacementSessionState {
  assertPlacementExport(state);
  return { ...state, status: "applied", current: snapshotFromProposal(proposal), previewingProposalId: null, appliedProposalId: proposal.id, canRevert: true, revision: state.revision + 1 };
}

export function revertLayoutProposal(state: PlacementSessionState): PlacementSessionState {
  assertPlacementExport(state);
  if (!state.canRevert && !state.previewingProposalId) return state;
  return { ...state, status: "reverted", current: state.baseline, previewingProposalId: null, appliedProposalId: null, canRevert: false, revision: state.revision + 1 };
}

export { exportLayoutProposalJson, exportLayoutProposalSvg, buildBalloonOutlinePath } from "./placement-output";
