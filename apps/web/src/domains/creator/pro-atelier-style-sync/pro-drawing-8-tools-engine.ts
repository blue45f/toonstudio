/**
 * 전문가 드로잉 핵심 8대 엔진 통합 진입점 (100% 무과금 · 결정론적 클라이언트 연산).
 *
 * 1. 참조 레이어 채우기 & 선 안쪽 1~3px 자동 확장 (`fillFromReferenceLayerWithExpand`)
 * 2. 벡터 선 굵기 사후 부분 보정 브러시 (`sculptVectorStrokeWidth`)
 * 3~8. 색상/명도 모듈(`pro-drawing-8-tools-color.ts`) 및 변형/분할/공유코드/특수자 모듈(`pro-drawing-8-tools-layout.ts`) 재노출.
 */

import {
  clampNumber,
  roundToDigits,
  type Point2D,
} from "./pro-drawing-8-tools-color";

export {
  computeValueFlipSubView,
  formatOklchCss,
  mixPigmentsAndAdjustTone,
  oklchToOklab,
  type OklabColor,
  type OklchColor,
  type PigmentMixToneInput,
  type PigmentMixToneResult,
  type Point2D,
  type RectBounds,
  type RgbColor,
  type ValueFlipSubViewInput,
  type ValueFlipSubViewResult,
} from "./pro-drawing-8-tools-color";

export {
  decodeTeamBrushShareCode,
  encodeTeamBrushShareCode,
  evaluatePuppetAndMeshWarp,
  sliceFrameAndTrackSpeechTail,
  snapPointToSpecialtyRuler,
  type DualTipBlendMode,
  type DualTipShape,
  type FrameSliceAndSpeechTailInput,
  type FrameSliceAndSpeechTailResult,
  type PaperGrainPattern,
  type PuppetMeshWarpInput,
  type PuppetMeshWarpResult,
  type PuppetPin,
  type SlicedFramePolygon,
  type SpecialtyRulerMode,
  type SpecialtyRulerSnapInput,
  type SpecialtyRulerSnapResult,
  type SpeechBubbleGeometry,
  type SpeechTailGeometry,
  type TeamBrushDecodeErrorCode,
  type TeamBrushDecodeResult,
  type TeamBrushSharePreset,
} from "./pro-drawing-8-tools-layout";

export type ProDrawingToolId =
  | "reference-fill"
  | "vector-width"
  | "pigment-mix"
  | "puppet-mesh"
  | "value-flip"
  | "frame-slice-tail"
  | "brush-share-code"
  | "specialty-ruler";

export interface ProDrawingToolMeta {
  readonly id: ProDrawingToolId;
  readonly index: number;
  readonly titleKo: string;
  readonly summaryKo: string;
  readonly badgeKo: string;
}

export const PRO_DRAWING_8_TOOLS_META: readonly ProDrawingToolMeta[] = [
  {
    id: "reference-fill",
    index: 1,
    titleKo: "참조 레이어 채우기",
    summaryKo: "선화 경계는 넘지 않고 안쪽으로 1~3px 확장해 흰 틈을 없앱니다.",
    badgeKo: "흰 틈 0px",
  },
  {
    id: "vector-width",
    index: 2,
    titleKo: "벡터 선폭 사후 보정",
    summaryKo: "그린 뒤에도 구간별 선폭 가감과 Ramer-Douglas-Peucker 단순화를 적용합니다.",
    badgeKo: "가우시안 · RDP",
  },
  {
    id: "pigment-mix",
    index: 3,
    titleKo: "물감 혼색 · 색온도",
    summaryKo: "Kubelka-Munk 감산 혼색으로 노랑+파랑을 자연 녹색으로 섞고 온도를 다듬습니다.",
    badgeKo: "KM · OKLab",
  },
  {
    id: "puppet-mesh",
    index: 4,
    titleKo: "핀 퍼펫 · 4×4 메쉬",
    summaryKo: "제어 핀 역거리 가중 변위와 4×4 바이큐빅 메쉬로 포즈와 원근을 자유롭게 고칩니다.",
    badgeKo: "IDW · 4×4 FFD",
  },
  {
    id: "value-flip",
    index: 5,
    titleKo: "명도 · 좌우반전 서브뷰",
    summaryKo: "Rec.709 흑백 휘도 분포와 좌우 반전 매트릭스로 명암과 균형을 즉시 점검합니다.",
    badgeKo: "Rec.709",
  },
  {
    id: "frame-slice-tail",
    index: 6,
    titleKo: "1획 컷 분할 · 꼬리 추적",
    summaryKo: "직선 칼선 한 획으로 컷을 여백 포함 2분할하고 말풍선 꼬리가 화자 입을 자동 추적합니다.",
    badgeKo: "여백 분할",
  },
  {
    id: "brush-share-code",
    index: 7,
    titleKo: "팀 브러시 공유 코드",
    summaryKo: "필압 커브·종이 요철·듀얼 팁 설정을 URL-safe 코드 한 줄로 무손실 공유합니다.",
    badgeKo: "무손실 직렬화",
  },
  {
    id: "specialty-ruler",
    index: 8,
    titleKo: "특수 자 스냅",
    summaryKo: "등각 30°, 360° 등장방형 파노라마, 픽셀 격자에 좌표를 오차 없이 스냅합니다.",
    badgeKo: "30° · 360° · PX",
  },
] as const;

// ============================================================================
// 1. 참조 레이어 채우기 & 선 안쪽 1~3px 자동 확장
// ============================================================================

export interface ReferenceLayerFillInput {
  readonly width: number;
  readonly height: number;
  readonly referenceAlpha: ReadonlyArray<number> | Uint8Array;
  readonly seed: Point2D;
  readonly expandPx: number;
  readonly lineThreshold?: number;
  readonly edgeThreshold?: number;
}

export interface ReferenceLayerFillResult {
  readonly width: number;
  readonly height: number;
  readonly expandPx: number;
  readonly filledMask: Uint8Array;
  readonly baseFilledPixels: number;
  readonly expandedPixels: number;
  readonly totalFilledPixels: number;
  readonly initialGapPixels: number;
  readonly remainingGapPixels: number;
  readonly leakedOutsidePixels: number;
  readonly boundarySafe: boolean;
}

const CARDINAL_OFFSETS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function fillFromReferenceLayerWithExpand(
  input: ReferenceLayerFillInput,
): ReferenceLayerFillResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const total = width * height;
  const expandPx = Math.round(clampNumber(input.expandPx, 1, 3));
  const lineThreshold = clampNumber(input.lineThreshold ?? 128, 16, 255);
  const edgeThreshold = clampNumber(input.edgeThreshold ?? 16, 1, lineThreshold);

  const filledMask = new Uint8Array(total);
  const baseMask = new Uint8Array(total);
  const sx = Math.floor(input.seed.x);
  const sy = Math.floor(input.seed.y);
  const alphaAt = (idx: number): number => clampNumber(input.referenceAlpha[idx] ?? 0, 0, 255);

  if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
    return {
      width,
      height,
      expandPx,
      filledMask,
      baseFilledPixels: 0,
      expandedPixels: 0,
      totalFilledPixels: 0,
      initialGapPixels: 0,
      remainingGapPixels: 0,
      leakedOutsidePixels: 0,
      boundarySafe: true,
    };
  }

  const seedIdx = sy * width + sx;
  if (alphaAt(seedIdx) >= edgeThreshold) {
    return {
      width,
      height,
      expandPx,
      filledMask,
      baseFilledPixels: 0,
      expandedPixels: 0,
      totalFilledPixels: 0,
      initialGapPixels: 0,
      remainingGapPixels: 0,
      leakedOutsidePixels: 0,
      boundarySafe: true,
    };
  }

  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  baseMask[seedIdx] = 1;
  filledMask[seedIdx] = 1;
  queue[tail++] = seedIdx;
  let baseFilledPixels = 1;

  while (head < tail) {
    const idx = queue[head++];
    const cx = idx % width;
    const cy = (idx - cx) / width;
    for (const [dx, dy] of CARDINAL_OFFSETS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (baseMask[nIdx] === 1) continue;
      if (alphaAt(nIdx) < edgeThreshold) {
        baseMask[nIdx] = 1;
        filledMask[nIdx] = 1;
        queue[tail++] = nIdx;
        baseFilledPixels += 1;
      }
    }
  }

  const interiorFringeMask = new Uint8Array(total);
  let initialGapPixels = 0;
  let frontier: number[] = [];

  for (let i = 0; i < total; i += 1) {
    if (baseMask[i] !== 1) continue;
    const cx = i % width;
    const cy = (i - cx) / width;
    for (const [dx, dy] of CARDINAL_OFFSETS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      const a = alphaAt(nIdx);
      if (a >= edgeThreshold && a < lineThreshold && interiorFringeMask[nIdx] === 0) {
        interiorFringeMask[nIdx] = 1;
        initialGapPixels += 1;
      }
      if (a >= edgeThreshold && baseMask[nIdx] === 0) {
        frontier.push(i);
        break;
      }
    }
  }

  let expandedPixels = 0;
  for (let step = 0; step < expandPx && frontier.length > 0; step += 1) {
    const nextFrontier: number[] = [];
    for (const idx of frontier) {
      const srcIsOpaqueLine = alphaAt(idx) >= lineThreshold;
      const cx = idx % width;
      const cy = (idx - cx) / width;
      for (const [dx, dy] of CARDINAL_OFFSETS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (filledMask[nIdx] === 1) continue;
        const dstAlpha = alphaAt(nIdx);
        if (dstAlpha < edgeThreshold) continue;
        if (srcIsOpaqueLine && dstAlpha < lineThreshold) continue;
        filledMask[nIdx] = 1;
        expandedPixels += 1;
        nextFrontier.push(nIdx);
      }
    }
    frontier = nextFrontier;
  }

  let remainingGapPixels = 0;
  let leakedOutsidePixels = 0;
  for (let i = 0; i < total; i += 1) {
    if (interiorFringeMask[i] === 1 && filledMask[i] === 0) remainingGapPixels += 1;
    if (filledMask[i] === 1 && baseMask[i] === 0 && alphaAt(i) < edgeThreshold) {
      leakedOutsidePixels += 1;
    }
  }

  return {
    width,
    height,
    expandPx,
    filledMask,
    baseFilledPixels,
    expandedPixels,
    totalFilledPixels: baseFilledPixels + expandedPixels,
    initialGapPixels,
    remainingGapPixels,
    leakedOutsidePixels,
    boundarySafe: leakedOutsidePixels === 0,
  };
}

// ============================================================================
// 2. 벡터 선 굵기 사후 부분 보정 브러시 (thicken / thin / simplify)
// ============================================================================

export interface VectorStrokePoint extends Point2D {
  readonly width: number;
}

export type VectorStrokeSculptMode = "thicken" | "thin" | "simplify";

export interface VectorStrokeSculptInput {
  readonly points: ReadonlyArray<VectorStrokePoint>;
  readonly mode: VectorStrokeSculptMode;
  readonly brushCenter: Point2D;
  readonly brushRadius: number;
  readonly strength: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
}

export interface VectorStrokeSculptResult {
  readonly mode: VectorStrokeSculptMode;
  readonly points: readonly VectorStrokePoint[];
  readonly inputPointCount: number;
  readonly outputPointCount: number;
  readonly removedPointCount: number;
  readonly affectedPointCount: number;
  readonly averageWidthBefore: number;
  readonly averageWidthAfter: number;
  readonly maxDeviationPx: number;
}

function perpendicularDistance(point: Point2D, segStart: Point2D, segEnd: Point2D): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return Math.hypot(point.x - segStart.x, point.y - segStart.y);
  const t = clampNumber(((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq, 0, 1);
  return Math.hypot(point.x - (segStart.x + t * dx), point.y - (segStart.y + t * dy));
}

function rdpIndices(
  points: ReadonlyArray<VectorStrokePoint>,
  startIdx: number,
  endIdx: number,
  epsilon: number,
): number[] {
  if (endIdx - startIdx <= 1) return [startIdx, endIdx];
  let maxDist = -1;
  let splitIdx = startIdx;
  const a = points[startIdx];
  const b = points[endIdx];
  for (let i = startIdx + 1; i < endIdx; i += 1) {
    const d = perpendicularDistance(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpIndices(points, startIdx, splitIdx, epsilon);
    const right = rdpIndices(points, splitIdx, endIdx, epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [startIdx, endIdx];
}

function averageWidth(points: ReadonlyArray<VectorStrokePoint>): number {
  if (points.length === 0) return 0;
  let sum = 0;
  for (const p of points) sum += p.width;
  return roundToDigits(sum / points.length, 4);
}

export function sculptVectorStrokeWidth(
  input: VectorStrokeSculptInput,
): VectorStrokeSculptResult {
  const minWidth = Math.max(0.25, input.minWidth ?? 0.5);
  const maxWidth = Math.max(minWidth, input.maxWidth ?? 64);
  const radius = Math.max(1, input.brushRadius);
  const strength = Math.abs(input.strength);
  const avgBefore = averageWidth(input.points);

  if (input.points.length === 0) {
    return {
      mode: input.mode,
      points: [],
      inputPointCount: 0,
      outputPointCount: 0,
      removedPointCount: 0,
      affectedPointCount: 0,
      averageWidthBefore: 0,
      averageWidthAfter: 0,
      maxDeviationPx: 0,
    };
  }

  if (input.mode === "simplify") {
    const epsilon = Math.max(0.1, strength);
    const keep = new Uint8Array(input.points.length);
    keep[0] = 1;
    keep[input.points.length - 1] = 1;
    const inside = input.points.map(
      (p) => Math.hypot(p.x - input.brushCenter.x, p.y - input.brushCenter.y) <= radius,
    );

    let i = 0;
    while (i < input.points.length) {
      if (!inside[i]) {
        keep[i] = 1;
        i += 1;
        continue;
      }
      const runStart = Math.max(0, i - 1);
      while (i < input.points.length && inside[i]) i += 1;
      const runEnd = Math.min(input.points.length - 1, i);
      for (const idx of rdpIndices(input.points, runStart, runEnd, epsilon)) keep[idx] = 1;
    }

    const simplified: VectorStrokePoint[] = [];
    const keptIndices: number[] = [];
    for (let idx = 0; idx < input.points.length; idx += 1) {
      if (keep[idx] === 1) {
        simplified.push({ ...input.points[idx] });
        keptIndices.push(idx);
      }
    }

    let maxDeviationPx = 0;
    for (let seg = 0; seg < keptIndices.length - 1; seg += 1) {
      const s = keptIndices[seg];
      const e = keptIndices[seg + 1];
      for (let k = s + 1; k < e; k += 1) {
        const d = perpendicularDistance(input.points[k], input.points[s], input.points[e]);
        if (d > maxDeviationPx) maxDeviationPx = d;
      }
    }

    return {
      mode: "simplify",
      points: simplified,
      inputPointCount: input.points.length,
      outputPointCount: simplified.length,
      removedPointCount: input.points.length - simplified.length,
      affectedPointCount: inside.filter(Boolean).length,
      averageWidthBefore: avgBefore,
      averageWidthAfter: averageWidth(simplified),
      maxDeviationPx: roundToDigits(maxDeviationPx, 4),
    };
  }

  const sign = input.mode === "thicken" ? 1 : -1;
  const expNeg3 = Math.exp(-3);
  const normDenom = 1 - expNeg3;
  let affectedPointCount = 0;

  const sculpted = input.points.map((point) => {
    const dist = Math.hypot(point.x - input.brushCenter.x, point.y - input.brushCenter.y);
    if (dist >= radius) return { ...point };
    const u = dist / radius;
    const falloff = (Math.exp(-3 * u * u) - expNeg3) / normDenom;
    if (falloff > 1e-4) affectedPointCount += 1;
    return {
      x: point.x,
      y: point.y,
      width: roundToDigits(clampNumber(point.width + sign * strength * falloff, minWidth, maxWidth), 3),
    };
  });

  return {
    mode: input.mode,
    points: sculpted,
    inputPointCount: input.points.length,
    outputPointCount: sculpted.length,
    removedPointCount: 0,
    affectedPointCount,
    averageWidthBefore: avgBefore,
    averageWidthAfter: averageWidth(sculpted),
    maxDeviationPx: 0,
  };
}
