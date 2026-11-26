/**
 * Wave 8 Singularity — ARAP 삼각 메쉬 포즈 모핑 · ITU-R BT.1702 광과민성 점멸 안전 감사 ·
 * 윤곽선 기반 푸아송(Poisson/SOR) 2D→3D 노말맵 및 림라이트 추정 엔진 통합 모듈 (₩0 로컬 연산).
 */

export {
  computeMeshTotalArea,
  morphArapPoseKeyframes,
  solveArapMeshDeformation,
  type ArapDeformationInput,
  type ArapDeformationResult,
  type ArapKeyframeMorphInput,
  type ArapKeyframeMorphResult,
  type ArapPinConstraint,
  type ArapWeightMode,
  type TriangleTuple,
  type Vec2Tuple,
} from "./arap-pose-morph-solver";

export type Vec3Tuple = readonly [number, number, number];

export interface FlashAuditFrameInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly timestampSec?: number;
}

export interface FlashAuditOptions {
  readonly fps?: number;
  readonly peakWhiteNits?: number;
  readonly areaFractionThreshold?: number;
  readonly maxSafeFlashHz?: number;
  readonly minHazardousDeltaNits?: number;
  readonly darkRegionCeilingNits?: number;
}

export type FlashHazardKind = "luminance" | "saturated-red" | "combined";

export interface FlashHazardInterval {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly startTimeSec: number;
  readonly endTimeSec: number;
  readonly peakFlashHz: number;
  readonly maxDeltaNits: number;
  readonly minDarkNits: number;
  readonly hasSaturatedRedHazard: boolean;
  readonly hazardKind: FlashHazardKind;
}

export interface FlashSafetyAuditReport {
  readonly isSafe: boolean;
  readonly frameCount: number;
  readonly fps: number;
  readonly frameMeanNits: Float64Array;
  readonly frameRedState: Float64Array;
  readonly hazardIntervals: readonly FlashHazardInterval[];
  readonly dampingGainCurve: Float64Array;
  readonly targetSafeNitsCurve: Float64Array;
  readonly serverCostKrw: 0;
}

export type ContourInputMode = "silhouette" | "closed-ink";

export interface ContourNormalEstimateInput {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly channels?: 1 | 4;
  readonly inputMode?: ContourInputMode;
  readonly sorIterations?: number;
  readonly sorOmega?: number;
  readonly inflationStrength?: number;
  readonly boundaryTilt?: number;
  readonly lightDirection?: Vec3Tuple;
  readonly rimPower?: number;
}

export interface ContourNormalEstimateResult {
  readonly width: number;
  readonly height: number;
  readonly foregroundMask: Uint8Array;
  readonly boundaryInwardNormalsXY: Float32Array;
  readonly heightMap: Float32Array;
  readonly normalsXYZ: Float32Array;
  readonly normalMapRgba8: Uint8Array;
  readonly rimLightIntensity: Float32Array;
  readonly diffuseKeyIntensity: Float32Array;
  readonly interiorPixelCount: number;
  readonly sorResidual: number;
  readonly serverCostKrw: 0;
}

/* -------------------------------------------------------------------------- */
/* 1. ITU-R BT.1702 / Harding 광과민성 점멸 안전 감사 및 감쇠 완화기          */
/* -------------------------------------------------------------------------- */

function srgbByteToLinear(byteVal: number): number {
  const c = Math.max(0, Math.min(255, byteVal)) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(linearVal: number): number {
  const c = Math.max(0, Math.min(1, linearVal));
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(encoded * 255)));
}

interface FrameCellSummary {
  readonly meanNits: number;
  readonly meanRedState: number;
  readonly cellNits: Float32Array;
  readonly cellRedState: Float32Array;
  readonly cellRedSat: Float32Array;
}

function summarizeFrameGrid(
  frame: FlashAuditFrameInput,
  peakWhiteNits: number,
  gridCols: number,
  gridRows: number,
): FrameCellSummary {
  const w = Math.max(1, frame.width);
  const h = Math.max(1, frame.height);
  const cols = Math.min(gridCols, w);
  const rows = Math.min(gridRows, h);
  const cellCount = cols * rows;
  const cellNits = new Float32Array(cellCount);
  const cellRedState = new Float32Array(cellCount);
  const cellRedSat = new Float32Array(cellCount);
  const cellCounts = new Uint32Array(cellCount);

  let totalNits = 0;
  let totalRedState = 0;
  for (let y = 0; y < h; y += 1) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / h));
    for (let x = 0; x < w; x += 1) {
      const cx = Math.min(cols - 1, Math.floor((x * cols) / w));
      const cIdx = cy * cols + cx;
      const pIdx = (y * w + x) * 4;
      const rLin = srgbByteToLinear(frame.rgba[pIdx] ?? 0);
      const gLin = srgbByteToLinear(frame.rgba[pIdx + 1] ?? 0);
      const bLin = srgbByteToLinear(frame.rgba[pIdx + 2] ?? 0);

      const nits = (0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin) * peakWhiteNits;
      const rgbSum = rLin + gLin + bLin;
      const redSat = rgbSum > 1e-6 ? rLin / rgbSum : 0;
      const redState = Math.max(0, (rLin - gLin - bLin) * 320);

      cellNits[cIdx] = cellNits[cIdx]! + nits;
      cellRedState[cIdx] = cellRedState[cIdx]! + redState;
      cellRedSat[cIdx] = cellRedSat[cIdx]! + redSat;
      cellCounts[cIdx] = cellCounts[cIdx]! + 1;
      totalNits += nits;
      totalRedState += redState;
    }
  }

  for (let c = 0; c < cellCount; c += 1) {
    const cnt = Math.max(1, cellCounts[c]!);
    cellNits[c] = cellNits[c]! / cnt;
    cellRedState[c] = cellRedState[c]! / cnt;
    cellRedSat[c] = cellRedSat[c]! / cnt;
  }

  const totalPixels = w * h;
  return {
    meanNits: totalNits / totalPixels,
    meanRedState: totalRedState / totalPixels,
    cellNits,
    cellRedState,
    cellRedSat,
  };
}

interface OpposingTransitionEvent {
  readonly fromFrame: number;
  readonly toFrame: number;
  readonly timeSec: number;
  readonly deltaMetric: number;
  readonly minDarkMetric: number;
  readonly kind: "luminance" | "saturated-red";
}

function collectOpposingExtremumLegs(
  series: Float64Array,
  reversalThreshold: number,
  onLeg: (aIdx: number, bIdx: number) => void,
): void {
  const count = series.length;
  if (count < 2) return;
  let anchor = 0;
  let ext = 0;
  let dir = 0;
  for (let i = 1; i < count; i += 1) {
    const val = series[i]!;
    if (dir === 0) {
      const diff = val - series[anchor]!;
      if (Math.abs(diff) >= 1.0) {
        dir = diff > 0 ? 1 : -1;
        ext = i;
      }
    } else if ((dir > 0 && val >= series[ext]!) || (dir < 0 && val <= series[ext]!)) {
      ext = i;
    } else if (Math.abs(val - series[ext]!) >= reversalThreshold) {
      onLeg(anchor, ext);
      anchor = ext;
      dir = -dir;
      ext = i;
    }
  }
  if (dir !== 0 && ext > anchor) onLeg(anchor, ext);
}

/** 프레임 시퀀스에서 ITU-R BT.1702 / Harding 광과민성 점멸 위험 구간과 완화 곡선을 계산한다. */
export function auditPhotosensitiveFlashSafety(
  frames: readonly FlashAuditFrameInput[],
  options: FlashAuditOptions = {},
): FlashSafetyAuditReport {
  const fps = Math.max(1, options.fps ?? 30);
  const peakWhiteNits = Math.max(50, options.peakWhiteNits ?? 200);
  const areaFractionThreshold = Math.max(0.01, Math.min(1, options.areaFractionThreshold ?? 0.25));
  const maxSafeFlashHz = Math.max(1, options.maxSafeFlashHz ?? 3.0);
  const minHazardousDeltaNits = Math.max(5, options.minHazardousDeltaNits ?? 20);
  const darkRegionCeilingNits = Math.max(20, options.darkRegionCeilingNits ?? 160);

  const count = frames.length;
  const frameMeanNits = new Float64Array(count);
  const frameRedState = new Float64Array(count);
  const dampingGainCurve = new Float64Array(count).fill(1);
  const targetSafeNitsCurve = new Float64Array(count);

  if (count === 0) {
    return {
      isSafe: true,
      frameCount: 0,
      fps,
      frameMeanNits,
      frameRedState,
      hazardIntervals: [],
      dampingGainCurve,
      targetSafeNitsCurve,
      serverCostKrw: 0,
    };
  }

  const summaries = frames.map((f) => summarizeFrameGrid(f, peakWhiteNits, 16, 16));
  const timestamps = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    frameMeanNits[i] = summaries[i]!.meanNits;
    frameRedState[i] = summaries[i]!.meanRedState;
    targetSafeNitsCurve[i] = summaries[i]!.meanNits;
    timestamps[i] = frames[i]!.timestampSec ?? i / fps;
  }

  const lumTransitions: OpposingTransitionEvent[] = [];
  collectOpposingExtremumLegs(
    frameMeanNits,
    minHazardousDeltaNits * areaFractionThreshold,
    (aIdx, bIdx) => {
      const cellA = summaries[aIdx]!.cellNits;
      const cellB = summaries[bIdx]!.cellNits;
      let activeCells = 0;
      let maxCellDelta = 0;
      let minCellDark = peakWhiteNits;
      for (let c = 0; c < cellA.length; c += 1) {
        const d = Math.abs(cellB[c]! - cellA[c]!);
        const darker = Math.min(cellB[c]!, cellA[c]!);
        if (d >= minHazardousDeltaNits && darker < darkRegionCeilingNits) {
          activeCells += 1;
          if (d > maxCellDelta) maxCellDelta = d;
          if (darker < minCellDark) minCellDark = darker;
        }
      }
      if (activeCells / cellA.length >= areaFractionThreshold) {
        lumTransitions.push({
          fromFrame: aIdx,
          toFrame: bIdx,
          timeSec: timestamps[bIdx]!,
          deltaMetric: maxCellDelta,
          minDarkMetric: minCellDark,
          kind: "luminance",
        });
      }
    },
  );

  const redTransitions: OpposingTransitionEvent[] = [];
  collectOpposingExtremumLegs(frameRedState, 20 * areaFractionThreshold, (aIdx, bIdx) => {
    const redA = summaries[aIdx]!.cellRedState;
    const redB = summaries[bIdx]!.cellRedState;
    const satA = summaries[aIdx]!.cellRedSat;
    const satB = summaries[bIdx]!.cellRedSat;
    let activeCells = 0;
    let maxRedDelta = 0;
    for (let c = 0; c < redA.length; c += 1) {
      const dRed = Math.abs(redB[c]! - redA[c]!);
      if ((satA[c]! >= 0.8 || satB[c]! >= 0.8) && dRed > 20) {
        activeCells += 1;
        if (dRed > maxRedDelta) maxRedDelta = dRed;
      }
    }
    if (activeCells / redA.length >= areaFractionThreshold) {
      redTransitions.push({
        fromFrame: aIdx,
        toFrame: bIdx,
        timeSec: timestamps[bIdx]!,
        deltaMetric: maxRedDelta,
        minDarkMetric: Math.min(frameMeanNits[aIdx]!, frameMeanNits[bIdx]!),
        kind: "saturated-red",
      });
    }
  });

  const maxSafeTransitionsPerSec = Math.floor(maxSafeFlashHz * 2);
  const rawIntervals: FlashHazardInterval[] = [];
  const scanEvents = (
    events: readonly OpposingTransitionEvent[],
    kindLabel: "luminance" | "saturated-red",
  ): void => {
    for (let left = 0; left < events.length; left += 1) {
      const startEv = events[left]!;
      let right = left;
      let maxDelta = startEv.deltaMetric;
      let minDark = startEv.minDarkMetric;
      while (right + 1 < events.length && events[right + 1]!.timeSec - startEv.timeSec <= 1.0 + 1e-6) {
        right += 1;
        if (events[right]!.deltaMetric > maxDelta) maxDelta = events[right]!.deltaMetric;
        if (events[right]!.minDarkMetric < minDark) minDark = events[right]!.minDarkMetric;
      }
      const transitionsInSec = right - left + 1;
      if (transitionsInSec > maxSafeTransitionsPerSec) {
        const endEv = events[right]!;
        const spanSec = Math.max(1 / fps, timestamps[endEv.toFrame]! - timestamps[startEv.fromFrame]!);
        const flashHz = transitionsInSec / 2 / Math.min(1, Math.max(spanSec, 0.25));
        rawIntervals.push({
          startFrame: startEv.fromFrame,
          endFrame: endEv.toFrame,
          startTimeSec: timestamps[startEv.fromFrame]!,
          endTimeSec: timestamps[endEv.toFrame]!,
          peakFlashHz: Math.max(transitionsInSec / 2, Math.min(fps / 2, flashHz)),
          maxDeltaNits: maxDelta,
          minDarkNits: minDark,
          hasSaturatedRedHazard: kindLabel === "saturated-red",
          hazardKind: kindLabel,
        });
      }
    }
  };

  scanEvents(lumTransitions, "luminance");
  scanEvents(redTransitions, "saturated-red");
  rawIntervals.sort((a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame);

  const mergedIntervals: FlashHazardInterval[] = [];
  for (const cur of rawIntervals) {
    const prev = mergedIntervals[mergedIntervals.length - 1];
    if (prev && cur.startFrame <= prev.endFrame + 2) {
      mergedIntervals[mergedIntervals.length - 1] = {
        startFrame: Math.min(prev.startFrame, cur.startFrame),
        endFrame: Math.max(prev.endFrame, cur.endFrame),
        startTimeSec: Math.min(prev.startTimeSec, cur.startTimeSec),
        endTimeSec: Math.max(prev.endTimeSec, cur.endTimeSec),
        peakFlashHz: Math.max(prev.peakFlashHz, cur.peakFlashHz),
        maxDeltaNits: Math.max(prev.maxDeltaNits, cur.maxDeltaNits),
        minDarkNits: Math.min(prev.minDarkNits, cur.minDarkNits),
        hasSaturatedRedHazard: prev.hasSaturatedRedHazard || cur.hasSaturatedRedHazard,
        hazardKind: prev.hazardKind === cur.hazardKind ? prev.hazardKind : "combined",
      };
    } else {
      mergedIntervals.push(cur);
    }
  }

  const halfWindow = Math.max(4, Math.round(fps * 0.35));
  const localMeanNits = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(count - 1, i + halfWindow);
    let wSum = 0;
    let vSum = 0;
    for (let k = lo; k <= hi; k += 1) {
      const w = 0.5 * (1 + Math.cos((Math.PI * (k - i)) / (halfWindow + 1)));
      vSum += w * frameMeanNits[k]!;
      wSum += w;
    }
    localMeanNits[i] = vSum / Math.max(1e-9, wSum);
  }

  const rampFrames = Math.max(2, Math.round(fps * 0.12));
  for (const interval of mergedIntervals) {
    const lo = Math.max(0, interval.startFrame - rampFrames);
    const hi = Math.min(count - 1, interval.endFrame + rampFrames);
    const effectiveSwing = Math.max(minHazardousDeltaNits, interval.maxDeltaNits, interval.hasSaturatedRedHazard ? 180 : 0);
    const neededCompression = Math.min(
      0.97,
      Math.max(0.85, 1 - (minHazardousDeltaNits * 0.2) / effectiveSwing),
    );
    for (let f = lo; f <= hi; f += 1) {
      let envelope = 1;
      if (f < interval.startFrame) {
        envelope = 0.5 * (1 - Math.cos((Math.PI * (f - lo + 1)) / (interval.startFrame - lo + 1)));
      } else if (f > interval.endFrame) {
        envelope = 0.5 * (1 - Math.cos((Math.PI * (hi - f + 1)) / (hi - interval.endFrame + 1)));
      }
      const retainGain = 1 - neededCompression * envelope;
      if (retainGain < dampingGainCurve[f]!) dampingGainCurve[f] = retainGain;
      targetSafeNitsCurve[f] =
        localMeanNits[f]! + dampingGainCurve[f]! * (frameMeanNits[f]! - localMeanNits[f]!);
    }
  }

  return {
    isSafe: mergedIntervals.length === 0,
    frameCount: count,
    fps,
    frameMeanNits,
    frameRedState,
    hazardIntervals: mergedIntervals,
    dampingGainCurve,
    targetSafeNitsCurve,
    serverCostKrw: 0,
  };
}

/** 감사 리포트의 감쇠 게인 곡선을 적용해 휘도·적색 급변을 안전 기준 이하로 완화한 프레임 시퀀스를 생성한다. */
export function applyFlashMitigationToFrames(
  frames: readonly FlashAuditFrameInput[],
  report: FlashSafetyAuditReport,
): readonly FlashAuditFrameInput[] {
  if (report.isSafe || frames.length === 0) return frames;
  const count = frames.length;
  const halfWin = Math.max(4, Math.round(report.fps * 0.35));
  const pixelByteLen = frames[0]!.rgba.length;

  const linearFrames = frames.map((frame) => {
    const lin = new Float32Array(frame.rgba.length);
    for (let i = 0; i < frame.rgba.length; i += 4) {
      lin[i] = srgbByteToLinear(frame.rgba[i]!);
      lin[i + 1] = srgbByteToLinear(frame.rgba[i + 1]!);
      lin[i + 2] = srgbByteToLinear(frame.rgba[i + 2]!);
      lin[i + 3] = frame.rgba[i + 3]! / 255;
    }
    return lin;
  });

  return frames.map((frame, f) => {
    const retain = report.dampingGainCurve[f]!;
    if (retain >= 0.999) return frame;
    const lo = Math.max(0, f - halfWin);
    const hi = Math.min(count - 1, f + halfWin);
    const weights = new Float64Array(hi - lo + 1);
    let wSum = 0;
    for (let k = lo; k <= hi; k += 1) {
      const w = 0.5 * (1 + Math.cos((Math.PI * (k - f)) / (halfWin + 1)));
      weights[k - lo] = w;
      wSum += w;
    }
    const wInv = 1 / Math.max(1e-9, wSum);
    const outRgba = new Uint8Array(pixelByteLen);
    const curLin = linearFrames[f]!;

    for (let p = 0; p < pixelByteLen; p += 4) {
      let avgR = 0;
      let avgG = 0;
      let avgB = 0;
      for (let k = lo; k <= hi; k += 1) {
        const lk = linearFrames[k]!;
        const w = weights[k - lo]!;
        avgR += w * lk[p]!;
        avgG += w * lk[p + 1]!;
        avgB += w * lk[p + 2]!;
      }
      avgR *= wInv;
      avgG *= wInv;
      avgB *= wInv;
      outRgba[p] = linearToSrgbByte(avgR + retain * (curLin[p]! - avgR));
      outRgba[p + 1] = linearToSrgbByte(avgG + retain * (curLin[p + 1]! - avgG));
      outRgba[p + 2] = linearToSrgbByte(avgB + retain * (curLin[p + 2]! - avgB));
      outRgba[p + 3] = frame.rgba[p + 3]!;
    }

    return { width: frame.width, height: frame.height, rgba: outRgba, timestampSec: frame.timestampSec };
  });
}

/* -------------------------------------------------------------------------- */
/* 2. 윤곽선 기반 푸아송(Poisson/SOR) 2D→3D 노말맵 & 방향성 림라이트 추정기   */
/* -------------------------------------------------------------------------- */

function extractForegroundMask(input: ContourNormalEstimateInput): Uint8Array {
  const { width: w, height: h, pixels } = input;
  const channels = input.channels ?? 1;
  const total = w * h;
  const mask = new Uint8Array(total);

  if ((input.inputMode ?? "silhouette") === "silhouette") {
    for (let i = 0; i < total; i += 1) {
      const val = channels === 4 ? pixels[i * 4 + 3]! || pixels[i * 4]! : pixels[i]!;
      mask[i] = val >= 128 ? 1 : 0;
    }
    return mask;
  }

  const isInk = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    const lum =
      channels === 4
        ? 0.299 * pixels[i * 4]! + 0.587 * pixels[i * 4 + 1]! + 0.114 * pixels[i * 4 + 2]!
        : pixels[i]!;
    isInk[i] = lum < 140 ? 1 : 0;
  }

  const exterior = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const tryEnqueue = (idx: number): void => {
    if (exterior[idx] === 0 && isInk[idx] === 0) {
      exterior[idx] = 1;
      queue[tail] = idx;
      tail += 1;
    }
  };

  for (let x = 0; x < w; x += 1) {
    tryEnqueue(x);
    tryEnqueue((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    tryEnqueue(y * w);
    tryEnqueue(y * w + (w - 1));
  }

  while (head < tail) {
    const cur = queue[head]!;
    head += 1;
    const x = cur % w;
    const y = Math.floor(cur / w);
    if (x > 0) tryEnqueue(cur - 1);
    if (x + 1 < w) tryEnqueue(cur + 1);
    if (y > 0) tryEnqueue(cur - w);
    if (y + 1 < h) tryEnqueue(cur + w);
  }

  for (let i = 0; i < total; i += 1) mask[i] = exterior[i] === 0 ? 1 : 0;
  return mask;
}

/** 닫힌 윤곽선 또는 실루엣으로부터 경계 내부 법선, 푸아송/SOR 3D 노말맵, 역광 림라이트를 추정한다. */
export function estimateContourNormalAndRimLight(
  input: ContourNormalEstimateInput,
): ContourNormalEstimateResult {
  const w = Math.max(1, Math.trunc(input.width));
  const h = Math.max(1, Math.trunc(input.height));
  const total = w * h;
  const sorIterations = Math.max(8, Math.min(400, Math.trunc(input.sorIterations ?? 80)));
  const sorOmega = Math.max(1.0, Math.min(1.92, input.sorOmega ?? 1.72));
  const inflationStrength = Math.max(0.01, input.inflationStrength ?? 0.35);
  const boundaryTilt = Math.max(0.1, Math.min(0.99, input.boundaryTilt ?? 0.92));
  const rimPower = Math.max(0.5, input.rimPower ?? 2.4);

  const rawLight = input.lightDirection ?? [-0.65, 0.55, -0.35];
  const lNorm = Math.hypot(rawLight[0], rawLight[1], rawLight[2]) || 1;
  const lx = rawLight[0] / lNorm;
  const ly = rawLight[1] / lNorm;
  const lz = rawLight[2] / lNorm;

  const foregroundMask = extractForegroundMask(input);
  const smoothOcc = new Float32Array(total);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      let wt = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = Math.max(0, Math.min(h - 1, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const k = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          acc += k * foregroundMask[ny * w + nx]!;
          wt += k;
        }
      }
      smoothOcc[y * w + x] = acc / wt;
    }
  }

  const isBoundary = new Uint8Array(total);
  const boundaryInwardNormalsXY = new Float32Array(total * 2);
  let interiorPixelCount = 0;
  const sampleOcc = (sx: number, sy: number): number =>
    sx < 0 || sx >= w || sy < 0 || sy >= h ? 0 : smoothOcc[sy * w + sx]!;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (foregroundMask[idx] === 0) continue;
      interiorPixelCount += 1;
      const touchesExterior =
        x === 0 ||
        x === w - 1 ||
        y === 0 ||
        y === h - 1 ||
        foregroundMask[idx - 1] === 0 ||
        foregroundMask[idx + 1] === 0 ||
        foregroundMask[idx - w] === 0 ||
        foregroundMask[idx + w] === 0;
      if (!touchesExterior) continue;
      isBoundary[idx] = 1;

      const gx =
        sampleOcc(x + 1, y - 1) +
        2 * sampleOcc(x + 1, y) +
        sampleOcc(x + 1, y + 1) -
        (sampleOcc(x - 1, y - 1) + 2 * sampleOcc(x - 1, y) + sampleOcc(x - 1, y + 1));
      const gyUp = -(
        sampleOcc(x - 1, y + 1) +
        2 * sampleOcc(x, y + 1) +
        sampleOcc(x + 1, y + 1) -
        (sampleOcc(x - 1, y - 1) + 2 * sampleOcc(x, y - 1) + sampleOcc(x + 1, y - 1))
      );
      const gLen = Math.hypot(gx, gyUp);
      if (gLen > 1e-6) {
        boundaryInwardNormalsXY[idx * 2] = gx / gLen;
        boundaryInwardNormalsXY[idx * 2 + 1] = gyUp / gLen;
      }
    }
  }

  const heightMap = new Float32Array(total);
  const harmNx = new Float32Array(total);
  const harmNy = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    if (isBoundary[i] === 1) {
      harmNx[i] = -boundaryTilt * boundaryInwardNormalsXY[i * 2]!;
      harmNy[i] = -boundaryTilt * boundaryInwardNormalsXY[i * 2 + 1]!;
    }
  }

  let sorResidual = 0;
  for (let iter = 0; iter < sorIterations; iter += 1) {
    let maxDelta = 0;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const idx = y * w + x;
        if (foregroundMask[idx] === 0 || isBoundary[idx] === 1) continue;
        const targetH =
          0.25 *
          (heightMap[idx - 1]! + heightMap[idx + 1]! + heightMap[idx - w]! + heightMap[idx + w]! + inflationStrength);
        const nextH = (1 - sorOmega) * heightMap[idx]! + sorOmega * targetH;
        const dh = Math.abs(nextH - heightMap[idx]!);
        if (dh > maxDelta) maxDelta = dh;
        heightMap[idx] = Math.max(0, nextH);

        harmNx[idx] =
          (1 - sorOmega) * harmNx[idx]! +
          0.25 * sorOmega * (harmNx[idx - 1]! + harmNx[idx + 1]! + harmNx[idx - w]! + harmNx[idx + w]!);
        harmNy[idx] =
          (1 - sorOmega) * harmNy[idx]! +
          0.25 * sorOmega * (harmNy[idx - 1]! + harmNy[idx + 1]! + harmNy[idx - w]! + harmNy[idx + w]!);
      }
    }
    sorResidual = maxDelta;
    if (maxDelta < 1e-5) break;
  }

  const normalsXYZ = new Float32Array(total * 3);
  const normalMapRgba8 = new Uint8Array(total * 4);
  const rimLightIntensity = new Float32Array(total);
  const diffuseKeyIntensity = new Float32Array(total);
  const lateralLen = Math.hypot(lx, ly);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (foregroundMask[idx] === 0) {
        normalsXYZ[idx * 3 + 2] = 1;
        normalMapRgba8[idx * 4] = 128;
        normalMapRgba8[idx * 4 + 1] = 128;
        normalMapRgba8[idx * 4 + 2] = 255;
        continue;
      }
      const dhDx = 0.5 * ((x + 1 < w ? heightMap[idx + 1]! : 0) - (x > 0 ? heightMap[idx - 1]! : 0));
      const dhDyUp = 0.5 * ((y > 0 ? heightMap[idx - w]! : 0) - (y + 1 < h ? heightMap[idx + w]! : 0));

      let nx = 0.65 * harmNx[idx]! - 0.35 * dhDx;
      let ny = 0.65 * harmNy[idx]! - 0.35 * dhDyUp;
      const xySq = nx * nx + ny * ny;
      if (xySq > 0.96) {
        const s = Math.sqrt(0.96 / xySq);
        nx *= s;
        ny *= s;
      }
      let nz = Math.sqrt(Math.max(0.04, 1 - nx * nx - ny * ny));
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      normalsXYZ[idx * 3] = nx;
      normalsXYZ[idx * 3 + 1] = ny;
      normalsXYZ[idx * 3 + 2] = nz;
      normalMapRgba8[idx * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      normalMapRgba8[idx * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalMapRgba8[idx * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalMapRgba8[idx * 4 + 3] = 255;

      const fresnel = Math.max(0, 1 - nz) ** rimPower;
      const dirDot = lateralLen > 1e-6 ? Math.max(0, (nx * lx + ny * ly) / lateralLen) : 1;
      const backlightBoost = lz < 0 ? 1 + 0.35 * Math.min(1, -lz) : 1;
      rimLightIntensity[idx] = Math.min(1, fresnel * (0.2 + 0.8 * dirDot) * backlightBoost);
      diffuseKeyIntensity[idx] = Math.max(0, Math.min(1, nx * lx + ny * ly + nz * Math.abs(lz)));
    }
  }

  return {
    width: w,
    height: h,
    foregroundMask,
    boundaryInwardNormalsXY,
    heightMap,
    normalsXYZ,
    normalMapRgba8,
    rimLightIntensity,
    diffuseKeyIntensity,
    interiorPixelCount,
    sorResidual,
    serverCostKrw: 0,
  };
}
