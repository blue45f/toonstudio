/**
 * 앵커 점검 시험용 합성 이미지 — 도형으로 그린 사람 모양 그림과 배경. 운영 코드가 가져오지 않는다.
 *
 * 실제 캐릭터 이미지를 저장소에 두지 않고, 색·포즈·배경·좌우·크기를 하나씩 바꿔 가며 점수가 기대한 방향으로 움직이는지
 * 확인한다. 이 그림들로 얻은 값은 알고리즘의 방향성 시험이며 실제 작품에서의 정확도를 뜻하지 않는다.
 */

import type { AnchorRaster } from "./anchor-raster";

export type Rgb = readonly [number, number, number];

export interface SyntheticShape {
  readonly kind: "rect" | "ellipse";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: Rgb;
}

export interface SyntheticSpec {
  readonly width: number;
  readonly height: number;
  /** null 이면 투명 배경. */
  readonly background: Rgb | null;
  readonly shapes: readonly SyntheticShape[];
  /** 모든 불투명 픽셀 채널에 ±amount 이내의 시드 고정 잡음을 더한다. */
  readonly noise?: { readonly amount: number; readonly seed: number };
}

/** 시드가 같으면 같은 수열을 내는 간단한 난수. */
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

function inside(shape: SyntheticShape, px: number, py: number): boolean {
  if (shape.kind === "rect") return px >= shape.x && px < shape.x + shape.w && py >= shape.y && py < shape.y + shape.h;
  const rx = shape.w / 2;
  const ry = shape.h / 2;
  const dx = (px + 0.5 - (shape.x + rx)) / rx;
  const dy = (py + 0.5 - (shape.y + ry)) / ry;
  return dx * dx + dy * dy <= 1;
}

export function renderSynthetic(spec: SyntheticSpec): AnchorRaster {
  const { width, height } = spec;
  const data = new Uint8ClampedArray(width * height * 4);
  const random = spec.noise ? mulberry32(spec.noise.seed) : null;
  const amount = spec.noise?.amount ?? 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color: Rgb | null = spec.background;
      for (const shape of spec.shapes) if (inside(shape, x, y)) color = shape.color;
      const offset = (y * width + x) * 4;
      if (!color) continue;
      const jitter = (): number => (random ? (random() * 2 - 1) * amount : 0);
      data[offset] = color[0] + jitter();
      data[offset + 1] = color[1] + jitter();
      data[offset + 2] = color[2] + jitter();
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

export interface FigureStyle {
  readonly skin: Rgb;
  readonly hair: Rgb;
  readonly top: Rgb;
  readonly bottom: Rgb;
  /** 한쪽에만 있는 소품 색(좌우 비대칭을 만든다). */
  readonly bag: Rgb;
}

export const FIGURE_STYLE_A: FigureStyle = { skin: [236, 196, 170], hair: [60, 36, 30], top: [200, 40, 50], bottom: [40, 70, 150], bag: [240, 200, 40] };
/** A 와 색 계열이 전혀 다른 팔레트. */
export const FIGURE_STYLE_B: FigureStyle = { skin: [120, 190, 110], hair: [230, 230, 240], top: [40, 170, 160], bottom: [140, 60, 170], bag: [30, 30, 30] };

export type FigurePose = "stand" | "arms-up" | "wide" | "side";

export interface FigureOptions {
  readonly pose?: FigurePose;
  /** 그림 전체 배율(1 = 화면 높이의 약 80%). */
  readonly scale?: number;
  /** 화면 폭·높이 대비 이동량. */
  readonly dx?: number;
  readonly dy?: number;
  /** 좌우를 뒤집는다. */
  readonly mirror?: boolean;
}

/** 화면 크기에 맞춰 사람 모양 도형을 만든다. 중심은 화면 가로 중앙이다. */
export function figureShapes(width: number, height: number, style: FigureStyle, options: FigureOptions = {}): SyntheticShape[] {
  const pose = options.pose ?? "stand";
  const scale = options.scale ?? 1;
  const cx = width * (0.5 + (options.dx ?? 0));
  const top = height * (0.1 + (options.dy ?? 0));
  const u = (value: number): number => value * scale;
  const torsoWidth = pose === "wide" ? 0.4 : pose === "side" ? 0.14 : 0.26;
  const shapes: SyntheticShape[] = [];
  const rect = (x: number, y: number, w: number, h: number, color: Rgb): void => {
    const left = cx + width * u(x);
    shapes.push({ kind: "rect", x: left, y: top + height * u(y), w: width * u(w), h: height * u(h), color });
  };
  const ellipse = (x: number, y: number, w: number, h: number, color: Rgb): void => {
    const left = cx + width * u(x);
    shapes.push({ kind: "ellipse", x: left, y: top + height * u(y), w: width * u(w), h: height * u(h), color });
  };
  ellipse(-0.09, 0, 0.18, 0.14, style.hair);
  ellipse(-0.07, 0.03, 0.14, 0.12, style.skin);
  rect(-torsoWidth / 2, 0.15, torsoWidth, 0.28, style.top);
  if (pose === "arms-up") {
    rect(-torsoWidth / 2 - 0.06, -0.02, 0.06, 0.3, style.skin);
    rect(torsoWidth / 2, -0.02, 0.06, 0.3, style.skin);
  } else {
    rect(-torsoWidth / 2 - 0.06, 0.16, 0.06, 0.24, style.skin);
    rect(torsoWidth / 2, 0.16, 0.06, 0.24, style.skin);
  }
  if (pose === "side") {
    rect(-0.05, 0.43, 0.1, 0.33, style.bottom);
  } else {
    const gap = pose === "wide" ? 0.06 : 0.01;
    rect(-0.13 - gap, 0.43, 0.12, 0.33, style.bottom);
    rect(0.01 + gap, 0.43, 0.12, 0.33, style.bottom);
  }
  rect(-torsoWidth / 2 - 0.15, 0.33, 0.08, 0.1, style.bag);
  if (!options.mirror) return shapes;
  return shapes.map((shape) => ({ ...shape, x: 2 * cx - shape.x - shape.w }));
}

export interface FigureImageOptions extends FigureOptions {
  readonly width?: number;
  readonly height?: number;
  readonly style?: FigureStyle;
  /** 배경색. null 이면 투명. */
  readonly background?: Rgb | null;
  readonly noise?: SyntheticSpec["noise"];
}

export function figureRaster(options: FigureImageOptions = {}): AnchorRaster {
  const width = options.width ?? 128;
  const height = options.height ?? 192;
  const background = options.background === undefined ? ([191, 191, 191] as const) : options.background;
  return renderSynthetic({
    width,
    height,
    background,
    shapes: figureShapes(width, height, options.style ?? FIGURE_STYLE_A, options),
    ...(options.noise ? { noise: options.noise } : {}),
  });
}

/** 시드 고정 잡음만 있는 이미지(피사체도 배경도 없다). */
export function noiseRaster(width: number, height: number, seed: number): AnchorRaster {
  const random = mulberry32(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = Math.floor(random() * 256);
    data[index * 4 + 1] = Math.floor(random() * 256);
    data[index * 4 + 2] = Math.floor(random() * 256);
    data[index * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** 같은 크기로 좌우를 뒤집은 래스터. */
export function flipRasterHorizontally(raster: AnchorRaster): AnchorRaster {
  const out = new Uint8ClampedArray(raster.data.length);
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const from = (y * raster.width + x) * 4;
      const to = (y * raster.width + (raster.width - 1 - x)) * 4;
      for (let channel = 0; channel < 4; channel += 1) out[to + channel] = raster.data[from + channel] ?? 0;
    }
  }
  return { width: raster.width, height: raster.height, data: out };
}
