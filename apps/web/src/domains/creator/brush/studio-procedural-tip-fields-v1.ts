/**
 * Studio Procedural Tip Fields v1 — 시드 파라메트릭 팁 커버리지 필드 3종.
 *
 * 배경. 팁 형태는 두 경로가 있다: authored 형태소 프로그램 49종
 * (`studio-material-tip-kernels`, 아틀라스에 구워진 고정 시드)과 이미지 가져오기.
 * 그 사이에 "시드와 개수만 바꾸면 변형이 나오는" 파라메트릭 생성기가 없었다 —
 * 물방울 군집(spatter), 브리스틀 열(rake), 풀 다발(grass)은 변형 폭이 큰데도
 * 고정 형태소 하나로만 존재하거나 아예 없었다. 이 모듈은 그 세 가지를
 * `StudioTipCoverageField`(x·y ∈ [-1,1] → coverage 0..1)로 제공해 기존
 * 래스터라이저(`rasterizeStudioProceduralTip`, 면적 샘플링 R8)와 캐시를 그대로 탄다.
 *
 * 계약.
 * - 순수·결정적: 배치는 (seed, index)의 무상태 해시. 같은 옵션은 항상 같은 필드.
 * - 필드는 [-1,1]² 바깥에서도 안전하다(그냥 0으로 수렴) — 래스터라이저의 면적 샘플링이
 *   경계 바깥을 물어도 깨지지 않는다.
 * - 개수는 상한으로 클램프한다(스탬프 1회 비용이 옵션 하나로 폭증하지 않게).
 */

import type { StudioTipCoverageField } from "./studio-procedural-tip-rasterizer";

export const STUDIO_PROCEDURAL_TIP_FIELDS_VERSION_V1 = 1 as const;

export const STUDIO_PROCEDURAL_TIP_FIELD_LIMITS_V1 = Object.freeze({
  spatterDrops: { min: 1, max: 64 },
  rakeBristles: { min: 1, max: 32 },
  grassBlades: { min: 1, max: 48 },
});

/** 경계 페더(정규화 좌표) — 64px 팁에서 약 1텍셀. */
const TIP_FEATHER_V1 = 0.03;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clampCount(value: unknown, range: { readonly min: number; readonly max: number }, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.floor(value)));
}

function unitHash(a: number, b: number, seed: number): number {
  // Seed is pre-multiplied before the XOR: a plain (index ^ seed) lets seed pairs that
  // differ in one bit (e.g. 42 vs 43) merely swap element pairs, so an even element count
  // produced a byte-identical tip for two different seeds. The multiply breaks that symmetry.
  const seedMix = Math.imul(seed | 0, 0x9e3779b1);
  let hash = Math.imul((a | 0) ^ seedMix, 0x45d9f3b) ^ Math.imul(b | 0, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  return ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
}

function finiteSeed(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value | 0 : fallback;
}

// ---------------------------------------------------------------------------
// Spatter — 크고 작은 물방울의 군집
// ---------------------------------------------------------------------------

export interface StudioSpatterTipFieldOptionsV1 {
  readonly seed?: number;
  /** 물방울 수(1..64). 기본 14. */
  readonly drops?: number;
}

/**
 * 물방울 군집 팁. 각 물방울은 해시로 뽑은 극좌표(각도·거리 sqrt 분포)에 앉고,
 * 반경은 해시의 제곱으로 작게 치우친다(큰 방울 소수 + 작은 방울 다수).
 * 커버리지는 방울들의 max 합성 — 겹쳐도 1을 넘지 않는다.
 */
export function createStudioSpatterTipFieldV1(
  options?: StudioSpatterTipFieldOptionsV1,
): StudioTipCoverageField {
  const seed = finiteSeed(options?.seed, 101);
  const drops = clampCount(options?.drops, STUDIO_PROCEDURAL_TIP_FIELD_LIMITS_V1.spatterDrops, 14);
  const blobs: readonly (readonly [number, number, number])[] = Object.freeze(
    Array.from({ length: drops }, (_, index) => {
      const angle = unitHash(index, 0, seed) * Math.PI * 2;
      const distance = Math.sqrt(unitHash(index, 1, seed)) * 0.72;
      const radius = 0.05 + 0.34 * unitHash(index, 2, seed) ** 2;
      return Object.freeze([Math.cos(angle) * distance, Math.sin(angle) * distance, radius] as const);
    }),
  );
  return (x: number, y: number): number => {
    let coverage = 0;
    for (const [bx, by, radius] of blobs) {
      const d = Math.hypot(x - bx, y - by);
      const value = clamp01((radius + TIP_FEATHER_V1 - d) / (2 * TIP_FEATHER_V1) + 0.5);
      if (value > coverage) coverage = value;
    }
    return coverage;
  };
}

// ---------------------------------------------------------------------------
// Rake — 한 줄로 선 브리스틀 점들
// ---------------------------------------------------------------------------

export interface StudioRakeTipFieldOptionsV1 {
  readonly seed?: number;
  /** 브리스틀 수(1..32). 기본 7. */
  readonly bristles?: number;
}

/**
 * 갈퀴 팁. 점들이 가로 한 줄로 서고, 세로 위치와 반경이 해시로 조금씩 흔들린다.
 * 각 점의 커버리지는 살짝 약하게(0.9) 잡아 겹침이 과포화되지 않게 한다.
 */
export function createStudioRakeTipFieldV1(
  options?: StudioRakeTipFieldOptionsV1,
): StudioTipCoverageField {
  const seed = finiteSeed(options?.seed, 707);
  const bristles = clampCount(options?.bristles, STUDIO_PROCEDURAL_TIP_FIELD_LIMITS_V1.rakeBristles, 7);
  const dots: readonly (readonly [number, number, number])[] = Object.freeze(
    Array.from({ length: bristles }, (_, index) => {
      const cx = bristles === 1 ? 0 : -0.8 + (1.6 * index) / (bristles - 1);
      const cy = (unitHash(index, 0, seed) - 0.5) * 0.16;
      const radius = (0.8 / bristles) * (0.55 + 0.45 * unitHash(index, 1, seed));
      return Object.freeze([cx, cy, radius] as const);
    }),
  );
  return (x: number, y: number): number => {
    let coverage = 0;
    for (const [bx, by, radius] of dots) {
      const d = Math.hypot(x - bx, y - by);
      const value = clamp01((radius + TIP_FEATHER_V1 - d) / (2 * TIP_FEATHER_V1) + 0.5) * 0.9;
      if (value > coverage) coverage = value;
    }
    return coverage;
  };
}

// ---------------------------------------------------------------------------
// Grass — 아래쪽에서 솟는 풀잎 다발
// ---------------------------------------------------------------------------

export interface StudioGrassTipFieldOptionsV1 {
  readonly seed?: number;
  /** 풀잎 수(1..48). 기본 9. */
  readonly blades?: number;
}

/**
 * 풀 다발 팁. 잎은 아래 경계(y=+1)에서 솟아 위로 갈수록 가늘어지고 해시만큼 기운다.
 * 잎 중심선은 t² 곡선(밑동은 곧고 끝만 휘는 형태), 커버리지는 중심선 거리 기반.
 */
export function createStudioGrassTipFieldV1(
  options?: StudioGrassTipFieldOptionsV1,
): StudioTipCoverageField {
  const seed = finiteSeed(options?.seed, 505);
  const blades = clampCount(options?.blades, STUDIO_PROCEDURAL_TIP_FIELD_LIMITS_V1.grassBlades, 9);
  const tuft: readonly (readonly [number, number, number, number])[] = Object.freeze(
    Array.from({ length: blades }, (_, index) => {
      const base = -0.4 + 0.8 * unitHash(index, 0, seed);
      const height = 1.1 + 0.84 * unitHash(index, 1, seed);
      const lean = (unitHash(index, 2, seed) - 0.5) * 0.9;
      const halfWidth = 0.025 + 0.025 * unitHash(index, 3, seed);
      return Object.freeze([base, height, lean, halfWidth] as const);
    }),
  );
  return (x: number, y: number): number => {
    const up = 1 - y; // 아래 경계에서 잰 높이(0..2)
    if (up < 0) return 0;
    let coverage = 0;
    for (const [base, height, lean, halfWidth] of tuft) {
      if (up > height) continue;
      const t = up / height;
      const centerX = base + lean * height * t * t * 0.5;
      const width = halfWidth * (1 - t) + 0.006;
      const value = clamp01((width - Math.abs(x - centerX)) / (2 * TIP_FEATHER_V1) + 0.5);
      if (value > coverage) coverage = value;
    }
    return coverage;
  };
}

/** 필드 빌더 식별자 — 카탈로그/프리셋이 이름으로 고를 수 있게 한다. */
export const STUDIO_PROCEDURAL_TIP_FIELD_IDS_V1 = Object.freeze(["spatter", "rake", "grass"] as const);
export type StudioProceduralTipFieldIdV1 = (typeof STUDIO_PROCEDURAL_TIP_FIELD_IDS_V1)[number];

export function createStudioProceduralTipFieldV1(
  id: StudioProceduralTipFieldIdV1,
  options?: StudioSpatterTipFieldOptionsV1 & StudioRakeTipFieldOptionsV1 & StudioGrassTipFieldOptionsV1,
): StudioTipCoverageField {
  switch (id) {
    case "spatter":
      return createStudioSpatterTipFieldV1(options);
    case "rake":
      return createStudioRakeTipFieldV1(options);
    case "grass":
      return createStudioGrassTipFieldV1(options);
    default:
      return createStudioSpatterTipFieldV1(options);
  }
}
