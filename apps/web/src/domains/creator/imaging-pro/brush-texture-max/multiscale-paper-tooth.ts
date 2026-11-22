/**
 * 3-주파수 멀티스케일 절차적 종이 높이장(Macro · Meso · Micro) +
 * 펜 틸트·필압 비선형 접촉 전달 함수 + 스크린 공간 미분 기반 MIP-보정 샘플러.
 *
 * 설계 원칙:
 * - 100% 클린룸 결정적 수학(외부 텍스처·네트워크·AI API 없음, 브라우저 로컬 ₩0).
 * - Cold-Press, Hot-Press, Rough Watercolor, Hanji, Charcoal Laid 5종 종이 프리셋을
 *   타일 경계 이음매 없는 주기적(periodic) 3-옥타브 필드로 생성한다.
 * - 줌 배율(`zoomScale`)에 따라 MIP 피라미드와 고주파 대역 감쇠를 적용해 모아레와 픽셀 뭉개짐을 막는다.
 */

export type PaperToothPresetId =
  | "cold-press"
  | "hot-press"
  | "rough-watercolor"
  | "hanji"
  | "charcoal-laid";

export interface PaperToothPresetSpec {
  readonly id: PaperToothPresetId;
  readonly label: string;
  /** 저주파 종이 언덕·레이드 리브 비중. */
  readonly macroWeight: number;
  /** 중주파 펄프·닥섬유 얽힘 비중. */
  readonly mesoWeight: number;
  /** 고주파 미세 공극 비중. */
  readonly microWeight: number;
  /** Macro 타일 주기(타일당 파장 수, 정수). */
  readonly macroPeriod: number;
  /** Meso 타일 주기(정수). */
  readonly mesoPeriod: number;
  /** Micro 타일 주기(정수). */
  readonly microPeriod: number;
  /** 결 방향 이방성 강도 (0 = 등방성, 1 = 강한 방향성). */
  readonly anisotropy: number;
  /** 주 섬유·레이드 결 각도(라디안). */
  readonly grainAngleRad: number;
  /** 레이드지 평행 리브 강도 (charcoal-laid 전용 강조). */
  readonly laidRibStrength: number;
  /** 기복 대비 감마. */
  readonly contrast: number;
  /** 1픽셀당 기본 종이 거칠기 기준값 [0..1]. */
  readonly nominalRoughness: number;
}

export const PAPER_TOOTH_PRESETS: Readonly<Record<PaperToothPresetId, PaperToothPresetSpec>> = Object.freeze({
  "cold-press": Object.freeze({
    id: "cold-press",
    label: "황목 수채화지 (Cold-Press)",
    macroWeight: 0.46,
    mesoWeight: 0.34,
    microWeight: 0.2,
    macroPeriod: 4,
    mesoPeriod: 12,
    microPeriod: 28,
    anisotropy: 0.14,
    grainAngleRad: 0.32,
    laidRibStrength: 0,
    contrast: 1.22,
    nominalRoughness: 0.64,
  }),
  "hot-press": Object.freeze({
    id: "hot-press",
    label: "세목 압착지 (Hot-Press)",
    macroWeight: 0.2,
    mesoWeight: 0.32,
    microWeight: 0.48,
    macroPeriod: 3,
    mesoPeriod: 14,
    microPeriod: 32,
    anisotropy: 0.08,
    grainAngleRad: 0.15,
    laidRibStrength: 0,
    contrast: 0.74,
    nominalRoughness: 0.28,
  }),
  "rough-watercolor": Object.freeze({
    id: "rough-watercolor",
    label: "극황목 수채화지 (Rough Watercolor)",
    macroWeight: 0.56,
    mesoWeight: 0.28,
    microWeight: 0.16,
    macroPeriod: 5,
    mesoPeriod: 11,
    microPeriod: 24,
    anisotropy: 0.18,
    grainAngleRad: 0.48,
    laidRibStrength: 0,
    contrast: 1.55,
    nominalRoughness: 0.86,
  }),
  hanji: Object.freeze({
    id: "hanji",
    label: "전통 닥섬유 한지 (Hanji)",
    macroWeight: 0.28,
    mesoWeight: 0.5,
    microWeight: 0.22,
    macroPeriod: 3,
    mesoPeriod: 10,
    microPeriod: 26,
    anisotropy: 0.72,
    grainAngleRad: 0.22,
    laidRibStrength: 0.12,
    contrast: 1.12,
    nominalRoughness: 0.58,
  }),
  "charcoal-laid": Object.freeze({
    id: "charcoal-laid",
    label: "목탄 레이드지 (Charcoal Laid)",
    macroWeight: 0.52,
    mesoWeight: 0.26,
    microWeight: 0.22,
    macroPeriod: 8,
    mesoPeriod: 16,
    microPeriod: 32,
    anisotropy: 0.86,
    grainAngleRad: 0,
    laidRibStrength: 0.68,
    contrast: 1.38,
    nominalRoughness: 0.79,
  }),
});

export interface GenerateMultiscalePaperTileOptions {
  readonly presetId: PaperToothPresetId;
  /** 타일 한 변 크기 (16..256, 기본 64). */
  readonly tileSize?: number;
  /** 결정적 생성 시드. */
  readonly seed?: number;
}

export interface MultiscalePaperTile {
  readonly presetId: PaperToothPresetId;
  readonly spec: PaperToothPresetSpec;
  readonly tileSize: number;
  readonly seed: number;
  /** 저주파 Macro 높이장 [0..1]. */
  readonly macro: Float32Array;
  /** 중주파 Meso 섬유 얽힘 높이장 [0..1]. */
  readonly meso: Float32Array;
  /** 고주파 Micro 공극 높이장 [0..1]. */
  readonly micro: Float32Array;
  /** 3개 옥타브 합성 최종 높이장 [0..1]. */
  readonly height: Float32Array;
  /** 픽셀별 국소 종이 결 단위 방향 벡터 X. */
  readonly grainDirX: Float32Array;
  /** 픽셀별 국소 종이 결 단위 방향 벡터 Y. */
  readonly grainDirY: Float32Array;
  /** 박스 필터 다운샘플링 MIP 피라미드 (level 0 = 원본). */
  readonly mipPyramid: readonly Float32Array[];
  /** MIP 레벨별 해상도. */
  readonly mipSizes: readonly number[];
  readonly meanHeight: number;
  readonly stdHeight: number;
}

export interface MultiscalePaperMipSample {
  readonly height: number;
  readonly macro: number;
  readonly meso: number;
  readonly micro: number;
  readonly mipLevel: number;
  /** 줌 아웃 시 고주파(Micro) 감쇠 계수 (1 = 원배율, 0에 가까울수록 강감쇠). */
  readonly highFreqAttenuation: number;
  readonly grainDirX: number;
  readonly grainDirY: number;
}

export interface PaperContactTransferInput {
  /** 종이 높이 [0..1] (0 = 깊은 골짜기, 1 = 산봉우리). */
  readonly paperHeight: number;
  /** 펜 고도각(라디안, 0 = 수평 눕힘 ~ π/2 = 수직 세움). */
  readonly tiltRad: number;
  /** 필압 [0..1]. */
  readonly pressure: number;
  /** 심지/붓모 부드러움 [0..1] (기본 0.45). */
  readonly softness?: number;
  /** 현재 안료 충전량 [0..1] (기본 1). */
  readonly pigmentLoad?: number;
  /** 종이 결 반응 감도 [0..1] (기본 0.85). */
  readonly toothSensitivity?: number;
}

export interface PaperContactTransferResult {
  /** 비선형 접촉 마스크 [0..1]. */
  readonly contactMask: number;
  /** 최종 안료 전이율 [0..1]. */
  readonly pigmentTransfer: number;
  /** 계산된 접촉 문턱 높이 [0..1]. */
  readonly contactThreshold: number;
  /** 산봉우리 걸림 비중 [0..1]. */
  readonly ridgeCatchRatio: number;
  /** 골짜기 침투 비중 [0..1]. */
  readonly valleyFillRatio: number;
}

const HALF_PI = Math.PI * 0.5;
const TWO_PI = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0;
  if (Math.abs(denom) < 1e-7) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / denom);
  return t * t * (3 - 2 * t);
}

function wrapInt(n: number, period: number): number {
  const m = n % period;
  return m < 0 ? m + period : m;
}

function hashPeriodic2d(seed: number, x: number, y: number, periodX: number, periodY: number): number {
  const wx = wrapInt(x, periodX);
  const wy = wrapInt(y, periodY);
  let h = (Math.imul(wx, 374761393) + Math.imul(wy, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

/** 타일 경계에서 완벽히 이어지는 주기적 2D Value Noise [0..1]. */
function periodicValueNoise(
  u: number,
  v: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const px = Math.max(1, Math.round(periodX));
  const py = Math.max(1, Math.round(periodY));
  const gx = u * px;
  const gy = v * py;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hashPeriodic2d(seed, ix, iy, px, py);
  const n10 = hashPeriodic2d(seed, ix + 1, iy, px, py);
  const n01 = hashPeriodic2d(seed, ix, iy + 1, px, py);
  const n11 = hashPeriodic2d(seed, ix + 1, iy + 1, px, py);

  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return top + (bottom - top) * sy;
}

/** 0..1 범위로 안전하게 정규화한다. */
function normalizeField01(field: Float32Array, contrast: number): void {
  const n = field.length;
  if (n === 0) return;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const val = field[i] ?? 0;
    if (val < minV) minV = val;
    if (val > maxV) maxV = val;
  }
  const span = Math.max(1e-6, maxV - minV);
  for (let i = 0; i < n; i += 1) {
    const norm = ((field[i] ?? 0) - minV) / span;
    const centered = (norm - 0.5) * contrast + 0.5;
    field[i] = clamp01(centered);
  }
}

/** 2×2 박스 필터 MIP 피라미드를 1×1까지 생성한다. */
function buildMipPyramid(base: Float32Array, baseSize: number): {
  readonly pyramid: Float32Array[];
  readonly sizes: number[];
} {
  const pyramid: Float32Array[] = [base];
  const sizes: number[] = [baseSize];
  let cur = base;
  let curSize = baseSize;
  while (curSize > 1) {
    const nextSize = Math.max(1, curSize >> 1);
    const next = new Float32Array(nextSize * nextSize);
    for (let y = 0; y < nextSize; y += 1) {
      const y0 = (y * 2) % curSize;
      const y1 = (y0 + 1) % curSize;
      for (let x = 0; x < nextSize; x += 1) {
        const x0 = (x * 2) % curSize;
        const x1 = (x0 + 1) % curSize;
        const sum =
          (cur[y0 * curSize + x0] ?? 0) +
          (cur[y0 * curSize + x1] ?? 0) +
          (cur[y1 * curSize + x0] ?? 0) +
          (cur[y1 * curSize + x1] ?? 0);
        next[y * nextSize + x] = sum * 0.25;
      }
    }
    pyramid.push(next);
    sizes.push(nextSize);
    cur = next;
    curSize = nextSize;
  }
  return { pyramid, sizes };
}

/** 주기적 타일에서 bilinear 샘플을 읽는다. */
function samplePeriodicBilinear(field: Float32Array, size: number, u: number, v: number): number {
  if (size <= 1) return field[0] ?? 0.5;
  const wu = ((u % 1) + 1) % 1;
  const wv = ((v % 1) + 1) % 1;
  const gx = wu * size;
  const gy = wv * size;
  const x0 = Math.floor(gx) % size;
  const y0 = Math.floor(gy) % size;
  const x1 = (x0 + 1) % size;
  const y1 = (y0 + 1) % size;
  const fx = gx - Math.floor(gx);
  const fy = gy - Math.floor(gy);

  const a = field[y0 * size + x0] ?? 0;
  const b = field[y0 * size + x1] ?? 0;
  const c = field[y1 * size + x0] ?? 0;
  const d = field[y1 * size + x1] ?? 0;
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/**
 * 3-주파수(Macro · Meso · Micro) 결정적 종이 높이장 타일 및 MIP 피라미드를 생성한다.
 */
export function generateMultiscalePaperTile(
  options: GenerateMultiscalePaperTileOptions,
): MultiscalePaperTile {
  const spec = PAPER_TOOTH_PRESETS[options.presetId];
  const rawSize = Math.round(options.tileSize ?? 64);
  const clamped = Math.max(16, Math.min(256, Number.isFinite(rawSize) ? rawSize : 64));
  // MIP 피라미드 정렬을 위해 가장 가까운 2의 거듭제곱으로 맞춘다.
  const tileSize = Math.max(16, Math.min(256, 1 << Math.round(Math.log2(clamped))));
  const seed = Math.trunc(options.seed ?? 20261122);
  const count = tileSize * tileSize;

  const macro = new Float32Array(count);
  const meso = new Float32Array(count);
  const micro = new Float32Array(count);
  const height = new Float32Array(count);
  const grainDirX = new Float32Array(count);
  const grainDirY = new Float32Array(count);

  const cosA = Math.cos(spec.grainAngleRad);
  const sinA = Math.sin(spec.grainAngleRad);

  for (let y = 0; y < tileSize; y += 1) {
    const v = y / tileSize;
    for (let x = 0; x < tileSize; x += 1) {
      const u = x / tileSize;
      const idx = y * tileSize + x;

      // 1) Macro: 황목 언덕 또는 레이드지 평행 리브 + 교차 체인선
      const mBase = periodicValueNoise(u, v, spec.macroPeriod, spec.macroPeriod, seed ^ 0x101);
      const mHarm = periodicValueNoise(u, v, spec.macroPeriod * 2, spec.macroPeriod * 2, seed ^ 0x202);
      const laidWave =
        spec.laidRibStrength > 0
          ? 0.5 +
            0.38 * Math.sin(v * TWO_PI * spec.macroPeriod) +
            0.12 * Math.cos(u * TWO_PI * Math.max(2, spec.macroPeriod >> 2))
          : 0;
      const macroVal =
        spec.laidRibStrength > 0
          ? (1 - spec.laidRibStrength) * (0.72 * mBase + 0.28 * mHarm) + spec.laidRibStrength * laidWave
          : 0.72 * mBase + 0.28 * mHarm;
      macro[idx] = clamp01(macroVal);

      // 2) Meso: 펄프·닥섬유 얽힘(이방성 종이일수록 축별 주기 비를 비대칭으로 구성)
      const px1 = spec.mesoPeriod;
      const py1 = Math.max(2, Math.round(spec.mesoPeriod * (1 - spec.anisotropy * 0.68)));
      const px2 = Math.max(2, Math.round(spec.mesoPeriod * (1 - spec.anisotropy * 0.42)));
      const py2 = spec.mesoPeriod;
      const strandA = periodicValueNoise(u, v, px1, py1, seed ^ 0x303);
      const strandB = periodicValueNoise(u, v, px2, py2, seed ^ 0x404);
      // 닥섬유·펄프 리지(섬유가 겹쳐 솟아오른 줄기) 강조
      const fiberRidgeA = 1 - Math.abs(strandA * 2 - 1);
      const fiberRidgeB = 1 - Math.abs(strandB * 2 - 1);
      const mesoVal =
        options.presetId === "hanji"
          ? 0.62 * fiberRidgeA + 0.38 * fiberRidgeB
          : 0.55 * strandA + 0.45 * fiberRidgeB;
      meso[idx] = clamp01(mesoVal);

      // 3) Micro: 미세 공극(고주파 핀홀 + 입자감)
      const p1 = periodicValueNoise(u, v, spec.microPeriod, spec.microPeriod, seed ^ 0x505);
      const p2 = hashPeriodic2d(seed ^ 0x606, x, y, tileSize, tileSize);
      const microVal = clamp01(0.68 * p1 + 0.32 * p2);
      const clampedMacro = clamp01(macroVal);
      const clampedMeso = clamp01(mesoVal);
      macro[idx] = clampedMacro;
      meso[idx] = clampedMeso;
      micro[idx] = microVal;

      height[idx] =
        clampedMacro * spec.macroWeight +
        clampedMeso * spec.mesoWeight +
        microVal * spec.microWeight;
    }
  }

  normalizeField01(height, spec.contrast);

  // 각 픽셀의 종이 결 주방향(등고선 접선 + 프리셋 주 섬유 방향 블렌드)과 통계 산출
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < tileSize; y += 1) {
    const yU = (y - 1 + tileSize) % tileSize;
    const yD = (y + 1) % tileSize;
    for (let x = 0; x < tileSize; x += 1) {
      const xL = (x - 1 + tileSize) % tileSize;
      const xR = (x + 1) % tileSize;
      const idx = y * tileSize + x;
      const h = height[idx] ?? 0.5;
      sum += h;
      sumSq += h * h;

      const gx = (height[y * tileSize + xR] ?? h) - (height[y * tileSize + xL] ?? h);
      const gy = (height[yD * tileSize + x] ?? h) - (height[yU * tileSize + x] ?? h);
      // 등고선 방향은 기울기 수직 벡터 (-gy, gx)
      const gradLen = Math.hypot(gx, gy);
      let tx = cosA;
      let ty = sinA;
      if (gradLen > 1e-5) {
        const localTx = -gy / gradLen;
        const localTy = gx / gradLen;
        // 프리셋 방향과 같은 반구로 정렬해 부호 뒤집힘 방지
        const sign = localTx * cosA + localTy * sinA >= 0 ? 1 : -1;
        const blend = 1 - spec.anisotropy * 0.72;
        tx = cosA * (1 - blend) + localTx * sign * blend;
        ty = sinA * (1 - blend) + localTy * sign * blend;
      }
      const norm = Math.hypot(tx, ty) || 1;
      grainDirX[idx] = tx / norm;
      grainDirY[idx] = ty / norm;
    }
  }

  const meanHeight = sum / count;
  const stdHeight = Math.sqrt(Math.max(0, sumSq / count - meanHeight * meanHeight));
  const { pyramid, sizes } = buildMipPyramid(height, tileSize);

  return {
    presetId: options.presetId,
    spec,
    tileSize,
    seed,
    macro,
    meso,
    micro,
    height,
    grainDirX,
    grainDirY,
    mipPyramid: pyramid,
    mipSizes: sizes,
    meanHeight,
    stdHeight,
  };
}

/**
 * 줌 배율(`zoomScale`)에 따른 스크린 공간 미분 기반 MIP-보정 샘플러.
 * 줌 아웃할수록(zoomScale < 1) MIP 레벨을 올려 모아레와 픽셀 뭉개짐을 억제한다.
 */
export function sampleMultiscalePaperMip(
  tile: MultiscalePaperTile,
  u: number,
  v: number,
  zoomScale: number,
  tileWorldTexelsPerPx = 1,
): MultiscalePaperMipSample {
  const safeZoom = clamp(Number.isFinite(zoomScale) ? zoomScale : 1, 0.05, 16);
  const footprint = Math.max(1e-3, tileWorldTexelsPerPx / safeZoom);
  const maxLevel = tile.mipPyramid.length - 1;
  const rawLod = Math.max(0, Math.log2(Math.max(1, footprint)));
  const mipLevel = clamp(rawLod, 0, maxLevel);
  const lv0 = Math.floor(mipLevel);
  const lv1 = Math.min(maxLevel, lv0 + 1);
  const frac = mipLevel - lv0;

  const mip0Field = tile.mipPyramid[lv0] ?? tile.height;
  const mip1Field = tile.mipPyramid[lv1] ?? tile.height;
  const size0 = tile.mipSizes[lv0] ?? tile.tileSize;
  const size1 = tile.mipSizes[lv1] ?? tile.tileSize;

  const h0 = samplePeriodicBilinear(mip0Field, size0, u, v);
  const h1 = samplePeriodicBilinear(mip1Field, size1, u, v);
  const mipHeight = h0 + (h1 - h0) * frac;

  // 대역별 스크린 공간 미분 감쇠 (고주파 Micro -> 중주파 Meso 순으로 평균값으로 수렴)
  const microExcess = Math.max(0, mipLevel - 0.35);
  const mesoExcess = Math.max(0, mipLevel - 1.15);
  const highFreqAttenuation = 1 / (1 + microExcess * microExcess * 1.65);
  const mesoAttenuation = 1 / (1 + mesoExcess * mesoExcess * 0.9);

  const macroRaw = samplePeriodicBilinear(tile.macro, tile.tileSize, u, v);
  const mesoRaw = samplePeriodicBilinear(tile.meso, tile.tileSize, u, v);
  const microRaw = samplePeriodicBilinear(tile.micro, tile.tileSize, u, v);

  const mesoVal = 0.5 + (mesoRaw - 0.5) * mesoAttenuation;
  const microVal = 0.5 + (microRaw - 0.5) * highFreqAttenuation;

  const gx = samplePeriodicBilinear(tile.grainDirX, tile.tileSize, u, v);
  const gy = samplePeriodicBilinear(tile.grainDirY, tile.tileSize, u, v);
  const gLen = Math.hypot(gx, gy) || 1;

  return {
    height: clamp01(mipHeight),
    macro: clamp01(macroRaw),
    meso: clamp01(mesoVal),
    micro: clamp01(microVal),
    mipLevel,
    highFreqAttenuation,
    grainDirX: gx / gLen,
    grainDirY: gy / gLen,
  };
}

/**
 * 펜 기울기(`tiltRad`)와 필압(`pressure`)에 따른 비선형 종이 접촉 전달 함수.
 * - `tiltRad`가 낮을수록(펜을 눕힐수록) 산봉우리(ridge)에만 안료가 걸리고 골짜기는 남는다.
 * - `pressure`가 강할수록 심지/붓모가 눌려 종이 골짜기까지 채워진다.
 */
export function evaluatePaperContactTransfer(
  input: PaperContactTransferInput,
): PaperContactTransferResult {
  const h = clamp01(input.paperHeight);
  const tiltElevation01 = clamp01(clamp(input.tiltRad, 0, HALF_PI) / HALF_PI);
  const grazingFactor = 1 - tiltElevation01;
  const pressure = clamp01(input.pressure);
  const softness = clamp01(input.softness ?? 0.45);
  const pigmentLoad = clamp01(input.pigmentLoad ?? 1);
  const toothSensitivity = clamp01(input.toothSensitivity ?? 0.85);

  // 필압이 강하고 펜을 세울수록 골짜기 깊숙이 침투
  const pressCurve = Math.pow(pressure, 0.68);
  const pressPenetration = pressCurve * (0.36 + 0.64 * tiltElevation01) * (0.82 + 0.18 * softness);

  // 낮은 틸트 + 약한 필압 -> 높은 문턱(봉우리만 접촉), 강한 필압 -> 낮은 문턱(골짜기까지 충전)
  const rawThreshold = 0.84 - 0.95 * pressPenetration + 0.24 * grazingFactor * (1 - 0.5 * pressure);
  const contactThreshold = clamp(
    rawThreshold * toothSensitivity + (1 - toothSensitivity) * 0.08,
    0.02,
    0.96,
  );

  // 접촉 전이 경계 폭 (부드러운 심지일수록 점진적)
  const knee = 0.055 + 0.14 * softness + 0.06 * pressure;
  const contactMask = smoothstep(contactThreshold - knee, contactThreshold + knee, h);

  // 필압에 따른 밀도 가중 (필압 0이면 전이 0)
  const pressureGain = pressure <= 0 ? 0 : 0.18 + 0.82 * Math.pow(pressure, 0.65);
  const pigmentTransfer = clamp01(contactMask * pressureGain * pigmentLoad);

  const ridgeCatchRatio = clamp01(grazingFactor * 0.68 + (1 - pressure) * 0.32);
  const valleyFillRatio = clamp01(1 - contactThreshold);

  return {
    contactMask,
    pigmentTransfer,
    contactThreshold,
    ridgeCatchRatio,
    valleyFillRatio,
  };
}
