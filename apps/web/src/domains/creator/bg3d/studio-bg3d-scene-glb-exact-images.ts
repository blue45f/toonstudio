/** alpha=0의 RGB도 Canvas 합성 없이 PNG와 최종 GLB에 보존한다. GPU·원본 texture는 소유하지 않는다. */
import { unzlibSync, zlibSync } from "fflate";
import type { Texture } from "three";
import type { GLTFExporterPlugin } from "three/examples/jsm/exporters/GLTFExporter.js";
import { pngChunkCrc32 } from "../studio-apng-encoder";
import { readStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { STUDIO_BG3D_GLB_MAX_JSON_BYTES } from "./studio-bg3d-glb-validation";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const UINT32_MAX = 0xffff_ffff;
export class StudioBg3dSceneGlbExactImageError extends Error {
  constructor(readonly code: "aborted" | "budget-exceeded" | "invalid-rgba" | "invalid-png" | "invalid-glb"
    | "invalid-texture-source" | "conflicting-image" | "unobserved-texture" | "disposed", readonly reason: string) {
    super(code === "aborted" ? "장면 이미지 저장을 취소했습니다."
      : code === "budget-exceeded" ? "원본 품질의 장면 이미지가 내보내기 메모리·파일 예산을 넘습니다."
      : "장면 이미지의 원본 RGBA와 GLB 참조를 안전하게 보존하지 못했습니다.");
    this.name = "StudioBg3dSceneGlbExactImageError";
  }
}
export interface StudioBg3dSceneGlbExactImageOptions {
  readonly signal: AbortSignal;
  readonly maximumBytes: number;
  /** 디코딩 메모리 예산은 압축된 최종 파일 예산과 별도로 지정할 수 있다. */
  readonly maximumRgbaBytes?: number;
}
export interface StudioBg3dSceneGlbRgbaPngInput extends StudioBg3dSceneGlbExactImageOptions {
  readonly width: number;
  readonly height: number;
  /** 비연관 alpha의 RGBA8. 행 순서는 texture.image와 같다. */
  readonly rgba: Uint8Array;
  readonly flipY?: boolean;
}
function fail(code: StudioBg3dSceneGlbExactImageError["code"], reason: string): never {
  throw new StudioBg3dSceneGlbExactImageError(code, reason);
}
function active(options: StudioBg3dSceneGlbExactImageOptions): void {
  if (options.signal.aborted) fail("aborted", "signal-aborted");
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 1 || options.maximumBytes > UINT32_MAX) {
    fail("budget-exceeded", "invalid-maximum-bytes");
  }
}
function boundedSize(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum || value > UINT32_MAX) fail("budget-exceeded", "byte-length-over-budget");
  return value;
}
function align4(value: number): number { return Math.ceil(value / 4) * 4; }
function uint(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= UINT32_MAX; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function same(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((value, index) => value === b[index]); }
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i += 1) bytes[i + 4] = type.charCodeAt(i);
  bytes.set(data, 8); view.setUint32(data.length + 8, pngChunkCrc32(type, data), false); return bytes;
}
function rgbaBudget(options: StudioBg3dSceneGlbExactImageOptions): number {
  const maximum = options.maximumRgbaBytes ?? options.maximumBytes;
  if (!uint(maximum) || maximum < 1) fail("budget-exceeded", "invalid-rgba-budget"); return maximum;
}

/** 필터 0·zlib·RGBA8을 직접 기록한다. 브라우저의 premultiply/unpremultiply 경계를 거치지 않는다. */
export function encodeStudioBg3dSceneGlbRgbaPng(input: StudioBg3dSceneGlbRgbaPngInput): Uint8Array<ArrayBuffer> {
  active(input);
  const { width, height, rgba } = input;
  if (!uint(width) || width < 1 || width > 0x7fff_ffff || !uint(height) || height < 1 || height > 0x7fff_ffff
    || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) fail("invalid-rgba", "rgba8-dimensions-mismatch");
  const maximumRgbaBytes = rgbaBudget(input);
  boundedSize(rgba.length, maximumRgbaBytes);
  const stride = width * 4, scanlineLength = boundedSize((stride + 1) * height, maximumRgbaBytes + height);
  const scanlines = new Uint8Array(scanlineLength);
  for (let row = 0; row < height; row += 1) {
    active(input);
    const sourceRow = input.flipY ? height - row - 1 : row;
    scanlines.set(rgba.subarray(sourceRow * stride, (sourceRow + 1) * stride), row * (stride + 1) + 1);
  }
  const compressed = zlibSync(scanlines, { level: 6 }); active(input);
  const header = new Uint8Array(13), headerView = new DataView(header.buffer);
  headerView.setUint32(0, width, false); headerView.setUint32(4, height, false); header[8] = 8; header[9] = 6;
  const chunks = [pngChunk("IHDR", header), pngChunk("IDAT", compressed), pngChunk("IEND", new Uint8Array())];
  const length = boundedSize(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), input.maximumBytes);
  const output = new Uint8Array(length); output.set(PNG_SIGNATURE); let offset = 8;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  active(input); return output;
}

function validatePngPixels(parts: readonly Uint8Array[], width: number, height: number, options: StudioBg3dSceneGlbExactImageOptions): void {
  const maximum = rgbaBudget(options), stride = width * 4;
  boundedSize(stride * height, maximum);
  const expected = boundedSize((stride + 1) * height, maximum + height);
  const compressed = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { active(options); compressed.set(part, offset); offset += part.length; }
  let inflated: Uint8Array;
  try { inflated = unzlibSync(compressed, { out: new Uint8Array(boundedSize(expected + 1, UINT32_MAX)) }); }
  catch { return fail("invalid-png", "png-invalid-deflate"); }
  // 한 바이트 여유를 두어 out 버퍼를 넘는 결과도 잘림 성공으로 처리하지 않는다.
  if (inflated.length !== expected || compressed.length < 6) fail("invalid-png", "png-scanline-length");
  let a = 1, b = 0;
  for (let row = 0; row < height; row += 1) {
    active(options);
    if (inflated[row * (stride + 1)] !== 0) fail("invalid-png", "png-filter-not-owned");
    for (let index = row * (stride + 1); index < (row + 1) * (stride + 1); index += 1) {
      a = (a + (inflated[index] ?? 0)) % 65521; b = (b + a) % 65521;
    }
  }
  const checksum = new DataView(compressed.buffer).getUint32(compressed.length - 4, false);
  if (checksum !== b * 65536 + a) fail("invalid-png", "png-adler-checksum");
}
/** 등록은 이 모듈이 만드는 정적 filter0 RGBA8 PNG를 유계 inflate·CRC·Adler 검사 후 복사한다. */
function validatePng(bytes: Uint8Array, options: StudioBg3dSceneGlbExactImageOptions): void {
  active(options); boundedSize(bytes.length, options.maximumBytes);
  if (bytes.length < 57 || !same(bytes.subarray(0, 8), PNG_SIGNATURE)) fail("invalid-png", "png-signature");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), parts: Uint8Array[] = [];
  let offset = 8, count = 0, width = 0, height = 0;
  while (offset < bytes.length) {
    active(options);
    if (++count > 4096 || bytes.length - offset < 12) fail("invalid-png", "png-chunk-bounds");
    const length = view.getUint32(offset, false), end = offset + 12 + length;
    if (end > bytes.length) fail("invalid-png", "png-chunk-bounds");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, end - 4);
    if (view.getUint32(end - 4, false) !== pngChunkCrc32(type, data)) fail("invalid-png", "png-chunk-crc");
    if (count === 1) {
      if (type !== "IHDR" || length !== 13) fail("invalid-png", "png-rgba8-header");
      width = view.getUint32(offset + 8, false); height = view.getUint32(offset + 12, false);
      if (width < 1 || height < 1 || width > 0x7fff_ffff || height > 0x7fff_ffff
        || data[8] !== 8 || data[9] !== 6 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) fail("invalid-png", "png-rgba8-header");
    } else if (type === "IDAT") { if (length === 0) fail("invalid-png", "png-empty-idat"); parts.push(data);
    } else if (type === "IEND") {
      if (length !== 0 || parts.length === 0 || end !== bytes.length) fail("invalid-png", "png-end");
      validatePngPixels(parts, width, height, options); return;
    } else fail("invalid-png", "png-unexpected-chunk");
    offset = end;
  }
  fail("invalid-png", "png-missing-end");
}
interface Registration { readonly png: Uint8Array; readonly required: boolean; observed: boolean }
export interface StudioBg3dSceneGlbImageReplacementRegistry {
  readonly plugin: GLTFExporterPlugin;
  /** stock normal/sign·단일 ORM packing 파생물은 원래 texture를 직접 쓰지 않으므로 기본값은 optional이다. */
  registerTexture(texture: Texture, png: Uint8Array, options?: { readonly required?: boolean }): void;
  replaceGlbImages(glb: Uint8Array): Uint8Array<ArrayBuffer>;
  dispose(): void;
}
function validateBufferViews(json: Record<string, unknown>, binaryLength: number): Record<string, unknown>[] {
  if (!Array.isArray(json.bufferViews)) fail("invalid-glb", "buffer-views-missing");
  const result: Record<string, unknown>[] = [];
  for (const value of json.bufferViews) {
    if (!record(value) || value.buffer !== 0 || !uint(value.byteLength) || value.byteLength === 0) fail("invalid-glb", "buffer-view-shape");
    const offset = value.byteOffset ?? 0;
    if (!uint(offset) || offset % 4 !== 0 || value.byteLength > binaryLength - offset) fail("invalid-glb", "buffer-view-bounds");
    result.push(value);
  }
  return result;
}
function writeContainer(json: Record<string, unknown>, binary: Uint8Array, options: StudioBg3dSceneGlbExactImageOptions): Uint8Array<ArrayBuffer> {
  active(options);
  // JSON.parse가 보존한 __proto__ 등의 원문 키도 그대로 기록한다. 정본 DTO로 재구성하지 않는다.
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  boundedSize(encoded.length, STUDIO_BG3D_GLB_MAX_JSON_BYTES);
  const jsonLength = align4(encoded.length), binLength = align4(binary.length);
  const output = new Uint8Array(boundedSize(28 + jsonLength + binLength, options.maximumBytes)), view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength); output.set(encoded, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  output.set(binary, 28 + jsonLength); active(options); return output;
}

/** 공식 plugin은 source index만 수집한다. private writer와 기존 textureDef·원본 바이트를 수정하지 않는다. */
export function createStudioBg3dSceneGlbImageReplacementRegistry(options: StudioBg3dSceneGlbExactImageOptions): StudioBg3dSceneGlbImageReplacementRegistry {
  active(options);
  const registrations = new Map<Texture, Registration>(), replacements = new Map<number, Uint8Array>();
  let disposed = false, registeredBytes = 0;
  const check = () => { active(options); if (disposed) fail("disposed", "registry-disposed"); };
  return {
    plugin: { writeTexture(map, textureDef) {
      check(); const registration = registrations.get(map); if (!registration) return;
      const source = textureDef.source;
      if (!uint(source)) fail("invalid-texture-source", "texture-source-index-missing");
      const previous = replacements.get(source);
      if (previous && !same(previous, registration.png)) fail("conflicting-image", "shared-image-different-png");
      replacements.set(source, registration.png); registration.observed = true;
    } },
    registerTexture(texture, png, registrationOptions = {}) {
      check(); validatePng(png, options); const previous = registrations.get(texture);
      if (previous) {
        if (!same(previous.png, png)) fail("conflicting-image", "texture-reregistered-different-png");
        if (registrationOptions.required && !previous.required) registrations.set(texture, { ...previous, required: true });
        return;
      }
      registeredBytes = boundedSize(registeredBytes + png.length, options.maximumBytes);
      registrations.set(texture, { png: Uint8Array.from(png), required: registrationOptions.required === true, observed: false });
    },
    replaceGlbImages(glb) {
      check(); boundedSize(glb.length, options.maximumBytes);
      for (const registration of registrations.values()) if (registration.required && !registration.observed) fail("unobserved-texture", "required-texture-not-written");
      if (glb.length >= 20 && new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true) > STUDIO_BG3D_GLB_MAX_JSON_BYTES) {
        fail("budget-exceeded", "glb-json-over-budget");
      }
      let parsed: ReturnType<typeof readStudioVrmExportGlb>;
      try { parsed = readStudioVrmExportGlb(glb); } catch { return fail("invalid-glb", "glb-container"); }
      check(); boundedSize(parsed.jsonByteLength, STUDIO_BG3D_GLB_MAX_JSON_BYTES);
      if (replacements.size === 0) return Uint8Array.from(glb);
      const json = parsed.json, buffers = json.buffers;
      if (!Array.isArray(buffers) || buffers.length !== 1 || !record(buffers[0]) || buffers[0].uri !== undefined
        || buffers[0].byteLength !== parsed.binary.length) fail("invalid-glb", "single-embedded-buffer-required");
      const buffer = buffers[0], views = validateBufferViews(json, parsed.binary.length), images = json.images;
      if (!Array.isArray(images)) fail("invalid-glb", "images-missing");
      const originalViewCount = views.length, binOffset = parsed.layout.binContentOffset;
      if (binOffset !== null && glb.subarray(binOffset + parsed.binary.length).some((value) => value !== 0)) fail("invalid-glb", "bin-padding-not-zero");
      const appended: Array<{ readonly offset: number; readonly png: Uint8Array }> = []; let length = parsed.binary.length;
      for (const [index, png] of replacements) {
        check(); const image: unknown = images[index];
        if (index >= images.length || !record(image) || !uint(image.bufferView) || image.bufferView >= originalViewCount || image.uri !== undefined) fail("invalid-glb", "image-buffer-view");
        const offset = align4(length); length = boundedSize(offset + png.length, options.maximumBytes);
        // 기존 view를 공유하는 accessor·확장도 있으므로 view index와 BIN prefix를 그대로 보존한다.
        const viewIndex = views.length; views.push({ buffer: 0, byteOffset: offset, byteLength: png.length });
        image.bufferView = viewIndex; image.mimeType = "image/png"; appended.push({ offset, png });
      }
      const binary = new Uint8Array(length); binary.set(parsed.binary);
      for (const entry of appended) { check(); binary.set(entry.png, entry.offset); }
      json.bufferViews = views; buffer.byteLength = length;
      return writeContainer(json, binary, options);
    },
    dispose() { disposed = true; registrations.clear(); replacements.clear(); registeredBytes = 0; },
  };
}
