/**
 * 앵커 이미지 입출력 — 브라우저 안에서 이미지를 분석용 RGBA 래스터로 풀고, 바이트 해시를 계산한다.
 *
 * 상태: current. 이 모듈이 앵커 연구실에서 DOM(createImageBitmap·캔버스)에 닿는 유일한 곳이다. 특징 계산(anchor-image-features)은
 * 래스터만 받는 순수 코드라서 DOM 없이 시험하고, 이 모듈은 전역 객체를 바꿔 끼워 시험한다.
 *
 * 규칙
 * - 이미지는 이 기기 안에서만 푼다. 네트워크를 쓰지 않는다.
 * - 풀기 전에 긴 변을 `ANCHOR_DECODE_MAX_EDGE` 로 줄인다. 4096×4096 원본을 통째로 `getImageData` 하면 64MB 가 되어 탭이
 *   멈출 수 있다. 줄인 래스터는 분석(긴 변 256px)에 쓰기에 충분하다.
 * - 풀기에 실패하면 `AnchorCaptureError("decode-failed")`, 취소하면 `AnchorCaptureError("cancelled")` 로 끝난다.
 */

import { sha256HexPortable } from "../studio-sha256";

import { AnchorCaptureError } from "./anchor-capture-session";
import type { AnchorRaster } from "./anchor-raster";

/** 분석 전에 이 긴 변으로 줄여서 푼다. 분석 래스터(256px)의 4배라 면적 평균 축소에 쓸 정보가 남는다. */
export const ANCHOR_DECODE_MAX_EDGE = 1024;

export interface AnchorDecodeInput {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  /** 헤더에서 읽은 원래 크기. 줄여서 풀 크기를 정하는 데 쓴다. */
  readonly width: number;
  readonly height: number;
}

export type AnchorRasterDecoder = (input: AnchorDecodeInput, signal: AbortSignal) => Promise<AnchorRaster>;

export interface AnchorDecodeSize {
  readonly width: number;
  readonly height: number;
  /** true 면 원래보다 줄여서 푼다. */
  readonly resized: boolean;
}

/** 긴 변이 maxEdge 를 넘으면 비율을 지켜 줄인 크기, 아니면 원래 크기. */
export function anchorDecodeSize(width: number, height: number, maxEdge: number = ANCHOR_DECODE_MAX_EDGE): AnchorDecodeSize {
  const longEdge = Math.max(width, height);
  if (!(longEdge > maxEdge)) return { width, height, resized: false };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

interface RasterContext {
  drawImage(image: ImageBitmap, dx: number, dy: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
}

function createRasterContext(width: number, height: number): RasterContext {
  if (typeof OffscreenCanvas === "function") {
    const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
    if (context) return context;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) return context;
  }
  throw new AnchorCaptureError("decode-failed");
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new AnchorCaptureError("cancelled");
}

/** 브라우저의 이미지 디코더로 푼다. 시험에서는 이 함수 대신 가짜 디코더를 주입한다. */
export const decodeAnchorRasterInBrowser: AnchorRasterDecoder = async (input, signal) => {
  throwIfCancelled(signal);
  if (typeof createImageBitmap !== "function") throw new AnchorCaptureError("decode-failed");
  const target = anchorDecodeSize(input.width, input.height);
  const blob = new Blob([input.bytes.slice()], { type: input.mimeType });
  let bitmap: ImageBitmap;
  try {
    bitmap = target.resized
      ? await createImageBitmap(blob, { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" })
      : await createImageBitmap(blob);
  } catch (cause) {
    throw new AnchorCaptureError("decode-failed", { cause });
  }
  try {
    throwIfCancelled(signal);
    const { width, height } = bitmap;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw new AnchorCaptureError("decode-failed");
    }
    const context = createRasterContext(width, height);
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  } catch (cause) {
    if (cause instanceof AnchorCaptureError) throw cause;
    throw new AnchorCaptureError("decode-failed", { cause });
  } finally {
    bitmap.close();
  }
};

/**
 * 바이트의 SHA-256(소문자 hex). 브라우저 기본 구현이 있으면 그것을 쓰고(큰 파일에서 빠르고 화면을 덜 막는다),
 * 없거나 실패하면 순수 JS 구현으로 같은 값을 만든다.
 */
export async function hashAnchorBytes(bytes: Uint8Array): Promise<string> {
  const subtle = typeof crypto === "undefined" ? undefined : crypto.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest("SHA-256", bytes.slice());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // 기본 구현이 막힌 환경(비보안 컨텍스트 등)에서는 아래 순수 구현이 같은 값을 만든다.
    }
  }
  return sha256HexPortable(bytes);
}

/** 내려받기용 Blob 을 만들어 브라우저 다운로드를 시작한다. 객체 URL 은 잠시 뒤 해제한다. */
export function startAnchorDownload(blob: Blob, fileName: string): void {
  if (typeof document === "undefined" || !document.body || typeof URL.createObjectURL !== "function") {
    throw new Error("이 환경에서는 파일 내려받기를 시작할 수 없어요. 다른 브라우저에서 다시 시도해 주세요.");
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // 바로 해제하면 일부 브라우저에서 0바이트 파일이 내려와 잠시 둔다.
    globalThis.setTimeout(() => { URL.revokeObjectURL(url); }, 30_000);
  }
}
