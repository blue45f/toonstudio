/** Worker 경계에서 사용자 getter나 위장한 typed array를 읽지 않는 공통 검사다. */
type ArrayTag = "Float32Array" | "Uint16Array" | "Uint32Array";

interface OwnedArrayInfo {
  readonly buffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly length: number;
  readonly tag: ArrayTag;
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const offsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")?.get;
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")?.get;
const tagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;
const shadowedKeys = ["buffer", "byteOffset", "byteLength", "length", "slice", "subarray", Symbol.iterator] as const;

function ownedArrayInfo(value: unknown): OwnedArrayInfo | null {
  if (!ArrayBuffer.isView(value) || bufferGetter === undefined || offsetGetter === undefined
    || byteLengthGetter === undefined || lengthGetter === undefined || tagGetter === undefined) return null;
  try {
    if (shadowedKeys.some((key) => Object.hasOwn(value, key))) return null;
    const buffer: unknown = Reflect.apply(bufferGetter, value, []);
    const byteOffset: unknown = Reflect.apply(offsetGetter, value, []);
    const byteLength: unknown = Reflect.apply(byteLengthGetter, value, []);
    const length: unknown = Reflect.apply(lengthGetter, value, []);
    const tag: unknown = Reflect.apply(tagGetter, value, []);
    if (tag !== "Float32Array" && tag !== "Uint16Array" && tag !== "Uint32Array") return null;
    const prototype = tag === "Float32Array" ? Float32Array.prototype
      : tag === "Uint16Array" ? Uint16Array.prototype : Uint32Array.prototype;
    if (Object.getPrototypeOf(value) !== prototype || !(buffer instanceof ArrayBuffer)
      || typeof byteOffset !== "number" || !Number.isSafeInteger(byteOffset) || byteOffset < 0
      || typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0
      || typeof length !== "number" || !Number.isSafeInteger(length) || length < 0
      || byteLength !== length * (tag === "Uint16Array" ? 2 : 4)) return null;
    return { buffer, byteOffset, byteLength, length, tag };
  } catch {
    return null;
  }
}

export function isStudioXAtlasUvOwnedWorkerArray(value: unknown, tag: ArrayTag): boolean {
  return ownedArrayInfo(value)?.tag === tag;
}

/** hash 입력도 intrinsic 범위를 사용한다. byteLength를 가린 view는 해시하지 않는다. */
export function studioXAtlasUvWorkerArrayBytes(value: ArrayBufferView): Uint8Array {
  const info = ownedArrayInfo(value);
  if (info === null) throw new TypeError("xatlas Worker 배열의 소유권 또는 실제 타입을 확인할 수 없습니다.");
  return new Uint8Array(info.buffer, info.byteOffset, info.byteLength);
}

/** 메타데이터는 순환 참조·prototype·accessor·함수를 포함하지 않는 own data만 받는다. */
export function hasStudioXAtlasUvOwnWorkerData(root: unknown): boolean {
  const pending: unknown[] = [root];
  const seen = new Set<object>();
  try {
    while (pending.length > 0) {
      const value = pending.pop();
      if (value === null || value === undefined || typeof value === "string"
        || typeof value === "number" || typeof value === "boolean") continue;
      if (ArrayBuffer.isView(value)) {
        if (ownedArrayInfo(value) === null) return false;
        continue;
      }
      if (typeof value !== "object" || seen.has(value)) return false;
      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
      seen.add(value);
      const keys = Reflect.ownKeys(value);
      if (array && keys.length !== value.length + 1) return false;
      for (const key of keys) {
        if (typeof key !== "string") return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor)) return false;
        if (array && key === "length") continue;
        if (!descriptor.enumerable || (array && (!/^(?:0|[1-9][0-9]*)$/u.test(key)
          || Number(key) >= value.length))) return false;
        pending.push(descriptor.value);
      }
    }
    return true;
  } catch {
    return false;
  }
}
