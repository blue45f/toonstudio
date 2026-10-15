/**
 * 컷 가져오기용 캔버스 어댑터 — 브라우저 이미지 디코딩과 캔버스 그리기를 작은 인터페이스 뒤로 숨긴다.
 *
 * 화면과 계획 모듈은 `PanelDrawable`(읽기)과 `PanelRenderSurface`(쓰기)만 안다. 그래서 컷 감지·재배열·카드 슬라이스
 * 로직은 캔버스 없이 시험할 수 있고, 브라우저 전용 코드는 이 파일 하나에 모인다.
 *
 * 모든 처리는 이 브라우저 안에서 끝난다 — 네트워크를 쓰지 않는다(panel-detect-local-only.test.ts 가 소스로 검사한다).
 */

import { canvasToBlob } from "../export/studio-export";

import type { PanelRect } from "./panel-detect-types";

/** 디코딩된 원본 이미지. 읽기 전용이며 쓰고 나면 close() 로 메모리를 돌려준다. */
export interface PanelDrawable {
  readonly width: number;
  readonly height: number;
  /** 그리기에 쓰는 브라우저 원본(ImageBitmap/HTMLImageElement). 브라우저 어댑터가 아닌 구현은 null. */
  readonly canvasImage: CanvasImageSource | null;
  /** y0 행부터 rows 행의 RGBA 픽셀(가로 width). 길이는 width*rows*4. */
  readRgba(y0: number, rows: number): Uint8ClampedArray;
  close(): void;
}

/** 결과 이미지를 그리는 면. 한 번 쓰고 PNG 로 굳힌 뒤 dispose() 한다. */
export interface PanelRenderSurface {
  readonly width: number;
  readonly height: number;
  /** CSS 색(#rrggbb) 또는 "transparent" 로 면 전체를 채운다. */
  fill(color: string): void;
  /** source 의 from 영역을 이 면의 to 영역에 맞춰 그린다(고품질 보간). */
  drawSource(source: PanelDrawable, from: PanelRect, to: PanelRect): void;
  toPngBlob(): Promise<Blob>;
  dispose(): void;
}

export interface PanelCanvasDeps {
  /** 로컬 파일을 디코딩한다. 실패하면 던진다. */
  decode(file: Blob): Promise<PanelDrawable>;
  /** 새 그리기 면. 만들 수 없는 크기면 null. */
  createSurface(width: number, height: number): PanelRenderSurface | null;
}

/** 브라우저 캔버스 한 변 상한(export/studio-export 의 MAX_CANVAS_DIM 과 같은 보수값). */
export const PANEL_SURFACE_MAX_SIDE = 16_384;
/** 한 면의 픽셀 상한(약 64MB RGBA). iOS Safari 의 캔버스 면적 한도보다 보수적으로 둔다. */
export const PANEL_SURFACE_MAX_PIXELS = 16_777_216;

function context2d(canvas: HTMLCanvasElement, readback: boolean): CanvasRenderingContext2D | null {
  return canvas.getContext("2d", readback ? { willReadFrequently: true } : undefined);
}

class BrowserDrawable implements PanelDrawable {
  readonly width: number;
  readonly height: number;
  readonly canvasImage: CanvasImageSource;
  private readonly release: () => void;
  private band: HTMLCanvasElement | null = null;

  constructor(image: CanvasImageSource, width: number, height: number, release: () => void) {
    this.canvasImage = image;
    this.width = width;
    this.height = height;
    this.release = release;
  }

  readRgba(y0: number, rows: number): Uint8ClampedArray {
    if (!Number.isInteger(y0) || !Number.isInteger(rows) || y0 < 0 || rows < 1 || y0 + rows > this.height) {
      throw new RangeError("읽을 행 범위가 이미지 밖이에요.");
    }
    const canvas = this.band ?? document.createElement("canvas");
    this.band = canvas;
    canvas.width = this.width;
    canvas.height = rows;
    const context = context2d(canvas, true);
    if (!context) throw new Error("이 브라우저에서는 이미지 픽셀을 읽을 수 없어요.");
    context.clearRect(0, 0, this.width, rows);
    context.drawImage(this.canvasImage, 0, y0, this.width, rows, 0, 0, this.width, rows);
    return context.getImageData(0, 0, this.width, rows).data;
  }

  close(): void {
    if (this.band) {
      this.band.width = 0;
      this.band.height = 0;
      this.band = null;
    }
    this.release();
  }
}

async function decodeWithBitmap(file: Blob): Promise<PanelDrawable> {
  const bitmap = await createImageBitmap(file);
  return new BrowserDrawable(bitmap, bitmap.width, bitmap.height, () => { bitmap.close(); });
}

function decodeWithImageElement(file: Blob): Promise<PanelDrawable> {
  return new Promise<PanelDrawable>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const release = (): void => { URL.revokeObjectURL(url); };
    image.onload = () => {
      resolve(new BrowserDrawable(image, image.naturalWidth, image.naturalHeight, release));
    };
    image.onerror = () => {
      release();
      reject(new Error("이미지를 읽지 못했어요."));
    };
    image.src = url;
  });
}

/** 브라우저 디코더. createImageBitmap 이 없는 환경에서만 HTMLImageElement 로 대신한다. */
export function decodeBrowserDrawable(file: Blob): Promise<PanelDrawable> {
  return typeof createImageBitmap === "function" ? decodeWithBitmap(file) : decodeWithImageElement(file);
}

class BrowserSurface implements PanelRenderSurface {
  readonly width: number;
  readonly height: number;
  private canvas: HTMLCanvasElement | null;
  private readonly context: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number) {
    this.canvas = canvas;
    this.context = context;
    this.width = width;
    this.height = height;
  }

  fill(color: string): void {
    if (color === "transparent") {
      this.context.clearRect(0, 0, this.width, this.height);
      return;
    }
    this.context.fillStyle = color;
    this.context.fillRect(0, 0, this.width, this.height);
  }

  drawSource(source: PanelDrawable, from: PanelRect, to: PanelRect): void {
    if (!source.canvasImage) throw new Error("그릴 수 있는 원본 이미지가 아니에요.");
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
    this.context.drawImage(source.canvasImage, from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height);
  }

  toPngBlob(): Promise<Blob> {
    if (!this.canvas) return Promise.reject(new Error("이미 해제된 그리기 면이에요."));
    return canvasToBlob(this.canvas, "image/png");
  }

  dispose(): void {
    if (!this.canvas) return;
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.canvas = null;
  }
}

export function createBrowserSurface(width: number, height: number): PanelRenderSurface | null {
  if (
    !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > PANEL_SURFACE_MAX_SIDE || height > PANEL_SURFACE_MAX_SIDE
    || width * height > PANEL_SURFACE_MAX_PIXELS
    || typeof document === "undefined"
  ) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = context2d(canvas, false);
  return context ? new BrowserSurface(canvas, context, width, height) : null;
}

export const BROWSER_PANEL_CANVAS_DEPS: PanelCanvasDeps = Object.freeze({
  decode: decodeBrowserDrawable,
  createSurface: createBrowserSurface,
});
