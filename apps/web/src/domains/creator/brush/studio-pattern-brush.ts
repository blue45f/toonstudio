/**
 * 클립스튜디오 페인트 5.1.5 `데코레이션(Decoration)` 다중 패턴 스탬프 및 리본(Ribbon) 브러시 엔진.
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `BrushUsePatternImage`, `BrushPatternImageArray`, `BrushPatternOrderType`, `BrushPatternOrderType2`,
 *   `BrushPatternReverseHorizontal`, `BrushPatternReverseVertical`, `BrushRibbon`,
 *   `BrushChangePatternColor`, `BrushBlendPatternByDarken`;
 *   서브툴 트리 `Decoration > Effect / Background / Clothing` (Lace, Simple frill, Chain, Petal, Sparkle, Leaves).
 *
 * 제3자 에셋 복제 없이 순수 절차적(Procedural) 클린룸 도형 모티프 6종과 최대 8개 팁 시퀀스,
 * 호 길이 접선 정렬 스탬프 및 연속 사변형 스트립(Ribbon) 메쉬 생성기, 휘도 보존 재채색을 구현한다.
 */

export type StudioPatternOrderMode =
  | "repeat"
  | "ping-pong"
  | "seeded-random"
  | "per-stroke";

export type StudioBuiltInPatternMotifId =
  | "none"
  | "lace"
  | "frill"
  | "chain"
  | "petal"
  | "sparkle"
  | "foliage";

export interface StudioPatternBrushConfig {
  readonly motif: StudioBuiltInPatternMotifId;
  readonly tipCount: number;
  readonly orderMode: StudioPatternOrderMode;
  readonly ribbon: boolean;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
  readonly recolorWithForeground: boolean;
  readonly spacingPx: number;
  readonly widthPx: number;
  readonly seed: number;
}

export interface StudioPatternStampPlacement {
  readonly index: number;
  readonly tipSlotIndex: number;
  readonly x: number;
  readonly y: number;
  readonly tangentAngleRad: number;
  readonly widthPx: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export interface StudioRibbonQuadSegment {
  readonly segmentIndex: number;
  readonly tipSlotIndex: number;
  /** `[x0Top, y0Top, x1Top, y1Top, x1Bottom, y1Bottom, x0Bottom, y0Bottom]` 시계방향 4정점. */
  readonly quadVertices: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  readonly uStart: number;
  readonly uEnd: number;
}

export interface RgbaTuple {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const STUDIO_PATTERN_MOTIF_LABELS: Readonly<Record<StudioBuiltInPatternMotifId, string>> = Object.freeze({
  none: "사용 안 함",
  lace: "레이스 자수",
  frill: "의상 프릴",
  chain: "금속 사슬",
  petal: "꽃잎 흩날림",
  sparkle: "반짝임 빛망울",
  foliage: "나뭇잎 수풀",
});

export const DEFAULT_STUDIO_PATTERN_BRUSH_CONFIG: StudioPatternBrushConfig = Object.freeze({
  motif: "none",
  tipCount: 4,
  orderMode: "repeat",
  ribbon: false,
  flipHorizontal: false,
  flipVertical: false,
  recolorWithForeground: true,
  spacingPx: 20,
  widthPx: 18,
  seed: 2026,
});

export function normalizeStudioPatternBrushConfig(
  input?: Partial<StudioPatternBrushConfig> | null,
): StudioPatternBrushConfig {
  if (!input) return DEFAULT_STUDIO_PATTERN_BRUSH_CONFIG;
  const motifs: readonly StudioBuiltInPatternMotifId[] = [
    "none",
    "lace",
    "frill",
    "chain",
    "petal",
    "sparkle",
    "foliage",
  ];
  const orders: readonly StudioPatternOrderMode[] = [
    "repeat",
    "ping-pong",
    "seeded-random",
    "per-stroke",
  ];
  const clamp = (v: unknown, min: number, max: number, fb: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb;
  return {
    motif: motifs.includes(input.motif as StudioBuiltInPatternMotifId)
      ? (input.motif as StudioBuiltInPatternMotifId)
      : "none",
    tipCount: Math.round(clamp(input.tipCount, 1, 8, DEFAULT_STUDIO_PATTERN_BRUSH_CONFIG.tipCount)),
    orderMode: orders.includes(input.orderMode as StudioPatternOrderMode)
      ? (input.orderMode as StudioPatternOrderMode)
      : "repeat",
    ribbon: Boolean(input.ribbon),
    flipHorizontal: Boolean(input.flipHorizontal),
    flipVertical: Boolean(input.flipVertical),
    recolorWithForeground: input.recolorWithForeground ?? true,
    spacingPx: clamp(input.spacingPx, 3, 240, DEFAULT_STUDIO_PATTERN_BRUSH_CONFIG.spacingPx),
    widthPx: clamp(input.widthPx, 2, 240, DEFAULT_STUDIO_PATTERN_BRUSH_CONFIG.widthPx),
    seed: typeof input.seed === "number" && Number.isFinite(input.seed) ? Math.trunc(input.seed) : 2026,
  };
}

function hashUint32(seed: number, step: number): number {
  let h = (seed ^ Math.imul(step + 1, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** 다중 패턴 슬롯(0..tipCount-1) 순서를 결정론적으로 선택한다. */
export function resolveStudioPatternTipIndex(
  tipCount: number,
  orderMode: StudioPatternOrderMode,
  stepIndex: number,
  strokeSeed: number,
): number {
  const count = Math.max(1, Math.min(8, Math.trunc(tipCount)));
  if (count === 1) return 0;
  const idx = Math.max(0, Math.trunc(stepIndex));
  if (orderMode === "repeat") {
    return idx % count;
  }
  if (orderMode === "ping-pong") {
    const cycle = count * 2 - 2;
    const m = idx % cycle;
    return m < count ? m : cycle - m;
  }
  if (orderMode === "per-stroke") {
    return hashUint32(strokeSeed, 0) % count;
  }
  return hashUint32(strokeSeed, idx) % count;
}

/**
 * 원본 팁 픽셀의 알파와 명암 대비(휘도)를 유지한 채 전경색(main)과 보조색(sub) 사이로 재채색한다.
 * 어두운 선화 영역은 전경색, 밝은 내부 하이라이트는 보조색(기본 흰색)으로 매핑된다.
 */
export function recolorPatternPixelLuminancePreserving(
  source: RgbaTuple,
  foreground: RgbaTuple,
  subColor: RgbaTuple = { r: 255, g: 255, b: 255, a: 255 },
): RgbaTuple {
  if (source.a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const luma = (0.2126 * source.r + 0.7152 * source.g + 0.0722 * source.b) / 255;
  const t = Math.min(1, Math.max(0, luma));
  return {
    r: Math.round(foreground.r + (subColor.r - foreground.r) * t),
    g: Math.round(foreground.g + (subColor.g - foreground.g) * t),
    b: Math.round(foreground.b + (subColor.b - foreground.b) * t),
    a: Math.round((source.a * foreground.a) / 255),
  };
}

/** 절차적 클린룸 모티프의 정규화 SVG 경로(뷰박스 -1..1)를 반환한다. */
export function buildProceduralMotifSvgPath(
  motif: Exclude<StudioBuiltInPatternMotifId, "none">,
  variantIndex = 0,
): string {
  const v = ((variantIndex % 4) + 4) % 4;
  switch (motif) {
    case "lace":
      return "M -1 0.6 Q -0.5 -0.8 0 0.2 Q 0.5 -0.8 1 0.6 M -0.5 0 A 0.16 0.16 0 1 0 -0.49 0 M 0.5 0 A 0.16 0.16 0 1 0 0.51 0";
    case "frill":
      return v % 2 === 0
        ? "M -1 -0.6 L -1 0.3 Q -0.5 0.9 0 0.25 Q 0.5 0.9 1 0.3 L 1 -0.6 Z"
        : "M -1 -0.6 L -1 0.45 Q -0.35 0.85 0.1 0.3 Q 0.6 0.95 1 0.35 L 1 -0.6 Z";
    case "chain":
      return v % 2 === 0
        ? "M -0.85 -0.42 L 0.85 -0.42 A 0.42 0.42 0 0 1 0.85 0.42 L -0.85 0.42 A 0.42 0.42 0 0 1 -0.85 -0.42 Z"
        : "M -0.95 -0.14 L 0.95 -0.14 L 0.95 0.14 L -0.95 0.14 Z";
    case "petal":
      return "M 0 -0.9 C 0.65 -0.45 0.72 0.45 0 0.9 C -0.72 0.45 -0.65 -0.45 0 -0.9 Z";
    case "sparkle":
      return "M 0 -0.95 Q 0.1 -0.1 0.95 0 Q 0.1 0.1 0 0.95 Q -0.1 0.1 -0.95 0 Q -0.1 -0.1 0 -0.95 Z";
    case "foliage":
      return "M -0.9 0 Q -0.2 -0.78 0.9 0 Q -0.2 0.78 -0.9 0 Z M -0.85 0 L 0.75 0";
  }
}

interface PolyStation {
  readonly x: number;
  readonly y: number;
  readonly angleRad: number;
  readonly nx: number;
  readonly ny: number;
  readonly s: number;
}

function buildStations(points: readonly { readonly x: number; readonly y: number }[]): PolyStation[] {
  if (points.length < 2) return [];
  const out: PolyStation[] = [];
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    const curr = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    if (i > 0) s += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    out.push({
      x: curr.x,
      y: curr.y,
      angleRad: Math.atan2(dy, dx),
      nx: -dy / len,
      ny: dx / len,
      s,
    });
  }
  return out;
}

function interpolateStation(stations: readonly PolyStation[], targetS: number): PolyStation {
  if (targetS <= 0) return stations[0]!;
  const last = stations[stations.length - 1]!;
  if (targetS >= last.s) return last;
  let lo = 0;
  let hi = stations.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (stations[mid]!.s <= targetS) lo = mid;
    else hi = mid;
  }
  const a = stations[lo]!;
  const b = stations[hi]!;
  const t = (targetS - a.s) / Math.max(1e-6, b.s - a.s);
  const nxRaw = a.nx + (b.nx - a.nx) * t;
  const nyRaw = a.ny + (b.ny - a.ny) * t;
  const nLen = Math.hypot(nxRaw, nyRaw) || 1;
  const nx = nxRaw / nLen;
  const ny = nyRaw / nLen;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angleRad: Math.atan2(nx, -ny) - Math.PI / 2,
    nx,
    ny,
    s: targetS,
  };
}

/** 호 길이에 따라 접선 방향으로 정렬된 다중 패턴 스탬프 배치 목록을 생성한다. */
export function planStudioPatternStamps(
  points: readonly { readonly x: number; readonly y: number }[],
  rawConfig: StudioPatternBrushConfig,
): StudioPatternStampPlacement[] {
  const config = normalizeStudioPatternBrushConfig(rawConfig);
  if (config.motif === "none" || points.length < 2) return [];
  const stations = buildStations(points);
  const total = stations[stations.length - 1]?.s ?? 0;
  if (total < 1e-3) return [];

  const placements: StudioPatternStampPlacement[] = [];
  let index = 0;
  for (let cursor = 0; cursor <= total; cursor += config.spacingPx) {
    const st = interpolateStation(stations, cursor);
    placements.push({
      index,
      tipSlotIndex: resolveStudioPatternTipIndex(
        config.tipCount,
        config.orderMode,
        index,
        config.seed,
      ),
      x: st.x,
      y: st.y,
      tangentAngleRad: Math.atan2(st.nx, -st.ny) - Math.PI / 2,
      widthPx: config.widthPx,
      flipX: config.flipHorizontal,
      flipY: config.flipVertical,
    });
    index += 1;
  }
  return placements;
}

/**
 * 리본(`BrushRibbon`) 모드용 연속 사변형 스트립(Quad Strip) 메쉬를 생성한다.
 * 인접 사변형이 경계 정점을 정확히 공유하여 곡선에서도 끊김 없는 레이스·사슬·프릴을 표현한다.
 */
export function planStudioPatternRibbonQuads(
  points: readonly { readonly x: number; readonly y: number }[],
  rawConfig: StudioPatternBrushConfig,
): StudioRibbonQuadSegment[] {
  const config = normalizeStudioPatternBrushConfig(rawConfig);
  if (config.motif === "none" || points.length < 2) return [];
  const stations = buildStations(points);
  const total = stations[stations.length - 1]?.s ?? 0;
  if (total < 1e-3) return [];

  const tileLength = Math.max(4, config.spacingPx);
  const subStep = Math.max(2, Math.min(8, tileLength / 4));
  const steps = Math.max(1, Math.ceil(total / subStep));
  const halfW = config.widthPx * 0.5;
  const quads: StudioRibbonQuadSegment[] = [];

  let prev = interpolateStation(stations, 0);
  for (let i = 1; i <= steps; i += 1) {
    const currS = (total * i) / steps;
    const prevS = (total * (i - 1)) / steps;
    const curr = interpolateStation(stations, currS);
    const tileIndex = Math.floor(prevS / tileLength);
    const tipSlotIndex = resolveStudioPatternTipIndex(
      config.tipCount,
      config.orderMode,
      tileIndex,
      config.seed,
    );
    const uStart = (prevS % tileLength) / tileLength;
    const uEnd = uStart + (currS - prevS) / tileLength;

    quads.push({
      segmentIndex: i - 1,
      tipSlotIndex,
      quadVertices: [
        prev.x + prev.nx * halfW,
        prev.y + prev.ny * halfW,
        curr.x + curr.nx * halfW,
        curr.y + curr.ny * halfW,
        curr.x - curr.nx * halfW,
        curr.y - curr.ny * halfW,
        prev.x - prev.nx * halfW,
        prev.y - prev.ny * halfW,
      ],
      uStart: config.flipHorizontal ? 1 - uStart : uStart,
      uEnd: config.flipHorizontal ? 1 - uEnd : uEnd,
    });
    prev = curr;
  }

  return quads;
}
