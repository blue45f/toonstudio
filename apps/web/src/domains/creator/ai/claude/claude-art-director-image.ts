/**
 * AI 아트 디렉터 — 보낼 이미지 준비.
 *
 * 올린 파일을 **이 브라우저 안에서** 검증·축소·인코딩해 Claude에 보낼 base64 한 장으로 만든다.
 * - 형식은 확장자가 아니라 파일 머리의 서명으로 판독하고(PNG·JPEG·WebP), 디코딩 전에 크기·픽셀 수를
 *   먼저 막아 픽셀 폭탄(작은 파일이 거대한 비트맵으로 풀리는 경우)을 피한다.
 * - 세로로 아주 긴 웹툰은 구간으로 나눠 한 번에 한 구간씩 보낸다(글자가 뭉개지지 않게).
 * - 미리보기는 **실제로 보내는 바이트**를 그대로 보여 준다. 그래서 모델이 돌려준 좌표가 미리보기와 어긋나지 않는다.
 * - 알파 채널은 흰 배경에 합성한다. 투명 PNG를 그대로 보내면 모델이 투명 영역을 검게 읽을 수 있다.
 *
 * 브라우저 기능(디코드·캔버스)은 `ArtDirectorImageDeps` 뒤로 숨겨 둬서 순수 로직을 캔버스 없이 시험한다.
 */
import { probeImageBlob } from "../../submission-package/submission-image-probe";

import {
  fitWithinEdge,
  planArtDirectorSegments,
  type ArtDirectorImageInput,
  type ArtDirectorSegment,
} from "./claude-art-director";

export const ART_DIRECTOR_ACCEPTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ART_DIRECTOR_MAX_FILE_BYTES = 12 * 1024 * 1024;
/** 디코드 후 비트맵이 약 256MB(RGBA)를 넘지 않도록 한 이미지의 픽셀 상한을 둔다. */
export const ART_DIRECTOR_MAX_PIXELS = 64_000_000;
/** Anthropic은 이미지 한 장을 5MB까지 받는다. 여유를 두고 4MB 안으로 맞춘다. */
export const ART_DIRECTOR_MAX_ENCODED_BYTES = 4 * 1024 * 1024;

export type ArtDirectorImageErrorCode = "invalid-type" | "too-large" | "too-many-pixels" | "unreadable";

export class ArtDirectorImageError extends Error {
  readonly code: ArtDirectorImageErrorCode;

  constructor(code: ArtDirectorImageErrorCode) {
    super(code);
    this.name = "ArtDirectorImageError";
    this.code = code;
  }
}

export interface ArtDirectorBitmap {
  readonly width: number;
  readonly height: number;
  /** 구현이 그리기에 쓰는 원본(브라우저에서는 `ImageBitmap`). 호출자는 건드리지 않는다. */
  readonly source: unknown;
  close(): void;
}

export type ArtDirectorEncodedType = "image/png" | "image/jpeg";

export interface ArtDirectorImageDeps {
  /** 파일을 디코딩한다. 실패하면 던진다. */
  decode(file: Blob): Promise<ArtDirectorBitmap>;
  /**
   * 비트맵의 세로 `[top, top+height)` 구간을 `target` 크기로 줄여 인코딩한다.
   * 이 브라우저가 그 형식을 만들 수 없으면 null.
   */
  encode(
    bitmap: ArtDirectorBitmap,
    crop: { readonly top: number; readonly height: number },
    target: { readonly width: number; readonly height: number },
    type: ArtDirectorEncodedType,
    quality?: number,
  ): Promise<Blob | null>;
  toBase64(blob: Blob): Promise<string>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
}

/** 크기를 줄이는 순서. 글자 선명도가 중요해 무손실 PNG를 먼저 쓰고, 4MB를 넘을 때만 JPEG로 내려간다. */
const ENCODING_LADDER: ReadonlyArray<{ readonly type: ArtDirectorEncodedType; readonly quality?: number }> = [
  { type: "image/png" },
  { type: "image/jpeg", quality: 0.9 },
  { type: "image/jpeg", quality: 0.75 },
];

export interface ArtDirectorRenderedSegment {
  readonly segment: ArtDirectorSegment;
  /** Claude에 보내는 이미지(좌표 기준 크기 포함). */
  readonly input: ArtDirectorImageInput;
  /** 보내는 바이트와 같은 이미지를 가리키는 미리보기 주소. `dispose()`로 해제한다. */
  readonly previewUrl: string;
  /** 인코딩된 바이트 수(base64 전). */
  readonly bytes: number;
  dispose(): void;
}

export interface ArtDirectorSource {
  /** 원본 픽셀 크기. */
  readonly width: number;
  readonly height: number;
  readonly segments: readonly ArtDirectorSegment[];
  render(index: number): Promise<ArtDirectorRenderedSegment>;
  /** 디코드한 비트맵을 해제한다. 이후 `render`는 실패한다. */
  dispose(): void;
}

export async function prepareArtDirectorSource(
  file: Blob,
  deps: ArtDirectorImageDeps = BROWSER_ART_DIRECTOR_IMAGE_DEPS,
): Promise<ArtDirectorSource> {
  if (file.size <= 0) throw new ArtDirectorImageError("unreadable");
  if (file.size > ART_DIRECTOR_MAX_FILE_BYTES) throw new ArtDirectorImageError("too-large");

  const probed = await probeImageBlob(file);
  if (!probed.ok) {
    throw new ArtDirectorImageError(probed.failure === "unsupported" ? "invalid-type" : "unreadable");
  }
  if (probed.width * probed.height > ART_DIRECTOR_MAX_PIXELS) throw new ArtDirectorImageError("too-many-pixels");

  let bitmap: ArtDirectorBitmap;
  try {
    bitmap = await deps.decode(file);
  } catch {
    throw new ArtDirectorImageError("unreadable");
  }
  const { width, height } = bitmap;
  if (!(width > 0) || !(height > 0)) {
    bitmap.close();
    throw new ArtDirectorImageError("unreadable");
  }
  // 머리 판독값과 디코드 결과가 어긋나는 손상 파일도 같은 상한으로 다시 막는다.
  if (width * height > ART_DIRECTOR_MAX_PIXELS) {
    bitmap.close();
    throw new ArtDirectorImageError("too-many-pixels");
  }

  const segments = planArtDirectorSegments(width, height);
  let disposed = false;

  return {
    width,
    height,
    segments,
    async render(index) {
      const segment = segments[index];
      if (disposed || !segment) throw new ArtDirectorImageError("unreadable");
      const target = fitWithinEdge(width, segment.height);
      for (const step of ENCODING_LADDER) {
        const blob = await deps.encode(
          bitmap,
          { top: segment.top, height: segment.height },
          target,
          step.type,
          step.quality,
        );
        if (disposed) throw new ArtDirectorImageError("unreadable");
        if (!blob) continue;
        if (blob.size > ART_DIRECTOR_MAX_ENCODED_BYTES) continue;
        const data = await deps.toBase64(blob);
        const previewUrl = deps.createObjectUrl(blob);
        let released = false;
        return {
          segment,
          input: { mediaType: step.type, data, width: target.width, height: target.height },
          previewUrl,
          bytes: blob.size,
          dispose() {
            if (released) return;
            released = true;
            deps.revokeObjectUrl(previewUrl);
          },
        };
      }
      throw new ArtDirectorImageError("too-large");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bitmap.close();
    },
  };
}

export type ClipboardImageResult =
  | { readonly ok: true; readonly file: File }
  | { readonly ok: false; readonly reason: "unsupported" | "denied" | "empty" };

/**
 * 클립보드의 이미지를 읽는다(버튼으로 붙여 넣기용 — 터치 기기엔 Ctrl+V가 없다).
 * 브라우저가 권한을 묻거나 막을 수 있어, 실패는 예외가 아니라 이유로 돌려주고 호출자가 안내한다.
 */
export async function readClipboardImage(
  clipboard: Pick<Clipboard, "read"> | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
): Promise<ClipboardImageResult> {
  if (!clipboard || typeof clipboard.read !== "function") return { ok: false, reason: "unsupported" };
  let items: ClipboardItems;
  try {
    items = await clipboard.read();
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    return { ok: false, reason: name === "NotFoundError" || name === "DataError" ? "empty" : "denied" };
  }
  for (const item of items) {
    const type = ART_DIRECTOR_ACCEPTED_MIME_TYPES.find((candidate) => item.types.includes(candidate));
    if (!type) continue;
    try {
      const blob = await item.getType(type);
      if (blob.size > 0) return { ok: true, file: new File([blob], `clipboard.${type.slice("image/".length)}`, { type }) };
    } catch {
      // 이 항목은 읽을 수 없다. 다음 항목을 본다.
    }
  }
  return { ok: false, reason: "empty" };
}

/* ------------------------------------------------------------------ 브라우저 구현 */

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function decodeBrowserBitmap(file: Blob): Promise<ArtDirectorBitmap> {
  if (typeof createImageBitmap !== "function") throw new Error("createImageBitmap unavailable");
  const bitmap = await createImageBitmap(file);
  return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => { bitmap.close(); } };
}

async function encodeBrowserCrop(
  bitmap: ArtDirectorBitmap,
  crop: { readonly top: number; readonly height: number },
  target: { readonly width: number; readonly height: number },
  type: ArtDirectorEncodedType,
  quality?: number,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap.source as CanvasImageSource,
      0,
      crop.top,
      bitmap.width,
      crop.height,
      0,
      0,
      target.width,
      target.height,
    );
    return await canvasBlob(canvas, type, quality);
  } finally {
    // 큰 캔버스는 참조가 사라져도 GC까지 메모리를 쥐고 있어 바로 비운다.
    canvas.width = 0;
    canvas.height = 0;
  }
}

export const BROWSER_ART_DIRECTOR_IMAGE_DEPS: ArtDirectorImageDeps = Object.freeze({
  decode: decodeBrowserBitmap,
  encode: encodeBrowserCrop,
  toBase64: blobToBase64,
  createObjectUrl: (blob: Blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url: string) => { URL.revokeObjectURL(url); },
});
