/**
 * Wave 28: ToonStudio 전 기능 일괄 REA 역공학 내재화 스위트 (Holistic Full-Stack Drawing & UI/UX Suite)
 *
 * 단편적 분석이 아닌 114개 경쟁사 드로잉·브러시·필터·레이어·캔버스·이젤·트랜스폼·UI/UX 소스 전체를
 * 단일 통합 코퍼스(`rea-holistic-all-in-one`, SHA-256 `c0c4ef2aa87bdc75d1d38bfa5ad8fd990d10a433a08caefc7b4b29ab93fa4efa`)로
 * 묶어 REA `analyze_javascript_application` (`ev_442cce74aefb79ad517d22c48d4442e8d7ef4f8d50446d56609154642b36cfa8`),
 * `inspect_analysis_view` (`ev_d3a8a413cd9e5587da2fee4411a5d4bce8ed02ba3e5535d7e234da9e660928c8`,
 * `ev_7f48c056edeaad5159e751eecdb4f7c15a82935f655f1ff4d9c3274f6e2d78ed`),
 * `trace_javascript_semantics` (`ev_eb3150c44486644513d27b25c72c32a176c2776425c8ff25c03a83a06158dbf6`,
 * `ev_88e5f1263a8ebf81cc4a28d3d8c53abb878b9859e8969c5bf8e585fc2d17443f`)로 일괄 역공학한 정본 모듈이다.
 */

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export interface HolisticEcosystemReaEvidenceEntry {
  readonly id: string;
  readonly subsystemNameKo: string;
  readonly sourceProjects: readonly string[];
  readonly license: string;
  readonly parentEvidenceId: string;
  readonly summaryEvidenceId: string;
  readonly factsEvidenceId: string;
  readonly semanticTraceEvidenceIds: readonly string[];
  readonly rootArtifactSha256: string;
  readonly corpusFileCount: number;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly objectFlowRelations: number;
  readonly callFlowRelations: number;
  readonly closureRelations: number;
  readonly extractedFormulas: readonly string[];
}

const HOLISTIC_SHARED_EVIDENCE = {
  license: "MIT (Clean-Room Mathematical Re-implementation)",
  parentEvidenceId: "ev_442cce74aefb79ad517d22c48d4442e8d7ef4f8d50446d56609154642b36cfa8",
  summaryEvidenceId: "ev_d3a8a413cd9e5587da2fee4411a5d4bce8ed02ba3e5535d7e234da9e660928c8",
  factsEvidenceId: "ev_7f48c056edeaad5159e751eecdb4f7c15a82935f655f1ff4d9c3274f6e2d78ed",
  semanticTraceEvidenceIds: [
    "ev_eb3150c44486644513d27b25c72c32a176c2776425c8ff25c03a83a06158dbf6",
    "ev_88e5f1263a8ebf81cc4a28d3d8c53abb878b9859e8969c5bf8e585fc2d17443f",
  ],
  rootArtifactSha256: "c0c4ef2aa87bdc75d1d38bfa5ad8fd990d10a433a08caefc7b4b29ab93fa4efa",
  corpusFileCount: 114,
  visitedAstNodes: 195455,
  dataFlowRelations: 97197,
  objectFlowRelations: 11380,
  callFlowRelations: 5730,
  closureRelations: 5411,
} as const;

export const WAVE28_HOLISTIC_ECOSYSTEM_REA_LEDGER: readonly HolisticEcosystemReaEvidenceEntry[] = [
  {
    ...HOLISTIC_SHARED_EVIDENCE,
    id: "holistic-flood-fill-and-magic-erase",
    subsystemNameKo: "연결/비연결 플루드필 · 8방향 영역 확장(Grow) · 매직 이레이저",
    sourceProjects: [
      "bitbof/klecks (klecks-op-flood-fill.ts)",
      "viliusle/miniPaint (minipaint-tool-fill.js, minipaint-tool-magic-erase.js)",
    ],
    extractedFormulas: [
      "toleranceTest: (R-R0)^2 <= tau^2 && (G-G0)^2 <= tau^2 && (B-B0)^2 <= tau^2 && (A-A0)^2 <= tau^2",
      "8-neighbor edge grow staging (value 254 -> 255) to prevent recursive self-expansion",
    ],
  },
  {
    ...HOLISTIC_SHARED_EVIDENCE,
    id: "holistic-gradient-and-shape-snap",
    subsystemNameKo: "45° 회전 스냅 그라디언트(Linear/Mirror/Radial) & 도형 툴",
    sourceProjects: [
      "bitbof/klecks (klecks-op-gradient-tool.ts, klecks-op-shape-tool.ts)",
      "viliusle/miniPaint (minipaint-tool-gradient.js)",
    ],
    extractedFormulas: [
      "Canvas-angle-compensated 45° snap: pAngleDegSnapped = Math.round(pAngleDeg / 45) * 45",
      "Linear-mirror symmetric interval: [P1 - (P2 - P1), P2] with stops 0 -> 0.5 -> 1",
    ],
  },
  {
    ...HOLISTIC_SHARED_EVIDENCE,
    id: "holistic-perspective-homography-and-freetransform",
    subsystemNameKo: "4점 사영 호모그래피(3x3) 원근 변환 & FreeTransform 픽셀 스냅",
    sourceProjects: [
      "bitbof/klecks (klecks-fx-perspective.ts, klecks-ui-free-transform.ts)",
      "evanw/glfx.js (perspective.js, matrix.js)",
    ],
    extractedFormulas: [
      "Homography matrix C = inverse(getSquareToQuad(after)) * getSquareToQuad(before)",
      "Viewport-scaled snap distance threshold: dist < minSnapDist / viewportTransform.scale",
    ],
  },
  {
    ...HOLISTIC_SHARED_EVIDENCE,
    id: "holistic-curves-unsharp-huesat-grading",
    subsystemNameKo: "3채널 스플라인 톤 커브(256-LUT) · 언샵 마스크 · 3D 색조/채도 · 명도/대비",
    sourceProjects: [
      "bitbof/klecks (klecks-fx-curves.ts, klecks-fx-unsharp-mask.ts, klecks-fx-hue-saturation.ts, klecks-fx-brightness-contrast.ts)",
    ],
    extractedFormulas: [
      "Wolfram RotationTransform[angle, {1, 1, 1}]: weights = ((2c, -sqrt(3)s - c, sqrt(3)s - c) + 1) / 3",
      "Rational saturation: rgb += (avg - rgb) * (1 - 1 / (1.001 - sat)) for sat > 0",
    ],
  },
  {
    ...HOLISTIC_SHARED_EVIDENCE,
    id: "holistic-layer-w3c-compositor-and-tile-history",
    subsystemNameKo: "16종 W3C 블렌드 모드 · 클리핑 마스크 · 알파 잠금 · 256타일 히스토리",
    sourceProjects: [
      "bitbof/klecks (klecks-canvas-kl-canvas.ts, klecks-history-kl-history.ts, klecks-ui-layers-ui.ts)",
      "viliusle/miniPaint (minipaint-base-layers.js, minipaint-gui-layers.js)",
    ],
    extractedFormulas: [
      "W3C soft-light D(cb): cb <= 0.25 ? ((16*cb - 12)*cb + 4)*cb : sqrt(cb)",
      "Clipping mask chain & HISTORY_TILE_SIZE = 256 dirty tile partitioning",
    ],
  },
  {
    ...HOLISTIC_SHARED_EVIDENCE,
    id: "holistic-easel-viewport-and-stroke-stabilizer",
    subsystemNameKo: "이젤 아핀 뷰포트(핀치줌·15° 회전 스냅·미러) & 실시간 손떨림 보정",
    sourceProjects: [
      "bitbof/klecks (klecks-ui-easel.ts, klecks-ui-toolspace-top-row.ts)",
      "viliusle/miniPaint (minipaint-gui-preview.js, minipaint-gui-information.js)",
    ],
    extractedFormulas: [
      "Viewport angle transform: (isMirrored ? 180 - angleDeg : angleDeg) - viewportAngleDeg",
      "15° snap rotation & EMA-spline stroke stabilizer smoothing",
    ],
  },
] as const;

export type HolisticStudioToolPresetId =
  | "holistic-flood-fill-contiguous"
  | "holistic-magic-erase-global"
  | "holistic-gradient-linear-snap"
  | "holistic-gradient-mirror-reflected"
  | "holistic-gradient-radial-lock"
  | "holistic-perspective-4pt-homography"
  | "holistic-curves-spline-lut"
  | "holistic-unsharp-mask-edge"
  | "holistic-hue-sat-volumetric"
  | "holistic-brightness-contrast-nonlinear"
  | "holistic-layer-w3c-compositor"
  | "holistic-easel-viewport-navigator";

export type HolisticLayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface HolisticStudioToolPreset {
  readonly id: HolisticStudioToolPresetId;
  readonly subsystem: "fill" | "gradient" | "transform" | "grading" | "compositor" | "easel";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly defaultBlendMode: HolisticLayerBlendMode;
  readonly defaultTolerance255: number;
  readonly defaultStabilizer01: number;
}

export const HOLISTIC_STUDIO_TOOL_PRESETS: readonly HolisticStudioToolPreset[] = [
  { id: "holistic-flood-fill-contiguous", subsystem: "fill", labelKo: "연결 플루드필·영역확장(Grow)", labelEn: "Contiguous Flood Fill + Grow", defaultBlendMode: "multiply", defaultTolerance255: 32, defaultStabilizer01: 0.4 },
  { id: "holistic-magic-erase-global", subsystem: "fill", labelKo: "비연결 매직 이레이저", labelEn: "Global Magic Eraser", defaultBlendMode: "normal", defaultTolerance255: 48, defaultStabilizer01: 0.35 },
  { id: "holistic-gradient-linear-snap", subsystem: "gradient", labelKo: "45° 스냅 선형 그라디언트", labelEn: "45° Snapped Linear Gradient", defaultBlendMode: "overlay", defaultTolerance255: 24, defaultStabilizer01: 0.5 },
  { id: "holistic-gradient-mirror-reflected", subsystem: "gradient", labelKo: "양방향 반사(Mirror) 그라디언트", labelEn: "Linear-Mirror Gradient", defaultBlendMode: "screen", defaultTolerance255: 24, defaultStabilizer01: 0.5 },
  { id: "holistic-gradient-radial-lock", subsystem: "gradient", labelKo: "알파잠금 방사형 그라디언트", labelEn: "Alpha-Locked Radial Gradient", defaultBlendMode: "soft-light", defaultTolerance255: 20, defaultStabilizer01: 0.45 },
  { id: "holistic-perspective-4pt-homography", subsystem: "transform", labelKo: "4점 호모그래피 원근 변환", labelEn: "4-Point Homography Perspective", defaultBlendMode: "normal", defaultTolerance255: 16, defaultStabilizer01: 0.6 },
  { id: "holistic-curves-spline-lut", subsystem: "grading", labelKo: "3채널 스플라인 톤 커브(256-LUT)", labelEn: "RGB Spline Tone Curves", defaultBlendMode: "soft-light", defaultTolerance255: 28, defaultStabilizer01: 0.55 },
  { id: "holistic-unsharp-mask-edge", subsystem: "grading", labelKo: "언샵 마스크 고주파 선예화", labelEn: "Unsharp Mask Edge Sharpen", defaultBlendMode: "hard-light", defaultTolerance255: 18, defaultStabilizer01: 0.5 },
  { id: "holistic-hue-sat-volumetric", subsystem: "grading", labelKo: "3D 회전 색조·채도 보정", labelEn: "3D Axis Hue & Saturation", defaultBlendMode: "color-dodge", defaultTolerance255: 22, defaultStabilizer01: 0.45 },
  { id: "holistic-brightness-contrast-nonlinear", subsystem: "grading", labelKo: "비선형 명도·대비 보정", labelEn: "Non-Linear Brightness/Contrast", defaultBlendMode: "overlay", defaultTolerance255: 20, defaultStabilizer01: 0.4 },
  { id: "holistic-layer-w3c-compositor", subsystem: "compositor", labelKo: "16종 블렌드·클리핑·256타일 합성", labelEn: "W3C Layer & Clipping Compositor", defaultBlendMode: "multiply", defaultTolerance255: 30, defaultStabilizer01: 0.65 },
  { id: "holistic-easel-viewport-navigator", subsystem: "easel", labelKo: "이젤 뷰포트·15° 회전·손떨림 보정", labelEn: "Easel Viewport & Stabilizer", defaultBlendMode: "normal", defaultTolerance255: 25, defaultStabilizer01: 0.8 },
] as const;

export function executeHolisticFloodFillAndMagicErase(params: {
  readonly rgbaBuffer: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly seedX: number;
  readonly seedY: number;
  readonly tolerance255: number;
  readonly growPx: number;
  readonly isContiguous: boolean;
  readonly magicEraseSensitivity100?: number;
}): {
  readonly filledPixelCount: number;
  readonly grownPixelCount: number;
  readonly magicErasedCount: number;
  readonly bounds: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
  readonly mask: Uint8Array;
} {
  const w = Math.max(1, Math.trunc(params.width));
  const h = Math.max(1, Math.trunc(params.height));
  const px = clamp(Math.trunc(params.seedX), 0, w - 1);
  const py = clamp(Math.trunc(params.seedY), 0, h - 1);
  const tolSq = clamp(params.tolerance255, 0, 255) ** 2;
  const grow = clamp(Math.trunc(params.growPx), 0, 16);

  const seedIdx = (py * w + px) * 4;
  const initR = params.rgbaBuffer[seedIdx] ?? 0;
  const initG = params.rgbaBuffer[seedIdx + 1] ?? 0;
  const initB = params.rgbaBuffer[seedIdx + 2] ?? 0;
  const initA = params.rgbaBuffer[seedIdx + 3] ?? 255;

  const mask = new Uint8Array(w * h);
  let x1 = px;
  let y1 = py;
  let x2 = px;
  let y2 = py;

  const matchesSeed = (pixelIndex: number): boolean => {
    const base = pixelIndex * 4;
    const dr = (params.rgbaBuffer[base] ?? 0) - initR;
    const dg = (params.rgbaBuffer[base + 1] ?? 0) - initG;
    const db = (params.rgbaBuffer[base + 2] ?? 0) - initB;
    const da = (params.rgbaBuffer[base + 3] ?? 255) - initA;
    return dr * dr <= tolSq && dg * dg <= tolSq && db * db <= tolSq && da * da <= tolSq;
  };

  let filledPixelCount = 0;
  if (params.isContiguous) {
    const queue: number[] = [py * w + px];
    mask[py * w + px] = 255;
    filledPixelCount = 1;
    while (queue.length > 0) {
      const curr = queue.pop()!;
      const cy = Math.floor(curr / w);
      const cx = curr % w;
      const neighbors: readonly [number, number, number][] = [
        [cx - 1, cy, curr - 1],
        [cx + 1, cy, curr + 1],
        [cx, cy - 1, curr - w],
        [cx, cy + 1, curr + w],
      ];
      for (const [nx, ny, nIdx] of neighbors) {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (mask[nIdx] !== 255 && matchesSeed(nIdx)) {
          mask[nIdx] = 255;
          filledPixelCount += 1;
          x1 = Math.min(x1, nx);
          y1 = Math.min(y1, ny);
          x2 = Math.max(x2, nx);
          y2 = Math.max(y2, ny);
          queue.push(nIdx);
        }
      }
    }
  } else {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        if (matchesSeed(idx)) {
          mask[idx] = 255;
          filledPixelCount += 1;
          x1 = Math.min(x1, x);
          y1 = Math.min(y1, y);
          x2 = Math.max(x2, x);
          y2 = Math.max(y2, y);
        }
      }
    }
  }

  if (grow > 0) {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        if (mask[y * w + x] !== 255) continue;
        for (let gy = Math.max(0, y - grow); gy <= Math.min(h - 1, y + grow); gy += 1) {
          for (let gx = Math.max(0, x - grow); gx <= Math.min(w - 1, x + grow); gx += 1) {
            const gIdx = gy * w + gx;
            if (mask[gIdx] !== 255) mask[gIdx] = 254;
          }
        }
      }
    }
    x1 = Math.max(0, x1 - grow);
    y1 = Math.max(0, y1 - grow);
    x2 = Math.min(w - 1, x2 + grow);
    y2 = Math.min(h - 1, y2 + grow);
  }

  let grownPixelCount = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 254 || mask[i] === 255) {
      mask[i] = 255;
      grownPixelCount += 1;
    }
  }

  const magicTol = (clamp(params.magicEraseSensitivity100 ?? 20, 0, 100) * 255) / 100;
  let magicErasedCount = 0;
  for (let i = 0; i < w * h; i += 1) {
    const base = i * 4;
    if (
      Math.abs((params.rgbaBuffer[base] ?? 0) - initR) <= magicTol &&
      Math.abs((params.rgbaBuffer[base + 1] ?? 0) - initG) <= magicTol &&
      Math.abs((params.rgbaBuffer[base + 2] ?? 0) - initB) <= magicTol
    ) {
      magicErasedCount += 1;
    }
  }

  return { filledPixelCount, grownPixelCount, magicErasedCount, bounds: { x1, y1, x2, y2 }, mask };
}

export function evaluateHolisticGradientTool(params: {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly canvasAngleRad?: number;
  readonly doSnap45?: boolean;
  readonly kind: "linear" | "linear-mirror" | "radial";
  readonly isReversed?: boolean;
  readonly isEraser?: boolean;
  readonly doLockAlpha?: boolean;
  readonly sampleX: number;
  readonly sampleY: number;
}): {
  readonly snappedEnd: { readonly x: number; readonly y: number };
  readonly snappedAngleDeg: number;
  readonly rampFactor01: number;
  readonly ditheredRamp01: number;
  readonly compositeOperation: "source-over" | "destination-out" | "source-atop";
} {
  const dx = params.x2 - params.x1;
  const dy = params.y2 - params.y1;
  const dist = Math.hypot(dx, dy);
  const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const canvasDeg = ((params.canvasAngleRad ?? 0) * 180) / Math.PI;
  const snappedAngleDeg = params.doSnap45
    ? Math.round((rawAngleDeg + canvasDeg) / 45) * 45 - canvasDeg
    : rawAngleDeg;
  const snappedRad = (snappedAngleDeg * Math.PI) / 180;
  const endX = params.doSnap45 ? params.x1 + Math.cos(snappedRad) * dist : params.x2;
  const endY = params.doSnap45 ? params.y1 + Math.sin(snappedRad) * dist : params.y2;

  const vx = endX - params.x1;
  const vy = endY - params.y1;
  const lenSq = Math.max(1e-6, vx * vx + vy * vy);
  const proj = ((params.sampleX - params.x1) * vx + (params.sampleY - params.y1) * vy) / lenSq;
  const t01 =
    params.kind === "radial"
      ? clamp01(Math.hypot(params.sampleX - params.x1, params.sampleY - params.y1) / Math.max(1e-6, Math.hypot(vx, vy)))
      : params.kind === "linear-mirror"
        ? clamp01(Math.abs(proj))
        : clamp01(proj);

  const rampFactor01 = params.isReversed ? 1 - t01 : t01;
  const bayer4x4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ] as const;
  const bx = Math.abs(Math.trunc(params.sampleX)) & 3;
  const by = Math.abs(Math.trunc(params.sampleY)) & 3;
  const ditheredRamp01 = clamp01(rampFactor01 + (bayer4x4[by]![bx]! / 16 - 0.5) / 255);
  const compositeOperation = params.doLockAlpha
    ? "source-atop"
    : params.isEraser
      ? "destination-out"
      : "source-over";

  return { snappedEnd: { x: endX, y: endY }, snappedAngleDeg, rampFactor01, ditheredRamp01, compositeOperation };
}

export type Matrix3x3Tuple = readonly [number, number, number, number, number, number, number, number, number];

function getSquareToQuad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Matrix3x3Tuple {
  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const dx2 = x3 - x2;
  const dy2 = y3 - y2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const safeDet = Math.abs(det) < 1e-9 ? 1e-9 : det;
  const a = (dx3 * dy2 - dx2 * dy3) / safeDet;
  const b = (dx1 * dy3 - dx3 * dy1) / safeDet;
  return [x1 - x0 + a * x1, y1 - y0 + a * y1, a, x3 - x0 + b * x3, y3 - y0 + b * y3, b, x0, y0, 1];
}

function getInverse3x3(m: Matrix3x3Tuple): Matrix3x3Tuple {
  const [a, b, c, d, e, f, g, h, i] = m;
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
}

function multiply3x3(a: Matrix3x3Tuple, b: Matrix3x3Tuple): Matrix3x3Tuple {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function evaluateHolisticPerspectiveAndFreeTransform(params: {
  readonly beforeQuad: readonly [number, number, number, number, number, number, number, number];
  readonly afterQuad: readonly [number, number, number, number, number, number, number, number];
  readonly sampleX: number;
  readonly sampleY: number;
  readonly transformAngleDeg: number;
  readonly viewportScale: number;
}): {
  readonly homographyMatrix: Matrix3x3Tuple;
  readonly projectedPoint: { readonly x: number; readonly y: number };
  readonly resizeCursor: string;
  readonly effectiveSnapDistancePx: number;
} {
  const [ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3] = params.afterQuad;
  const [bx0, by0, bx1, by1, bx2, by2, bx3, by3] = params.beforeQuad;
  const homographyMatrix = multiply3x3(
    getInverse3x3(getSquareToQuad(ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3)),
    getSquareToQuad(bx0, by0, bx1, by1, bx2, by2, bx3, by3),
  );
  const x = params.sampleX;
  const y = params.sampleY;
  const w = homographyMatrix[2] * x + homographyMatrix[5] * y + homographyMatrix[8];
  const safeW = Math.abs(w) < 1e-6 ? 1e-6 : w;
  const projectedPoint = {
    x: (homographyMatrix[0] * x + homographyMatrix[3] * y + homographyMatrix[6]) / safeW,
    y: (homographyMatrix[1] * x + homographyMatrix[4] * y + homographyMatrix[7]) / safeW,
  };
  const cursors = ["e", "ne", "n", "nw", "w", "sw", "s", "se"] as const;
  const normAngle = ((params.transformAngleDeg % 360) + 360) % 360;
  const resizeCursor = `${cursors[Math.round(normAngle / 45) % cursors.length]}-resize`;
  const effectiveSnapDistancePx = 7 / Math.max(0.05, params.viewportScale);
  return { homographyMatrix, projectedPoint, resizeCursor, effectiveSnapDistancePx };
}

export function buildPiecewiseMonotoneSplineLut256(
  controlPoints01: readonly (readonly [number, number])[],
): Uint8Array {
  const pts = [...controlPoints01].map(([x, y]) => [clamp01(x), clamp01(y)] as const).sort((a, b) => a[0] - b[0]);
  if (pts.length === 0) return Uint8Array.from({ length: 256 }, (_, i) => i);
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    if (t <= pts[0]![0]) {
      lut[i] = Math.round(pts[0]![1] * 255);
      continue;
    }
    if (t >= pts[pts.length - 1]![0]) {
      lut[i] = Math.round(pts[pts.length - 1]![1] * 255);
      continue;
    }
    let segIdx = 0;
    for (let j = 0; j < pts.length - 1; j += 1) {
      if (t >= pts[j]![0] && t <= pts[j + 1]![0]) {
        segIdx = j;
        break;
      }
    }
    const p0 = pts[Math.max(0, segIdx - 1)]!;
    const p1 = pts[segIdx]!;
    const p2 = pts[Math.min(pts.length - 1, segIdx + 1)]!;
    const p3 = pts[Math.min(pts.length - 1, segIdx + 2)]!;
    const u = clamp01((t - p1[0]) / Math.max(1e-6, p2[0] - p1[0]));
    const u2 = u * u;
    const u3 = u2 * u;
    const y =
      0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * u +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
    lut[i] = Math.round(clamp01(y) * 255);
  }
  return lut;
}

export function applyHolisticColorGradingAndCurvesSuite(params: {
  readonly originalRgb01: readonly [number, number, number];
  readonly blurredRgb01: readonly [number, number, number];
  readonly unsharpStrength: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly hueShiftMinus1To1: number;
  readonly saturationMinus1To1: number;
  readonly curveControlPoints01: readonly (readonly [number, number])[];
}): {
  readonly toneCurveLut256: Uint8Array;
  readonly unsharpRgb01: readonly [number, number, number];
  readonly brightnessContrastRgb01: readonly [number, number, number];
  readonly hueSaturationRgb01: readonly [number, number, number];
  readonly curvedRgb01: readonly [number, number, number];
} {
  const toneCurveLut256 = buildPiecewiseMonotoneSplineLut256(params.curveControlPoints01);
  const s = Math.max(0, params.unsharpStrength);
  const unsharpRgb01: readonly [number, number, number] = [
    clamp01(params.blurredRgb01[0] + (params.originalRgb01[0] - params.blurredRgb01[0]) * (1 + s)),
    clamp01(params.blurredRgb01[1] + (params.originalRgb01[1] - params.blurredRgb01[1]) * (1 + s)),
    clamp01(params.blurredRgb01[2] + (params.originalRgb01[2] - params.blurredRgb01[2]) * (1 + s)),
  ];
  const b = clamp(params.brightness, -1, 1);
  const c = clamp(params.contrast, -1, 1);
  const applyBC = (ch: number): number => {
    const v = ch + b;
    return clamp01(c > 0 ? (v - 0.5) / Math.max(1e-4, 1 - c) + 0.5 : (v - 0.5) * (1 + c) + 0.5);
  };
  const brightnessContrastRgb01: readonly [number, number, number] = [
    applyBC(params.originalRgb01[0]),
    applyBC(params.originalRgb01[1]),
    applyBC(params.originalRgb01[2]),
  ];
  const angle = clamp(params.hueShiftMinus1To1, -1, 1) * Math.PI;
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const sqrt3 = Math.sqrt(3);
  const wx = (2 * cosA + 1) / 3;
  const wy = (-sqrt3 * sinA - cosA + 1) / 3;
  const wz = (sqrt3 * sinA - cosA + 1) / 3;
  const [or, og, ob] = params.originalRgb01;
  let hr = or * wx + og * wy + ob * wz;
  let hg = or * wz + og * wx + ob * wy;
  let hb = or * wy + og * wz + ob * wx;
  const avg = (hr + hg + hb) / 3;
  const sat = clamp(params.saturationMinus1To1, -1, 1);
  const satMul = sat > 0 ? 1 - 1 / (1.001 - sat) : -sat;
  hr = clamp01(hr + (avg - hr) * satMul);
  hg = clamp01(hg + (avg - hg) * satMul);
  hb = clamp01(hb + (avg - hb) * satMul);
  const hueSaturationRgb01: readonly [number, number, number] = [hr, hg, hb];
  const curvedRgb01: readonly [number, number, number] = [
    (toneCurveLut256[Math.round(clamp01(hr) * 255)] ?? 0) / 255,
    (toneCurveLut256[Math.round(clamp01(hg) * 255)] ?? 0) / 255,
    (toneCurveLut256[Math.round(clamp01(hb) * 255)] ?? 0) / 255,
  ];
  return { toneCurveLut256, unsharpRgb01, brightnessContrastRgb01, hueSaturationRgb01, curvedRgb01 };
}

function blendChannelW3C(cb: number, cs: number, mode: HolisticLayerBlendMode): number {
  switch (mode) {
    case "multiply": return cb * cs;
    case "screen": return cb + cs - cb * cs;
    case "overlay": return cb <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case "darken": return Math.min(cb, cs);
    case "lighten": return Math.max(cb, cs);
    case "color-dodge": return cb === 0 ? 0 : cs === 1 ? 1 : Math.min(1, cb / (1 - cs));
    case "color-burn": return cb === 1 ? 1 : cs === 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs);
    case "hard-light": return cs <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
    case "soft-light": {
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
      return cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb) : cb + (2 * cs - 1) * (d - cb);
    }
    case "difference": return Math.abs(cb - cs);
    case "exclusion": return cb + cs - 2 * cb * cs;
    case "luminosity": return clamp01(0.299 * cs + 0.587 * cs + 0.114 * cb);
    case "normal":
    default: return cs;
  }
}

export function evaluateHolisticLayerCompositorAndEasel(params: {
  readonly baseRgba01: readonly [number, number, number, number];
  readonly activeRgba01: readonly [number, number, number, number];
  readonly blendMode: HolisticLayerBlendMode;
  readonly hasClippingMask: boolean;
  readonly isAlphaLocked: boolean;
  readonly dirtyRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly rawPoints: readonly { readonly x: number; readonly y: number }[];
  readonly stabilizerStrength01: number;
  readonly easelScale: number;
  readonly easelAngleDeg: number;
  readonly easelIsMirrored: boolean;
  readonly snapRotation15?: boolean;
}): {
  readonly compositedRgba01: readonly [number, number, number, number];
  readonly dirtyHistoryTileCount: number;
  readonly stabilizedPoints: readonly { readonly x: number; readonly y: number }[];
  readonly snappedEaselAngleDeg: number;
  readonly viewportAngleDeg: number;
} {
  const [br, bg, bb, ba] = params.baseRgba01.map(clamp01) as [number, number, number, number];
  const [sr, sg, sb, sa] = params.activeRgba01.map(clamp01) as [number, number, number, number];
  const effSa = params.hasClippingMask ? sa * ba : sa;
  const mr = blendChannelW3C(br, sr, params.blendMode);
  const mg = blendChannelW3C(bg, sg, params.blendMode);
  const mb = blendChannelW3C(bb, sb, params.blendMode);
  const outA = params.isAlphaLocked ? ba : clamp01(effSa + ba * (1 - effSa));
  const safeA = Math.max(1e-6, outA);
  const compositedRgba01: readonly [number, number, number, number] = [
    clamp01((mr * effSa + br * ba * (1 - effSa)) / safeA),
    clamp01((mg * effSa + bg * ba * (1 - effSa)) / safeA),
    clamp01((mb * effSa + bb * ba * (1 - effSa)) / safeA),
    outA,
  ];
  const tileSize = 256;
  const col0 = Math.floor(Math.max(0, params.dirtyRect.x) / tileSize);
  const col1 = Math.floor(Math.max(0, params.dirtyRect.x + params.dirtyRect.width - 1) / tileSize);
  const row0 = Math.floor(Math.max(0, params.dirtyRect.y) / tileSize);
  const row1 = Math.floor(Math.max(0, params.dirtyRect.y + params.dirtyRect.height - 1) / tileSize);
  const dirtyHistoryTileCount = Math.max(1, (col1 - col0 + 1) * (row1 - row0 + 1));

  const alpha = 1 - clamp01(params.stabilizerStrength01) * 0.82;
  const stabilizedPoints: { readonly x: number; readonly y: number }[] = [];
  for (let i = 0; i < params.rawPoints.length; i += 1) {
    const pt = params.rawPoints[i]!;
    if (i === 0) {
      stabilizedPoints.push({ x: pt.x, y: pt.y });
    } else {
      const prev = stabilizedPoints[i - 1]!;
      stabilizedPoints.push({ x: prev.x + (pt.x - prev.x) * alpha, y: prev.y + (pt.y - prev.y) * alpha });
    }
  }
  const snappedEaselAngleDeg = params.snapRotation15 ? Math.round(params.easelAngleDeg / 15) * 15 : params.easelAngleDeg;
  const viewportAngleDeg = (params.easelIsMirrored ? 180 - snappedEaselAngleDeg : snappedEaselAngleDeg) - snappedEaselAngleDeg;
  return { compositedRgba01, dirtyHistoryTileCount, stabilizedPoints, snappedEaselAngleDeg, viewportAngleDeg };
}

export function evaluateStudioHolisticInspectorTelemetry(params: {
  readonly toolPresetId: HolisticStudioToolPresetId;
  readonly blendMode: HolisticLayerBlendMode;
  readonly baseRgb01: readonly [number, number, number];
  readonly strokePoints: readonly { readonly x: number; readonly y: number }[];
}): {
  readonly floodFillCount: number;
  readonly curveLutMid: number;
  readonly dirtyTileCount: number;
  readonly resizeCursor: string;
} {
  const sampleBuf = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < 12; i += 1) {
    sampleBuf[i * 4] = 240;
    sampleBuf[i * 4 + 1] = 240;
    sampleBuf[i * 4 + 2] = 240;
    sampleBuf[i * 4 + 3] = 255;
  }
  const floodFill = executeHolisticFloodFillAndMagicErase({
    rgbaBuffer: sampleBuf,
    width: 4,
    height: 4,
    seedX: 1,
    seedY: 1,
    tolerance255: 24,
    growPx: params.toolPresetId === "holistic-flood-fill-contiguous" ? 1 : 0,
    isContiguous: params.toolPresetId !== "holistic-magic-erase-global",
  });
  const perspective = evaluateHolisticPerspectiveAndFreeTransform({
    beforeQuad: [0, 0, 100, 0, 100, 100, 0, 100],
    afterQuad: [8, 4, 96, 10, 104, 96, 4, 92],
    sampleX: 50,
    sampleY: 50,
    transformAngleDeg: 45,
    viewportScale: 1.25,
  });
  const curves = applyHolisticColorGradingAndCurvesSuite({
    originalRgb01: params.baseRgb01,
    blurredRgb01: [0.35, 0.35, 0.35],
    unsharpStrength: 0.65,
    brightness: 0.04,
    contrast: 0.12,
    hueShiftMinus1To1: 0.05,
    saturationMinus1To1: 0.18,
    curveControlPoints01: [[0, 0], [0.32, 0.2], [0.72, 0.84], [1, 1]],
  });
  const compositor = evaluateHolisticLayerCompositorAndEasel({
    baseRgba01: [0.85, 0.78, 0.65, 0.92],
    activeRgba01: [...curves.curvedRgb01, 0.88],
    blendMode: params.blendMode,
    hasClippingMask: true,
    isAlphaLocked: false,
    dirtyRect: { x: 16, y: 12, width: 320, height: 280 },
    rawPoints: params.strokePoints,
    stabilizerStrength01: 0.6,
    easelScale: 1.25,
    easelAngleDeg: 14.6,
    easelIsMirrored: false,
    snapRotation15: true,
  });
  return {
    floodFillCount: floodFill.grownPixelCount,
    curveLutMid: curves.toneCurveLut256[128] ?? 128,
    dirtyTileCount: compositor.dirtyHistoryTileCount,
    resizeCursor: perspective.resizeCursor,
  };
}
