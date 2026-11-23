/**
 * Web Worker 스레드와 비동기 폴백 실행기가 100% 동일한 연산 계약·결과를 공유하도록
 * 분리한 순수 연산 프로토콜 및 작업 실행기.
 *
 * - DOM(`window`/`document`) 및 React 의존성 0건: Dedicated Worker 스레드에서 안전하게 로드된다.
 * - 모든 입·출력 `ArrayBuffer`는 `Transferable` 제로-카피 전송을 위해 정확한 길이의 독립 버퍼로 반환한다.
 */

import {
  applyMasterFilterToRgba,
  measureRgbaFilterDiff,
} from "../../filter/master-lut-fx/master-filter-pixel-engine";
import type { MasterFilterId } from "../../filter/master-lut-fx/master-filter-lut-catalog";
import {
  extract3dLightingRigFrom2dCut,
  type CutTo3dLightingRig,
} from "../../pro-craft-engines/cut-to-3d-lighting-matcher";
import {
  generateDieCutSvgFromAlpha,
  type GoodsCutlineOptions,
  type GoodsCutlineResult,
} from "../../pro-craft-engines/goods-print-cutline-preflight";
import {
  runWasmPixelKernel,
  type WasmPixelKernelBackend,
  type WasmPixelKernelMode,
  type WasmSimdWorkerSupportSnapshot,
} from "./wasm-simd-pixel-kernel";

export const STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION = 1 as const;

export type StudioComputeJobType =
  | "master-filter-rgba"
  | "die-cut-alpha"
  | "lighting-extract"
  | "wasm-alpha-threshold"
  | "offscreen-stroke-raster";

export interface OffscreenStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface DirtyPixelBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface MasterFilterRgbaJobInput {
  readonly type: "master-filter-rgba";
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly filterId: MasterFilterId;
  readonly intensity?: number;
  readonly seed?: number;
}

export interface DieCutAlphaJobInput {
  readonly type: "die-cut-alpha";
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly options: GoodsCutlineOptions;
}

export interface LightingExtractJobInput {
  readonly type: "lighting-extract";
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
}

export interface WasmAlphaThresholdJobInput {
  readonly type: "wasm-alpha-threshold";
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly threshold?: number;
  readonly mode?: WasmPixelKernelMode;
}

export interface OffscreenStrokeRasterJobInput {
  readonly type: "offscreen-stroke-raster";
  readonly width: number;
  readonly height: number;
  readonly points: readonly OffscreenStrokePoint[];
  readonly colorRgba: readonly [number, number, number, number];
  readonly radiusPx: number;
  readonly hardness?: number;
  readonly spacing?: number;
  readonly baseRgba?: ArrayBuffer;
  readonly targetSurfaceId?: string;
}

export type StudioComputeJobInput =
  | MasterFilterRgbaJobInput
  | DieCutAlphaJobInput
  | LightingExtractJobInput
  | WasmAlphaThresholdJobInput
  | OffscreenStrokeRasterJobInput;

export interface MasterFilterRgbaJobOutput {
  readonly type: "master-filter-rgba";
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly changedPixelRatio: number;
  readonly elapsedMs: number;
}

export interface DieCutAlphaJobOutput {
  readonly type: "die-cut-alpha";
  readonly cutline: GoodsCutlineResult;
  readonly opaquePixelCount: number;
  readonly wasmBackend: WasmPixelKernelBackend;
  readonly elapsedMs: number;
}

export interface LightingExtractJobOutput {
  readonly type: "lighting-extract";
  readonly rig: CutTo3dLightingRig;
  readonly brightPixelCount: number;
  readonly wasmBackend: WasmPixelKernelBackend;
  readonly elapsedMs: number;
}

export interface WasmAlphaThresholdJobOutput {
  readonly type: "wasm-alpha-threshold";
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly matchedPixelCount: number;
  readonly totalPixelCount: number;
  readonly wasmBackend: WasmPixelKernelBackend;
  readonly simdVectorPixels: number;
  readonly elapsedMs: number;
}

export interface OffscreenStrokeRasterJobOutput {
  readonly type: "offscreen-stroke-raster";
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly dabCount: number;
  readonly paintedPixelCount: number;
  readonly dirtyBounds: DirtyPixelBounds;
  readonly usedOffscreenCanvas: boolean;
  readonly elapsedMs: number;
}

export type StudioComputeJobOutput =
  | MasterFilterRgbaJobOutput
  | DieCutAlphaJobOutput
  | LightingExtractJobOutput
  | WasmAlphaThresholdJobOutput
  | OffscreenStrokeRasterJobOutput;

export interface StudioComputeJobOutputByType {
  readonly "master-filter-rgba": MasterFilterRgbaJobOutput;
  readonly "die-cut-alpha": DieCutAlphaJobOutput;
  readonly "lighting-extract": LightingExtractJobOutput;
  readonly "wasm-alpha-threshold": WasmAlphaThresholdJobOutput;
  readonly "offscreen-stroke-raster": OffscreenStrokeRasterJobOutput;
}

export type StudioWorkerInboundMessage =
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "run-job";
      readonly jobId: number;
      readonly input: StudioComputeJobInput;
    }
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "cancel-job";
      readonly jobId: number;
    }
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "attach-offscreen-canvas";
      readonly surfaceId: string;
      readonly canvas: OffscreenCanvas;
    }
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "ping";
      readonly requestId: number;
    };

export type StudioWorkerOutboundMessage =
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "ready";
      readonly capabilities: WasmSimdWorkerSupportSnapshot;
    }
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "job-result";
      readonly jobId: number;
      readonly output: StudioComputeJobOutput;
      readonly transferBytes: number;
    }
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "job-error";
      readonly jobId: number;
      readonly code: "cancelled" | "execution-failed" | "invalid-input";
      readonly message: string;
    }
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "canvas-attached";
      readonly surfaceId: string;
      readonly ok: boolean;
    }
  | {
      readonly version: typeof STUDIO_COMPUTE_WORKER_PROTOCOL_VERSION;
      readonly kind: "pong";
      readonly requestId: number;
      readonly capabilities: WasmSimdWorkerSupportSnapshot;
    };

export interface StudioComputeExecutionContext {
  readonly isCancelled?: () => boolean;
  readonly offscreenSurfaces?: ReadonlyMap<string, OffscreenCanvas>;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 뷰의 `byteOffset`/`byteLength`와 정확히 일치하는 독립 `ArrayBuffer`를 반환한다.
 */
export function toExactArrayBuffer(view: Uint8ClampedArray | Uint8Array): ArrayBuffer {
  const buf = view.buffer;
  if (
    buf instanceof ArrayBuffer
    && view.byteOffset === 0
    && view.byteLength === buf.byteLength
  ) {
    return buf;
  }
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

/**
 * 입력 작업 객체에서 제로-카피 `Transferable` 대상 `ArrayBuffer` 목록을 추출한다.
 */
export function collectInputTransferables(input: StudioComputeJobInput): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  const transfers: Transferable[] = [];
  const pushBuffer = (buffer: ArrayBuffer | undefined): void => {
    if (buffer instanceof ArrayBuffer && !seen.has(buffer)) {
      seen.add(buffer);
      transfers.push(buffer);
    }
  };

  if (input.type === "offscreen-stroke-raster") {
    pushBuffer(input.baseRgba);
  } else {
    pushBuffer(input.rgba);
  }
  return transfers;
}

/**
 * 출력 작업 결과에서 제로-카피 `Transferable` 대상 `ArrayBuffer` 목록을 추출한다.
 */
export function collectOutputTransferables(output: StudioComputeJobOutput): Transferable[] {
  const transfers: Transferable[] = [];
  if (
    output.type === "master-filter-rgba"
    || output.type === "wasm-alpha-threshold"
    || output.type === "offscreen-stroke-raster"
  ) {
    if (output.rgba instanceof ArrayBuffer) {
      transfers.push(output.rgba);
    }
  }
  return transfers;
}

/**
 * `Transferable` 목록 중 제로-카피 전송되는 `ArrayBuffer` 총 바이트 수를 계산한다.
 */
export function measureTransferableBytes(transfers: readonly Transferable[]): number {
  let total = 0;
  for (const item of transfers) {
    if (item instanceof ArrayBuffer) {
      total += item.byteLength;
    }
  }
  return total;
}

interface InterpolatedDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
}

function buildStrokeDabs(input: OffscreenStrokeRasterJobInput): InterpolatedDab[] {
  const baseRadius = Math.max(0.5, Number.isFinite(input.radiusPx) ? input.radiusPx : 4);
  const spacingRatio = Math.max(0.1, Math.min(2, Number.isFinite(input.spacing) ? (input.spacing ?? 0.35) : 0.35));
  const baseAlpha = clamp01((input.colorRgba[3] ?? 255) / 255);
  const dabs: InterpolatedDab[] = [];

  if (input.points.length === 0 || baseAlpha <= 0) return dabs;

  const first = input.points[0];
  if (!first) return dabs;
  const firstPressure = clamp01(first.pressure ?? 1);
  dabs.push({
    x: first.x,
    y: first.y,
    radius: Math.max(0.5, baseRadius * (0.35 + 0.65 * firstPressure)),
    alpha: baseAlpha * (0.25 + 0.75 * firstPressure),
  });

  for (let i = 1; i < input.points.length; i += 1) {
    const prev = input.points[i - 1];
    const curr = input.points[i];
    if (!prev || !curr) continue;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(0.5, baseRadius * spacingRatio);
    const count = Math.max(1, Math.ceil(dist / step));
    const p0 = clamp01(prev.pressure ?? 1);
    const p1 = clamp01(curr.pressure ?? 1);

    for (let s = 1; s <= count; s += 1) {
      const t = s / count;
      const pressure = p0 + (p1 - p0) * t;
      dabs.push({
        x: prev.x + dx * t,
        y: prev.y + dy * t,
        radius: Math.max(0.5, baseRadius * (0.35 + 0.65 * pressure)),
        alpha: baseAlpha * (0.25 + 0.75 * pressure),
      });
    }
  }
  return dabs;
}

function rasterizeOffscreenStroke(
  input: OffscreenStrokeRasterJobInput,
  offscreenSurfaces?: ReadonlyMap<string, OffscreenCanvas>,
): OffscreenStrokeRasterJobOutput {
  const start = nowMs();
  const width = Math.max(1, Math.min(8192, Math.floor(Number.isFinite(input.width) ? input.width : 1)));
  const height = Math.max(1, Math.min(8192, Math.floor(Number.isFinite(input.height) ? input.height : 1)));
  const byteLength = width * height * 4;
  const hardness = clamp01(input.hardness ?? 0.65);
  const srcR = clampByte(input.colorRgba[0] ?? 0);
  const srcG = clampByte(input.colorRgba[1] ?? 0);
  const srcB = clampByte(input.colorRgba[2] ?? 0);
  const dabs = buildStrokeDabs(input);

  // OffscreenCanvas 2D가 지원되는 브라우저/워커 런타임에서는 실제 OffscreenCanvas로 래스터화한다
  if (typeof OffscreenCanvas === "function") {
    try {
      const targetSurface = input.targetSurfaceId
        ? offscreenSurfaces?.get(input.targetSurfaceId)
        : undefined;
      const canvas = targetSurface ?? new OffscreenCanvas(width, height);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        if (input.baseRgba && input.baseRgba.byteLength === byteLength) {
          const baseCopy = new Uint8ClampedArray(byteLength);
          baseCopy.set(new Uint8ClampedArray(input.baseRgba));
          ctx.putImageData(new ImageData(baseCopy, width, height), 0, 0);
        } else {
          ctx.clearRect(0, 0, width, height);
        }

        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;

        for (const dab of dabs) {
          const innerR = Math.max(0, dab.radius * hardness);
          const gradient = ctx.createRadialGradient(dab.x, dab.y, innerR, dab.x, dab.y, dab.radius);
          gradient.addColorStop(0, `rgba(${srcR}, ${srcG}, ${srcB}, ${dab.alpha})`);
          gradient.addColorStop(1, `rgba(${srcR}, ${srcG}, ${srcB}, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
          ctx.fill();

          minX = Math.min(minX, Math.max(0, Math.floor(dab.x - dab.radius)));
          minY = Math.min(minY, Math.max(0, Math.floor(dab.y - dab.radius)));
          maxX = Math.max(maxX, Math.min(width - 1, Math.ceil(dab.x + dab.radius)));
          maxY = Math.max(maxY, Math.min(height - 1, Math.ceil(dab.y + dab.radius)));
        }

        const imageData = ctx.getImageData(0, 0, width, height);
        let paintedPixelCount = 0;
        for (let i = 3; i < imageData.data.length; i += 4) {
          if ((imageData.data[i] ?? 0) > 0) paintedPixelCount += 1;
        }
        const hasDirty = maxX >= minX && maxY >= minY;
        return {
          type: "offscreen-stroke-raster",
          rgba: toExactArrayBuffer(imageData.data),
          width,
          height,
          dabCount: dabs.length,
          paintedPixelCount,
          dirtyBounds: hasDirty
            ? { minX, minY, maxX, maxY }
            : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          usedOffscreenCanvas: true,
          elapsedMs: Math.max(0, nowMs() - start),
        };
      }
    } catch {
      // OffscreenCanvas 2D 생성 실패 시 아래 순수 RGBA 스탬핑 경로로 안전 폴백
    }
  }

  // JSDOM / Node / OffscreenCanvas 미지원 환경: 결정론적 방사형 소프트 브러시 Porter-Duff 합성
  const pixels = new Uint8ClampedArray(byteLength);
  if (input.baseRgba && input.baseRgba.byteLength === byteLength) {
    pixels.set(new Uint8ClampedArray(input.baseRgba));
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (const dab of dabs) {
    const r = dab.radius;
    const x0 = Math.max(0, Math.floor(dab.x - r));
    const y0 = Math.max(0, Math.floor(dab.y - r));
    const x1 = Math.min(width - 1, Math.ceil(dab.x + r));
    const y1 = Math.min(height - 1, Math.ceil(dab.y + r));
    if (x1 < x0 || y1 < y0) continue;

    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);

    const inner = r * hardness;
    const falloffSpan = Math.max(1e-4, r - inner);

    for (let py = y0; py <= y1; py += 1) {
      const dy = py + 0.5 - dab.y;
      for (let px = x0; px <= x1; px += 1) {
        const dx = px + 0.5 - dab.x;
        const dist = Math.hypot(dx, dy);
        if (dist >= r) continue;

        const radialWeight = dist <= inner ? 1 : Math.max(0, 1 - (dist - inner) / falloffSpan);
        const sa = dab.alpha * radialWeight;
        if (sa <= 0) continue;

        const idx = (py * width + px) * 4;
        const da = (pixels[idx + 3] ?? 0) / 255;
        const outA = sa + da * (1 - sa);
        if (outA <= 0) continue;

        const dr = pixels[idx] ?? 0;
        const dg = pixels[idx + 1] ?? 0;
        const db = pixels[idx + 2] ?? 0;
        const invOutA = 1 / outA;

        pixels[idx] = clampByte((srcR * sa + dr * da * (1 - sa)) * invOutA);
        pixels[idx + 1] = clampByte((srcG * sa + dg * da * (1 - sa)) * invOutA);
        pixels[idx + 2] = clampByte((srcB * sa + db * da * (1 - sa)) * invOutA);
        pixels[idx + 3] = clampByte(outA * 255);
      }
    }
  }

  let paintedPixelCount = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if ((pixels[i] ?? 0) > 0) paintedPixelCount += 1;
  }
  const hasDirty = maxX >= minX && maxY >= minY;

  return {
    type: "offscreen-stroke-raster",
    rgba: toExactArrayBuffer(pixels),
    width,
    height,
    dabCount: dabs.length,
    paintedPixelCount,
    dirtyBounds: hasDirty
      ? { minX, minY, maxX, maxY }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    usedOffscreenCanvas: false,
    elapsedMs: Math.max(0, nowMs() - start),
  };
}

/**
 * 5종 연산 작업(`master-filter-rgba`, `die-cut-alpha`, `lighting-extract`,
 * `wasm-alpha-threshold`, `offscreen-stroke-raster`)을 실제 엔진과 Wasm SIMD128 커널로 실행한다.
 */
export async function executeStudioComputeJob(
  input: StudioComputeJobInput,
  context?: StudioComputeExecutionContext,
): Promise<StudioComputeJobOutput> {
  const start = nowMs();

  if (context?.isCancelled?.()) {
    throw new Error("작업이 실행 시작 전에 취소되었습니다.");
  }

  switch (input.type) {
    case "master-filter-rgba": {
      const source = new Uint8ClampedArray(input.rgba);
      const filtered = applyMasterFilterToRgba(
        source,
        input.width,
        input.height,
        input.filterId,
        { intensity: input.intensity, seed: input.seed },
      );
      const diff = measureRgbaFilterDiff(source, filtered);
      return {
        type: "master-filter-rgba",
        rgba: toExactArrayBuffer(filtered),
        width: input.width,
        height: input.height,
        changedPixelRatio: diff.changedPixelRatio,
        elapsedMs: Math.max(0, nowMs() - start),
      };
    }

    case "die-cut-alpha": {
      const source = new Uint8ClampedArray(input.rgba);
      const alphaThreshold = input.options.alphaThreshold ?? 24;
      const wasmCount = await runWasmPixelKernel(source, "alpha-mask-count", alphaThreshold);
      if (context?.isCancelled?.()) {
        throw new Error("다이컷 알파 작업이 취소되었습니다.");
      }
      const cutline = generateDieCutSvgFromAlpha(
        source,
        input.width,
        input.height,
        input.options,
      );
      return {
        type: "die-cut-alpha",
        cutline,
        opaquePixelCount: wasmCount.matchedPixelCount,
        wasmBackend: wasmCount.backend,
        elapsedMs: Math.max(0, nowMs() - start),
      };
    }

    case "lighting-extract": {
      const source = new Uint8ClampedArray(input.rgba);
      const lumaPass = await runWasmPixelKernel(source, "luma", 204);
      if (context?.isCancelled?.()) {
        throw new Error("광원 추출 작업이 취소되었습니다.");
      }
      const rig = extract3dLightingRigFrom2dCut(source, input.width, input.height);
      return {
        type: "lighting-extract",
        rig,
        brightPixelCount: lumaPass.matchedPixelCount,
        wasmBackend: lumaPass.backend,
        elapsedMs: Math.max(0, nowMs() - start),
      };
    }

    case "wasm-alpha-threshold": {
      const source = new Uint8ClampedArray(input.rgba);
      const mode: WasmPixelKernelMode = input.mode ?? "alpha-threshold";
      const threshold = input.threshold ?? 128;
      const result = await runWasmPixelKernel(source, mode, threshold);
      return {
        type: "wasm-alpha-threshold",
        rgba: toExactArrayBuffer(result.data),
        width: input.width,
        height: input.height,
        matchedPixelCount: result.matchedPixelCount,
        totalPixelCount: result.totalPixelCount,
        wasmBackend: result.backend,
        simdVectorPixels: result.simdVectorPixels,
        elapsedMs: Math.max(0, nowMs() - start),
      };
    }

    case "offscreen-stroke-raster": {
      return rasterizeOffscreenStroke(input, context?.offscreenSurfaces);
    }
  }
}
