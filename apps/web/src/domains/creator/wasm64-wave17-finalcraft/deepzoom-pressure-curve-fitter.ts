/**
 * DeepZoom(DZI) / IIIF 호환 정적 다중 해상도 타일 피라미드 익스포터 및
 * 작가 필압 히스토그램·속도 상관 기반 인체공학 단조 베지어 곡선 피터.
 *
 * - 외부 서버 연산 비용 ₩0, 순수 결정론 수치·래스터 슬라이싱 엔진.
 * - 초광폭·초장축 일러스트를 `level 0..L`(`256x256` + `1px` 경계 중첩) 정적 타일 피라미드와
 *   DZI XML / IIIF Image API 3.0 `level0` 매니페스트로 분할한다.
 * - 작가의 원시 필압 분포(`p10, p50, p90`)와 속도 상관을 분석해 Bernstein 비음수 조건으로
 *   전 구간 단조성(`f(0)=0, f(1)=1, f'(p) >= 0`)이 보장되는 3차 베지어 필압 곡선을 피팅한다.
 */

export interface PressureCurvePoint2D { readonly x: number; readonly y: number }

export interface MonotonicCubicBezier2D {
  readonly p0: PressureCurvePoint2D;
  readonly p1: PressureCurvePoint2D;
  readonly p2: PressureCurvePoint2D;
  readonly p3: PressureCurvePoint2D;
}

const EPSILON = 1e-9;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ============================================================================
// 1. DeepZoom(DZI) / IIIF 호환 정적 다중 해상도 타일 피라미드 익스포터
// ============================================================================

export type DeepZoomTileFormat = "webp" | "png" | "jpg";

export interface DeepZoomPyramidInput {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  /** 선택적 원본 RGBA 버퍼(`width * height * 4`). 제공 시 레벨별 다운샘플링과 실제 타일 슬라이싱을 수행한다. */
  readonly sourceRgba?: Uint8ClampedArray | Uint8Array;
  /** 기본 타일 코어 크기(기본값 `256`). */
  readonly tileSize?: number;
  /** 인접 타일 간 경계 이음새 방지 중첩 픽셀(기본값 `1`). */
  readonly overlap?: number;
  readonly format?: DeepZoomTileFormat;
  /** IIIF 정적 서비스 기본 URL(기본값 `"https://cdn.toonstudio.cloud/dzi"`). */
  readonly baseStaticUrl?: string;
}

export interface DeepZoomTileSlice {
  readonly level: number;
  readonly column: number;
  readonly row: number;
  readonly relativePath: string;
  /** 해당 레벨 좌표계 내 중첩(`overlap`)이 반영된 시작·크기(px). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly contentHashHex?: string;
  readonly rgbaPixels?: Uint8ClampedArray;
}

export interface DeepZoomLevelSummary {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly tileCount: number;
  /** 원본 대비 축소 배율(`2^(maxLevel - level)`). */
  readonly scaleFactor: number;
}

export interface IiifImageApi3Manifest {
  readonly "@context": "http://iiif.io/api/image/3/context.json";
  readonly id: string;
  readonly type: "ImageService3";
  readonly protocol: "http://iiif.io/api/image";
  readonly profile: "level0";
  readonly width: number;
  readonly height: number;
  readonly sizes: readonly { readonly width: number; readonly height: number }[];
  readonly tiles: readonly {
    readonly width: number;
    readonly height: number;
    readonly scaleFactors: readonly number[];
  }[];
}

export interface DeepZoomPyramidResult {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly overlap: number;
  readonly maxLevel: number;
  readonly totalTileCount: number;
  readonly levels: readonly DeepZoomLevelSummary[];
  readonly tiles: readonly DeepZoomTileSlice[];
  readonly dziXml: string;
  readonly dziJsonManifest: string;
  readonly iiifInfo: IiifImageApi3Manifest;
  readonly iiifInfoJson: string;
  readonly serverCostKrw: 0;
}

function sanitizeAssetSlug(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charCodeAt(i);
    const isAlphaNum =
      (ch >= 48 && ch <= 57)
      || (ch >= 65 && ch <= 90)
      || (ch >= 97 && ch <= 122)
      || ch === 45
      || ch === 95;
    out += isAlphaNum ? raw[i] : "-";
  }
  return out.length > 0 ? out : "illustration";
}

function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1;
  return url.slice(0, end);
}

function fnv1a32Hex(bytes: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function downsampleRgbaHalfBox(
  src: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
): { readonly rgba: Uint8ClampedArray; readonly dstW: number; readonly dstH: number } {
  const dstW = Math.max(1, Math.ceil(srcW / 2));
  const dstH = Math.max(1, Math.ceil(srcH / 2));
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y += 1) {
    const sy0 = y * 2;
    const sy1 = Math.min(srcH - 1, sy0 + 1);
    const yCount = sy0 + 1 < srcH ? 2 : 1;

    for (let x = 0; x < dstW; x += 1) {
      const sx0 = x * 2;
      const sx1 = Math.min(srcW - 1, sx0 + 1);
      const xCount = sx0 + 1 < srcW ? 2 : 1;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let sampleCount = 0;

      for (let ry = 0; ry < yCount; ry += 1) {
        const py = ry === 0 ? sy0 : sy1;
        for (let rx = 0; rx < xCount; rx += 1) {
          const px = rx === 0 ? sx0 : sx1;
          const off = (py * srcW + px) * 4;
          rSum += src[off] ?? 0;
          gSum += src[off + 1] ?? 0;
          bSum += src[off + 2] ?? 0;
          aSum += src[off + 3] ?? 0;
          sampleCount += 1;
        }
      }

      const dOff = (y * dstW + x) * 4;
      dst[dOff] = Math.round(rSum / sampleCount);
      dst[dOff + 1] = Math.round(gSum / sampleCount);
      dst[dOff + 2] = Math.round(bSum / sampleCount);
      dst[dOff + 3] = Math.round(aSum / sampleCount);
    }
  }
  return { rgba: dst, dstW, dstH };
}

/**
 * 초광폭·초장축 일러스트를 DeepZoom(`level 0..L`, `256x256` + `1px` 중첩) 타일 피라미드와
 * DZI XML / IIIF Image API 3.0 `level0` 정적 매니페스트로 분할한다.
 */
export function buildDeepZoomTilePyramid(input: DeepZoomPyramidInput): DeepZoomPyramidResult {
  const { width, height } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`유효한 원본 해상도가 필요합니다: ${width}x${height}`);
  }
  if (input.sourceRgba && input.sourceRgba.length < width * height * 4) {
    throw new RangeError("sourceRgba 길이가 원본 해상도보다 작습니다.");
  }

  const assetSlug = sanitizeAssetSlug(input.assetId);
  const tileSize = Math.max(16, Math.floor(input.tileSize ?? 256));
  const overlap = clamp(Math.floor(input.overlap ?? 1), 0, 16);
  const format: DeepZoomTileFormat = input.format ?? "webp";
  const baseStaticUrl = trimTrailingSlashes(
    input.baseStaticUrl ?? "https://cdn.toonstudio.cloud/dzi",
  );

  const maxDim = Math.max(width, height);
  const maxLevel = maxDim <= 1 ? 0 : Math.ceil(Math.log2(maxDim));

  const levelDims: { readonly level: number; readonly w: number; readonly h: number }[] = new Array(
    maxLevel + 1,
  );
  let curW = width;
  let curH = height;
  for (let lv = maxLevel; lv >= 0; lv -= 1) {
    levelDims[lv] = { level: lv, w: curW, h: curH };
    curW = Math.max(1, Math.ceil(curW / 2));
    curH = Math.max(1, Math.ceil(curH / 2));
  }

  const levelBuffers = new Map<number, Uint8ClampedArray | Uint8Array>();
  if (input.sourceRgba) {
    levelBuffers.set(maxLevel, input.sourceRgba);
    let prevBuf: Uint8ClampedArray | Uint8Array = input.sourceRgba;
    let prevW = width;
    let prevH = height;
    for (let lv = maxLevel - 1; lv >= 0; lv -= 1) {
      const down = downsampleRgbaHalfBox(prevBuf, prevW, prevH);
      levelBuffers.set(lv, down.rgba);
      prevBuf = down.rgba;
      prevW = down.dstW;
      prevH = down.dstH;
    }
  }

  const levels: DeepZoomLevelSummary[] = [];
  const tiles: DeepZoomTileSlice[] = [];
  const iiifScaleFactors: number[] = [];

  for (let lv = 0; lv <= maxLevel; lv += 1) {
    const dim = levelDims[lv];
    if (!dim) continue;
    const lw = dim.w;
    const lh = dim.h;
    const columns = Math.max(1, Math.ceil(lw / tileSize));
    const rows = Math.max(1, Math.ceil(lh / tileSize));
    const scaleFactor = Math.pow(2, maxLevel - lv);
    if (scaleFactor <= maxDim) iiifScaleFactors.push(scaleFactor);

    levels.push({
      level: lv,
      width: lw,
      height: lh,
      columns,
      rows,
      tileCount: columns * rows,
      scaleFactor,
    });

    const lvBuf = levelBuffers.get(lv);

    for (let row = 0; row < rows; row += 1) {
      const coreY0 = row * tileSize;
      const coreY1 = Math.min(lh, (row + 1) * tileSize);
      const y0 = Math.max(0, coreY0 - (row > 0 ? overlap : 0));
      const y1 = Math.min(lh, coreY1 + (row < rows - 1 ? overlap : 0));
      const twHeight = y1 - y0;

      for (let col = 0; col < columns; col += 1) {
        const coreX0 = col * tileSize;
        const coreX1 = Math.min(lw, (col + 1) * tileSize);
        const x0 = Math.max(0, coreX0 - (col > 0 ? overlap : 0));
        const x1 = Math.min(lw, coreX1 + (col < columns - 1 ? overlap : 0));
        const twWidth = x1 - x0;

        let rgbaPixels: Uint8ClampedArray | undefined;
        let contentHashHex: string | undefined;

        if (lvBuf) {
          rgbaPixels = new Uint8ClampedArray(twWidth * twHeight * 4);
          for (let ty = 0; ty < twHeight; ty += 1) {
            const srcRowStart = ((y0 + ty) * lw + x0) * 4;
            const dstRowStart = ty * twWidth * 4;
            const rowByteLen = twWidth * 4;
            for (let b = 0; b < rowByteLen; b += 1) {
              rgbaPixels[dstRowStart + b] = lvBuf[srcRowStart + b] ?? 0;
            }
          }
          contentHashHex = fnv1a32Hex(rgbaPixels);
        }

        tiles.push({
          level: lv,
          column: col,
          row,
          relativePath: `${assetSlug}_files/${lv}/${col}_${row}.${format}`,
          x: x0,
          y: y0,
          width: twWidth,
          height: twHeight,
          contentHashHex,
          rgbaPixels,
        });
      }
    }
  }

  iiifScaleFactors.sort((a, b) => a - b);

  const dziXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="${format}" Overlap="${overlap}" TileSize="${tileSize}">`,
    `  <Size Width="${width}" Height="${height}"/>`,
    "</Image>",
  ].join("\n");

  const iiifInfo: IiifImageApi3Manifest = {
    "@context": "http://iiif.io/api/image/3/context.json",
    id: `${baseStaticUrl}/${assetSlug}`,
    type: "ImageService3",
    protocol: "http://iiif.io/api/image",
    profile: "level0",
    width,
    height,
    sizes: levels.map((lv) => ({ width: lv.width, height: lv.height })),
    tiles: [{ width: tileSize, height: tileSize, scaleFactors: iiifScaleFactors }],
  };

  const dziJsonManifest = JSON.stringify({
    schema: "toonstudio.dzi.static-pyramid.v1",
    assetId: assetSlug,
    width,
    height,
    tileSize,
    overlap,
    format,
    maxLevel,
    totalTileCount: tiles.length,
    levels,
    serverCostKrw: 0,
  });

  return {
    assetId: assetSlug,
    width,
    height,
    tileSize,
    overlap,
    maxLevel,
    totalTileCount: tiles.length,
    levels,
    tiles,
    dziXml,
    dziJsonManifest,
    iiifInfo,
    iiifInfoJson: JSON.stringify(iiifInfo),
    serverCostKrw: 0,
  };
}

// ============================================================================
// 2. 작가 필압 히스토그램·속도 상관 기반 인체공학 단조 베지어 곡선 피터
// ============================================================================

export type StylusHandProfile = "light-handed" | "heavy-handed" | "narrow-range" | "balanced";

export interface RawStylusSample {
  /** 정규화 원시 필압(`0..1`). */
  readonly pressure: number;
  /** 선택적 스트로크 이동 속도(px/s). */
  readonly velocityPxPerSec?: number;
}

export interface ErgonomicPressureFitInput {
  readonly samples?: readonly RawStylusSample[];
  /** `[0, 1]` 균등 구간 빈도 배열. `samples`가 없을 때 분위수를 추정한다. */
  readonly histogramBins?: readonly number[];
  /** 직접 측정된 분위수 요약(`0 < p10 <= p50 <= p90 < 1`). */
  readonly quantiles?: {
    readonly p10: number;
    readonly p50: number;
    readonly p90: number;
    readonly velocityPressureCorrelation?: number;
  };
}

export interface ErgonomicPressureCurveResult {
  readonly handProfile: StylusHandProfile;
  readonly labelKo: string;
  readonly measuredQuantiles: {
    readonly p10: number;
    readonly p50: number;
    readonly p90: number;
    readonly velocityPressureCorrelation: number;
  };
  /** `P0=(0,0), P1=(x1,y1), P2=(x2,y2), P3=(1,1)` (`0 < x1 <= x2 < 1`, `0 <= y1 <= y2 <= 1`). */
  readonly cubicControlPoints: MonotonicCubicBezier2D;
  /** 보조 거듭제곱 감마 지수(`g(p) = p^gamma`). */
  readonly powerExponentGamma: number;
  /** Wasm64/WebGPU 브러시 셰이더 즉시 바인딩용 256단계 단조 순람표(`0..1`). */
  readonly lut256: Float32Array;
  readonly estimatedStrainReductionRatio: number;
  readonly evaluate: (rawPressure: number) => number;
  readonly evaluateDerivative: (rawPressure: number) => number;
  readonly serverCostKrw: 0;
}

function extractPressureQuantiles(input: ErgonomicPressureFitInput): {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly corr: number;
} {
  if (input.quantiles) {
    const p10 = clamp(input.quantiles.p10, 0.01, 0.95);
    const p50 = clamp(input.quantiles.p50, p10, 0.97);
    const p90 = clamp(input.quantiles.p90, p50, 0.99);
    const corr = clamp(input.quantiles.velocityPressureCorrelation ?? 0, -1, 1);
    return { p10, p50, p90, corr };
  }

  if (input.samples && input.samples.length > 0) {
    const pressures = input.samples.map((s) => clamp(s.pressure, 0, 1)).sort((a, b) => a - b);
    const pick = (q: number): number => {
      const pos = q * (pressures.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.min(pressures.length - 1, lo + 1);
      return lerp(pressures[lo] ?? 0.5, pressures[hi] ?? 0.5, pos - lo);
    };

    let sumP = 0;
    let sumV = 0;
    let nVel = 0;
    for (const s of input.samples) {
      if (s.velocityPxPerSec !== undefined && Number.isFinite(s.velocityPxPerSec)) {
        sumP += clamp(s.pressure, 0, 1);
        sumV += s.velocityPxPerSec;
        nVel += 1;
      }
    }

    let corr = 0;
    if (nVel >= 3) {
      const meanP = sumP / nVel;
      const meanV = sumV / nVel;
      let cov = 0;
      let varP = 0;
      let varV = 0;
      for (const s of input.samples) {
        if (s.velocityPxPerSec !== undefined && Number.isFinite(s.velocityPxPerSec)) {
          const dp = clamp(s.pressure, 0, 1) - meanP;
          const dv = s.velocityPxPerSec - meanV;
          cov += dp * dv;
          varP += dp * dp;
          varV += dv * dv;
        }
      }
      const denom = Math.sqrt(varP * varV);
      corr = denom > EPSILON ? clamp(cov / denom, -1, 1) : 0;
    }
    return {
      p10: clamp(pick(0.1), 0.01, 0.95),
      p50: clamp(pick(0.5), 0.02, 0.97),
      p90: clamp(pick(0.9), 0.04, 0.99),
      corr,
    };
  }

  if (input.histogramBins && input.histogramBins.length >= 2) {
    const bins = input.histogramBins.map((v) => Math.max(0, v));
    const total = bins.reduce((acc, v) => acc + v, 0);
    if (total > 0) {
      const pickHist = (q: number): number => {
        const target = q * total;
        let acc = 0;
        for (let i = 0; i < bins.length; i += 1) {
          const count = bins[i] ?? 0;
          if (acc + count >= target) {
            const frac = count > 0 ? (target - acc) / count : 0.5;
            return clamp((i + frac) / bins.length, 0.01, 0.99);
          }
          acc += count;
        }
        return 0.99;
      };
      const p10 = pickHist(0.1);
      const p50 = Math.max(p10, pickHist(0.5));
      const p90 = Math.max(p50, pickHist(0.9));
      return { p10, p50, p90, corr: 0 };
    }
  }

  return { p10: 0.15, p50: 0.5, p90: 0.85, corr: 0 };
}

function solveMonotonicBezierTForX(x1: number, x2: number, targetX: number): number {
  if (targetX <= 0) return 0;
  if (targetX >= 1) return 1;

  let lo = 0;
  let hi = 1;
  let t = targetX;
  for (let iter = 0; iter < 18; iter += 1) {
    const u = 1 - t;
    const x = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
    const err = x - targetX;
    if (Math.abs(err) <= 1e-12) break;
    if (err < 0) lo = t;
    else hi = t;

    const dxDt = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
    const next = dxDt > 1e-12 ? t - err / dxDt : 0.5 * (lo + hi);
    t = next > lo && next < hi ? next : 0.5 * (lo + hi);
  }
  return t;
}

/**
 * 작가의 원시 필압 분포(`p10, p50, p90`)와 속도 상관을 분석해 `f(0)=0, f(1)=1, f'(p) >= 0`이
 * 전 구간 보장되는 인체공학 단조 3차 베지어 필압 응답 곡선을 피팅한다.
 */
export function fitErgonomicPressureResponseCurve(
  input: ErgonomicPressureFitInput,
): ErgonomicPressureCurveResult {
  const { p10, p50, p90, corr } = extractPressureQuantiles(input);
  const span = Math.max(0.04, p90 - p10);

  let handProfile: StylusHandProfile = "balanced";
  let labelKo = "균형 잡힌 표준 필압 곡선";
  if (span < 0.3 && p50 >= 0.37 && p50 <= 0.62) {
    handProfile = "narrow-range";
    labelKo = "협대역 필압 다이나믹 레인지 확장 곡선";
  } else if (p50 < 0.37 || p90 < 0.62) {
    handProfile = "light-handed";
    labelKo = "저필압 손목 보호 부스트 곡선";
  } else if (p50 > 0.62 || p10 > 0.3) {
    handProfile = "heavy-handed";
    labelKo = "고필압 세밀 선폭 확보 완충 곡선";
  } else if (span < 0.32) {
    handProfile = "narrow-range";
    labelKo = "협대역 필압 다이나믹 레인지 확장 곡선";
  }

  const velocityToeBoost = clamp(-corr * 0.035, -0.03, 0.04);
  const targetY10 = clamp(0.12 + velocityToeBoost, 0.05, 0.24);
  const targetY50 = 0.5;
  const targetY90 = clamp(0.88 + velocityToeBoost * 0.5, 0.78, 0.95);
  const powerExponentGamma = clamp(Math.log(0.5) / Math.log(clamp(p50, 0.08, 0.92)), 0.25, 3.6);

  let bestX1 = clamp(p10 * 1.15 + 0.04, 0.06, 0.78);
  let bestX2 = clamp(Math.max(bestX1 + 0.02, p90 * 0.94), 0.14, 0.94);
  let bestY1 = clamp(targetY10 * 1.6, 0.02, 0.85);
  let bestY2 = clamp(Math.max(bestY1, targetY90 * 1.02), bestY1, 0.99);
  let bestLoss = Number.POSITIVE_INFINITY;

  const evalCandidateLoss = (cx1: number, cy1: number, cx2: number, cy2: number): number => {
    const evalY = (px: number): number => {
      const t = solveMonotonicBezierTForX(cx1, cx2, px);
      const u = 1 - t;
      return 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t;
    };
    const e10 = evalY(p10) - targetY10;
    const e50 = evalY(p50) - targetY50;
    const e90 = evalY(p90) - targetY90;
    const smoothReg = 0.008 * ((cy1 - cx1) * (cy1 - cx1) + (cy2 - cx2) * (cy2 - cx2));
    return e10 * e10 * 1.2 + e50 * e50 * 2.0 + e90 * e90 * 1.4 + smoothReg;
  };

  for (let ix1 = 0; ix1 <= 12; ix1 += 1) {
    const cx1 = clamp(lerp(0.06, 0.78, ix1 / 12), 0.06, 0.88);
    for (let ix2 = 0; ix2 <= 12; ix2 += 1) {
      const cx2 = clamp(lerp(cx1 + 0.01, 0.94, ix2 / 12), cx1 + 0.01, 0.94);
      const t10 = solveMonotonicBezierTForX(cx1, cx2, p10);
      const t50 = solveMonotonicBezierTForX(cx1, cx2, p50);
      const t90 = solveMonotonicBezierTForX(cx1, cx2, p90);

      const rows: readonly (readonly [number, number, number, number])[] = [
        [3 * (1 - t10) * (1 - t10) * t10, 3 * (1 - t10) * t10 * t10, targetY10 - t10 * t10 * t10, 1.2],
        [3 * (1 - t50) * (1 - t50) * t50, 3 * (1 - t50) * t50 * t50, targetY50 - t50 * t50 * t50, 2.0],
        [3 * (1 - t90) * (1 - t90) * t90, 3 * (1 - t90) * t90 * t90, targetY90 - t90 * t90 * t90, 1.4],
      ];

      let a11 = 0.01;
      let a12 = 0;
      let a22 = 0.01;
      let b1 = 0.01 * cx1;
      let b2 = 0.01 * cx2;
      for (const [c1, c2, rhs, w] of rows) {
        a11 += w * c1 * c1;
        a12 += w * c1 * c2;
        a22 += w * c2 * c2;
        b1 += w * c1 * rhs;
        b2 += w * c2 * rhs;
      }

      const det = a11 * a22 - a12 * a12;
      let cy1 = clamp(det > EPSILON ? (b1 * a22 - b2 * a12) / det : cx1, 0, 1);
      let cy2 = clamp(det > EPSILON ? (a11 * b2 - a12 * b1) / det : cx2, 0, 1);
      if (cy1 > cy2) {
        const avg = clamp(0.5 * (cy1 + cy2), 0, 1);
        cy1 = avg;
        cy2 = avg;
      }

      const loss = evalCandidateLoss(cx1, cy1, cx2, cy2);
      if (loss < bestLoss) {
        bestLoss = loss;
        bestX1 = cx1;
        bestX2 = cx2;
        bestY1 = cy1;
        bestY2 = cy2;
      }
    }
  }

  const cubicControlPoints: MonotonicCubicBezier2D = {
    p0: { x: 0, y: 0 },
    p1: { x: bestX1, y: bestY1 },
    p2: { x: bestX2, y: bestY2 },
    p3: { x: 1, y: 1 },
  };

  const evaluate = (rawPressure: number): number => {
    if (rawPressure <= 0) return 0;
    if (rawPressure >= 1) return 1;
    const t = solveMonotonicBezierTForX(bestX1, bestX2, rawPressure);
    const u = 1 - t;
    return clamp(3 * u * u * t * bestY1 + 3 * u * t * t * bestY2 + t * t * t, 0, 1);
  };

  const evaluateDerivative = (rawPressure: number): number => {
    const p = clamp(rawPressure, 0, 1);
    const t = solveMonotonicBezierTForX(bestX1, bestX2, p);
    const u = 1 - t;
    const dxDt = 3 * u * u * bestX1 + 6 * u * t * (bestX2 - bestX1) + 3 * t * t * (1 - bestX2);
    const dyDt = 3 * u * u * bestY1 + 6 * u * t * (bestY2 - bestY1) + 3 * t * t * (1 - bestY2);
    return dxDt > EPSILON ? Math.max(0, dyDt / dxDt) : 0;
  };

  const lut256 = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lut256[i] = evaluate(i / 255);

  return {
    handProfile,
    labelKo,
    measuredQuantiles: { p10, p50, p90, velocityPressureCorrelation: corr },
    cubicControlPoints,
    powerExponentGamma,
    lut256,
    estimatedStrainReductionRatio: clamp(Math.max(0, 0.88 - p90) / 0.88, 0, 0.75),
    evaluate,
    evaluateDerivative,
    serverCostKrw: 0,
  };
}
