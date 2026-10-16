/**
 * 이미지 굽기 공통 규칙 — 오류 코드, 양보·취소 확인, 면 만들기와 PNG 인코딩, Blob → data URL.
 *
 * 재배열(panel-reflow-render)과 카드뉴스(panel-card-render)가 같은 규칙을 쓴다: 브라우저가 만들 수 없는 크기는 그리기 전에 거절하고,
 * 인코딩 뒤에는 어떤 경우에도 면을 해제하며, 취소 신호는 이미지 하나가 끝날 때마다 확인한다.
 */

import { PANEL_SURFACE_MAX_PIXELS, PANEL_SURFACE_MAX_SIDE } from "./panel-canvas-adapter";

import type { PanelCanvasDeps, PanelRenderSurface } from "./panel-canvas-adapter";

export type PanelRenderErrorCode = "cancelled" | "surface-unavailable" | "encode-failed" | "too-large-for-studio";

const RENDER_ERROR_MESSAGES: Readonly<Record<PanelRenderErrorCode, string>> = Object.freeze({
  cancelled: "이미지 만들기를 취소했어요.",
  "surface-unavailable": "이 브라우저에서 만들 수 없는 크기의 이미지가 있어요.",
  "encode-failed": "이미지를 PNG 로 저장하지 못했어요.",
  "too-large-for-studio": "결과 이미지가 Studio 문서에 넣기엔 너무 커요.",
});

export class PanelRenderError extends Error {
  readonly code: PanelRenderErrorCode;
  /** 문제가 된 컷·카드·페이지 번호(1부터). 알 수 없으면 0. */
  readonly subject: number;

  constructor(code: PanelRenderErrorCode, subject = 0, options?: { readonly cause?: unknown }) {
    super(RENDER_ERROR_MESSAGES[code], options);
    this.name = "PanelRenderError";
    this.code = code;
    this.subject = subject;
  }
}

export function defaultRenderYield(): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

export function throwIfRenderAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PanelRenderError("cancelled");
}

export function canDrawSurface(width: number, height: number): boolean {
  return width <= PANEL_SURFACE_MAX_SIDE && height <= PANEL_SURFACE_MAX_SIDE && width * height <= PANEL_SURFACE_MAX_PIXELS;
}

export function openRenderSurface(deps: PanelCanvasDeps, width: number, height: number, subject: number): PanelRenderSurface {
  const surface = canDrawSurface(width, height) ? deps.createSurface(width, height) : null;
  if (!surface) throw new PanelRenderError("surface-unavailable", subject);
  return surface;
}

/** 면을 PNG 로 굳히고(성공하든 실패하든) 해제한다. */
export async function encodeRenderSurface(surface: PanelRenderSurface, subject: number): Promise<Blob> {
  try {
    const blob = await surface.toPngBlob();
    if (blob.size < 1) throw new Error("빈 PNG");
    return blob;
  } catch (cause) {
    throw new PanelRenderError("encode-failed", subject, { cause });
  } finally {
    surface.dispose();
  }
}

/** Blob 을 data URL 로 바꾼다(Studio 문서의 이미지 src 형식). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => { reject(new PanelRenderError("encode-failed", 0, { cause: reader.error })); };
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/png;base64,")) resolve(reader.result);
      else reject(new PanelRenderError("encode-failed"));
    };
    reader.readAsDataURL(blob);
  });
}
