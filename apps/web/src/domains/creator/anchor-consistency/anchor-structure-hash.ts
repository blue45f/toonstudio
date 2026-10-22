/**
 * 구조 해시(dHash) — 이미지를 9×8 밝기 격자로 줄여 이웃 칸의 밝기 증감 64비트를 만든다.
 *
 * 같은 그림·같은 포즈·같은 구도일 때만 가깝게 나온다. 같은 캐릭터라도 포즈나 구도가 다르면 멀어지는 것이 정상이라, 점수에는
 * 낮은 가중치로만 쓰고 "거의 같은 그림(복제)" 감지에 주로 쓴다. 좌우를 뒤집은 해시도 함께 만들어, 같은 포즈가 좌우로만
 * 뒤집힌 경우를 같은 구조로 본다.
 */

import type { AnchorLabImage } from "./anchor-subject-mask";

export const ANCHOR_DHASH = Object.freeze({ cols: 9, rows: 8, bits: 64 });

/** 피사체가 아닌 곳을 채우는 밝기(L*). 배경이 달라도 피사체만 비교되게 한다. */
export const ANCHOR_DHASH_NEUTRAL_LIGHTNESS = 50;

export interface AnchorHashRegion {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface AnchorStructureHash {
  /** 16자리 소문자 hex(64비트). */
  readonly dHash: string;
  /** 좌우를 뒤집은 이미지의 해시. */
  readonly dHashMirrored: string;
  /** 피사체 상자를 쓰면 subject, 화면 전체를 쓰면 image. */
  readonly region: "subject" | "image";
}

function resizeToGrid(
  luma: Float32Array,
  width: number,
  region: AnchorHashRegion,
): Float64Array {
  const { cols, rows } = ANCHOR_DHASH;
  const boxWidth = region.x1 - region.x0 + 1;
  const boxHeight = region.y1 - region.y0 + 1;
  const grid = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    const ys = region.y0 + Math.floor((row * boxHeight) / rows);
    const ye = Math.max(ys + 1, region.y0 + Math.ceil(((row + 1) * boxHeight) / rows));
    for (let col = 0; col < cols; col += 1) {
      const xs = region.x0 + Math.floor((col * boxWidth) / cols);
      const xe = Math.max(xs + 1, region.x0 + Math.ceil(((col + 1) * boxWidth) / cols));
      let sum = 0;
      let count = 0;
      for (let y = ys; y < Math.min(ye, region.y1 + 1); y += 1) {
        for (let x = xs; x < Math.min(xe, region.x1 + 1); x += 1) {
          sum += luma[y * width + x] ?? 0;
          count += 1;
        }
      }
      grid[row * cols + col] = count === 0 ? 0 : sum / count;
    }
  }
  return grid;
}

function bitsToHex(bits: readonly number[]): string {
  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    hex += (((bits[index] ?? 0) << 3) | ((bits[index + 1] ?? 0) << 2) | ((bits[index + 2] ?? 0) << 1) | (bits[index + 3] ?? 0)).toString(16);
  }
  return hex;
}

function hashOfGrid(grid: Float64Array, mirrored: boolean): string {
  const { cols, rows } = ANCHOR_DHASH;
  const bits: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const left = mirrored ? grid[row * cols + (cols - 1 - col)] : grid[row * cols + col];
      const right = mirrored ? grid[row * cols + (cols - 2 - col)] : grid[row * cols + col + 1];
      bits.push((left ?? 0) > (right ?? 0) ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

/**
 * 밝기(L*) 배열에서 구조 해시를 만든다. `mask` 가 있으면 피사체 밖을 중립 밝기로 바꿔 배경의 영향을 줄인다.
 */
export function computeAnchorStructureHash(
  image: Pick<AnchorLabImage, "width" | "height" | "lightness">,
  options: { readonly mask: Uint8Array | null; readonly region: AnchorHashRegion | null },
): AnchorStructureHash {
  const { width, height, lightness } = image;
  let luma = lightness;
  if (options.mask) {
    luma = new Float32Array(lightness.length);
    for (let index = 0; index < lightness.length; index += 1) {
      luma[index] = options.mask[index] === 1 ? (lightness[index] ?? 0) : ANCHOR_DHASH_NEUTRAL_LIGHTNESS;
    }
  }
  const region = options.region ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  const grid = resizeToGrid(luma, width, region);
  return Object.freeze({
    dHash: hashOfGrid(grid, false),
    dHashMirrored: hashOfGrid(grid, true),
    region: options.region ? ("subject" as const) : ("image" as const),
  });
}

const NIBBLE_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

/** 두 16자리 hex 해시의 해밍 거리(0~64). 길이가 다르면 비교할 수 없어 최대값을 돌려준다. */
export function hammingDistanceHex(left: string, right: string): number {
  if (left.length !== right.length || left.length === 0) return ANCHOR_DHASH.bits;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number.parseInt(left[index] ?? "", 16);
    const b = Number.parseInt(right[index] ?? "", 16);
    if (Number.isNaN(a) || Number.isNaN(b)) return ANCHOR_DHASH.bits;
    distance += NIBBLE_POPCOUNT[a ^ b] ?? 0;
  }
  return distance;
}

export interface AnchorStructureComparison {
  /** 0~64. 좌우를 뒤집은 쪽까지 보고 더 가까운 값. */
  readonly distance: number;
  readonly mirrored: boolean;
  /** 0~1. 서로 무관한 이미지의 기대 거리(약 32)를 0 으로 맞춘 값: max(0, 1 − 2×distance/64). */
  readonly similarity: number;
}

export function compareAnchorStructureHashes(left: AnchorStructureHash, right: AnchorStructureHash): AnchorStructureComparison {
  const direct = hammingDistanceHex(left.dHash, right.dHash);
  const flipped = hammingDistanceHex(left.dHash, right.dHashMirrored);
  const mirrored = flipped < direct;
  const distance = Math.min(direct, flipped);
  return Object.freeze({ distance, mirrored, similarity: Math.max(0, 1 - (2 * distance) / ANCHOR_DHASH.bits) });
}
