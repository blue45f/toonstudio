import { SumiError } from "../engine/core/errors";

import type { LabImage } from "../engine/core/types";

/**
 * 캔버스 표시 어댑터. 레인 readback 결과(sRGB straight RGBA8)를 `putImageData`로 올리고,
 * 예측 표본은 별도 미리보기 캔버스에만 그린다.
 */

/** 2D 컨텍스트를 얻지 못하면 `SumiError("canvas-2d-unavailable")`를 던진다(무음 대체 없음). */
export function presentLabImage(canvas: HTMLCanvasElement, img: LabImage): void {
  if (canvas.width !== img.width) canvas.width = img.width;
  if (canvas.height !== img.height) canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  }
  const imageData = ctx.createImageData(img.width, img.height);
  imageData.data.set(img.data.subarray(0, img.width * img.height * 4));
  ctx.putImageData(imageData, 0, 0);
}

/** 캔버스를 비운다. */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export interface PreviewPoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * 예측 표본 미리보기(scratch 레이어). 정본 레이어와 분리된 캔버스에 반투명 점·선으로 그린다.
 * `radiusPx`는 현재 브러시 반경(압력 1 기준).
 */
export function presentPreview(
  canvas: HTMLCanvasElement,
  points: readonly PreviewPoint[],
  radiusPx: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new SumiError("canvas-2d-unavailable", "캔버스 2D 컨텍스트를 만들 수 없다");
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (points.length === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#7c68ec";
  for (const p of points) {
    const r = Math.max(0.75, radiusPx * Math.max(0.05, p.pressure));
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
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
  if (!ctx) {
    throw new SumiError("webgpu-canvas-unavailable", "WebGPU 캔버스 컨텍스트를 만들 수 없다");
  }
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

/** 문서 한 변 상한(px). README 캔버스 상한(2048²)과 같다. */
export const MAX_DOCUMENT_SIDE_PX = 2048;
/** 문서 타일 수 상한. 습식 풀(확장 23채널)을 `wetCapacityTiles`로 올려도 SwiftShader에서 실제 장치가 받은 6000타일을 넘기지 않는다. */
export const MAX_DOCUMENT_TILES = 6000;
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

/**
 * "화면 맞춤": 사용할 수 있는 CSS 영역(`availCssWidth` × `availCssHeight`)을 `dpr` 배율의 문서 픽셀로 채운다.
 * 한 변 2048 px·6000 타일 한도를 넘으면 같은 종횡비로 줄이고 `reduced`로 알린다(무음 축소 아님). dpr은 1..2로 클램프한다.
 * 최소 한 변은 64 px.
 */
export function fitDocumentSize(availCssWidth: number, availCssHeight: number, dpr: number): FitDocumentResult {
  const scale = Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  const cssW = Math.max(64, Math.floor(availCssWidth));
  const cssH = Math.max(64, Math.floor(availCssHeight));
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
  if (!(maxCssWidth > 0) || !(doc.width > 0)) return 1;
  return Math.min(1, maxCssWidth / doc.width);
}

/**
 * 투명 배경 readback(sRGB straight RGBA8)을 흰 종이 위에 합성한 불투명 이미지로 만든다(PNG 스냅샷용).
 * 입력은 바꾸지 않는다. 화면에서 보는 모습(흰 종이 위의 결과)과 같게 저장한다.
 */
export function flattenOnWhite(img: LabImage): LabImage {
  const data = new Uint8ClampedArray(img.width * img.height * 4);
  const src = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = (src[i + 3] ?? 0) / 255;
    data[i] = Math.round((src[i] ?? 0) * a + 255 * (1 - a));
    data[i + 1] = Math.round((src[i + 1] ?? 0) * a + 255 * (1 - a));
    data[i + 2] = Math.round((src[i + 2] ?? 0) * a + 255 * (1 - a));
    data[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data };
}
