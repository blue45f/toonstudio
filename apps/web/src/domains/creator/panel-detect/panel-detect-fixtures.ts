/**
 * 컷 감지 테스트용 합성 이미지 생성기. 바이너리 픽스처를 커밋하지 않고 코드로 만든다.
 *
 * 모든 그림은 결정적이다(난수는 mulberry32 시드 고정). 컷 "그림"은 여백색(흰·검정·파스텔)과 채널 하나 이상이 28 넘게
 * 달라지도록 색 범위를 [50, 205] 로 묶었다. 컷 안에는 여백색(흰색) 말풍선을 둘 수 있는데, 컷 폭·높이 전체를 가로지르지
 * 않으므로 여백 줄로 오인되지 않는다.
 */

import type { PanelDetectRaster, PanelRect } from "./panel-detect-types";

export type Rgb = readonly [number, number, number];

export const WHITE: Rgb = [255, 255, 255];
export const BLACK: Rgb = [0, 0, 0];
export const PASTEL: Rgb = [205, 225, 245];
export const PAPER: Rgb = [250, 247, 240];
export const INK: Rgb = [20, 20, 24];

const ART_PALETTES: readonly Rgb[] = [
  [120, 150, 190],
  [190, 130, 110],
  [110, 170, 130],
  [160, 120, 180],
  [170, 160, 90],
  [90, 140, 170],
];

/** 결정적 난수(0~1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ArtOptions {
  /** 테두리 두께(px). 0 이면 테두리 없음. 기본 3. */
  readonly border?: number;
  readonly borderColor?: Rgb;
  /** 팔레트 번호와 무늬 위상. */
  readonly seed?: number;
  /** 컷 안쪽 흰 말풍선. 기본 true. */
  readonly balloon?: boolean;
}

export class FixtureImage {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    background: Rgb | null,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
    if (background !== null) this.fillRect(0, 0, width, height, background);
  }

  private put(x: number, y: number, color: Rgb, alpha = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const p = (y * this.width + x) * 4;
    this.data[p] = color[0];
    this.data[p + 1] = color[1];
    this.data[p + 2] = color[2];
    this.data[p + 3] = alpha;
  }

  fillRect(x: number, y: number, width: number, height: number, color: Rgb, alpha = 255): void {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) this.put(xx, yy, color, alpha);
    }
  }

  frameRect(x: number, y: number, width: number, height: number, thickness: number, color: Rgb): void {
    this.fillRect(x, y, width, thickness, color);
    this.fillRect(x, y + height - thickness, width, thickness, color);
    this.fillRect(x, y, thickness, height, color);
    this.fillRect(x + width - thickness, y, thickness, height, color);
  }

  /** 다각형을 짝-홀 규칙 스캔라인으로 채운다. */
  fillPolygon(points: readonly (readonly [number, number])[], color: Rgb): void {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.height - 1, Math.ceil(maxY)); y += 1) {
      const crossings: number[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        for (let x = Math.ceil(crossings[i]); x < crossings[i + 1]; x += 1) this.put(x, y, color);
      }
    }
  }

  /** 색과 사선 무늬가 있는 컷 그림. 사각형이며 rect 와 같은 범위를 채운다. */
  art(x: number, y: number, width: number, height: number, options: ArtOptions = {}): PanelRect {
    const seed = options.seed ?? 0;
    const base = ART_PALETTES[seed % ART_PALETTES.length];
    for (let yy = 0; yy < height; yy += 1) {
      for (let xx = 0; xx < width; xx += 1) {
        const wave = ((xx * 3 + yy * 5 + seed * 11) % 40) - 20;
        const hatch = (xx + yy + seed) % 9 === 0 ? 40 : 0;
        const clamp = (value: number): number => Math.min(205, Math.max(50, value));
        this.put(x + xx, y + yy, [
          clamp(base[0] + wave - hatch),
          clamp(base[1] + wave - hatch),
          clamp(base[2] + wave - hatch),
        ]);
      }
    }
    if (options.balloon !== false && width > 160 && height > 120) {
      const cx = x + Math.round(width * 0.3);
      const cy = y + Math.round(height * 0.3);
      const rx = Math.round(width * 0.14);
      const ry = Math.round(height * 0.12);
      for (let yy = -ry; yy <= ry; yy += 1) {
        for (let xx = -rx; xx <= rx; xx += 1) {
          if ((xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1) this.put(cx + xx, cy + yy, WHITE);
        }
      }
    }
    const border = options.border ?? 3;
    if (border > 0) this.frameRect(x, y, width, height, border, options.borderColor ?? INK);
    return { x, y, width, height };
  }

  /**
   * 흰 속 선화 컷: 흰 바탕에 굵은 사선 띠와 테두리만 있다. 모든 행·열에 띠가 지나가므로(≥ 24px) 컷 안이 여백 줄로
   * 오인되지 않고, 테두리 줄은 이웃 줄보다 뚜렷하게 두드러진다.
   */
  lineArt(x: number, y: number, width: number, height: number, options: { readonly border?: number; readonly seed?: number } = {}): PanelRect {
    const seed = options.seed ?? 0;
    this.fillRect(x, y, width, height, WHITE);
    const slope = width / height;
    for (let yy = 0; yy < height; yy += 1) {
      const center = Math.round(((yy * slope + seed * 37) % width));
      this.fillRect(x + Math.max(0, center - 14), y + yy, 28, 1, INK);
    }
    // 가로 방향 띠도 지나가게 해서 열도 비지 않게 한다.
    for (let xx = 0; xx < width; xx += 1) {
      const center = Math.round(((xx / slope + seed * 53) % height));
      this.fillRect(x + xx, y + Math.max(0, center - 14), 1, 28, INK);
    }
    const border = options.border ?? 3;
    if (border > 0) this.frameRect(x, y, width, height, border, INK);
    return { x, y, width, height };
  }

  /** 채널마다 ±amplitude 의 결정적 잡티(스캔·JPEG 열화 흉내). */
  noise(amplitude: number, seed: number): void {
    const random = mulberry32(seed);
    for (let p = 0; p < this.data.length; p += 4) {
      if (this.data[p + 3] === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        this.data[p + channel] += Math.round((random() * 2 - 1) * amplitude);
      }
    }
  }

  raster(): PanelDetectRaster {
    return { width: this.width, height: this.height, data: this.data };
  }
}

/** 두 사각형 교차/합집합 비율. */
export function rectIou(a: PanelRect, b: PanelRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 네 변이 모두 tolerance 픽셀 이내인지. */
export function rectNear(actual: PanelRect, expected: PanelRect, tolerance: number): boolean {
  return Math.abs(actual.x - expected.x) <= tolerance
    && Math.abs(actual.y - expected.y) <= tolerance
    && Math.abs(actual.x + actual.width - (expected.x + expected.width)) <= tolerance
    && Math.abs(actual.y + actual.height - (expected.y + expected.height)) <= tolerance;
}
