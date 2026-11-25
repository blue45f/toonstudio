/**
 * Wave 43E — 한국 상업 웹툰 세로 스크롤 컷 분할 · 여백(Gutter) 리듬 · 대사 호흡 연출 엔진.
 *
 * - 플랫폼 규격 3종: `naver-800`, `kakao-690`, `global-1080`
 * - 8대 상업 웹툰 세로 연출 리듬 템플릿 및 플랫폼 비례 스케일링
 * - 독자 엄지 스크롤 속도 기반 컷 체류 시간 · 침묵 호흡 · 긴장도 곡선 · 단조로움 경고(`analyzeScrollRhythm`)
 * - 리듬 단조로움 및 규격 이탈 자동 보정(`autoBalanceGutters`)
 * - 순수 시맨틱 `currentColor` · OKLCH SVG 세로 비트 스트립(`buildRhythmStripSvg`) 및 JSON(`exportPanelRhythmJson`)
 */

import { assertExportAnalysis, normalizePanelInputs, PANEL_RHYTHM_TEMPLATE_IDS, requireChoice, requireFinite, WEBTOON_PLATFORM_IDS } from "./panel-rhythm-input-contract";

export { MAX_RHYTHM_PANELS, PANEL_RHYTHM_TEMPLATE_IDS, WEBTOON_PLATFORM_IDS } from "./panel-rhythm-input-contract";

export type WebtoonPlatformPresetId = "naver-800" | "kakao-690" | "global-1080";
export type PanelRhythmTemplateId =
  | "action-3beat-impact" | "romance-silence-longscroll" | "thriller-blackout-reveal" | "slice-4cut-comedy"
  | "flashback-sepia-overlap" | "cliffhanger-ending-drop" | "dialogue-zigzag-banter" | "panorama-wide-breather";
export type PanelBeatRole = "establishing" | "dialogue" | "closeup" | "action" | "silence" | "reveal" | "cliffhanger" | "panorama";
export type PanelShapeKind = "standard" | "wide-bleed" | "slanted" | "floating" | "vertical-long" | "blackout-transition";
export type VisualDensityLevel = "low" | "medium" | "high";
export type PanelPaceTag = "rapid" | "steady" | "deliberate" | "suspense";
export type RhythmBackdropTone = "paper" | "noir" | "sepia" | "warm-tint";
export type RhythmWarningCode =
  | "monotone-gutter-streak" | "gutter-too-narrow" | "gutter-excessive-void"
  | "dialogue-overcrowded" | "flat-tension-curve" | "weak-cliffhanger-drop";
export type RhythmWarningSeverity = "info" | "warn" | "critical";

export interface WebtoonPlatformSpec {
  readonly id: WebtoonPlatformPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string; readonly widthPx: number;
  readonly recommendedGutterMinPx: number; readonly recommendedGutterMaxPx: number;
  readonly idealAverageGutterPx: number; readonly viewportHeightPx: number;
  readonly defaultScrollSpeedPxPerSec: number; readonly pacingNoteKo: string; readonly pacingNoteEn: string;
}

export interface PanelBeatInput {
  readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly role: PanelBeatRole;
  readonly heightPx: number; readonly gutterAfterPx: number; readonly dialogueCharCount: number;
  readonly shape: PanelShapeKind; readonly visualDensity: VisualDensityLevel;
}

export interface PanelRhythmTemplateSpec {
  readonly id: PanelRhythmTemplateId; readonly genreKo: string; readonly genreEn: string;
  readonly labelKo: string; readonly labelEn: string; readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly rhythmSignatureKo: string; readonly rhythmSignatureEn: string;
  readonly recommendedScrollSpeedPxPerSec: number; readonly backdropTone: RhythmBackdropTone;
  readonly defaultPanels: readonly PanelBeatInput[];
}

export interface AnalyzeScrollRhythmOptions {
  readonly panels: readonly PanelBeatInput[]; readonly platformId?: WebtoonPlatformPresetId;
  readonly scrollSpeedPxPerSec?: number; readonly readingCharsPerSec?: number;
  readonly templateId?: PanelRhythmTemplateId | null;
}

export interface PanelBeatAnalysis extends PanelBeatInput {
  readonly index: number; readonly topY: number; readonly bottomY: number; readonly gutterEndY: number;
  readonly scrollTransitSec: number; readonly dialogueReadSec: number; readonly visualInspectionSec: number;
  readonly dwellTimeSec: number; readonly silenceBreathSec: number; readonly totalBeatSec: number;
  readonly tensionScore: number; readonly paceTag: PanelPaceTag; readonly inMonotoneStreak: boolean;
}

export interface RhythmWarning {
  readonly code: RhythmWarningCode; readonly severity: RhythmWarningSeverity;
  readonly affectedIndices: readonly number[];
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
}

export interface ScrollRhythmSummary {
  readonly panelCount: number; readonly totalHeightPx: number; readonly totalPanelsHeightPx: number;
  readonly totalGutterHeightPx: number; readonly viewportScreensCount: number; readonly totalDwellSec: number;
  readonly totalSilenceSec: number; readonly totalExperienceSec: number; readonly averageDwellSec: number;
  readonly averageGutterPx: number; readonly gutterStdDevPx: number; readonly gutterVarianceRatio: number;
  readonly peakTension: number; readonly peakTensionPanelIndex: number; readonly minTension: number;
  readonly tensionDynamicRange: number; readonly cliffhangerReadinessScore: number;
  readonly rhythmHealthScore: number; readonly monotoneGutterRunCount: number;
}

export interface ScrollRhythmAnalysis {
  readonly platform: WebtoonPlatformSpec; readonly templateId: PanelRhythmTemplateId | null;
  readonly scrollSpeedPxPerSec: number; readonly readingCharsPerSec: number;
  readonly panels: readonly PanelBeatAnalysis[]; readonly tensionCurve: readonly number[];
  readonly warnings: readonly RhythmWarning[]; readonly summary: ScrollRhythmSummary;
}

export interface GutterAdjustmentRecord {
  readonly panelId: string; readonly index: number; readonly beforeGutterPx: number;
  readonly afterGutterPx: number; readonly deltaPx: number; readonly reasonKo: string; readonly reasonEn: string;
}

export interface AutoBalanceGuttersResult {
  readonly panels: readonly PanelBeatInput[]; readonly adjustments: readonly GutterAdjustmentRecord[];
  readonly beforeAnalysis: ScrollRhythmAnalysis; readonly afterAnalysis: ScrollRhythmAnalysis;
}

export interface BuildRhythmStripSvgOptions {
  readonly stripWidthPx?: number; readonly showTensionRail?: boolean;
  readonly showGutterDimensions?: boolean; readonly locale?: "ko" | "en";
}

export const DEFAULT_SCROLL_SPEED_PX_PER_SEC = 420;
export const MIN_SCROLL_SPEED_PX_PER_SEC = 160;
export const MAX_SCROLL_SPEED_PX_PER_SEC = 1000;
export const DEFAULT_READING_CHARS_PER_SEC = 14;
export const MONOTONE_GUTTER_TOLERANCE_PX = 20;
export const MONOTONE_MIN_RUN_LENGTH = 3;

export const WEBTOON_PLATFORM_PRESETS: readonly WebtoonPlatformSpec[] = [
  {
    id: "naver-800", labelKo: "네이버 형식 가정 (800px)", labelEn: "Naver Layout Assumption (800px)",
    shortLabelKo: "네이버 800", shortLabelEn: "Naver 800", widthPx: 800,
    recommendedGutterMinPx: 160, recommendedGutterMaxPx: 420, idealAverageGutterPx: 260,
    viewportHeightPx: 1420, defaultScrollSpeedPxPerSec: 420,
    pacingNoteKo: "예제 여백 160~420px · 중속 엄지 스크롤과 서사 호흡 균형에 최적화",
    pacingNoteEn: "160-420px example gutters balanced for narrative pacing",
  },
  {
    id: "kakao-690", labelKo: "카카오 형식 가정 (690px)", labelEn: "Kakao Layout Assumption (690px)",
    shortLabelKo: "카카오 690", shortLabelEn: "Kakao 690", widthPx: 690,
    recommendedGutterMinPx: 110, recommendedGutterMaxPx: 300, idealAverageGutterPx: 190,
    viewportHeightPx: 1240, defaultScrollSpeedPxPerSec: 460,
    pacingNoteKo: "예제 여백 110~300px · 좁은 폭과 빠른 컷 전환으로 높은 몰입 템포 유지",
    pacingNoteEn: "110-300px brisk gutters tuned for rapid mobile thumb cadence",
  },
  {
    id: "global-1080", labelKo: "글로벌 HD 예제 (1080px)", labelEn: "Global HD Example (1080px)",
    shortLabelKo: "글로벌 1080", shortLabelEn: "Global 1080", widthPx: 1080,
    recommendedGutterMinPx: 200, recommendedGutterMaxPx: 520, idealAverageGutterPx: 340,
    viewportHeightPx: 1920, defaultScrollSpeedPxPerSec: 500,
    pacingNoteKo: "예제 여백 200~520px · 고해상도 풀블리드 컷과 시네마틱 여백 연출에 적합",
    pacingNoteEn: "200-520px cinematic gutters for high-resolution global releases",
  },
] as const;

function beat(
  id: string, labelKo: string, labelEn: string, role: PanelBeatRole,
  heightPx: number, gutterAfterPx: number, dialogueCharCount: number,
  shape: PanelShapeKind, visualDensity: VisualDensityLevel,
): PanelBeatInput {
  return { id, labelKo, labelEn, role, heightPx, gutterAfterPx, dialogueCharCount, shape, visualDensity };
}

export const PANEL_RHYTHM_TEMPLATES: readonly PanelRhythmTemplateSpec[] = [
  {
    id: "action-3beat-impact", genreKo: "액션", genreEn: "Action",
    labelKo: "액션 3박자 타격 임팩트", labelEn: "Action 3-Beat Impact",
    shortLabelKo: "액션 3박자", shortLabelEn: "3-Beat Action",
    descriptionKo: "예비·가속·정타 3박자를 압축 여백으로 몰아친 뒤 넓은 반동 여백으로 타격 여운을 남깁니다.",
    descriptionEn: "Compresses wind-up, rush, and strike into tight beats followed by a wide recoil breath.",
    rhythmSignatureKo: "좁음 → 극압축 → 폭발 확장 → 여운", rhythmSignatureEn: "Tight -> Snap -> Wide Recoil -> Aftermath",
    recommendedScrollSpeedPxPerSec: 470, backdropTone: "paper",
    defaultPanels: [
      beat("act-1", "대치 구도 설정", "Stance Establishing", "establishing", 560, 220, 16, "standard", "medium"),
      beat("act-2", "1박 · 발 구름 예비", "Beat 1: Footwork Wind-up", "action", 420, 160, 6, "slanted", "high"),
      beat("act-3", "2박 · 눈빛 클로즈업", "Beat 2: Eye-Flash Snap", "closeup", 360, 130, 4, "slanted", "high"),
      beat("act-4", "3박 · 풀블리드 정타 폭발", "Beat 3: Full-Bleed Strike", "reveal", 1120, 410, 8, "wide-bleed", "high"),
      beat("act-5", "연기 속 잔상 착지", "Dust-Settling Landing", "silence", 620, 260, 0, "standard", "low"),
    ],
  },
  {
    id: "romance-silence-longscroll", genreKo: "로맨스", genreEn: "Romance",
    labelKo: "로맨스 침묵 롱스크롤", labelEn: "Romance Silence Long-Scroll",
    shortLabelKo: "로맨스 침묵", shortLabelEn: "Silence Scroll",
    descriptionKo: "대사를 비우고 360~480px의 깊은 세로 여백을 배치해 시선 교차와 고백 직전 심장 박동을 유도합니다.",
    descriptionEn: "Empties dialogue and widens vertical silence gutters to heighten eye-contact anticipation.",
    rhythmSignatureKo: "잔잔함 → 깊은 침묵 → 손끝 클로즈업 → 고백", rhythmSignatureEn: "Soft -> Deep Silence -> Detail -> Confession",
    recommendedScrollSpeedPxPerSec: 340, backdropTone: "warm-tint",
    defaultPanels: [
      beat("rom-1", "노을 배경 투샷", "Sunset Two-Shot", "establishing", 680, 260, 22, "standard", "medium"),
      beat("rom-2", "시선 멈춤 · 무대사", "Held Gaze (Silent)", "silence", 520, 440, 0, "floating", "low"),
      beat("rom-3", "스치는 손끝 디테일", "Brushing Fingertips", "closeup", 460, 360, 0, "floating", "medium"),
      beat("rom-4", "눈동자 흔들림 클로즈업", "Trembling Eyes Close-up", "closeup", 640, 480, 9, "vertical-long", "high"),
      beat("rom-5", "한 줄 고백 풀샷", "Single-Line Confession", "reveal", 920, 300, 15, "wide-bleed", "medium"),
    ],
  },
  {
    id: "thriller-blackout-reveal", genreKo: "스릴러", genreEn: "Thriller",
    labelKo: "스릴러 암전 · 반전 리빌", labelEn: "Thriller Blackout Reveal",
    shortLabelKo: "스릴러 암전", shortLabelEn: "Blackout Reveal",
    descriptionKo: "숨 막히는 근접 컷으로 압박감을 조인 뒤 깊은 암전 롱거터(520px)로 공포 반전 컷을 낙하시킵니다.",
    descriptionEn: "Tightens claustrophobic close-ups before dropping into a dark blackout gutter and shock reveal.",
    rhythmSignatureKo: "압박 연속 → 깊은 암전(520px) → 충격 리빌", rhythmSignatureEn: "Claustrophobic -> Deep Blackout -> Shock Drop",
    recommendedScrollSpeedPxPerSec: 390, backdropTone: "noir",
    defaultPanels: [
      beat("thr-1", "어두운 복도 발소리", "Dim Corridor Footsteps", "establishing", 600, 210, 12, "standard", "medium"),
      beat("thr-2", "문고리 돌아가는 소리", "Doorknob Turning", "closeup", 440, 170, 8, "standard", "high"),
      beat("thr-3", "숨 죽인 동공 확대", "Dilated Pupil Freeze", "silence", 390, 520, 0, "blackout-transition", "low"),
      beat("thr-4", "등 뒤 실루엣 반전 리빌", "Silhouette Terror Reveal", "reveal", 1180, 380, 5, "wide-bleed", "high"),
      beat("thr-5", "불 꺼진 현관 정적", "Darkened Doorway Stillness", "cliffhanger", 720, 260, 10, "blackout-transition", "medium"),
    ],
  },
  {
    id: "slice-4cut-comedy", genreKo: "일상·개그", genreEn: "Slice & Comedy",
    labelKo: "일상 4컷 코미디 타이밍", labelEn: "4-Cut Comedy Beat Timing",
    shortLabelKo: "4컷 코미디", shortLabelEn: "4-Cut Comedy",
    descriptionKo: "기·승·전까지 경쾌한 컷 호흡으로 기대를 쌓은 뒤 결 컷 직전 짧은 '탁' 멈춤 여백으로 펀치라인을 터뜨립니다.",
    descriptionEn: "Builds buoyant 3-step setup cadence then inserts a crisp comic pause before the punchline.",
    rhythmSignatureKo: "기(경쾌) → 승(가속) → 전(탁 멈춤) → 결(폭소)", rhythmSignatureEn: "Setup -> Escalate -> Beat Pause -> Punchline",
    recommendedScrollSpeedPxPerSec: 450, backdropTone: "paper",
    defaultPanels: [
      beat("com-1", "기 · 평온한 일상 선언", "Beat 1: Calm Declaration", "establishing", 500, 200, 28, "standard", "medium"),
      beat("com-2", "승 · 자신만만 과장 포즈", "Beat 2: Overconfident Pose", "dialogue", 480, 160, 24, "standard", "medium"),
      beat("com-3", "전 · 0.8초 멍한 정적", "Beat 3: Deadpan Beat Pause", "silence", 380, 340, 3, "floating", "low"),
      beat("com-4", "결 · 즉각 반전 펀치라인", "Beat 4: Instant Punchline", "reveal", 660, 240, 19, "wide-bleed", "high"),
    ],
  },
  {
    id: "flashback-sepia-overlap", genreKo: "드라마", genreEn: "Drama",
    labelKo: "회상 세피아 오버랩", labelEn: "Flashback Sepia Overlap",
    shortLabelKo: "회상 오버랩", shortLabelEn: "Sepia Flashback",
    descriptionKo: "현재와 과거를 잇는 장폭 페이드 여백과 떠 있는 기억 파편 컷으로 자연스러운 시제 전환을 연출합니다.",
    descriptionEn: "Bridges present and memory using floating fragment panels and gentle sepia fade gutters.",
    rhythmSignatureKo: "현재 정지 → 시제 페이드 → 기억 파편 → 귀환", rhythmSignatureEn: "Present -> Time Fade -> Memory Shards -> Return",
    recommendedScrollSpeedPxPerSec: 360, backdropTone: "sepia",
    defaultPanels: [
      beat("flb-1", "현재 · 오래된 사진 발견", "Present: Finding Old Photo", "closeup", 560, 390, 18, "standard", "medium"),
      beat("flb-2", "과거 · 흐릿한 교실 창가", "Past: Sunlit Window Shard", "silence", 470, 230, 10, "floating", "low"),
      beat("flb-3", "과거 · 잊혀진 약속 대사", "Past: Forgotten Promise", "dialogue", 620, 310, 32, "floating", "medium"),
      beat("flb-4", "과거 · 웃는 뒷모습 잔상", "Past: Smiling Silhouette", "panorama", 760, 420, 0, "vertical-long", "low"),
      beat("flb-5", "현재 · 눈물 닦는 클로즈업", "Return: Wiping Tears", "closeup", 640, 250, 14, "standard", "high"),
    ],
  },
  {
    id: "cliffhanger-ending-drop", genreKo: "엔딩 절단신공", genreEn: "Cliffhanger",
    labelKo: "엔딩 클리프행어 낙하", labelEn: "Cliffhanger Ending Drop",
    shortLabelKo: "클리프행어", shortLabelEn: "Cliffhanger Drop",
    descriptionKo: "회차 말미 대사 압박을 끌어올린 뒤 540px 초장폭 침묵 낙하 거터를 거쳐 다음 화 결제를 부르는 한 컷을 꽂습니다.",
    descriptionEn: "Ramps late-episode dialogue urgency into a 540px breath drop that lands on a paywall hook.",
    rhythmSignatureKo: "정보 과열 → 급정지 → 540px 낙하 → 절단신공", rhythmSignatureEn: "Escalation -> Hard Stop -> 540px Drop -> Hook",
    recommendedScrollSpeedPxPerSec: 410, backdropTone: "noir",
    defaultPanels: [
      beat("clf-1", "단서 종합 대사 몰아치기", "Clue Convergence Dialogue", "dialogue", 580, 190, 44, "standard", "high"),
      beat("clf-2", "진범 이름 직전 말줄임", "Mid-Sentence Realization", "closeup", 450, 150, 18, "slanted", "high"),
      beat("clf-3", "휴대폰 화면 불빛 정지", "Phone Glow Silence", "silence", 400, 540, 0, "blackout-transition", "low"),
      beat("clf-4", "최종 절단신공 반전 얼굴", "Final Cliffhanger Reveal", "cliffhanger", 1080, 280, 11, "wide-bleed", "high"),
    ],
  },
  {
    id: "dialogue-zigzag-banter", genreKo: "대화·티키타카", genreEn: "Banter",
    labelKo: "대사 티키타카 지그재그", labelEn: "Dialogue Zigzag Banter",
    shortLabelKo: "티키타카", shortLabelEn: "Zigzag Banter",
    descriptionKo: "두 인물의 빠른 주고받기에 맞춰 짧고 탄력 있는 교차 여백(150~300px)으로 지루하지 않은 대화 리듬을 만듭니다.",
    descriptionEn: "Alternates brisk asymmetric gutters (150-300px) to give back-and-forth dialogue crisp bounce.",
    rhythmSignatureKo: "짧은 핑퐁 → 리듬 변주 → 반박 클로즈업 → 여운", rhythmSignatureEn: "Ping-Pong -> Cadence Shift -> Counter -> Beat",
    recommendedScrollSpeedPxPerSec: 440, backdropTone: "paper",
    defaultPanels: [
      beat("dia-1", "A 캐릭터 선공 대사", "Speaker A Opening Jab", "dialogue", 480, 160, 30, "standard", "medium"),
      beat("dia-2", "B 캐릭터 즉각 받아치기", "Speaker B Instant Counter", "dialogue", 440, 230, 26, "standard", "medium"),
      beat("dia-3", "A 캐릭터 당황 리액션", "Speaker A Flustered Beat", "closeup", 410, 150, 14, "floating", "medium"),
      beat("dia-4", "B 캐릭터 핵심 정곡 대사", "Speaker B Decisive Line", "dialogue", 540, 300, 38, "standard", "high"),
      beat("dia-5", "말문 막힌 투샷 여백", "Speechless Two-Shot", "silence", 500, 220, 5, "standard", "low"),
    ],
  },
  {
    id: "panorama-wide-breather", genreKo: "세계관·환기", genreEn: "Worldbuilding",
    labelKo: "파노라마 광활 환기 컷", labelEn: "Panorama Wide Breather",
    shortLabelKo: "파노라마 환기", shortLabelEn: "Wide Breather",
    descriptionKo: "고밀도 전개 뒤 1520px 초대형 세로 파노라마 컷과 깊은 환기 여백으로 독자 눈 피로를 풀고 공간감을 각인합니다.",
    descriptionEn: "Relieves reader fatigue after dense scenes with a tall 1520px vertical panorama and open breath.",
    rhythmSignatureKo: "고밀도 퇴장 → 환기 여백 → 초대형 파노라마 → 새 장", rhythmSignatureEn: "Dense Exit -> Open Breath -> Tall Panorama -> Next Arc",
    recommendedScrollSpeedPxPerSec: 380, backdropTone: "warm-tint",
    defaultPanels: [
      beat("pan-1", "좁은 문턱을 나서는 발걸음", "Stepping Past Threshold", "closeup", 520, 220, 20, "standard", "high"),
      beat("pan-2", "바람 스치는 하늘 진입", "Wind-Swept Sky Lead-in", "silence", 460, 360, 0, "floating", "low"),
      beat("pan-3", "도시 전경 초대형 세로 파노라마", "Tall Cityscape Panorama", "panorama", 1520, 420, 12, "vertical-long", "high"),
      beat("pan-4", "새로운 목적지 독백 컷", "New Destination Monologue", "establishing", 640, 270, 24, "wide-bleed", "medium"),
    ],
  },
] as const;

const ROLE_TENSION_BASE: Readonly<Record<PanelBeatRole, number>> = {
  establishing: 36, panorama: 32, dialogue: 48, silence: 54,
  closeup: 64, action: 74, reveal: 82, cliffhanger: 86,
};

const ROLE_INSPECTION_SEC: Readonly<Record<PanelBeatRole, number>> = {
  establishing: 0.72, panorama: 1.12, dialogue: 0.48, silence: 0.65,
  closeup: 0.62, action: 0.56, reveal: 0.92, cliffhanger: 1.05,
};

const DENSITY_TENSION_BONUS: Readonly<Record<VisualDensityLevel, number>> = { low: -4, medium: 4, high: 11 };
const DENSITY_INSPECTION_DELTA: Readonly<Record<VisualDensityLevel, number>> = { low: -0.1, medium: 0, high: 0.18 };
const SHAPE_TENSION_BONUS: Readonly<Record<PanelShapeKind, number>> = {
  standard: 0, floating: 2, "vertical-long": 4, "wide-bleed": 8, slanted: 10, "blackout-transition": 12,
};
const CADENCE_MULTIPLIERS: readonly number[] = [0.84, 1.18, 0.76, 1.32, 0.94, 1.24] as const;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
function round2(value: number): number { return Math.round(value * 100) / 100; }
function snapToTen(value: number): number { return Math.round(value / 10) * 10; }
function escapeXml(raw: string): string {
  return raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** 플랫폼 규격 프리셋을 ID로 조회한다. */
export function getWebtoonPlatformSpec(id: WebtoonPlatformPresetId): WebtoonPlatformSpec {
  requireChoice(id, WEBTOON_PLATFORM_IDS);
  return WEBTOON_PLATFORM_PRESETS.find((spec) => spec.id === id) ?? WEBTOON_PLATFORM_PRESETS[0];
}

/** 8대 한국 상업 웹툰 연출 리듬 템플릿을 ID로 조회한다. */
export function getPanelRhythmTemplateSpec(id: PanelRhythmTemplateId): PanelRhythmTemplateSpec {
  requireChoice(id, PANEL_RHYTHM_TEMPLATE_IDS);
  return PANEL_RHYTHM_TEMPLATES.find((spec) => spec.id === id) ?? PANEL_RHYTHM_TEMPLATES[0];
}

/** 선택한 템플릿 컷 시퀀스를 플랫폼 폭(800px 기준 비율)에 맞춰 비례 스케일링해 생성한다. */
export function instantiateTemplatePanels(
  templateId: PanelRhythmTemplateId,
  platformId: WebtoonPlatformPresetId,
): readonly PanelBeatInput[] {
  const template = getPanelRhythmTemplateSpec(templateId);
  const scaleRatio = getWebtoonPlatformSpec(platformId).widthPx / 800;
  return template.defaultPanels.map((panel) => ({
    ...panel,
    heightPx: clamp(snapToTen(panel.heightPx * scaleRatio), 220, 2400),
    gutterAfterPx: clamp(snapToTen(panel.gutterAfterPx * scaleRatio), 60, 900),
  }));
}

function detectMonotoneGutterRuns(gutters: readonly number[]): {
  readonly runs: readonly (readonly number[])[];
  readonly flaggedIndices: ReadonlySet<number>;
} {
  const runs: number[][] = [];
  const flagged = new Set<number>();
  if (gutters.length < MONOTONE_MIN_RUN_LENGTH) return { runs, flaggedIndices: flagged };

  let runStart = 0;
  let runMin = gutters[0] ?? 0;
  let runMax = gutters[0] ?? 0;

  const flushRun = (endExclusive: number): void => {
    const len = endExclusive - runStart;
    if (len < MONOTONE_MIN_RUN_LENGTH) return;
    const indices = Array.from({ length: len }, (_, offset) => runStart + offset);
    runs.push(indices);
    for (const idx of indices) flagged.add(idx);
  };

  for (let i = 1; i < gutters.length; i += 1) {
    const prev = gutters[i - 1] ?? 0;
    const curr = gutters[i] ?? 0;
    const nextMin = Math.min(runMin, curr);
    const nextMax = Math.max(runMax, curr);
    if (Math.abs(curr - prev) <= MONOTONE_GUTTER_TOLERANCE_PX && nextMax - nextMin <= MONOTONE_GUTTER_TOLERANCE_PX + 10) {
      runMin = nextMin;
      runMax = nextMax;
      continue;
    }
    flushRun(i);
    runStart = i;
    runMin = curr;
    runMax = curr;
  }
  flushRun(gutters.length);
  return { runs, flaggedIndices: flagged };
}

function classifyPaceTag(silenceBreathSec: number, dwellTimeSec: number): PanelPaceTag {
  if (silenceBreathSec >= 0.95) return "suspense";
  if (silenceBreathSec <= 0.42 && dwellTimeSec <= 2.3) return "rapid";
  if (silenceBreathSec >= 0.65 || dwellTimeSec >= 3.4) return "deliberate";
  return "steady";
}

function computePanelTension(
  panel: PanelBeatInput, index: number, totalPanels: number,
  prevGutterPx: number | null, platform: WebtoonPlatformSpec, scrollSpeedPxPerSec: number,
): number {
  let score = ROLE_TENSION_BASE[panel.role] + DENSITY_TENSION_BONUS[panel.visualDensity] + SHAPE_TENSION_BONUS[panel.shape];
  if (prevGutterPx !== null) {
    const prevSilenceSec = prevGutterPx / scrollSpeedPxPerSec;
    if (prevSilenceSec >= 0.85 && (panel.role === "reveal" || panel.role === "cliffhanger" || panel.role === "closeup")) {
      score += Math.min(14, Math.round((prevSilenceSec - 0.5) * 14));
    } else if (prevSilenceSec <= 0.42 && (panel.role === "action" || panel.role === "dialogue")) {
      score += 6;
    }
  }
  if (panel.dialogueCharCount > 0) score += Math.min(8, panel.dialogueCharCount / 9);
  if (panel.heightPx >= platform.widthPx * 1.25 && (panel.role === "reveal" || panel.role === "cliffhanger" || panel.role === "action")) {
    score += 5;
  }
  if (totalPanels >= 3 && index === totalPanels - 1 && (panel.role === "cliffhanger" || panel.role === "reveal")) {
    score += 4;
  }
  return Math.round(clamp(score, 0, 100));
}

function collectRhythmWarnings(
  analyzedPanels: readonly PanelBeatAnalysis[],
  monotoneRuns: readonly (readonly number[])[],
  platform: WebtoonPlatformSpec,
  tensionDynamicRange: number,
): readonly RhythmWarning[] {
  const warnings: RhythmWarning[] = [];
  const fmtKo = (ids: readonly number[]): string => ids.map((i) => `${i + 1}컷`).join("·");
  const fmtEn = (ids: readonly number[]): string => ids.map((i) => `P${i + 1}`).join(", ");
  const push = (code: RhythmWarningCode, severity: RhythmWarningSeverity, affectedIndices: readonly number[], titleKo: string, titleEn: string, detailKo: string, detailEn: string): void => {
    warnings.push({ code, severity, affectedIndices, titleKo, titleEn, detailKo, detailEn });
  };

  for (const run of monotoneRuns) {
    const baseGutter = analyzedPanels[run[0]!]?.gutterAfterPx ?? 0;
    push(
      "monotone-gutter-streak", run.length >= 4 ? "critical" : "warn", run,
      `동일 여백 ${run.length}연속 단조로움 경고`, `${run.length} Consecutive Monotone Gutters`,
      `${fmtKo(run)} 하단 여백이 약 ${baseGutter}px(±${MONOTONE_GUTTER_TOLERANCE_PX}px)로 반복되어 독자 스크롤 리듬이 단조로워집니다.`,
      `Gutters after ${fmtEn(run)} stay near ${baseGutter}px (±${MONOTONE_GUTTER_TOLERANCE_PX}px), flattening scroll pacing.`,
    );
  }

  const narrowFloor = Math.round(platform.recommendedGutterMinPx * 0.72);
  const narrow = analyzedPanels.filter((p) => p.gutterAfterPx < narrowFloor).map((p) => p.index);
  if (narrow.length > 0) {
    push(
      "gutter-too-narrow", "warn", narrow,
      "예제 최소 여백 미달", "Gutters Below Example Minimum",
      `${fmtKo(narrow)} 하단 여백이 ${platform.shortLabelKo} 안전선(${narrowFloor}px)보다 좁아 컷 경계가 답답할 수 있습니다.`,
      `Gutters at ${fmtEn(narrow)} fall below ${narrowFloor}px for ${platform.shortLabelEn}.`,
    );
  }

  const voidCeiling = Math.round(platform.recommendedGutterMaxPx * 1.85);
  const voids = analyzedPanels
    .filter((p) => p.gutterAfterPx > voidCeiling && p.role !== "silence" && p.shape !== "blackout-transition")
    .map((p) => p.index);
  if (voids.length > 0) {
    push(
      "gutter-excessive-void", "warn", voids,
      "과도한 공백 여백(스크롤 이탈 주의)", "Excessive Void Gutter",
      `${fmtKo(voids)} 여백이 ${voidCeiling}px를 초과해 의도 없는 빈 화면 체감이 발생할 수 있습니다.`,
      `Gutters at ${fmtEn(voids)} exceed ${voidCeiling}px and risk reader drop-off.`,
    );
  }

  const crowded = analyzedPanels
    .filter((p) => p.dialogueCharCount > 85 || p.dialogueCharCount / (p.heightPx / 100) > 16)
    .map((p) => p.index);
  if (crowded.length > 0) {
    push(
      "dialogue-overcrowded", "warn", crowded,
      "컷 높이 대비 대사 과밀(말풍선 호흡 저하)", "Dialogue Overcrowded for Panel Height",
      `${fmtKo(crowded)}의 대사량이 컷 세로 높이에 비해 많아 모바일 가독성이 떨어집니다.`,
      `Dialogue density at ${fmtEn(crowded)} crowds mobile speech bubbles.`,
    );
  }

  if (analyzedPanels.length >= 4 && tensionDynamicRange < 18) {
    push(
      "flat-tension-curve", "info", analyzedPanels.map((p) => p.index),
      "긴장도 곡선 평탄(강약 변주 부족)", "Flat Tension Curve",
      `최고·최저 긴장도 차이가 ${tensionDynamicRange}점으로 낮습니다. 여백 강약이나 클로즈업·환기 컷 대비를 늘려보세요.`,
      `Tension spread is only ${tensionDynamicRange} pts; add silence or focal contrast.`,
    );
  }

  const last = analyzedPanels[analyzedPanels.length - 1];
  const prev = analyzedPanels[analyzedPanels.length - 2];
  if (last && prev && (last.role === "cliffhanger" || last.role === "reveal") && prev.silenceBreathSec < 0.48) {
    push(
      "weak-cliffhanger-drop", "warn", [prev.index, last.index],
      "클리프행어 직전 침묵 호흡 부족", "Short Pre-Cliffhanger Breath",
      `마지막 반전 컷 직전 여백 호흡이 ${prev.silenceBreathSec}초로 짧아 낙하 임팩트가 약해집니다(0.6초 이상 권장).`,
      `Breath before final reveal is ${prev.silenceBreathSec}s; target 0.60s+ for sharper drop impact.`,
    );
  }
  return warnings;
}

/** 독자 엄지 스크롤 속도와 컷·여백·대사 정보로 체류 시간·침묵 호흡·긴장도 곡선·경고를 산출한다. */
export function analyzeScrollRhythm(options: AnalyzeScrollRhythmOptions): ScrollRhythmAnalysis {
  requireFinite([options.scrollSpeedPxPerSec ?? DEFAULT_SCROLL_SPEED_PX_PER_SEC, options.readingCharsPerSec ?? DEFAULT_READING_CHARS_PER_SEC]);
  if (options.templateId !== undefined && options.templateId !== null) requireChoice(options.templateId, PANEL_RHYTHM_TEMPLATE_IDS);
  const platform = getWebtoonPlatformSpec(options.platformId ?? "naver-800");
  const scrollSpeedPxPerSec = Math.round(clamp(options.scrollSpeedPxPerSec ?? DEFAULT_SCROLL_SPEED_PX_PER_SEC, MIN_SCROLL_SPEED_PX_PER_SEC, MAX_SCROLL_SPEED_PX_PER_SEC));
  const readingCharsPerSec = clamp(options.readingCharsPerSec ?? DEFAULT_READING_CHARS_PER_SEC, 6, 30);
  const templateId = options.templateId ?? null;
  const normalized = normalizePanelInputs(options.panels);

  const monotone = detectMonotoneGutterRuns(normalized.map((p) => p.gutterAfterPx));
  let cursorY = 0;
  const analyzedPanels: PanelBeatAnalysis[] = normalized.map((panel, index) => {
    const prevGutterPx = normalized[index - 1]?.gutterAfterPx ?? null;
    const topY = cursorY;
    const bottomY = topY + panel.heightPx;
    const gutterEndY = bottomY + panel.gutterAfterPx;
    cursorY = gutterEndY;

    const scrollTransitSec = round2(panel.heightPx / scrollSpeedPxPerSec);
    const dialogueReadSec = panel.dialogueCharCount > 0 ? round2(panel.dialogueCharCount / readingCharsPerSec + 0.24) : 0;
    const visualInspectionSec = round2(Math.max(0.25, ROLE_INSPECTION_SEC[panel.role] + DENSITY_INSPECTION_DELTA[panel.visualDensity]));
    const dwellTimeSec = round2(scrollTransitSec + dialogueReadSec + visualInspectionSec);
    const silenceBreathSec = round2(panel.gutterAfterPx / scrollSpeedPxPerSec);
    const tensionScore = computePanelTension(panel, index, normalized.length, prevGutterPx, platform, scrollSpeedPxPerSec);
    return {
      ...panel, index, topY, bottomY, gutterEndY, scrollTransitSec, dialogueReadSec, visualInspectionSec,
      dwellTimeSec, silenceBreathSec, totalBeatSec: round2(dwellTimeSec + silenceBreathSec),
      tensionScore, paceTag: classifyPaceTag(silenceBreathSec, dwellTimeSec),
      inMonotoneStreak: monotone.flaggedIndices.has(index),
    };
  });

  const panelCount = analyzedPanels.length;
  const totalPanelsHeightPx = analyzedPanels.reduce((acc, p) => acc + p.heightPx, 0);
  const totalGutterHeightPx = analyzedPanels.reduce((acc, p) => acc + p.gutterAfterPx, 0);
  const totalHeightPx = totalPanelsHeightPx + totalGutterHeightPx;
  const viewportScreensCount = totalHeightPx > 0 ? round2(totalHeightPx / platform.viewportHeightPx) : 0;
  const totalDwellSec = round2(analyzedPanels.reduce((acc, p) => acc + p.dwellTimeSec, 0));
  const totalSilenceSec = round2(analyzedPanels.reduce((acc, p) => acc + p.silenceBreathSec, 0));
  const totalExperienceSec = round2(totalDwellSec + totalSilenceSec);
  const averageDwellSec = panelCount > 0 ? round2(totalDwellSec / panelCount) : 0;
  const averageGutterPx = panelCount > 0 ? round2(totalGutterHeightPx / panelCount) : 0;
  const variance = panelCount > 0 ? analyzedPanels.reduce((acc, p) => acc + (p.gutterAfterPx - averageGutterPx) ** 2, 0) / panelCount : 0;
  const gutterStdDevPx = round2(Math.sqrt(variance));
  const gutterVarianceRatio = averageGutterPx > 0 ? round2(gutterStdDevPx / averageGutterPx) : 0;

  const tensionCurve = analyzedPanels.map((p) => p.tensionScore);
  let peakTension = 0;
  let peakTensionPanelIndex = -1;
  let minTension = panelCount > 0 ? 100 : 0;
  for (const p of analyzedPanels) {
    if (p.tensionScore > peakTension || peakTensionPanelIndex === -1) {
      peakTension = p.tensionScore;
      peakTensionPanelIndex = p.index;
    }
    if (p.tensionScore < minTension) minTension = p.tensionScore;
  }
  const tensionDynamicRange = panelCount > 0 ? peakTension - minTension : 0;
  const warnings = collectRhythmWarnings(analyzedPanels, monotone.runs, platform, tensionDynamicRange);
  const last = analyzedPanels[panelCount - 1];
  const prev = analyzedPanels[panelCount - 2];
  const cliffhangerReadinessScore = panelCount >= 2 && last && prev
    ? Math.round(clamp(last.tensionScore * 0.55 + Math.min(28, prev.silenceBreathSec * 28) + Math.max(0, last.tensionScore - prev.tensionScore) * 0.65, 0, 100))
    : last?.tensionScore ?? 0;

  let rhythmHealthScore = panelCount > 0 ? 92 : 0;
  if (panelCount > 0) {
    for (const w of warnings) rhythmHealthScore -= w.severity === "critical" ? 22 : w.severity === "warn" ? 13 : 6;
    if (gutterVarianceRatio >= 0.22 && gutterVarianceRatio <= 0.68) rhythmHealthScore += 6;
    if (tensionDynamicRange >= 28) rhythmHealthScore += 5;
    if (monotone.runs.length === 0 && panelCount >= 3) rhythmHealthScore += 3;
    rhythmHealthScore = Math.round(clamp(rhythmHealthScore, 0, 100));
  }

  return {
    platform, templateId, scrollSpeedPxPerSec, readingCharsPerSec, panels: analyzedPanels, tensionCurve, warnings,
    summary: {
      panelCount, totalHeightPx, totalPanelsHeightPx, totalGutterHeightPx, viewportScreensCount,
      totalDwellSec, totalSilenceSec, totalExperienceSec, averageDwellSec, averageGutterPx,
      gutterStdDevPx, gutterVarianceRatio, peakTension, peakTensionPanelIndex, minTension,
      tensionDynamicRange, cliffhangerReadinessScore, rhythmHealthScore, monotoneGutterRunCount: monotone.runs.length,
    },
  };
}

/** 단조로운 3연속 동일 여백·규격 이탈 여백·약한 클리프행어 직전 호흡을 결정론적으로 자동 보정한다. */
export function autoBalanceGutters(
  panels: readonly PanelBeatInput[],
  platformId: WebtoonPlatformPresetId = "naver-800",
  scrollSpeedPxPerSec: number = DEFAULT_SCROLL_SPEED_PX_PER_SEC,
  templateId: PanelRhythmTemplateId | null = null,
): AutoBalanceGuttersResult {
  const normalizedPanels = normalizePanelInputs(panels);
  const platform = getWebtoonPlatformSpec(platformId);
  const beforeAnalysis = analyzeScrollRhythm({ panels: normalizedPanels, platformId, scrollSpeedPxPerSec, templateId });
  if (normalizedPanels.length === 0) return { panels: [], adjustments: [], beforeAnalysis, afterAnalysis: beforeAnalysis };

  const { recommendedGutterMinPx: minG, recommendedGutterMaxPx: maxG, idealAverageGutterPx: idealG } = platform;
  const narrowFloor = Math.round(minG * 0.78);
  const voidCeiling = Math.round(maxG * 1.5);
  const safeSpeed = clamp(scrollSpeedPxPerSec, MIN_SCROLL_SPEED_PX_PER_SEC, MAX_SCROLL_SPEED_PX_PER_SEC);
  const proposed: number[] = [];
  const reasonsKo: string[] = [];
  const reasonsEn: string[] = [];

  for (let i = 0; i < normalizedPanels.length; i += 1) {
    const panel = normalizedPanels[i];
    if (!panel) continue;
    const nextPanel = normalizedPanels[i + 1];
    const current = Math.round(panel.gutterAfterPx);
    const cadence = CADENCE_MULTIPLIERS[i % CADENCE_MULTIPLIERS.length] ?? 1;
    let target = current;
    let reasonKo = "";
    let reasonEn = "";

    const isPreImpact = nextPanel !== undefined && (nextPanel.role === "cliffhanger" || nextPanel.role === "reveal");
    if (isPreImpact && current / safeSpeed < 0.62) {
      target = clamp(snapToTen(Math.max(safeSpeed * 0.85, maxG * 1.05)), Math.round(maxG * 0.9), Math.round(maxG * 1.38));
      reasonKo = "반전·클리프행어 직전 침묵 낙하 호흡 보강";
      reasonEn = "Extended pre-reveal silence drop breath";
    } else if (beforeAnalysis.panels[i]?.inMonotoneStreak) {
      const roleFactor = panel.role === "silence" || panel.role === "panorama" ? 1.24 : panel.role === "action" ? 0.78 : 1.0;
      target = clamp(snapToTen(idealG * cadence * roleFactor), minG, maxG);
      reasonKo = "3연속 동일 여백 단조로움 해소(강약 리듬 분화)";
      reasonEn = "Broke 3+ monotone gutter streak with cadence contrast";
    } else if (current < narrowFloor) {
      target = snapToTen(minG * (i % 2 === 0 ? 1.0 : 1.15));
      reasonKo = `${platform.shortLabelKo} 예제 최소 여백 확보`;
      reasonEn = `Raised to ${platform.shortLabelEn} example gutter floor`;
    } else if (current > voidCeiling && panel.role !== "silence" && panel.shape !== "blackout-transition") {
      target = snapToTen(maxG * 0.95);
      reasonKo = "과도한 공백 이탈 위험 완화";
      reasonEn = "Trimmed excessive void gutter to prevent reader drop-off";
    } else if (beforeAnalysis.summary.gutterVarianceRatio < 0.16 && normalizedPanels.length >= 3) {
      target = clamp(snapToTen(idealG * cadence), minG, maxG);
      reasonKo = "전체 여백 편차 확장으로 스크롤 호흡 입체화";
      reasonEn = "Expanded gutter variance for richer scroll cadence";
    }
    proposed.push(target);
    reasonsKo.push(reasonKo);
    reasonsEn.push(reasonEn);
  }

  for (let i = 1; i < proposed.length; i += 1) {
    const prev = proposed[i - 1] ?? idealG;
    const curr = proposed[i] ?? idealG;
    const prevPrev = i >= 2 ? proposed[i - 2] : null;
    const flatTriple = prevPrev !== null && Math.abs(prev - prevPrev) <= MONOTONE_GUTTER_TOLERANCE_PX + 15 && Math.abs(curr - prev) <= MONOTONE_GUTTER_TOLERANCE_PX + 20;
    if (flatTriple || (beforeAnalysis.panels[i]?.inMonotoneStreak && Math.abs(curr - prev) < 50)) {
      const up = snapToTen(curr + 80);
      const down = snapToTen(curr - 70);
      const nudged = up <= maxG ? up : down >= minG ? down : snapToTen(maxG);
      if (nudged !== curr) {
        proposed[i] = nudged;
        if (!reasonsKo[i]) {
          reasonsKo[i] = "연속 유사 여백 대비 확장";
          reasonsEn[i] = "Widened adjacent gutter contrast";
        }
      }
    }
  }

  const adjustments: GutterAdjustmentRecord[] = [];
  const nextPanels: PanelBeatInput[] = normalizedPanels.map((panel, index) => {
    const beforeGutterPx = Math.round(panel.gutterAfterPx);
    const afterGutterPx = proposed[index] ?? beforeGutterPx;
    if (afterGutterPx !== beforeGutterPx) {
      adjustments.push({
        panelId: panel.id, index, beforeGutterPx, afterGutterPx, deltaPx: afterGutterPx - beforeGutterPx,
        reasonKo: reasonsKo[index] || "여백 리듬 최적화", reasonEn: reasonsEn[index] || "Optimized gutter rhythm",
      });
    }
    return { ...panel, gutterAfterPx: afterGutterPx };
  });

  const afterAnalysis = analyzeScrollRhythm({ panels: nextPanels, platformId, scrollSpeedPxPerSec, templateId });
  return { panels: nextPanels, adjustments, beforeAnalysis, afterAnalysis };
}

/** 긴장도 점수(0~100)에 대응하는 순수 OKLCH 색상을 반환한다. */
export function getTensionOklch(tensionScore: number): string {
  if (tensionScore >= 82) return "oklch(0.62 0.19 28)";
  if (tensionScore >= 66) return "oklch(0.68 0.17 44)";
  return tensionScore >= 50 ? "oklch(0.62 0.12 228)" : "oklch(0.56 0.05 245)";
}

function assertExportMatchesModel(analysis: ScrollRhythmAnalysis): void {
  const model = analyzeScrollRhythm({
    panels: analysis.panels, platformId: analysis.platform.id, templateId: analysis.templateId,
    scrollSpeedPxPerSec: analysis.scrollSpeedPxPerSec, readingCharsPerSec: analysis.readingCharsPerSec,
  });
  assertExportAnalysis(analysis, model);
}

/** 순수 시맨틱 `currentColor` 및 OKLCH 문자열만 사용하는 세로 스크롤 비트 스트립 SVG를 생성한다. */
export function buildRhythmStripSvg(analysis: ScrollRhythmAnalysis, options?: BuildRhythmStripSvgOptions): string {
  assertExportMatchesModel(analysis);
  requireFinite([options?.stripWidthPx ?? 300]);
  const stripW = clamp(Math.round(options?.stripWidthPx ?? 300), 220, 480);
  const showRail = options?.showTensionRail ?? true;
  const showDims = options?.showGutterDimensions ?? true;
  const isEn = options?.locale === "en";
  const padX = 16;
  const padTop = 36;
  const padBottom = 20;
  const railW = showRail ? 48 : 0;
  const colW = stripW - padX * 2 - railW;
  const scale = colW / Math.max(analysis.platform.widthPx, 1);
  const svgH = padTop + Math.max(120, Math.round(analysis.summary.totalHeightPx * scale)) + padBottom;
  const railLeft = padX + colW + 10;
  const railInnerW = Math.max(24, railW - 14);
  const header = isEn
    ? `${analysis.platform.shortLabelEn} · ${analysis.summary.panelCount} panels · ${analysis.summary.totalExperienceSec}s`
    : `${analysis.platform.shortLabelKo} · ${analysis.summary.panelCount}컷 · 추정 ${analysis.summary.totalExperienceSec}초`;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${stripW} ${svgH}" width="${stripW}" height="${svgH}" role="img" aria-label="${escapeXml(header)}" data-platform="${analysis.platform.id}" data-template="${analysis.templateId ?? "custom"}" data-panel-count="${analysis.summary.panelCount}" data-total-height-px="${analysis.summary.totalHeightPx}" style="color: oklch(0.92 0.01 80);">`,
    `  <rect x="0" y="0" width="${stripW}" height="${svgH}" rx="12" fill="oklch(0.17 0.012 75)" stroke="oklch(0.32 0.015 75)" stroke-width="1" />`,
    `  <text x="${padX}" y="22" fill="currentColor" font-size="11" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(header)}</text>`,
  ];
  const curvePts: string[] = [];

  for (const p of analysis.panels) {
    const y = round2(padTop + p.topY * scale);
    const h = Math.max(22, round2(p.heightPx * scale));
    const gH = round2(p.gutterAfterPx * scale);
    const tone = getTensionOklch(p.tensionScore);
    const inset = p.shape === "wide-bleed" ? 0 : p.shape === "floating" ? 14 : 6;
    const rx = round2(padX + inset);
    const rw = round2(colW - inset * 2);
    const label = escapeXml(isEn ? p.labelEn : p.labelKo);
    const meta = isEn ? `P${p.index + 1} · ${p.dwellTimeSec}s · T${p.tensionScore}` : `컷${p.index + 1} · 체류 ${p.dwellTimeSec}초 · 긴장 ${p.tensionScore}`;

    if (p.shape === "slanted") {
      const skew = Math.min(10, h * 0.18);
      lines.push(`  <polygon data-panel-id="${escapeXml(p.id)}" points="${rx},${y + skew} ${rx + rw},${y} ${rx + rw},${y + h - skew} ${rx},${y + h}" fill="${tone}" fill-opacity="0.24" stroke="${tone}" stroke-width="1.5" />`);
    } else {
      lines.push(`  <rect data-panel-id="${escapeXml(p.id)}" x="${rx}" y="${y}" width="${rw}" height="${h}" rx="4" fill="${tone}" fill-opacity="${p.shape === "blackout-transition" ? "0.42" : "0.22"}" stroke="${tone}" stroke-width="1.4" />`);
    }
    lines.push(`  <text x="${round2(rx + 8)}" y="${round2(y + 15)}" fill="currentColor" font-size="10" font-weight="600" font-family="system-ui, sans-serif">${label}</text>`);
    if (h >= 34) lines.push(`  <text x="${round2(rx + 8)}" y="${round2(y + 29)}" fill="oklch(0.78 0.015 80)" font-size="9" font-family="system-ui, sans-serif">${escapeXml(meta)}</text>`);
    if (p.dialogueCharCount > 0 && h >= 28) lines.push(`  <circle cx="${round2(rx + rw - 14)}" cy="${round2(y + 14)}" r="6" fill="oklch(0.92 0.02 80)" fill-opacity="0.2" stroke="currentColor" stroke-width="1" />`);
    if (showDims && gH >= 8) {
      const gMidX = round2(padX + colW * 0.5);
      const gTop = round2(y + h + 2);
      const gBot = round2(y + h + Math.max(8, gH - 2));
      const gColor = p.inMonotoneStreak ? "oklch(0.76 0.17 68)" : "oklch(0.64 0.02 80)";
      lines.push(`  <line data-gutter-index="${p.index}" x1="${gMidX}" y1="${gTop}" x2="${gMidX}" y2="${gBot}" stroke="${gColor}" stroke-width="1" stroke-dasharray="3 3" />`);
      if (gH >= 16) lines.push(`  <text x="${round2(gMidX + 6)}" y="${round2((gTop + gBot) * 0.5 + 3)}" fill="${gColor}" font-size="8.5" font-family="system-ui, sans-serif">${escapeXml(`${p.gutterAfterPx}px · ${p.silenceBreathSec}s`)}</text>`);
    }
    if (showRail) curvePts.push(`${round2(railLeft + (p.tensionScore / 100) * railInnerW)},${round2(y + h * 0.5)}`);
  }

  if (showRail && curvePts.length > 0) {
    lines.push(`  <line x1="${railLeft}" y1="${padTop}" x2="${railLeft}" y2="${svgH - padBottom}" stroke="oklch(0.35 0.015 80)" stroke-width="1" />`);
    if (curvePts.length >= 2) lines.push(`  <polyline data-role="tension-rail" points="${curvePts.join(" ")}" fill="none" stroke="oklch(0.74 0.17 42)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`);
    for (const pt of curvePts) {
      const [cx, cy] = pt.split(",");
      lines.push(`  <circle cx="${cx}" cy="${cy}" r="3" fill="oklch(0.74 0.17 42)" stroke="oklch(0.17 0.012 75)" stroke-width="1" />`);
    }
  }
  lines.push("</svg>");
  return lines.join("\n");
}

/** 컷 레이아웃 좌표·여백·호흡·긴장도 분석 결과를 정형 JSON 문자열로 직렬화한다. */
export function exportPanelRhythmJson(analysis: ScrollRhythmAnalysis): string {
  assertExportMatchesModel(analysis);
  return JSON.stringify(
    {
      schemaVersion: "toonstudio.panel-rhythm.v1",
      platform: {
        id: analysis.platform.id, widthPx: analysis.platform.widthPx,
        recommendedGutterMinPx: analysis.platform.recommendedGutterMinPx,
        recommendedGutterMaxPx: analysis.platform.recommendedGutterMaxPx,
      },
      templateId: analysis.templateId,
      simulationParams: {
        scrollSpeedPxPerSec: analysis.scrollSpeedPxPerSec,
        readingCharsPerSec: analysis.readingCharsPerSec,
        basis: "estimated-reader-scroll-physics",
      },
      summary: analysis.summary,
      panels: analysis.panels.map((p) => ({
        id: p.id, index: p.index, labelKo: p.labelKo, labelEn: p.labelEn, role: p.role,
        shape: p.shape, visualDensity: p.visualDensity, topY: p.topY, bottomY: p.bottomY,
        heightPx: p.heightPx, gutterAfterPx: p.gutterAfterPx, dialogueCharCount: p.dialogueCharCount,
        dwellTimeSec: p.dwellTimeSec, silenceBreathSec: p.silenceBreathSec,
        tensionScore: p.tensionScore, paceTag: p.paceTag, inMonotoneStreak: p.inMonotoneStreak,
      })),
      warnings: analysis.warnings.map((w) => ({
        code: w.code, severity: w.severity, affectedIndices: w.affectedIndices, titleKo: w.titleKo, detailKo: w.detailKo,
      })),
    },
    null,
    2,
  );
}
