/**
 * 건식 매체 종이 이빨(Paper Tooth) 팁 커널 + 로그 밉맵 버킷 & 4-위상 변주 캐시.
 *
 * - `quantizeStampTipBakeRadius`: 팁 래스터 반지름을 로그 버킷(8/16/32/64, 최대 64px)으로
 *   양자화해 필압 변화·다중 브러시 혼합 시 캐시 스래싱과 매 dab CPU 노이즈 굽기 폭발을 차단한다.
 * - 4-위상(Phase 0..3) 결정적 회전/시드 변주 캐시 + LRU 512 상한: 연속 dab의 도장 찍기(beading)를
 *   제거하면서도 GPU 단일 `drawImage` 핫패스로 10배 이상 고속 렌더링한다.
 * - 연필(pencil)·크레파스(crayon)·목탄(charcoal)·파스텔(pastel)에 실물 종이 요철 피크-캐치,
 *   방향성 왁스 골, 외곽 부스러기, 28° 사선 흑연 결을 부여한다.
 */

import {
  STUDIO_OSS_TIP_WAX_LATTICE_SCALE,
  studioOssDirectionalWaxSample,
  studioOssKlecksChalkCoverage,
  studioOssSprayTipCoverage,
  studioOssValueNoise2d,
  studioOssWatercolorTipCoverage,
} from "../studio-oss-brush-kernels";

export type StudioStampBrushKind =
  | "airbrush"
  | "pencil"
  | "ink"
  | "watercolor"
  | "mypaint"
  | "krita-auto"
  /** Verified dry-media stamps (Klecks chalk / directional wax / libmypaint charcoal DNA). */
  | "crayon"
  | "chalk"
  | "charcoal"
  | "pastel";

/** OSS 질감 팁을 굽는 스탬프 종류(잉크·mypaint·krita-auto는 그라디언트/단색 팁을 유지). */
export type StudioStampOssTexturedTipKind =
  | "airbrush"
  | "watercolor"
  | "pencil"
  | "crayon"
  | "chalk"
  | "charcoal"
  | "pastel";

export const STUDIO_STAMP_TIP_MIPMAP_BUCKETS = Object.freeze([8, 16, 32, 64] as const);
export const STUDIO_STAMP_TIP_PHASE_COUNT = 4 as const;
export const STUDIO_STAMP_DAB_TIP_CACHE_MAX_SIZE = 512 as const;

const OSS_TIP_DIRECTION_RADIANS = -Math.PI / 5;
const PHASE_ROTATION_RADIANS = Object.freeze([
  0,
  Math.PI * 0.5 + 0.41,
  Math.PI + 0.82,
  Math.PI * 1.5 + 1.23,
] as const);
const PHASE_SEED_SALTS = Object.freeze([0x0, 0x9e37_79b9, 0x85eb_ca6b, 0xc2b2_ae35] as const);

export function isStudioStampOssTexturedTipKind(
  kind: StudioStampBrushKind,
): kind is StudioStampOssTexturedTipKind {
  return (
    kind === "airbrush"
    || kind === "watercolor"
    || kind === "pencil"
    || kind === "crayon"
    || kind === "chalk"
    || kind === "charcoal"
    || kind === "pastel"
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 팁 래스터 굽기 반지름을 로그 밉맵 버킷(8, 16, 32, 64)으로 양자화한다.
 * - OSS 질감 팁: 항상 [8, 16, 32, 64] 4버킷만 사용해 미세 반지름에서도 입자 결을 보존하고
 *   대형 반지름에서도 최대 64px 캐노니컬 팁을 GPU drawImage로 정확히 스케일 blit한다.
 * - 단색/그라디언트 팁(ink/mypaint/krita-auto): r < 2.5 구간은 기존 서브-2px 정수 계약(1, 2)을
 *   그대로 보존하고, r >= 2.5 구간은 [8, 16, 32, 64] 로그 버킷으로 통합한다.
 */
export function quantizeStampTipBakeRadius(
  kind: StudioStampBrushKind,
  radius: number,
): number {
  const safe = Number.isFinite(radius) && radius > 0 ? radius : 1;
  if (!isStudioStampOssTexturedTipKind(kind) && safe < 2.5) {
    return Math.max(1, Math.round(safe));
  }
  if (safe <= 8) return 8;
  if (safe <= 16) return 16;
  if (safe <= 32) return 32;
  return 64;
}

const PARSED_COLOR_CACHE = new Map<string, Readonly<{ r: number; g: number; b: number }>>();

function parseCssRgbColor(
  color: string,
): Readonly<{ r: number; g: number; b: number }> | null {
  const cached = PARSED_COLOR_CACHE.get(color);
  if (cached) {
    PARSED_COLOR_CACHE.delete(color);
    PARSED_COLOR_CACHE.set(color, cached);
    return cached;
  }
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(color.trim());
  let result: { r: number; g: number; b: number } | null = null;
  if (hex) {
    const raw = hex[1]!;
    const full = raw.length === 3
      ? `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
      : raw;
    result = {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  } else {
    const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/iu.exec(color);
    if (rgb) {
      result = {
        r: Math.round(Number(rgb[1])),
        g: Math.round(Number(rgb[2])),
        b: Math.round(Number(rgb[3])),
      };
    }
  }
  if (result) {
    if (PARSED_COLOR_CACHE.size >= 128) {
      const firstKey = PARSED_COLOR_CACHE.keys().next().value;
      if (firstKey !== undefined) PARSED_COLOR_CACHE.delete(firstKey);
    }
    PARSED_COLOR_CACHE.set(color, result);
  }
  return result;
}

/**
 * OSS 질감 팁의 픽셀 커버리지(순수·결정적) — (nx, ny)는 팁 반경으로 정규화한 좌표.
 * - airbrush: Klecks 멀티 옥타브 스프레이 그릿.
 * - watercolor: 소프트 바디 + 웻엣지 링 + 과립.
 * - pencil: 28° 사선 흑연 심 결 + 고주파 흑연 미세 입자 + 종이 골짜기 마이크로 포어.
 * - crayon: 뿌연 바닥(0.34)을 제거한 날카로운 왁스 피크-캐치 + 방향성 왁스 골 + 외곽 부스러기.
 * - chalk: Klecks genBrushAlpha01 다중 옥타브 분필 가루.
 * - charcoal: 건조 목탄 종이 이빨 게이트 + 그릿/스크레이프 가루.
 * - pastel: 벨벳 어깨 × 미세 종이 결 버터리 파스텔.
 */
export function studioStampOssTipCoverage(
  kind: StudioStampOssTexturedTipKind,
  normalizedX: number,
  normalizedY: number,
  seed: number,
  hardness: number,
  grainStretch = 1,
): number {
  const hard = clamp01(hardness);
  const radial = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
  if (kind === "airbrush") {
    return studioOssSprayTipCoverage(normalizedX, normalizedY, seed, hard);
  }
  if (kind === "watercolor") {
    return studioOssWatercolorTipCoverage(normalizedX, normalizedY, seed, hard);
  }
  const stretch = Math.max(0.25, Math.min(8, Number.isFinite(grainStretch) ? grainStretch : 1));
  const sx = normalizedX * stretch;
  const sy = normalizedY;

  if (kind === "pencil") {
    if (radial >= 1.12) return 0;
    // 28° 사선 흑연 심 결 (cos 28° ≈ 0.88295, sin 28° ≈ 0.46947)
    const along = sx * 0.88295 + sy * 0.46947;
    const across = -sx * 0.46947 + sy * 0.88295;
    const leadStreak = studioOssValueNoise2d(along * 7.5, across * 21.0, seed ^ 0x31a);
    const fineGrain = studioOssValueNoise2d(sx * 18.0, sy * 18.0, seed ^ 0x57b);
    const microSpeck = studioOssValueNoise2d(sx * 34.0, sy * 34.0, seed ^ 0x92d);
    const rawTooth =
      studioOssValueNoise2d(sx * 9.0, sy * 9.0, seed ^ 0x24c) * 0.55
      + studioOssValueNoise2d(sx * 23.0, sy * 23.0, seed ^ 0x61f) * 0.45;
    // 대비 증폭된 종이 높이장: 겹칠(4~5겹)에도 내부 흰 마이크로 포어가 뭉개지지 않고 숨 쉰다.
    const paperTooth = clamp01(0.5 + (rawTooth - 0.5) * 2.6);
    const poreCut = 0.64 - hard * 0.14;
    const toothBite = smoothstep01(poreCut - 0.08, poreCut + 0.09, paperTooth);
    const rimJitter = (leadStreak - 0.5) * 0.28 + (fineGrain - 0.5) * 0.16;
    const plateau = 0.46 + hard * 0.32;
    const shoulderWidth = Math.max(0.14, 1 - plateau);
    const envelope = clamp01(1 - (radial + rimJitter - plateau) / shoulderWidth);
    const graphiteTone = 0.42 * leadStreak + 0.34 * fineGrain + 0.24 * microSpeck;
    const core = envelope * toothBite * (0.58 + 0.62 * graphiteTone) * (0.76 + 0.3 * hard);
    const rimDust = radial > 0.62 && radial < 1.06 && microSpeck > 0.66 && paperTooth > poreCut
      ? (microSpeck - 0.66) * 2.6 * clamp01(1 - (radial - 0.62) / 0.44)
      : 0;
    return clamp01(core + rimDust);
  }

  if (kind === "chalk") {
    const klecks = studioOssKlecksChalkCoverage(normalizedX, normalizedY, seed, stretch);
    const shoulder = clamp01(1 - radial);
    const body = shoulder ** (0.4 + (1 - hard) * 0.9);
    return clamp01(klecks * (0.5 + 0.5 * body));
  }

  if (kind === "crayon") {
    if (radial >= 1.14) return 0;
    const wax = studioOssDirectionalWaxSample(
      normalizedX * STUDIO_OSS_TIP_WAX_LATTICE_SCALE,
      normalizedY * STUDIO_OSS_TIP_WAX_LATTICE_SCALE,
      OSS_TIP_DIRECTION_RADIANS,
      seed,
      stretch,
    );
    const rawRidge =
      studioOssValueNoise2d(sx * 8.5, sy * 8.5, seed ^ 0x71) * 0.54
      + studioOssValueNoise2d(sx * 19.5, sy * 19.5, seed ^ 0x89) * 0.46;
    // 뿌연 바닥(0.34) 완전 제거 + 대비 증폭 피크-캐치: 종이 골짜기가 0으로 뚝 끊겨
    // 겹침에서도 크레파스 특유의 날카로운 흰 종이 구멍과 왁스 리지가 살아남는다.
    const waxSignal = clamp01(0.5 + (wax.wax * 0.54 + rawRidge * 0.46 - 0.5) * 2.55);
    const peakCut = 0.61 - hard * 0.15;
    const waxyCatch = smoothstep01(peakCut - 0.08, peakCut + 0.085, waxSignal);
    // 방향성 왁스 골(Groove Streaks) — 스트로크 횡방향으로 날카롭게 긁힌 왁스 채널
    const grooveMask = 1 - smoothstep01(0.32, 0.72, wax.scrape) * 0.78;
    const rimWobble = (wax.wax - 0.5) * 0.28 + (rawRidge - 0.5) * 0.16;
    const plateau = 0.48 + hard * 0.3;
    const shoulderWidth = Math.max(0.13, 1 - plateau);
    const disk = clamp01(1 - (radial + rimWobble - plateau) / shoulderWidth);
    const waxyBody = disk * waxyCatch * grooveMask * (0.88 + 0.22 * hard);
    // 가장자리 왁스 부스러기(Crumb Flecks) — 실루엣 외곽에 붙어 거친 톱니 림 형성(고립 섬 방지)
    const crumbNoise = studioOssValueNoise2d(sx * 26.0, sy * 26.0, seed ^ 0x3e1);
    const crumbRim = radial > 0.58 && radial < 0.96 && crumbNoise > 0.64 && rawRidge > 0.44
      ? (crumbNoise - 0.64) * 2.4 * clamp01(1 - (radial - 0.58) / 0.38)
      : 0;
    return clamp01(waxyBody + crumbRim);
  }

  if (kind === "charcoal") {
    if (radial >= 1.12) return 0;
    const wax = studioOssDirectionalWaxSample(
      normalizedX * STUDIO_OSS_TIP_WAX_LATTICE_SCALE,
      normalizedY * STUDIO_OSS_TIP_WAX_LATTICE_SCALE,
      OSS_TIP_DIRECTION_RADIANS,
      seed ^ 0xc4,
      stretch,
    );
    const chalkPowder = studioOssKlecksChalkCoverage(normalizedX, normalizedY, seed ^ 0xa1, stretch);
    const rawTooth =
      studioOssValueNoise2d(sx * 10.5, sy * 10.5, seed ^ 0xd3) * 0.56
      + studioOssValueNoise2d(sx * 24.0, sy * 24.0, seed ^ 0xf7) * 0.44;
    const tooth = clamp01(0.5 + (rawTooth - 0.5) * 2.55);
    const toothCut = 0.6 - hard * 0.14;
    const toothGate = smoothstep01(toothCut - 0.085, toothCut + 0.09, wax.wax * 0.38 + tooth * 0.62);
    // 에어브러시 같은 부드러운 원뿔 대신 거칠게 뜯긴 건조 목탄 엣지
    const rimBreak = (rawTooth - 0.5) * 0.3;
    const plateau = 0.44 + hard * 0.3;
    const body = clamp01(1 - (radial + rimBreak - plateau) / Math.max(0.16, 1 - plateau));
    const gritty = toothGate * (0.64 + 0.36 * chalkPowder) + wax.grit * toothGate * 0.42;
    const charDust = radial > 0.56 && radial < 0.94 && rawTooth > 0.64
      ? (rawTooth - 0.64) * 2.0 * clamp01(1 - (radial - 0.56) / 0.38)
      : 0;
    return clamp01(body * gritty * (1 - wax.scrape * 0.52) + charDust);
  }

  // pastel: 뿌연 바닥·에어브러시 흐림 없이 보송한 파스텔지 미세 이빨이 살아있는 벨벳 케이크
  if (radial >= 1.1) return 0;
  const chalkPowder = studioOssKlecksChalkCoverage(normalizedX, normalizedY, seed ^ 0xb7, stretch);
  const rawFineTooth =
    studioOssValueNoise2d(sx * 13.0, sy * 13.0, seed ^ 0xe5) * 0.58
    + studioOssValueNoise2d(sx * 28.0, sy * 28.0, seed ^ 0x19a) * 0.42;
  const fineTooth = clamp01(0.5 + (rawFineTooth - 0.5) * 2.45);
  const rimBreak = (rawFineTooth - 0.5) * 0.18;
  const plateau = 0.44 + hard * 0.28;
  const shoulder = clamp01(1 - (radial + rimBreak - plateau) / Math.max(0.18, 1 - plateau));
  const velvet = shoulder * shoulder * (3 - 2 * shoulder);
  const pastelCut = 0.54 - hard * 0.11;
  const butteryCatch = smoothstep01(
    pastelCut - 0.1,
    pastelCut + 0.11,
    chalkPowder * 0.36 + fineTooth * 0.64,
  );
  return clamp01(velvet * butteryCatch * (0.78 + 0.26 * hard));
}

function rasterizeOssTexturedTip(
  ctx: CanvasRenderingContext2D,
  kind: StudioStampOssTexturedTipKind,
  color: string,
  radius: number,
  hardness: number,
  seed: number,
  phase: number,
): boolean {
  const channels = parseCssRgbColor(color);
  if (!channels || typeof ctx.createImageData !== "function") return false;
  const size = Math.max(4, Math.round(radius * 2 + 4));
  const image = ctx.createImageData(size, size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const invR = 1 / Math.max(1e-6, radius);
  const angle = PHASE_ROTATION_RADIANS[phase & 3] ?? 0;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const phaseSeed = (seed ^ (PHASE_SEED_SALTS[phase & 3] ?? 0)) >>> 0;
  const data = image.data;
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    const ny = (y - cy) * invR;
    for (let x = 0; x < size; x += 1) {
      const nx = (x - cx) * invR;
      const rx = nx * cosA - ny * sinA;
      const ry = nx * sinA + ny * cosA;
      const coverage = studioStampOssTipCoverage(kind, rx, ry, phaseSeed, hardness);
      data[offset] = channels.r;
      data[offset + 1] = channels.g;
      data[offset + 2] = channels.b;
      data[offset + 3] = (clamp01(coverage) * 255 + 0.5) | 0;
      offset += 4;
    }
  }
  if (typeof ctx.putImageData !== "function") return false;
  ctx.putImageData(image, 0, 0);
  return true;
}

export interface StudioStampCachedTipEntry {
  readonly canvas: HTMLCanvasElement;
  readonly bakedRadius: number;
  readonly phase: number;
}

const dabTipCanvasCache = new Map<string, StudioStampCachedTipEntry>();
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;

export function studioStampDabTipCanvasCacheSizeForTests(): number {
  return dabTipCanvasCache.size;
}

export function resetStudioStampDabTipCanvasCacheForTests(): void {
  for (const entry of dabTipCanvasCache.values()) {
    entry.canvas.width = 1;
    entry.canvas.height = 1;
  }
  dabTipCanvasCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  cacheEvictions = 0;
}

export function studioStampDabTipCacheStatsForTests(): Readonly<{
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}> {
  const total = cacheHits + cacheMisses;
  return Object.freeze({
    hits: cacheHits,
    misses: cacheMisses,
    evictions: cacheEvictions,
    size: dabTipCanvasCache.size,
    hitRate: total > 0 ? cacheHits / total : 1,
  });
}

export function getCachedDabTipEntry(
  kind: StudioStampBrushKind,
  color: string,
  radius: number,
  hardness: number,
  dabIndex = 0,
): StudioStampCachedTipEntry | null {
  const bakedRadius = quantizeStampTipBakeRadius(kind, radius);
  const roundedHardness = Math.round(hardness * 20) / 20;
  const isTextured = isStudioStampOssTexturedTipKind(kind);
  const phase = isTextured ? (dabIndex >>> 0) & (STUDIO_STAMP_TIP_PHASE_COUNT - 1) : 0;
  const key = `${kind}:${color}:${bakedRadius}:${roundedHardness}:${phase}`;
  const existing = dabTipCanvasCache.get(key);
  if (existing) {
    cacheHits += 1;
    dabTipCanvasCache.delete(key);
    dabTipCanvasCache.set(key, existing);
    return existing;
  }

  if (typeof document === "undefined") return null;
  cacheMisses += 1;
  const size = bakedRadius * 2 + 4;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = bakedRadius;

  if (isTextured) {
    const tipSeed =
      (Math.imul(bakedRadius + 1, 0x9e37) ^ Math.imul(Math.round(roundedHardness * 100) + 1, 0x85eb))
      >>> 0;
    const baked = rasterizeOssTexturedTip(ctx, kind, color, r, roundedHardness, tipSeed, phase);
    if (!baked) {
      const gradient = ctx.createRadialGradient(cx, cy, r * roundedHardness * 0.85, cx, cy, r);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (kind === "watercolor") {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.25, r * 0.06);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (kind === "mypaint") {
    const gradient = ctx.createRadialGradient(cx, cy, r * roundedHardness * 0.5, cx, cy, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.8, color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "krita-auto") {
    const gradient = ctx.createRadialGradient(cx, cy, r * roundedHardness * 0.7, cx, cy, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (dabTipCanvasCache.size >= STUDIO_STAMP_DAB_TIP_CACHE_MAX_SIZE) {
    const firstKey = dabTipCanvasCache.keys().next().value;
    if (firstKey !== undefined) {
      const evicted = dabTipCanvasCache.get(firstKey);
      dabTipCanvasCache.delete(firstKey);
      cacheEvictions += 1;
      if (evicted) {
        evicted.canvas.width = 1;
        evicted.canvas.height = 1;
      }
    }
  }
  const entry: StudioStampCachedTipEntry = Object.freeze({ canvas, bakedRadius, phase });
  dabTipCanvasCache.set(key, entry);
  return entry;
}
