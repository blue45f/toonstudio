import { SumiError } from "../engine/core/errors";

import type { LabImage } from "../engine/core/types";

/**
 * 캔버스 표시 어댑터. 레인 readback 결과(sRGB straight RGBA8)를 `putImageData`로 올리고,
 * 예측 표본은 별도 미리보기 캔버스에만 그린다.
 */

/** 문서 한 변 상한(px). README 캔버스 상한(2048²)과 같다. */
export const MAX_DOCUMENT_SIDE_PX = 2048;
/** 문서 타일 수 상한. 습식 풀(확장 23채널)을 `wetCapacityTiles`로 올려도 SwiftShader에서 실제 장치가 받은 6000타일을 넘기지 않는다. */
export const MAX_DOCUMENT_TILES = 6000;
/** CSS 가용 영역 한 변 안전 상한(px). 비정상 거대 레이아웃 값이 정수·부동소수점 한계를 넘지 않게 막는다. */
export const MAX_SAFE_CSS_SIDE_PX = 16384;

/** LabImage 한 변 상한(px). 문서 상한(`MAX_DOCUMENT_SIDE_PX`)과 정렬한다. */
export const MAX_LAB_IMAGE_SIDE_PX = MAX_DOCUMENT_SIDE_PX;
/** LabImage 최대 픽셀 수(2048 × 2048 = 4,194,304). */
export const MAX_LAB_IMAGE_PIXELS = MAX_LAB_IMAGE_SIDE_PX * MAX_LAB_IMAGE_SIDE_PX;
/** LabImage RGBA8 버퍼 최대 바이트 수(2048 × 2048 × 4 = 16,777,216 B). */
export const MAX_LAB_IMAGE_BYTES = MAX_LAB_IMAGE_PIXELS * 4;

export type LabImageInvalidReason =
  | "invalid-image-object"
  | "non-integer-dimensions"
  | "non-positive-dimensions"
  | "dimensions-exceed-budget"
  | "invalid-buffer-type"
  | "buffer-length-mismatch";

export interface ValidatedLabImageSpec {
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
  readonly expectedByteLength: number;
  readonly data: Uint8ClampedArray;
}

/**
 * `LabImage` 구조·치수·도메인 예산·버퍼 길이를 할당이나 캔버스 변형 전에 검증한다.
 * 위반 시 `SumiError("lab-image-invalid")`를 던진다.
 */
export function validateLabImage(img: unknown): ValidatedLabImageSpec {
  if (!img || typeof img !== "object") {
    throw new SumiError("lab-image-invalid", "LabImage 객체가 유효하지 않다", { reason: "invalid-image-object" });
  }
  const { width, height, data } = img as Partial<Record<"width" | "height" | "data", unknown>>;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new SumiError("lab-image-invalid", `LabImage 크기는 유한한 정수여야 한다(${String(width)}×${String(height)})`, { reason: "non-integer-dimensions", width, height });
  }
  if (width <= 0 || height <= 0) {
    throw new SumiError("lab-image-invalid", `LabImage 크기는 1 이상이어야 한다(${width}×${height})`, { reason: "non-positive-dimensions", width, height });
  }
  const pixels = width * height;
  const expectedByteLength = pixels * 4;
  if (width > MAX_LAB_IMAGE_SIDE_PX || height > MAX_LAB_IMAGE_SIDE_PX || !Number.isSafeInteger(pixels) || pixels > MAX_LAB_IMAGE_PIXELS || !Number.isSafeInteger(expectedByteLength) || expectedByteLength > MAX_LAB_IMAGE_BYTES) {
    throw new SumiError(
      "lab-image-invalid",
      `LabImage 크기(${width}×${height})가 지원 한도(${MAX_LAB_IMAGE_SIDE_PX}×${MAX_LAB_IMAGE_SIDE_PX}, ${MAX_LAB_IMAGE_BYTES}B)를 초과한다`,
      { reason: "dimensions-exceed-budget", width, height, maxSidePx: MAX_LAB_IMAGE_SIDE_PX, maxPixels: MAX_LAB_IMAGE_PIXELS, maxBytes: MAX_LAB_IMAGE_BYTES },
    );
  }
  if (!(data instanceof Uint8ClampedArray)) {
    throw new SumiError("lab-image-invalid", "LabImage.data는 Uint8ClampedArray여야 한다", { reason: "invalid-buffer-type" });
  }
  if (data.length !== expectedByteLength) {
    throw new SumiError(
      "lab-image-invalid",
      `LabImage.data 길이(${data.length})가 ${width}×${height}×4(${expectedByteLength})와 일치하지 않는다`,
      { reason: "buffer-length-mismatch", width, height, actualLength: data.length, expectedLength: expectedByteLength },
    );
  }
  return { width, height, pixels, expectedByteLength, data };
}

export type PresentAtomicityStatus =
  | "committed-same-size"
  | "committed-cross-size"
  | "preserved-pre-resize"
  | "preserved-same-size"
  | "restored-from-snapshot"
  | "dimensions-only-snapshot-unavailable"
  | "dimensions-only-rollback-put-failed";

export interface PresentCommitReceipt {
  readonly committed: true;
  readonly crossSize: boolean;
  readonly prevWidth: number;
  readonly prevHeight: number;
  readonly width: number;
  readonly height: number;
  readonly snapshotCaptured: boolean;
  readonly snapshotBytes: number;
  readonly stagedBytes: number;
  readonly peakStagingBytes: number;
  readonly atomicityStatus: "committed-same-size" | "committed-cross-size";
}

export interface PresentRollbackDiagnostics {
  readonly committed: false;
  readonly crossSize: boolean;
  readonly prevWidth: number;
  readonly prevHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly snapshotCaptured: boolean;
  readonly snapshotBytes: number;
  readonly stagedBytes: number;
  readonly peakStagingBytes: number;
  readonly dimensionsRestored: boolean;
  readonly pixelsRestored: boolean;
  readonly atomicityStatus: Exclude<PresentAtomicityStatus, "committed-same-size" | "committed-cross-size">;
}

function attachPresentRollback(error: unknown, diagnostics: PresentRollbackDiagnostics): void {
  if (error && typeof error === "object") (error as { presentRollback?: PresentRollbackDiagnostics }).presentRollback = diagnostics;
}

/** `presentLabImage`·`presentLabImageWithReceipt` 예외에 첨부된 롤백·원자성 진단을 읽는다. */
export function getPresentRollbackDiagnostics(error: unknown): PresentRollbackDiagnostics | null {
  if (!error || typeof error !== "object") return null;
  return (error as { presentRollback?: PresentRollbackDiagnostics }).presentRollback ?? null;
}

/**
 * 검증된 `LabImage`를 오프스크린 `ImageData`에 스테이징한 뒤 2D 캔버스에 커밋하고 영수증을 돌려준다.
 * 교차 크기(`crossSize === true`)일 때만 리사이즈 전 기존 캔버스 스냅샷을 캡처해,
 * `putImageData` 실패 시 치수·픽셀 롤백을 시도하고 복구 불능 경계를 진단으로 남긴다.
 */
export function presentLabImageWithReceipt(canvas: HTMLCanvasElement, img: LabImage): PresentCommitReceipt {
  const spec = validateLabImage(img);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  const prevWidth = canvas.width;
  const prevHeight = canvas.height;
  const crossSize = prevWidth !== spec.width || prevHeight !== spec.height;
  const baseDiag = { committed: false as const, crossSize, prevWidth, prevHeight, targetWidth: spec.width, targetHeight: spec.height };

  let stagedImageData: ImageData;
  try {
    stagedImageData = ctx.createImageData(spec.width, spec.height);
    stagedImageData.data.set(spec.data);
  } catch (stagingError) {
    attachPresentRollback(stagingError, {
      ...baseDiag,
      snapshotCaptured: false,
      snapshotBytes: 0,
      stagedBytes: 0,
      peakStagingBytes: 0,
      dimensionsRestored: canvas.width === prevWidth && canvas.height === prevHeight,
      pixelsRestored: true,
      atomicityStatus: "preserved-pre-resize",
    });
    throw stagingError;
  }

  let prevSnapshot: ImageData | null = null;
  let snapshotBytes = 0;
  const canReadPrev =
    crossSize &&
    prevWidth >= 1 &&
    prevHeight >= 1 &&
    prevWidth <= MAX_LAB_IMAGE_SIDE_PX &&
    prevHeight <= MAX_LAB_IMAGE_SIDE_PX &&
    prevWidth * prevHeight <= MAX_LAB_IMAGE_PIXELS &&
    typeof (ctx as Partial<CanvasRenderingContext2D>).getImageData === "function";
  if (canReadPrev) {
    try {
      const snap = ctx.getImageData(0, 0, prevWidth, prevHeight);
      if (snap && snap.width === prevWidth && snap.height === prevHeight && snap.data instanceof Uint8ClampedArray && snap.data.byteLength === prevWidth * prevHeight * 4) {
        prevSnapshot = snap;
        snapshotBytes = snap.data.byteLength;
      }
    } catch {
      prevSnapshot = null;
    }
  }

  const stagedBytes = spec.expectedByteLength;
  const peakStagingBytes = snapshotBytes + stagedBytes;
  const budgetStats = { snapshotCaptured: prevSnapshot !== null, snapshotBytes, stagedBytes, peakStagingBytes };
  if (crossSize) {
    if (canvas.width !== spec.width) canvas.width = spec.width;
    if (canvas.height !== spec.height) canvas.height = spec.height;
  }

  try {
    ctx.putImageData(stagedImageData, 0, 0);
  } catch (commitError) {
    const commitDiag = { ...baseDiag, ...budgetStats };
    if (!crossSize) {
      attachPresentRollback(commitError, {
        ...commitDiag,
        dimensionsRestored: canvas.width === prevWidth && canvas.height === prevHeight,
        pixelsRestored: true,
        atomicityStatus: "preserved-same-size",
      });
      throw commitError;
    }
    if (canvas.width !== prevWidth) canvas.width = prevWidth;
    if (canvas.height !== prevHeight) canvas.height = prevHeight;
    const dimensionsRestored = canvas.width === prevWidth && canvas.height === prevHeight;
    let pixelsRestored = false;
    let atomicityStatus: PresentRollbackDiagnostics["atomicityStatus"] = "dimensions-only-snapshot-unavailable";
    if (prevSnapshot !== null) {
      try {
        ctx.putImageData(prevSnapshot, 0, 0);
        pixelsRestored = true;
        atomicityStatus = "restored-from-snapshot";
      } catch {
        atomicityStatus = "dimensions-only-rollback-put-failed";
      }
    }
    attachPresentRollback(commitError, { ...commitDiag, dimensionsRestored, pixelsRestored, atomicityStatus });
    throw commitError;
  }

  return {
    committed: true,
    crossSize,
    prevWidth,
    prevHeight,
    width: spec.width,
    height: spec.height,
    ...budgetStats,
    atomicityStatus: crossSize ? "committed-cross-size" : "committed-same-size",
  };
}

/** 검증된 `LabImage`를 2D 캔버스에 표시한다. 교차 크기 실패 시 스냅샷 롤백으로 기존 캔버스 크기와 픽셀을 복원한다. */
export function presentLabImage(canvas: HTMLCanvasElement, img: LabImage): void {
  presentLabImageWithReceipt(canvas, img);
}

/** 캔버스를 비운다. */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export interface PreviewPoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * 예측 표본 미리보기(scratch 레이어). 정본 레이어와 분리된 캔버스에 반투명 점·선으로 그린다.
 * `radiusPx`는 현재 브러시 반경(압력 1 기준). `predicted`를 4번째 인자로 넘기면 배열 병합 할당 없이 이어서 그린다.
 */
export function presentPreview(
  canvas: HTMLCanvasElement,
  points: readonly PreviewPoint[],
  radiusPx: number,
  predicted?: readonly PreviewPoint[],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const predLen = predicted ? predicted.length : 0;
  if (points.length === 0 && predLen === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#7c68ec";
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.75, radiusPx * Math.max(0.05, p.pressure)), 0, Math.PI * 2);
    ctx.fill();
  }
  if (predicted) {
    for (const p of predicted) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.75, radiusPx * Math.max(0.05, p.pressure)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * `getContext("webgpu")`는 lib.dom에서 `RenderingContext | null`(2D·WebGL·WebGPU 유니언)로 선언돼 있으므로
 * WebGPU 전용 멤버(`configure`·`getCurrentTexture`)로 명시적으로 좁힌다.
 */
function isGpuCanvasContext(ctx: RenderingContext): ctx is GPUCanvasContext {
  return "configure" in ctx && "getCurrentTexture" in ctx;
}

/** WebGPU 레인 표시용 캔버스 구성. 컨텍스트가 없거나 WebGPU가 아니면 `SumiError("webgpu-canvas-unavailable")`. */
export function configureWebGpuCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  format: GPUTextureFormat,
): GPUCanvasContext {
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new SumiError("webgpu-canvas-unavailable", "WebGPU 캔버스 컨텍스트를 만들 수 없다");
  if (!isGpuCanvasContext(ctx)) {
    throw new SumiError(
      "webgpu-canvas-unavailable",
      "캔버스가 WebGPU 컨텍스트 대신 다른 컨텍스트를 돌려줬다(이미 2D/WebGL로 초기화됨)",
    );
  }
  ctx.configure({ device, format, alphaMode: "premultiplied" });
  return ctx;
}

/* ------------------------------------------------------------------ */
/* 그리기 화면: 문서 크기·DPR·표시 스케일                                  */
/* ------------------------------------------------------------------ */

const TILE_PX = 16;

export interface DocumentSize {
  width: number;
  height: number;
}

/** 문서가 차지하는 16 px 타일 수(레인 풀 용량 계산용). */
export function documentTileCount(size: DocumentSize): number {
  return Math.ceil(size.width / TILE_PX) * Math.ceil(size.height / TILE_PX);
}

export interface FitDocumentResult {
  /** 레인에 주는 문서 크기(정수 px). */
  document: DocumentSize;
  /** 화면에 보이는 CSS 크기(px). 문서 크기 / (실제 사용한 배율). */
  css: DocumentSize;
  /** 한도 때문에 장치 픽셀 해상도를 줄였는가(true면 문서 px < css × dpr). */
  reduced: boolean;
}

function clampAvailableCssSide(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 64;
  return Math.min(MAX_SAFE_CSS_SIDE_PX, Math.max(64, Math.floor(value)));
}

/**
 * "화면 맞춤": 사용할 수 있는 CSS 영역(`availCssWidth` × `availCssHeight`)을 `dpr` 배율의 문서 픽셀로 채운다.
 * 한 변 2048 px·6000 타일 한도를 넘으면 같은 종횡비로 줄이고 `reduced`로 알린다(무음 축소 아님). dpr은 1..2로 클램프한다.
 * 최소 한 변은 64 px, 최대 CSS 한 변은 `MAX_SAFE_CSS_SIDE_PX`(16384 px)로 유한 정수를 보장한다.
 */
export function fitDocumentSize(availCssWidth: number, availCssHeight: number, dpr: number): FitDocumentResult {
  const scale = Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  const cssW = clampAvailableCssSide(availCssWidth);
  const cssH = clampAvailableCssSide(availCssHeight);
  let width = Math.round(cssW * scale);
  let height = Math.round(cssH * scale);
  let reduced = false;
  const shrink = (factor: number): void => {
    width = Math.max(64, Math.floor(width * factor));
    height = Math.max(64, Math.floor(height * factor));
    reduced = true;
  };
  const maxSide = Math.max(width, height);
  if (maxSide > MAX_DOCUMENT_SIDE_PX) shrink(MAX_DOCUMENT_SIDE_PX / maxSide);
  // 타일 수는 올림 계산이라 한 번에 안 맞을 수 있어 몇 번 더 줄인다.
  for (let guard = 0; guard < 8 && documentTileCount({ width, height }) > MAX_DOCUMENT_TILES; guard += 1) {
    shrink(Math.sqrt(MAX_DOCUMENT_TILES / documentTileCount({ width, height })) * 0.995);
  }
  return { document: { width, height }, css: { width: cssW, height: cssH }, reduced };
}

/** 고정 크기 문서를 `maxCssWidth` 안에 비율을 지켜 맞춘 표시 크기(CSS px). 확대하지 않는다(최대 1배). */
export function displayScale(doc: DocumentSize, maxCssWidth: number): number {
  if (!Number.isFinite(maxCssWidth) || !(maxCssWidth > 0) || !Number.isFinite(doc.width) || !(doc.width > 0)) return 1;
  return Math.min(1, maxCssWidth / doc.width);
}

/**
 * 투명 배경 readback(sRGB straight RGBA8)을 흰 종이 위에 합성한 불투명 이미지로 만든다(PNG 스냅샷용).
 * 할당 전에 `validateLabImage`로 치수·도메인 예산·버퍼 길이를 검증하여, 짧거나 손상된 버퍼가
 * 불투명 흰색(`[255, 255, 255, 255]`)으로 위장되는 것을 막는다. 입력은 바꾸지 않는다.
 */
export function flattenOnWhite(img: LabImage): LabImage {
  const spec = validateLabImage(img);
  const data = new Uint8ClampedArray(spec.expectedByteLength);
  const src = spec.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = (src[i + 3] ?? 0) / 255;
    data[i] = Math.round((src[i] ?? 0) * a + 255 * (1 - a));
    data[i + 1] = Math.round((src[i + 1] ?? 0) * a + 255 * (1 - a));
    data[i + 2] = Math.round((src[i + 2] ?? 0) * a + 255 * (1 - a));
    data[i + 3] = 255;
  }
  return { width: spec.width, height: spec.height, data };
}
