/**
 * 라이브·커밋 캔버스 공용 2.5D 실물 질감 물리 셰이딩 런타임.
 *
 * - 유화/아크릴(`impasto-oil`): 알파+붓결 높이장 3×3 소벨 법선과 35° 측면 광원(Raking Light)으로
 *   물감 이랑 하이라이트·자가 그림자·새틴 스펙큘러 입체감을 실시간 합성한다.
 * - 수채화/수묵(`watercolor-granulation`): 알파 경계 기울기 기반 가장자리 안료 응집(Coffee-Ring Backrun)과
 *   종이 골짜기 침착(Valley Granulation)을 합성한다.
 * - 연필/목탄/파스텔(`dry-contact-tooth`): 비주기 이중 회전 종이 높이장 기반 봉우리 접촉(Peak-Catch)
 *   마찰 대비와 흑연 미세 광택을 합성한다.
 * - 붓/캘리그래피(`wet-bristle-ink`): 붓모 결 농담과 젖은 안료 깊이감을 보강한다.
 * - 기존 바이트 동결 단위 테스트를 보호하기 위해 기본값은 `"off"`로 두고, 대화형 `/studio` 셸과
 *   명시적 `mode` 옵션에서만 활성화한다.
 */

import { resolveStudioBrushRenderFamily } from "../studio-brush";
import { resolveStudioDocumentPaperSurface } from "./studio-paper-granulation-runtime";

export type StudioTactileReliefMode = "off" | "sculpted" | "vivid";

export type StudioTactileReliefProfile =
  | "none"
  | "impasto-oil"
  | "watercolor-granulation"
  | "dry-contact-tooth"
  | "wet-bristle-ink";

export interface StudioTactileReliefRgbaOptions {
  readonly width: number;
  readonly height: number;
  readonly profile: StudioTactileReliefProfile;
  readonly mode: Exclude<StudioTactileReliefMode, "off">;
  readonly worldOriginX?: number;
  readonly worldOriginY?: number;
  readonly worldScale?: number;
  readonly paperSeed?: number;
  readonly innerX?: number;
  readonly innerY?: number;
  readonly innerWidth?: number;
  readonly innerHeight?: number;
}

// 35도 좌상단 측면 광원(Raking Light) 단위 벡터 및 블린-퐁 반각 벡터
const LIGHT_X = -0.6;
const LIGHT_Y = -0.56;
const LIGHT_Z = 0.571314274;
const HALF_LEN = Math.hypot(LIGHT_X, LIGHT_Y, LIGHT_Z + 1);
const HALF_X = LIGHT_X / HALF_LEN;
const HALF_Y = LIGHT_Y / HALF_LEN;
const HALF_Z = (LIGHT_Z + 1) / HALF_LEN;

// 비주기 이중 회전 종이 격자(contact-tooth-v2와 동일한 황금비·무리 회전각)
const DETILE_RATIO = 0.618033988749895;
const COS_A = Math.cos(0.2617993877991494);
const SIN_A = Math.sin(0.2617993877991494);
const COS_B = Math.cos(0.6457725);
const SIN_B = Math.sin(0.6457725);

let currentTactileReliefMode: StudioTactileReliefMode = "off";
let hydratedInteractiveDefault = false;
const reliefListeners = new Set<(mode: StudioTactileReliefMode) => void>();

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clampByte(value: number): number {
  const rounded = Math.round(value);
  return rounded <= 0 ? 0 : rounded >= 255 ? 255 : rounded;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function isValidMode(value: unknown): value is StudioTactileReliefMode {
  return value === "off" || value === "sculpted" || value === "vivid";
}

function emitTactileReliefMode(): void {
  for (const listener of reliefListeners) {
    listener(currentTactileReliefMode);
  }
}

/** 현재 전역 실물 질감 셰이딩 모드를 반환한다. */
export function getStudioTactileReliefMode(): StudioTactileReliefMode {
  return currentTactileReliefMode;
}

/** 전역 실물 질감 셰이딩 모드를 변경한다. */
export function setStudioTactileReliefMode(
  mode: StudioTactileReliefMode,
): StudioTactileReliefMode {
  if (!isValidMode(mode)) return currentTactileReliefMode;
  hydratedInteractiveDefault = true;
  if (currentTactileReliefMode !== mode) {
    currentTactileReliefMode = mode;
    emitTactileReliefMode();
  }
  return currentTactileReliefMode;
}

/**
 * 대화형 `/studio` UI가 마운트될 때 1회 호출해 기본 `"sculpted"` 모드를 켠다.
 * 헤드리스/단위 테스트가 별도로 호출하지 않으면 기존 바이트 동결 렌더러 계약이 그대로 유지된다.
 */
export function hydrateInteractiveStudioTactileReliefMode(): StudioTactileReliefMode {
  if (hydratedInteractiveDefault) return currentTactileReliefMode;
  hydratedInteractiveDefault = true;
  if (currentTactileReliefMode !== "sculpted") {
    currentTactileReliefMode = "sculpted";
    emitTactileReliefMode();
  }
  return currentTactileReliefMode;
}

/** 실물 질감 모드를 `입체(sculpted) → 강조(vivid) → 끄기(off)` 순으로 순환한다. */
export function cycleStudioTactileReliefMode(): StudioTactileReliefMode {
  const next: StudioTactileReliefMode =
    currentTactileReliefMode === "sculpted"
      ? "vivid"
      : currentTactileReliefMode === "vivid"
        ? "off"
        : "sculpted";
  return setStudioTactileReliefMode(next);
}

export function subscribeStudioTactileReliefMode(
  listener: (mode: StudioTactileReliefMode) => void,
): () => void {
  reliefListeners.add(listener);
  return () => {
    reliefListeners.delete(listener);
  };
}

/** 테스트 격리용 상태 초기화. */
export function resetStudioTactileReliefRuntimeForTests(): void {
  currentTactileReliefMode = "off";
  hydratedInteractiveDefault = false;
  reliefListeners.clear();
}

/** 브러시 ID 또는 렌더 패밀리를 2.5D 실물 질감 프로파일로 매핑한다. */
export function resolveStudioTactileReliefProfileForBrush(
  brushIdOrFamily: unknown,
): StudioTactileReliefProfile {
  if (typeof brushIdOrFamily === "string") {
    const lower = brushIdOrFamily.trim().toLowerCase();
    if (
      lower.includes("watercolor") ||
      lower.includes("ink-wash") ||
      lower.includes("inkwash") ||
      lower.includes("wash")
    ) {
      return "watercolor-granulation";
    }
    if (lower.includes("oil") || lower.includes("acrylic") || lower.includes("impasto") || lower.includes("gouache")) {
      return "impasto-oil";
    }
    if (
      lower.includes("pencil") ||
      lower.includes("charcoal") ||
      lower.includes("pastel") ||
      lower.includes("chalk") ||
      lower.includes("crayon") ||
      lower.includes("dry-media")
    ) {
      return "dry-contact-tooth";
    }
  }
  const family = resolveStudioBrushRenderFamily(brushIdOrFamily);
  if (family === "oil") return "impasto-oil";
  if (family === "watercolor") return "watercolor-granulation";
  if (family === "pencil" || family === "dry-media" || family === "pastel") {
    return "dry-contact-tooth";
  }
  if (family === "brush" || family === "calligraphy") {
    return "wet-bristle-ink";
  }
  return "none";
}

/**
 * 결정론적 2D 가치 노이즈 + 비주기 이중 회전 종이 요철 높이장(`0..1`).
 * 모든 타일과 라이브 오버레이가 동일한 문서 좌표 `(wx, wy)`에서 같은 종이 결을 샘플링한다.
 */
function hashGrid2D(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hashGrid2D(ix, iy, seed);
  const b = hashGrid2D(ix + 1, iy, seed);
  const c = hashGrid2D(ix, iy + 1, seed);
  const d = hashGrid2D(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function sampleDeterministicPaperToothHeight(
  wx: number,
  wy: number,
  seed: number,
): number {
  const ax = (wx * COS_A - wy * SIN_A) * 0.24;
  const ay = (wx * SIN_A + wy * COS_A) * 0.24;
  const bx = (wx * COS_B - wy * SIN_B) * (0.24 / DETILE_RATIO);
  const by = (wx * SIN_B + wy * COS_B) * (0.24 / DETILE_RATIO);
  const coarse = valueNoise2D(ax, ay, seed);
  const fine = valueNoise2D(bx + 19.3, by - 7.1, seed ^ 0x51a7);
  const micro = valueNoise2D(wx * 0.78 - 3.7, wy * 0.78 + 11.2, seed ^ 0x9e37);
  return clamp01(coarse * 0.54 + fine * 0.31 + micro * 0.15);
}

/**
 * RGBA 픽셀 버퍼에 매체별 2.5D 실물 질감(임파스토 측면 광원·수채화 백런/침착·연필 봉우리 접촉)을 적용한다.
 * 인플레이스로 `rgba`를 갱신하며, 유효 픽셀 수를 반환한다.
 */
export function applyStudioTactilePhysicalReliefToRgba(
  rgba: Uint8ClampedArray,
  options: StudioTactileReliefRgbaOptions,
): number {
  const { width, height, profile, mode } = options;
  if (profile === "none" || width < 3 || height < 3 || rgba.length < width * height * 4) {
    return 0;
  }

  const strength = mode === "vivid" ? 1.45 : 1.0;
  const invScale = options.worldScale && options.worldScale > 1e-4 ? 1 / options.worldScale : 1;
  const originX = options.worldOriginX ?? 0;
  const originY = options.worldOriginY ?? 0;
  const seed = options.paperSeed ?? 42;

  const total = width * height;
  const alphaField = new Float32Array(total);
  const heightField = new Float32Array(total);
  const toothField = new Float32Array(total);
  let touchedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const wy = originY + y * invScale;
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      const a = rgba[idx * 4 + 3] ?? 0;
      if (a <= 0) continue;
      touchedPixels += 1;
      const aNorm = a / 255;
      alphaField[idx] = aNorm;
      const wx = originX + x * invScale;
      const tooth = sampleDeterministicPaperToothHeight(wx, wy, seed);
      toothField[idx] = tooth;

      if (profile === "impasto-oil") {
        // 붓모 결 고조파 + 물감 두께 + 종이 미세 요철을 결합한 물리 높이장
        const bristleGroove = 0.5 + 0.5 * Math.sin((wx * 0.92 + wy * 0.38) * 1.45 + tooth * 2.4);
        heightField[idx] = aNorm * 0.74 + bristleGroove * aNorm * 0.16 + tooth * aNorm * 0.14;
      } else if (profile === "wet-bristle-ink") {
        const bristleGroove = 0.5 + 0.5 * Math.sin((wx * 0.85 - wy * 0.52) * 1.7 + tooth * 1.8);
        heightField[idx] = aNorm * 0.82 + bristleGroove * aNorm * 0.12 + tooth * aNorm * 0.06;
      } else {
        heightField[idx] = tooth * 0.68 + aNorm * 0.32;
      }
    }
  }

  if (touchedPixels === 0) return 0;

  const x0 = Math.max(0, options.innerX ?? 0);
  const y0 = Math.max(0, options.innerY ?? 0);
  const x1 = Math.min(width, x0 + (options.innerWidth ?? width));
  const y1 = Math.min(height, y0 + (options.innerHeight ?? height));
  const lastX = width - 1;
  const lastY = height - 1;

  for (let y = y0; y < y1; y += 1) {
    const ym1 = y > 0 ? y - 1 : 0;
    const yp1 = y < lastY ? y + 1 : lastY;
    const row = y * width;
    const rowM1 = ym1 * width;
    const rowP1 = yp1 * width;

    for (let x = x0; x < x1; x += 1) {
      const idx = row + x;
      const aNorm = alphaField[idx] ?? 0;
      if (aNorm <= 0.015) continue;

      const xm1 = x > 0 ? x - 1 : 0;
      const xp1 = x < lastX ? x + 1 : lastX;

      const p = idx * 4;
      let r = rgba[p] ?? 0;
      let g = rgba[p + 1] ?? 0;
      let b = rgba[p + 2] ?? 0;
      let a = rgba[p + 3] ?? 0;
      const tooth = toothField[idx] ?? 0.5;

      if (profile === "impasto-oil" || profile === "wet-bristle-ink") {
        const tl = heightField[rowM1 + xm1] ?? 0;
        const tc = heightField[rowM1 + x] ?? 0;
        const tr = heightField[rowM1 + xp1] ?? 0;
        const ml = heightField[row + xm1] ?? 0;
        const mr = heightField[row + xp1] ?? 0;
        const bl = heightField[rowP1 + xm1] ?? 0;
        const bc = heightField[rowP1 + x] ?? 0;
        const br = heightField[rowP1 + xp1] ?? 0;

        const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
        const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
        const reliefGain = (profile === "impasto-oil" ? 2.35 : 1.15) * strength;
        const nx = -gx * reliefGain;
        const ny = -gy * reliefGain;
        const nLen = Math.hypot(nx, ny, 1);
        const unx = nx / nLen;
        const uny = ny / nLen;
        const unz = 1 / nLen;

        const ndotl = clamp01(unx * LIGHT_X + uny * LIGHT_Y + unz * LIGHT_Z);
        const deltaLight = ndotl - LIGHT_Z;
        const diffuseMul = 1 + deltaLight * (profile === "impasto-oil" ? 0.66 : 0.32) * strength;

        const ndoth = clamp01(unx * HALF_X + uny * HALF_Y + unz * HALF_Z);
        const specPow = Math.pow(ndoth, profile === "impasto-oil" ? 18 : 26);
        const specWeight =
          specPow *
          (profile === "impasto-oil" ? 0.38 : 0.16) *
          strength *
          smoothstep(0.18, 0.82, aNorm);

        // 측면 광원 그림자 이랑에서는 미세하게 채도를 깊게 눌러 안료 입체감 강화
        const shadowCool = deltaLight < 0 ? Math.abs(deltaLight) * 0.08 * strength : 0;
        r = r * (diffuseMul - shadowCool * 0.5) + 255 * specWeight;
        g = g * (diffuseMul - shadowCool * 0.25) + 252 * specWeight;
        b = b * (diffuseMul + shadowCool * 0.35) + 246 * specWeight;
      } else if (profile === "watercolor-granulation") {
        // 알파 경계 기울기(|∇α|)로 수채화 물고임 가장자리(Coffee-Ring Backrun) 검출
        const aL = alphaField[row + xm1] ?? 0;
        const aR = alphaField[row + xp1] ?? 0;
        const aT = alphaField[rowM1 + x] ?? 0;
        const aB = alphaField[rowP1 + x] ?? 0;
        const edgeGrad = Math.hypot(aR - aL, aB - aT);
        const backrunEdge = clamp01(edgeGrad * 2.1) * smoothstep(0.06, 0.72, aNorm);

        // 종이 골짜기(tooth < 0.5)에 안료 침착, 봉우리(tooth > 0.5)는 투명 투과
        const valleyBias = (0.5 - tooth) * 2; // -1(봉우리) .. +1(골짜기)
        const pigmentMul = 1 - backrunEdge * 0.28 * strength - valleyBias * 0.15 * strength;
        r *= pigmentMul;
        g *= pigmentMul;
        b *= pigmentMul;
        a = clampByte(a * (1 + backrunEdge * 0.18 * strength + valleyBias * 0.08 * strength));
      } else if (profile === "dry-contact-tooth") {
        // 연필·목탄 봉우리 접촉(Contact-Tooth): 약·중 필압에서 골짜기 미세 여백과 봉우리 흑연 광택 강조
        const toothSlope =
          (toothField[row + xp1] ?? tooth) -
          (toothField[row + xm1] ?? tooth) +
          ((toothField[rowP1 + x] ?? tooth) - (toothField[rowM1 + x] ?? tooth));
        const sheen = clamp01(-toothSlope * 1.4) * 22 * strength * smoothstep(0.12, 0.75, aNorm);
        const valleyCut = (1 - aNorm * 0.72) * (1 - tooth) * 0.36 * strength;
        const peakLift = (tooth - 0.5) * 0.22 * strength;
        r = r * (1 + peakLift) + sheen;
        g = g * (1 + peakLift) + sheen;
        b = b * (1 + peakLift) + sheen;
        a = clampByte(a * clamp01(1 - valleyCut));
      }

      rgba[p] = clampByte(r);
      rgba[p + 1] = clampByte(g);
      rgba[p + 2] = clampByte(b);
      rgba[p + 3] = a;
    }
  }

  return touchedPixels;
}

interface ImageDataReadableContext {
  getImageData?: (sx: number, sy: number, sw: number, sh: number) => ImageData;
  putImageData?: (imageData: ImageData, dx: number, dy: number) => void;
  setTransform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
}

/**
 * 오프스크린 타일 캔버스(이미 bleed 여백 포함)에 인플레이스로 2.5D 실물 질감 셰이딩을 적용한다.
 * 테스트용 스텁 컨텍스트처럼 `getImageData`가 없으면 조용히 false를 반환하고 원본을 보존한다.
 */
export function applyStudioTactileReliefToTileContext(
  context: unknown,
  params: {
    readonly width: number;
    readonly height: number;
    readonly brushIdOrFamily: unknown;
    readonly worldOriginX: number;
    readonly worldOriginY: number;
    readonly worldScale: number;
    readonly modeOverride?: StudioTactileReliefMode;
    readonly paperSeed?: number;
  },
): boolean {
  const mode = params.modeOverride ?? currentTactileReliefMode;
  if (mode === "off") return false;
  const profile = resolveStudioTactileReliefProfileForBrush(params.brushIdOrFamily);
  if (profile === "none") return false;
  const ctx = context as ImageDataReadableContext | null | undefined;
  if (!ctx || typeof ctx.getImageData !== "function" || typeof ctx.putImageData !== "function") {
    return false;
  }
  const { width, height } = params;
  if (width < 3 || height < 3) return false;
  try {
    const img = ctx.getImageData(0, 0, width, height);
    const seed = params.paperSeed ?? resolveStudioDocumentPaperSurface().seed;
    const touched = applyStudioTactilePhysicalReliefToRgba(img.data, {
      width,
      height,
      profile,
      mode,
      worldOriginX: params.worldOriginX,
      worldOriginY: params.worldOriginY,
      worldScale: params.worldScale,
      paperSeed: seed,
    });
    if (touched > 0) {
      ctx.putImageData(img, 0, 0);
      return true;
    }
  } catch {
    // 보안 오염/스텁 캔버스 환경에서는 원본 스트로크를 안전하게 유지한다.
  }
  return false;
}

function acquireScratchContext(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (typeof document === "undefined") return null;
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
    scratchCtx = scratchCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
  }
  if (!scratchCanvas || !scratchCtx) return null;
  if (scratchCanvas.width < width) scratchCanvas.width = Math.max(width, 256);
  if (scratchCanvas.height < height) scratchCanvas.height = Math.max(height, 256);
  return { canvas: scratchCanvas, ctx: scratchCtx };
}

/**
 * 라이브 오버레이(`activeCanvas`)를 오염시키지 않으면서 지정 더티 사각형에 2px 헤일로 기반
 * 실물 질감 셰이딩을 적용해 `destinationContext`에 출력한다.
 * 비활성·미지원 환경에서는 `false`를 반환해 호출부가 기존 고속 `drawImage` 경로를 그대로 타도록 한다.
 */
export function drawCanvasRectWithStudioTactileRelief(
  destinationContext: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  params: {
    readonly brushIdOrFamily: unknown;
    readonly opacity: number;
    readonly worldOriginX: number;
    readonly worldOriginY: number;
    readonly worldScale: number;
    readonly clearDestinationRect?: boolean;
    readonly modeOverride?: StudioTactileReliefMode;
    readonly paperSeed?: number;
  },
): boolean {
  const mode = params.modeOverride ?? currentTactileReliefMode;
  if (mode === "off") return false;
  const profile = resolveStudioTactileReliefProfileForBrush(params.brushIdOrFamily);
  if (profile === "none") return false;
  if (rect.width < 1 || rect.height < 1) return false;

  const pad = 2;
  const padX = Math.max(0, rect.x - pad);
  const padY = Math.max(0, rect.y - pad);
  const padRight = Math.min(sourceCanvas.width, rect.x + rect.width + pad);
  const padBottom = Math.min(sourceCanvas.height, rect.y + rect.height + pad);
  const padW = padRight - padX;
  const padH = padBottom - padY;
  if (padW < 3 || padH < 3) return false;

  const scratch = acquireScratchContext(padW, padH);
  if (!scratch) return false;
  try {
    const { canvas: sCanvas, ctx: sCtx } = scratch;
    sCtx.setTransform(1, 0, 0, 1, 0, 0);
    sCtx.clearRect(0, 0, padW, padH);
    sCtx.globalCompositeOperation = "source-over";
    sCtx.globalAlpha = 1;
    sCtx.drawImage(sourceCanvas, padX, padY, padW, padH, 0, 0, padW, padH);
    const img = sCtx.getImageData(0, 0, padW, padH);
    const innerX = rect.x - padX;
    const innerY = rect.y - padY;
    const invScale = params.worldScale > 1e-4 ? 1 / params.worldScale : 1;
    const seed = params.paperSeed ?? resolveStudioDocumentPaperSurface().seed;
    applyStudioTactilePhysicalReliefToRgba(img.data, {
      width: padW,
      height: padH,
      profile,
      mode,
      worldOriginX: params.worldOriginX + padX * invScale,
      worldOriginY: params.worldOriginY + padY * invScale,
      worldScale: params.worldScale,
      paperSeed: seed,
      innerX,
      innerY,
      innerWidth: rect.width,
      innerHeight: rect.height,
    });
    sCtx.putImageData(img, 0, 0);

    destinationContext.save();
    destinationContext.setTransform(1, 0, 0, 1, 0, 0);
    if (params.clearDestinationRect) {
      destinationContext.clearRect(rect.x, rect.y, rect.width, rect.height);
    }
    destinationContext.globalCompositeOperation = "source-over";
    destinationContext.globalAlpha = clamp01(params.opacity);
    destinationContext.drawImage(
      sCanvas,
      innerX,
      innerY,
      rect.width,
      rect.height,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
    destinationContext.restore();
    return true;
  } catch {
    return false;
  }
}
