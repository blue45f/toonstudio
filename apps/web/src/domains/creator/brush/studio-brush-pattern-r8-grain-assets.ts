/**
 * 절차 패턴 스타일 → R8 그레인 에셋 베이커 (brush texture wave).
 *
 * 배경. 브러시 그레인의 R8 소스는 지금까지 종이 프리셋 타일(6종,
 * `studio-paper-media-r8-grain-assets`)뿐이라, 종이와 무관한 질감 — 캔버스 직조,
 * 망점 도트, 거친 노이즈, 종이 섬유 — 을 브러시 텍스처로 고를 방법이 없었다.
 * 이 모듈은 패턴 필드 4종을 256×256 R8 타일로 구워 **같은 레지스트리 규약**으로
 * 등록할 수 있게 한다. 종이 타일과 소비 경로(하이드레이션·샘플러·해시 검증)가
 * 완전히 같아, 브러시는 소스가 종이인지 패턴인지 구분하지 않는다.
 *
 * 계약.
 * - 순수·결정적: 스타일마다 고정 시드(FNV-1a)라 같은 스타일은 항상 같은 바이트·해시.
 *   Math.random / Date.now / DOM 없음.
 * - seamless: 값 노이즈는 격자를 주기로 감아(wrap) 타일 경계에서 연속이고,
 *   텍셀 해시 성분은 타일 단위 반복이라 이음매가 생기지 않는다.
 * - 인코딩은 종이 베이커의 결정적 PNG 인코더를 재사용한다 — 계약의
 *   `encodedSha256`/`byteLength`가 실제 바이트를 가리킨다.
 * - 등록은 명시 호출로만 일어난다 — 어떤 기본값에도 배선하지 않는다(종이 베이커와 같은 계약).
 */

import { sha256HexPortable } from "../studio-sha256";

import { hydrateStudioBrushR8GrainAsset } from "./studio-brush-r8-grain-runtime";
import { encodeStudioPaperMediaR8PngV1 } from "./studio-paper-media-r8-grain-assets";

import type { StudioBrushR8TextureGrainSource } from "./studio-brush-r8-grain-asset-contract";
import type {
  StudioBrushR8GrainHydrationResult,
  StudioBrushR8GrainRegistry,
} from "./studio-brush-r8-grain-runtime";

export const STUDIO_BRUSH_PATTERN_R8_GRAIN_VERSION_V1 = 1 as const;

/** 타일 한 변(px). R8 디코드 길이 = 256 × 256 = 65 536 바이트. */
export const STUDIO_BRUSH_PATTERN_R8_TILE_SIZE_V1 = 256;

/** 에셋 id 접두 — `studio-brush-pattern-v1.{styleId}.{size}`. */
export const STUDIO_BRUSH_PATTERN_R8_ASSET_ID_PREFIX_V1 = "studio-brush-pattern-v1";

export const STUDIO_BRUSH_PATTERN_STYLE_IDS_V1 = Object.freeze([
  "noise",
  "paper-fibre",
  "canvas-weave",
  "halftone-dots",
] as const);

export type StudioBrushPatternStyleIdV1 = (typeof STUDIO_BRUSH_PATTERN_STYLE_IDS_V1)[number];

const PATTERN_STYLE_SET_V1: ReadonlySet<string> = new Set(STUDIO_BRUSH_PATTERN_STYLE_IDS_V1);

export function isStudioBrushPatternStyleIdV1(value: unknown): value is StudioBrushPatternStyleIdV1 {
  return typeof value === "string" && PATTERN_STYLE_SET_V1.has(value);
}

export interface StudioBrushPatternR8GrainBakeV1 {
  readonly styleId: StudioBrushPatternStyleIdV1;
  /** 레지스트리 hydrate에 그대로 넘길 수 있는 소스 참조. */
  readonly source: Readonly<StudioBrushR8TextureGrainSource>;
  /** 타이트하게 패킹된 R8 바이트(호출마다 새 사본). */
  readonly decodedBytes: Uint8Array;
  /** 결정적 그레이스케일 PNG 인코딩(호출마다 새 사본). */
  readonly encodedBytes: Uint8Array;
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** 스타일별 낱장 시드 — FNV-1a(`studio-brush-pattern-r8-v1:{styleId}`). 스타일마다 고정. */
function patternTileSeed(styleId: string): number {
  const key = `studio-brush-pattern-r8-v1:${styleId}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// 결정적 필드 — 주기 격자 값 노이즈 + 텍셀 해시 (타일 경계 연속)
// ---------------------------------------------------------------------------

function texelHash(x: number, y: number, salt: number): number {
  let hash = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

function wrapIndex(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** 주기 격자 값 노이즈 — 격자 좌표를 축별 주기로 감아 타일 경계에서 연속이다. */
function periodicValueNoise(x: number, y: number, periodX: number, periodY: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const tx = smoothStep(x - ix);
  const ty = smoothStep(y - iy);
  const x0 = wrapIndex(ix, periodX);
  const x1 = wrapIndex(ix + 1, periodX);
  const y0 = wrapIndex(iy, periodY);
  const y1 = wrapIndex(iy + 1, periodY);
  const top = texelHash(x0, y0, salt) * (1 - tx) + texelHash(x1, y0, salt) * tx;
  const bottom = texelHash(x0, y1, salt) * (1 - tx) + texelHash(x1, y1, salt) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** 타일 좌표(텍셀 단위)에서의 fBm — 옥타브마다 격자 주기가 2배, 진폭은 절반. */
function periodicFbm(x: number, y: number, size: number, cells: number, octaves: number, salt: number): number {
  let sum = 0;
  let amplitude = 1;
  let norm = 0;
  let period = cells;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += periodicValueNoise((x / size) * period, (y / size) * period, period, period, salt + octave * 7919) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/**
 * 스타일 필드 값(0..1). x·y는 타일 텍셀 좌표(0..size), seed는 스타일 고정 시드.
 * 미리보기 UI가 베이크 없이 같은 값을 읽을 수 있게 공개한다(베이크와 동일 함수).
 */
export function sampleStudioBrushPatternFieldV1(
  styleId: StudioBrushPatternStyleIdV1,
  x: number,
  y: number,
  size: number = STUDIO_BRUSH_PATTERN_R8_TILE_SIZE_V1,
): number {
  const seed = patternTileSeed(styleId);
  const salt = (seed ^ 0x9e3779b9) | 0;
  switch (styleId) {
    case "noise":
      return periodicFbm(x, y, size, 8, 4, salt);
    case "paper-fibre": {
      const base = periodicFbm(x, y, size, 16, 4, salt);
      // 가로로 긴 섬유 줄무늬 — x로는 느리게(주기 4), y로는 빠르게(주기 48) 변한다.
      const fibre = periodicValueNoise((x / size) * 4, (y / size) * 48, 4, 48, salt ^ 0x51);
      const grain = texelHash(Math.floor(x), Math.floor(y), salt ^ 0x55);
      return clamp01((base - 0.5) * 2.1 + 0.5 + (fibre - 0.5) * 0.3 + (grain - 0.5) * 0.35);
    }
    case "canvas-weave": {
      const period = 8;
      const cellX = Math.floor(x / period);
      const cellY = Math.floor(y / period);
      const u = (x / period) % 1;
      const v = (y / period) % 1;
      const warp = Math.sin(Math.PI * u);
      const weft = Math.sin(Math.PI * v);
      const top = (cellX + cellY) % 2 === 0 ? warp : weft;
      const jitter = texelHash(Math.floor(x), Math.floor(y), salt);
      return clamp01(0.25 + 0.65 * top + (jitter - 0.5) * 0.15);
    }
    case "halftone-dots": {
      const period = 8;
      const u = ((x / period) % 1) - 0.5;
      const v = ((y / period) % 1) - 0.5;
      const distance = Math.sqrt(u * u + v * v);
      const t = clamp01((0.35 - distance) / 0.1 + 0.5);
      return 1 - smoothStep(t);
    }
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// 베이크 + 등록 (종이 베이커와 같은 형태)
// ---------------------------------------------------------------------------

interface BakedTileCacheEntry {
  readonly source: Readonly<StudioBrushR8TextureGrainSource>;
  readonly decodedBytes: Uint8Array;
  readonly encodedBytes: Uint8Array;
}

/** (스타일 4종 × 고정 크기)의 순수 메모이제이션 — 재호출 시 재굽지 않는다. */
const bakedTileCacheV1 = new Map<StudioBrushPatternStyleIdV1, BakedTileCacheEntry>();

/**
 * 스타일 한 장을 256×256 R8 타일로 굽고, R8 에셋 계약을 만족하는 소스 참조와 함께
 * 돌려준다. 반환 바이트는 호출마다 새 사본이다.
 */
export function bakeStudioBrushPatternR8GrainTileV1(
  styleId: StudioBrushPatternStyleIdV1,
): StudioBrushPatternR8GrainBakeV1 {
  const cached = bakedTileCacheV1.get(styleId);
  if (cached) {
    return Object.freeze({
      styleId,
      source: cached.source,
      decodedBytes: cached.decodedBytes.slice(),
      encodedBytes: cached.encodedBytes.slice(),
    });
  }
  const size = STUDIO_BRUSH_PATTERN_R8_TILE_SIZE_V1;
  const decodedBytes = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = sampleStudioBrushPatternFieldV1(styleId, x + 0.5, y + 0.5, size);
      decodedBytes[y * size + x] = Math.round(clamp01(value) * 255);
    }
  }
  const encodedBytes = encodeStudioPaperMediaR8PngV1(size, size, decodedBytes);
  const source: StudioBrushR8TextureGrainSource = Object.freeze({
    kind: "r8-texture-v1" as const,
    asset: Object.freeze({
      assetId: `${STUDIO_BRUSH_PATTERN_R8_ASSET_ID_PREFIX_V1}.${styleId}.${size}`,
      encodedSha256: `sha256:${sha256HexPortable(encodedBytes)}`,
      decodedSha256: `sha256:${sha256HexPortable(decodedBytes)}`,
      byteLength: encodedBytes.length,
      mediaType: "image/png" as const,
      width: size,
      height: size,
      channel: "luminance" as const,
      encoding: "r8-unorm" as const,
    }),
  });
  bakedTileCacheV1.set(styleId, { source, decodedBytes, encodedBytes });
  return Object.freeze({
    styleId,
    source,
    decodedBytes: decodedBytes.slice(),
    encodedBytes: encodedBytes.slice(),
  });
}

export interface StudioBrushPatternR8GrainRegistrationV1 {
  readonly styleId: StudioBrushPatternStyleIdV1;
  readonly source: Readonly<StudioBrushR8TextureGrainSource>;
  readonly result: StudioBrushR8GrainHydrationResult;
}

/**
 * 네 스타일 타일을 R8 레지스트리에 등록한다(기본은 공유 레지스트리). 결과는 스타일
 * 순서 그대로의 영수증 목록이다. 어떤 기본값도 바꾸지 않는다 — 소비자는 돌려받은
 * source를 브러시 grain 설정에 명시적으로 연결해야만 이 타일을 읽게 된다.
 */
export function registerStudioBrushPatternR8GrainTilesV1(
  registry?: StudioBrushR8GrainRegistry,
): readonly StudioBrushPatternR8GrainRegistrationV1[] {
  return Object.freeze(STUDIO_BRUSH_PATTERN_STYLE_IDS_V1.map((styleId) => {
    const baked = bakeStudioBrushPatternR8GrainTileV1(styleId);
    const result = registry
      ? registry.hydrate(baked.source, baked.decodedBytes)
      : hydrateStudioBrushR8GrainAsset(baked.source, baked.decodedBytes);
    return Object.freeze({ styleId, source: baked.source, result });
  }));
}
