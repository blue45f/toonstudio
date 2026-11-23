/**
 * 고해상도 128×128 실물 매체 브러시 팁 아틀라스 및 Kubelka-Munk 분광 광학 혼색 엔진.
 * 실제 화구 8종의 물리 단면을 128×128 Float32Array + 밉맵(128/64/32/16)으로 사전 생성·
 * LRU 캐싱하고, 16파장(400~700nm) 5안료 Kubelka-Munk 광학 혼색을 제공한다.
 */

export const TIP_ATLAS_BASE_SIZE = 128 as const;
export const TIP_ATLAS_MIP_SIZES = [128, 64, 32, 16] as const;
export type TipMipSize = (typeof TIP_ATLAS_MIP_SIZES)[number];
export const HOG_BRISTLE_HAIR_COUNT = 48 as const;

export const REAL_MEDIA_TIP_IDS = [
  "graphite-pencil-6b", "wax-crayon-block", "square-charcoal", "soft-pastel-chalk",
  "sable-watercolor", "hog-bristle-oil", "gpen-nib-elastic", "marker-chisel-felt",
] as const;
export type RealMediaTipId = (typeof REAL_MEDIA_TIP_IDS)[number];

export interface RgbColor { readonly r: number; readonly g: number; readonly b: number; }
export interface RealMediaTipOptions { readonly pressure?: number; readonly seed?: number; }

export interface TipMipmapPyramid {
  readonly level128: Float32Array;
  readonly level64: Float32Array;
  readonly level32: Float32Array;
  readonly level16: Float32Array;
  readonly byteLength: number;
}

export interface TipMaskStats {
  readonly coverage: number;
  readonly mean: number;
  readonly variance: number;
  readonly centroidX: number;
  readonly centroidY: number;
  readonly asymmetryScore: number;
  readonly edgeSharpness: number;
  readonly furrowVariance: number;
  readonly bristleCount: number;
}

export interface RealMediaTipMask {
  readonly tipId: RealMediaTipId;
  readonly size: typeof TIP_ATLAS_BASE_SIZE;
  readonly pressure: number;
  readonly seed: number;
  readonly data: Float32Array;
  readonly mipmaps: TipMipmapPyramid;
  readonly stats: TipMaskStats;
  readonly byteLength: number;
}

export interface KubelkaMunkMixResult {
  readonly color: RgbColor;
  readonly srgbLerp: RgbColor;
  readonly kmGreenDominance: number;
  readonly lerpGreenDominance: number;
  readonly kmSaturation: number;
  readonly lerpSaturation: number;
}

export interface TipAtlasCacheStats {
  readonly entries: number;
  readonly maxEntries: number;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

function clamp01(v: number): number { return v <= 0 ? 0 : v >= 1 ? 1 : v; }
function clampByte(v: number): number { return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v); }
function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function hash2d(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2d(ix, iy, seed);
  const b = hash2d(ix + 1, iy, seed);
  const c = hash2d(ix, iy + 1, seed);
  const d = hash2d(ix + 1, iy + 1, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

function fbm2d(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0; let amp = 0.5; let freq = 1; let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoise2d(x * freq, y * freq, seed + o * 97) * amp;
    norm += amp; freq *= 2.03; amp *= 0.5;
  }
  return norm > 0 ? sum / norm : 0;
}

function cellularEdge2d(x: number, y: number, seed: number): { f1: number; f2: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 99; let f2 = 99;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = ix + dx + 0.12 + 0.76 * hash2d(ix + dx, iy + dy, seed);
      const cy = iy + dy + 0.12 + 0.76 * hash2d(ix + dx, iy + dy, seed + 521);
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < f1) { f2 = f1; f1 = dist; } else if (dist < f2) { f2 = dist; }
    }
  }
  return { f1, f2 };
}

function sdRoundedBox(px: number, py: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

interface HogBristleHair { readonly cx: number; readonly cy: number; readonly radius: number; readonly load: number; }
interface CrayonLobe { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; }
interface CrayonCrumb { readonly cx: number; readonly cy: number; readonly r: number; readonly strength: number; }

const WAX_CRAYON_LOBES: readonly CrayonLobe[] = [
  { cx: -0.22, cy: -0.14, rx: 0.46, ry: 0.4 }, { cx: 0.26, cy: -0.1, rx: 0.42, ry: 0.36 },
  { cx: -0.1, cy: 0.24, rx: 0.48, ry: 0.38 }, { cx: 0.22, cy: 0.22, rx: 0.38, ry: 0.34 },
  { cx: -0.38, cy: 0.14, rx: 0.3, ry: 0.28 }, { cx: 0.04, cy: -0.34, rx: 0.34, ry: 0.26 },
];

function buildHogBristleBundle(seed: number): readonly HogBristleHair[] {
  const hairs: HogBristleHair[] = [];
  const goldenAngle = 2.399963229728653;
  // 48개 개별 돈모를 6개 붓모 다발 클러스터로 배치해 끌 때 실제 붓자국 고랑을 생성한다.
  for (let i = 0; i < HOG_BRISTLE_HAIR_COUNT; i += 1) {
    const tuftIdx = i % 6;
    const tuftCenterX = -0.66 + tuftIdx * 0.264;
    const localIdx = Math.floor(i / 6);
    const localR = Math.sqrt((localIdx + 0.5) / 8);
    const angle = localIdx * goldenAngle + tuftIdx * 1.13 + hash2d(i, 3, seed) * 0.45;
    hairs.push({
      cx: tuftCenterX + Math.cos(angle) * localR * 0.105 + (hash2d(i, 7, seed) - 0.5) * 0.045,
      cy: Math.sin(angle) * localR * 0.44 * (1 - 0.28 * tuftCenterX * tuftCenterX) + (hash2d(i, 11, seed) - 0.5) * 0.06,
      radius: 0.046 + hash2d(i, 17, seed) * 0.032,
      load: 0.72 + hash2d(i, 23, seed) * 0.28,
    });
  }
  return hairs;
}

function buildWaxCrayonCrumbs(seed: number): readonly CrayonCrumb[] {
  const crumbs: CrayonCrumb[] = [];
  for (let i = 0; i < 20; i += 1) {
    const angle = (i / 20) * Math.PI * 2 + hash2d(i, 1, seed) * 0.28;
    const dist = 0.72 + hash2d(i, 2, seed) * 0.21;
    crumbs.push({
      cx: Math.cos(angle) * dist,
      cy: Math.sin(angle) * dist,
      r: 0.028 + hash2d(i, 3, seed) * 0.044,
      strength: 0.42 + hash2d(i, 4, seed) * 0.48,
    });
  }
  return crumbs;
}

function evalGraphitePencil6b(nx: number, ny: number, seed: number): number {
  // 28° 비대칭 연필심 마모면(선단 첨예, 후단 완만 테이퍼) + 파쇄된 흑연 결정 립
  const angle = (28 * Math.PI) / 180;
  const c = Math.cos(angle); const s = Math.sin(angle);
  const bx = nx * c + ny * s; const by = -nx * s + ny * c;
  const sx = bx - 0.16; const sy = by + 0.05;
  const taper = sx > 0 ? Math.max(0.32, 1 - 0.62 * sx) : 1 + 0.18 * Math.abs(sx);
  const radial = Math.hypot(sx / (sx > 0 ? 0.66 : 0.88), sy / (0.46 * taper));
  const silhouette = 1 - smoothstep(0.84, 1.04, radial + (fbm2d(bx * 6.5 + 3.1, by * 7.2 - 1.4, seed, 3) - 0.5) * 0.18);
  if (silhouette <= 0.001) return 0;
  const bevelPressure = smoothstep(-0.85, 0.55, sx) * 0.52 + 0.48;
  const ridgeA = 1 - Math.abs(2 * fbm2d(bx * 10.5, by * 23, seed + 19, 3) - 1);
  const ridgeB = 1 - Math.abs(2 * fbm2d(bx * 19 - by * 9, by * 15, seed + 41, 2) - 1);
  const flake = 0.45 + 0.55 * hash2d(Math.floor((nx + 1) * 64), Math.floor((ny + 1) * 64), seed + 73);
  return clamp01(silhouette * bevelPressure * (0.24 + 0.52 * Math.pow(ridgeA, 1.35) + 0.24 * ridgeB * flake) * 1.12);
}

function evalWaxCrayonBlock(nx: number, ny: number, seed: number, crumbs: readonly CrayonCrumb[]): number {
  let minField = 99;
  for (let i = 0; i < WAX_CRAYON_LOBES.length; i += 1) {
    const lobe = WAX_CRAYON_LOBES[i];
    if (lobe) minField = Math.min(minField, Math.hypot((nx - lobe.cx) / lobe.rx, (ny - lobe.cy) / lobe.ry));
  }
  const theta = Math.atan2(ny, nx);
  const jagged = 0.07 * Math.cos(3 * theta + 0.4) + 0.05 * Math.sin(5 * theta - 0.8);
  const blockMask = 1 - smoothstep(0.86, 1.03, minField + jagged + (fbm2d(nx * 5.2 + 7, ny * 5.2 - 2, seed, 3) - 0.5) * 0.28);
  let waxValue = 0;
  if (blockMask > 0.001) {
    const clump = fbm2d(nx * 8.5 - 3, ny * 8.5 + 4, seed + 31, 3);
    const fineCavity = cellularEdge2d(nx * 6.5, ny * 6.5, seed + 67).f1;
    waxValue = blockMask * (0.32 + 0.68 * smoothstep(0.24, 0.58, clump) * (0.45 + 0.55 * smoothstep(0.18, 0.52, fineCavity)));
  }
  let crumbVal = 0;
  for (let i = 0; i < crumbs.length; i += 1) {
    const crumb = crumbs[i];
    if (!crumb) continue;
    const dist = Math.hypot(nx - crumb.cx, ny - crumb.cy);
    if (dist < crumb.r * 1.35) {
      crumbVal = Math.max(crumbVal, (1 - smoothstep(crumb.r * 0.45, crumb.r * 1.15, dist)) * crumb.strength);
    }
  }
  return clamp01(Math.max(waxValue, crumbVal));
}

function evalSquareCharcoal(nx: number, ny: number, seed: number): number {
  const angle = (6 * Math.PI) / 180;
  const c = Math.cos(angle); const s = Math.sin(angle);
  const rx = nx * c + ny * s; const ry = -nx * s + ny * c;
  const chipNoise = (fbm2d(rx * 11, ry * 11, seed + 13, 3) - 0.5) * 0.1;
  const sd = Math.max(
    sdRoundedBox(rx, ry, 0.74, 0.64, 0.05),
    rx + ry - 1.1 + chipNoise,
    -rx - ry - 1.14 + chipNoise,
    -rx + ry - 1.22 + chipNoise * 0.7,
  );
  const boxMask = 1 - smoothstep(-0.02, 0.055, sd + (fbm2d(rx * 14 + 2, ry * 14 - 5, seed + 29, 3) - 0.5) * 0.065);
  if (boxMask <= 0.001) return 0;
  const strata = 0.58 + 0.42 * fbm2d(rx * 4.5, ry * 21, seed + 53, 3);
  const crack = 1 - 0.45 * smoothstep(0.68, 0.88, 1 - Math.abs(2 * fbm2d(rx * 9, ry * 9, seed + 89, 2) - 1));
  return clamp01(boxMask * strata * crack * (0.55 + 0.45 * valueNoise2d(rx * 32, ry * 32, seed + 107)) * 1.15);
}

function evalSoftPastelChalk(nx: number, ny: number, seed: number): number {
  const outerHalo = 1 - smoothstep(0.58, 1.04, Math.hypot(nx / 0.84, ny / 0.76) + (fbm2d(nx * 4.5, ny * 4.5, seed, 2) - 0.5) * 0.18);
  if (outerHalo <= 0.001) return 0;
  // 다공성 분필 입자 클러스터: 중첩 미세 분필 알갱이 군집 + 다공성 공기 기공(크랙 선 방지)
  const clusterField = fbm2d(nx * 6.8 + 2.3, ny * 6.8 - 1.9, seed + 17, 3);
  const fineGranule = 1 - smoothstep(0.14, 0.58, cellularEdge2d(nx * 14.5 - 1.7, ny * 14.5 + 3.2, seed + 43).f1);
  const microPores = smoothstep(0.24, 0.62, valueNoise2d(nx * 26 + 5.1, ny * 26 - 3.4, seed + 71));
  const chalkDust = valueNoise2d(nx * 48, ny * 48, seed + 97);
  const body = (0.2 + 0.55 * smoothstep(0.26, 0.72, clusterField) + 0.4 * fineGranule) * (0.35 + 0.65 * microPores) * (0.65 + 0.35 * chalkDust);
  return clamp01(outerHalo * body * 1.32);
}

function evalSableWatercolor(nx: number, ny: number, seed: number): number {
  const yNorm = clamp01((ny + 0.86) / 1.66);
  const bellyWidth = 0.12 + 0.66 * Math.sin(Math.pow(yNorm, 0.72) * Math.PI);
  const rShape = Math.hypot((Math.abs(nx) / Math.max(0.06, bellyWidth)) * 0.88, Math.max(0, Math.abs(ny - 0.03) / 0.84 - 0.12) * 1.08);
  const r = rShape + (fbm2d(nx * 5.5 + 1.2, ny * 5.5 - 2.7, seed, 3) - 0.5) * 0.11;
  const waterHalo = 1 - smoothstep(0.66, 1.08, r);
  if (waterHalo <= 0.001) return 0;
  // 외곽 미세 모세관 경계(커피링) + 중앙 세이블 붓모 갈라짐
  const capillaryBand = Math.exp(-Math.pow((r - 0.79) / 0.085, 2));
  const innerWash = 0.56 + 0.16 * (1 - smoothstep(0, 0.75, r));
  const hairRibbons = 0.5 + 0.5 * Math.cos(nx * 34 + fbm2d(nx * 6, ny * 8, seed + 61, 2) * 2.4);
  const centerSplit = Math.exp(-Math.pow(nx / 0.11, 2)) * smoothstep(0.55, -0.55, ny);
  const splitCut = 1 - 0.42 * centerSplit * (1 - hairRibbons) - 0.14 * (1 - hairRibbons) * smoothstep(0.3, -0.7, ny);
  return clamp01(waterHalo * (innerWash + 0.34 * capillaryBand) * splitCut);
}

function evalHogBristleOil(nx: number, ny: number, hairs: readonly HogBristleHair[]): number {
  let maxBristle = 0; let bridgeSum = 0;
  for (let i = 0; i < hairs.length; i += 1) {
    const h = hairs[i];
    if (!h) continue;
    const d = Math.hypot(nx - h.cx, ny - h.cy);
    if (d < h.radius * 1.45) {
      maxBristle = Math.max(maxBristle, (1 - smoothstep(h.radius * 0.55, h.radius * 1.02, d)) * h.load);
      bridgeSum += Math.max(0, 1 - d / (h.radius * 1.45)) * 0.05;
    }
  }
  return clamp01(Math.max(maxBristle, Math.min(0.1, bridgeSum)));
}

function evalGpenNibElastic(nx: number, ny: number, pressure: number): number {
  const p = clamp01(pressure);
  const widthScale = 0.16 + 0.84 * Math.pow(p, 0.85);
  const tipY = -0.86; const tailY = 0.68;
  if (ny < tipY - 0.04 || ny > tailY + 0.04) return 0;
  const t = clamp01((ny - tipY) / (tailY - tipY));
  const halfWidth = widthScale * (t < 0.62 ? 0.025 + 0.62 * Math.pow(t / 0.62, 1.25) : 0.645 * (1 - 0.58 * Math.pow((t - 0.62) / 0.38, 1.4)));
  let ink = (1 - smoothstep(-0.014, 0.016, Math.abs(nx) - halfWidth)) * smoothstep(tipY - 0.018, tipY + 0.018, ny) * (1 - smoothstep(tailY - 0.03, tailY + 0.02, ny));
  if (ink <= 0.001) return 0;
  const slitStart = tipY + 0.16 * (1 - 0.4 * p);
  if (ny > slitStart && ny < 0.28) {
    const slitHalf = (0.01 + 0.036 * p) * (0.35 + 0.65 * ((ny - slitStart) / (0.28 - slitStart)));
    ink *= 0.18 + 0.82 * smoothstep(slitHalf * 0.55, slitHalf * 1.25, Math.abs(nx));
  }
  return clamp01(ink * (0.22 + 0.78 * smoothstep(0.055 * widthScale, 0.095 * widthScale, Math.hypot(nx, ny - 0.29))));
}

function evalMarkerChiselFelt(nx: number, ny: number, seed: number): number {
  const angle = (34 * Math.PI) / 180;
  const c = Math.cos(angle); const s = Math.sin(angle);
  const u = nx * c + ny * s; const v = -nx * s + ny * c;
  const skewedU = u + v * 0.22;
  const fiberTip = (Math.sin(v * 72 + seed) * 0.5 + 0.5) * 0.038;
  const fiberSide = (valueNoise2d(u * 38, v * 8, seed + 19) - 0.5) * 0.022;
  const body = 1 - smoothstep(-0.018, 0.024, sdRoundedBox(skewedU, v, 0.82 - fiberTip, 0.27 - fiberSide, 0.045));
  if (body <= 0.001) return 0;
  const striation = 0.9 + 0.1 * Math.cos(v * 68 + valueNoise2d(u * 12, v * 28, seed + 53) * 1.8);
  const endFray = Math.abs(skewedU) > 0.68 ? 0.84 + 0.16 * valueNoise2d(u * 48, v * 48, seed + 83) : 1;
  return clamp01(body * striation * endFray);
}

function downsampleBox2x(src: Float32Array, srcSize: number): Float32Array {
  const dstSize = srcSize >> 1;
  const dst = new Float32Array(dstSize * dstSize);
  for (let y = 0; y < dstSize; y += 1) {
    const r0 = (y << 1) * srcSize; const r1 = r0 + srcSize; const dr = y * dstSize;
    for (let x = 0; x < dstSize; x += 1) {
      const sx = x << 1;
      dst[dr + x] = ((src[r0 + sx] ?? 0) + (src[r0 + sx + 1] ?? 0) + (src[r1 + sx] ?? 0) + (src[r1 + sx + 1] ?? 0)) * 0.25;
    }
  }
  return dst;
}

export function buildTipMipmapPyramid(baseMask: Float32Array, baseSize: number = TIP_ATLAS_BASE_SIZE): TipMipmapPyramid {
  if (baseSize !== TIP_ATLAS_BASE_SIZE || baseMask.length !== TIP_ATLAS_BASE_SIZE * TIP_ATLAS_BASE_SIZE) {
    throw new Error(`Expected ${TIP_ATLAS_BASE_SIZE}x${TIP_ATLAS_BASE_SIZE} Float32Array tip mask.`);
  }
  const level64 = downsampleBox2x(baseMask, 128);
  const level32 = downsampleBox2x(level64, 64);
  const level16 = downsampleBox2x(level32, 32);
  return { level128: baseMask, level64, level32, level16, byteLength: baseMask.byteLength + level64.byteLength + level32.byteLength + level16.byteLength };
}

export function selectTipMipLevel(pyramid: TipMipmapPyramid, targetDiameterPx: number): { readonly size: TipMipSize; readonly data: Float32Array } {
  if (targetDiameterPx <= 20) return { size: 16, data: pyramid.level16 };
  if (targetDiameterPx <= 44) return { size: 32, data: pyramid.level32 };
  if (targetDiameterPx <= 88) return { size: 64, data: pyramid.level64 };
  return { size: 128, data: pyramid.level128 };
}

export function sampleTipMaskBilinear(pyramid: TipMipmapPyramid, u: number, v: number, targetDiameterPx: number): number {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const mip = selectTipMipLevel(pyramid, targetDiameterPx);
  const size = mip.size; const data = mip.data;
  const fx = u * (size - 1); const fy = v * (size - 1);
  const x0 = Math.floor(fx); const y0 = Math.floor(fy);
  const x1 = x0 + 1 < size ? x0 + 1 : x0; const y1 = y0 + 1 < size ? y0 + 1 : y0;
  const tx = fx - x0; const ty = fy - y0;
  const r0 = y0 * size; const r1 = y1 * size;
  const top = (data[r0 + x0] ?? 0) + ((data[r0 + x1] ?? 0) - (data[r0 + x0] ?? 0)) * tx;
  const bot = (data[r1 + x0] ?? 0) + ((data[r1 + x1] ?? 0) - (data[r1 + x0] ?? 0)) * tx;
  return top + (bot - top) * ty;
}

export function computeTipMaskStats(data: Float32Array, size: number, bristleCount = 0): TipMaskStats {
  const total = size * size;
  let sum = 0; let sumSq = 0; let active = 0; let cxSum = 0; let cySum = 0;
  let edgeGrad = 0; let edgeCount = 0; let asymDiff = 0;
  for (let y = 0; y < size; y += 1) {
    const ny = ((y + 0.5) / size) * 2 - 1;
    const row = y * size; const mRow = (size - 1 - y) * size;
    for (let x = 0; x < size; x += 1) {
      const val = data[row + x] ?? 0;
      sum += val; sumSq += val * val;
      if (val > 0.05) { active += 1; cxSum += (((x + 0.5) / size) * 2 - 1) * val; cySum += ny * val; }
      asymDiff += Math.abs(val - (data[mRow + (size - 1 - x)] ?? 0));
      if (x + 1 < size && y + 1 < size) {
        const gMag = Math.hypot((data[row + x + 1] ?? 0) - val, (data[row + size + x] ?? 0) - val);
        if (gMag > 0.08) { edgeGrad += gMag; edgeCount += 1; }
      }
    }
  }
  const yStart = Math.floor(size * 0.35); const yEnd = Math.floor(size * 0.65);
  const cols: number[] = [];
  for (let x = Math.floor(size * 0.12); x < Math.floor(size * 0.88); x += 1) {
    let cSum = 0;
    for (let y = yStart; y < yEnd; y += 1) cSum += data[y * size + x] ?? 0;
    cols.push(cSum / Math.max(1, yEnd - yStart));
  }
  let diffSq = 0;
  for (let i = 1; i < cols.length; i += 1) { const d = (cols[i] ?? 0) - (cols[i - 1] ?? 0); diffSq += d * d; }
  const mean = sum / total;
  return {
    coverage: active / total, mean, variance: Math.max(0, sumSq / total - mean * mean),
    centroidX: sum > 1e-6 ? cxSum / sum : 0, centroidY: sum > 1e-6 ? cySum / sum : 0,
    asymmetryScore: sum > 1e-6 ? asymDiff / (2 * sum) : 0,
    edgeSharpness: edgeCount > 0 ? edgeGrad / edgeCount : 0,
    furrowVariance: cols.length > 1 ? diffSq / (cols.length - 1) : 0,
    bristleCount,
  };
}

export function generateRealMediaTipMask(tipId: RealMediaTipId, options: RealMediaTipOptions = {}): RealMediaTipMask {
  const size = TIP_ATLAS_BASE_SIZE;
  const pressure = clamp01(options.pressure ?? 0.78);
  const seed = (options.seed ?? 20261123) | 0;
  const data = new Float32Array(size * size);
  const hogHairs = tipId === "hog-bristle-oil" ? buildHogBristleBundle(seed) : null;
  const waxCrumbs = tipId === "wax-crayon-block" ? buildWaxCrayonCrumbs(seed) : null;
  for (let y = 0; y < size; y += 1) {
    const ny = ((y + 0.5) / size) * 2 - 1;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      let val: number;
      if (tipId === "graphite-pencil-6b") val = evalGraphitePencil6b(nx, ny, seed);
      else if (tipId === "wax-crayon-block") val = evalWaxCrayonBlock(nx, ny, seed, waxCrumbs ?? []);
      else if (tipId === "square-charcoal") val = evalSquareCharcoal(nx, ny, seed);
      else if (tipId === "soft-pastel-chalk") val = evalSoftPastelChalk(nx, ny, seed);
      else if (tipId === "sable-watercolor") val = evalSableWatercolor(nx, ny, seed);
      else if (tipId === "hog-bristle-oil") val = evalHogBristleOil(nx, ny, hogHairs ?? []);
      else if (tipId === "gpen-nib-elastic") val = evalGpenNibElastic(nx, ny, pressure);
      else val = evalMarkerChiselFelt(nx, ny, seed);
      data[row + x] = val;
    }
  }
  const mipmaps = buildTipMipmapPyramid(data, size);
  const stats = computeTipMaskStats(data, size, hogHairs ? hogHairs.length : 0);
  return { tipId, size, pressure, seed, data, mipmaps, stats, byteLength: mipmaps.byteLength };
}

export function computeTipPairwiseDistance(maskA: Float32Array, maskB: Float32Array): number {
  const len = Math.min(maskA.length, maskB.length);
  if (len === 0) return 0;
  let sumAbs = 0; let eSum = 0;
  for (let i = 0; i < len; i += 1) {
    const a = maskA[i] ?? 0; const b = maskB[i] ?? 0;
    sumAbs += Math.abs(a - b); eSum += a + b;
  }
  return sumAbs / Math.max(1e-6, eSum);
}

export class RealMediaTipAtlasCache {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly entries = new Map<string, RealMediaTipMask>();
  private currentBytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: { readonly maxEntries?: number; readonly maxBytes?: number } = {}) {
    this.maxEntries = Math.max(8, options.maxEntries ?? 64);
    this.maxBytes = Math.max(1024 * 1024, options.maxBytes ?? 8 * 1024 * 1024);
  }

  get(tipId: RealMediaTipId, options: RealMediaTipOptions = {}): RealMediaTipMask {
    const pressure = clamp01(options.pressure ?? 0.78);
    const seed = (options.seed ?? 20261123) | 0;
    const qP = tipId === "gpen-nib-elastic" ? Math.round(pressure * 16) : 12;
    const key = `${tipId}:p${qP}:s${seed}`;
    const existing = this.entries.get(key);
    if (existing) {
      this.hits += 1; this.entries.delete(key); this.entries.set(key, existing);
      return existing;
    }
    this.misses += 1;
    const created = generateRealMediaTipMask(tipId, { pressure: tipId === "gpen-nib-elastic" ? qP / 16 : 0.78, seed });
    this.entries.set(key, created);
    this.currentBytes += created.byteLength;
    while (this.entries.size > this.maxEntries || this.currentBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) this.currentBytes = Math.max(0, this.currentBytes - oldest.byteLength);
      this.evictions += 1;
    }
    return created;
  }

  prewarmAll(seed = 20261123): void { for (const tipId of REAL_MEDIA_TIP_IDS) this.get(tipId, { seed }); }

  getStats(): TipAtlasCacheStats {
    return { entries: this.entries.size, maxEntries: this.maxEntries, bytes: this.currentBytes, maxBytes: this.maxBytes, hits: this.hits, misses: this.misses, evictions: this.evictions };
  }

  clear(): void { this.entries.clear(); this.currentBytes = 0; }
}

// ============================================================================
// Kubelka-Munk 16파장(400~700nm) 5안료 광학 혼색 엔진
// ============================================================================

const KM_BANDS = 16;
const CIE_XBAR = [0.0143, 0.1344, 0.3483, 0.2908, 0.0956, 0.0049, 0.0633, 0.2904, 0.5945, 0.9163, 1.0622, 0.8544, 0.4479, 0.1649, 0.0468, 0.0114];
const CIE_YBAR = [0.0004, 0.004, 0.023, 0.06, 0.139, 0.323, 0.71, 0.954, 0.995, 0.87, 0.631, 0.381, 0.175, 0.061, 0.017, 0.0041];
const CIE_ZBAR = [0.0679, 0.6456, 1.7471, 1.6692, 0.813, 0.272, 0.0782, 0.0203, 0.0039, 0.0017, 0.0008, 0.0002, 0, 0, 0, 0];
const CIE_D65 = [82.75, 93.43, 104.86, 117.81, 115.92, 109.35, 104.79, 107.69, 104.05, 96.33, 90.01, 87.7, 83.7, 80.03, 78.28, 71.61];

// 5안료 반사율 R(λ): 블루, 옐로, 레드, 티타늄 화이트(고산란 S=4.5), 아이보리 블랙
const PIGMENT_R_0 = [0.8, 0.88, 0.92, 0.86, 0.48, 0.3, 0.22, 0.12, 0.032, 0.018, 0.016, 0.016, 0.018, 0.02, 0.022, 0.025];
const PIGMENT_R_1 = [0.022, 0.022, 0.024, 0.028, 0.052, 0.48, 0.9, 0.96, 0.97, 0.97, 0.97, 0.97, 0.96, 0.96, 0.95, 0.95];
const PIGMENT_R_2 = [0.22, 0.18, 0.14, 0.06, 0.022, 0.018, 0.018, 0.028, 0.085, 0.36, 0.82, 0.94, 0.96, 0.96, 0.96, 0.95];
const PIGMENT_R_3 = [0.96, 0.985, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
const PIGMENT_R_4 = [0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008];
const S0 = 0.65; const S1 = 1.05; const S2 = 0.8; const S3 = 4.5; const S4 = 0.45;

function buildKCurve(refl: readonly number[], scatter: number): Float64Array {
  const k = new Float64Array(KM_BANDS);
  for (let i = 0; i < KM_BANDS; i += 1) { const r = refl[i] ?? 0.5; k[i] = (scatter * (1 - r) * (1 - r)) / (2 * r); }
  return k;
}

const K0 = buildKCurve(PIGMENT_R_0, S0);
const K1 = buildKCurve(PIGMENT_R_1, S1);
const K2 = buildKCurve(PIGMENT_R_2, S2);
const K3 = buildKCurve(PIGMENT_R_3, S3);
const K4 = buildKCurve(PIGMENT_R_4, S4);
const SPEC_TO_LIN_R = new Float64Array(KM_BANDS);
const SPEC_TO_LIN_G = new Float64Array(KM_BANDS);
const SPEC_TO_LIN_B = new Float64Array(KM_BANDS);

(function initSpectralMatrices(): void {
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < KM_BANDS; i += 1) {
    const d = CIE_D65[i] ?? 0;
    sx += (CIE_XBAR[i] ?? 0) * d; sy += (CIE_YBAR[i] ?? 0) * d; sz += (CIE_ZBAR[i] ?? 0) * d;
  }
  for (let i = 0; i < KM_BANDS; i += 1) {
    const d = CIE_D65[i] ?? 0;
    const wx = ((CIE_XBAR[i] ?? 0) * d * 0.95047) / sx;
    const wy = ((CIE_YBAR[i] ?? 0) * d) / sy;
    const wz = ((CIE_ZBAR[i] ?? 0) * d * 1.08883) / sz;
    SPEC_TO_LIN_R[i] = 3.2404542 * wx - 1.5371385 * wy - 0.4985314 * wz;
    SPEC_TO_LIN_G[i] = -0.969266 * wx + 1.8760108 * wy + 0.041556 * wz;
    SPEC_TO_LIN_B[i] = 0.0556434 * wx - 0.2040259 * wy + 1.0572252 * wz;
  }
})();

function srgbToLinear(u: number): number { const c = clamp01(u); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(u: number): number { const c = clamp01(u); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

interface PigmentConcEntry {
  readonly c0: number; readonly c1: number; readonly c2: number; readonly c3: number; readonly c4: number;
  readonly baseR: number; readonly baseG: number; readonly baseB: number;
}

const KM_CONC_CACHE_LIMIT = 4096;
const kmConcCache = new Map<number, PigmentConcEntry>();
const scratchLin = new Float64Array(3);

function evalPigmentsToLinear(c0: number, c1: number, c2: number, c3: number, c4: number, out: Float64Array): void {
  const invS = 1 / Math.max(1e-6, c0 * S0 + c1 * S1 + c2 * S2 + c3 * S3 + c4 * S4);
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < KM_BANDS; i += 1) {
    const u = (c0 * (K0[i] ?? 0) + c1 * (K1[i] ?? 0) + c2 * (K2[i] ?? 0) + c3 * (K3[i] ?? 0) + c4 * (K4[i] ?? 0)) * invS;
    const refl = 1 + u - Math.sqrt(u * u + 2 * u + 1e-12);
    r += (SPEC_TO_LIN_R[i] ?? 0) * refl; g += (SPEC_TO_LIN_G[i] ?? 0) * refl; b += (SPEC_TO_LIN_B[i] ?? 0) * refl;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

function resolvePigmentConc(ri: number, gi: number, bi: number): PigmentConcEntry {
  // 5비트 양자화(32³ 셀)로 부드러운 안료 농도 매니폴드를 고속 캐싱하고, 정확한 선형 잔차는 호출 측에서 보정한다.
  const qr = ri >> 3; const qg = gi >> 3; const qb = bi >> 3;
  const key = (qr << 10) | (qg << 5) | qb;
  const cached = kmConcCache.get(key);
  if (cached) return cached;

  const cr255 = Math.min(255, (qr << 3) + 4);
  const cg255 = Math.min(255, (qg << 3) + 4);
  const cb255 = Math.min(255, (qb << 3) + 4);
  const tr = srgbToLinear(cr255 / 255); const tg = srgbToLinear(cg255 / 255); const tb = srgbToLinear(cb255 / 255);
  const r = cr255 / 255; const g = cg255 / 255; const b = cb255 / 255;
  const mn = Math.min(r, g, b); const mx = Math.max(r, g, b);
  const cr = r - mn; const cg = g - mn; const cb = b - mn;
  const yel = Math.min(cr, cg) + Math.max(0, cg - cr) * 0.6;
  const red = Math.max(0, cr - cg);
  const blu = cb + Math.max(0, cg - cr) * 0.6;
  const sum = blu + yel + red + mn * 0.5 + (1 - mx) * 0.4 + 1e-9;
  const c = [blu / sum, yel / sum, red / sum, (mn * 0.5) / sum, ((1 - mx) * 0.4) / sum];

  const lossOf = (): number => {
    evalPigmentsToLinear(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0, c[4] ?? 0, scratchLin);
    const d0 = (scratchLin[0] ?? 0) - tr; const d1 = (scratchLin[1] ?? 0) - tg; const d2 = (scratchLin[2] ?? 0) - tb;
    return d0 * d0 + d1 * d1 + d2 * d2;
  };
  let bestLoss = lossOf();
  for (let delta = 0.25; delta >= 0.007 && bestLoss >= 2e-5; delta *= 0.5) {
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) {
        const ci = c[i] ?? 0; const cj = c[j] ?? 0;
        const dPlus = Math.min(delta, cj);
        if (dPlus > 1e-6) {
          c[i] = ci + dPlus; c[j] = cj - dPlus;
          const l = lossOf();
          if (l < bestLoss) { bestLoss = l; continue; }
          c[i] = ci; c[j] = cj;
        }
        const dMinus = Math.min(delta, ci);
        if (dMinus > 1e-6) {
          c[i] = ci - dMinus; c[j] = cj + dMinus;
          const l = lossOf();
          if (l < bestLoss) { bestLoss = l; continue; }
          c[i] = ci; c[j] = cj;
        }
      }
    }
  }
  evalPigmentsToLinear(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0, c[4] ?? 0, scratchLin);
  const entry: PigmentConcEntry = {
    c0: c[0] ?? 0, c1: c[1] ?? 0, c2: c[2] ?? 0, c3: c[3] ?? 0, c4: c[4] ?? 0,
    baseR: scratchLin[0] ?? 0, baseG: scratchLin[1] ?? 0, baseB: scratchLin[2] ?? 0,
  };
  if (kmConcCache.size >= KM_CONC_CACHE_LIMIT) {
    const oldest = kmConcCache.keys().next().value;
    if (oldest !== undefined) kmConcCache.delete(oldest);
  }
  kmConcCache.set(key, entry);
  return entry;
}

export function mixPigmentsKubelkaMunkFast(
  r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, ratio: number, out: [number, number, number],
): void {
  const t = clamp01(ratio);
  const ri1 = clampByte(r1); const gi1 = clampByte(g1); const bi1 = clampByte(b1);
  if (t <= 0) { out[0] = ri1; out[1] = gi1; out[2] = bi1; return; }
  const ri2 = clampByte(r2); const gi2 = clampByte(g2); const bi2 = clampByte(b2);
  if (t >= 1) { out[0] = ri2; out[1] = gi2; out[2] = bi2; return; }
  if (ri1 === ri2 && gi1 === gi2 && bi1 === bi2) { out[0] = ri1; out[1] = gi1; out[2] = bi1; return; }
  const l1 = resolvePigmentConc(ri1, gi1, bi1);
  const l2 = resolvePigmentConc(ri2, gi2, bi2);
  const w1 = 1 - t;
  const resR1 = srgbToLinear(ri1 / 255) - l1.baseR;
  const resG1 = srgbToLinear(gi1 / 255) - l1.baseG;
  const resB1 = srgbToLinear(bi1 / 255) - l1.baseB;
  const resR2 = srgbToLinear(ri2 / 255) - l2.baseR;
  const resG2 = srgbToLinear(gi2 / 255) - l2.baseG;
  const resB2 = srgbToLinear(bi2 / 255) - l2.baseB;
  evalPigmentsToLinear(w1 * l1.c0 + t * l2.c0, w1 * l1.c1 + t * l2.c1, w1 * l1.c2 + t * l2.c2, w1 * l1.c3 + t * l2.c3, w1 * l1.c4 + t * l2.c4, scratchLin);
  out[0] = clampByte(linearToSrgb((scratchLin[0] ?? 0) + w1 * resR1 + t * resR2) * 255);
  out[1] = clampByte(linearToSrgb((scratchLin[1] ?? 0) + w1 * resG1 + t * resG2) * 255);
  out[2] = clampByte(linearToSrgb((scratchLin[2] ?? 0) + w1 * resB1 + t * resB2) * 255);
}

export function mixPigmentsKubelkaMunk(colorA: RgbColor, colorB: RgbColor, ratio: number): RgbColor {
  const out: [number, number, number] = [0, 0, 0];
  mixPigmentsKubelkaMunkFast(colorA.r, colorA.g, colorA.b, colorB.r, colorB.g, colorB.b, ratio, out);
  return { r: out[0], g: out[1], b: out[2] };
}

function computeHslSaturation(color: RgbColor): number {
  const r = color.r / 255; const g = color.g / 255; const b = color.b / 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
  const d = mx - mn;
  return d <= 1e-6 ? 0 : d / (1 - Math.abs(mx + mn - 1));
}

export function mixPigmentsKubelkaMunkDetailed(colorA: RgbColor, colorB: RgbColor, ratio: number): KubelkaMunkMixResult {
  const t = clamp01(ratio);
  const color = mixPigmentsKubelkaMunk(colorA, colorB, t);
  const srgbLerp: RgbColor = {
    r: clampByte(colorA.r + (colorB.r - colorA.r) * t),
    g: clampByte(colorA.g + (colorB.g - colorA.g) * t),
    b: clampByte(colorA.b + (colorB.b - colorA.b) * t),
  };
  return {
    color, srgbLerp,
    kmGreenDominance: color.g - Math.max(color.r, color.b),
    lerpGreenDominance: srgbLerp.g - Math.max(srgbLerp.r, srgbLerp.b),
    kmSaturation: computeHslSaturation(color),
    lerpSaturation: computeHslSaturation(srgbLerp),
  };
}
