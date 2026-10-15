/**
 * 투고 패키지 — 이미지 머리 판독.
 *
 * PNG·JPEG·WebP 파일의 맨 앞 몇 바이트(서명과 크기 필드)만 읽어 형식과 가로·세로를 알아낸다. 이미지를
 * 디코딩하지 않으므로 수십 MB 짜리 긴 세로 이미지도 메모리를 거의 쓰지 않고 판독하며, 형식은 확장자가
 * 아니라 파일 서명으로 정한다. DOM·캔버스에 의존하지 않아 node 단위 테스트가 가능하다.
 */
import type { SubmissionImageMime, SubmissionPageFile, SubmissionProbeFailure } from "./submission-package-types";

export type ImageProbeResult =
  | { readonly ok: true; readonly mime: SubmissionImageMime; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly reason: "unsupported" | "truncated" | "corrupt" };

const MAX_DIMENSION = 0x7fff_ffff;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let output = "";
  for (let index = 0; index < length; index += 1) output += String.fromCharCode(bytes[offset + index] ?? 0);
  return output;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1_00_00_00
    + ((bytes[offset + 1] ?? 0) << 16)
    + ((bytes[offset + 2] ?? 0) << 8)
    + (bytes[offset + 3] ?? 0)
  );
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function dimensions(mime: SubmissionImageMime, width: number, height: number): ImageProbeResult {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return { ok: false, reason: "corrupt" };
  if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { ok: false, reason: "corrupt" };
  }
  return { ok: true, mime, width, height };
}

function probePng(bytes: Uint8Array): ImageProbeResult {
  if (bytes.length < 24) return { ok: false, reason: "truncated" };
  if (ascii(bytes, 12, 4) !== "IHDR") return { ok: false, reason: "corrupt" };
  return dimensions("image/png", u32be(bytes, 16), u32be(bytes, 20));
}

/** SOF0~SOF15 중 크기 정보가 있는 표식(DHT=C4, JPG=C8, DAC=CC 제외). */
function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function probeJpeg(bytes: Uint8Array): ImageProbeResult {
  let position = 2;
  while (position < bytes.length) {
    if (bytes[position] !== 0xff) return { ok: false, reason: "corrupt" };
    // 표식 앞의 채움 바이트(FF)는 건너뛴다.
    while (position < bytes.length && bytes[position] === 0xff) position += 1;
    if (position >= bytes.length) break;
    const marker = bytes[position] ?? 0;
    position += 1;
    if (marker === 0x00) return { ok: false, reason: "corrupt" };
    // 길이 필드가 없는 표식: SOI·EOI·RSTn·TEM.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return { ok: false, reason: "corrupt" };
    if (position + 2 > bytes.length) break;
    const length = u16be(bytes, position);
    if (length < 2) return { ok: false, reason: "corrupt" };
    if (isJpegStartOfFrame(marker)) {
      if (length < 8) return { ok: false, reason: "corrupt" };
      if (position + 7 > bytes.length) break;
      return dimensions("image/jpeg", u16be(bytes, position + 5), u16be(bytes, position + 3));
    }
    position += length;
  }
  return { ok: false, reason: "truncated" };
}

function probeWebp(bytes: Uint8Array): ImageProbeResult {
  if (bytes.length < 20) return { ok: false, reason: "truncated" };
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 ") {
    if (bytes.length < 30) return { ok: false, reason: "truncated" };
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return { ok: false, reason: "corrupt" };
    return dimensions("image/webp", u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (bytes.length < 25) return { ok: false, reason: "truncated" };
    if (bytes[20] !== 0x2f) return { ok: false, reason: "corrupt" };
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    const width = (b0 | ((b1 & 0x3f) << 8)) + 1;
    const height = ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1;
    return dimensions("image/webp", width, height);
  }
  if (chunk === "VP8X") {
    if (bytes.length < 30) return { ok: false, reason: "truncated" };
    return dimensions("image/webp", u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  }
  return { ok: false, reason: "corrupt" };
}

/** 파일 머리 바이트에서 형식과 크기를 읽는다. 부족하면 `truncated` 로 더 읽어야 함을 알린다. */
export function probeImageHeader(bytes: Uint8Array): ImageProbeResult {
  if (startsWith(bytes, PNG_SIGNATURE)) return probePng(bytes);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return probeJpeg(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return probeWebp(bytes);
  // 서명이 아직 다 도착하지 않았을 수 있다(매우 짧은 입력). 12바이트를 넘기고도 모르면 지원하지 않는 형식이다.
  return { ok: false, reason: bytes.length < 12 ? "truncated" : "unsupported" };
}

/** 머리를 점점 크게 읽는다: 대부분은 첫 4KB 에서 끝나고, EXIF·ICC 가 큰 JPEG 만 더 읽는다. */
const HEAD_READ_STEPS = Object.freeze([4_096, 65_536, 1_048_576]);

function failureOf(reason: "unsupported" | "truncated" | "corrupt"): SubmissionProbeFailure {
  return reason === "unsupported" ? "unsupported" : "unreadable";
}

export type BlobProbeResult =
  | { readonly ok: true; readonly mime: SubmissionImageMime; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly failure: SubmissionProbeFailure };

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("이미지 판독을 취소했어요.", "AbortError");
  }
}

export async function probeImageBlob(blob: Blob, signal?: AbortSignal): Promise<BlobProbeResult> {
  if (blob.size === 0) return { ok: false, failure: "empty" };
  let last: ImageProbeResult = { ok: false, reason: "truncated" };
  for (const step of HEAD_READ_STEPS) {
    throwIfAborted(signal);
    const length = Math.min(step, blob.size);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await blob.slice(0, length).arrayBuffer());
    } catch {
      return { ok: false, failure: "unreadable" };
    }
    throwIfAborted(signal);
    last = probeImageHeader(bytes);
    if (last.ok) return last;
    if (last.reason !== "truncated" || length >= blob.size) break;
  }
  if (last.ok) return last;
  return { ok: false, failure: failureOf(last.reason) };
}

let pageFileCounter = 0;

/** 목록 안에서만 유일하면 되는 로컬 id. 저장하지 않으므로 충돌 가능성은 한 세션 안에서만 따진다. */
export function nextSubmissionPageId(): string {
  pageFileCounter += 1;
  return `page-${pageFileCounter.toString(36)}`;
}

/** 파일 하나를 판독해 점검에 쓸 수 있는 메타데이터를 만든다. 판독 실패는 예외가 아니라 `failure` 로 담는다. */
export async function toSubmissionPageFile(
  file: File,
  options: { readonly id?: string; readonly signal?: AbortSignal } = {},
): Promise<SubmissionPageFile> {
  const probed = await probeImageBlob(file, options.signal);
  const base = { id: options.id ?? nextSubmissionPageId(), name: file.name, size: file.size, blob: file } as const;
  return probed.ok
    ? { ...base, mime: probed.mime, width: probed.width, height: probed.height, failure: null }
    : { ...base, mime: null, width: null, height: null, failure: probed.failure };
}
