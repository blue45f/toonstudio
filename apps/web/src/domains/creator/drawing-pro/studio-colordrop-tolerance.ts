/**
 * Procreate 식 클린룸 ColorDrop 컨트롤러 (드래그 거리 0..1 → CIE ΔE / RGB 허용치 실시간 매핑).
 *
 * - sRGB → CIE L*a*b* (D65) 변환과 CIEDE2000(ΔE00) · CIE76(ΔE76) · 유클리드 RGB 색차를
 *   순수 수학으로 계산한다.
 * - 드래그 거리(0..1)를 감마 반응 곡선으로 단조 매핑해 저구간 미세 조절과 고구간 광역 채색을
 *   동시에 지원하며, 실시간 플러드 필 프리뷰 마스크와 sticky 확정/취소 복원을 제공한다.
 */

export interface CieLabColor {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export type ColorDropDistanceMetric = "deltaE2000" | "deltaE76" | "rgb";

export interface ColorDropToleranceMappingOptions {
  /** 드래그 0..1 비선형 반응 지수(γ > 0). 기본값 1.6 (저구간 정밀 제어). */
  readonly responseGamma?: number;
  readonly minDeltaE?: number;
  readonly maxDeltaE?: number;
  readonly minRgbTolerance?: number;
  readonly maxRgbTolerance?: number;
}

export interface ColorDropToleranceSnapshot {
  readonly dragDistance01: number;
  readonly thresholdPercent: number;
  readonly deltaETolerance: number;
  readonly rgbTolerance: number;
  readonly rgbEuclideanTolerance: number;
}

export type CleanroomColorDropPhase =
  | "idle"
  | "holding"
  | "scrubbing"
  | "committed"
  | "cancelled";

export interface CleanroomColorDropState extends ColorDropToleranceSnapshot {
  readonly phase: CleanroomColorDropPhase;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly stickyDragDistance01: number;
  readonly metric: ColorDropDistanceMetric;
}

export interface CleanroomColorDropControllerOptions extends ColorDropToleranceMappingOptions {
  readonly initialDragDistance01?: number;
  readonly holdDelayMs?: number;
  readonly fullRangeDragPx?: number;
  readonly metric?: ColorDropDistanceMetric;
}

const SQRT3 = Math.sqrt(3);

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function srgbByteToLinear(channel: number): number {
  const s = clamp(channel, 0, 255) / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** sRGB(0..255)를 CIE L*a*b* (D65 표준 광원)로 변환한다. */
export function srgbToCieLab(r: number, g: number, b: number): CieLabColor {
  const rl = srgbByteToLinear(r);
  const gl = srgbByteToLinear(g);
  const bl = srgbByteToLinear(b);

  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;

  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIE76 색차 ΔE76을 계산한다. */
export function computeDeltaE76(labA: CieLabColor, labB: CieLabColor): number {
  return Math.hypot(labA.L - labB.L, labA.a - labB.a, labA.b - labB.b);
}

/** 지각 균등 표준 CIEDE2000 색차 ΔE00을 계산한다. */
export function computeDeltaE2000(labA: CieLabColor, labB: CieLabColor): number {
  const deg = (rad: number): number => (rad * 180) / Math.PI;
  const rad = (d: number): number => (d * Math.PI) / 180;

  const c1 = Math.hypot(labA.a, labA.b);
  const c2 = Math.hypot(labB.a, labB.b);
  const cBar7 = Math.pow((c1 + c2) * 0.5, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 6103515625)));

  const a1p = (1 + g) * labA.a;
  const a2p = (1 + g) * labB.a;
  const c1p = Math.hypot(a1p, labA.b);
  const c2p = Math.hypot(a2p, labB.b);

  const huePrime = (b: number, ap: number): number => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const h1p = huePrime(labA.b, a1p);
  const h2p = huePrime(labB.b, a2p);

  const dLp = labB.L - labA.L;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp * 0.5));

  const lBarP = (labA.L + labB.L) * 0.5;
  const cBarP = (c1p + c2p) * 0.5;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) * 0.5;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) * 0.5;
    else hBarP = (h1p + h2p - 360) * 0.5;
  }

  const t =
    1
    - 0.17 * Math.cos(rad(hBarP - 30))
    + 0.24 * Math.cos(rad(2 * hBarP))
    + 0.32 * Math.cos(rad(3 * hBarP + 6))
    - 0.2 * Math.cos(rad(4 * hBarP - 63));
  const dTheta = 30 * Math.exp(-Math.pow((hBarP - 275) / 25, 2));
  const cBarP7 = Math.pow(cBarP, 7);
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + 6103515625));
  const l50Sq = Math.pow(lBarP - 50, 2);
  const sL = 1 + (0.015 * l50Sq) / Math.sqrt(20 + l50Sq);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(rad(2 * dTheta)) * rC;

  const termL = dLp / sL;
  const termC = dCp / sC;
  const termH = dHp / sH;
  return Math.sqrt(termL * termL + termC * termC + termH * termH + rT * termC * termH);
}

/** 두 RGB(0..255) 색상의 유클리드 거리를 계산한다(범위 0..441.67). */
export function computeRgbEuclideanDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 정규화 드래그 거리(0..1)를 CIE ΔE 및 RGB 허용치로 단조 매핑한다. */
export function mapDragDistanceToColorTolerance(
  dragDistance01: number,
  options: ColorDropToleranceMappingOptions = {},
): ColorDropToleranceSnapshot {
  const d = clamp01(dragDistance01);
  const gamma = clamp(options.responseGamma ?? 1.6, 0.25, 4);
  const minDeltaE = clamp(options.minDeltaE ?? 0, 0, 100);
  const maxDeltaE = clamp(options.maxDeltaE ?? 100, minDeltaE, 200);
  const minRgb = clamp(options.minRgbTolerance ?? 0, 0, 255);
  const maxRgb = clamp(options.maxRgbTolerance ?? 255, minRgb, 255);

  const curve = Math.pow(d, gamma);
  const deltaETolerance = minDeltaE + (maxDeltaE - minDeltaE) * curve;
  const rgbTolerance = minRgb + (maxRgb - minRgb) * curve;

  return {
    dragDistance01: d,
    thresholdPercent: d * 100,
    deltaETolerance,
    rgbTolerance,
    rgbEuclideanTolerance: rgbTolerance * SQRT3,
  };
}

/** 목표 ΔE 허용치에 대응하는 역매핑 드래그 거리(0..1)를 구한다. */
export function deltaEToleranceToDragDistance01(
  deltaE: number,
  options: ColorDropToleranceMappingOptions = {},
): number {
  const gamma = clamp(options.responseGamma ?? 1.6, 0.25, 4);
  const minDeltaE = clamp(options.minDeltaE ?? 0, 0, 100);
  const maxDeltaE = clamp(options.maxDeltaE ?? 100, minDeltaE, 200);
  if (maxDeltaE <= minDeltaE) return 0;
  const norm = clamp01((deltaE - minDeltaE) / (maxDeltaE - minDeltaE));
  return clamp01(Math.pow(norm, 1 / gamma));
}

/** 후보 픽셀이 시드 색상과 ColorDrop 허용치 이내로 일치하는지 판정한다. */
export function doesPixelMatchColorDrop(
  seedRgba: readonly [number, number, number, number],
  candidateRgba: readonly [number, number, number, number],
  tolerance: ColorDropToleranceSnapshot,
  metric: ColorDropDistanceMetric = "deltaE2000",
): boolean {
  if (Math.abs(candidateRgba[3] - seedRgba[3]) > tolerance.rgbTolerance + 1e-6) return false;
  if (metric === "rgb") {
    return (
      computeRgbEuclideanDistance(
        [seedRgba[0], seedRgba[1], seedRgba[2]],
        [candidateRgba[0], candidateRgba[1], candidateRgba[2]],
      )
      <= tolerance.rgbEuclideanTolerance + 1e-6
    );
  }
  const labSeed = srgbToCieLab(seedRgba[0], seedRgba[1], seedRgba[2]);
  const labCand = srgbToCieLab(candidateRgba[0], candidateRgba[1], candidateRgba[2]);
  const deltaE =
    metric === "deltaE76" ? computeDeltaE76(labSeed, labCand) : computeDeltaE2000(labSeed, labCand);
  return deltaE <= tolerance.deltaETolerance + 1e-6;
}

/** 현재 ColorDrop 허용치로 4-연결 프리뷰 플러드 필 마스크(0/255)를 생성한다. */
export function computeColorDropPreviewMask(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance: ColorDropToleranceSnapshot,
  metric: ColorDropDistanceMetric = "deltaE2000",
): { readonly mask: Uint8Array; readonly filledPixelCount: number } {
  const total = Math.max(0, width * height);
  const mask = new Uint8Array(total);
  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (width <= 0 || height <= 0 || sx < 0 || sx >= width || sy < 0 || sy >= height) {
    return { mask, filledPixelCount: 0 };
  }

  const seedIdx = sy * width + sx;
  const seedOff = seedIdx * 4;
  const seedRgba: readonly [number, number, number, number] = [
    rgba[seedOff] ?? 0,
    rgba[seedOff + 1] ?? 0,
    rgba[seedOff + 2] ?? 0,
    rgba[seedOff + 3] ?? 0,
  ];
  const seedLab =
    metric === "rgb" ? null : srgbToCieLab(seedRgba[0], seedRgba[1], seedRgba[2]);

  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  mask[seedIdx] = 255;
  queue[tail] = seedIdx;
  tail += 1;
  let filledPixelCount = 1;

  const dirs: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (head < tail) {
    const cur = queue[head]!;
    head += 1;
    const cx = cur % width;
    const cy = Math.floor(cur / width);

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (mask[nIdx] === 255) continue;
      const off = nIdx * 4;
      const r = rgba[off] ?? 0;
      const g = rgba[off + 1] ?? 0;
      const b = rgba[off + 2] ?? 0;
      const a = rgba[off + 3] ?? 0;
      if (Math.abs(a - seedRgba[3]) > tolerance.rgbTolerance + 1e-6) continue;

      const ok =
        metric === "rgb"
          ? Math.hypot(r - seedRgba[0], g - seedRgba[1], b - seedRgba[2])
            <= tolerance.rgbEuclideanTolerance + 1e-6
          : (metric === "deltaE76"
              ? computeDeltaE76(seedLab!, srgbToCieLab(r, g, b))
              : computeDeltaE2000(seedLab!, srgbToCieLab(r, g, b)))
            <= tolerance.deltaETolerance + 1e-6;

      if (ok) {
        mask[nIdx] = 255;
        queue[tail] = nIdx;
        tail += 1;
        filledPixelCount += 1;
      }
    }
  }

  return { mask, filledPixelCount };
}

/** Procreate 스타일 ColorDrop 실시간 드래그 허용치 컨트롤러. */
export class CleanroomColorDropController {
  private readonly mappingOptions: ColorDropToleranceMappingOptions;
  private readonly holdDelayMs: number;
  private readonly fullRangeDragPx: number;
  private readonly metric: ColorDropDistanceMetric;
  private phase: CleanroomColorDropPhase = "idle";
  private stickyDragDistance01: number;
  private currentDragDistance01: number;
  private scrubBaseDragDistance01: number;
  private startedAtMs = 0;
  private anchorX = 0;
  private anchorY = 0;
  private scrubStartX = 0;

  constructor(options: CleanroomColorDropControllerOptions = {}) {
    this.mappingOptions = {
      responseGamma: options.responseGamma,
      minDeltaE: options.minDeltaE,
      maxDeltaE: options.maxDeltaE,
      minRgbTolerance: options.minRgbTolerance,
      maxRgbTolerance: options.maxRgbTolerance,
    };
    this.holdDelayMs = Math.max(0, options.holdDelayMs ?? 400);
    this.fullRangeDragPx = Math.max(20, options.fullRangeDragPx ?? 240);
    this.metric = options.metric ?? "deltaE2000";
    const initD = clamp01(options.initialDragDistance01 ?? 0.35);
    this.stickyDragDistance01 = initD;
    this.currentDragDistance01 = initD;
    this.scrubBaseDragDistance01 = initD;
  }

  setDragDistance01(distance01: number): CleanroomColorDropState {
    this.currentDragDistance01 = clamp01(distance01);
    if (this.phase === "idle" || this.phase === "holding") this.phase = "scrubbing";
    return this.getSnapshot();
  }

  begin(x: number, y: number, nowMs = 0): CleanroomColorDropState {
    this.phase = this.holdDelayMs === 0 ? "scrubbing" : "holding";
    this.startedAtMs = nowMs;
    this.anchorX = x;
    this.anchorY = y;
    this.scrubStartX = x;
    this.currentDragDistance01 = this.stickyDragDistance01;
    this.scrubBaseDragDistance01 = this.stickyDragDistance01;
    return this.getSnapshot();
  }

  move(x: number, _y: number, nowMs = 0): CleanroomColorDropState {
    if (this.phase === "holding" && nowMs - this.startedAtMs >= this.holdDelayMs) {
      this.phase = "scrubbing";
      this.scrubStartX = x;
      this.scrubBaseDragDistance01 = this.currentDragDistance01;
    }
    if (this.phase === "scrubbing" && Number.isFinite(x)) {
      const delta01 = (x - this.scrubStartX) / this.fullRangeDragPx;
      this.currentDragDistance01 = clamp01(this.scrubBaseDragDistance01 + delta01);
    }
    return this.getSnapshot();
  }

  commit(): CleanroomColorDropState {
    this.stickyDragDistance01 = this.currentDragDistance01;
    this.phase = "committed";
    const snap = this.getSnapshot();
    this.phase = "idle";
    return snap;
  }

  cancel(): CleanroomColorDropState {
    this.currentDragDistance01 = this.stickyDragDistance01;
    this.phase = "cancelled";
    const snap = this.getSnapshot();
    this.phase = "idle";
    return snap;
  }

  getSnapshot(): CleanroomColorDropState {
    const mapped = mapDragDistanceToColorTolerance(
      this.currentDragDistance01,
      this.mappingOptions,
    );
    return Object.freeze({
      ...mapped,
      phase: this.phase,
      anchorX: this.anchorX,
      anchorY: this.anchorY,
      stickyDragDistance01: this.stickyDragDistance01,
      metric: this.metric,
    });
  }
}
