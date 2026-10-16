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

  /** 채운 타원. outline > 0 이면 가장자리 outline 두께만 INK 로 그린다(말풍선 윤곽). */
  ellipse(cx: number, cy: number, rx: number, ry: number, fill: Rgb, outline = 0): void {
    const inner = outline > 0 ? ((Math.min(rx, ry) - outline) / Math.min(rx, ry)) ** 2 : 0;
    for (let y = -ry; y <= ry; y += 1) {
      for (let x = -rx; x <= rx; x += 1) {
        const distance = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (distance <= 1) this.put(cx + x, cy + y, outline > 0 && distance > inner ? INK : fill);
      }
    }
  }

  /** 굵기 thickness 의 선분. */
  line(x0: number, y0: number, x1: number, y1: number, thickness: number, color: Rgb = INK): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      this.fillRect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
    }
  }

  /**
   * 흑백 만화 컷: 흰 바탕에 얇은 테두리만 있고 안쪽은 대부분 여백색이다(스캔 원고의 가장 흔한 모양).
   * sparse 는 인물 하나와 말풍선 하나만 띄우고, dense 는 인물에서 퍼지는 집중선을 그린다.
   * 테두리가 얇을수록 안쪽 빈 줄이 컷 사이 여백과 닮아 투영만으로는 구분하기 어렵다.
   */
  inkPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    options: { readonly frame?: number; readonly seed?: number; readonly mode?: "sparse" | "dense" } = {},
  ): PanelRect {
    const random = mulberry32((options.seed ?? 0) * 101 + 7);
    this.fillRect(x, y, width, height, WHITE);
    if (options.mode === "dense") {
      for (let i = 0; i < 26; i += 1) {
        this.line(x + Math.round(width * 0.5), y + Math.round(height * 0.5), x + Math.round(random() * width), y + Math.round(random() * height), 2);
      }
      this.ellipse(x + Math.round(width * 0.5), y + Math.round(height * 0.55), Math.round(width * 0.12), Math.round(height * 0.2), [30, 30, 34]);
    } else {
      this.ellipse(x + Math.round(width * (0.35 + random() * 0.3)), y + Math.round(height * 0.62), Math.round(width * 0.14), Math.round(height * 0.22), [30, 30, 34]);
      this.ellipse(x + Math.round(width * 0.3), y + Math.round(height * 0.2), Math.round(width * 0.16), Math.round(height * 0.09), WHITE, 3);
    }
    this.frameRect(x, y, width, height, options.frame ?? 4, INK);
    return { x, y, width, height };
  }

  /** 가운데를 중심으로 시계 방향 degrees 만큼 돌린 새 이미지(가장 가까운 화소, 바깥은 흰색). 기울어진 스캔 시험용. */
  rotated(degrees: number): FixtureImage {
    const out = new FixtureImage(this.width, this.height, WHITE);
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const cx = this.width / 2;
    const cy = this.height / 2;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const sx = Math.round(cx + (x - cx) * cos + (y - cy) * sin);
        const sy = Math.round(cy - (x - cx) * sin + (y - cy) * cos);
        if (sx < 0 || sy < 0 || sx >= this.width || sy >= this.height) continue;
        const from = (sy * this.width + sx) * 4;
        out.put(x, y, [this.data[from], this.data[from + 1], this.data[from + 2]], this.data[from + 3]);
      }
    }
    return out;
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
