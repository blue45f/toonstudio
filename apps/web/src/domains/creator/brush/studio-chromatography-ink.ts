/**
 * 크로마토그래피 잉크 브러시 런타임 모델.
 *
 * 종이 크로마토그래피 현상을 재현한다: 젖은 잉크 방울이 마르며
 * 성분 안료들이 이동도(mobility) 차이에 따라 분리된다.
 * - 이동도가 높은 성분은 바깥으로 멀리 퍼진다
 * - 이동도가 낮은 성분은 중심에 남는다
 * - 마름(dryness)이 진행될수록 분리 폭이 커진다
 *
 * 기존 `dendritic-copper`(가지형 반응 성장)나 `v7-backrun-*`(역행 번짐)와 달리,
 * 이 모듈은 "한 방울 안의 다성분 분리"를 모델링한다.
 *
 * 순수 함수. 렌더러는 dab마다 `resolveStudioChromatographyColor`로 색을 구한다.
 */

export interface StudioChromatographyComponent {
  /** 성분 색 [r, g, b] 0..255 */
  readonly color: readonly [number, number, number];
  /** 이동도 0..1 — 높을수록 바깥으로 멀리 이동 */
  readonly mobility: number;
  /** 성분량 0..1 */
  readonly amount: number;
}

export interface StudioChromatographyInk {
  readonly components: readonly StudioChromatographyComponent[];
  /** 마름에 따른 분리 폭 0..1 */
  readonly separation: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clamp255(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** 잉크 정의를 정규화한다. 성분이 없으면 null. */
export function normalizeStudioChromatographyInk(
  components: readonly StudioChromatographyComponent[],
  separation = 0.7,
): StudioChromatographyInk | null {
  const cleaned = components
    .filter((component) => component && Array.isArray(component.color) && component.color.length === 3)
    .map((component) => Object.freeze({
      color: Object.freeze([
        clamp255(component.color[0] ?? 0),
        clamp255(component.color[1] ?? 0),
        clamp255(component.color[2] ?? 0),
      ] as const),
      mobility: clamp01(component.mobility),
      amount: clamp01(component.amount),
    }))
    .filter((component) => component.amount > 0);
  if (cleaned.length === 0) return null;
  return Object.freeze({
    components: Object.freeze(cleaned),
    separation: clamp01(separation),
  });
}

/**
 * 성분의 농도 분포. 각 성분은 `mobility * spread` 반경에 피크를 가진
 * 가우시안으로 퍼진다. 마름이 진행될수록 spread가 커지고(피크 분리),
 * sigma가 좁아져(링이 선명해져) 분리가 커진다.
 *
 * 젖은 상태(dryness≈0)에서는 sigma가 넓어 모든 성분이 섞인 혼합색에 가깝고,
 * 마를수록 각 성분의 링이 분리된다 — 실제 종이 크로마토그래피와 같은 거동이다.
 */
export function studioChromatographyConcentration(
  component: StudioChromatographyComponent,
  radial01: number,
  dryness01: number,
  separation: number,
): number {
  const radial = clamp01(radial01);
  const dryness = clamp01(dryness01);
  const spread = 0.15 + 0.85 * dryness * clamp01(separation);
  const peakRadius = component.mobility * spread;
  // 젖음: 넓게 퍼져 혼합 / 건조: 좁아져 링 분리
  const sigma = 0.35 - 0.2 * dryness * clamp01(separation);
  const distance = radial - peakRadius;
  const gaussian = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  return component.amount * gaussian;
}

/**
 * dab 위치의 최종 색을 구한다. radial01: 0=중심, 1=가장자리.
 * dryness01: 0=젖음, 1=건조.
 */
export function resolveStudioChromatographyColor(
  ink: StudioChromatographyInk,
  radial01: number,
  dryness01: number,
): readonly [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (const component of ink.components) {
    const concentration = studioChromatographyConcentration(
      component,
      radial01,
      dryness01,
      ink.separation,
    );
    r += component.color[0] * concentration;
    g += component.color[1] * concentration;
    b += component.color[2] * concentration;
    total += concentration;
  }
  if (total <= 0) return [0, 0, 0] as const;
  return Object.freeze([clamp255(r / total), clamp255(g / total), clamp255(b / total)] as const);
}

/**
 * 검정 잉크가 파랑/빨강 성분으로 분리되는 프리셋 (크로마토그래피 교과서 예시).
 */
export function studioChromatographyInkBlackPreset(
  separation = 0.75,
): StudioChromatographyInk | null {
  return normalizeStudioChromatographyInk(
    [
      { color: [20, 20, 28], mobility: 0.15, amount: 0.5 },
      { color: [37, 99, 235], mobility: 0.55, amount: 0.3 },
      { color: [220, 38, 38], mobility: 0.9, amount: 0.2 },
    ],
    separation,
  );
}

/**
 * 갈색 먹이 황토/먹 성분으로 분리되는 프리셋 (동양화 먹 번짐 응용).
 */
export function studioChromatographyInkSumiPreset(
  separation = 0.65,
): StudioChromatographyInk | null {
  return normalizeStudioChromatographyInk(
    [
      { color: [24, 24, 27], mobility: 0.2, amount: 0.55 },
      { color: [120, 113, 108], mobility: 0.5, amount: 0.25 },
      { color: [180, 160, 130], mobility: 0.85, amount: 0.2 },
    ],
    separation,
  );
}

/** CSS 색 문자열로 변환한다. */
export function studioChromatographyColorToCss(
  color: readonly [number, number, number],
): string {
  return `rgb(${clamp255(color[0])}, ${clamp255(color[1])}, ${clamp255(color[2])})`;
}

export type StudioChromatographyPresetId =
  | "black-separation"
  | "sumi-ochre"
  | "twilight-nebula"
  | "botanical-moss"
  | "blood-moon-ember";

export interface StudioChromatographyPresetDescriptor {
  readonly id: StudioChromatographyPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly ink: StudioChromatographyInk;
}

function mustInk(
  components: readonly StudioChromatographyComponent[],
  separation: number,
): StudioChromatographyInk {
  const normalized = normalizeStudioChromatographyInk(components, separation);
  if (!normalized) {
    throw new Error("Invalid chromatography ink preset");
  }
  return normalized;
}

/**
 * 다성분 크로마토그래피 잉크 개성 프리셋 카탈로그 5종.
 * 단순 단색 번짐을 넘어 만화·웹툰·일러스트 배경 및 이펙트에 개성 있는 색띠 분리를 제공한다.
 */
export const STUDIO_CHROMATOGRAPHY_PRESET_CATALOG: Readonly<
  Record<StudioChromatographyPresetId, StudioChromatographyPresetDescriptor>
> = Object.freeze({
  "black-separation": {
    id: "black-separation",
    labelKo: "클래식 블랙 크로마토그래피",
    summaryKo: "중심의 짙은 카본 블랙에서 코발트 블루와 크림슨 레드 외곽 링으로 분리되는 만년필 수성 잉크",
    ink: mustInk(
      [
        { color: [20, 20, 28], mobility: 0.15, amount: 0.5 },
        { color: [37, 99, 235], mobility: 0.55, amount: 0.3 },
        { color: [220, 38, 38], mobility: 0.9, amount: 0.2 },
      ],
      0.75,
    ),
  },
  "sumi-ochre": {
    id: "sumi-ochre",
    labelKo: "동양화 고묵·황토 분리",
    summaryKo: "중심 농묵 주위로 다갈색 아교층과 따뜻한 황토색 번짐 테두리가 분리되는 동양화풍 수묵",
    ink: mustInk(
      [
        { color: [24, 24, 27], mobility: 0.2, amount: 0.55 },
        { color: [156, 116, 78], mobility: 0.5, amount: 0.25 },
        { color: [196, 164, 118], mobility: 0.88, amount: 0.2 },
      ],
      0.68,
    ),
  },
  "twilight-nebula": {
    id: "twilight-nebula",
    labelKo: "황혼 성운 듀오크롬 잉크",
    summaryKo: "심해 남색 코어에서 로열 바이올렛을 거쳐 로즈 골드 외곽 링으로 분리되는 판타지·로맨스 배경 잉크",
    ink: mustInk(
      [
        { color: [18, 28, 84], mobility: 0.16, amount: 0.48 },
        { color: [124, 58, 237], mobility: 0.54, amount: 0.32 },
        { color: [245, 158, 11], mobility: 0.92, amount: 0.2 },
      ],
      0.82,
    ),
  },
  "botanical-moss": {
    id: "botanical-moss",
    labelKo: "보태니컬 이끼·감보지 잉크",
    summaryKo: "짙은 숲 녹색에서 피콕 시안과 밝은 감보지 옐로 테두리로 갈라지는 자연물·수풀 표현 잉크",
    ink: mustInk(
      [
        { color: [16, 62, 42], mobility: 0.18, amount: 0.5 },
        { color: [14, 165, 233], mobility: 0.52, amount: 0.28 },
        { color: [234, 179, 8], mobility: 0.9, amount: 0.22 },
      ],
      0.78,
    ),
  },
  "blood-moon-ember": {
    id: "blood-moon-ember",
    labelKo: "블러드문 잔불 잉크",
    summaryKo: "검붉은 응고 중심에서 선홍색 버밀리온과 호박색 불꽃 테두리로 번지는 액션·다크 판타지 효과 잉크",
    ink: mustInk(
      [
        { color: [58, 10, 18], mobility: 0.14, amount: 0.52 },
        { color: [225, 29, 72], mobility: 0.56, amount: 0.3 },
        { color: [251, 146, 60], mobility: 0.91, amount: 0.18 },
      ],
      0.8,
    ),
  },
});

/**
 * Beer-Lambert / Kubelka-Munk 광학 밀도(Optical Density) 기반 감산 크로마토그래피 색상 해석기.
 * 선형 RGB 가중평균에서 발생하는 보색 간 회색 탁화 현상을 방지하고,
 * 종이 섬유 모세관 깃털 번짐(fiberFeather01)에 따른 미세 반경 변조를 반영한다.
 */
export function resolveStudioChromatographySubtractiveColor(
  ink: StudioChromatographyInk,
  radial01: number,
  dryness01: number,
  fiberFeather01 = 0,
): readonly [number, number, number] {
  const featherShift = (clamp01(fiberFeather01) - 0.5) * 0.12 * clamp01(dryness01);
  const effectiveRadial = clamp01(radial01 + featherShift);

  let odR = 0;
  let odG = 0;
  let odB = 0;
  let totalWeight = 0;

  for (const component of ink.components) {
    const conc = studioChromatographyConcentration(
      component,
      effectiveRadial,
      dryness01,
      ink.separation,
    );
    if (conc <= 1e-6) continue;
    const tr = Math.max(0.02, component.color[0] / 255);
    const tg = Math.max(0.02, component.color[1] / 255);
    const tb = Math.max(0.02, component.color[2] / 255);
    odR += -Math.log(tr) * conc;
    odG += -Math.log(tg) * conc;
    odB += -Math.log(tb) * conc;
    totalWeight += conc;
  }

  if (totalWeight <= 1e-6) return [0, 0, 0] as const;

  const normR = odR / totalWeight;
  const normG = odG / totalWeight;
  const normB = odB / totalWeight;
  return Object.freeze([
    clamp255(Math.exp(-normR) * 255),
    clamp255(Math.exp(-normG) * 255),
    clamp255(Math.exp(-normB) * 255),
  ] as const);
}

export interface ChromatographyRingMetrics {
  /** 중심(r=0.05)과 외곽(r=0.92) 사이의 유클리드 색차(0..441.67). */
  readonly centerToEdgeColorDelta: number;
  /** 중간 링(r=0.52)의 채도(최대-최소 채널 차, 0..255). */
  readonly midRingChroma: number;
  /** 분리 완료 지수 (0..1). */
  readonly separationIndex: number;
}

/**
 * 크로마토그래피 잉크 방울의 반경별 색띠 분리 품질 지표를 정량 평가한다.
 */
export function evaluateChromatographyRingMetrics(
  ink: StudioChromatographyInk,
  dryness01 = 0.95,
): ChromatographyRingMetrics {
  const center = resolveStudioChromatographySubtractiveColor(ink, 0.05, dryness01);
  const mid = resolveStudioChromatographySubtractiveColor(ink, 0.52, dryness01);
  const edge = resolveStudioChromatographySubtractiveColor(ink, 0.92, dryness01);

  const centerToEdgeColorDelta = Math.hypot(
    center[0] - edge[0],
    center[1] - edge[1],
    center[2] - edge[2],
  );
  const midRingChroma = Math.max(mid[0], mid[1], mid[2]) - Math.min(mid[0], mid[1], mid[2]);
  const separationIndex = clamp01(centerToEdgeColorDelta / 180);

  return {
    centerToEdgeColorDelta: Math.round(centerToEdgeColorDelta * 100) / 100,
    midRingChroma,
    separationIndex: Math.round(separationIndex * 1000) / 1000,
  };
}

