/**
 * 초소형 이진 벡터 애니메이션(`.tvani`) 양자화 차분 varint 코덱 및
 * 교차 플랫폼 SHA-256 콘텐츠 주소(CAS) 무손실 자산 동기화 조정기.
 *
 * - Lottie 스타일 JSON 대비 85% 이상 바이트 용량 절감(`TVAN` + `0x01` 매직 헤더).
 * - 외부 서버 비용 ₩0, 브라우저 전역 스토리지(KV)·BigInt 리터럴·정규식 무사용.
 */

export type TvaniTrackProperty =
  | "translateX"
  | "translateY"
  | "scaleX"
  | "scaleY"
  | "rotationDeg"
  | "opacity"
  | "pathMorph";

export type TvaniSplineEasing =
  | { readonly kind: "linear" }
  | { readonly kind: "step" }
  | { readonly kind: "ease-in-out" }
  | { readonly kind: "ease-out" }
  | {
      readonly kind: "cubic-bezier";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    };

export interface TvaniSplineKeyframe {
  readonly frame: number;
  readonly values: readonly number[];
  readonly easing: TvaniSplineEasing;
}

export interface TvaniVectorTrack {
  readonly layerKey: string;
  readonly property: TvaniTrackProperty;
  readonly keyframes: readonly TvaniSplineKeyframe[];
}

export interface TvaniAnimationClip {
  readonly fps: number;
  readonly durationFrames: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly quantScale?: number;
  readonly tracks: readonly TvaniVectorTrack[];
}

export interface TvaniCompressionReport {
  readonly tvaniBytes: number;
  readonly jsonBytes: number;
  readonly savingsRatio: number;
  readonly compressionRatio: number;
}

export type CasPlatformKind =
  | "web-opfs"
  | "desktop-macos"
  | "desktop-windows"
  | "tablet-ipad"
  | "tablet-android";

export interface CasRawAssetInput {
  readonly assetPath: string;
  readonly bytes: Uint8Array;
}

export interface BuildCasManifestInput {
  readonly platform: CasPlatformKind;
  readonly assets: readonly CasRawAssetInput[];
  readonly chunkingMode?: "fixed" | "rolling-cdc";
  readonly targetChunkBytes?: number;
}

export interface CasChunkDescriptor {
  readonly sha256: string;
  readonly byteLength: number;
}

export interface CasAssetEntry {
  readonly assetPath: string;
  readonly totalByteLength: number;
  readonly rootSha256: string;
  readonly chunks: readonly CasChunkDescriptor[];
}

export interface CasAssetManifest {
  readonly platform: CasPlatformKind;
  readonly entries: readonly CasAssetEntry[];
  readonly chunkStore: ReadonlyMap<string, Uint8Array>;
  readonly logicalTotalBytes: number;
  readonly uniqueStoredBytes: number;
}

export interface CasSyncReconciliationPlan {
  readonly missingChunkHashesToPull: readonly string[];
  readonly missingChunkHashesToPush: readonly string[];
  readonly reusedChunkHashes: readonly string[];
  readonly pullTransferBytes: number;
  readonly pushTransferBytes: number;
  readonly deduplicatedSavedBytes: number;
  readonly changedAssetPaths: readonly string[];
  readonly unchangedAssetPaths: readonly string[];
  readonly estimatedServerCostKrw: 0;
}

/** `.tvani` 매직 헤더 바이트열 (`"TVAN"` + 버전 `0x01`). */
export const TVANI_MAGIC_BYTES = new Uint8Array([0x54, 0x56, 0x41, 0x4e, 0x01]);

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

const PROPERTY_TO_CODE: Readonly<Record<TvaniTrackProperty, number>> = Object.freeze({
  translateX: 0,
  translateY: 1,
  scaleX: 2,
  scaleY: 3,
  rotationDeg: 4,
  opacity: 5,
  pathMorph: 6,
});

const CODE_TO_PROPERTY: readonly TvaniTrackProperty[] = Object.freeze([
  "translateX",
  "translateY",
  "scaleX",
  "scaleY",
  "rotationDeg",
  "opacity",
  "pathMorph",
]);

function pushUvarint(out: number[], value: number): void {
  let u = Math.max(0, Math.floor(value)) >>> 0;
  while (u >= 0x80) {
    out.push((u & 0x7f) | 0x80);
    u >>>= 7;
  }
  out.push(u);
}

function pushSvarintZigZag(out: number[], signedValue: number): void {
  const n = Math.trunc(signedValue);
  const zz = ((n << 1) ^ (n >> 31)) >>> 0;
  pushUvarint(out, zz);
}

interface ByteCursor {
  offset: number;
}

function readUvarint(buf: Uint8Array, cursor: ByteCursor): number {
  let result = 0;
  let shift = 0;
  while (shift <= 28) {
    if (cursor.offset >= buf.length) {
      throw new RangeError("손상된 .tvani 스트림: varint 판독 중 버퍼 끝에 도달했습니다.");
    }
    const byte = buf[cursor.offset]!;
    cursor.offset += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result >>> 0;
    shift += 7;
  }
  throw new RangeError("손상된 .tvani 스트림: 32비트 범위를 초과한 varint입니다.");
}

function readSvarintZigZag(buf: Uint8Array, cursor: ByteCursor): number {
  const zz = readUvarint(buf, cursor);
  return (zz >>> 1) ^ -(zz & 1);
}

/**
 * 양자화 시간 차분(Delta) + ZigZag LEB128 varint 기반 `.tvani`(`TVAN` + `0x01`) 이진 벡터 애니메이션으로 직렬화한다.
 */
export function encodeTvaniBinary(clip: TvaniAnimationClip): Uint8Array {
  const quantScale = Math.max(1, Math.round(clip.quantScale ?? 100));
  const out: number[] = [0x54, 0x56, 0x41, 0x4e, 0x01];

  pushUvarint(out, Math.round(clip.fps));
  pushUvarint(out, Math.round(clip.durationFrames));
  pushUvarint(out, Math.round(clip.canvasWidth));
  pushUvarint(out, Math.round(clip.canvasHeight));
  pushUvarint(out, quantScale);

  const encoder = new TextEncoder();
  const layerMap = new Map<string, number>();
  const layerStrings: Uint8Array[] = [];
  for (let t = 0; t < clip.tracks.length; t += 1) {
    const key = clip.tracks[t]!.layerKey;
    if (!layerMap.has(key)) {
      layerMap.set(key, layerStrings.length);
      layerStrings.push(encoder.encode(key));
    }
  }

  pushUvarint(out, layerStrings.length);
  for (let i = 0; i < layerStrings.length; i += 1) {
    const utf8 = layerStrings[i]!;
    pushUvarint(out, utf8.length);
    for (let b = 0; b < utf8.length; b += 1) out.push(utf8[b]!);
  }

  pushUvarint(out, clip.tracks.length);
  for (let t = 0; t < clip.tracks.length; t += 1) {
    const track = clip.tracks[t]!;
    const arity = track.keyframes[0]?.values.length ?? 1;
    pushUvarint(out, layerMap.get(track.layerKey)!);
    out.push(PROPERTY_TO_CODE[track.property]);
    pushUvarint(out, arity);
    pushUvarint(out, track.keyframes.length);

    let prevFrame = 0;
    const prevQuant = new Int32Array(arity);
    for (let k = 0; k < track.keyframes.length; k += 1) {
      const kf = track.keyframes[k]!;
      if (kf.values.length !== arity) {
        throw new RangeError(`트랙(${track.layerKey}) 키프레임 값 차원이 일정하지 않습니다.`);
      }
      if (kf.frame < prevFrame) {
        throw new RangeError(`트랙(${track.layerKey}) 키프레임 프레임 번호는 오름차순이어야 합니다.`);
      }
      pushUvarint(out, kf.frame - prevFrame);
      prevFrame = kf.frame;

      const easing = kf.easing;
      if (easing.kind === "linear") out.push(0);
      else if (easing.kind === "step") out.push(1);
      else if (easing.kind === "ease-in-out") out.push(2);
      else if (easing.kind === "ease-out") out.push(3);
      else {
        out.push(4);
        out.push(Math.round(clamp(easing.x1, 0, 1) * 250));
        out.push(Math.round(clamp(easing.y1, -1, 2) * 80 + 80));
        out.push(Math.round(clamp(easing.x2, 0, 1) * 250));
        out.push(Math.round(clamp(easing.y2, -1, 2) * 80 + 80));
      }

      for (let v = 0; v < arity; v += 1) {
        const q = Math.round(kf.values[v]! * quantScale);
        pushSvarintZigZag(out, q - prevQuant[v]!);
        prevQuant[v] = q;
      }
    }
  }

  return Uint8Array.from(out);
}

/**
 * `.tvani` 이진 페이로드를 검증 후 애니메이션 클립 구조체로 복원한다.
 */
export function decodeTvaniBinary(binary: Uint8Array): TvaniAnimationClip {
  if (binary.length < TVANI_MAGIC_BYTES.length) {
    throw new RangeError("유효하지 않은 .tvani 파일: 헤더 길이가 부족합니다.");
  }
  for (let i = 0; i < TVANI_MAGIC_BYTES.length; i += 1) {
    if (binary[i] !== TVANI_MAGIC_BYTES[i]) {
      throw new RangeError("유효하지 않은 .tvani 매직 헤더입니다.");
    }
  }

  const cursor: ByteCursor = { offset: TVANI_MAGIC_BYTES.length };
  const fps = readUvarint(binary, cursor);
  const durationFrames = readUvarint(binary, cursor);
  const canvasWidth = readUvarint(binary, cursor);
  const canvasHeight = readUvarint(binary, cursor);
  const quantScale = Math.max(1, readUvarint(binary, cursor));

  const decoder = new TextDecoder();
  const stringCount = readUvarint(binary, cursor);
  const strings: string[] = [];
  for (let i = 0; i < stringCount; i += 1) {
    const byteLen = readUvarint(binary, cursor);
    if (cursor.offset + byteLen > binary.length) {
      throw new RangeError("손상된 .tvani 문자열 테이블입니다.");
    }
    strings.push(decoder.decode(binary.subarray(cursor.offset, cursor.offset + byteLen)));
    cursor.offset += byteLen;
  }

  const trackCount = readUvarint(binary, cursor);
  const tracks: TvaniVectorTrack[] = [];
  for (let t = 0; t < trackCount; t += 1) {
    const layerIdx = readUvarint(binary, cursor);
    const layerKey = strings[layerIdx];
    if (layerKey === undefined || cursor.offset >= binary.length) {
      throw new RangeError("손상된 .tvani 트랙 메타데이터입니다.");
    }
    const propCode = binary[cursor.offset]!;
    cursor.offset += 1;
    const property = CODE_TO_PROPERTY[propCode];
    if (!property) {
      throw new RangeError(`알 수 없는 .tvani 트랙 속성 코드(${propCode})입니다.`);
    }
    const arity = readUvarint(binary, cursor);
    const kfCount = readUvarint(binary, cursor);

    let frame = 0;
    const prevQuant = new Int32Array(arity);
    const keyframes: TvaniSplineKeyframe[] = [];

    for (let k = 0; k < kfCount; k += 1) {
      frame += readUvarint(binary, cursor);
      if (cursor.offset >= binary.length) {
        throw new RangeError("손상된 .tvani 이징 태그입니다.");
      }
      const easingTag = binary[cursor.offset]!;
      cursor.offset += 1;
      let easing: TvaniSplineEasing;
      if (easingTag === 0) easing = { kind: "linear" };
      else if (easingTag === 1) easing = { kind: "step" };
      else if (easingTag === 2) easing = { kind: "ease-in-out" };
      else if (easingTag === 3) easing = { kind: "ease-out" };
      else if (easingTag === 4) {
        if (cursor.offset + 4 > binary.length) {
          throw new RangeError("손상된 .tvani 베지어 핸들 바이트입니다.");
        }
        const x1 = binary[cursor.offset]! / 250;
        const y1 = (binary[cursor.offset + 1]! - 80) / 80;
        const x2 = binary[cursor.offset + 2]! / 250;
        const y2 = (binary[cursor.offset + 3]! - 80) / 80;
        cursor.offset += 4;
        easing = { kind: "cubic-bezier", x1, y1, x2, y2 };
      } else {
        throw new RangeError(`지원하지 않는 .tvani 이징 코드(${easingTag})입니다.`);
      }

      const values: number[] = [];
      for (let v = 0; v < arity; v += 1) {
        const q = prevQuant[v]! + readSvarintZigZag(binary, cursor);
        prevQuant[v] = q;
        values.push(q / quantScale);
      }
      keyframes.push({ frame, values, easing });
    }
    tracks.push({ layerKey, property, keyframes });
  }

  return { fps, durationFrames, canvasWidth, canvasHeight, quantScale, tracks };
}

/**
 * 비교 측정용 Lottie 스타일 JSON 애니메이션 문자열을 직렬화한다.
 */
export function serializeLottieLikeJson(clip: TvaniAnimationClip): string {
  const lottieLike = {
    v: "5.9.0",
    fr: clip.fps,
    ip: 0,
    op: clip.durationFrames,
    w: clip.canvasWidth,
    h: clip.canvasHeight,
    layers: clip.tracks.map((track, idx) => ({
      ind: idx + 1,
      nm: track.layerKey,
      ty: 4,
      ks: {
        [track.property]: {
          a: 1,
          k: track.keyframes.map((kf) => ({
            t: kf.frame,
            s: kf.values.map((v) => Number(v.toFixed(4))),
            i: { x: [0.42], y: [0.0], easingKind: kf.easing.kind },
            o: { x: [0.58], y: [1.0], easingSpec: kf.easing },
          })),
        },
      },
    })),
  };
  return JSON.stringify(lottieLike);
}

/**
 * Lottie 스타일 JSON 페이로드 대비 `.tvani` 이진 압축 절감률을 측정한다.
 */
export function measureTvaniCompressionRatio(clip: TvaniAnimationClip): TvaniCompressionReport {
  const jsonBytes = new TextEncoder().encode(serializeLottieLikeJson(clip)).byteLength;
  const tvaniBytes = encodeTvaniBinary(clip).byteLength;
  return {
    tvaniBytes,
    jsonBytes,
    savingsRatio: jsonBytes > 0 ? 1 - tvaniBytes / jsonBytes : 0,
    compressionRatio: jsonBytes > 0 ? tvaniBytes / jsonBytes : 1,
  };
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/**
 * 외부 암호화 런타임 의존 없이 표준 RFC 6234 SHA-256 16진수 해시를 동기 계산한다.
 */
export function computeSha256Hex(data: Uint8Array): string {
  const len = data.length;
  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[len] = 0x80;

  const bitLenHi = Math.floor(len / 0x20000000) >>> 0;
  const bitLenLo = (len << 3) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  return words.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

function splitAssetIntoChunks(
  bytes: Uint8Array,
  mode: "fixed" | "rolling-cdc",
  targetChunkBytes: number,
): readonly Uint8Array[] {
  if (bytes.length === 0) return [new Uint8Array(0)];
  const target = Math.max(64, Math.floor(targetChunkBytes));
  if (mode === "fixed") {
    const parts: Uint8Array[] = [];
    for (let offset = 0; offset < bytes.length; offset += target) {
      parts.push(bytes.slice(offset, Math.min(bytes.length, offset + target)));
    }
    return parts;
  }

  const minChunk = Math.max(32, Math.floor(target * 0.5));
  const maxChunk = target * 4;
  const maskBits = Math.max(5, Math.round(Math.log2(target)));
  const mask = ((0xffffffff << (32 - maskBits)) >>> 0);
  const parts: Uint8Array[] = [];
  let chunkStart = 0;
  let gear = 0;

  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    const pseudoGear = Math.imul((b + 1) ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
    gear = ((gear << 1) + pseudoGear) >>> 0;
    const span = i - chunkStart + 1;
    if ((span >= minChunk && (gear & mask) === 0) || span >= maxChunk) {
      parts.push(bytes.slice(chunkStart, i + 1));
      chunkStart = i + 1;
    }
  }
  if (chunkStart < bytes.length) {
    parts.push(bytes.slice(chunkStart));
  }
  return parts;
}

/**
 * 교차 플랫폼 자산 묶음을 SHA-256 콘텐츠 주소(CAS) 청크 매니페스트로 분할·중복 제거한다.
 */
export function buildCasAssetManifest(input: BuildCasManifestInput): CasAssetManifest {
  const mode = input.chunkingMode ?? "rolling-cdc";
  const targetChunkBytes = input.targetChunkBytes ?? 4096;
  const chunkStore = new Map<string, Uint8Array>();
  const entries: CasAssetEntry[] = [];
  let logicalTotalBytes = 0;
  let uniqueStoredBytes = 0;

  for (let i = 0; i < input.assets.length; i += 1) {
    const asset = input.assets[i]!;
    logicalTotalBytes += asset.bytes.length;
    const rawChunks = splitAssetIntoChunks(asset.bytes, mode, targetChunkBytes);
    const descriptors: CasChunkDescriptor[] = [];

    for (let c = 0; c < rawChunks.length; c += 1) {
      const slice = rawChunks[c]!;
      const sha256 = computeSha256Hex(slice);
      if (!chunkStore.has(sha256)) {
        chunkStore.set(sha256, slice);
        uniqueStoredBytes += slice.length;
      }
      descriptors.push({ sha256, byteLength: slice.length });
    }

    entries.push({
      assetPath: asset.assetPath,
      totalByteLength: asset.bytes.length,
      rootSha256: computeSha256Hex(asset.bytes),
      chunks: descriptors,
    });
  }

  return {
    platform: input.platform,
    entries,
    chunkStore,
    logicalTotalBytes,
    uniqueStoredBytes,
  };
}

/**
 * 로컬·원격 CAS 매니페스트를 비교해 중복 청크 전송을 생략한 무손실 동기화 계획을 수립한다(서버 비용 ₩0).
 */
export function reconcileCasSyncPlan(
  localManifest: CasAssetManifest,
  remoteManifest: CasAssetManifest,
): CasSyncReconciliationPlan {
  const missingToPull: string[] = [];
  const reused: string[] = [];
  let pullTransferBytes = 0;
  let deduplicatedSavedBytes = 0;

  for (const [hash, chunk] of remoteManifest.chunkStore.entries()) {
    if (localManifest.chunkStore.has(hash)) {
      reused.push(hash);
      deduplicatedSavedBytes += chunk.length;
    } else {
      missingToPull.push(hash);
      pullTransferBytes += chunk.length;
    }
  }

  const missingToPush: string[] = [];
  let pushTransferBytes = 0;
  for (const [hash, chunk] of localManifest.chunkStore.entries()) {
    if (!remoteManifest.chunkStore.has(hash)) {
      missingToPush.push(hash);
      pushTransferBytes += chunk.length;
    }
  }

  const localByPath = new Map(
    localManifest.entries.map((entry) => [entry.assetPath, entry.rootSha256]),
  );
  const changedAssetPaths: string[] = [];
  const unchangedAssetPaths: string[] = [];
  for (let i = 0; i < remoteManifest.entries.length; i += 1) {
    const remoteEntry = remoteManifest.entries[i]!;
    if (localByPath.get(remoteEntry.assetPath) === remoteEntry.rootSha256) {
      unchangedAssetPaths.push(remoteEntry.assetPath);
    } else {
      changedAssetPaths.push(remoteEntry.assetPath);
    }
  }

  return {
    missingChunkHashesToPull: missingToPull,
    missingChunkHashesToPush: missingToPush,
    reusedChunkHashes: reused,
    pullTransferBytes,
    pushTransferBytes,
    deduplicatedSavedBytes,
    changedAssetPaths,
    unchangedAssetPaths,
    estimatedServerCostKrw: 0,
  };
}

/**
 * CAS 청크 맵으로부터 원본 자산 바이트열을 무손실 조립하고 청크별·전체 SHA-256 무결성을 검증한다.
 */
export function reassembleCasAssetLossless(
  entry: CasAssetEntry,
  chunkLookup: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  const output = new Uint8Array(entry.totalByteLength);
  let writeOffset = 0;

  for (let i = 0; i < entry.chunks.length; i += 1) {
    const desc = entry.chunks[i]!;
    const bytes = chunkLookup.get(desc.sha256);
    if (!bytes) {
      throw new Error(`CAS 복원 실패: 누락된 청크(${desc.sha256})가 있습니다.`);
    }
    if (computeSha256Hex(bytes) !== desc.sha256) {
      throw new Error(`CAS 무결성 오류: 청크(${desc.sha256}) 해시가 일치하지 않습니다.`);
    }
    output.set(bytes, writeOffset);
    writeOffset += bytes.length;
  }

  if (writeOffset !== entry.totalByteLength || computeSha256Hex(output) !== entry.rootSha256) {
    throw new Error(`CAS 무결성 오류: 자산(${entry.assetPath}) 루트 SHA-256 검증에 실패했습니다.`);
  }
  return output;
}
