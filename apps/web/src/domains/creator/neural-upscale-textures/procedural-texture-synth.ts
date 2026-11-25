/**
 * Wave 40C — 토러스 매핑 주기 노이즈 기반 심리스(이음매 오차 0) 절차적 PBR·망점 텍스처 합성기.
 *
 * - 4D 토러스 매핑 `(cos 2πu, sin 2πu, cos 2πv, sin 2πv)` + 정수 주기 격자/파동으로 경계 오차 0 보장
 * - 웹툰·3D 배경 실전 재질 6종:
 *   `hanji-fiber` · `linen-weave` · `red-brick` · `marble-vein` · `oak-woodgrain` · `vintage-halftone`
 * - Albedo RGBA + 토러스 래핑 Sobel Normal Map RGBA + Roughness R 채널 버퍼 동시 출력
 */

import { assertImageGeometry, assertRgbaBuffer } from "./image-buffer-contract";

export type ProceduralMaterialId =
  | "hanji-fiber"
  | "linen-weave"
  | "red-brick"
  | "marble-vein"
  | "oak-woodgrain"
  | "vintage-halftone";

export interface ProceduralMaterialPreset {
  readonly id: ProceduralMaterialId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly categoryKo: string;
  readonly categoryEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly defaultTileScale: number;
  readonly defaultNormalStrength: number;
  readonly defaultRoughnessBias: number;
}

export interface ProceduralTextureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly tileScale?: number;
  readonly normalStrength?: number;
  readonly roughnessBias?: number;
}

export interface ResolvedTextureOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly tileScale: number;
  readonly normalStrength: number;
  readonly roughnessBias: number;
}

export interface TileSeamContinuityReport {
  readonly horizontalSeamMeanDiff: number;
  readonly verticalSeamMeanDiff: number;
  readonly interiorHorizontalMeanDiff: number;
  readonly interiorVerticalMeanDiff: number;
  readonly seamToInteriorRatio: number;
  readonly periodicBoundaryError: number;
  readonly continuityScore: number;
  readonly isSeamless: boolean;
}

export interface ProceduralTextureMetadata {
  readonly materialId: ProceduralMaterialId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly tileScale: number;
  readonly normalStrength: number;
  readonly roughnessBias: number;
  readonly meanRoughness: number;
  readonly periodicBoundaryError: number;
  readonly generationTimeMs: number;
}

export interface ProceduralTextureResult {
  readonly materialId: ProceduralMaterialId;
  readonly width: number;
  readonly height: number;
  readonly albedoRgba: Uint8ClampedArray;
  readonly normalRgba: Uint8ClampedArray;
  readonly roughnessR: Uint8ClampedArray;
  readonly heightField: Float32Array;
  readonly seamReport: TileSeamContinuityReport;
  readonly normalSeamReport: TileSeamContinuityReport;
  readonly options: ResolvedTextureOptions;
  readonly metadata: ProceduralTextureMetadata;
}

interface MaterialPixelSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly height: number;
  readonly roughness: number;
}

const TAU = Math.PI * 2;

export const PROCEDURAL_MATERIAL_PRESETS: readonly ProceduralMaterialPreset[] = [
  {
    id: "hanji-fiber",
    labelKo: "한지 섬유",
    labelEn: "Hanji Fiber",
    categoryKo: "종이·원고지",
    categoryEn: "Paper",
    descriptionKo: "닥나무 섬유결이 교차하는 따뜻한 전통 한지 질감과 미세 펄프 요철",
    descriptionEn: "Warm mulberry paper pulp with crisscrossing organic fiber relief",
    defaultTileScale: 2,
    defaultNormalStrength: 1.6,
    defaultRoughnessBias: 0,
  },
  {
    id: "linen-weave",
    labelKo: "린넨 직물",
    labelEn: "Linen Weave",
    categoryKo: "패브릭·의상",
    categoryEn: "Fabric",
    descriptionKo: "경사·위사가 교차하는 평직 린넨 직조 패턴과 실 꼬임 미세 요철",
    descriptionEn: "Interlaced warp-and-weft natural flax weave with yarn twist detail",
    defaultTileScale: 2,
    defaultNormalStrength: 2.2,
    defaultRoughnessBias: 0,
  },
  {
    id: "red-brick",
    labelKo: "적벽돌",
    labelEn: "Red Brick",
    categoryKo: "건축·배경",
    categoryEn: "Masonry",
    descriptionKo: "엇갈림 쌓기(Running Bond) 적벽돌과 오목한 석회 줄눈·가마 색편차",
    descriptionEn: "Running-bond kiln red brick with recessed mortar joints and surface grit",
    defaultTileScale: 2,
    defaultNormalStrength: 3.1,
    defaultRoughnessBias: 0,
  },
  {
    id: "marble-vein",
    labelKo: "대리석 베인",
    labelEn: "Marble Vein",
    categoryKo: "석재·실내",
    categoryEn: "Stone",
    descriptionKo: "도메인 워프 칼사이트 대리석 광택 표면과 짙은 광물 맥 균열",
    descriptionEn: "Domain-warped polished calcite marble with slate and warm mineral veins",
    defaultTileScale: 1,
    defaultNormalStrength: 1.3,
    defaultRoughnessBias: 0,
  },
  {
    id: "oak-woodgrain",
    labelKo: "오크 나뭇결",
    labelEn: "Oak Woodgrain",
    categoryKo: "목재·가구",
    categoryEn: "Wood",
    descriptionKo: "춘재·추재 나이테 굴곡과 세로 목재 도관이 살아 있는 오크 원목",
    descriptionEn: "Natural oak annual growth rings with elongated wood pores and satin sheen",
    defaultTileScale: 2,
    defaultNormalStrength: 2.0,
    defaultRoughnessBias: 0,
  },
  {
    id: "vintage-halftone",
    labelKo: "빈티지 망점 톤",
    labelEn: "Vintage Halftone",
    categoryKo: "웹툰·스크린톤",
    categoryEn: "Screentone",
    descriptionKo: "45° 회전 다이아몬드 격자 인쇄 망점과 은은한 잉크 압력·종이 결 변화",
    descriptionEn: "45-degree rotated manga screentone dots with subtle press grain",
    defaultTileScale: 2,
    defaultNormalStrength: 1.4,
    defaultRoughnessBias: 0,
  },
] as const;

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const iv = Math.trunc(v);
  return iv < min ? min : iv > max ? max : iv;
}

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function fadeQuintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function posModInt(value: number, period: number): number {
  const m = value % period;
  return m < 0 ? m + period : m;
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash4(x: number, y: number, z: number, w: number, seed: number): number {
  let h =
    (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) +
      Math.imul(w, 1274126177) + Math.imul(seed, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise4D(x: number, y: number, z: number, w: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const iw = Math.floor(w);
  const fx = fadeQuintic(x - ix);
  const fy = fadeQuintic(y - iy);
  const fz = fadeQuintic(z - iz);
  const fw = fadeQuintic(w - iw);
  let sum = 0;
  for (let dw = 0; dw <= 1; dw += 1) {
    const ww = dw === 0 ? 1 - fw : fw;
    for (let dz = 0; dz <= 1; dz += 1) {
      const wz = ww * (dz === 0 ? 1 - fz : fz);
      for (let dy = 0; dy <= 1; dy += 1) {
        const wy = wz * (dy === 0 ? 1 - fy : fy);
        sum += wy * lerp(hash4(ix, iy + dy, iz + dz, iw + dw, seed), hash4(ix + 1, iy + dy, iz + dz, iw + dw, seed), fx);
      }
    }
  }
  return sum;
}

/** 4D 토러스 매핑 주기 노이즈: `(cos 2πu, sin 2πu, cos 2πv, sin 2πv)`로 경계 연속성 C∞ 보장. */
function torusNoise4D(u: number, v: number, radius: number, seed: number): number {
  const tu = TAU * u;
  const tv = TAU * v;
  return valueNoise4D(Math.cos(tu) * radius, Math.sin(tu) * radius, Math.cos(tv) * radius, Math.sin(tv) * radius, seed);
}

function torusFbm4D(u: number, v: number, baseRadius: number, octaves: number, seed: number): number {
  let amp = 0.5;
  let total = 0;
  let norm = 0;
  let radius = baseRadius;
  for (let o = 0; o < octaves; o += 1) {
    total += torusNoise4D(u, v, radius, seed + o * 97) * amp;
    norm += amp;
    radius *= 2.02;
    amp *= 0.5;
  }
  return norm > 0 ? total / norm : 0.5;
}

function periodicNoise2D(u: number, v: number, periodX: number, periodY: number, seed: number): number {
  const px = Math.max(1, Math.round(periodX));
  const py = Math.max(1, Math.round(periodY));
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fadeQuintic(x - ix);
  const fy = fadeQuintic(y - iy);
  const x0 = posModInt(ix, px);
  const x1 = posModInt(ix + 1, px);
  const y0 = posModInt(iy, py);
  const y1 = posModInt(iy + 1, py);
  return lerp(
    lerp(hash2(x0, y0, seed), hash2(x1, y0, seed), fx),
    lerp(hash2(x0, y1, seed), hash2(x1, y1, seed), fx),
    fy,
  );
}

function evaluateHanjiFiber(u: number, v: number, ts: number, seed: number, rBias: number): MaterialPixelSample {
  const pulp = torusFbm4D(u, v, 1.35 * ts, 3, seed);
  const fineGrain = periodicNoise2D(u, v, 24 * ts, 24 * ts, seed + 41);
  const warp = (pulp - 0.5) * 2.4;
  const f1 = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(TAU * ts * (3 * u + v) + warp * 1.4 + seed * 0.13))), 12);
  const f2 = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(TAU * ts * (-2 * u + 4 * v) - warp * 1.2 + seed * 0.27))), 14);
  const f3 = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(TAU * ts * (5 * u - 3 * v) + warp * 1.1 + seed * 0.41))), 16);
  const fiber = clamp(f1 * 0.55 + f2 * 0.45 + f3 * 0.35, 0, 1);
  const shift = (pulp - 0.5) * 14 + (fineGrain - 0.5) * 8;
  return {
    r: clamp(241 + shift + fiber * 9, 0, 255),
    g: clamp(234 + shift * 0.92 + fiber * 7, 0, 255),
    b: clamp(218 + shift * 0.8 + fiber * 3, 0, 255),
    height: clamp(0.45 + (pulp - 0.5) * 0.28 + (fineGrain - 0.5) * 0.14 + fiber * 0.36, 0, 1),
    roughness: clamp(0.87 - fiber * 0.09 + (fineGrain - 0.5) * 0.06 + rBias, 0.05, 0.99),
  };
}

function evaluateLinenWeave(u: number, v: number, ts: number, seed: number, rBias: number): MaterialPixelSample {
  const threads = 8 * ts; // 짝수 정수 -> PI * threads = TAU * (4 * ts), 완벽한 토러스 주기
  const phaseU = Math.sin(Math.PI * u * threads);
  const phaseV = Math.sin(Math.PI * v * threads);
  const absU = Math.abs(phaseU);
  const absV = Math.abs(phaseV);
  const signU = phaseU >= 0 ? 1 : -1;
  const signV = phaseV >= 0 ? 1 : -1;

  // 연속 평직(Plain Weave) 경사·위사 입체 교차 높이 (0 지점에서 Lipschitz 연속, 토러스 경계 오차 0)
  const profU = absU * (1.65 - 0.65 * absU);
  const profV = absV * (1.65 - 0.65 * absV);
  const hWarp = profU * (0.62 + 0.38 * signU * phaseV);
  const hWeft = profV * (0.62 - 0.38 * signV * phaseU);
  const warpBlend = smoothstep(-0.08, 0.08, hWarp - hWeft);
  const crown = Math.max(hWarp, hWeft);

  const slub = torusFbm4D(u, v, 1.8 * ts, 2, seed);
  const twist = periodicNoise2D(u, v, threads * 2, threads * 2, seed + 53);
  const shade = 0.72 + crown * 0.34 + (slub - 0.5) * 0.1 + (twist - 0.5) * 0.06;
  const tint = lerp(-4, 5, warpBlend);
  return {
    r: clamp((212 + tint) * shade, 0, 255),
    g: clamp((200 + tint * 0.8) * shade, 0, 255),
    b: clamp((178 + tint * 0.5) * shade, 0, 255),
    height: clamp(0.14 + crown * 0.76 + (twist - 0.5) * 0.1, 0, 1),
    roughness: clamp(0.86 - crown * 0.14 + (twist - 0.5) * 0.06 + rBias, 0.05, 0.99),
  };
}

function evaluateRedBrick(u: number, v: number, ts: number, seed: number, rBias: number): MaterialPixelSample {
  const cols = 2 * ts;
  const rows = 4 * ts;
  // +0.5(수직)/+0.25(수평) 위상 정렬로 짝·홀수 행 모두 타일 경계가 벽돌 평면을 매끄럽게 통과
  const yv = v * rows + 0.5;
  const ry = posModInt(Math.floor(yv), rows);
  const by = yv - Math.floor(yv);
  const xu = (u + ((ry & 1) === 1 ? 0.5 / cols : 0)) * cols + 0.25;
  const rx = posModInt(Math.floor(xu), cols);
  const bx = xu - Math.floor(xu);
  const mask = smoothstep(0.035, 0.075, Math.min(bx, 1 - bx)) * smoothstep(0.065, 0.135, Math.min(by, 1 - by));
  const grit = torusFbm4D(u, v, 2.5 * ts, 3, seed);
  const pit = periodicNoise2D(u, v, 24 * ts, 24 * ts, seed + 67);
  const kiln = hash2(rx, ry, seed + 101);
  return {
    r: clamp(lerp(192 + (grit - 0.5) * 18 + (pit - 0.5) * 10, 166 + kiln * 28 + (grit - 0.5) * 24 - (1 - pit) * 10, mask), 0, 255),
    g: clamp(lerp(186 + (grit - 0.5) * 16 + (pit - 0.5) * 10, 68 + kiln * 16 + (grit - 0.5) * 14 - (1 - pit) * 6, mask), 0, 255),
    b: clamp(lerp(174 + (grit - 0.5) * 14 + (pit - 0.5) * 8, 52 + kiln * 12 + (grit - 0.5) * 10 - (1 - pit) * 5, mask), 0, 255),
    height: clamp(lerp(0.16 + (pit - 0.5) * 0.08, 0.74 + (grit - 0.5) * 0.16 + (pit - 0.5) * 0.08, mask), 0, 1),
    roughness: clamp(lerp(0.93 + (pit - 0.5) * 0.05, 0.8 + (1 - pit) * 0.1, mask) + rBias, 0.05, 0.99),
  };
}

function evaluateMarbleVein(u: number, v: number, ts: number, seed: number, rBias: number): MaterialPixelSample {
  const w1 = torusFbm4D(u, v, 1.3 * ts, 3, seed);
  const w2 = torusFbm4D(u + 0.37, v + 0.61, 2.6 * ts, 2, seed + 29);
  const v1 = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(TAU * ts * (u + v) + 3.8 * w1 + 1.3 * w2))), 10);
  const v2 = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(TAU * ts * (2 * u - v) + 2.9 * w2 - 1.5 * w1))), 6) * 0.65;
  const r0 = lerp(236 + (w1 - 0.5) * 12, 168, v2);
  const g0 = lerp(233 + (w1 - 0.5) * 11, 157, v2);
  const b0 = lerp(228 + (w1 - 0.5) * 10, 142, v2);
  return {
    r: clamp(lerp(r0, 64, v1), 0, 255),
    g: clamp(lerp(g0, 70, v1), 0, 255),
    b: clamp(lerp(b0, 79, v1), 0, 255),
    height: clamp(0.78 - v1 * 0.34 - v2 * 0.14 + (w2 - 0.5) * 0.06, 0, 1),
    roughness: clamp(0.18 + v1 * 0.24 + v2 * 0.1 + (w2 - 0.5) * 0.04 + rBias, 0.04, 0.99),
  };
}

function evaluateOakWoodgrain(u: number, v: number, ts: number, seed: number, rBias: number): MaterialPixelSample {
  const turb = torusFbm4D(u, v, 1.35 * ts, 3, seed);
  const poreNoise = periodicNoise2D(u, v, 20 * ts, 4 * ts, seed + 79);
  const rayNoise = periodicNoise2D(u, v, 6 * ts, 18 * ts, seed + 131);
  const late = Math.pow(0.5 + 0.5 * Math.sin(TAU * ts * (4 * u) + 2.5 * turb), 1.35);
  const pore = smoothstep(0.76, 0.94, poreNoise);
  const woodR = lerp(194 + (rayNoise - 0.5) * 14, 128 + (turb - 0.5) * 14, late);
  const woodG = lerp(148 + (rayNoise - 0.5) * 11, 86 + (turb - 0.5) * 10, late);
  const woodB = lerp(96 + (rayNoise - 0.5) * 8, 48 + (turb - 0.5) * 8, late);
  return {
    r: clamp(lerp(woodR, 74, pore * 0.65), 0, 255),
    g: clamp(lerp(woodG, 48, pore * 0.65), 0, 255),
    b: clamp(lerp(woodB, 28, pore * 0.65), 0, 255),
    height: clamp(0.64 - late * 0.18 - pore * 0.34 + (turb - 0.5) * 0.1, 0, 1),
    roughness: clamp(0.48 + late * 0.1 + pore * 0.2 + (rayNoise - 0.5) * 0.05 + rBias, 0.05, 0.99),
  };
}

function evaluateVintageHalftone(u: number, v: number, ts: number, seed: number, rBias: number): MaterialPixelSample {
  const freq = 6 * ts;
  const p = (u + v) * freq;
  const q = (u - v) * freq;
  const dist = Math.hypot(p - Math.floor(p) - 0.5, q - Math.floor(q) - 0.5);
  const press = torusFbm4D(u, v, 1.5 * ts, 2, seed);
  const grain = periodicNoise2D(u, v, 24 * ts, 24 * ts, seed + 89);
  const radius = 0.25 + press * 0.09;
  const dot = 1 - smoothstep(radius - 0.045, radius + 0.045, dist);
  return {
    r: clamp(lerp(238 + (grain - 0.5) * 12, 34 + (press - 0.5) * 10, dot), 0, 255),
    g: clamp(lerp(231 + (grain - 0.5) * 11, 37 + (press - 0.5) * 10, dot), 0, 255),
    b: clamp(lerp(216 + (grain - 0.5) * 10, 44 + (press - 0.5) * 10, dot), 0, 255),
    height: clamp(0.62 - dot * 0.28 + (grain - 0.5) * 0.16, 0, 1),
    roughness: clamp(lerp(0.83, 0.61, dot) + (grain - 0.5) * 0.05 + rBias, 0.05, 0.99),
  };
}

function evaluateMaterialAt(
  id: ProceduralMaterialId,
  u: number,
  v: number,
  ts: number,
  seed: number,
  rBias: number,
): MaterialPixelSample {
  switch (id) {
    case "hanji-fiber":
      return evaluateHanjiFiber(u, v, ts, seed, rBias);
    case "linen-weave":
      return evaluateLinenWeave(u, v, ts, seed, rBias);
    case "red-brick":
      return evaluateRedBrick(u, v, ts, seed, rBias);
    case "marble-vein":
      return evaluateMarbleVein(u, v, ts, seed, rBias);
    case "oak-woodgrain":
      return evaluateOakWoodgrain(u, v, ts, seed, rBias);
    case "vintage-halftone":
      return evaluateVintageHalftone(u, v, ts, seed, rBias);
  }
}

function measureContinuousPeriodicError(
  id: ProceduralMaterialId,
  ts: number,
  seed: number,
  rBias: number,
): number {
  const probes = 32;
  let maxErr = 0;
  for (let i = 0; i < probes; i += 1) {
    const t = i / probes;
    const h0 = evaluateMaterialAt(id, 0, t, ts, seed, rBias);
    const h1 = evaluateMaterialAt(id, 1, t, ts, seed, rBias);
    const v0 = evaluateMaterialAt(id, t, 0, ts, seed, rBias);
    const v1 = evaluateMaterialAt(id, t, 1, ts, seed, rBias);
    maxErr = Math.max(
      maxErr,
      Math.abs(h0.r - h1.r) / 255, Math.abs(h0.g - h1.g) / 255, Math.abs(h0.b - h1.b) / 255,
      Math.abs(h0.height - h1.height), Math.abs(h0.roughness - h1.roughness),
      Math.abs(v0.r - v1.r) / 255, Math.abs(v0.g - v1.g) / 255, Math.abs(v0.b - v1.b) / 255,
      Math.abs(v0.height - v1.height), Math.abs(v0.roughness - v1.roughness),
    );
  }
  return maxErr < 1e-11 ? 0 : Number(maxErr.toFixed(12));
}

function rgbMeanL1Diff(rgba: Uint8ClampedArray, idxA: number, idxB: number): number {
  return (
    Math.abs((rgba[idxA] ?? 0) - (rgba[idxB] ?? 0)) +
    Math.abs((rgba[idxA + 1] ?? 0) - (rgba[idxB + 1] ?? 0)) +
    Math.abs((rgba[idxA + 2] ?? 0) - (rgba[idxB + 2] ?? 0))
  ) / 3;
}

/** RGBA 버퍼의 수평·수직 타일 경계 연속성(심리스 품질)을 정량 측정한다. */
export function measureTileSeamContinuity(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  periodicBoundaryError: number = 0,
): TileSeamContinuityReport {
  assertRgbaBuffer({ width, height, data: rgba });
  if (width < 2 || height < 2 || !Number.isFinite(periodicBoundaryError) || periodicBoundaryError < 0) {
    throw new RangeError("타일 측정은 최소 2×2이고 경계 오차는 유한한 음이 아닌 수여야 합니다.");
  }
  const w = width;
  const h = height;
  const inv255 = 1 / 255;

  let hSeamSum = 0;
  let hAdjSum = 0;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    hSeamSum += rgbMeanL1Diff(rgba, (row + (w - 1)) * 4, row * 4);
    hAdjSum +=
      0.5 *
      (rgbMeanL1Diff(rgba, row * 4, (row + 1) * 4) +
        rgbMeanL1Diff(rgba, (row + w - 2) * 4, (row + w - 1) * 4));
  }
  const horizontalSeamMeanDiff = (hSeamSum / h) * inv255;
  const horizontalAdjMeanDiff = (hAdjSum / h) * inv255;

  let vSeamSum = 0;
  let vAdjSum = 0;
  for (let x = 0; x < w; x += 1) {
    vSeamSum += rgbMeanL1Diff(rgba, ((h - 1) * w + x) * 4, x * 4);
    vAdjSum +=
      0.5 *
      (rgbMeanL1Diff(rgba, x * 4, (w + x) * 4) +
        rgbMeanL1Diff(rgba, ((h - 2) * w + x) * 4, ((h - 1) * w + x) * 4));
  }
  const verticalSeamMeanDiff = (vSeamSum / w) * inv255;
  const verticalAdjMeanDiff = (vAdjSum / w) * inv255;

  let intHSum = 0;
  let intVSum = 0;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w - 1; x += 1) {
      intHSum += rgbMeanL1Diff(rgba, (row + x) * 4, (row + x + 1) * 4);
    }
  }
  for (let y = 0; y < h - 1; y += 1) {
    const rowA = y * w;
    const rowB = (y + 1) * w;
    for (let x = 0; x < w; x += 1) {
      intVSum += rgbMeanL1Diff(rgba, (rowA + x) * 4, (rowB + x) * 4);
    }
  }
  const interiorHorizontalMeanDiff = (intHSum / Math.max(1, h * (w - 1))) * inv255;
  const interiorVerticalMeanDiff = (intVSum / Math.max(1, (h - 1) * w)) * inv255;

  const hRef = Math.max(interiorHorizontalMeanDiff, horizontalAdjMeanDiff);
  const vRef = Math.max(interiorVerticalMeanDiff, verticalAdjMeanDiff);
  const hRatio = hRef < 0.0005 ? (horizontalSeamMeanDiff < 0.0005 ? 1 : 10) : horizontalSeamMeanDiff / hRef;
  const vRatio = vRef < 0.0005 ? (verticalSeamMeanDiff < 0.0005 ? 1 : 10) : verticalSeamMeanDiff / vRef;

  const seamToInteriorRatio = Math.max(hRatio, vRatio);
  const excess = Math.max(0, seamToInteriorRatio - 1.15);
  const boundaryPenalty = periodicBoundaryError > 1e-6 ? Math.min(40, periodicBoundaryError * 100) : 0;
  const continuityScore = clamp(100 * Math.exp(-0.55 * excess) - boundaryPenalty, 0, 100);

  return {
    horizontalSeamMeanDiff: Number(horizontalSeamMeanDiff.toFixed(5)),
    verticalSeamMeanDiff: Number(verticalSeamMeanDiff.toFixed(5)),
    interiorHorizontalMeanDiff: Number(interiorHorizontalMeanDiff.toFixed(5)),
    interiorVerticalMeanDiff: Number(interiorVerticalMeanDiff.toFixed(5)),
    seamToInteriorRatio: Number(seamToInteriorRatio.toFixed(3)),
    periodicBoundaryError,
    continuityScore: Number(continuityScore.toFixed(2)),
    isSeamless: seamToInteriorRatio <= 1.75 && periodicBoundaryError <= 1e-6,
  };
}

function buildSeamlessSobelNormalMap(
  heightField: Float32Array,
  width: number,
  height: number,
  normalStrength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const gain = normalStrength * 4.2;
  for (let y = 0; y < height; y += 1) {
    const ym = y === 0 ? height - 1 : y - 1;
    const yp = y === height - 1 ? 0 : y + 1;
    for (let x = 0; x < width; x += 1) {
      const xm = x === 0 ? width - 1 : x - 1;
      const xp = x === width - 1 ? 0 : x + 1;
      const tl = heightField[ym * width + xm] ?? 0;
      const tc = heightField[ym * width + x] ?? 0;
      const tr = heightField[ym * width + xp] ?? 0;
      const ml = heightField[y * width + xm] ?? 0;
      const mr = heightField[y * width + xp] ?? 0;
      const bl = heightField[yp * width + xm] ?? 0;
      const bc = heightField[yp * width + x] ?? 0;
      const br = heightField[yp * width + xp] ?? 0;
      const nx = -((-tl + tr - 2 * ml + 2 * mr - bl + br) * 0.125) * gain;
      const ny = -((-tl - 2 * tc - tr + bl + 2 * bc + br) * 0.125) * gain;
      const invLen = 1 / Math.hypot(nx, ny, 1);
      const k = (y * width + x) * 4;
      out[k] = clampInt(Math.round((nx * invLen * 0.5 + 0.5) * 255), 0, 255);
      out[k + 1] = clampInt(Math.round((ny * invLen * 0.5 + 0.5) * 255), 0, 255);
      out[k + 2] = clampInt(Math.round((invLen * 0.5 + 0.5) * 255), 128, 255);
      out[k + 3] = 255;
    }
  }
  return out;
}

/** Roughness R 단일 채널 버퍼를 캔버스 프리뷰용 RGBA 그레이스케일 버퍼로 변환한다. */
export function roughnessToRgbaBuffer(
  roughnessR: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const count = assertImageGeometry(width, height);
  if (!(roughnessR instanceof Uint8ClampedArray) || roughnessR.length !== count) {
    throw new RangeError("거칠기 버퍼 길이는 width × height와 같아야 합니다.");
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < count; i += 1) {
    const val = roughnessR[i] ?? 128;
    const k = i * 4;
    rgba[k] = val;
    rgba[k + 1] = val;
    rgba[k + 2] = val;
    rgba[k + 3] = 255;
  }
  return rgba;
}

/** 6종 웹툰·3D 배경 심리스 절차적 텍스처(Albedo + Sobel Normal + Roughness R)를 동시 합성한다. */
export function synthesizeProceduralTexture(
  materialId: ProceduralMaterialId,
  options?: ProceduralTextureOptions,
): ProceduralTextureResult {
  const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (!PROCEDURAL_MATERIAL_PRESETS.some((item) => item.id === materialId)) throw new RangeError("알 수 없는 합성 재질입니다.");
  const requestedWidth = options?.width ?? 128;
  const requestedHeight = options?.height ?? 128;
  assertImageGeometry(requestedWidth, requestedHeight);
  if (requestedWidth < 16 || requestedHeight < 16 || requestedWidth > 512 || requestedHeight > 512) throw new RangeError("합성 크기는 16~512의 정수여야 합니다.");
  for (const value of Object.values(options ?? {})) {
    if (value !== undefined && !Number.isFinite(value)) throw new RangeError("합성 옵션은 유한한 수여야 합니다.");
  }
  const preset =
    PROCEDURAL_MATERIAL_PRESETS.find((item) => item.id === materialId) ??
    PROCEDURAL_MATERIAL_PRESETS[0]!;

  const resolved: ResolvedTextureOptions = {
    width: requestedWidth,
    height: requestedHeight,
    seed: clampInt(options?.seed ?? 42, 1, 999999),
    tileScale: clampInt(options?.tileScale ?? preset.defaultTileScale, 1, 6),
    normalStrength: clamp(options?.normalStrength ?? preset.defaultNormalStrength, 0.2, 6.0),
    roughnessBias: clamp(options?.roughnessBias ?? preset.defaultRoughnessBias, -0.35, 0.35),
  };

  const { width, height, seed, tileScale, normalStrength, roughnessBias } = resolved;
  const pixelCount = width * height;
  const albedoRgba = new Uint8ClampedArray(pixelCount * 4);
  const roughnessR = new Uint8ClampedArray(pixelCount);
  const heightField = new Float32Array(pixelCount);

  let roughnessSum = 0;
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const sample = evaluateMaterialAt(materialId, (x + 0.5) / width, v, tileScale, seed, roughnessBias);
      const pIdx = rowOff + x;
      const cIdx = pIdx * 4;
      albedoRgba[cIdx] = clampInt(Math.round(sample.r), 0, 255);
      albedoRgba[cIdx + 1] = clampInt(Math.round(sample.g), 0, 255);
      albedoRgba[cIdx + 2] = clampInt(Math.round(sample.b), 0, 255);
      albedoRgba[cIdx + 3] = 255;
      heightField[pIdx] = sample.height;
      roughnessR[pIdx] = clampInt(Math.round(sample.roughness * 255), 0, 255);
      roughnessSum += sample.roughness;
    }
  }

  const normalRgba = buildSeamlessSobelNormalMap(heightField, width, height, normalStrength);
  const periodicBoundaryError = measureContinuousPeriodicError(materialId, tileScale, seed, roughnessBias);
  const seamReport = measureTileSeamContinuity(albedoRgba, width, height, periodicBoundaryError);
  const normalSeamReport = measureTileSeamContinuity(normalRgba, width, height, periodicBoundaryError);
  const endMs = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    materialId,
    width,
    height,
    albedoRgba,
    normalRgba,
    roughnessR,
    heightField,
    seamReport,
    normalSeamReport,
    options: resolved,
    metadata: {
      materialId,
      labelKo: preset.labelKo,
      labelEn: preset.labelEn,
      width,
      height,
      seed,
      tileScale,
      normalStrength,
      roughnessBias,
      meanRoughness: Number((roughnessSum / Math.max(1, pixelCount)).toFixed(3)),
      periodicBoundaryError,
      generationTimeMs: Number(Math.max(0.01, endMs - startMs).toFixed(2)),
    },
  };
}
