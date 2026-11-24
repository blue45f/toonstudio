/**
 * WASM-SIMD128 + Kubelka-Munk 8-밴드 스펙트럴 물리 혼색 실행 커널.
 *
 * - 실제 WebAssembly SIMD128(`v128` `f32x4`) 8-밴드 K/S 가중 합산 커널을 인스턴스화하고,
 *   미지원 호스트에서는 동치 `Float32Array` SIMD-정렬 경로로 폴백한다.
 * - 다중 레이어 물리 혼색, 배치 브러시 스탬프 블렌딩, 습윤 백런·안료 침전 RGBA 프리뷰를 제공한다.
 */

import {
  buildSrgbOpticalColor,
  computeCiede2000,
  computeDeltaE76,
  computeKubelkaMunkLayerReflectance,
  getPigmentSpectralEntry,
  SPECTRAL_BAND_COUNT,
  spectralToSrgb,
  srgbToLinearChannel,
  type KubelkaMunkMixOptions,
  type KubelkaMunkMixResult,
  type PigmentLayerSpec,
  type PigmentMixBackend,
  type PigmentPresetId,
  type SimdPigmentBatchResult,
  type WasmSimdPigmentRuntimeInfo,
} from "./kubelka-munk-optics";

export {
  PIGMENT_PRESETS,
  SPECTRAL_BAND_COUNT,
  SPECTRAL_BAND_NM,
  computeCiede2000,
  computeDeltaE76,
  findPigmentPreset,
  getPigmentBaseSrgb,
  ksToReflectance,
  reflectanceToKS,
  spectralToSrgb,
} from "./kubelka-munk-optics";
export type {
  CieLabColor,
  HsvColor,
  KubelkaMunkMixOptions,
  KubelkaMunkMixResult,
  PigmentLayerSpec,
  PigmentMixBackend,
  PigmentPreset,
  PigmentPresetId,
  SimdPigmentBatchResult,
  SrgbOpticalColor,
  WasmSimdPigmentRuntimeInfo,
} from "./kubelka-munk-optics";

interface WasmSimdMixKernel {
  readonly memory: WebAssembly.Memory;
  readonly viewF32: Float32Array;
  readonly mix8: (ptrA: number, ptrB: number, ptrOut: number, wA: number, wB: number) => void;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function encodeUleb128(value: number): number[] {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return bytes;
}

function makeWasmSection(id: number, payload: readonly number[]): number[] {
  return [id, ...encodeUleb128(payload.length), ...payload];
}

/** 8-밴드 `f32x4` 가중 합산(`out = wA * a + wB * b`) WebAssembly SIMD128 바이너리 생성기. */
function buildWasmSimd128Mix8Binary(): Uint8Array<ArrayBuffer> {
  const typeSection = makeWasmSection(0x01, [0x01, 0x60, 0x05, 0x7f, 0x7f, 0x7f, 0x7d, 0x7d, 0x00]);
  const funcSection = makeWasmSection(0x03, [0x01, 0x00]);
  const memSection = makeWasmSection(0x05, [0x01, 0x00, 0x01]);
  const exportSection = makeWasmSection(0x07, [
    0x02,
    0x03, 0x6d, 0x65, 0x6d, 0x02, 0x00,
    0x04, 0x6d, 0x69, 0x78, 0x38, 0x00, 0x00,
  ]);
  const body = [
    0x01, 0x02, 0x7b,
    0x20, 0x03, 0xfd, 0x13, 0x21, 0x05,
    0x20, 0x04, 0xfd, 0x13, 0x21, 0x06,
    0x20, 0x02, 0x20, 0x00, 0xfd, 0x00, 0x02, 0x00, 0x20, 0x05, 0xfd, 0xe6, 0x01,
    0x20, 0x01, 0xfd, 0x00, 0x02, 0x00, 0x20, 0x06, 0xfd, 0xe6, 0x01,
    0xfd, 0xe4, 0x01, 0xfd, 0x0b, 0x02, 0x00,
    0x20, 0x02, 0x20, 0x00, 0xfd, 0x00, 0x02, 0x10, 0x20, 0x05, 0xfd, 0xe6, 0x01,
    0x20, 0x01, 0xfd, 0x00, 0x02, 0x10, 0x20, 0x06, 0xfd, 0xe6, 0x01,
    0xfd, 0xe4, 0x01, 0xfd, 0x0b, 0x02, 0x10,
    0x0b,
  ];
  const codeSection = makeWasmSection(0x0a, [0x01, ...encodeUleb128(body.length), ...body]);
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...typeSection,
    ...funcSection,
    ...memSection,
    ...exportSection,
    ...codeSection,
  ]);
}

let cachedWasmSimdKernel: WasmSimdMixKernel | null | undefined;

function getOrCreateWasmSimdKernel(): WasmSimdMixKernel | null {
  if (cachedWasmSimdKernel !== undefined) return cachedWasmSimdKernel;
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
    cachedWasmSimdKernel = null;
    return null;
  }
  try {
    const bytes = buildWasmSimd128Mix8Binary();
    if (!WebAssembly.validate(bytes)) {
      cachedWasmSimdKernel = null;
      return null;
    }
    const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes));
    const memory = inst.exports.mem as WebAssembly.Memory | undefined;
    const mix8 = inst.exports.mix8 as WasmSimdMixKernel["mix8"] | undefined;
    if (!memory || typeof mix8 !== "function") {
      cachedWasmSimdKernel = null;
      return null;
    }
    cachedWasmSimdKernel = { memory, viewF32: new Float32Array(memory.buffer), mix8 };
    return cachedWasmSimdKernel;
  } catch {
    cachedWasmSimdKernel = null;
    return null;
  }
}

/** 현재 실행 환경의 WASM-SIMD128 커널 가용성을 프로브한다. */
export function probeWasmSimdPigmentRuntime(): WasmSimdPigmentRuntimeInfo {
  const kernel = getOrCreateWasmSimdKernel();
  return {
    wasmSupported: typeof WebAssembly !== "undefined",
    simd128Supported: kernel !== null,
    backend: kernel !== null ? "wasm-simd128" : "typedarray-simd-aligned",
    spectralBands: SPECTRAL_BAND_COUNT,
  };
}

/**
 * 다중 안료 레이어를 Kubelka-Munk 8-밴드 물리 광학 모델로 혼색하고,
 * 단순 RGB 선형 혼색 대비 지각 색차(ΔE76 / ΔE00)와 채도 이득을 산출한다.
 */
export function mixPigmentsKubelkaMunk(
  layers: readonly PigmentLayerSpec[],
  options: KubelkaMunkMixOptions = {},
): KubelkaMunkMixResult {
  const startMs = nowMs();
  const kernel = getOrCreateWasmSimdKernel();
  const backend: PigmentMixBackend = kernel ? "wasm-simd128" : "typedarray-simd-aligned";

  const active = layers.filter((layer) => layer.ratio > 0);
  const safeLayers: readonly PigmentLayerSpec[] =
    active.length > 0
      ? active
      : [
          { pigmentId: "ultramarine-blue", ratio: 0.5 },
          { pigmentId: "cadmium-yellow", ratio: 0.5 },
        ];

  let ratioSum = 0;
  for (const layer of safeLayers) ratioSum += Math.max(0, layer.ratio);
  const normRatioSum = Math.max(1e-6, ratioSum);

  const paperBrightness = clamp(options.paperBrightness ?? 0.94, 0.65, 0.99);
  const wetBackrun = clamp(options.wetBackrun ?? 0.25, 0, 1);
  const sedimentation = clamp(options.sedimentation ?? 0.3, 0, 1);
  const paperTooth = clamp(options.paperToothSample ?? 0.5, 0, 1);
  const baseThickness = clamp(options.layerThickness ?? 2.2, 0.15, 6);

  const kMix = new Float32Array(SPECTRAL_BAND_COUNT);
  const sMix = new Float32Array(SPECTRAL_BAND_COUNT);
  let weightedThickness = 0;
  let weightedGranulation = 0;
  let weightedMobility = 0;
  let rgbSumR = 0;
  let rgbSumG = 0;
  let rgbSumB = 0;

  if (safeLayers.length === 2 && kernel) {
    const entryA = getPigmentSpectralEntry(safeLayers[0]!.pigmentId);
    const entryB = getPigmentSpectralEntry(safeLayers[1]!.pigmentId);
    const rA = safeLayers[0]!.ratio / normRatioSum;
    const rB = safeLayers[1]!.ratio / normRatioSum;
    const wA = rA * entryA.preset.tintingStrength;
    const wB = rB * entryB.preset.tintingStrength;
    const wTot = Math.max(1e-6, wA + wB);

    const view = kernel.viewF32;
    view.set(entryA.kBands, 0);
    view.set(entryB.kBands, 8);
    kernel.mix8(0, 32, 64, wA / wTot, wB / wTot);
    kMix.set(view.subarray(16, 24));

    view.set(entryA.sBands, 0);
    view.set(entryB.sBands, 8);
    kernel.mix8(0, 32, 64, wA / wTot, wB / wTot);
    sMix.set(view.subarray(16, 24));

    weightedThickness = rA * (safeLayers[0]!.thickness ?? baseThickness) + rB * (safeLayers[1]!.thickness ?? baseThickness);
    weightedGranulation = rA * entryA.preset.granulation + rB * entryB.preset.granulation;
    weightedMobility = rA * entryA.preset.backrunMobility + rB * entryB.preset.backrunMobility;
    rgbSumR = rA * entryA.baseSrgb.r + rB * entryB.baseSrgb.r;
    rgbSumG = rA * entryA.baseSrgb.g + rB * entryB.baseSrgb.g;
    rgbSumB = rA * entryA.baseSrgb.b + rB * entryB.baseSrgb.b;
  } else {
    let tintSum = 0;
    for (const layer of safeLayers) {
      tintSum += (layer.ratio / normRatioSum) * getPigmentSpectralEntry(layer.pigmentId).preset.tintingStrength;
    }
    const safeTint = Math.max(1e-6, tintSum);
    for (const layer of safeLayers) {
      const entry = getPigmentSpectralEntry(layer.pigmentId);
      const frac = layer.ratio / normRatioSum;
      const w = (frac * entry.preset.tintingStrength) / safeTint;
      for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
        kMix[b] = kMix[b]! + entry.kBands[b]! * w;
        sMix[b] = sMix[b]! + entry.sBands[b]! * w;
      }
      weightedThickness += frac * (layer.thickness ?? baseThickness);
      weightedGranulation += frac * entry.preset.granulation;
      weightedMobility += frac * entry.preset.backrunMobility;
      rgbSumR += frac * entry.baseSrgb.r;
      rgbSumG += frac * entry.baseSrgb.g;
      rgbSumB += frac * entry.baseSrgb.b;
    }
  }

  const backrunEdgeBoost = wetBackrun * weightedMobility * 0.48;
  const toothDelta = (paperTooth - 0.5) * 2;
  const sedimentationFactor = sedimentation * weightedGranulation;
  const effectiveThickness = clamp(
    weightedThickness * (1 + backrunEdgeBoost * 0.55 + sedimentationFactor * toothDelta * 0.45),
    0.12,
    8,
  );
  const kMod = 1 + sedimentationFactor * Math.max(0, toothDelta) * 0.18;

  const spectralReflectance = new Float32Array(SPECTRAL_BAND_COUNT);
  for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
    const rgBand = paperBrightness * (0.96 + (b / (SPECTRAL_BAND_COUNT - 1)) * 0.04);
    spectralReflectance[b] = computeKubelkaMunkLayerReflectance(kMix[b]! * kMod, sMix[b]!, effectiveThickness, rgBand);
  }

  const kmSrgb = spectralToSrgb(spectralReflectance);
  const rgbLinearMixSrgb = buildSrgbOpticalColor(
    srgbToLinearChannel(rgbSumR),
    srgbToLinearChannel(rgbSumG),
    srgbToLinearChannel(rgbSumB),
  );
  const deltaE76 = computeDeltaE76(kmSrgb.lab, rgbLinearMixSrgb.lab);
  const deltaE2000 = computeCiede2000(kmSrgb.lab, rgbLinearMixSrgb.lab);
  const chromaGain = Math.hypot(kmSrgb.lab.a, kmSrgb.lab.b) - Math.hypot(rgbLinearMixSrgb.lab.a, rgbLinearMixSrgb.lab.b);
  const elapsedMs = Math.max(0.005, nowMs() - startMs);

  return {
    backend,
    spectralReflectance: Array.from(spectralReflectance, (v) => Number(v.toFixed(4))),
    kmSrgb,
    rgbLinearMixSrgb,
    deltaE76: Number(deltaE76.toFixed(2)),
    deltaE2000: Number(deltaE2000.toFixed(2)),
    kmHueDeg: Number(kmSrgb.hsv.h.toFixed(1)),
    rgbHueDeg: Number(rgbLinearMixSrgb.hsv.h.toFixed(1)),
    kmSaturationPct: Number((kmSrgb.hsv.s * 100).toFixed(1)),
    rgbSaturationPct: Number((rgbLinearMixSrgb.hsv.s * 100).toFixed(1)),
    chromaGain: Number(chromaGain.toFixed(2)),
    backrunEdgeBoost: Number(backrunEdgeBoost.toFixed(3)),
    sedimentationFactor: Number(sedimentationFactor.toFixed(3)),
    elapsedMs: Number(elapsedMs.toFixed(3)),
  };
}

/** 2종 안료 비율 배열(`Float32Array`)을 SIMD 커널로 일괄 혼색해 RGBA 버퍼로 반환한다. */
export function blendPigmentBatchSimd(
  pigmentAId: PigmentPresetId,
  pigmentBId: PigmentPresetId,
  ratiosB: Float32Array,
  options: KubelkaMunkMixOptions = {},
): SimdPigmentBatchResult {
  const startMs = nowMs();
  const count = ratiosB.length;
  const rgba = new Uint8ClampedArray(count * 4);
  const kernel = getOrCreateWasmSimdKernel();
  const backend: PigmentMixBackend = kernel ? "wasm-simd128" : "typedarray-simd-aligned";

  const entryA = getPigmentSpectralEntry(pigmentAId);
  const entryB = getPigmentSpectralEntry(pigmentBId);
  const paperBrightness = clamp(options.paperBrightness ?? 0.94, 0.65, 0.99);
  const thickness = clamp(options.layerThickness ?? 2.2, 0.15, 6);
  const rBuf = new Float32Array(SPECTRAL_BAND_COUNT);

  if (kernel) {
    kernel.viewF32.set(entryA.kBands, 0);
    kernel.viewF32.set(entryB.kBands, 8);
    kernel.viewF32.set(entryA.sBands, 16);
    kernel.viewF32.set(entryB.sBands, 24);
  }

  for (let i = 0; i < count; i += 1) {
    const rB = clamp(ratiosB[i]!, 0, 1);
    const wA = (1 - rB) * entryA.preset.tintingStrength;
    const wB = rB * entryB.preset.tintingStrength;
    const wTot = Math.max(1e-6, wA + wB);
    const nwA = wA / wTot;
    const nwB = wB / wTot;

    if (kernel) {
      kernel.mix8(0, 32, 128, nwA, nwB);
      kernel.mix8(64, 96, 160, nwA, nwB);
      const view = kernel.viewF32;
      for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
        const rgBand = paperBrightness * (0.96 + (b / (SPECTRAL_BAND_COUNT - 1)) * 0.04);
        rBuf[b] = computeKubelkaMunkLayerReflectance(view[32 + b]!, view[40 + b]!, thickness, rgBand);
      }
    } else {
      for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
        const k = entryA.kBands[b]! * nwA + entryB.kBands[b]! * nwB;
        const s = entryA.sBands[b]! * nwA + entryB.sBands[b]! * nwB;
        const rgBand = paperBrightness * (0.96 + (b / (SPECTRAL_BAND_COUNT - 1)) * 0.04);
        rBuf[b] = computeKubelkaMunkLayerReflectance(k, s, thickness, rgBand);
      }
    }

    const col = spectralToSrgb(rBuf);
    const base = i * 4;
    rgba[base] = col.r;
    rgba[base + 1] = col.g;
    rgba[base + 2] = col.b;
    rgba[base + 3] = 255;
  }

  const elapsedMs = Math.max(0.01, nowMs() - startMs);
  return {
    backend,
    pixelCount: count,
    rgba,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    pixelsPerMs: Number((count / elapsedMs).toFixed(1)),
  };
}

function deterministicPaperTooth(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return clamp((n - Math.floor(n)) * 0.55 + (0.5 + 0.5 * Math.sin(x * 0.19) * Math.cos(y * 0.23)) * 0.45, 0, 1);
}

/**
 * 실시간 물리 혼색 비교 프리뷰 RGBA 버퍼를 생성한다.
 * 상단 68%는 Kubelka-Munk 습윤 수채 그라데이션(백런 고리 + 침전 포함), 하단 30%는 단순 RGB 선형 보간이다.
 */
export function renderPigmentMixPreviewRgba(
  pigmentAId: PigmentPresetId,
  pigmentBId: PigmentPresetId,
  mixRatioB: number,
  options: KubelkaMunkMixOptions,
  width: number,
  height: number,
): Uint8ClampedArray {
  const safeW = Math.max(32, Math.round(width));
  const safeH = Math.max(32, Math.round(height));
  const buf = new Uint8ClampedArray(safeW * safeH * 4);
  const splitY = Math.floor(safeH * 0.68);
  const entryA = getPigmentSpectralEntry(pigmentAId);
  const entryB = getPigmentSpectralEntry(pigmentBId);
  const wetBackrun = clamp(options.wetBackrun ?? 0.35, 0, 1);
  const sedimentation = clamp(options.sedimentation ?? 0.4, 0, 1);
  const baseThickness = clamp(options.layerThickness ?? 2.2, 0.25, 6);
  const paperBrightness = clamp(options.paperBrightness ?? 0.94, 0.65, 0.99);

  const safeMix = clamp(mixRatioB, 0.05, 0.95);
  const colK = new Float32Array(safeW * SPECTRAL_BAND_COUNT);
  const colS = new Float32Array(safeW * SPECTRAL_BAND_COUNT);
  const colGran = new Float32Array(safeW);
  const colMob = new Float32Array(safeW);
  const rgbRow = new Uint8ClampedArray(safeW * 3);

  for (let x = 0; x < safeW; x += 1) {
    const u = x / Math.max(1, safeW - 1);
    const rb = u < 0.28 ? (u / 0.28) * safeMix : u <= 0.72 ? safeMix : safeMix + ((u - 0.72) / 0.28) * (1 - safeMix);
    const ra = 1 - rb;
    rgbRow[x * 3] = Math.round(entryA.baseSrgb.r * ra + entryB.baseSrgb.r * rb);
    rgbRow[x * 3 + 1] = Math.round(entryA.baseSrgb.g * ra + entryB.baseSrgb.g * rb);
    rgbRow[x * 3 + 2] = Math.round(entryA.baseSrgb.b * ra + entryB.baseSrgb.b * rb);

    const wA = ra * entryA.preset.tintingStrength;
    const wB = rb * entryB.preset.tintingStrength;
    const wTot = Math.max(1e-6, wA + wB);
    const offset = x * SPECTRAL_BAND_COUNT;
    for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
      colK[offset + b] = (entryA.kBands[b]! * wA + entryB.kBands[b]! * wB) / wTot;
      colS[offset + b] = (entryA.sBands[b]! * wA + entryB.sBands[b]! * wB) / wTot;
    }
    colGran[x] = ra * entryA.preset.granulation + rb * entryB.preset.granulation;
    colMob[x] = ra * entryA.preset.backrunMobility + rb * entryB.preset.backrunMobility;
  }

  const rScratch = new Float32Array(SPECTRAL_BAND_COUNT);
  const cx = safeW * 0.5;
  const cy = splitY * 0.5;
  const bloomRx = Math.max(1, safeW * 0.24);
  const bloomRy = Math.max(1, splitY * 0.38);

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const pIdx = (y * safeW + x) * 4;
      if (y === splitY || y === splitY + 1) {
        buf[pIdx] = 56;
        buf[pIdx + 1] = 53;
        buf[pIdx + 2] = 49;
        buf[pIdx + 3] = 255;
        continue;
      }
      if (y > splitY + 1) {
        buf[pIdx] = rgbRow[x * 3]!;
        buf[pIdx + 1] = rgbRow[x * 3 + 1]!;
        buf[pIdx + 2] = rgbRow[x * 3 + 2]!;
        buf[pIdx + 3] = 255;
        continue;
      }

      const normDist = Math.hypot((x - cx) / bloomRx, (y - cy) / bloomRy);
      const backrunBoost = wetBackrun * colMob[x]! * Math.exp(-Math.pow((normDist - 0.94) / 0.14, 2)) * 0.85;
      const centerDilute = normDist < 0.82 ? wetBackrun * colMob[x]! * 0.14 * (1 - normDist) : 0;
      const granEffect = sedimentation * colGran[x]! * (deterministicPaperTooth(x, y) - 0.5) * 0.96;
      const localThickness = clamp(baseThickness * (1 + backrunBoost - centerDilute + granEffect), 0.22, 6.5);
      const kBoost = 1 + backrunBoost * 0.25 + Math.max(0, granEffect) * 0.22;
      const offset = x * SPECTRAL_BAND_COUNT;

      for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
        const rgBand = paperBrightness * (0.96 + (b / (SPECTRAL_BAND_COUNT - 1)) * 0.04);
        rScratch[b] = computeKubelkaMunkLayerReflectance(colK[offset + b]! * kBoost, colS[offset + b]!, localThickness, rgBand);
      }
      const pxCol = spectralToSrgb(rScratch);
      buf[pIdx] = pxCol.r;
      buf[pIdx + 1] = pxCol.g;
      buf[pIdx + 2] = pxCol.b;
      buf[pIdx + 3] = 255;
    }
  }
  return buf;
}
