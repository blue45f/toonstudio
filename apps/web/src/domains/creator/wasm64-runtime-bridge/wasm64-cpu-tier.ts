/**
 * WebAssembly CPU SIMD 계층 탐지(`relaxed-simd` → `simd128` → `scalar` → `js-fallback`) 및
 * 코어 `.wasm` 바이너리 자동 티어 후보군 해석기.
 *
 * - 외부 라이브러리 없이 최소 바이트 WebAssembly 모듈을 `WebAssembly.validate()`로 검증해
 *   현재 브라우저/V8 런타임이 지원하는 최고 CPU 벡터 계층을 동기 판정한다.
 * - 상위 티어 바이너리 로드 또는 인스턴스화가 실패하면 하위 티어로 안전하게 강등한다.
 */

import {
  STUDIO_WASM64_CORE_RELAXED_SIMD_URL,
  STUDIO_WASM64_CORE_SIMD_URL,
  STUDIO_WASM64_CORE_URL,
  type Wasm64CpuTier,
  type Wasm64CpuTierProbe,
  type Wasm64ExecutableTier,
  type WasmCoreTierCandidate,
} from "./wasm64-hotpath-types";

/** 최소 유효 스칼라 WebAssembly 모듈 (매직 + 버전 1, 8 B). */
export const WASM_SCALAR_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

/** 최소 WebAssembly SIMD128 검증 모듈 (`(func (result v128) (v128.const i32x4 0 0 0 0))`, 43 B). */
export const WASM_SIMD128_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b,
]);

/**
 * 최소 WebAssembly Relaxed-SIMD 검증 모듈
 * (`(func (param v128 v128 v128) (result v128) (f32x4.relaxed_madd ...))`, 38 B).
 * `0xfd 0x85 0x02` = opcode `0x105` (`f32x4.relaxed_madd`).
 */
export const WASM_RELAXED_SIMD_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x08, 0x01, 0x60, 0x03, 0x7b, 0x7b, 0x7b, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x0d, 0x01, 0x0b, 0x00,
  0x20, 0x00, 0x20, 0x01, 0x20, 0x02,
  0xfd, 0x85, 0x02,
  0x0b,
]);

export type WasmValidateFn = (bytes: Uint8Array) => boolean;

function safeValidate(validateFn: WasmValidateFn, bytes: Uint8Array): boolean {
  try {
    return Boolean(validateFn(bytes));
  } catch {
    return false;
  }
}

/**
 * 현재 호스트의 WebAssembly 기본 · SIMD128 · Relaxed-SIMD 지원 여부를 프로브한다.
 */
export function probeWasmCpuTierCapabilities(validateFn?: WasmValidateFn): Wasm64CpuTierProbe {
  const validator: WasmValidateFn | null =
    validateFn ??
    (typeof WebAssembly !== "undefined" && typeof WebAssembly.validate === "function"
      ? (bytes) => WebAssembly.validate(bytes as BufferSource)
      : null);

  if (!validator) {
    return Object.freeze({
      tier: "js-fallback",
      webAssemblySupported: false,
      simd128Supported: false,
      relaxedSimdSupported: false,
    });
  }

  const webAssemblySupported = safeValidate(validator, WASM_SCALAR_PROBE_BYTES);
  if (!webAssemblySupported) {
    return Object.freeze({
      tier: "js-fallback",
      webAssemblySupported: false,
      simd128Supported: false,
      relaxedSimdSupported: false,
    });
  }

  const simd128Supported = safeValidate(validator, WASM_SIMD128_PROBE_BYTES);
  const relaxedSimdSupported =
    simd128Supported && safeValidate(validator, WASM_RELAXED_SIMD_PROBE_BYTES);

  const tier: Wasm64CpuTier = relaxedSimdSupported
    ? "wasm-relaxed-simd"
    : simd128Supported
      ? "wasm-simd128"
      : "wasm-scalar";

  return Object.freeze({
    tier,
    webAssemblySupported,
    simd128Supported,
    relaxedSimdSupported,
  });
}

/**
 * `WebAssembly.validate()` 최소 프로브 바이트로 현재 런타임의 최적 Wasm CPU 계층을 판정한다.
 */
export function detectWasmCpuTier(validateFn?: WasmValidateFn): Wasm64CpuTier {
  return probeWasmCpuTierCapabilities(validateFn).tier;
}

const RELAXED_CANDIDATES: readonly WasmCoreTierCandidate[] = Object.freeze([
  Object.freeze({ tier: "wasm-relaxed-simd", url: STUDIO_WASM64_CORE_RELAXED_SIMD_URL }),
  Object.freeze({ tier: "wasm-simd128", url: STUDIO_WASM64_CORE_SIMD_URL }),
  Object.freeze({ tier: "wasm-scalar", url: STUDIO_WASM64_CORE_URL }),
]);

const SIMD128_CANDIDATES: readonly WasmCoreTierCandidate[] = Object.freeze([
  Object.freeze({ tier: "wasm-simd128", url: STUDIO_WASM64_CORE_SIMD_URL }),
  Object.freeze({ tier: "wasm-scalar", url: STUDIO_WASM64_CORE_URL }),
]);

const SCALAR_CANDIDATES: readonly WasmCoreTierCandidate[] = Object.freeze([
  Object.freeze({ tier: "wasm-scalar", url: STUDIO_WASM64_CORE_URL }),
]);

/**
 * 판정된 CPU 계층에 대해 우선순위 내림차순 코어 `.wasm` 로드 후보군을 반환한다.
 */
export function resolveWasmCoreTierCandidates(
  tier: Wasm64CpuTier,
): readonly WasmCoreTierCandidate[] {
  switch (tier) {
    case "wasm-relaxed-simd":
      return RELAXED_CANDIDATES;
    case "wasm-simd128":
      return SIMD128_CANDIDATES;
    case "wasm-scalar":
      return SCALAR_CANDIDATES;
    case "js-fallback":
      return [];
  }
}

/** URL 파일명 패턴에서 코어 Wasm CPU 계층을 추정한다. */
export function inferCpuTierFromUrl(url: string): Wasm64ExecutableTier | null {
  const lower = url.toLowerCase();
  if (lower.includes("relaxed-simd") || lower.includes("extended-suite")) {
    return "wasm-relaxed-simd";
  }
  if (lower.includes("-simd")) {
    return "wasm-simd128";
  }
  if (lower.includes("studio-wasm64-drawing-core.wasm")) {
    return "wasm-scalar";
  }
  return null;
}

function readU32Leb128(bytes: Uint8Array, startOffset: number): readonly [number, number] | null {
  let result = 0;
  let shift = 0;
  let offset = startOffset;
  while (offset < bytes.length && shift < 35) {
    const byte = bytes[offset] ?? 0;
    offset += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return [result >>> 0, offset];
    }
    shift += 7;
  }
  return null;
}

/**
 * 컴파일된 `.wasm` 바이너리의 Type·Code 섹션을 경량 스캔해
 * `wasm-relaxed-simd` · `wasm-simd128` · `wasm-scalar` 계층을 판별한다.
 */
export function inferWasmBinaryCpuTier(bytes: Uint8Array): Wasm64ExecutableTier {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    return "wasm-scalar";
  }

  let offset = 8;
  let hasV128Type = false;
  let hasRelaxedOpcode = false;

  while (offset < bytes.length) {
    const sectionId = bytes[offset] ?? 0;
    offset += 1;
    const sizeRead = readU32Leb128(bytes, offset);
    if (!sizeRead) break;
    const [sectionSize, payloadStart] = sizeRead;
    const payloadEnd = payloadStart + sectionSize;
    if (payloadEnd > bytes.length) break;

    if (sectionId === 1) {
      for (let i = payloadStart; i < payloadEnd; i += 1) {
        if (bytes[i] === 0x7b) {
          hasV128Type = true;
          break;
        }
      }
    } else if (sectionId === 10) {
      const bodyCountRead = readU32Leb128(bytes, payloadStart);
      if (bodyCountRead) {
        const [bodyCount, firstBodyOffset] = bodyCountRead;
        let bodyPos = firstBodyOffset;
        for (let fnIdx = 0; fnIdx < bodyCount && bodyPos < payloadEnd; fnIdx += 1) {
          const bodySizeRead = readU32Leb128(bytes, bodyPos);
          if (!bodySizeRead) break;
          const [bodySize, bodyStart] = bodySizeRead;
          const bodyEnd = bodyStart + bodySize;
          if (bodyEnd > payloadEnd) break;

          const declCountRead = readU32Leb128(bytes, bodyStart);
          if (declCountRead) {
            const [declCount, declStart] = declCountRead;
            let q = declStart;
            for (let d = 0; d < declCount && q < bodyEnd; d += 1) {
              const countRead = readU32Leb128(bytes, q);
              if (!countRead) break;
              const valTypePos = countRead[1];
              if (bytes[valTypePos] === 0x7b) {
                hasV128Type = true;
              }
              q = valTypePos + 1;
            }
            if (!hasRelaxedOpcode) {
              for (let i = q; i < bodyEnd - 2; i += 1) {
                if (bytes[i] === 0xfd) {
                  const subRead = readU32Leb128(bytes, i + 1);
                  if (subRead && subRead[0] >= 0x100 && subRead[0] <= 0x114) {
                    hasRelaxedOpcode = true;
                    break;
                  }
                }
              }
            }
          }
          bodyPos = bodyEnd;
        }
      }
    }

    offset = payloadEnd;
  }

  if (!hasV128Type) return "wasm-scalar";
  return hasRelaxedOpcode ? "wasm-relaxed-simd" : "wasm-simd128";
}

/** `Uint8Array` 또는 `ArrayBuffer`를 독립 `ArrayBuffer`로 정규화한다. */
export function normalizeWasmArrayBuffer(wasmBytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (wasmBytes instanceof ArrayBuffer) return wasmBytes;
  if (
    wasmBytes.buffer instanceof ArrayBuffer &&
    wasmBytes.byteOffset === 0 &&
    wasmBytes.byteLength === wasmBytes.buffer.byteLength
  ) {
    return wasmBytes.buffer;
  }
  return new Uint8Array(wasmBytes).buffer;
}

export interface FetchedWasmInstance {
  readonly instance: WebAssembly.Instance;
  readonly byteLength: number;
  readonly loadSource: "instantiate-streaming" | "fetch-array-buffer";
  readonly binaryBytes: Uint8Array | null;
}

/**
 * 지정 URL에서 `.wasm` 바이너리를 가져와 `instantiateStreaming` 우선, 실패 시 `arrayBuffer`로 인스턴스화한다.
 */
export async function fetchAndInstantiateWasmUrl(
  url: string,
  fetchImpl: typeof fetch,
): Promise<FetchedWasmInstance> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Wasm 번들 HTTP ${response.status} 응답 (${url})`);
  }

  const contentType = response.headers?.get("content-type") ?? "";
  const contentLength = Number(response.headers?.get("content-length") ?? 0);
  const canStream =
    typeof WebAssembly.instantiateStreaming === "function" &&
    contentType.toLowerCase().includes("application/wasm") &&
    Number.isFinite(contentLength) &&
    contentLength > 0;

  if (canStream) {
    const cloneForFallback = typeof response.clone === "function" ? response.clone() : null;
    try {
      const streamed = await WebAssembly.instantiateStreaming(Promise.resolve(response), {});
      return {
        instance: streamed.instance,
        byteLength: contentLength,
        loadSource: "instantiate-streaming",
        binaryBytes: null,
      };
    } catch (streamErr) {
      if (cloneForFallback) {
        const buffer = await cloneForFallback.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(buffer, {});
        return {
          instance,
          byteLength: buffer.byteLength,
          loadSource: "fetch-array-buffer",
          binaryBytes: new Uint8Array(buffer),
        };
      }
      throw streamErr instanceof Error
        ? streamErr
        : new Error("instantiateStreaming 실패 및 복제 응답 없음");
    }
  }

  const buffer = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(buffer, {});
  return {
    instance,
    byteLength: buffer.byteLength,
    loadSource: "fetch-array-buffer",
    binaryBytes: new Uint8Array(buffer),
  };
}

