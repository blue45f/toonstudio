/**
 * #22 로컬 Optical-Flow + 벡터 패스 중간 프레임(In-Between) 보간기 (₩0 로컬 · 0 AI 토큰).
 *
 * 키프레임 A·B 사이에서 Lucas-Kanade 구조 텐서 + SAD 블록매칭 광학 흐름장과
 * 순/역일관성 신뢰도를 추정하고, 중간 시점(t = 0.25, 0.5, 0.75) 래스터 워핑 +
 * 벡터 스트로크 대응 보간을 오프라인에서 합성한다.
 */

export interface RgbaFrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

export interface VectorPoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface VectorStroke2D {
  readonly strokeId: string;
  readonly points: readonly VectorPoint2D[];
  readonly widthPx: number;
  readonly opacity?: number;
}

export interface InbetweenKeyframe {
  readonly frameId: string;
  readonly raster?: RgbaFrameBuffer;
  readonly strokes?: readonly VectorStroke2D[];
}

export interface OpticalFlowOptions {
  readonly gridStep?: number;
  readonly windowRadius?: number;
  readonly searchRadius?: number;
}

export interface OpticalFlowField {
  readonly width: number;
  readonly height: number;
  readonly gridCols: number;
  readonly gridRows: number;
  readonly gridStep: number;
  readonly flowU: Float32Array;
  readonly flowV: Float32Array;
  readonly confidence: Float32Array;
  readonly meanMagnitudePx: number;
  readonly meanConfidence: number;
}

export type InbetweenEasingKind = "linear" | "ease-in-out" | "ease-out";

export interface InbetweenInterpolatorOptions extends OpticalFlowOptions {
  readonly tValues?: readonly number[];
  readonly easing?: InbetweenEasingKind;
  readonly vectorResamplePoints?: number;
}

export interface InterpolatedFrameResult {
  readonly t: number;
  readonly easedT: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray | null;
  readonly strokes: readonly VectorStroke2D[];
  readonly meanFlowConfidence: number;
}

export interface InbetweenSynthesisReport {
  readonly frames: readonly InterpolatedFrameResult[];
  readonly opticalFlow: OpticalFlowField | null;
  readonly matchedStrokePairs: number;
  readonly elapsedMs: number;
  readonly aiTokensUsed: 0;
}

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function rgbaToLuma(frame: RgbaFrameBuffer): Float32Array {
  const count = frame.width * frame.height;
  const luma = new Float32Array(count);
  const d = frame.data;
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    luma[i] = (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) * (d[o + 3] / 255);
  }
  return luma;
}

function evaluateBlockSad(
  lumaSrc: Float32Array,
  lumaDst: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  winRadius: number,
  ou: number,
  ov: number,
): number {
  let sad = 0;
  let count = 0;
  for (let dy = -winRadius; dy <= winRadius; dy += 1) {
    const sy = cy + dy;
    const ty = sy + ov;
    if (sy < 0 || sy >= height || ty < 0 || ty >= height) continue;
    for (let dx = -winRadius; dx <= winRadius; dx += 1) {
      const sx = cx + dx;
      const tx = sx + ou;
      if (sx < 0 || sx >= width || tx < 0 || tx >= width) continue;
      sad += Math.abs(lumaSrc[sy * width + sx] - lumaDst[ty * width + tx]);
      count += 1;
    }
  }
  return count > 0 ? sad : Number.POSITIVE_INFINITY;
}

function estimateSingleVector(
  lumaSrc: Float32Array,
  lumaDst: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  winRadius: number,
  searchRadius: number,
): readonly [number, number] {
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxt = 0;
  let syt = 0;
  let zeroSad = 0;
  let samples = 0;

  for (let dy = -winRadius; dy <= winRadius; dy += 1) {
    const y = cy + dy;
    if (y <= 0 || y >= height - 1) continue;
    for (let dx = -winRadius; dx <= winRadius; dx += 1) {
      const x = cx + dx;
      if (x <= 0 || x >= width - 1) continue;
      const idx = y * width + x;
      const ix = (lumaSrc[idx + 1] - lumaSrc[idx - 1]) * 0.5;
      const iy = (lumaSrc[idx + width] - lumaSrc[idx - width]) * 0.5;
      const it = lumaDst[idx] - lumaSrc[idx];
      sxx += ix * ix;
      syy += iy * iy;
      sxy += ix * iy;
      sxt += ix * it;
      syt += iy * it;
      zeroSad += Math.abs(it);
      samples += 1;
    }
  }

  if (samples === 0 || zeroSad / samples < 1.0) return [0, 0];

  let bestU = 0;
  let bestV = 0;
  let bestSad = zeroSad;

  const det = sxx * syy - sxy * sxy;
  if (det > 1e-2) {
    const lkU = (-syy * sxt + sxy * syt) / det;
    const lkV = (sxy * sxt - sxx * syt) / det;
    if (Math.abs(lkU) <= 2.5 && Math.abs(lkV) <= 2.5) {
      const sadLk = evaluateBlockSad(lumaSrc, lumaDst, width, height, cx, cy, winRadius, Math.round(lkU), Math.round(lkV));
      if (sadLk < bestSad) {
        bestSad = sadLk;
        bestU = lkU;
        bestV = lkV;
      }
    }
  }

  const step = searchRadius > 8 ? 2 : 1;
  let bestIntU = Math.round(bestU);
  let bestIntV = Math.round(bestV);

  for (let ov = -searchRadius; ov <= searchRadius; ov += step) {
    for (let ou = -searchRadius; ou <= searchRadius; ou += step) {
      const sad = evaluateBlockSad(lumaSrc, lumaDst, width, height, cx, cy, winRadius, ou, ov);
      if (sad + 0.5 < bestSad) {
        bestSad = sad;
        bestIntU = ou;
        bestIntV = ov;
        bestU = ou;
        bestV = ov;
      }
    }
  }

  if (step > 1) {
    for (let ov = bestIntV - 1; ov <= bestIntV + 1; ov += 1) {
      for (let ou = bestIntU - 1; ou <= bestIntU + 1; ou += 1) {
        const sad = evaluateBlockSad(lumaSrc, lumaDst, width, height, cx, cy, winRadius, ou, ov);
        if (sad < bestSad) {
          bestSad = sad;
          bestU = ou;
          bestV = ov;
        }
      }
    }
  }

  return [clamp(bestU, -searchRadius, searchRadius), clamp(bestV, -searchRadius, searchRadius)];
}

/**
 * 두 키프레임 RGBA 버퍼 사이의 Lucas-Kanade + 블록매칭 광학 흐름장과 순/역일관성 신뢰도를 계산한다.
 */
export function computeLocalOpticalFlow(
  frameA: RgbaFrameBuffer,
  frameB: RgbaFrameBuffer,
  options: OpticalFlowOptions = {},
): OpticalFlowField {
  const width = Math.min(frameA.width, frameB.width);
  const height = Math.min(frameA.height, frameB.height);
  const gridStep = clamp(Math.floor(options.gridStep ?? 4), 1, 16);
  const winRadius = clamp(Math.floor(options.windowRadius ?? 2), 1, 6);
  const searchRadius = clamp(Math.floor(options.searchRadius ?? 10), 2, 24);

  const lumaA = rgbaToLuma(frameA);
  const lumaB = rgbaToLuma(frameB);

  const gridCols = Math.max(1, Math.ceil(width / gridStep));
  const gridRows = Math.max(1, Math.ceil(height / gridStep));
  const cellCount = gridCols * gridRows;

  const flowU = new Float32Array(cellCount);
  const flowV = new Float32Array(cellCount);
  const backU = new Float32Array(cellCount);
  const backV = new Float32Array(cellCount);
  const confidence = new Float32Array(cellCount);

  for (let gr = 0; gr < gridRows; gr += 1) {
    const cy = Math.min(height - 1, gr * gridStep + Math.floor(gridStep * 0.5));
    for (let gc = 0; gc < gridCols; gc += 1) {
      const cx = Math.min(width - 1, gc * gridStep + Math.floor(gridStep * 0.5));
      const idx = gr * gridCols + gc;
      const fwd = estimateSingleVector(lumaA, lumaB, width, height, cx, cy, winRadius, searchRadius);
      flowU[idx] = fwd[0];
      flowV[idx] = fwd[1];
      const bwd = estimateSingleVector(lumaB, lumaA, width, height, cx, cy, winRadius, searchRadius);
      backU[idx] = bwd[0];
      backV[idx] = bwd[1];
    }
  }

  let magSum = 0;
  let confSum = 0;
  for (let gr = 0; gr < gridRows; gr += 1) {
    for (let gc = 0; gc < gridCols; gc += 1) {
      const idx = gr * gridCols + gc;
      const u = flowU[idx];
      const v = flowV[idx];
      magSum += Math.hypot(u, v);

      const targetGc = clamp(Math.round(gc + u / gridStep), 0, gridCols - 1);
      const targetGr = clamp(Math.round(gr + v / gridStep), 0, gridRows - 1);
      const tIdx = targetGr * gridCols + targetGc;
      const fbError = Math.hypot(u + backU[tIdx], v + backV[tIdx]);
      const conf = Math.exp(-fbError / 3.5);
      confidence[idx] = conf;
      confSum += conf;
    }
  }

  return {
    width,
    height,
    gridCols,
    gridRows,
    gridStep,
    flowU,
    flowV,
    confidence,
    meanMagnitudePx: Number((magSum / cellCount).toFixed(3)),
    meanConfidence: Number((confSum / cellCount).toFixed(4)),
  };
}

function sampleRgbaBilinear(frame: RgbaFrameBuffer, x: number, y: number, out: Float32Array): void {
  const cx = clamp(x, 0, frame.width - 1);
  const cy = clamp(y, 0, frame.height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;

  const d = frame.data;
  const i00 = (y0 * frame.width + x0) * 4;
  const i10 = (y0 * frame.width + x1) * 4;
  const i01 = (y1 * frame.width + x0) * 4;
  const i11 = (y1 * frame.width + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  for (let c = 0; c < 4; c += 1) {
    out[c] = d[i00 + c] * w00 + d[i10 + c] * w10 + d[i01 + c] * w01 + d[i11 + c] * w11;
  }
}

function synthesizeMidRaster(
  frameA: RgbaFrameBuffer,
  frameB: RgbaFrameBuffer,
  flow: OpticalFlowField,
  t: number,
): Uint8ClampedArray {
  const { width, height, gridCols, gridRows, gridStep } = flow;
  const cellCount = gridCols * gridRows;
  const splatU = new Float32Array(cellCount);
  const splatV = new Float32Array(cellCount);
  const splatW = new Float32Array(cellCount);

  for (let gr = 0; gr < gridRows; gr += 1) {
    for (let gc = 0; gc < gridCols; gc += 1) {
      const idx = gr * gridCols + gc;
      const u = flow.flowU[idx];
      const v = flow.flowV[idx];
      const weight = 0.1 + flow.confidence[idx] * (0.4 + Math.hypot(u, v));
      const mgc = clamp(Math.round(gc + (t * u) / gridStep), 0, gridCols - 1);
      const mgr = clamp(Math.round(gr + (t * v) / gridStep), 0, gridRows - 1);
      const mIdx = mgr * gridCols + mgc;
      splatU[mIdx] += u * weight;
      splatV[mIdx] += v * weight;
      splatW[mIdx] += weight;
    }
  }

  for (let i = 0; i < cellCount; i += 1) {
    if (splatW[i] > 0) {
      splatU[i] /= splatW[i];
      splatV[i] /= splatW[i];
    } else {
      splatU[i] = flow.flowU[i];
      splatV[i] = flow.flowV[i];
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const pxA = new Float32Array(4);
  const pxB = new Float32Array(4);

  for (let y = 0; y < height; y += 1) {
    const gr = clamp(Math.floor(y / gridStep), 0, gridRows - 1);
    for (let x = 0; x < width; x += 1) {
      const gc = clamp(Math.floor(x / gridStep), 0, gridCols - 1);
      const gIdx = gr * gridCols + gc;
      const u = splatU[gIdx];
      const v = splatV[gIdx];

      sampleRgbaBilinear(frameA, x - t * u, y - t * v, pxA);
      sampleRgbaBilinear(frameB, x + (1 - t) * u, y + (1 - t) * v, pxB);

      const o = (y * width + x) * 4;
      const wA = 1 - t;
      out[o] = Math.round(pxA[0] * wA + pxB[0] * t);
      out[o + 1] = Math.round(pxA[1] * wA + pxB[1] * t);
      out[o + 2] = Math.round(pxA[2] * wA + pxB[2] * t);
      out[o + 3] = Math.round(pxA[3] * wA + pxB[3] * t);
    }
  }

  return out;
}

function resampleStrokeUniform(
  points: readonly VectorPoint2D[],
  sampleCount: number,
): readonly VectorPoint2D[] {
  if (points.length === 0) return [];
  if (points.length === 1 || sampleCount <= 1) {
    const p = points[0];
    return Array.from({ length: Math.max(1, sampleCount) }, () => ({
      x: p.x,
      y: p.y,
      pressure: p.pressure ?? 1,
    }));
  }

  const cumDist = new Float32Array(points.length);
  for (let i = 1; i < points.length; i += 1) {
    cumDist[i] =
      cumDist[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const totalLen = cumDist[points.length - 1];
  const result: VectorPoint2D[] = [];

  for (let s = 0; s < sampleCount; s += 1) {
    const target = (s / (sampleCount - 1)) * totalLen;
    let seg = 0;
    while (seg < points.length - 2 && cumDist[seg + 1] < target) seg += 1;
    const segLen = Math.max(1e-6, cumDist[seg + 1] - cumDist[seg]);
    const localT = clamp((target - cumDist[seg]) / segLen, 0, 1);
    const a = points[seg];
    const b = points[seg + 1];
    result.push({
      x: a.x + (b.x - a.x) * localT,
      y: a.y + (b.y - a.y) * localT,
      pressure: (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * localT,
    });
  }
  return result;
}

function strokeCentroid(stroke: VectorStroke2D): readonly [number, number] {
  if (stroke.points.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < stroke.points.length; i += 1) {
    sx += stroke.points[i].x;
    sy += stroke.points[i].y;
  }
  return [sx / stroke.points.length, sy / stroke.points.length];
}

function applyEasing(t: number, easing: InbetweenEasingKind): number {
  const c = clamp(t, 0, 1);
  if (easing === "ease-in-out") return c * c * (3 - 2 * c);
  if (easing === "ease-out") return 1 - (1 - c) * (1 - c);
  return c;
}

/**
 * #22 키프레임 A·B 사이에서 로컬 Optical-Flow 래스터 워핑 + 벡터 스트로크 대응 보간을 수행한다.
 */
export function interpolateInbetweenFrames(
  keyframeA: InbetweenKeyframe,
  keyframeB: InbetweenKeyframe,
  options: InbetweenInterpolatorOptions = {},
): InbetweenSynthesisReport {
  const startMs = performance.now();
  const tValues = options.tValues ?? [0.25, 0.5, 0.75];
  const easing = options.easing ?? "linear";
  const sampleCount = clamp(Math.floor(options.vectorResamplePoints ?? 16), 4, 64);

  const opticalFlow =
    keyframeA.raster && keyframeB.raster
      ? computeLocalOpticalFlow(keyframeA.raster, keyframeB.raster, options)
      : null;

  const strokesA = keyframeA.strokes ?? [];
  const strokesB = keyframeB.strokes ?? [];
  const usedB = new Set<number>();
  const matchedPairs: Array<{
    readonly strokeId: string;
    readonly ptsA: readonly VectorPoint2D[];
    readonly ptsB: readonly VectorPoint2D[];
    readonly strokeA: VectorStroke2D;
    readonly strokeB: VectorStroke2D;
  }> = [];
  const unmatchedA: VectorStroke2D[] = [];

  for (let i = 0; i < strokesA.length; i += 1) {
    const sA = strokesA[i];
    let matchIdx = -1;
    for (let j = 0; j < strokesB.length; j += 1) {
      if (!usedB.has(j) && strokesB[j].strokeId === sA.strokeId) {
        matchIdx = j;
        break;
      }
    }
    if (matchIdx < 0) {
      const cA = strokeCentroid(sA);
      let bestDist = Number.POSITIVE_INFINITY;
      for (let j = 0; j < strokesB.length; j += 1) {
        if (usedB.has(j)) continue;
        const cB = strokeCentroid(strokesB[j]);
        const d = Math.hypot(cA[0] - cB[0], cA[1] - cB[1]);
        if (d < bestDist) {
          bestDist = d;
          matchIdx = j;
        }
      }
    }
    if (matchIdx >= 0) {
      usedB.add(matchIdx);
      const sB = strokesB[matchIdx];
      matchedPairs.push({
        strokeId: sA.strokeId,
        ptsA: resampleStrokeUniform(sA.points, sampleCount),
        ptsB: resampleStrokeUniform(sB.points, sampleCount),
        strokeA: sA,
        strokeB: sB,
      });
    } else {
      unmatchedA.push(sA);
    }
  }

  const unmatchedB: VectorStroke2D[] = [];
  for (let j = 0; j < strokesB.length; j += 1) {
    if (!usedB.has(j)) unmatchedB.push(strokesB[j]);
  }

  const frames: InterpolatedFrameResult[] = [];
  for (let ti = 0; ti < tValues.length; ti += 1) {
    const rawT = clamp(tValues[ti], 0, 1);
    const easedT = applyEasing(rawT, easing);

    const rgba =
      keyframeA.raster && keyframeB.raster && opticalFlow
        ? synthesizeMidRaster(keyframeA.raster, keyframeB.raster, opticalFlow, easedT)
        : null;

    const synthStrokes: VectorStroke2D[] = [];
    for (let p = 0; p < matchedPairs.length; p += 1) {
      const pair = matchedPairs[p];
      const interpPoints: VectorPoint2D[] = [];
      for (let k = 0; k < pair.ptsA.length; k += 1) {
        const a = pair.ptsA[k];
        const b = pair.ptsB[k];
        interpPoints.push({
          x: Number((a.x + (b.x - a.x) * easedT).toFixed(3)),
          y: Number((a.y + (b.y - a.y) * easedT).toFixed(3)),
          pressure: Number(
            ((a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * easedT).toFixed(3),
          ),
        });
      }
      synthStrokes.push({
        strokeId: pair.strokeId,
        points: interpPoints,
        widthPx: Number(
          (pair.strokeA.widthPx + (pair.strokeB.widthPx - pair.strokeA.widthPx) * easedT).toFixed(3),
        ),
        opacity: Number(
          ((pair.strokeA.opacity ?? 1) + ((pair.strokeB.opacity ?? 1) - (pair.strokeA.opacity ?? 1)) * easedT).toFixed(3),
        ),
      });
    }

    for (let i = 0; i < unmatchedA.length; i += 1) {
      const s = unmatchedA[i];
      synthStrokes.push({ ...s, opacity: Number(((s.opacity ?? 1) * (1 - easedT)).toFixed(3)) });
    }
    for (let i = 0; i < unmatchedB.length; i += 1) {
      const s = unmatchedB[i];
      synthStrokes.push({ ...s, opacity: Number(((s.opacity ?? 1) * easedT).toFixed(3)) });
    }

    frames.push({
      t: rawT,
      easedT: Number(easedT.toFixed(4)),
      width: opticalFlow ? opticalFlow.width : 0,
      height: opticalFlow ? opticalFlow.height : 0,
      rgba,
      strokes: synthStrokes,
      meanFlowConfidence: opticalFlow ? opticalFlow.meanConfidence : 1,
    });
  }

  return {
    frames,
    opticalFlow,
    matchedStrokePairs: matchedPairs.length,
    elapsedMs: Number((performance.now() - startMs).toFixed(3)),
    aiTokensUsed: 0,
  };
}
