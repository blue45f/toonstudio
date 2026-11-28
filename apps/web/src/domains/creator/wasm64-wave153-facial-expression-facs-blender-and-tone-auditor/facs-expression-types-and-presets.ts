/**
 * Wave 153 — 폴 에크만 FACS 18-액션유닛(AU) 표준, 만화 이모션 마커,
 * 8종 정본 웹툰 감정 프리셋 및 해부학적 상호 배타 AU 제약 테이블.
 *
 * - 순수 ES2017 strict TypeScript, 외부 런타임 의존성 없음.
 * - 모든 AU 활성도는 [0, 1] 구간으로 엄격히 정규화한다.
 */

export const FACS_ACTION_UNIT_IDS = [
  "AU01_innerBrowRaise",
  "AU02_outerBrowRaise",
  "AU04_browLowerer",
  "AU05_upperLidRaiser",
  "AU06_cheekRaiser",
  "AU07_lidTightener",
  "AU09_noseWrinkler",
  "AU10_upperLipRaiser",
  "AU12_lipCornerPuller",
  "AU14_dimpler",
  "AU15_lipCornerDepressor",
  "AU17_chinRaiser",
  "AU20_lipStretcher",
  "AU23_lipTightener",
  "AU25_lipsPart",
  "AU26_jawDrop",
  "AU27_mouthStretch",
  "AU43_eyesClosed",
] as const;

export type FacsActionUnitId = (typeof FACS_ACTION_UNIT_IDS)[number];

export type FacsActionUnitVector = Readonly<Record<FacsActionUnitId, number>>;

export type FacsActionUnitRegion = "brow" | "eye" | "nose-cheek" | "mouth";

export interface FacsActionUnitMetadata {
  readonly id: FacsActionUnitId;
  readonly code: string;
  readonly labelKo: string;
  readonly region: FacsActionUnitRegion;
}

export const FACS_AU_METADATA: Readonly<Record<FacsActionUnitId, FacsActionUnitMetadata>> = {
  AU01_innerBrowRaise: {
    id: "AU01_innerBrowRaise",
    code: "AU01",
    labelKo: "안쪽 눈썹 올림",
    region: "brow",
  },
  AU02_outerBrowRaise: {
    id: "AU02_outerBrowRaise",
    code: "AU02",
    labelKo: "바깥 눈썹 올림",
    region: "brow",
  },
  AU04_browLowerer: {
    id: "AU04_browLowerer",
    code: "AU04",
    labelKo: "눈썹 내림·미간 찌푸림",
    region: "brow",
  },
  AU05_upperLidRaiser: {
    id: "AU05_upperLidRaiser",
    code: "AU05",
    labelKo: "윗눈꺼풀 치켜뜸",
    region: "eye",
  },
  AU06_cheekRaiser: {
    id: "AU06_cheekRaiser",
    code: "AU06",
    labelKo: "광대·눈밑 올림",
    region: "nose-cheek",
  },
  AU07_lidTightener: {
    id: "AU07_lidTightener",
    code: "AU07",
    labelKo: "눈꺼풀 힘줌·가늘게 뜸",
    region: "eye",
  },
  AU09_noseWrinkler: {
    id: "AU09_noseWrinkler",
    code: "AU09",
    labelKo: "콧등 주름",
    region: "nose-cheek",
  },
  AU10_upperLipRaiser: {
    id: "AU10_upperLipRaiser",
    code: "AU10",
    labelKo: "윗입술 들림",
    region: "mouth",
  },
  AU12_lipCornerPuller: {
    id: "AU12_lipCornerPuller",
    code: "AU12",
    labelKo: "입꼬리 당김(미소)",
    region: "mouth",
  },
  AU14_dimpler: {
    id: "AU14_dimpler",
    code: "AU14",
    labelKo: "보조개·입꼬리 조임",
    region: "mouth",
  },
  AU15_lipCornerDepressor: {
    id: "AU15_lipCornerDepressor",
    code: "AU15",
    labelKo: "입꼬리 처짐",
    region: "mouth",
  },
  AU17_chinRaiser: {
    id: "AU17_chinRaiser",
    code: "AU17",
    labelKo: "턱 끝 올림",
    region: "mouth",
  },
  AU20_lipStretcher: {
    id: "AU20_lipStretcher",
    code: "AU20",
    labelKo: "입술 가로 당김",
    region: "mouth",
  },
  AU23_lipTightener: {
    id: "AU23_lipTightener",
    code: "AU23",
    labelKo: "입술 꽉 다묾",
    region: "mouth",
  },
  AU25_lipsPart: {
    id: "AU25_lipsPart",
    code: "AU25",
    labelKo: "입술 벌림",
    region: "mouth",
  },
  AU26_jawDrop: {
    id: "AU26_jawDrop",
    code: "AU26",
    labelKo: "턱 떨어뜨림",
    region: "mouth",
  },
  AU27_mouthStretch: {
    id: "AU27_mouthStretch",
    code: "AU27",
    labelKo: "입 크게 벌림(외침)",
    region: "mouth",
  },
  AU43_eyesClosed: {
    id: "AU43_eyesClosed",
    code: "AU43",
    labelKo: "눈 감음",
    region: "eye",
  },
};

export interface ComicEmotionFxFlags {
  /** 홍조 강도 [0, 1] */
  readonly blushIntensity: number;
  /** 식은땀·당황 땀방울 마커 */
  readonly sweatDrop: boolean;
  /** 분노 힘줄(빠직 마크) */
  readonly angerVein: boolean;
  /** 눈물 고임·방울 강도 [0, 1] */
  readonly tearPool: number;
  /** 눈 위 그늘·음영 강도 [0, 1] */
  readonly shadowOverEyes: number;
  /** 눈동자 반짝임 하이라이트 */
  readonly sparkleEyes: boolean;
}

export const DEFAULT_COMIC_EMOTION_FX_FLAGS: ComicEmotionFxFlags = {
  blushIntensity: 0,
  sweatDrop: false,
  angerVein: false,
  tearPool: 0,
  shadowOverEyes: 0,
  sparkleEyes: false,
};

export const WEBTOON_EMOTION_PRESET_IDS = [
  "neutral",
  "joy-warm",
  "anger-shout",
  "sorrow-cry",
  "shock-terror",
  "smug-scheming",
  "embarrassed-fluster",
  "exhausted-hollow",
] as const;

export type WebtoonEmotionPresetId = (typeof WEBTOON_EMOTION_PRESET_IDS)[number];

export type EmotionPolarity = "positive" | "negative" | "neutral" | "ambiguous";

export interface WebtoonEmotionPreset {
  readonly id: WebtoonEmotionPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly polarity: EmotionPolarity;
  readonly arousal: number;
  readonly defaultAsymmetry: number;
  readonly au: FacsActionUnitVector;
  readonly fx: ComicEmotionFxFlags;
}

export interface FacsMutualExclusionRule {
  readonly id: string;
  readonly auA: FacsActionUnitId;
  readonly auB: FacsActionUnitId;
  readonly bothMinThreshold: number;
  readonly sumMax: number;
  readonly tieBreakWinner: FacsActionUnitId;
  readonly descriptionKo: string;
}

export interface AnatomicalAuConflict {
  readonly ruleId: string;
  readonly auA: FacsActionUnitId;
  readonly auB: FacsActionUnitId;
  readonly valueA: number;
  readonly valueB: number;
  readonly combinedValue: number;
  readonly maxAllowedSum: number;
  readonly descriptionKo: string;
}

/**
 * 해부학적으로 동시 고활성이 모순되는 상호 배타 AU 제약 테이블.
 * 참고: AU01(안쪽 눈썹 올림) + AU04(눈썹 내림)는 슬픔/애원 특유의 팔자 눈썹으로 해부학적 정상 조합이다.
 */
export const FACS_MUTUAL_EXCLUSION_RULES: ReadonlyArray<FacsMutualExclusionRule> = [
  {
    id: "lid-raiser-vs-eyes-closed",
    auA: "AU05_upperLidRaiser",
    auB: "AU43_eyesClosed",
    bothMinThreshold: 0.45,
    sumMax: 1.05,
    tieBreakWinner: "AU05_upperLidRaiser",
    descriptionKo: "윗눈꺼풀 최대 개안(AU05)과 완전 폐안(AU43)은 동시에 강하게 공존할 수 없음",
  },
  {
    id: "lip-corner-pull-vs-depress",
    auA: "AU12_lipCornerPuller",
    auB: "AU15_lipCornerDepressor",
    bothMinThreshold: 0.5,
    sumMax: 1.15,
    tieBreakWinner: "AU12_lipCornerPuller",
    descriptionKo: "입꼬리 상승(AU12)과 입꼬리 하강(AU15)의 동시 고활성은 해부학적으로 상충함",
  },
  {
    id: "lip-tighten-vs-mouth-stretch",
    auA: "AU23_lipTightener",
    auB: "AU27_mouthStretch",
    bothMinThreshold: 0.45,
    sumMax: 1.05,
    tieBreakWinner: "AU27_mouthStretch",
    descriptionKo: "입술 꽉 다묾(AU23)과 입 크게 벌림(AU27)은 동시에 성립할 수 없음",
  },
  {
    id: "lip-tighten-vs-jaw-drop",
    auA: "AU23_lipTightener",
    auB: "AU26_jawDrop",
    bothMinThreshold: 0.5,
    sumMax: 1.15,
    tieBreakWinner: "AU26_jawDrop",
    descriptionKo: "입술 강하게 조임(AU23)과 턱 크게 떨어뜨림(AU26)이 동시에 고활성 상태임",
  },
  {
    id: "outer-brow-raise-vs-brow-lower",
    auA: "AU02_outerBrowRaise",
    auB: "AU04_browLowerer",
    bothMinThreshold: 0.65,
    sumMax: 1.35,
    tieBreakWinner: "AU04_browLowerer",
    descriptionKo: "바깥 눈썹 최대 상승(AU02)과 미간 강한 하강(AU04)이 과도하게 충돌함",
  },
];

/**
 * 임의 숫자를 유한한 [0, 1] AU 활성도로 정규화한다.
 */
export function clampAuValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Math.round(value * 10000) / 10000;
}

/**
 * 비대칭 계수를 [-1, 1] 범위로 정규화한다.
 */
export function clampAsymmetry(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= -1) return -1;
  if (value >= 1) return 1;
  return Math.round(value * 10000) / 10000;
}

/**
 * 부분 AU 맵으로부터 18종 키가 완비된 정규화 AU 벡터를 생성한다.
 */
export function sanitizeAuVector(
  partial?: Partial<Record<FacsActionUnitId, number>>,
): FacsActionUnitVector {
  const result: Record<FacsActionUnitId, number> = {
    AU01_innerBrowRaise: 0,
    AU02_outerBrowRaise: 0,
    AU04_browLowerer: 0,
    AU05_upperLidRaiser: 0,
    AU06_cheekRaiser: 0,
    AU07_lidTightener: 0,
    AU09_noseWrinkler: 0,
    AU10_upperLipRaiser: 0,
    AU12_lipCornerPuller: 0,
    AU14_dimpler: 0,
    AU15_lipCornerDepressor: 0,
    AU17_chinRaiser: 0,
    AU20_lipStretcher: 0,
    AU23_lipTightener: 0,
    AU25_lipsPart: 0,
    AU26_jawDrop: 0,
    AU27_mouthStretch: 0,
    AU43_eyesClosed: 0,
  };
  if (partial === undefined) {
    return result;
  }
  for (let i = 0; i < FACS_ACTION_UNIT_IDS.length; i += 1) {
    const key = FACS_ACTION_UNIT_IDS[i];
    if (key === undefined) continue;
    const raw = partial[key];
    result[key] = raw === undefined ? 0 : clampAuValue(raw);
  }
  return result;
}

/**
 * 모든 18종 AU가 0인 중립 표정 벡터를 반환한다.
 */
export function createNeutralAuVector(): FacsActionUnitVector {
  return sanitizeAuVector();
}

/**
 * 만화 이모션 마커를 유한·안전 범위로 정규화한다.
 */
export function sanitizeComicEmotionFxFlags(
  partial?: Partial<ComicEmotionFxFlags>,
): ComicEmotionFxFlags {
  if (partial === undefined) {
    return { ...DEFAULT_COMIC_EMOTION_FX_FLAGS };
  }
  return {
    blushIntensity: clampAuValue(partial.blushIntensity ?? 0),
    sweatDrop: Boolean(partial.sweatDrop),
    angerVein: Boolean(partial.angerVein),
    tearPool: clampAuValue(partial.tearPool ?? 0),
    shadowOverEyes: clampAuValue(partial.shadowOverEyes ?? 0),
    sparkleEyes: Boolean(partial.sparkleEyes),
  };
}

/**
 * 8종 정본 웹툰 감정 표정 프리셋 카탈로그.
 */
export const WEBTOON_EMOTION_PRESETS: Readonly<Record<WebtoonEmotionPresetId, WebtoonEmotionPreset>> = {
  neutral: {
    id: "neutral",
    labelKo: "평온·기본",
    summaryKo: "긴장이 풀린 눈썹과 자연스럽게 다문 입술의 기준 표정",
    polarity: "neutral",
    arousal: 0.1,
    defaultAsymmetry: 0,
    au: sanitizeAuVector({}),
    fx: sanitizeComicEmotionFxFlags({}),
  },
  "joy-warm": {
    id: "joy-warm",
    labelKo: "따뜻한 기쁨",
    summaryKo: "광대(AU06)와 입꼬리(AU12)가 함께 올라가는 진정성 있는 Duchenne 미소",
    polarity: "positive",
    arousal: 0.65,
    defaultAsymmetry: 0,
    au: sanitizeAuVector({
      AU01_innerBrowRaise: 0.12,
      AU02_outerBrowRaise: 0.15,
      AU06_cheekRaiser: 0.78,
      AU12_lipCornerPuller: 0.86,
      AU25_lipsPart: 0.28,
      AU26_jawDrop: 0.12,
    }),
    fx: sanitizeComicEmotionFxFlags({
      blushIntensity: 0.22,
      sparkleEyes: true,
    }),
  },
  "anger-shout": {
    id: "anger-shout",
    labelKo: "격앙된 분노 외침",
    summaryKo: "강하게 내리누른 미간(AU04)·콧등 주름(AU09)과 크게 벌린 외침 입(AU25~27)",
    polarity: "negative",
    arousal: 0.95,
    defaultAsymmetry: 0,
    au: sanitizeAuVector({
      AU04_browLowerer: 0.92,
      AU05_upperLidRaiser: 0.42,
      AU07_lidTightener: 0.72,
      AU09_noseWrinkler: 0.56,
      AU10_upperLipRaiser: 0.64,
      AU25_lipsPart: 0.9,
      AU26_jawDrop: 0.78,
      AU27_mouthStretch: 0.56,
    }),
    fx: sanitizeComicEmotionFxFlags({
      angerVein: true,
      shadowOverEyes: 0.18,
    }),
  },
  "sorrow-cry": {
    id: "sorrow-cry",
    labelKo: "애절한 슬픔·울음",
    summaryKo: "안쪽 눈썹 상승(AU01)+미간 조임(AU04)의 팔자 눈썹과 처진 입꼬리(AU15), 고인 눈물",
    polarity: "negative",
    arousal: 0.72,
    defaultAsymmetry: 0,
    au: sanitizeAuVector({
      AU01_innerBrowRaise: 0.88,
      AU04_browLowerer: 0.62,
      AU06_cheekRaiser: 0.34,
      AU07_lidTightener: 0.48,
      AU15_lipCornerDepressor: 0.82,
      AU17_chinRaiser: 0.68,
      AU25_lipsPart: 0.44,
      AU26_jawDrop: 0.24,
    }),
    fx: sanitizeComicEmotionFxFlags({
      tearPool: 0.86,
      blushIntensity: 0.24,
    }),
  },
  "shock-terror": {
    id: "shock-terror",
    labelKo: "충격·경악 공포",
    summaryKo: "최대로 치켜뜬 눈썹·눈꺼풀(AU01·02·05)과 수평 당김·개구(AU20·26·27)",
    polarity: "negative",
    arousal: 0.98,
    defaultAsymmetry: 0,
    au: sanitizeAuVector({
      AU01_innerBrowRaise: 0.86,
      AU02_outerBrowRaise: 0.9,
      AU05_upperLidRaiser: 0.95,
      AU20_lipStretcher: 0.68,
      AU25_lipsPart: 0.86,
      AU26_jawDrop: 0.82,
      AU27_mouthStretch: 0.64,
    }),
    fx: sanitizeComicEmotionFxFlags({
      sweatDrop: true,
      shadowOverEyes: 0.26,
    }),
  },
  "smug-scheming": {
    id: "smug-scheming",
    labelKo: "능글·계략적 비웃음",
    summaryKo: "광대 활성 없이(AU06 낮음) 한쪽 입꼬리와 눈썹만 비대칭으로 올린 냉소 미소",
    polarity: "ambiguous",
    arousal: 0.52,
    defaultAsymmetry: 0.62,
    au: sanitizeAuVector({
      AU02_outerBrowRaise: 0.34,
      AU04_browLowerer: 0.24,
      AU06_cheekRaiser: 0.1,
      AU07_lidTightener: 0.48,
      AU12_lipCornerPuller: 0.62,
      AU14_dimpler: 0.66,
    }),
    fx: sanitizeComicEmotionFxFlags({
      shadowOverEyes: 0.24,
    }),
  },
  "embarrassed-fluster": {
    id: "embarrassed-fluster",
    labelKo: "당황·수줍은 홍조",
    summaryKo: "약간 올라간 안쪽 눈썹과 긴장된 입술, 진한 홍조와 땀방울 마커",
    polarity: "ambiguous",
    arousal: 0.62,
    defaultAsymmetry: 0.12,
    au: sanitizeAuVector({
      AU01_innerBrowRaise: 0.5,
      AU02_outerBrowRaise: 0.28,
      AU06_cheekRaiser: 0.32,
      AU12_lipCornerPuller: 0.24,
      AU14_dimpler: 0.32,
      AU20_lipStretcher: 0.28,
      AU23_lipTightener: 0.34,
      AU25_lipsPart: 0.2,
    }),
    fx: sanitizeComicEmotionFxFlags({
      blushIntensity: 0.88,
      sweatDrop: true,
    }),
  },
  "exhausted-hollow": {
    id: "exhausted-hollow",
    labelKo: "탈진·공허 무력감",
    summaryKo: "반쯤 감긴 눈꺼풀(AU43), 힘없이 처진 입꼬리(AU15), 짙은 눈 위 음영",
    polarity: "negative",
    arousal: 0.18,
    defaultAsymmetry: 0,
    au: sanitizeAuVector({
      AU01_innerBrowRaise: 0.3,
      AU04_browLowerer: 0.24,
      AU15_lipCornerDepressor: 0.48,
      AU25_lipsPart: 0.18,
      AU43_eyesClosed: 0.58,
    }),
    fx: sanitizeComicEmotionFxFlags({
      shadowOverEyes: 0.82,
    }),
  },
};

/**
 * 프리셋 ID로 정본 웹툰 감정 표정 프리셋을 조회한다.
 */
export function getWebtoonEmotionPreset(presetId: WebtoonEmotionPresetId): WebtoonEmotionPreset {
  return WEBTOON_EMOTION_PRESETS[presetId];
}

/**
 * 18-AU 벡터에서 해부학적 상호 배타 충돌 목록을 탐지한다.
 */
export function detectAnatomicalAuConflicts(au: FacsActionUnitVector): AnatomicalAuConflict[] {
  const conflicts: AnatomicalAuConflict[] = [];
  for (let i = 0; i < FACS_MUTUAL_EXCLUSION_RULES.length; i += 1) {
    const rule = FACS_MUTUAL_EXCLUSION_RULES[i];
    if (rule === undefined) continue;
    const valueA = clampAuValue(au[rule.auA]);
    const valueB = clampAuValue(au[rule.auB]);
    const combinedValue = Math.round((valueA + valueB) * 10000) / 10000;
    if (
      valueA >= rule.bothMinThreshold &&
      valueB >= rule.bothMinThreshold &&
      combinedValue > rule.sumMax
    ) {
      conflicts.push({
        ruleId: rule.id,
        auA: rule.auA,
        auB: rule.auB,
        valueA,
        valueB,
        combinedValue,
        maxAllowedSum: rule.sumMax,
        descriptionKo: rule.descriptionKo,
      });
    }
  }
  return conflicts;
}

/**
 * 두 18-AU 벡터 사이의 유클리드 거리(L2 노름)를 계산한다.
 */
export function computeAuEuclideanDistance(
  a: FacsActionUnitVector,
  b: FacsActionUnitVector,
): number {
  let sumSq = 0;
  for (let i = 0; i < FACS_ACTION_UNIT_IDS.length; i += 1) {
    const key = FACS_ACTION_UNIT_IDS[i];
    if (key === undefined) continue;
    const diff = clampAuValue(a[key]) - clampAuValue(b[key]);
    sumSq += diff * diff;
  }
  return Math.round(Math.sqrt(sumSq) * 10000) / 10000;
}
