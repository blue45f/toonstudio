/**
 * 가져올 원고 이미지를 이 브라우저 안에서만 읽는다 — 형식·크기 검사, 디코딩, 원본 SHA-256, RGBA 읽기.
 *
 * 외부로 나가는 것은 없다. 파일 바이트는 이 모듈 안에서 헤더 검사와 해시 계산에만 쓰이고, 디코딩된 이미지는
 * `PanelDrawable` 로만 다룬다. 한도는 디코딩 전에 헤더 크기로 먼저 검사해 큰 이미지를 풀다가 탭이 죽는 일을 막는다.
 */

import { StudioUploadImageSafetyError, parseStudioUploadImageDimensions } from "../studio-upload-image-safety";

import { BROWSER_PANEL_CANVAS_DEPS, type PanelCanvasDeps, type PanelDrawable } from "./panel-canvas-adapter";
import { computeSourceSha256, type PanelImportSourceReceipt } from "./panel-import-rights";

import type { PanelDetectRaster } from "./panel-detect-types";

export const PANEL_IMPORT_LIMITS = Object.freeze({
  /** 스캔본은 일반 업로드(12MB)보다 크다. 그래도 한 장이 이 한도를 넘으면 나눠서 올리게 한다. */
  maxFileBytes: 48 * 1024 * 1024,
  /** 디코딩 픽셀 상한: 기기 메모리에 맞춰 고른다(RGBA 사본 한 벌 ≈ 픽셀 × 4바이트). */
  desktopPixels: 50_000_000,
  midPixels: 32_000_000,
  mobilePixels: 16_000_000,
  /** RGBA 를 읽을 때 한 번에 가져오는 픽셀 수(메모리 피크와 화면 멈춤을 줄인다). */
  bandPixels: 8_000_000,
} as const);

export type PanelSourceErrorCode =
  | "empty"
  | "file-too-large"
  | "unsupported-format"
  | "too-many-pixels"
  | "decode-failed"
  | "cancelled";

const SOURCE_ERROR_MESSAGES: Readonly<Record<PanelSourceErrorCode, string>> = Object.freeze({
  empty: "비어 있는 파일이에요.",
  "file-too-large": "파일이 48MB 를 넘어요. 여러 장으로 나눠 올려 주세요.",
  "unsupported-format": "PNG, JPG, WebP 이미지만 읽을 수 있어요.",
  "too-many-pixels": "이미지 해상도가 이 기기에서 안전하게 처리할 수 있는 한도를 넘어요.",
  "decode-failed": "이미지를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.",
  cancelled: "이미지 읽기를 취소했어요.",
});

export class PanelSourceError extends Error {
  readonly code: PanelSourceErrorCode;
  /** 한도 초과일 때 화면 문구에 끼울 수치(메가픽셀·실제 픽셀). */
  readonly detail: Readonly<Record<string, number>>;

  constructor(code: PanelSourceErrorCode, detail: Readonly<Record<string, number>> = {}, options?: { readonly cause?: unknown }) {
    super(SOURCE_ERROR_MESSAGES[code], options);
    this.name = "PanelSourceError";
    this.code = code;
    this.detail = detail;
  }
}

export interface PanelSourceEnvironment {
  readonly coarsePointer: boolean;
  readonly deviceMemoryGb: number | undefined;
}

/** Studio 업로드와 같은 "작은 기기" 판정(터치 기기·메모리 4GB 이하)을 따르되, 상한은 스캔 원고에 맞춰 더 크게 잡는다. */
export function panelImportPixelLimit(environment: PanelSourceEnvironment): number {
  if (environment.coarsePointer || (environment.deviceMemoryGb !== undefined && environment.deviceMemoryGb <= 4)) {
    return PANEL_IMPORT_LIMITS.mobilePixels;
  }
  if (environment.deviceMemoryGb !== undefined && environment.deviceMemoryGb < 8) return PANEL_IMPORT_LIMITS.midPixels;
  return PANEL_IMPORT_LIMITS.desktopPixels;
}

export function readPanelSourceEnvironment(): PanelSourceEnvironment {
  // deviceMemory 는 표준 DOM 타입에 없는 Chromium 계열 속성이라 있을 때만 숫자로 읽는다.
  const memory: unknown = typeof navigator !== "undefined" && "deviceMemory" in navigator ? navigator.deviceMemory : undefined;
  return {
    coarsePointer: globalThis.matchMedia?.("(pointer: coarse)").matches ?? false,
    deviceMemoryGb: typeof memory === "number" ? memory : undefined,
  };
}

export interface PanelSourceImage {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  /** 원본 파일 바이트의 SHA-256(소문자 hex). */
  readonly sha256: string;
  readonly drawable: PanelDrawable;
  /** 이미지 전체를 RGBA 래스터로 읽는다. 띠 단위로 읽으며 사이마다 화면에 양보하고 취소를 확인한다. */
  readRaster(signal?: AbortSignal): Promise<PanelDetectRaster>;
  /** 원본 영수증(권리 기록에 들어가는 값). */
  receipt(): PanelImportSourceReceipt;
  dispose(): void;
}

export interface LoadPanelSourceOptions {
  readonly signal?: AbortSignal;
  readonly deps?: PanelCanvasDeps;
  readonly environment?: PanelSourceEnvironment;
  /** 이벤트 루프에 양보한다. 테스트에서 바꿔 쓴다. */
  readonly yieldNow?: () => Promise<void>;
}

function defaultYieldNow(): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PanelSourceError("cancelled");
}

const FORMAT_MIME: Readonly<Record<string, string>> = Object.freeze({
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
});

/** 허용 형식(PNG·JPEG·WebP)인지 헤더로 확인하고 가로세로를 돌려준다. 디코딩하지 않는다. */
export function inspectPanelSourceHeader(
  buffer: ArrayBuffer,
  declaredType: string,
): { readonly width: number; readonly height: number; readonly mimeType: string } {
  let parsed;
  try {
    parsed = parseStudioUploadImageDimensions(buffer);
  } catch (error) {
    if (error instanceof StudioUploadImageSafetyError) throw new PanelSourceError("unsupported-format", {}, { cause: error });
    throw error;
  }
  const mimeType = FORMAT_MIME[parsed.format] ?? "application/octet-stream";
  const declared = declaredType.trim().toLowerCase();
  if (declared !== "" && declared !== mimeType) throw new PanelSourceError("unsupported-format");
  return { width: parsed.width, height: parsed.height, mimeType };
}

export async function loadPanelSourceImage(file: File, options: LoadPanelSourceOptions = {}): Promise<PanelSourceImage> {
  const deps = options.deps ?? BROWSER_PANEL_CANVAS_DEPS;
  const yieldNow = options.yieldNow ?? defaultYieldNow;
  throwIfAborted(options.signal);
  if (file.size < 1) throw new PanelSourceError("empty");
  if (file.size > PANEL_IMPORT_LIMITS.maxFileBytes) throw new PanelSourceError("file-too-large");

  const buffer = await file.arrayBuffer();
  throwIfAborted(options.signal);
  const header = inspectPanelSourceHeader(buffer, file.type);
  const pixelLimit = panelImportPixelLimit(options.environment ?? readPanelSourceEnvironment());
  const headerPixels = header.width * header.height;
  if (headerPixels > pixelLimit) {
    throw new PanelSourceError("too-many-pixels", {
      megapixels: Math.floor(pixelLimit / 1_000_000),
      pixels: headerPixels,
    });
  }
  const sha256 = await computeSourceSha256(buffer);
  throwIfAborted(options.signal);

  let drawable: PanelDrawable;
  try {
    drawable = await deps.decode(file);
  } catch (error) {
    throw new PanelSourceError("decode-failed", {}, { cause: error });
  }
  if (options.signal?.aborted) {
    drawable.close();
    throw new PanelSourceError("cancelled");
  }
  // 헤더 크기와 실제 디코딩 크기가 다르면(손상·위조) 그대로 쓰지 않는다. 다만 휴대폰으로 찍은 JPEG 처럼 EXIF 방향이
  // 90°/270°이면 브라우저가 회전해서 풀어 가로세로가 맞바뀌어 나오므로, 맞바꾼 크기는 같은 이미지로 본다(픽셀 수가 같아
  // 위의 한도 검사도 그대로 유효하다). 결과 크기와 영수증은 회전을 반영한 화면 크기를 쓴다.
  const sameSize = drawable.width === header.width && drawable.height === header.height;
  const rotatedSize = drawable.width === header.height && drawable.height === header.width;
  if (!sameSize && !rotatedSize) {
    drawable.close();
    throw new PanelSourceError("decode-failed");
  }

  const rowsPerBand = Math.max(1, Math.floor(PANEL_IMPORT_LIMITS.bandPixels / drawable.width));
  let disposed = false;
  const source: PanelSourceImage = {
    fileName: file.name,
    mimeType: header.mimeType,
    sizeBytes: file.size,
    width: drawable.width,
    height: drawable.height,
    sha256,
    drawable,
    async readRaster(signal) {
      if (disposed) throw new PanelSourceError("decode-failed");
      const out = new Uint8ClampedArray(drawable.width * drawable.height * 4);
      for (let y = 0; y < drawable.height; y += rowsPerBand) {
        throwIfAborted(signal);
        const rows = Math.min(rowsPerBand, drawable.height - y);
        out.set(drawable.readRgba(y, rows), y * drawable.width * 4);
        await yieldNow();
      }
      throwIfAborted(signal);
      return { width: drawable.width, height: drawable.height, data: out };
    },
    receipt() {
      return {
        fileName: file.name,
        mimeType: header.mimeType,
        sizeBytes: file.size,
        width: drawable.width,
        height: drawable.height,
        sha256,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      drawable.close();
    },
  };
  return source;
}
