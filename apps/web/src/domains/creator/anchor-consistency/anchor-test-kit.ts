/**
 * 앵커 연구실 시험 도구 — 코드로 만든 가짜 이미지 바이트와 프레임. 운영 코드가 가져오지 않는다.
 *
 * 바이너리 픽스처를 저장소에 두지 않는다. PNG 는 헤더(서명 + IHDR)만 올바르면 크기 검사와 해시 계산에 충분해서,
 * 가로세로와 채울 바이트 수만 정해 만든다. 실제로 디코딩되는 이미지가 필요한 시험은 RGBA 래스터를 직접 만든다.
 */

import { sha256HexPortable } from "../studio-sha256";

import { ANCHOR_ANGLE_IDS, type AnchorAngleId } from "./anchor-capture-spec";
import type { AnchorCapturedFrame, RawAnchorFrame } from "./anchor-capture-session";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

/** 헤더가 올바른 가짜 PNG. 서명 + IHDR(가로·세로) 뒤를 seed 로 채운 totalBytes 바이트다. */
export function fakePngBytes(width: number, height: number, seed = 0, totalBytes = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.max(33, totalBytes));
  PNG_SIGNATURE.forEach((value, index) => { bytes[index] = value; });
  writeUint32(bytes, 8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  writeUint32(bytes, 16, width);
  writeUint32(bytes, 20, height);
  bytes[24] = 8; // bit depth
  bytes[25] = 6; // RGBA
  for (let index = 33; index < bytes.length; index += 1) bytes[index] = (seed * 31 + index * 7) & 0xff;
  return bytes;
}

export function fakePngFile(name: string, width = 768, height = 1152, seed = 0, totalBytes = 64): File {
  return new File([fakePngBytes(width, height, seed, totalBytes)], name, { type: "image/png" });
}

export function fakeRawFrame(width = 768, height = 1152, seed = 0, sourceName?: string): RawAnchorFrame {
  return {
    bytes: fakePngBytes(width, height, seed),
    mimeType: "image/png",
    width,
    height,
    ...(sourceName ? { sourceName } : {}),
  };
}

export function fakeCapturedFrame(
  angleId: AnchorAngleId,
  options: { readonly width?: number; readonly height?: number; readonly seed?: number; readonly origin?: "stage" | "file" } = {},
): AnchorCapturedFrame {
  const width = options.width ?? 768;
  const height = options.height ?? 1152;
  const seed = options.seed ?? ANCHOR_ANGLE_IDS.indexOf(angleId) + 1;
  const bytes = fakePngBytes(width, height, seed);
  return Object.freeze({
    angleId,
    origin: options.origin ?? "file",
    bytes,
    mimeType: "image/png" as const,
    width,
    height,
    byteLength: bytes.byteLength,
    imageSha256: sha256HexPortable(bytes),
  });
}

/** 여섯 각도의 완료 프레임(서로 다른 내용). */
export function fakeFullFrameSet(): readonly AnchorCapturedFrame[] {
  return ANCHOR_ANGLE_IDS.map((id) => fakeCapturedFrame(id));
}
