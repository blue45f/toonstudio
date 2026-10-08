/**
 * GLB(glTF 2.0 binary) 컨테이너 읽기·쓰기와 accessor 읽기·쓰기 헬퍼(순수, DOM 없음).
 * 키트 프리뷰의 검사(glb-inspect)·병합(glb-merge)이 공유한다. glTF JSON은 느슨한 `JsonObject`로 다루고
 * 필요한 필드만 좁혀 읽는다(`any` 없음). 실패는 한글 사유의 `LabFailure`(`glb-invalid`)로 throw한다.
 */
import { failVisible } from "../../contracts";

export const GLB_MAGIC = 0x46546c67; // "glTF"
export const GLB_VERSION = 2;
export const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
export const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface GlbDocument {
  /** glTF JSON(병합·굽기 단계가 직접 고친다) */
  json: JsonObject;
  /** BIN 청크(없으면 길이 0). 병합이 뒤에 덧붙이므로 새 배열로 바뀔 수 있다. */
  bin: Uint8Array;
}

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** 객체의 배열 필드를 읽는다(없거나 배열이 아니면 빈 배열). 원본 배열을 그대로 돌려주므로 읽기 전용으로 쓴다. */
export function arrayField(object: JsonObject, key: string): JsonValue[] {
  const value = object[key];
  return Array.isArray(value) ? value : [];
}

/** 배열 필드가 없으면 만들어 돌려준다(병합이 항목을 덧붙일 때). */
export function ensureArrayField(object: JsonObject, key: string): JsonValue[] {
  const existing = object[key];
  if (Array.isArray(existing)) return existing;
  const created: JsonValue[] = [];
  object[key] = created;
  return created;
}

/** 배열 필드에서 객체 항목만(원래 인덱스를 유지하려면 `arrayField`를 쓴다). */
export function objectAt(list: readonly JsonValue[], index: number): JsonObject | null {
  const value = list[index];
  return isJsonObject(value) ? value : null;
}

export function numberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    out.push(item);
  }
  return out;
}

function invalid(reasonKo: string, detail?: unknown): never {
  throw failVisible("glb-invalid", reasonKo, detail);
}

function alignUp4(length: number): number {
  return (length + 3) & ~3;
}

/** GLB 바이트를 JSON + BIN으로 가른다. 형식이 틀리면 `glb-invalid` LabFailure를 throw한다. */
export function parseGlb(bytes: Uint8Array, label = "GLB"): GlbDocument {
  if (bytes.byteLength < 20) invalid(`${label}: 파일이 너무 작아 GLB가 아닙니다(${bytes.byteLength} 바이트).`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) invalid(`${label}: GLB 매직('glTF')이 아닙니다. glTF 텍스트(.gltf)나 다른 형식은 지원하지 않습니다.`);
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) invalid(`${label}: GLB 버전 ${version}은(는) 지원하지 않습니다(2만 지원).`);
  const totalLength = view.getUint32(8, true);
  if (totalLength > bytes.byteLength) invalid(`${label}: 헤더가 말하는 길이(${totalLength})가 실제 파일(${bytes.byteLength})보다 큽니다. 잘린 파일일 수 있습니다.`);
  let jsonText: string | null = null;
  let bin: Uint8Array = new Uint8Array(0);
  let offset = 12;
  while (offset + 8 <= totalLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + chunkLength > totalLength) invalid(`${label}: 청크가 파일 끝을 넘습니다(오프셋 ${offset}).`);
    if (chunkType === GLB_CHUNK_JSON && jsonText === null) {
      try {
        jsonText = UTF8_DECODER.decode(bytes.subarray(start, start + chunkLength));
      } catch (error) {
        invalid(`${label}: JSON 청크가 UTF-8이 아닙니다.`, error);
      }
    } else if (chunkType === GLB_CHUNK_BIN && bin.byteLength === 0) {
      bin = bytes.subarray(start, start + chunkLength);
    }
    offset = start + alignUp4(chunkLength);
  }
  if (jsonText === null) invalid(`${label}: JSON 청크가 없습니다.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (error) {
    return invalid(`${label}: glTF JSON을 해석하지 못했습니다.`, error);
  }
  if (!isJsonObject(parsed)) invalid(`${label}: glTF JSON 최상위가 객체가 아닙니다.`);
  const asset = parsed.asset;
  if (!isJsonObject(asset) || asset.version !== "2.0") invalid(`${label}: glTF asset.version이 2.0이 아닙니다.`);
  return { json: parsed, bin };
}

/** JSON + BIN을 GLB 컨테이너로 쓴다(JSON은 공백, BIN은 0으로 4바이트 패딩). */
export function writeGlb(document: GlbDocument): Uint8Array {
  const jsonBytes = UTF8_ENCODER.encode(JSON.stringify(document.json));
  const jsonPadded = alignUp4(jsonBytes.byteLength);
  const hasBin = document.bin.byteLength > 0;
  const binPadded = alignUp4(document.bin.byteLength);
  const total = 12 + 8 + jsonPadded + (hasBin ? 8 + binPadded : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, GLB_CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);
  if (hasBin) {
    const binOffset = 20 + jsonPadded;
    view.setUint32(binOffset, binPadded, true);
    view.setUint32(binOffset + 4, GLB_CHUNK_BIN, true);
    out.set(document.bin, binOffset + 8);
  }
  return out;
}

// ---------------------------------------------------------------- accessor

export const COMPONENT_TYPE = { BYTE: 5120, UNSIGNED_BYTE: 5121, SHORT: 5122, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, FLOAT: 5126 } as const;

const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** accessor가 BIN 청크 안에서 차지하는 자리(희소 accessor·bufferView 없는 accessor는 `null`) */
export interface AccessorLayout {
  readonly count: number;
  readonly components: number;
  readonly componentType: number;
  readonly normalized: boolean;
  /** 첫 요소의 BIN 안 바이트 오프셋 */
  readonly byteOffset: number;
  readonly byteStride: number;
}

/** `json.accessors[index]`의 배치를 계산한다. 단일 버퍼(GLB BIN, buffer 0) 전제. 해석할 수 없으면 null. */
export function accessorLayout(json: JsonObject, index: number): AccessorLayout | null {
  const accessor = objectAt(arrayField(json, "accessors"), index);
  if (!accessor) return null;
  const count = asNumber(accessor.count);
  const componentType = asNumber(accessor.componentType);
  const type = asString(accessor.type);
  const bufferViewIndex = asNumber(accessor.bufferView);
  if (count === null || componentType === null || type === null || bufferViewIndex === null) return null;
  const componentBytes = COMPONENT_BYTES[componentType];
  const components = TYPE_COMPONENTS[type];
  if (componentBytes === undefined || components === undefined) return null;
  const bufferView = objectAt(arrayField(json, "bufferViews"), bufferViewIndex);
  if (!bufferView) return null;
  const byteOffset = (asNumber(bufferView.byteOffset) ?? 0) + (asNumber(accessor.byteOffset) ?? 0);
  const byteStride = asNumber(bufferView.byteStride) ?? componentBytes * components;
  return { count, components, componentType, normalized: accessor.normalized === true, byteOffset, byteStride };
}

/** 요소 `element`의 성분 `component` 값을 읽는다(정규화 accessor는 0..1/−1..1 실수로). */
export function readAccessorValue(view: DataView, layout: AccessorLayout, element: number, component: number): number {
  const componentBytes = COMPONENT_BYTES[layout.componentType] ?? 4;
  const position = layout.byteOffset + element * layout.byteStride + component * componentBytes;
  switch (layout.componentType) {
    case COMPONENT_TYPE.FLOAT:
      return view.getFloat32(position, true);
    case COMPONENT_TYPE.UNSIGNED_BYTE: {
      const value = view.getUint8(position);
      return layout.normalized ? value / 255 : value;
    }
    case COMPONENT_TYPE.BYTE: {
      const value = view.getInt8(position);
      return layout.normalized ? Math.max(value / 127, -1) : value;
    }
    case COMPONENT_TYPE.UNSIGNED_SHORT: {
      const value = view.getUint16(position, true);
      return layout.normalized ? value / 65535 : value;
    }
    case COMPONENT_TYPE.SHORT: {
      const value = view.getInt16(position, true);
      return layout.normalized ? Math.max(value / 32767, -1) : value;
    }
    default:
      return view.getUint32(position, true);
  }
}

/** 정수 성분 값을 제자리에서 쓴다(JOINTS_0 재매핑용). 정수 accessor가 아니면 throw. */
export function writeAccessorInteger(view: DataView, layout: AccessorLayout, element: number, component: number, value: number): void {
  const componentBytes = COMPONENT_BYTES[layout.componentType] ?? 4;
  const position = layout.byteOffset + element * layout.byteStride + component * componentBytes;
  switch (layout.componentType) {
    case COMPONENT_TYPE.UNSIGNED_BYTE:
      view.setUint8(position, value);
      return;
    case COMPONENT_TYPE.UNSIGNED_SHORT:
      view.setUint16(position, value, true);
      return;
    case COMPONENT_TYPE.UNSIGNED_INT:
      view.setUint32(position, value, true);
      return;
    default:
      throw failVisible("glb-invalid", `정수로 쓸 수 없는 accessor 성분 형식입니다(componentType ${layout.componentType}).`);
  }
}

/** 읽을 수 있는 범위인지(accessor가 BIN 안에 들어가는지) */
export function accessorFitsBin(layout: AccessorLayout, binLength: number): boolean {
  if (layout.count === 0) return true;
  const componentBytes = COMPONENT_BYTES[layout.componentType] ?? 4;
  const last = layout.byteOffset + (layout.count - 1) * layout.byteStride + layout.components * componentBytes;
  return layout.byteOffset >= 0 && last <= binLength;
}

export function dataViewOf(bin: Uint8Array): DataView {
  return new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
}
