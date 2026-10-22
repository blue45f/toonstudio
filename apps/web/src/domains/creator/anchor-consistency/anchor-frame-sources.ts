/**
 * 앵커 프레임 출처 — 사용자가 끌어다 놓은 파일을 세션이 읽을 수 있는 프레임으로 바꾼다.
 *
 * 파일은 이 브라우저 안에서만 읽는다. 형식·크기는 디코딩 전에 헤더로 먼저 검사해, 큰 이미지를 풀다가 탭이 멈추는 일을
 * 막는다(업로드 이미지 안전 모듈 `studio-upload-image-safety` 의 헤더 파서를 그대로 쓴다). 네트워크를 쓰지 않는다.
 */

import { StudioUploadImageSafetyError, parseStudioUploadImageDimensions } from "../studio-upload-image-safety";

import { ANCHOR_LIMITS, type AnchorAngleId } from "./anchor-capture-spec";
import {
  AnchorCaptureError,
  type AnchorCaptureContext,
  type AnchorFrameSource,
  type RawAnchorFrame,
} from "./anchor-capture-session";

const MIME_BY_FORMAT = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

/** 파일 하나를 읽어 날 프레임으로 만든다. 문제가 있으면 AnchorCaptureError 로 이유를 알린다. */
export async function readAnchorImageFile(file: Blob & { readonly name?: string }, signal: AbortSignal): Promise<RawAnchorFrame> {
  if (signal.aborted) throw new AnchorCaptureError("cancelled");
  if (file.size < 1) throw new AnchorCaptureError("file-empty");
  if (file.size > ANCHOR_LIMITS.maxImageBytes) {
    throw new AnchorCaptureError("file-too-large", { params: { bytes: file.size, max: ANCHOR_LIMITS.maxImageBytes } });
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (cause) {
    throw new AnchorCaptureError("decode-failed", { cause });
  }
  if (signal.aborted) throw new AnchorCaptureError("cancelled");
  let header: ReturnType<typeof parseStudioUploadImageDimensions>;
  try {
    header = parseStudioUploadImageDimensions(buffer);
  } catch (cause) {
    if (cause instanceof StudioUploadImageSafetyError) throw new AnchorCaptureError("unsupported-format", { cause });
    throw cause;
  }
  const mimeType = MIME_BY_FORMAT[header.format];
  const declared = file.type.trim().toLowerCase();
  if (declared !== "" && declared !== mimeType) throw new AnchorCaptureError("unsupported-format");
  return {
    bytes: new Uint8Array(buffer),
    mimeType,
    width: header.width,
    height: header.height,
    ...(file.name ? { sourceName: file.name } : {}),
  };
}

export interface AnchorFileAssignment {
  readonly angleId: AnchorAngleId;
  readonly file: File;
}

/** 각도마다 정해 둔 파일을 읽는 출처. 배정에 없는 각도를 요청하면 source-unavailable 이다. */
export function createFileFrameSource(assignments: readonly AnchorFileAssignment[]): AnchorFrameSource {
  const byAngle = new Map<AnchorAngleId, File>(assignments.map((item) => [item.angleId, item.file] as const));
  return {
    kind: "file",
    capture(angleId: AnchorAngleId, context: AnchorCaptureContext): Promise<RawAnchorFrame> {
      const file = byAngle.get(angleId);
      if (!file) return Promise.reject(new AnchorCaptureError("source-unavailable"));
      return readAnchorImageFile(file, context.signal);
    },
  };
}
