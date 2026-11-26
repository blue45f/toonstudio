/**
 * Super-Gap Pillar A 통합 진입점 및 (#3) Vector Gap-Closing & Zero-Token Auto-Flatting.
 * - #1 Wet Paper LBM v2 (`./wet-paper-lbm-v2`)
 * - #2 Variable-Font Curved-Path Triple-Outline MSDF SFX (`./curved-msdf-sfx`)
 * - #3 Vector Gap-Closing & Zero-Token Auto-Flatting (본 모듈)
 * - #4 Personalized Hand-Tremor FFT Kalman / One-Euro Auto-Calibrator (`./tremor-fft-calibrator`)
 */

import type { Point2D } from "./curved-msdf-sfx";
import type { RgbaTuple } from "./wet-paper-lbm-v2";

export {
  createWetPaperLbmState,
  depositWetPigmentBrush,
  generatePaperFiberHeightmap,
  PAPER_PRESET_SPECS,
  stepWetPaperLbmCpu,
  validateWetPaperLbmWgslSource,
  WGSL_WET_PAPER_LBM_V2,
  type PaperFiberField,
  type PaperGrainPreset,
  type PaperPresetSpec,
  type RgbaTuple,
  type WetPaperLbmState,
  type WetPaperStepMetrics,
  type WetPaperStepOptions,
  type WetPigmentDepositInput,
  type WgslValidationReport,
} from "./wet-paper-lbm-v2";

export {
  buildTripleInkOutlines,
  DEFAULT_TRIPLE_OUTLINES,
  evaluateCubicBezierPoint,
  evaluateCubicBezierTangent,
  layoutCurvedVariableSfx,
  type CurvedVariableSfxInput,
  type CurvedVariableSfxLayout,
  type PlacedSfxGlyph,
  type Point2D,
  type SfxAxisEasing,
  type SfxCurveSpec,
  type SfxOutlineLayerDescriptor,
  type SfxOutlineLayerSpec,
  type VariableFontAxisRange,
} from "./curved-msdf-sfx";

export {
  applyCalibratedStrokeFilter,
  calibrateArtistTremorFilter,
  computeStrokeVelocitySpectrumDft,
  OneEuroKalmanStrokeFilter,
  type ArtistTremorCalibrationProfile,
  type CalibratedKalmanParams,
  type CalibratedOneEuroParams,
  type FilteredStrokeSample,
  type RawStrokeSample,
  type SpectrumBin,
  type StrokeSpectrumAnalysis,
} from "./tremor-fft-calibrator";

// ---------------------------------------------------------------------------
// #3. Vector Gap-Closing & Zero-Token Auto-Flatting
// ---------------------------------------------------------------------------

export interface VectorLineStroke {
  readonly id: string;
  readonly points: readonly Point2D[];
  readonly widthPx?: number;
  readonly closed?: boolean;
}

export interface OpenLineEndpoint {
  readonly strokeId: string;
  readonly endKind: "start" | "end";
  readonly point: Point2D;
  /** 선 끝에서 바깥쪽으로 뻗어 나가는 단위 접선 벡터 */
  readonly outwardDir: Point2D;
}

export interface GapBridgeSegment {
  readonly id: string;
  readonly kind: "endpoint-to-endpoint" | "endpoint-to-segment";
  readonly sourceStrokeId: string;
  readonly targetStrokeId: string;
  readonly from: Point2D;
  readonly to: Point2D;
  readonly distancePx: number;
  readonly alignmentScore: number;
}

export interface AutoFlatRegion {
  readonly regionId: number;
  readonly areaPx: number;
  readonly centroid: Point2D;
  readonly bbox: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly isExterior: boolean;
  readonly flatColorRgba: RgbaTuple;
  readonly neighborRegionIds: readonly number[];
}

export interface AutoFlattingInput {
  readonly strokes: readonly VectorLineStroke[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly maxGapPx: number;
  readonly lineRasterWidthPx?: number;
  readonly excludeOuterBackground?: boolean;
  readonly minRegionAreaPx?: number;
  readonly paletteRgba?: readonly RgbaTuple[];
}

export interface AutoFlattingResult {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly openEndpoints: readonly OpenLineEndpoint[];
  readonly bridges: readonly GapBridgeSegment[];
  /** 픽셀별 영역 ID (0 = 선화 경계 또는 외곽 배경, >= 1 = 독립 밑색 영역) */
  readonly labelMap: Int32Array;
  /** 선화 + 브릿지 장벽 마스크 (1 = 장벽, 0 = 채움 가능) */
  readonly barrierMask: Uint8Array;
  readonly regions: readonly AutoFlatRegion[];
  readonly enclosedRegionCount: number;
  readonly enclosedRegionCountBeforeGapClose: number;
  readonly aiTokensUsed: 0;
  readonly elapsedMs: number;
}

const DEFAULT_FLAT_PALETTE_RGBA: readonly RgbaTuple[] = [
  [0.95, 0.78, 0.72, 1],
  [0.72, 0.86, 0.96, 1],
  [0.96, 0.91, 0.68, 1],
  [0.76, 0.92, 0.78, 1],
  [0.86, 0.77, 0.95, 1],
  [0.96, 0.81, 0.58, 1],
  [0.68, 0.9, 0.88, 1],
  [0.94, 0.74, 0.84, 1],
];

function unitVec2(dx: number, dy: number): Point2D {
  const len = Math.hypot(dx, dy);
  if (len <= 1e-8) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/**
 * 닫히지 않은 선화 스트로크에서 열린 시작·끝점과 외향 접선 벡터를 추출한다.
 */
export function detectOpenLineEndpoints(
  strokes: readonly VectorLineStroke[],
  closedEpsilonPx: number = 0.75,
): OpenLineEndpoint[] {
  const endpoints: OpenLineEndpoint[] = [];
  for (let i = 0; i < strokes.length; i += 1) {
    const stroke = strokes[i];
    if (stroke.closed || stroke.points.length < 2) continue;
    const pts = stroke.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) <= closedEpsilonPx && pts.length >= 3) {
      continue;
    }
    const startDir = unitVec2(first.x - pts[1].x, first.y - pts[1].y);
    const endDir = unitVec2(
      last.x - pts[pts.length - 2].x,
      last.y - pts[pts.length - 2].y,
    );
    endpoints.push({
      strokeId: stroke.id,
      endKind: "start",
      point: first,
      outwardDir: startDir,
    });
    endpoints.push({
      strokeId: stroke.id,
      endKind: "end",
      point: last,
      outwardDir: endDir,
    });
  }
  return endpoints;
}

function projectPointToSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D,
): { closest: Point2D; distPx: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-8) {
    return { closest: a, distPx: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  }
  const rawT = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  const t = rawT < 0 ? 0 : rawT > 1 ? 1 : rawT;
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return {
    closest: { x: cx, y: cy },
    distPx: Math.hypot(p.x - cx, p.y - cy),
    t,
  };
}

/**
 * 열린 끝점들을 `maxGapPx` 이내에서 끝점↔끝점 우선, 이어서 끝점↔세그먼트(T-접합) 순으로
 * 탐욕적 최단 거리 매칭해 틈새 브릿지 세그먼트를 생성한다.
 */
export function bridgeLineArtGaps(
  strokes: readonly VectorLineStroke[],
  endpoints: readonly OpenLineEndpoint[],
  maxGapPx: number,
): GapBridgeSegment[] {
  const safeMax = Math.max(0, maxGapPx);
  if (safeMax <= 0 || endpoints.length === 0) return [];

  interface PairCandidate {
    readonly idxA: number;
    readonly idxB: number;
    readonly distPx: number;
    readonly alignment: number;
    readonly cost: number;
  }

  const pairCandidates: PairCandidate[] = [];
  for (let i = 0; i < endpoints.length; i += 1) {
    const a = endpoints[i];
    for (let j = i + 1; j < endpoints.length; j += 1) {
      const b = endpoints[j];
      const dx = b.point.x - a.point.x;
      const dy = b.point.y - a.point.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 1e-4 || dist > safeMax) continue;

      const dirAB = { x: dx / dist, y: dy / dist };
      const cosA = a.outwardDir.x * dirAB.x + a.outwardDir.y * dirAB.y;
      const cosB = b.outwardDir.x * -dirAB.x + b.outwardDir.y * -dirAB.y;
      const alignment = 0.5 * (cosA + cosB);
      // 방향 정합성이 높을수록(서로 마주볼수록) 비용을 낮춘다.
      const cost = dist * (1.25 - 0.25 * alignment);
      pairCandidates.push({ idxA: i, idxB: j, distPx: dist, alignment, cost });
    }
  }

  pairCandidates.sort((u, v) => u.cost - v.cost);
  const used = new Uint8Array(endpoints.length);
  const bridges: GapBridgeSegment[] = [];

  for (let k = 0; k < pairCandidates.length; k += 1) {
    const cand = pairCandidates[k];
    if (used[cand.idxA] || used[cand.idxB]) continue;
    used[cand.idxA] = 1;
    used[cand.idxB] = 1;
    const epA = endpoints[cand.idxA];
    const epB = endpoints[cand.idxB];
    bridges.push({
      id: `bridge-ep-${bridges.length + 1}`,
      kind: "endpoint-to-endpoint",
      sourceStrokeId: epA.strokeId,
      targetStrokeId: epB.strokeId,
      from: epA.point,
      to: epB.point,
      distancePx: cand.distPx,
      alignmentScore: cand.alignment,
    });
  }

  // 남은 미연결 끝점은 다른 스트로크 세그먼트(T-접합)에 투영 폐합한다.
  for (let i = 0; i < endpoints.length; i += 1) {
    if (used[i]) continue;
    const ep = endpoints[i];
    let bestDist = safeMax;
    let bestPoint: Point2D | null = null;
    let bestStrokeId = "";
    let bestAlign = 0;

    for (let s = 0; s < strokes.length; s += 1) {
      const stroke = strokes[s];
      if (stroke.id === ep.strokeId || stroke.points.length < 2) continue;
      for (let p = 0; p < stroke.points.length - 1; p += 1) {
        const proj = projectPointToSegment(ep.point, stroke.points[p], stroke.points[p + 1]);
        if (proj.distPx > 1e-4 && proj.distPx <= bestDist) {
          const dir = unitVec2(proj.closest.x - ep.point.x, proj.closest.y - ep.point.y);
          const align = ep.outwardDir.x * dir.x + ep.outwardDir.y * dir.y;
          if (align >= -0.35) {
            bestDist = proj.distPx;
            bestPoint = proj.closest;
            bestStrokeId = stroke.id;
            bestAlign = align;
          }
        }
      }
    }

    if (bestPoint !== null) {
      used[i] = 1;
      bridges.push({
        id: `bridge-tj-${bridges.length + 1}`,
        kind: "endpoint-to-segment",
        sourceStrokeId: ep.strokeId,
        targetStrokeId: bestStrokeId,
        from: ep.point,
        to: bestPoint,
        distancePx: bestDist,
        alignmentScore: bestAlign,
      });
    }
  }

  return bridges;
}

function rasterizeSegmentBarrier(
  mask: Uint8Array,
  width: number,
  height: number,
  a: Point2D,
  b: Point2D,
  radiusPx: number,
): void {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist * 2));
  const rad = Math.max(0.5, radiusPx);
  const radInt = Math.ceil(rad);
  const radSq = rad * rad;

  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    const ix = Math.round(cx);
    const iy = Math.round(cy);

    for (let dy = -radInt; dy <= radInt; dy += 1) {
      const py = iy + dy;
      if (py < 0 || py >= height) continue;
      for (let dx = -radInt; dx <= radInt; dx += 1) {
        const px = ix + dx;
        if (px < 0 || px >= width) continue;
        if (dx * dx + dy * dy <= radSq + 0.25) {
          mask[py * width + px] = 1;
        }
      }
    }
  }
}

interface ConnectedComponentSummary {
  readonly labelMap: Int32Array;
  readonly regions: AutoFlatRegion[];
  readonly enclosedCount: number;
}

function labelClosedRegions(
  barrierMask: Uint8Array,
  width: number,
  height: number,
  excludeOuterBackground: boolean,
  minRegionAreaPx: number,
  palette: readonly RgbaTuple[],
): ConnectedComponentSummary {
  const total = width * height;
  const rawLabels = new Int32Array(total);
  const queue = new Int32Array(total);

  interface RawRegionStat {
    readonly rawId: number;
    area: number;
    sumX: number;
    sumY: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    touchesBorder: boolean;
  }

  const rawStats: RawRegionStat[] = [];
  let nextRawId = 1;

  for (let start = 0; start < total; start += 1) {
    if (barrierMask[start] !== 0 || rawLabels[start] !== 0) continue;
    const rawId = nextRawId;
    nextRawId += 1;

    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    rawLabels[start] = rawId;

    const stat: RawRegionStat = {
      rawId,
      area: 0,
      sumX: 0,
      sumY: 0,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      touchesBorder: false,
    };

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = (idx - x) / width;

      stat.area += 1;
      stat.sumX += x;
      stat.sumY += y;
      if (x < stat.minX) stat.minX = x;
      if (x > stat.maxX) stat.maxX = x;
      if (y < stat.minY) stat.minY = y;
      if (y > stat.maxY) stat.maxY = y;
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        stat.touchesBorder = true;
      }

      if (x > 0) {
        const left = idx - 1;
        if (barrierMask[left] === 0 && rawLabels[left] === 0) {
          rawLabels[left] = rawId;
          queue[tail] = left;
          tail += 1;
        }
      }
      if (x < width - 1) {
        const right = idx + 1;
        if (barrierMask[right] === 0 && rawLabels[right] === 0) {
          rawLabels[right] = rawId;
          queue[tail] = right;
          tail += 1;
        }
      }
      if (y > 0) {
        const up = idx - width;
        if (barrierMask[up] === 0 && rawLabels[up] === 0) {
          rawLabels[up] = rawId;
          queue[tail] = up;
          tail += 1;
        }
      }
      if (y < height - 1) {
        const down = idx + width;
        if (barrierMask[down] === 0 && rawLabels[down] === 0) {
          rawLabels[down] = rawId;
          queue[tail] = down;
          tail += 1;
        }
      }
    }
    rawStats.push(stat);
  }

  // 유효 영역 재번호화 (외곽 배경 제외 옵션 반영)
  const remap = new Int32Array(nextRawId);
  const keptRaw: RawRegionStat[] = [];
  for (let i = 0; i < rawStats.length; i += 1) {
    const st = rawStats[i];
    if (st.area < minRegionAreaPx) continue;
    if (excludeOuterBackground && st.touchesBorder) continue;
    const finalId = keptRaw.length + 1;
    remap[st.rawId] = finalId;
    keptRaw.push(st);
  }

  const labelMap = new Int32Array(total);
  for (let i = 0; i < total; i += 1) {
    const rawId = rawLabels[i];
    if (rawId > 0) {
      labelMap[i] = remap[rawId];
    }
  }

  // 장벽 픽셀 너머 3px 반경 스캔으로 인접 영역 그래프 구성 (인접 색 분리)
  const neighborSets: Set<number>[] = keptRaw.map(() => new Set<number>());
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (barrierMask[y * width + x] === 0) continue;
      const nearby = new Set<number>();
      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const lbl = labelMap[ny * width + nx];
          if (lbl > 0) nearby.add(lbl);
        }
      }
      if (nearby.size >= 2) {
        const list = Array.from(nearby);
        for (let a = 0; a < list.length; a += 1) {
          for (let b = a + 1; b < list.length; b += 1) {
            neighborSets[list[a] - 1].add(list[b]);
            neighborSets[list[b] - 1].add(list[a]);
          }
        }
      }
    }
  }

  const assignedColorIdx = new Int32Array(keptRaw.length).fill(-1);
  const regions: AutoFlatRegion[] = [];
  for (let i = 0; i < keptRaw.length; i += 1) {
    const st = keptRaw[i];
    const neighbors = Array.from(neighborSets[i]).sort((a, b) => a - b);
    const usedColors = new Set<number>();
    for (let n = 0; n < neighbors.length; n += 1) {
      const cIdx = assignedColorIdx[neighbors[n] - 1];
      if (cIdx >= 0) usedColors.add(cIdx);
    }
    let chosenColor = i % palette.length;
    for (let c = 0; c < palette.length; c += 1) {
      if (!usedColors.has(c)) {
        chosenColor = c;
        break;
      }
    }
    assignedColorIdx[i] = chosenColor;
    regions.push({
      regionId: i + 1,
      areaPx: st.area,
      centroid: {
        x: st.sumX / st.area,
        y: st.sumY / st.area,
      },
      bbox: {
        minX: st.minX,
        minY: st.minY,
        maxX: st.maxX,
        maxY: st.maxY,
      },
      isExterior: st.touchesBorder,
      flatColorRgba: palette[chosenColor],
      neighborRegionIds: neighbors,
    });
  }

  return {
    labelMap,
    regions,
    enclosedCount: regions.filter((r) => !r.isExterior).length,
  };
}

/**
 * 선화 틈새 자동 폐합 + 무토큰(0 AI tokens) 폐영역 자동 밑색 ID 분할.
 */
export function closeLineArtGapsAndAutoFlat(input: AutoFlattingInput): AutoFlattingResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const width = Math.max(4, Math.floor(input.canvasWidth));
  const height = Math.max(4, Math.floor(input.canvasHeight));
  const excludeOuter = input.excludeOuterBackground ?? true;
  const minArea = Math.max(1, input.minRegionAreaPx ?? 4);
  const defaultLineRadius = Math.max(0.75, (input.lineRasterWidthPx ?? 2) * 0.5);
  const palette =
    input.paletteRgba && input.paletteRgba.length > 0
      ? input.paletteRgba
      : DEFAULT_FLAT_PALETTE_RGBA;

  const openEndpoints = detectOpenLineEndpoints(input.strokes);
  const bridges = bridgeLineArtGaps(input.strokes, openEndpoints, input.maxGapPx);

  // 1) 브릿지 미적용 상태 기준 폐영역 수 계측 (폐합 전/후 비교 근거)
  const rawBarrier = new Uint8Array(width * height);
  for (let s = 0; s < input.strokes.length; s += 1) {
    const stroke = input.strokes[s];
    const radius = Math.max(0.75, (stroke.widthPx ?? defaultLineRadius * 2) * 0.5);
    const pts = stroke.points;
    for (let p = 0; p < pts.length - 1; p += 1) {
      rasterizeSegmentBarrier(rawBarrier, width, height, pts[p], pts[p + 1], radius);
    }
    if (stroke.closed && pts.length >= 3) {
      rasterizeSegmentBarrier(rawBarrier, width, height, pts[pts.length - 1], pts[0], radius);
    }
  }
  const beforeSummary = labelClosedRegions(
    rawBarrier,
    width,
    height,
    excludeOuter,
    minArea,
    palette,
  );

  // 2) 브릿지 세그먼트 장벽 추가 후 최종 밑색 영역 분할
  const barrierMask = new Uint8Array(rawBarrier);
  for (let b = 0; b < bridges.length; b += 1) {
    rasterizeSegmentBarrier(
      barrierMask,
      width,
      height,
      bridges[b].from,
      bridges[b].to,
      defaultLineRadius,
    );
  }
  const afterSummary = labelClosedRegions(
    barrierMask,
    width,
    height,
    excludeOuter,
    minArea,
    palette,
  );

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    canvasWidth: width,
    canvasHeight: height,
    openEndpoints,
    bridges,
    labelMap: afterSummary.labelMap,
    barrierMask,
    regions: afterSummary.regions,
    enclosedRegionCount: afterSummary.enclosedCount,
    enclosedRegionCountBeforeGapClose: beforeSummary.enclosedCount,
    aiTokensUsed: 0,
    elapsedMs: Math.max(0, t1 - t0),
  };
}
