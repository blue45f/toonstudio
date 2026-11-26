/**
 * 반간선 평면 분할(DCEL) 빈틈 제로 채색 커널 + 라플라스 확산 곡선(Laplacian Diffusion Curves)
 * 무한 해상도 음영 솔버 통합 모듈.
 *
 * - DCEL 반간선 평면 분할 커널은 `./planar-dcel-arrangement`에서 제공하며 이 모듈을 통해 함께 노출한다.
 * - 좌·우 경계 색상(c_L, c_R)을 지닌 매개변수 3차 베지어·폴리라인 곡선에 대해 임의 배율(1×, 2×, 4×, 8×)에서
 *   다중격자 가속 장벽 인식 이산 조화 방정식(∇²u = 0)을 직접 풀어 밴딩·픽셀화 없는 연속 음영을 생성한다.
 */

import {
  projectPointToSegment2D,
  type Point2D,
  type RgbaColor,
} from "./planar-dcel-arrangement";

export {
  assignPlanarFaceColor,
  buildPlanarArrangement,
  computeSignedShoelaceArea,
  isPointInBoundedFace,
  isPointInRingHalfOpen,
  projectPointToSegment2D,
  rasterizePlanarArrangement,
  type BuildPlanarArrangementOptions,
  type PlanarArrangement,
  type PlanarBoundedFace,
  type PlanarHalfEdge,
  type PlanarOuterCycle,
  type PlanarRasterizeOptions,
  type PlanarRasterizeReport,
  type PlanarStrokeInput,
  type PlanarVertex,
  type Point2D,
  type RgbaColor,
} from "./planar-dcel-arrangement";

export type DiffusionSegmentGeometry =
  | { readonly kind: "line"; readonly p0: Point2D; readonly p1: Point2D }
  | {
      readonly kind: "cubic";
      readonly p0: Point2D;
      readonly p1: Point2D;
      readonly p2: Point2D;
      readonly p3: Point2D;
    };

export interface DiffusionColorStop {
  readonly t: number;
  readonly colorRgba: RgbaColor;
}

export interface DiffusionCurveSpec {
  readonly curveId: string;
  readonly segments: readonly DiffusionSegmentGeometry[];
  readonly leftColors: readonly DiffusionColorStop[];
  readonly rightColors: readonly DiffusionColorStop[];
}

export interface DiffusionSolveOptions {
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly viewportScale?: number;
  readonly iterationsPerLevel?: number;
  readonly sorOmega?: number;
  readonly multigridMinSize?: number;
  readonly dither?: boolean;
}

export interface DiffusionSolveResult {
  readonly width: number;
  readonly height: number;
  readonly viewportScale: number;
  readonly floatRgba: Float32Array;
  readonly rgba8: Uint8Array;
  readonly constrainedCellCount: number;
  readonly meanHarmonicResidual: number;
  readonly maxHarmonicResidual: number;
  readonly maxInteriorStepDelta8: number;
  readonly elapsedMs: number;
}

interface SampledDiffusionEdge {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly t0: number;
  readonly t1: number;
  readonly curveIndex: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clampByte(value: number): number {
  const rounded = Math.round(value);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function evaluateCubicBezier2D(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number,
): Point2D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

function sampleColorStopsNormalized(
  stops: readonly DiffusionColorStop[],
  t: number,
  out4: Float32Array,
): void {
  if (stops.length === 0) {
    out4.set([0, 0, 0, 1]);
    return;
  }
  const tc = clamp(t, 0, 1);
  if (stops.length === 1 || tc <= stops[0]!.t) {
    const c = stops[0]!.colorRgba;
    out4.set([c.r / 255, c.g / 255, c.b / 255, c.a / 255]);
    return;
  }
  const last = stops[stops.length - 1]!;
  if (tc >= last.t) {
    const c = last.colorRgba;
    out4.set([c.r / 255, c.g / 255, c.b / 255, c.a / 255]);
    return;
  }
  for (let i = 0; i + 1 < stops.length; i += 1) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (tc >= a.t && tc <= b.t) {
      const alpha = (tc - a.t) / Math.max(1e-6, b.t - a.t);
      const inv = 1 - alpha;
      out4.set([
        (a.colorRgba.r * inv + b.colorRgba.r * alpha) / 255,
        (a.colorRgba.g * inv + b.colorRgba.g * alpha) / 255,
        (a.colorRgba.b * inv + b.colorRgba.b * alpha) / 255,
        (a.colorRgba.a * inv + b.colorRgba.a * alpha) / 255,
      ]);
      return;
    }
  }
}

function sampleScaledDiffusionCurves(
  curves: readonly DiffusionCurveSpec[],
  scaleX: number,
  scaleY: number,
): SampledDiffusionEdge[] {
  const edges: SampledDiffusionEdge[] = [];
  for (let cIdx = 0; cIdx < curves.length; cIdx += 1) {
    const polyPoints: Point2D[] = [];
    const segs = curves[cIdx]!.segments;
    for (let sIdx = 0; sIdx < segs.length; sIdx += 1) {
      const seg = segs[sIdx]!;
      if (seg.kind === "line") {
        const ax = seg.p0.x * scaleX;
        const ay = seg.p0.y * scaleY;
        const bx = seg.p1.x * scaleX;
        const by = seg.p1.y * scaleY;
        const steps = Math.max(1, Math.ceil(dist2(ax, ay, bx, by) / 0.45));
        for (let k = sIdx === 0 ? 0 : 1; k <= steps; k += 1) {
          const u = k / steps;
          polyPoints.push({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u });
        }
      } else {
        const p0 = { x: seg.p0.x * scaleX, y: seg.p0.y * scaleY };
        const p1 = { x: seg.p1.x * scaleX, y: seg.p1.y * scaleY };
        const p2 = { x: seg.p2.x * scaleX, y: seg.p2.y * scaleY };
        const p3 = { x: seg.p3.x * scaleX, y: seg.p3.y * scaleY };
        const chord =
          dist2(p0.x, p0.y, p1.x, p1.y) +
          dist2(p1.x, p1.y, p2.x, p2.y) +
          dist2(p2.x, p2.y, p3.x, p3.y);
        const steps = Math.max(4, Math.ceil(chord / 0.4));
        for (let k = sIdx === 0 ? 0 : 1; k <= steps; k += 1) {
          polyPoints.push(evaluateCubicBezier2D(p0, p1, p2, p3, k / steps));
        }
      }
    }
    if (polyPoints.length < 2) continue;
    const cumLengths = new Float64Array(polyPoints.length);
    let totalLen = 0;
    for (let i = 1; i < polyPoints.length; i += 1) {
      totalLen += dist2(
        polyPoints[i]!.x,
        polyPoints[i]!.y,
        polyPoints[i - 1]!.x,
        polyPoints[i - 1]!.y,
      );
      cumLengths[i] = totalLen;
    }
    const safeTotal = Math.max(1e-6, totalLen);
    for (let i = 0; i + 1 < polyPoints.length; i += 1) {
      const a = polyPoints[i]!;
      const b = polyPoints[i + 1]!;
      if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 > 1e-10) {
        edges.push({
          ax: a.x,
          ay: a.y,
          bx: b.x,
          by: b.y,
          t0: cumLengths[i]! / safeTotal,
          t1: cumLengths[i + 1]! / safeTotal,
          curveIndex: cIdx,
        });
      }
    }
  }
  return edges;
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const det = rx * sy - ry * sx;
  if (Math.abs(det) <= 1e-9) return false;
  const qpx = cx - ax;
  const qpy = cy - ay;
  const t = (qpx * sy - qpy * sx) / det;
  const u = (qpx * ry - qpy * rx) / det;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function accumulateValidNeighbors(
  field: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  idx: number,
  barrierRight: Uint8Array,
  barrierDown: Uint8Array,
  outSum4: Float32Array,
): number {
  outSum4[0] = 0;
  outSum4[1] = 0;
  outSum4[2] = 0;
  outSum4[3] = 0;
  let deg = 0;
  const add = (nIdx: number): void => {
    const nOff = nIdx * 4;
    outSum4[0] = outSum4[0]! + field[nOff]!;
    outSum4[1] = outSum4[1]! + field[nOff + 1]!;
    outSum4[2] = outSum4[2]! + field[nOff + 2]!;
    outSum4[3] = outSum4[3]! + field[nOff + 3]!;
    deg += 1;
  };
  if (x > 0 && barrierRight[idx - 1] === 0) add(idx - 1);
  if (x + 1 < width && barrierRight[idx] === 0) add(idx + 1);
  if (y > 0 && barrierDown[idx - width] === 0) add(idx - width);
  if (y + 1 < height && barrierDown[idx] === 0) add(idx + width);
  return deg;
}

function buildDiffusionLevelConstraints(
  width: number,
  height: number,
  curves: readonly DiffusionCurveSpec[],
  edges: readonly SampledDiffusionEdge[],
) {
  const cellCount = width * height;
  const fixedMask = new Uint8Array(cellCount);
  const fixedRgba = new Float32Array(cellCount * 4);
  const bestDistSq = new Float32Array(cellCount).fill(Number.POSITIVE_INFINITY);
  const barrierRight = new Uint8Array(cellCount);
  const barrierDown = new Uint8Array(cellCount);
  const seedRadius = 1.08;
  const seedRadiusSq = seedRadius * seedRadius;
  const colorScratch = new Float32Array(4);

  for (const edge of edges) {
    const x0 = Math.max(0, Math.floor(Math.min(edge.ax, edge.bx) - seedRadius - 1));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(edge.ax, edge.bx) + seedRadius + 1));
    const y0 = Math.max(0, Math.floor(Math.min(edge.ay, edge.by) - seedRadius - 1));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(edge.ay, edge.by) + seedRadius + 1));
    const leftNormalX = -(edge.by - edge.ay);
    const leftNormalY = edge.bx - edge.ax;
    const curve = curves[edge.curveIndex]!;

    for (let y = y0; y <= y1; y += 1) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x += 1) {
        const px = x + 0.5;
        const idx = y * width + x;
        const proj = projectPointToSegment2D(px, py, edge.ax, edge.ay, edge.bx, edge.by);
        if (proj.distSq <= seedRadiusSq && proj.distSq < bestDistSq[idx]!) {
          bestDistSq[idx] = proj.distSq;
          fixedMask[idx] = 1;
          const tCurve = edge.t0 + (edge.t1 - edge.t0) * proj.t;
          const side = (px - proj.x) * leftNormalX + (py - proj.y) * leftNormalY;
          sampleColorStopsNormalized(
            side >= 0 ? curve.leftColors : curve.rightColors,
            tCurve,
            colorScratch,
          );
          fixedRgba.set(colorScratch, idx * 4);
        }
        if (
          x + 1 < width &&
          segmentsCross(px, py, px + 1, py, edge.ax, edge.ay, edge.bx, edge.by)
        ) {
          barrierRight[idx] = 1;
        }
        if (
          y + 1 < height &&
          segmentsCross(px, py, px, py + 1, edge.ax, edge.ay, edge.bx, edge.by)
        ) {
          barrierDown[idx] = 1;
        }
      }
    }
  }

  const meanColor = new Float32Array([0.5, 0.5, 0.5, 1]);
  let constrainedCount = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  for (let i = 0; i < cellCount; i += 1) {
    if (fixedMask[i] === 1) {
      constrainedCount += 1;
      const off = i * 4;
      sr += fixedRgba[off]!;
      sg += fixedRgba[off + 1]!;
      sb += fixedRgba[off + 2]!;
      sa += fixedRgba[off + 3]!;
    }
  }
  if (constrainedCount > 0) {
    meanColor.set([
      sr / constrainedCount,
      sg / constrainedCount,
      sb / constrainedCount,
      sa / constrainedCount,
    ]);
  }
  return { fixedMask, fixedRgba, barrierRight, barrierDown, meanColor, constrainedCount };
}

function upsampleRgbaBilinear(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const dst = new Float32Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const sy = clamp(((y + 0.5) * srcH) / dstH - 0.5, 0, srcH - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < dstW; x += 1) {
      const sx = clamp(((x + 0.5) * srcW) / dstW - 0.5, 0, srcW - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx = sx - x0;
      const o00 = (y0 * srcW + x0) * 4;
      const o10 = (y0 * srcW + x1) * 4;
      const o01 = (y1 * srcW + x0) * 4;
      const o11 = (y1 * srcW + x1) * 4;
      const dOff = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = src[o00 + c]! * (1 - wx) + src[o10 + c]! * wx;
        const bot = src[o01 + c]! * (1 - wx) + src[o11 + c]! * wx;
        dst[dOff + c] = top * (1 - wy) + bot * wy;
      }
    }
  }
  return dst;
}

/**
 * 확산 곡선(Diffusion Curves) 집합에 대해 임의 목표 배율(1×, 2×, 4×, 8×)에서
 * 다중격자 가속 장벽 인식 이산 라플라스 방정식(∇²u = 0)을 풀어 매끄러운 음영장을 생성한다.
 */
export function solveDiffusionCurves(
  curves: readonly DiffusionCurveSpec[],
  options: DiffusionSolveOptions,
): DiffusionSolveResult {
  const t0 = nowMs();
  const viewportScale = Math.max(0.25, options.viewportScale ?? 1);
  const width = Math.max(2, Math.round(options.baseWidth * viewportScale));
  const height = Math.max(2, Math.round(options.baseHeight * viewportScale));
  const baseIterations = Math.max(24, options.iterationsPerLevel ?? 84);
  const sorOmega = clamp(options.sorOmega ?? 1.78, 1.0, 1.94);
  const multigridMinSize = Math.max(4, options.multigridMinSize ?? 12);
  const useDither = options.dither ?? false;

  const pyramidDims: { readonly w: number; readonly h: number }[] = [{ w: width, h: height }];
  while (
    pyramidDims[pyramidDims.length - 1]!.w >= multigridMinSize * 2 &&
    pyramidDims[pyramidDims.length - 1]!.h >= multigridMinSize * 2
  ) {
    const prev = pyramidDims[pyramidDims.length - 1]!;
    pyramidDims.push({
      w: Math.max(multigridMinSize, Math.floor(prev.w / 2)),
      h: Math.max(multigridMinSize, Math.floor(prev.h / 2)),
    });
  }
  pyramidDims.reverse();

  let currentField: Float32Array | null = null;
  let prevW = 0;
  let prevH = 0;
  let finestFixedMask = new Uint8Array(0);
  let finestBarrierRight = new Uint8Array(0);
  let finestBarrierDown = new Uint8Array(0);
  let finestConstrainedCount = 0;
  const sumScratch = new Float32Array(4);

  for (let level = 0; level < pyramidDims.length; level += 1) {
    const { w: lw, h: lh } = pyramidDims[level]!;
    const sampledEdges = sampleScaledDiffusionCurves(
      curves,
      lw / Math.max(1, options.baseWidth),
      lh / Math.max(1, options.baseHeight),
    );
    const c = buildDiffusionLevelConstraints(lw, lh, curves, sampledEdges);

    let levelField: Float32Array;
    if (currentField === null) {
      levelField = new Float32Array(lw * lh * 4);
      for (let i = 0; i < lw * lh; i += 1) levelField.set(c.meanColor, i * 4);
    } else {
      levelField = upsampleRgbaBilinear(currentField, prevW, prevH, lw, lh);
    }
    for (let i = 0; i < lw * lh; i += 1) {
      if (c.fixedMask[i] === 1) levelField.set(c.fixedRgba.subarray(i * 4, i * 4 + 4), i * 4);
    }

    const levelIters = level === 0 ? baseIterations * 2 : baseIterations;
    for (let iter = 0; iter < levelIters; iter += 1) {
      const activeOmega = iter + 14 >= levelIters ? 1.0 : sorOmega;
      for (let parity = 0; parity <= 1; parity += 1) {
        for (let y = 0; y < lh; y += 1) {
          for (let x = (y + parity) & 1; x < lw; x += 2) {
            const idx = y * lw + x;
            if (c.fixedMask[idx] === 1) continue;
            const deg = accumulateValidNeighbors(
              levelField,
              lw,
              lh,
              x,
              y,
              idx,
              c.barrierRight,
              c.barrierDown,
              sumScratch,
            );
            if (deg === 0) continue;
            const invDeg = 1 / deg;
            const off = idx * 4;
            for (let ch = 0; ch < 4; ch += 1) {
              levelField[off + ch] =
                levelField[off + ch]! +
                activeOmega * (sumScratch[ch]! * invDeg - levelField[off + ch]!);
            }
          }
        }
      }
    }

    currentField = levelField;
    prevW = lw;
    prevH = lh;
    if (level === pyramidDims.length - 1) {
      finestFixedMask = c.fixedMask;
      finestBarrierRight = c.barrierRight;
      finestBarrierDown = c.barrierDown;
      finestConstrainedCount = c.constrainedCount;
    }
  }

  const floatRgba = currentField!;
  const rgba8 = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      const noise = useDither ? (((0.06711056 * x + 0.00583715 * y) * 52.9829189) % 1) - 0.5 : 0;
      rgba8[off] = clampByte(clamp(floatRgba[off]!, 0, 1) * 255 + noise);
      rgba8[off + 1] = clampByte(clamp(floatRgba[off + 1]!, 0, 1) * 255 + noise);
      rgba8[off + 2] = clampByte(clamp(floatRgba[off + 2]!, 0, 1) * 255 + noise);
      rgba8[off + 3] = clampByte(clamp(floatRgba[off + 3]!, 0, 1) * 255);
    }
  }

  const singularityMarginPx = Math.max(2, Math.round(2 * viewportScale));
  let residualSum = 0;
  let maxResidual = 0;
  let freeCells = 0;
  let maxInteriorStepDelta8 = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      if (finestFixedMask[idx] === 0) {
        const deg = accumulateValidNeighbors(
          floatRgba,
          width,
          height,
          x,
          y,
          idx,
          finestBarrierRight,
          finestBarrierDown,
          sumScratch,
        );
        if (deg > 0) {
          const r = Math.max(
            Math.abs(floatRgba[off]! - sumScratch[0]! / deg),
            Math.abs(floatRgba[off + 1]! - sumScratch[1]! / deg),
            Math.abs(floatRgba[off + 2]! - sumScratch[2]! / deg),
          );
          residualSum += r;
          if (r > maxResidual) maxResidual = r;
          freeCells += 1;
        }
      }
      if (
        x + 1 < width &&
        finestBarrierRight[idx] === 0 &&
        isSmoothInteriorCell(finestFixedMask, width, height, x, y, singularityMarginPx) &&
        isSmoothInteriorCell(finestFixedMask, width, height, x + 1, y, singularityMarginPx)
      ) {
        const jump = Math.max(
          Math.abs(rgba8[off]! - rgba8[off + 4]!),
          Math.abs(rgba8[off + 1]! - rgba8[off + 5]!),
          Math.abs(rgba8[off + 2]! - rgba8[off + 6]!),
        );
        if (jump > maxInteriorStepDelta8) maxInteriorStepDelta8 = jump;
      }
    }
  }

  return {
    width,
    height,
    viewportScale,
    floatRgba,
    rgba8,
    constrainedCellCount: finestConstrainedCount,
    meanHarmonicResidual: freeCells > 0 ? residualSum / freeCells : 0,
    maxHarmonicResidual: maxResidual,
    maxInteriorStepDelta8,
    elapsedMs: Math.max(0, nowMs() - t0),
  };
}

function isSmoothInteriorCell(
  fixedMask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  margin: number,
): boolean {
  const y0 = Math.max(0, cy - margin);
  const y1 = Math.min(height - 1, cy + margin);
  const x0 = Math.max(0, cx - margin);
  const x1 = Math.min(width - 1, cx + margin);
  for (let y = y0; y <= y1; y += 1) {
    const row = y * width;
    for (let x = x0; x <= x1; x += 1) {
      if (fixedMask[row + x] === 1) return false;
    }
  }
  return true;
}
