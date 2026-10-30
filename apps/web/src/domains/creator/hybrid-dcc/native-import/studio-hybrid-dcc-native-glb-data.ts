/** 외부 리소스를 읽지 않는 glTF 컨테이너·accessor 경계. 범위 검증 뒤에만 값을 읽는다. */
import { STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES, STUDIO_NATIVE_IMPORT_MAX_JSON_BYTES } from "./studio-hybrid-dcc-native-import-contracts";

export type JsonRecord = Record<string, unknown>;
export class NativeGlbError extends Error {
  constructor(readonly code: string, detail: string, readonly path?: string) { super(detail); }
}
export function reject(code: string, detail: string, path?: string): never { throw new NativeGlbError(code, detail, path); }
export function object(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject("INVALID_GLTF", "glTF 객체 구조가 올바르지 않습니다.", path);
  return value as JsonRecord;
}
export function array(value: unknown, path: string, optional = false): unknown[] {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) reject("INVALID_GLTF", "glTF 배열 구조가 올바르지 않습니다.", path);
  return value;
}
export function integer(value: unknown, path: string, maximum = Number.MAX_SAFE_INTEGER, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) reject("INVALID_GLTF", "glTF 정수 값 또는 편집 예산이 올바르지 않습니다.", path);
  return value;
}
export function item(values: readonly unknown[], value: unknown, path: string): JsonRecord {
  return object(values[integer(value, path, values.length - 1)], path);
}
export function extensions(value: JsonRecord, path: string): JsonRecord {
  return value.extensions === undefined ? {} : object(value.extensions, `${path}.extensions`);
}

/** base64 길이·패딩·문자를 먼저 확인한다. Buffer·atob·DOM에 의존하지 않는다. */
function embeddedBuffer(uri: unknown, expected: number, path: string): Uint8Array {
  if (typeof uri !== "string" || !/^data:application\/(?:octet-stream|gltf-buffer);base64,/u.test(uri)) reject("EXTERNAL_BUFFER", "외부 버퍼를 참조하는 모델은 단일 파일로 다시 내보내야 합니다.", path);
  const start = uri.indexOf(",") + 1; const length = uri.length - start;
  const padding = uri.endsWith("==") ? 2 : uri.endsWith("=") ? 1 : 0;
  const size = length / 4 * 3 - padding;
  if (length % 4 !== 0 || size !== expected || size > STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES) reject("INVALID_BUFFER", "내장 버퍼 길이가 선언과 다릅니다.", path);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let index = start; index < uri.length; index += 1) {
    if (index >= uri.length - padding ? uri[index] !== "=" : alphabet.indexOf(uri[index] ?? "") < 0) reject("INVALID_BUFFER", "내장 버퍼의 base64 형식이 올바르지 않습니다.", path);
  }
  const result = new Uint8Array(size); let cursor = 0;
  for (let index = start; index < uri.length; index += 4) {
    const a = alphabet.indexOf(uri[index] ?? ""); const b = alphabet.indexOf(uri[index + 1] ?? "");
    const c = alphabet.indexOf(uri[index + 2] ?? ""); const d = alphabet.indexOf(uri[index + 3] ?? "");
    if (cursor < size) result[cursor++] = a << 2 | b >> 4;
    if (cursor < size) result[cursor++] = (b & 15) << 4 | c >> 2;
    if (cursor < size) result[cursor++] = (c & 3) << 6 | d;
  }
  return result;
}

export interface NativeGltfData { readonly root: JsonRecord; readonly buffers: readonly Uint8Array[]; readonly views: readonly unknown[]; readonly accessors: readonly unknown[] }
export function parseNativeGltf(bytes: Uint8Array, binary: boolean): NativeGltfData {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES) reject("FILE_BUDGET", "모델 파일은 비어 있지 않은 128 MiB 이하 파일이어야 합니다.");
  let json = bytes; let bin: Uint8Array | undefined;
  if (binary) {
    if (bytes.byteLength < 20) reject("INVALID_GLB", "GLB 헤더가 잘렸습니다.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) reject("INVALID_GLB", "GLB 버전 또는 전체 길이가 올바르지 않습니다.");
    let offset = 12; let chunks = 0; let seenJson = false;
    while (offset < bytes.byteLength) {
      if (offset + 8 > bytes.byteLength) reject("INVALID_GLB", "GLB 청크 헤더가 잘렸습니다.");
      const length = view.getUint32(offset, true); const type = view.getUint32(offset + 4, true); offset += 8;
      if (length % 4 !== 0 || length > bytes.byteLength - offset || chunks === 0 && type !== 0x4e4f534a) reject("INVALID_GLB", "GLB 청크 순서·정렬·길이가 올바르지 않습니다.");
      if (type === 0x4e4f534a) {
        if (seenJson || length > STUDIO_NATIVE_IMPORT_MAX_JSON_BYTES) reject("JSON_BUDGET", "GLB JSON이 중복되거나 16 MiB 예산을 넘었습니다.");
        json = bytes.subarray(offset, offset + length); seenJson = true;
      } else if (type === 0x004e4942) {
        if (bin || chunks !== 1) reject("INVALID_GLB", "GLB 바이너리 청크가 중복되거나 순서가 다릅니다.");
        bin = bytes.subarray(offset, offset + length);
      }
      offset += length; chunks += 1;
    }
    if (!seenJson) reject("INVALID_GLB", "GLB JSON 청크가 없습니다.");
  }
  if (json.byteLength > STUDIO_NATIVE_IMPORT_MAX_JSON_BYTES) reject("JSON_BUDGET", "glTF JSON은 16 MiB 이하로 내보내야 합니다.");
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json)) as unknown; }
  catch { reject("INVALID_JSON", "모델의 UTF-8 JSON을 해석하지 못했습니다."); }
  const root = object(parsed, "$root"); const asset = object(root.asset, "asset");
  if (asset.version !== "2.0" || asset.minVersion !== undefined && asset.minVersion !== "2.0") reject("UNSUPPORTED_VERSION", "glTF 2.0 파일만 지원합니다.", "asset");
  const buffers: Uint8Array[] = []; let total = 0;
  const bufferSources = array(root.buffers, "buffers", true);
  const views = array(root.bufferViews, "bufferViews", true); const accessors = array(root.accessors, "accessors", true);
  if (bufferSources.length > 1024 || views.length > 8192 || accessors.length > 8192) reject("METADATA_BUDGET", "버퍼·accessor 메타데이터 수가 편집 예산을 넘었습니다.");
  for (const [index, raw] of bufferSources.entries()) {
    const path = `buffers[${index}]`; const descriptor = object(raw, path);
    const length = integer(descriptor.byteLength, `${path}.byteLength`, STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES, 1);
    total += length;
    if (total > STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES) reject("BUFFER_BUDGET", "내장 버퍼 합계가 128 MiB 예산을 넘었습니다.", path);
    if (descriptor.uri === undefined) {
      if (!binary || index !== 0 || !bin || length > bin.byteLength || bin.byteLength - length > 3) reject("INVALID_BUFFER", "GLB 내장 버퍼와 선언 길이가 일치하지 않습니다.", path);
      buffers.push(bin.subarray(0, length));
    } else buffers.push(embeddedBuffer(descriptor.uri, length, `${path}.uri`));
  }
  return { root, buffers, views, accessors };
}

const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_SIZE: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
interface ViewRange { readonly bytes: DataView; readonly offset: number; readonly length: number; readonly stride?: number }
interface SparseRange { readonly count: number; readonly indices: ViewRange; readonly indexType: number; readonly indexOffset: number; readonly values: ViewRange; readonly valueOffset: number }
export interface NativeGltfAccessor {
  readonly count: number; readonly components: number; readonly type: string; readonly componentType: number; readonly normalized: boolean;
  validateAttribute(): void;
  validateIndices(): void;
  get(index: number, component: number): number;
}
function readNumber(view: DataView, offset: number, type: number): number {
  if (type === 5126) return view.getFloat32(offset, true);
  if (type === 5125) return view.getUint32(offset, true);
  if (type === 5123) return view.getUint16(offset, true);
  if (type === 5122) return view.getInt16(offset, true);
  return type === 5121 ? view.getUint8(offset) : view.getInt8(offset);
}

/** 모든 accessor의 범위·sparse 순서·유한 값을 출력 배열을 만들기 전에 확인한다. */
export function nativeGltfAccessors(data: NativeGltfData): readonly NativeGltfAccessor[] {
  const ranges = data.views.map((raw, index): ViewRange => {
    const path = `bufferViews[${index}]`; const value = object(raw, path);
    const bufferIndex = integer(value.buffer, `${path}.buffer`, data.buffers.length - 1);
    const bytes = data.buffers[bufferIndex]; if (!bytes) reject("INVALID_BUFFER_VIEW", "버퍼가 없습니다.", path);
    const offset = integer(value.byteOffset ?? 0, `${path}.byteOffset`, bytes.byteLength);
    const length = integer(value.byteLength, `${path}.byteLength`, bytes.byteLength, 1);
    if (length > bytes.byteLength - offset) reject("INVALID_BUFFER_VIEW", "bufferView가 버퍼의 실제 범위를 벗어났습니다.", path);
    const stride = value.byteStride === undefined ? undefined : integer(value.byteStride, `${path}.byteStride`, 252, 4);
    if (stride !== undefined && stride % 4 !== 0) reject("INVALID_ALIGNMENT", "bufferView stride는 4바이트 단위여야 합니다.", path);
    return { bytes: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset, length, ...(stride === undefined ? {} : { stride }) };
  });
  let work = 0;
  const plans = data.accessors.map((raw, index): NativeGltfAccessor => {
    const path = `accessors[${index}]`; const value = object(raw, path);
    const componentType = integer(value.componentType, `${path}.componentType`); const componentBytes = COMPONENT_BYTES[componentType];
    const type = typeof value.type === "string" ? value.type : ""; const components = TYPE_SIZE[type];
    if (!componentBytes || !components || !Object.hasOwn(TYPE_SIZE, type)) reject("INVALID_ACCESSOR", "accessor componentType 또는 type을 지원하지 않습니다.", path);
    const count = integer(value.count, `${path}.count`, Number.MAX_SAFE_INTEGER, 1);
    // sparse·공유 accessor의 선언 정점 수와 실제 생성 정점 수는 다르므로 전체 구성 요소 검증 예산으로 제한한다.
    if (count > Math.floor((16_000_000 - work) / components)) reject("ACCESSOR_BUDGET", "accessor 검증 작업이 편집 예산을 넘었습니다.", path);
    work += count * components;
    if (value.normalized !== undefined && typeof value.normalized !== "boolean" || value.normalized === true && (componentType === 5125 || componentType === 5126)) reject("INVALID_ACCESSOR", "normalized accessor의 구성 요소 형식이 올바르지 않습니다.", path);
    const normalized = value.normalized === true;
    const matrixSide = type.startsWith("MAT") ? Number(type.slice(3)) : 0;
    const columnBytes = matrixSide ? Math.ceil(matrixSide * componentBytes / 4) * 4 : 0;
    const elementBytes = matrixSide ? matrixSide * columnBytes : componentBytes * components;
    const actualByteSpan = matrixSide ? (matrixSide - 1) * columnBytes + matrixSide * componentBytes : elementBytes;
    const offset = integer(value.byteOffset ?? 0, `${path}.byteOffset`);
    const base = value.bufferView === undefined ? undefined : ranges[integer(value.bufferView, `${path}.bufferView`, ranges.length - 1)];
    const stride = base?.stride ?? elementBytes;
    const componentOffset = (component: number) => matrixSide ? Math.floor(component / matrixSide) * columnBytes + component % matrixSide * componentBytes : component * componentBytes;
    if (base ? offset % componentBytes !== 0 || (base.offset + offset) % componentBytes !== 0 || matrixSide > 0 && offset % 4 !== 0 || stride < elementBytes || offset + (count - 1) * stride + actualByteSpan > base.length
      : value.byteOffset !== undefined) reject("INVALID_ACCESSOR_RANGE", "accessor 정렬·stride 또는 bufferView 내부 범위가 올바르지 않습니다.", path);
    let sparse: SparseRange | undefined;
    if (value.sparse !== undefined) {
      const s = object(value.sparse, `${path}.sparse`); const sparseCount = integer(s.count, `${path}.sparse.count`, count, 1);
      const si = object(s.indices, `${path}.sparse.indices`); const sv = object(s.values, `${path}.sparse.values`);
      const indexType = integer(si.componentType, `${path}.sparse.indices.componentType`);
      if (![5121, 5123, 5125].includes(indexType)) reject("INVALID_SPARSE", "sparse 인덱스 형식이 올바르지 않습니다.", path);
      const indices = ranges[integer(si.bufferView, `${path}.sparse.indices.bufferView`, ranges.length - 1)];
      const values = ranges[integer(sv.bufferView, `${path}.sparse.values.bufferView`, ranges.length - 1)];
      const indexOffset = integer(si.byteOffset ?? 0, `${path}.sparse.indices.byteOffset`); const valueOffset = integer(sv.byteOffset ?? 0, `${path}.sparse.values.byteOffset`);
      const indexBytes = COMPONENT_BYTES[indexType] ?? 0;
      if (!indices || !values || indices.stride !== undefined || values.stride !== undefined || indexOffset % indexBytes !== 0
        || (indices.offset + indexOffset) % indexBytes !== 0 || valueOffset % componentBytes !== 0 || (values.offset + valueOffset) % componentBytes !== 0 || matrixSide > 0 && valueOffset % 4 !== 0
        || indexOffset + sparseCount * indexBytes > indices.length || valueOffset + (sparseCount - 1) * elementBytes + actualByteSpan > values.length) reject("INVALID_SPARSE", "sparse 범위·정렬이 올바르지 않습니다.", path);
      let previous = -1;
      for (let i = 0; i < sparseCount; i += 1) {
        const current = readNumber(indices.bytes, indices.offset + indexOffset + i * indexBytes, indexType);
        if (current <= previous || current >= count) reject("INVALID_SPARSE", "sparse 인덱스는 범위 안에서 엄격히 증가해야 합니다.", path);
        previous = current;
      }
      sparse = { count: sparseCount, indices, indexType, indexOffset, values, valueOffset };
    }
    for (const key of ["min", "max"] as const) if (value[key] !== undefined) {
      const bounds = array(value[key], `${path}.${key}`);
      if (bounds.length !== components || !bounds.every((n) => typeof n === "number" && Number.isFinite(n))) reject("INVALID_ACCESSOR", "accessor 경계 값이 올바르지 않습니다.", path);
    }
    const get = (row: number, component: number): number => {
      let result = base ? readNumber(base.bytes, base.offset + offset + row * stride + componentOffset(component), componentType) : 0;
      if (sparse) {
        let low = 0; let high = sparse.count - 1;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const found = readNumber(sparse.indices.bytes, sparse.indices.offset + sparse.indexOffset + middle * (COMPONENT_BYTES[sparse.indexType] ?? 0), sparse.indexType);
          if (found === row) { result = readNumber(sparse.values.bytes, sparse.values.offset + sparse.valueOffset + middle * elementBytes + componentOffset(component), componentType); break; }
          if (found < row) low = middle + 1; else high = middle - 1;
        }
      }
      if (!normalized) return result;
      if (componentType === 5120) return Math.max(result / 127, -1);
      if (componentType === 5122) return Math.max(result / 32767, -1);
      return result / (componentType === 5121 ? 255 : 65535);
    };
    // sparse가 덮는 base 값도 입력 파일의 Float32 데이터이므로 NaN/Infinity를 허용하지 않는다.
    if (componentType === 5126) {
      if (base) for (let row = 0; row < count; row += 1) for (let component = 0; component < components; component += 1) {
        if (!Number.isFinite(readNumber(base.bytes, base.offset + offset + row * stride + componentOffset(component), componentType))) reject("NONFINITE_ACCESSOR", "accessor에 유한하지 않은 값이 있습니다.", path);
      }
      if (sparse) for (let row = 0; row < sparse.count; row += 1) for (let component = 0; component < components; component += 1) {
        if (!Number.isFinite(readNumber(sparse.values.bytes, sparse.values.offset + sparse.valueOffset + row * elementBytes + componentOffset(component), componentType))) reject("NONFINITE_ACCESSOR", "sparse accessor에 유한하지 않은 값이 있습니다.", path);
      }
    }
    return { count, components, type, componentType, normalized, get,
      validateAttribute() {
        if (base && (offset % 4 !== 0 || stride % 4 !== 0)) reject("INVALID_ALIGNMENT", "정점 attribute의 상대 offset과 stride는 4바이트에 정렬해야 합니다.", path);
      },
      validateIndices() {
        if (type !== "SCALAR" || ![5121, 5123, 5125].includes(componentType) || normalized || base?.stride !== undefined) reject("INVALID_INDICES", "삼각형 인덱스는 stride 없는 unsigned 정수 SCALAR여야 합니다.", path);
      },
    };
  });
  return plans;
}
