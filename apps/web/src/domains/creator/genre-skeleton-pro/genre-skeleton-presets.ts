/**
 * 장르별 60컷 세로 스크롤 레이아웃 프리셋 및 타입 계약 (액션 · 로맨스 · 스릴러 · 일상).
 */

export const GENRE_SKELETON_IDS = [
  "action",
  "romance",
  "thriller",
  "slice-of-life",
] as const;

export type GenreSkeletonId = (typeof GENRE_SKELETON_IDS)[number];
export type GenreSkeletonActId = "ki" | "seung" | "jeon" | "gyeol";

export type GenreSkeletonCutRole =
  | "opening-hook"
  | "establishing"
  | "dialogue"
  | "beat-build"
  | "tension-pause"
  | "climax-fullbleed"
  | "reaction"
  | "cliffhanger";

export type GenreSkeletonGutterTone = "paper" | "dark-fade" | "gradient-breath";
export type SpeechBubbleZoneRole = "dialogue" | "monologue" | "narration" | "sfx-anchor";

export interface SpeechBubbleSafeBox {
  readonly id: string;
  readonly role: SpeechBubbleZoneRole;
  readonly labelKo: string;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly maxCharsRecommended: number;
}

export interface CutSafeMarginsPx {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface GenreSkeletonCut {
  readonly index: number;
  readonly act: GenreSkeletonActId;
  readonly role: GenreSkeletonCutRole;
  readonly labelKo: string;
  readonly yPx: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly gutterTone: GenreSkeletonGutterTone;
  readonly fullBleed: boolean;
  readonly recommendedShotKo: string;
  readonly safeMarginsPx: CutSafeMarginsPx;
  readonly speechBubbleZones: readonly SpeechBubbleSafeBox[];
}

export interface GenreSkeletonActSummary {
  readonly id: GenreSkeletonActId;
  readonly labelKo: string;
  readonly intentKo: string;
  readonly startCutIndex: number;
  readonly endCutIndex: number;
  readonly cutCount: number;
  readonly heightPx: number;
  readonly avgCutHeightPx: number;
  readonly avgGutterPx: number;
  readonly fullBleedCount: number;
}

export interface GenreSkeletonPreset {
  readonly id: GenreSkeletonId;
  readonly labelKo: string;
  readonly shortTagKo: string;
  readonly pacingSummaryKo: string;
  readonly signatureRhythmKo: string;
  readonly actRatios: Readonly<Record<GenreSkeletonActId, number>>;
  readonly actBaseHeightPx: Readonly<Record<GenreSkeletonActId, number>>;
  readonly actBaseGutterPx: Readonly<Record<GenreSkeletonActId, number>>;
  readonly climaxFullBleedHeightPx: number;
  readonly openingHookHeightPx: number;
  readonly cliffhangerHeightPx: number;
  readonly defaultGutterTone: GenreSkeletonGutterTone;
  readonly climaxGutterTone: GenreSkeletonGutterTone;
  readonly avgSecondsPerCut: number;
}

export interface GenreSkeletonInput {
  readonly genre: GenreSkeletonId;
  readonly targetCutCount?: number;
  readonly canvasWidthPx?: number;
  readonly episodeTitle?: string;
  readonly episodeNumber?: number;
  readonly includeCliffhanger?: boolean;
}

export interface GenreSkeletonMetrics {
  readonly totalScrollScreens: number;
  readonly avgCutHeightPx: number;
  readonly avgGutterPx: number;
  readonly fullBleedCount: number;
  readonly bubbleZoneCount: number;
  readonly pacingTempoLabelKo: string;
}

export interface GenreSkeletonPlan {
  readonly genre: GenreSkeletonId;
  readonly preset: GenreSkeletonPreset;
  readonly episodeTitle: string;
  readonly episodeNumber: number;
  readonly canvasWidthPx: number;
  readonly cutCount: number;
  readonly totalHeightPx: number;
  readonly estimatedReadSeconds: number;
  readonly generatedInMs: number;
  readonly acts: readonly GenreSkeletonActSummary[];
  readonly cuts: readonly GenreSkeletonCut[];
  readonly climaxCutIndices: readonly number[];
  readonly metrics: GenreSkeletonMetrics;
}

export const GENRE_SKELETON_MIN_CUTS = 12;
export const GENRE_SKELETON_MAX_CUTS = 100;
export const GENRE_SKELETON_DEFAULT_CUTS = 60;
export const GENRE_SKELETON_DEFAULT_WIDTH_PX = 800;
export const GENRE_SKELETON_WIDTH_PRESETS = [690, 800, 1080] as const;
export const GENRE_SKELETON_CUT_COUNT_PRESETS = [24, 40, 60, 80, 100] as const;

export const GENRE_SKELETON_ACT_ORDER: readonly GenreSkeletonActId[] = [
  "ki",
  "seung",
  "jeon",
  "gyeol",
];

export const GENRE_SKELETON_ACT_META: Readonly<
  Record<GenreSkeletonActId, { readonly labelKo: string; readonly intentKo: string }>
> = {
  ki: {
    labelKo: "기 · 도입",
    intentKo: "첫 3컷 훅으로 시선을 잡고 상황·공간을 즉시 각인",
  },
  seung: {
    labelKo: "승 · 전개",
    intentKo: "대사와 행동 리듬을 교차하며 갈등·감정 밀도를 축적",
  },
  jeon: {
    labelKo: "전 · 클라이맥스",
    intentKo: "호흡 정지 여백 직후 전면 컷으로 감각·감정 폭발",
  },
  gyeol: {
    labelKo: "결 · 여운·훅",
    intentKo: "반응 컷으로 감정을 회수하고 다음 화 클릭 훅으로 마감",
  },
};

export const GENRE_SKELETON_PRESETS: Readonly<Record<GenreSkeletonId, GenreSkeletonPreset>> = {
  action: {
    id: "action",
    labelKo: "액션",
    shortTagKo: "타격·속도전",
    pacingSummaryKo:
      "빠른 연속 컷과 타이트한 여백으로 속도감을 올리고, 결정타 직전 숨을 멈춘 뒤 2,000px급 전면 컷으로 폭발시킵니다.",
    signatureRhythmKo: "짧은 연속 컷(680~840px) → 정지 여백(220px) → 타격 전면 컷(1,960px)",
    actRatios: { ki: 0.15, seung: 0.35, jeon: 0.35, gyeol: 0.15 },
    actBaseHeightPx: { ki: 820, seung: 760, jeon: 700, gyeol: 880 },
    actBaseGutterPx: { ki: 96, seung: 74, jeon: 62, gyeol: 136 },
    climaxFullBleedHeightPx: 1960,
    openingHookHeightPx: 1280,
    cliffhangerHeightPx: 1420,
    defaultGutterTone: "paper",
    climaxGutterTone: "dark-fade",
    avgSecondsPerCut: 1.55,
  },
  romance: {
    id: "romance",
    labelKo: "로맨스",
    shortTagKo: "감정선·여운",
    pacingSummaryKo:
      "표정 클로즈업과 넉넉한 여백으로 설렘 호흡을 살리고, 고백·시선 교차 순간에 세로 롱 컷과 대칭 말풍선을 배치합니다.",
    signatureRhythmKo: "표정 컷(920~1,080px) + 여백(150~210px) → 감정 고조 전면 컷(1,820px)",
    actRatios: { ki: 0.18, seung: 0.37, jeon: 0.27, gyeol: 0.18 },
    actBaseHeightPx: { ki: 940, seung: 980, jeon: 1080, gyeol: 1040 },
    actBaseGutterPx: { ki: 148, seung: 162, jeon: 196, gyeol: 210 },
    climaxFullBleedHeightPx: 1820,
    openingHookHeightPx: 1320,
    cliffhangerHeightPx: 1480,
    defaultGutterTone: "gradient-breath",
    climaxGutterTone: "gradient-breath",
    avgSecondsPerCut: 2.25,
  },
  thriller: {
    id: "thriller",
    labelKo: "스릴러",
    shortTagKo: "긴장·암전 반전",
    pacingSummaryKo:
      "긴 암전 여백과 점진적 컷 축소로 숨 막히는 압박을 만든 뒤, 반전 순간에 전면 충격 컷으로 독자를 붙잡습니다.",
    signatureRhythmKo: "압박 컷(640~820px) + 암전 롱 거터(240~340px) → 반전 전면 컷(2,120px)",
    actRatios: { ki: 0.17, seung: 0.33, jeon: 0.32, gyeol: 0.18 },
    actBaseHeightPx: { ki: 880, seung: 790, jeon: 660, gyeol: 920 },
    actBaseGutterPx: { ki: 180, seung: 210, jeon: 280, gyeol: 250 },
    climaxFullBleedHeightPx: 2120,
    openingHookHeightPx: 1360,
    cliffhangerHeightPx: 1640,
    defaultGutterTone: "dark-fade",
    climaxGutterTone: "dark-fade",
    avgSecondsPerCut: 2.05,
  },
  "slice-of-life": {
    id: "slice-of-life",
    labelKo: "일상",
    shortTagKo: "경쾌한 템포·티키타카",
    pacingSummaryKo:
      "안정적이고 고른 컷 간격과 넉넉한 대사 안전영역으로 가독성을 높이고, 웃음·공감 펀치라인에서 컷을 시원하게 확장합니다.",
    signatureRhythmKo: "균일 티키타카 컷(820~920px) + 경쾌한 여백(105px) → 펀치라인 컷(1,440px)",
    actRatios: { ki: 0.2, seung: 0.35, jeon: 0.25, gyeol: 0.2 },
    actBaseHeightPx: { ki: 840, seung: 860, jeon: 920, gyeol: 860 },
    actBaseGutterPx: { ki: 104, seung: 108, jeon: 120, gyeol: 118 },
    climaxFullBleedHeightPx: 1440,
    openingHookHeightPx: 1060,
    cliffhangerHeightPx: 1120,
    defaultGutterTone: "paper",
    climaxGutterTone: "paper",
    avgSecondsPerCut: 1.85,
  },
};

export function normalizeGenreSkeletonId(rawGenre: string | undefined): GenreSkeletonId {
  if (!rawGenre) return "action";
  const normalized = rawGenre.trim().toLowerCase();
  if (normalized.includes("로맨스") || normalized.includes("로판") || normalized.includes("romance")) {
    return "romance";
  }
  if (
    normalized.includes("스릴러") ||
    normalized.includes("미스터리") ||
    normalized.includes("공포") ||
    normalized.includes("호러") ||
    normalized.includes("thriller")
  ) {
    return "thriller";
  }
  if (
    normalized.includes("일상") ||
    normalized.includes("코미디") ||
    normalized.includes("개그") ||
    normalized.includes("힐링") ||
    normalized.includes("slice")
  ) {
    return "slice-of-life";
  }
  return "action";
}
