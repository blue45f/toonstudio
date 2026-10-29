/**
 * 필터 갤러리 공용 절차적 텍스처와 요철 조명.
 *
 * 사진 편집기의 "텍스처화·거친 파스텔·밑칠·콩테 크레용·유리" 계열은 캔버스·삼베·사암·벽돌 같은 재질 높이맵을
 * 이미지에 요철 조명으로 얹는다. 원작 프로그램의 텍스처 이미지는 쓰지 않고, 직조·벽돌 배열·프랙털 노이즈로
 * 높이맵(0~1)을 결정적으로 새로 만든다. 같은 시드·크기·배율이면 항상 같은 텍스처가 나온다.
 */
import { clamp, clamp01, fbm2, hash2, valueNoise2 } from "./studio-filter-gallery-kernel-utils";

import type { StudioFilterGalleryImage } from "./studio-filter-gallery-types";

export const STUDIO_FILTER_GALLERY_TEXTURES = ["canvas", "burlap", "sandstone", "brick", "linen", "paper"] as const;
export type StudioFilterGalleryTexture = (typeof STUDIO_FILTER_GALLERY_TEXTURES)[number];

export const STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS: readonly { readonly value: StudioFilterGalleryTexture; readonly label: string }[] = [
  { value: "canvas", label: "캔버스" },
  { value: "burlap", label: "삼베" },
  { value: "sandstone", label: "사암" },
  { value: "brick", label: "벽돌" },
  { value: "linen", label: "리넨" },
  { value: "paper", label: "종이" },
];

export const STUDIO_FILTER_GALLERY_LIGHT_DIRECTIONS = [
  "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left", "top-left",
] as const;
export type StudioFilterGalleryLightDirection = (typeof STUDIO_FILTER_GALLERY_LIGHT_DIRECTIONS)[number];

export const STUDIO_FILTER_GALLERY_LIGHT_OPTIONS: readonly { readonly value: StudioFilterGalleryLightDirection; readonly label: string }[] = [
  { value: "top", label: "위" },
  { value: "top-right", label: "오른쪽 위" },
  { value: "right", label: "오른쪽" },
  { value: "bottom-right", label: "오른쪽 아래" },
  { value: "bottom", label: "아래" },
  { value: "bottom-left", label: "왼쪽 아래" },
  { value: "left", label: "왼쪽" },
  { value: "top-left", label: "왼쪽 위" },
];

const DIRECTION_ANGLE: Readonly<Record<StudioFilterGalleryLightDirection, number>> = {
  right: 0, "bottom-right": 45, bottom: 90, "bottom-left": 135, left: 180, "top-left": 225, top: 270, "top-right": 315,
};

/** 빛이 오는 쪽을 가리키는 화면 좌표 단위 벡터(y 는 아래가 +). */
export function lightVector(direction: StudioFilterGalleryLightDirection): [number, number] {
  const radians = (DIRECTION_ANGLE[direction] * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

const weave = (t: number): number => Math.abs(Math.sin(t * Math.PI));

/** 날실·씨실이 번갈아 위로 올라오는 평직 높이. period 는 실 한 가닥의 폭(px)이다. */
function plainWeave(x: number, y: number, period: number, seed: number, irregularity: number): number {
  const u = x / period, v = y / period;
  const cellX = Math.floor(u), cellY = Math.floor(v);
  const jitter = irregularity * (valueNoise2(u * 0.35, v * 0.35, seed) - 0.5);
  const warpOnTop = ((cellX + cellY) & 1) === 0;
  const warp = weave(u + jitter * 0.3) * (0.75 + 0.25 * weave(v * 0.5));
  const weft = weave(v + jitter * 0.3) * (0.75 + 0.25 * weave(u * 0.5));
  return warpOnTop ? 0.15 + 0.85 * warp : 0.15 + 0.85 * weft;
}

/**
 * 재질 높이맵(0~1)을 만든다. scale 1 이 100% 배율이다. 크기가 0 이면 빈 배열을 돌려준다.
 */
export function textureHeight(
  texture: StudioFilterGalleryTexture,
  width: number,
  height: number,
  scale: number,
  seed: number,
): Float32Array {
  const out = new Float32Array(Math.max(0, width * height));
  const s = clamp(scale, 0.25, 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value: number;
      switch (texture) {
        case "canvas":
          value = plainWeave(x, y, 3.2 * s, seed, 0.6) * 0.85 + 0.15 * valueNoise2(x / (1.5 * s), y / (1.5 * s), seed + 7);
          break;
        case "burlap": {
          const threads = plainWeave(x, y, 6.5 * s, seed, 1.4);
          const gap = valueNoise2(x / (6.5 * s), y / (6.5 * s), seed + 11) > 0.78 ? 0.35 : 1;
          value = threads * gap * 0.9 + 0.1 * valueNoise2(x / (2 * s), y / (2 * s), seed + 13);
          break;
        }
        case "sandstone":
          value = 0.55 * fbm2(x / (9 * s), y / (9 * s), seed + 17, 4) + 0.45 * hash2(Math.floor(x / s), Math.floor(y / s), seed + 19);
          break;
        case "brick": {
          const brickWidth = 34 * s, brickHeight = 15 * s, mortar = Math.max(1, 2.2 * s);
          const row = Math.floor(y / brickHeight);
          const shifted = x + (row & 1 ? brickWidth / 2 : 0);
          const localX = shifted - Math.floor(shifted / brickWidth) * brickWidth;
          const localY = y - row * brickHeight;
          const inMortar = localX < mortar || localY < mortar;
          const brickId = Math.floor(shifted / brickWidth);
          const face = 0.72 + 0.18 * hash2(brickId, row, seed + 23) + 0.1 * fbm2(x / (4 * s), y / (4 * s), seed + 29, 2);
          value = inMortar ? 0.12 + 0.1 * valueNoise2(x / s, y / s, seed + 31) : face;
          break;
        }
        case "linen": {
          const slub = 0.8 + 0.4 * valueNoise2(x / (24 * s), y / (1.6 * s), seed + 37);
          value = plainWeave(x, y, 2.2 * s * slub, seed, 0.9) * 0.9 + 0.1 * hash2(x, y, seed + 41);
          break;
        }
        case "paper": {
          const fibers = valueNoise2(x / (14 * s), y / (2.5 * s), seed + 43) * 0.5 + valueNoise2(x / (2.5 * s), y / (14 * s), seed + 47) * 0.5;
          value = 0.55 * fbm2(x / (22 * s), y / (22 * s), seed + 53, 4) + 0.3 * fibers + 0.15 * hash2(x, y, seed + 59);
          break;
        }
      }
      out[y * width + x] = clamp01(value);
    }
  }
  return out;
}

/**
 * 높이맵을 요철 조명으로 얹는다. relief 0~50(사진 편집기의 "부조" 값과 같은 감각)이고 0 이면 아무것도 하지 않는다.
 * 노멀은 높이 중앙차분으로 구하고, 빛 방향과의 내적이 양수면 밝게·음수면 어둡게 RGB 를 곱한다. 알파는 그대로다.
 */
export function applyRelief(
  image: StudioFilterGalleryImage,
  heightPlane: Float32Array,
  direction: StudioFilterGalleryLightDirection,
  relief: number,
  invert = false,
): void {
  const { width, height, data } = image;
  const strength = clamp(relief, 0, 50) / 50;
  if (strength <= 0 || heightPlane.length !== width * height) return;
  const [lx, ly] = lightVector(direction);
  const sign = invert ? -1 : 1;
  for (let y = 0; y < height; y += 1) {
    const ym = Math.max(0, y - 1), yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xm = Math.max(0, x - 1), xp = Math.min(width - 1, x + 1);
      const dx = (heightPlane[y * width + xp]! - heightPlane[y * width + xm]!) * sign;
      const dy = (heightPlane[yp * width + x]! - heightPlane[ym * width + x]!) * sign;
      // 빛이 오는 쪽으로 올라가는 경사면이 밝다(경사 벡터와 빛 벡터의 반대 방향 내적).
      const shade = clamp(1 - (dx * lx + dy * ly) * 2.4 * strength, 0.2, 1.8);
      const offset = (y * width + x) * 4;
      data[offset] = data[offset]! * shade;
      data[offset + 1] = data[offset + 1]! * shade;
      data[offset + 2] = data[offset + 2]! * shade;
    }
  }
}
