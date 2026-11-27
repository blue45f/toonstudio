/**
 * 4-필드 물리 페인트 캔버스 버퍼(`PhysicalPaintCanvasBuffer`) 및
 * 32~64가닥 멀티-브리스틀 젖은 물감 픽업·드래그 스탬프 엔진(`stampMultiBristlePhysicalDab`).
 *
 * Kubelka-Munk 광학 혼색과 절차적 종이 섬유 높이장 생성기를 함께 재내보내
 * 단일 모듈에서 3채널+종이결 물리 파이프라인 전체를 사용할 수 있다.
 */

import {
  DEFAULT_PAPER_BACKGROUND_LINEAR_RGB,
  clamp01,
  clampRange,
  generateProceduralPaperToothField,
  linearToSrgbChannel,
  mixPigmentsKubelkaMunk,
  type LinearRgbTuple,
  type PaperToothProfileId,
} from "./kubelka-munk-spectral-pigment";

export {
  DEFAULT_PAPER_BACKGROUND_LINEAR_RGB,
  clamp01,
  clampRange,
  generateProceduralPaperToothField,
  kubelkaMunkKSToReflectance,
  linearRgbToSpectralReflectance,
  linearToSrgbChannel,
  linearToSrgbRgb,
  mixColorsSrgbNaive,
  mixPigmentsKubelkaMunk,
  reflectanceToKubelkaMunkKS,
  spectralReflectanceToLinearRgb,
  srgbToLinearChannel,
  srgbToLinearRgb,
  type KubelkaMunkMixOptions,
  type LinearRgbTuple,
  type LinearRgbaTuple,
  type PaperToothProfileId,
  type SpectralReflectance7,
  type SrgbTuple,
} from "./kubelka-munk-spectral-pigment";

export interface PhysicalCanvasInitOptions {
  readonly paperProfile?: PaperToothProfileId;
  readonly paperSeed?: number;
  readonly paperScale?: number;
  readonly paperAmplitude?: number;
  readonly customPaperTooth?: Float32Array;
  readonly backgroundLinearRgb?: LinearRgbTuple;
}

export interface PhysicalCanvasPixelSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  readonly height: number;
  readonly wetness: number;
  readonly paperTooth: number;
}

export interface PhysicalCanvasDirtyRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
  readonly empty: boolean;
}

export interface PhysicalCanvasMetricsSnapshot {
  readonly width: number;
  readonly height: number;
  readonly paintedPixelCount: number;
  readonly meanAlpha: number;
  readonly meanHeight: number;
  readonly maxHeight: number;
  readonly meanWetness: number;
  readonly maxWetness: number;
  readonly paperToothMean: number;
  readonly paperToothStdDev: number;
}

export interface BristleTipState {
  readonly index: number;
  readonly offsetU: number;
  readonly offsetV: number;
  readonly radiusScale: number;
  readonly stiffness: number;
  readonly tipHeightOffset: number;
  readonly loadedRgba: [number, number, number, number];
  paintLoad: number;
  wetness: number;
}

export interface BristleBundleConfig {
  readonly bristleCount?: number;
  readonly seed?: number;
  readonly baseColorLinearRgb: LinearRgbTuple;
  readonly initialLoad?: number;
  readonly initialWetness?: number;
  readonly stiffnessMean?: number;
  readonly ridgeAmplitude?: number;
}

export interface BristleBundleState {
  readonly bristleCount: number;
  readonly seed: number;
  readonly bristles: readonly BristleTipState[];
}

export interface MultiBristleDabParams {
  readonly x: number;
  readonly y: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly radiusPx: number;
  readonly pressure: number;
  readonly opacity?: number;
  readonly thicknessDeposit?: number;
  readonly impastoPush?: number;
  readonly wetnessDeposit?: number;
  readonly pickupRate?: number;
  readonly wetMixStrength?: number;
  readonly bristleSplay?: number;
  readonly loadDepletionRate?: number;
  readonly paperToothInfluence?: number;
  readonly ridgeCarveStrength?: number;
}

export interface MultiBristleDabResult {
  readonly dirtyRect: PhysicalCanvasDirtyRect;
  readonly pixelsTouched: number;
  readonly activeBristleCount: number;
  readonly meanHeightDelta: number;
  readonly meanPickupTransfer: number;
  readonly meanRemainingLoad: number;
}

export const MIN_MULTI_BRISTLE_COUNT = 32;
export const MAX_MULTI_BRISTLE_COUNT = 64;

export function createEmptyDirtyRect(): PhysicalCanvasDirtyRect {
  return { minX: 0, minY: 0, maxX: -1, maxY: -1, width: 0, height: 0, empty: true };
}

export function makeDirtyRect(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PhysicalCanvasDirtyRect {
  if (maxX < minX || maxY < minY) return createEmptyDirtyRect();
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, empty: false };
}

export function mergeDirtyRects(
  a: PhysicalCanvasDirtyRect,
  b: PhysicalCanvasDirtyRect,
): PhysicalCanvasDirtyRect {
  if (a.empty) return b;
  if (b.empty) return a;
  return makeDirtyRect(
    Math.min(a.minX, b.minX),
    Math.min(a.minY, b.minY),
    Math.max(a.maxX, b.maxX),
    Math.max(a.maxY, b.maxY),
  );
}

/**
 * 4-필드 물리 페인트 캔버스 버퍼.
 * 색상(Linear RGBA), 임파스토 물리 높이(`heightF32`), 습윤도(`wetnessF32`), 종이 섬유 높이장(`paperToothF32`)을 관리한다.
 */
export class PhysicalPaintCanvasBuffer {
  public readonly width: number;
  public readonly height: number;
  public readonly pixelCount: number;
  public readonly paperProfile: PaperToothProfileId;
  public readonly backgroundLinearRgb: LinearRgbTuple;
  public readonly rgbaLinearF32: Float32Array;
  public readonly heightF32: Float32Array;
  public readonly wetnessF32: Float32Array;
  public readonly paperToothF32: Float32Array;

  constructor(width: number, height: number, options: PhysicalCanvasInitOptions = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`PhysicalPaintCanvasBuffer 크기는 양의 정수여야 합니다: ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.pixelCount = width * height;
    this.paperProfile = options.paperProfile ?? "cold-press-watercolor";
    this.backgroundLinearRgb = options.backgroundLinearRgb ?? DEFAULT_PAPER_BACKGROUND_LINEAR_RGB;

    this.rgbaLinearF32 = new Float32Array(this.pixelCount * 4);
    this.heightF32 = new Float32Array(this.pixelCount);
    this.wetnessF32 = new Float32Array(this.pixelCount);

    if (options.customPaperTooth) {
      if (options.customPaperTooth.length !== this.pixelCount) {
        throw new RangeError(
          `customPaperTooth 길이(${options.customPaperTooth.length})가 픽셀 수(${this.pixelCount})와 일치하지 않습니다.`,
        );
      }
      this.paperToothF32 = new Float32Array(options.customPaperTooth);
    } else {
      this.paperToothF32 = generateProceduralPaperToothField(width, height, this.paperProfile, {
        seed: options.paperSeed,
        scale: options.paperScale,
        amplitude: options.paperAmplitude,
      });
    }
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  public pixelIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  public samplePixel(x: number, y: number): PhysicalCanvasPixelSample {
    const cx = clampRange(Math.round(x), 0, this.width - 1);
    const cy = clampRange(Math.round(y), 0, this.height - 1);
    const idx = cy * this.width + cx;
    const c4 = idx * 4;
    return {
      r: this.rgbaLinearF32[c4],
      g: this.rgbaLinearF32[c4 + 1],
      b: this.rgbaLinearF32[c4 + 2],
      a: this.rgbaLinearF32[c4 + 3],
      height: this.heightF32[idx],
      wetness: this.wetnessF32[idx],
      paperTooth: this.paperToothF32[idx],
    };
  }

  public setPixel(
    x: number,
    y: number,
    patch: Partial<Omit<PhysicalCanvasPixelSample, "paperTooth">> & { readonly paperTooth?: number },
  ): void {
    if (!this.inBounds(x, y)) return;
    const idx = y * this.width + x;
    const c4 = idx * 4;
    if (patch.r !== undefined) this.rgbaLinearF32[c4] = clamp01(patch.r);
    if (patch.g !== undefined) this.rgbaLinearF32[c4 + 1] = clamp01(patch.g);
    if (patch.b !== undefined) this.rgbaLinearF32[c4 + 2] = clamp01(patch.b);
    if (patch.a !== undefined) this.rgbaLinearF32[c4 + 3] = clamp01(patch.a);
    if (patch.height !== undefined) this.heightF32[idx] = Math.max(0, patch.height);
    if (patch.wetness !== undefined) this.wetnessF32[idx] = clamp01(patch.wetness);
    if (patch.paperTooth !== undefined) this.paperToothF32[idx] = clamp01(patch.paperTooth);
  }

  public clear(options: { readonly preservePaperTooth?: boolean } = {}): void {
    this.rgbaLinearF32.fill(0);
    this.heightF32.fill(0);
    this.wetnessF32.fill(0);
    if (options.preservePaperTooth === false) this.paperToothF32.fill(0.5);
  }

  public evaporateMoisture(rate: number): number {
    const safeRate = clamp01(rate);
    let totalEvaporated = 0;
    for (let i = 0; i < this.pixelCount; i += 1) {
      const current = this.wetnessF32[i];
      if (current > 0) {
        const next = Math.max(0, current - safeRate * (0.4 + 0.6 * current));
        totalEvaporated += current - next;
        this.wetnessF32[i] = next < 0.001 ? 0 : next;
      }
    }
    return totalEvaporated;
  }

  public computeSurfaceHeightAt(x: number, y: number, paperReliefScale = 0.22): number {
    const cx = clampRange(Math.round(x), 0, this.width - 1);
    const cy = clampRange(Math.round(y), 0, this.height - 1);
    const idx = cy * this.width + cx;
    return this.heightF32[idx] + this.paperToothF32[idx] * paperReliefScale;
  }

  public toSrgbUint8Clamped(
    options: { readonly includePaperBackground?: boolean } = {},
  ): Uint8ClampedArray {
    const includeBg = options.includePaperBackground ?? true;
    const out = new Uint8ClampedArray(this.pixelCount * 4);
    const [bgR, bgG, bgB] = this.backgroundLinearRgb;
    for (let i = 0; i < this.pixelCount; i += 1) {
      const c4 = i * 4;
      const a = clamp01(this.rgbaLinearF32[c4 + 3]);
      let r = this.rgbaLinearF32[c4];
      let g = this.rgbaLinearF32[c4 + 1];
      let b = this.rgbaLinearF32[c4 + 2];
      let outAlpha = a;
      if (includeBg) {
        const paperMicroTint = 0.965 + 0.035 * this.paperToothF32[i];
        const invA = 1 - a;
        r = r * a + bgR * paperMicroTint * invA;
        g = g * a + bgG * paperMicroTint * invA;
        b = b * a + bgB * paperMicroTint * invA;
        outAlpha = 1;
      }
      out[c4] = Math.round(linearToSrgbChannel(r) * 255);
      out[c4 + 1] = Math.round(linearToSrgbChannel(g) * 255);
      out[c4 + 2] = Math.round(linearToSrgbChannel(b) * 255);
      out[c4 + 3] = Math.round(clamp01(outAlpha) * 255);
    }
    return out;
  }

  public getMetricsSnapshot(): PhysicalCanvasMetricsSnapshot {
    let paintedPixelCount = 0;
    let alphaSum = 0;
    let heightSum = 0;
    let maxHeight = 0;
    let wetSum = 0;
    let maxWetness = 0;
    let toothSum = 0;
    for (let i = 0; i < this.pixelCount; i += 1) {
      const a = this.rgbaLinearF32[i * 4 + 3];
      const h = this.heightF32[i];
      const w = this.wetnessF32[i];
      if (a > 0.002) paintedPixelCount += 1;
      alphaSum += a;
      heightSum += h;
      if (h > maxHeight) maxHeight = h;
      wetSum += w;
      if (w > maxWetness) maxWetness = w;
      toothSum += this.paperToothF32[i];
    }
    const paperToothMean = toothSum / this.pixelCount;
    let toothVar = 0;
    for (let i = 0; i < this.pixelCount; i += 1) {
      const diff = this.paperToothF32[i] - paperToothMean;
      toothVar += diff * diff;
    }
    return {
      width: this.width,
      height: this.height,
      paintedPixelCount,
      meanAlpha: alphaSum / this.pixelCount,
      meanHeight: heightSum / this.pixelCount,
      maxHeight,
      meanWetness: wetSum / this.pixelCount,
      maxWetness,
      paperToothMean,
      paperToothStdDev: Math.sqrt(toothVar / this.pixelCount),
    };
  }
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32~64가닥 개별 붓모(Bristle) 상태 묶음을 생성한다. */
export function createBristleBundleState(config: BristleBundleConfig): BristleBundleState {
  const bristleCount = Math.round(
    clampRange(config.bristleCount ?? 48, MIN_MULTI_BRISTLE_COUNT, MAX_MULTI_BRISTLE_COUNT),
  );
  const seed = Math.floor(config.seed ?? 6202);
  const rng = createMulberry32(seed);
  const initialLoad = clamp01(config.initialLoad ?? 0.92);
  const initialWetness = clamp01(config.initialWetness ?? 0.72);
  const stiffnessMean = clampRange(config.stiffnessMean ?? 0.65, 0.1, 1);
  const ridgeAmplitude = clampRange(config.ridgeAmplitude ?? 0.45, 0.05, 1.5);
  const goldenAngle = 2.399963229728653;

  const bristles: BristleTipState[] = [];
  for (let i = 0; i < bristleCount; i += 1) {
    const radial = Math.sqrt((i + 0.5) / bristleCount);
    const angle = i * goldenAngle + (rng() - 0.5) * 0.24;
    const jitterR = clampRange(radial + (rng() - 0.5) * 0.07, 0.04, 0.98);
    bristles.push({
      index: i,
      offsetU: Math.cos(angle) * jitterR * 0.78,
      offsetV: Math.sin(angle) * jitterR,
      radiusScale: 0.16 + rng() * 0.14,
      stiffness: clampRange(stiffnessMean + (rng() - 0.5) * 0.34, 0.15, 1),
      tipHeightOffset: (rng() - 0.5) * 2 * ridgeAmplitude,
      loadedRgba: [
        clamp01(config.baseColorLinearRgb[0]),
        clamp01(config.baseColorLinearRgb[1]),
        clamp01(config.baseColorLinearRgb[2]),
        1,
      ],
      paintLoad: clamp01(initialLoad * (0.88 + rng() * 0.2)),
      wetness: clamp01(initialWetness * (0.9 + rng() * 0.16)),
    });
  }
  return { bristleCount, seed, bristles };
}

export function reloadBristleBundle(
  state: BristleBundleState,
  colorLinearRgb: LinearRgbTuple,
  load = 0.95,
  wetness = 0.75,
): void {
  const safeLoad = clamp01(load);
  const safeWet = clamp01(wetness);
  for (let i = 0; i < state.bristles.length; i += 1) {
    const bristle = state.bristles[i];
    bristle.loadedRgba[0] = clamp01(colorLinearRgb[0]);
    bristle.loadedRgba[1] = clamp01(colorLinearRgb[1]);
    bristle.loadedRgba[2] = clamp01(colorLinearRgb[2]);
    bristle.loadedRgba[3] = 1;
    bristle.paintLoad = safeLoad;
    bristle.wetness = safeWet;
  }
}

/**
 * 32~64가닥 멀티-브리스틀 젖은 물감 픽업·드래그 스탬프 엔진.
 *
 * 각 붓모가 캔버스의 젖은 물감을 점진적으로 픽업(Dirty-Brush Contamination)해 Kubelka-Munk 혼색으로
 * `loadedRgba`를 갱신하며, 동시에 종이 결과 붓모 강성에 따라 임파스토 이랑(Ridge)과 골(Furrow)을 조각한다.
 */
export function stampMultiBristlePhysicalDab(
  buffer: PhysicalPaintCanvasBuffer,
  bristleState: BristleBundleState,
  params: MultiBristleDabParams,
): MultiBristleDabResult {
  const pressure = clamp01(params.pressure);
  const radiusPx = Math.max(1.2, params.radiusPx);
  const opacity = clamp01(params.opacity ?? 0.85);
  const thicknessDeposit = Math.max(0, params.thicknessDeposit ?? 0.42);
  const impastoPush = clampRange(params.impastoPush ?? 0.25, 0, 0.85);
  const wetnessDeposit = clamp01(params.wetnessDeposit ?? 0.65);
  const pickupRate = clamp01(params.pickupRate ?? 0.42);
  const wetMixStrength = clamp01(params.wetMixStrength ?? 0.75);
  const bristleSplay = clampRange(params.bristleSplay ?? 0.35, 0, 1);
  const loadDepletionRate = clampRange(params.loadDepletionRate ?? 0.028, 0, 0.35);
  const paperToothInfluence = clamp01(params.paperToothInfluence ?? 0.35);
  const ridgeCarveStrength = clampRange(params.ridgeCarveStrength ?? 0.38, 0, 1);

  const dirLen = Math.hypot(params.dirX, params.dirY);
  const ux = dirLen > 1e-5 ? params.dirX / dirLen : 1;
  const uy = dirLen > 1e-5 ? params.dirY / dirLen : 0;
  const vx = -uy;
  const vy = ux;

  const splayScale = 0.75 + pressure * (0.45 + bristleSplay * 0.45);
  const activeCount = Math.max(
    1,
    Math.min(
      bristleState.bristles.length,
      Math.round(bristleState.bristles.length * (0.42 + 0.58 * Math.pow(pressure, 0.65))),
    ),
  );

  let minX = buffer.width;
  let minY = buffer.height;
  let maxX = -1;
  let maxY = -1;
  let pixelsTouched = 0;
  let heightDeltaAccum = 0;
  let pickupTransferAccum = 0;
  let pickupSamples = 0;

  for (let bIdx = 0; bIdx < activeCount; bIdx += 1) {
    const bristle = bristleState.bristles[bIdx];
    const worldU = bristle.offsetU * radiusPx * splayScale;
    const worldV = bristle.offsetV * radiusPx * splayScale;
    const bx = params.x + ux * worldU + vx * worldV;
    const by = params.y + uy * worldU + vy * worldV;
    const bRadius = Math.max(0.85, radiusPx * bristle.radiusScale * (0.72 + 0.45 * pressure));

    const xStart = Math.max(0, Math.floor(bx - bRadius - 1));
    const xEnd = Math.min(buffer.width - 1, Math.ceil(bx + bRadius + 1));
    const yStart = Math.max(0, Math.floor(by - bRadius - 1));
    const yEnd = Math.min(buffer.height - 1, Math.ceil(by + bRadius + 1));
    if (xStart > xEnd || yStart > yEnd) continue;

    // 1단계: 젖은 캔버스 물감 픽업 (단일 스텝에서 붓모 저장고가 즉시 치환되지 않도록 0.24 배율로 점진 혼색)
    const cx = clampRange(Math.round(bx), 0, buffer.width - 1);
    const cy = clampRange(Math.round(by), 0, buffer.height - 1);
    const cIdx = cy * buffer.width + cx;
    const c4 = cIdx * 4;
    const underAlpha = buffer.rgbaLinearF32[c4 + 3];
    const underWet = buffer.wetnessF32[cIdx];

    if (underAlpha > 0.03 && pickupRate > 0) {
      const wetnessTransfer = 0.03 + 0.97 * Math.max(underWet, bristle.wetness * underWet);
      const effectivePickup = clampRange(
        pickupRate * 0.24 * wetnessTransfer * underAlpha * (0.55 + 0.45 * pressure),
        0,
        0.38,
      );
      if (effectivePickup > 0.002) {
        const mixedTip = mixPigmentsKubelkaMunk(
          [bristle.loadedRgba[0], bristle.loadedRgba[1], bristle.loadedRgba[2]],
          [buffer.rgbaLinearF32[c4], buffer.rgbaLinearF32[c4 + 1], buffer.rgbaLinearF32[c4 + 2]],
          effectivePickup,
        );
        bristle.loadedRgba[0] = mixedTip[0];
        bristle.loadedRgba[1] = mixedTip[1];
        bristle.loadedRgba[2] = mixedTip[2];
        bristle.paintLoad = clamp01(bristle.paintLoad + effectivePickup * underAlpha * 0.28);
        bristle.wetness = clamp01(bristle.wetness * 0.72 + underWet * 0.28);
        pickupTransferAccum += effectivePickup;
        pickupSamples += 1;
      }
    }

    // 2단계: 안료 침착 + 임파스토 이랑/골 조각 + 진행 방향 밀어내기
    const invRadius = 1 / bRadius;
    const dryBreakupThreshold = clampRange((1 - bristle.paintLoad) * 0.72, 0, 0.78);

    for (let py = yStart; py <= yEnd; py += 1) {
      const dy = py - by;
      for (let px = xStart; px <= xEnd; px += 1) {
        const dx = px - bx;
        const distNorm = Math.hypot(dx, dy) * invRadius;
        if (distNorm >= 1) continue;

        const idx = py * buffer.width + px;
        const p4 = idx * 4;
        const tooth = buffer.paperToothF32[idx];
        const dryContact =
          dryBreakupThreshold > 0.05
            ? clamp01((tooth - dryBreakupThreshold) / Math.max(0.15, 1 - dryBreakupThreshold))
            : 1;
        const toothMod = 1 - paperToothInfluence + paperToothInfluence * (0.42 + 0.78 * tooth);
        const radialFalloff = Math.pow(1 - distNorm * distNorm, 1.35);
        const depositAlpha = clamp01(
          radialFalloff *
            opacity *
            (0.28 + 0.72 * pressure) *
            (0.18 + 0.82 * bristle.paintLoad) *
            toothMod *
            dryContact,
        );
        if (depositAlpha <= 0.001) continue;

        const dstA = buffer.rgbaLinearF32[p4 + 3];
        const dstWet = buffer.wetnessF32[idx];
        const tipColor: LinearRgbTuple = [
          bristle.loadedRgba[0],
          bristle.loadedRgba[1],
          bristle.loadedRgba[2],
        ];
        let outR = tipColor[0];
        let outG = tipColor[1];
        let outB = tipColor[2];
        const outA = clamp01(dstA + depositAlpha * (1 - dstA * 0.85));

        if (dstA > 0.002) {
          const mixWeight = clamp01(
            depositAlpha / Math.max(0.01, depositAlpha + dstA * (0.45 + 0.55 * dstWet * wetMixStrength)),
          );
          const opticalMix = mixPigmentsKubelkaMunk(
            [buffer.rgbaLinearF32[p4], buffer.rgbaLinearF32[p4 + 1], buffer.rgbaLinearF32[p4 + 2]],
            tipColor,
            mixWeight,
          );
          outR = opticalMix[0];
          outG = opticalMix[1];
          outB = opticalMix[2];
        }

        buffer.rgbaLinearF32[p4] = outR;
        buffer.rgbaLinearF32[p4 + 1] = outG;
        buffer.rgbaLinearF32[p4 + 2] = outB;
        buffer.rgbaLinearF32[p4 + 3] = outA;

        const ridgeProfile =
          (1 - ridgeCarveStrength * 0.65 * Math.exp(-distNorm * distNorm * 6)) *
            (0.65 + 0.65 * distNorm) +
          bristle.tipHeightOffset * 0.45;
        const addedHeight = Math.max(
          0,
          thicknessDeposit *
            radialFalloff *
            (0.35 + 0.65 * pressure) *
            (0.25 + 0.75 * bristle.paintLoad) *
            (0.55 + 0.45 * bristle.stiffness) *
            Math.max(0.15, ridgeProfile),
        );

        const prevHeight = buffer.heightF32[idx];
        const pushedHeight = prevHeight * dstWet * impastoPush * radialFalloff * 0.22;
        const nextHeight = Math.max(0, prevHeight - pushedHeight + addedHeight);
        buffer.heightF32[idx] = nextHeight;
        heightDeltaAccum += nextHeight - prevHeight;

        if (pushedHeight > 0.0005) {
          const fwdX = Math.round(px + ux);
          const fwdY = Math.round(py + uy);
          if (buffer.inBounds(fwdX, fwdY)) {
            buffer.heightF32[fwdY * buffer.width + fwdX] += pushedHeight * 0.88;
          }
        }

        buffer.wetnessF32[idx] = clamp01(
          Math.max(dstWet, wetnessDeposit * radialFalloff * bristle.wetness * (0.5 + 0.5 * pressure)),
        );

        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
        pixelsTouched += 1;
      }
    }

    bristle.paintLoad = clamp01(bristle.paintLoad - loadDepletionRate * (0.45 + 0.55 * pressure));
  }

  let loadSum = 0;
  for (let i = 0; i < bristleState.bristles.length; i += 1) {
    loadSum += bristleState.bristles[i].paintLoad;
  }
  return {
    dirtyRect: makeDirtyRect(minX, minY, maxX, maxY),
    pixelsTouched,
    activeBristleCount: activeCount,
    meanHeightDelta: pixelsTouched > 0 ? heightDeltaAccum / pixelsTouched : 0,
    meanPickupTransfer: pickupSamples > 0 ? pickupTransferAccum / pickupSamples : 0,
    meanRemainingLoad: loadSum / bristleState.bristles.length,
  };
}
