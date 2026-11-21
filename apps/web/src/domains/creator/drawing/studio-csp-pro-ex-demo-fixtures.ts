/**
 * 프로·자동 도구 패널용 결정론적 샘플 벡터·선화·색조·레퍼런스 픽셀 픽스처 및 OKLCH 스타일 토큰.
 */

import type { CspColorizeHint, CspVectorStroke } from "./studio-csp-pro-ex-extensions";

export type CspProExToolId =
  | "vector-eraser"
  | "colorize-hint"
  | "gradient-map"
  | "subview-palette"
  | "quick-mask"
  | "timelapse"
  | "drawing-figure";

export const PRO_EX_TOOL_CATALOG: readonly {
  readonly id: CspProExToolId;
  readonly labelKo: string;
  readonly accentOklch: string;
}[] = [
  { id: "vector-eraser", labelKo: "벡터 교차 지우개", accentOklch: "oklch(0.67 0.19 255)" },
  { id: "colorize-hint", labelKo: "힌트 자동 채색", accentOklch: "oklch(0.71 0.18 18)" },
  { id: "gradient-map", labelKo: "그라데이션 맵 8종", accentOklch: "oklch(0.74 0.17 58)" },
  { id: "subview-palette", labelKo: "서브뷰 팔레트", accentOklch: "oklch(0.69 0.16 155)" },
  { id: "quick-mask", labelKo: "퀵 마스크", accentOklch: "oklch(0.63 0.21 15)" },
  { id: "timelapse", labelKo: "타임랩스 녹화", accentOklch: "oklch(0.66 0.18 295)" },
  { id: "drawing-figure", labelKo: "3D 데생 인형 6종", accentOklch: "oklch(0.72 0.14 200)" },
];

export const PRO_EX_SAMPLE_VECTOR_STROKES: readonly CspVectorStroke[] = [
  {
    id: "main-horiz",
    points: [
      { x: 10, y: 50, widthPx: 3.2, pressure: 0.6 },
      { x: 25, y: 49, widthPx: 3.5, pressure: 0.75 },
      { x: 50, y: 50, widthPx: 3.8, pressure: 0.9 },
      { x: 75, y: 51, widthPx: 3.5, pressure: 0.75 },
      { x: 90, y: 50, widthPx: 3.0, pressure: 0.5 },
    ],
  },
  {
    id: "cross-left",
    points: [
      { x: 30, y: 14, widthPx: 2.6, pressure: 0.65 },
      { x: 30, y: 50, widthPx: 2.8, pressure: 0.85 },
      { x: 30, y: 86, widthPx: 2.6, pressure: 0.6 },
    ],
  },
  {
    id: "cross-right",
    points: [
      { x: 70, y: 14, widthPx: 2.6, pressure: 0.65 },
      { x: 70, y: 50, widthPx: 2.8, pressure: 0.85 },
      { x: 70, y: 86, widthPx: 2.6, pressure: 0.6 },
    ],
  },
];

export const PRO_EX_COLORIZE_HINT_THEMES: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly hints: readonly CspColorizeHint[];
}[] = [
  {
    id: "sakura-sky",
    labelKo: "벚꽃 핑크 + 맑은 하늘",
    hints: [
      { x: 4, y: 8, r: 244, g: 148, b: 178, labelKo: "벚꽃 핑크" },
      { x: 12, y: 8, r: 104, g: 186, b: 242, labelKo: "맑은 하늘" },
    ],
  },
  {
    id: "sunset-navy",
    labelKo: "노을 오렌지 + 깊은 남색",
    hints: [
      { x: 4, y: 8, r: 242, g: 126, b: 68, labelKo: "노을 오렌지" },
      { x: 12, y: 8, r: 58, g: 76, b: 146, labelKo: "깊은 남색" },
    ],
  },
  {
    id: "rofan-mint",
    labelKo: "로판 골드 + 숲 민트",
    hints: [
      { x: 4, y: 8, r: 234, g: 188, b: 92, labelKo: "로판 골드" },
      { x: 12, y: 8, r: 78, g: 196, b: 158, labelKo: "숲 민트" },
    ],
  },
];

export const PRO_EX_SUBVIEW_SCENES: readonly {
  readonly id: "sunset-sea" | "neon-alley" | "sakura-garden";
  readonly labelKo: string;
  readonly paletteStops: readonly (readonly [number, number, number])[];
}[] = [
  {
    id: "sunset-sea",
    labelKo: "노을 바다",
    paletteStops: [
      [44, 28, 72],
      [164, 58, 92],
      [236, 124, 72],
      [252, 204, 128],
      [46, 98, 148],
      [112, 168, 198],
      [246, 232, 212],
      [28, 42, 74],
    ],
  },
  {
    id: "neon-alley",
    labelKo: "네온 골목",
    paletteStops: [
      [18, 20, 44],
      [224, 48, 152],
      [42, 212, 236],
      [148, 68, 234],
      [250, 218, 74],
      [48, 56, 96],
      [236, 246, 255],
      [18, 108, 134],
    ],
  },
  {
    id: "sakura-garden",
    labelKo: "벚꽃 정원",
    paletteStops: [
      [246, 174, 198],
      [254, 224, 234],
      [136, 198, 242],
      [98, 162, 114],
      [114, 76, 86],
      [248, 242, 226],
      [196, 102, 138],
      [64, 116, 84],
    ],
  },
];

export const PRO_EX_TACTILE_BTN =
  "min-h-11 min-w-11 rounded-lg px-3 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none";

export const PRO_EX_PRIMARY_CTA_STYLE = {
  backgroundColor: "var(--color-accent)",
  color: "var(--color-on-accent)",
  boxShadow:
    "0 0 0 1px color-mix(in oklch, var(--color-accent) 55%, transparent), 0 8px 18px -8px color-mix(in oklch, var(--color-accent) 58%, transparent)",
} as const;

export const PRO_EX_ACTIVE_CHIP_STYLE = {
  boxShadow:
    "0 0 0 1px color-mix(in oklch, var(--color-accent) 44%, transparent), 0 4px 12px -6px color-mix(in oklch, var(--color-accent) 44%, transparent)",
} as const;

export function buildProExSampleLineArt(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  const midX = Math.floor(width / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const isDivider = x === midX;
      if (isBorder || isDivider) {
        buf[idx] = 18;
        buf[idx + 1] = 20;
        buf[idx + 2] = 26;
        buf[idx + 3] = 255;
      } else {
        buf[idx] = 252;
        buf[idx + 1] = 252;
        buf[idx + 2] = 254;
        buf[idx + 3] = 255;
      }
    }
  }
  return buf;
}

export function buildProExSampleTonalGrid(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const lum = Math.round(((x + y) / Math.max(1, width + height - 2)) * 235 + 10);
      buf[idx] = lum;
      buf[idx + 1] = Math.min(255, Math.round(lum * 0.96));
      buf[idx + 2] = Math.min(255, Math.round(lum * 0.92));
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

export function buildProExSampleSceneBuffer(
  stops: readonly (readonly [number, number, number])[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  const count = Math.max(1, stops.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const band = Math.floor((y / height) * 4) * 2 + Math.floor((x / width) * 2);
      const color = stops[band % count] ?? [128, 128, 128];
      const idx = (y * width + x) * 4;
      buf[idx] = color[0];
      buf[idx + 1] = color[1];
      buf[idx + 2] = color[2];
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

export function makeProExTimelapseStrokeFrame(step: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(16 * 16 * 4);
  const limit = Math.min(15, 3 + step * 2);
  for (let y = 2; y <= limit; y += 1) {
    for (let x = 2; x <= limit; x += 1) {
      const idx = (y * 16 + x) * 4;
      buf[idx] = (40 + step * 28) % 245;
      buf[idx + 1] = (110 + x * 7) % 245;
      buf[idx + 2] = (180 + y * 4) % 245;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}
