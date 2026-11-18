/**
 * Studio Animated WebP Muxer — RFC 9649 / Google WebP Extended Container(`RIFF`/`WEBP`)
 * 순수 바이너리 멀티플렉서(`muxAnimatedWebpFrames`) 및 검증 파서(`parseAnimatedWebpSummary`).
 *
 * 컨테이너 구조:
 * - `RIFF` + 32-bit LE 파일 크기(`totalLength - 8`) + `WEBP`
 * - `VP8X` (10바이트): Animation 플래그(`0x02`) + 선택적 Alpha 플래그(`0x10`), 24-bit LE `(canvasWidth - 1)`·`(canvasHeight - 1)`
 * - `ANIM` (6바이트): `[B, G, R, A]` 배경색(BGRA 바이트 순서) + 16-bit LE `loopCount` (`0` = 무한 반복)
 * - 프레임별 `ANMF`: 16바이트 헤더(`x/2`, `y/2`, `w-1`, `h-1`, `durationMs` 24-bit LE, `blend|dispose` 플래그) +
 *   단일 프레임 WebP에서 추출한 `ALPH`(선택) + `VP8 `/`VP8L`(필수) 서브청크 (홀수 바이트 길이는 `0x00` 짝수 패딩)
 *
 * REA 근거(clean-room binary container spec):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_c10045d52f80466e2efbf42d666690099f787c85c31682edf4b202e78622f2f1
 */

export type WebpFrameBlendMode = "alpha-blend" | "do-not-blend";
export type WebpFrameDisposeMode = "none" | "background";

export interface AnimatedWebpFrameInput {
  /** 단일 정지 프레임 `RIFF....WEBP` 바이트 배열. */
  readonly webpBytes: Uint8Array;
  /** 프레임 노출 시간(ms, 24-bit 무부호 정수 범위 `0..16777215`). */
  readonly durationMs: number;
  /** 캔버스 내 짝수 X 오프셋(px, 기본 0). */
  readonly x?: number;
  /** 캔버스 내 짝수 Y 오프셋(px, 기본 0). */
  readonly y?: number;
  /** 프레임 폭(생략 시 단일 WebP 비트스트림에서 자동 추출). */
  readonly width?: number;
  /** 프레임 높이(생략 시 단일 WebP 비트스트림에서 자동 추출). */
  readonly height?: number;
  readonly blend?: WebpFrameBlendMode;
  readonly dispose?: WebpFrameDisposeMode;
}

export interface MuxAnimatedWebpOptions {
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  /** 반복 횟수 (`0` = 무한 반복, 기본 `0`). */
  readonly loopCount?: number;
  /** `ANIM` 청크 배경색 `[B, G, R, A]` (기본 `[0, 0, 0, 0]`). */
  readonly backgroundBgra?: readonly [number, number, number, number];
  /** 명시적 알파 플래그 강제 여부 (미지정 시 `ALPH` 또는 `VP8L` 알파 비트에서 자동 감지). */
  readonly hasAlpha?: boolean;
}

export interface AnimatedWebpFrameSummary {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly blend: WebpFrameBlendMode;
  readonly dispose: WebpFrameDisposeMode;
  readonly hasAlphChunk: boolean;
  readonly bitstreamFourCC: "VP8 " | "VP8L";
  readonly bitstreamByteLength: number;
}

export interface AnimatedWebpSummary {
  readonly byteLength: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly hasAnimationFlag: boolean;
  readonly hasAlphaFlag: boolean;
  readonly backgroundBgra: readonly [number, number, number, number];
  readonly loopCount: number;
  readonly totalDurationMs: number;
  readonly frameCount: number;
  readonly frames: readonly AnimatedWebpFrameSummary[];
}

interface RawRiffChunk {
  readonly fourCC: string;
  readonly data: Uint8Array;
}

interface ExtractedSingleFrameWebp {
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly alphPayload: Uint8Array | null;
  readonly bitstreamFourCC: "VP8 " | "VP8L";
  readonly bitstreamPayload: Uint8Array;
}

const MAX_UINT24 = 0xffffff;

const VP8X_FLAG_ANIMATION = 0x02;
const VP8X_FLAG_ALPHA = 0x10;
const ANMF_FLAG_DO_NOT_BLEND = 0x02;
const ANMF_FLAG_DISPOSE_BACKGROUND = 0x01;

function readFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function writeFourCC(target: Uint8Array, offset: number, fourCC: string): void {
  target[offset] = fourCC.charCodeAt(0) & 0xff;
  target[offset + 1] = fourCC.charCodeAt(1) & 0xff;
  target[offset + 2] = fourCC.charCodeAt(2) & 0xff;
  target[offset + 3] = fourCC.charCodeAt(3) & 0xff;
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function writeUint24LE(target: Uint8Array, offset: number, value: number): void {
  const clamped = Math.max(0, Math.min(MAX_UINT24, Math.floor(value)));
  target[offset] = clamped & 0xff;
  target[offset + 1] = (clamped >>> 8) & 0xff;
  target[offset + 2] = (clamped >>> 16) & 0xff;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  const u = value >>> 0;
  target[offset] = u & 0xff;
  target[offset + 1] = (u >>> 8) & 0xff;
  target[offset + 2] = (u >>> 16) & 0xff;
  target[offset + 3] = (u >>> 24) & 0xff;
}

/** 짝수 바이트 패딩을 포함한 단일 RIFF 청크 직렬화. */
function buildRiffChunk(fourCC: string, payload: Uint8Array): Uint8Array {
  const pad = payload.byteLength & 1;
  const out = new Uint8Array(8 + payload.byteLength + pad);
  writeFourCC(out, 0, fourCC);
  writeUint32LE(out, 4, payload.byteLength);
  out.set(payload, 8);
  if (pad === 1) out[8 + payload.byteLength] = 0;
  return out;
}

function walkRiffSubchunks(
  bytes: Uint8Array,
  startOffset: number,
  endOffset: number,
): RawRiffChunk[] {
  const chunks: RawRiffChunk[] = [];
  let cursor = startOffset;
  while (cursor + 8 <= endOffset) {
    const fourCC = readFourCC(bytes, cursor);
    const size = readUint32LE(bytes, cursor + 4);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > endOffset) {
      throw new Error(`WebP 청크("${fourCC}") 크기가 컨테이너 경계를 초과합니다.`);
    }
    const pad = size & 1;
    if (pad === 1 && dataEnd >= endOffset) {
      throw new Error(`WebP 홀수 길이 청크("${fourCC}")의 RIFF 짝수 패딩 바이트가 누락되었습니다.`);
    }
    chunks.push({ fourCC, data: bytes.subarray(dataStart, dataEnd) });
    cursor = dataEnd + pad;
  }
  if (cursor !== endOffset) {
    throw new Error("WebP 컨테이너 끝부분에 정렬되지 않은 잔여 바이트가 있습니다.");
  }
  return chunks;
}

function parseVp8LossyDims(payload: Uint8Array): { width: number; height: number } | null {
  // VP8 키프레임: frame_tag(3B, bit0 === 0 keyframe) + start code 0x9d 0x01 0x2a + 16-bit LE w/h(하위 14비트)
  if (payload.byteLength < 10) return null;
  if ((payload[0]! & 0x01) !== 0) return null;
  if (payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) return null;
  const width = (payload[6]! | (payload[7]! << 8)) & 0x3fff;
  const height = (payload[8]! | (payload[9]! << 8)) & 0x3fff;
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseVp8LosslessHeader(
  payload: Uint8Array,
): { width: number; height: number; alphaIsUsed: boolean } | null {
  // VP8L: signature 0x2f (1B) + 32-bit LE packed(14-bit w-1, 14-bit h-1, 1-bit alpha_is_used, 3-bit version=0)
  if (payload.byteLength < 5 || payload[0] !== 0x2f) return null;
  const bits = readUint32LE(payload, 1);
  const width = (bits & 0x3fff) + 1;
  const height = ((bits >>> 14) & 0x3fff) + 1;
  const alphaIsUsed = ((bits >>> 28) & 0x01) === 1;
  return { width, height, alphaIsUsed };
}

function extractSingleFrameWebp(
  webpBytes: Uint8Array,
  overrideWidth?: number,
  overrideHeight?: number,
): ExtractedSingleFrameWebp {
  if (webpBytes.byteLength < 20) {
    throw new Error("입력 WebP 프레임 바이트가 너무 짧습니다.");
  }
  if (readFourCC(webpBytes, 0) !== "RIFF" || readFourCC(webpBytes, 8) !== "WEBP") {
    throw new Error("입력 프레임이 올바른 RIFF/WEBP 시그니처를 갖지 않습니다.");
  }
  const declaredFileSize = readUint32LE(webpBytes, 4);
  const riffEnd = Math.min(webpBytes.byteLength, 8 + declaredFileSize + (declaredFileSize & 1));
  const chunks = walkRiffSubchunks(webpBytes, 12, riffEnd);

  let vp8xWidth = 0;
  let vp8xHeight = 0;
  let vp8xAlpha = false;
  let alphPayload: Uint8Array | null = null;
  let bitstreamFourCC: "VP8 " | "VP8L" | null = null;
  let bitstreamPayload: Uint8Array | null = null;

  for (const ch of chunks) {
    if (ch.fourCC === "ANMF" || ch.fourCC === "ANIM") {
      throw new Error("ANMF 입력으로는 단일 정지 프레임 WebP만 허용됩니다.");
    }
    if (ch.fourCC === "VP8X" && ch.data.byteLength >= 10) {
      vp8xAlpha = (ch.data[0]! & VP8X_FLAG_ALPHA) !== 0;
      vp8xWidth = readUint24LE(ch.data, 4) + 1;
      vp8xHeight = readUint24LE(ch.data, 7) + 1;
    } else if (ch.fourCC === "ALPH") {
      alphPayload = ch.data;
    } else if ((ch.fourCC === "VP8 " || ch.fourCC === "VP8L") && bitstreamPayload === null) {
      bitstreamFourCC = ch.fourCC;
      bitstreamPayload = ch.data;
    }
  }

  if (!bitstreamFourCC || !bitstreamPayload) {
    throw new Error("입력 WebP에서 VP8 또는 VP8L 비트스트림 청크를 찾을 수 없습니다.");
  }

  let parsedW = vp8xWidth;
  let parsedH = vp8xHeight;
  let losslessAlpha = false;

  if (bitstreamFourCC === "VP8L") {
    const hdr = parseVp8LosslessHeader(bitstreamPayload);
    if (hdr) {
      parsedW = parsedW || hdr.width;
      parsedH = parsedH || hdr.height;
      losslessAlpha = hdr.alphaIsUsed;
    }
  } else {
    const hdr = parseVp8LossyDims(bitstreamPayload);
    if (hdr) {
      parsedW = parsedW || hdr.width;
      parsedH = parsedH || hdr.height;
    }
  }

  const width = Math.floor(overrideWidth ?? parsedW);
  const height = Math.floor(overrideHeight ?? parsedH);
  if (!Number.isFinite(width) || width < 1 || width > MAX_UINT24 + 1) {
    throw new Error("WebP 프레임 폭을 결정할 수 없거나 유효 범위를 벗어났습니다.");
  }
  if (!Number.isFinite(height) || height < 1 || height > MAX_UINT24 + 1) {
    throw new Error("WebP 프레임 높이를 결정할 수 없거나 유효 범위를 벗어났습니다.");
  }

  return {
    width,
    height,
    hasAlpha: vp8xAlpha || alphPayload !== null || losslessAlpha,
    alphPayload,
    bitstreamFourCC,
    bitstreamPayload,
  };
}

function concatByteArrays(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.byteLength;
  }
  return merged;
}

/**
 * 단일 프레임 WebP 배열을 `VP8X` + `ANIM` + `ANMF*` 구조의 애니메이션 WebP 컨테이너로 조립한다.
 */
export function muxAnimatedWebpFrames(
  frames: readonly AnimatedWebpFrameInput[],
  options: MuxAnimatedWebpOptions = {},
): Uint8Array {
  if (frames.length === 0) {
    throw new Error("애니메이션 WebP를 생성하려면 최소 1개 이상의 프레임이 필요합니다.");
  }

  const extracted = frames.map((f) => extractSingleFrameWebp(f.webpBytes, f.width, f.height));

  let maxRight = 0;
  let maxBottom = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i]!;
    const ext = extracted[i]!;
    const x = f.x ?? 0;
    const y = f.y ?? 0;
    if (!Number.isInteger(x) || x < 0 || x % 2 !== 0) {
      throw new Error(`ANMF 프레임[${i}] X 오프셋(${x})은 0 이상의 짝수 픽셀이어야 합니다.`);
    }
    if (!Number.isInteger(y) || y < 0 || y % 2 !== 0) {
      throw new Error(`ANMF 프레임[${i}] Y 오프셋(${y})은 0 이상의 짝수 픽셀이어야 합니다.`);
    }
    maxRight = Math.max(maxRight, x + ext.width);
    maxBottom = Math.max(maxBottom, y + ext.height);
  }

  const canvasWidth = Math.floor(options.canvasWidth ?? maxRight);
  const canvasHeight = Math.floor(options.canvasHeight ?? maxBottom);
  if (canvasWidth < maxRight || canvasHeight < maxBottom) {
    throw new Error("지정한 캔버스 크기가 ANMF 프레임 영역보다 작습니다.");
  }
  if (canvasWidth < 1 || canvasWidth > MAX_UINT24 + 1 || canvasHeight < 1 || canvasHeight > MAX_UINT24 + 1) {
    throw new Error("WebP 캔버스 해상도가 24-bit 한도를 벗어났습니다.");
  }

  const anyAlpha = options.hasAlpha ?? extracted.some((e) => e.hasAlpha);
  const bg = options.backgroundBgra ?? [0, 0, 0, 0];
  const loopCount = Math.max(0, Math.min(0xffff, Math.round(options.loopCount ?? 0)));

  // 1. VP8X (10 bytes)
  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = VP8X_FLAG_ANIMATION | (anyAlpha ? VP8X_FLAG_ALPHA : 0);
  writeUint24LE(vp8xPayload, 4, canvasWidth - 1);
  writeUint24LE(vp8xPayload, 7, canvasHeight - 1);
  const vp8xChunk = buildRiffChunk("VP8X", vp8xPayload);

  // 2. ANIM (6 bytes: BGRA + loopCount u16 LE)
  const animPayload = new Uint8Array(6);
  animPayload[0] = bg[0] & 0xff;
  animPayload[1] = bg[1] & 0xff;
  animPayload[2] = bg[2] & 0xff;
  animPayload[3] = bg[3] & 0xff;
  animPayload[4] = loopCount & 0xff;
  animPayload[5] = (loopCount >>> 8) & 0xff;
  const animChunk = buildRiffChunk("ANIM", animPayload);

  // 3. ANMF per frame
  const anmfChunks: Uint8Array[] = [];
  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i]!;
    const ext = extracted[i]!;
    const x = f.x ?? 0;
    const y = f.y ?? 0;
    const duration = Math.max(0, Math.min(MAX_UINT24, Math.round(f.durationMs)));
    const flags =
      (f.blend === "do-not-blend" ? ANMF_FLAG_DO_NOT_BLEND : 0) |
      (f.dispose === "background" ? ANMF_FLAG_DISPOSE_BACKGROUND : 0);

    const anmfHeader = new Uint8Array(16);
    writeUint24LE(anmfHeader, 0, x / 2);
    writeUint24LE(anmfHeader, 3, y / 2);
    writeUint24LE(anmfHeader, 6, ext.width - 1);
    writeUint24LE(anmfHeader, 9, ext.height - 1);
    writeUint24LE(anmfHeader, 12, duration);
    anmfHeader[15] = flags;

    const subChunks: Uint8Array[] = [anmfHeader];
    if (ext.alphPayload) {
      subChunks.push(buildRiffChunk("ALPH", ext.alphPayload));
    }
    subChunks.push(buildRiffChunk(ext.bitstreamFourCC, ext.bitstreamPayload));

    anmfChunks.push(buildRiffChunk("ANMF", concatByteArrays(subChunks)));
  }

  const body = concatByteArrays([vp8xChunk, animChunk, ...anmfChunks]);
  const riff = new Uint8Array(12 + body.byteLength);
  writeFourCC(riff, 0, "RIFF");
  writeUint32LE(riff, 4, 4 + body.byteLength);
  writeFourCC(riff, 8, "WEBP");
  riff.set(body, 12);
  return riff;
}

/**
 * 조립된 애니메이션 WebP 바이트 열의 RIFF/VP8X/ANIM/ANMF 무결성을 검증하고 메타 요약을 반환한다.
 */
export function parseAnimatedWebpSummary(bytes: Uint8Array): AnimatedWebpSummary {
  if (bytes.byteLength < 30) {
    throw new Error("애니메이션 WebP 컨테이너 바이트 길이가 너무 짧습니다.");
  }
  if (readFourCC(bytes, 0) !== "RIFF" || readFourCC(bytes, 8) !== "WEBP") {
    throw new Error("RIFF/WEBP 시그니처가 일치하지 않습니다.");
  }
  const riffSize = readUint32LE(bytes, 4);
  if (riffSize + 8 !== bytes.byteLength) {
    throw new Error(`RIFF 선언 크기(${riffSize + 8})와 실제 바이트 수(${bytes.byteLength})가 다릅니다.`);
  }

  const topChunks = walkRiffSubchunks(bytes, 12, bytes.byteLength);
  const vp8x = topChunks.find((c) => c.fourCC === "VP8X");
  if (!vp8x || vp8x.data.byteLength !== 10) {
    throw new Error("유효한 VP8X(10바이트) 청크가 없습니다.");
  }
  const flags = vp8x.data[0]!;
  const hasAnimationFlag = (flags & VP8X_FLAG_ANIMATION) !== 0;
  const hasAlphaFlag = (flags & VP8X_FLAG_ALPHA) !== 0;
  const canvasWidth = readUint24LE(vp8x.data, 4) + 1;
  const canvasHeight = readUint24LE(vp8x.data, 7) + 1;

  const anim = topChunks.find((c) => c.fourCC === "ANIM");
  if (!anim || anim.data.byteLength !== 6) {
    throw new Error("유효한 ANIM(6바이트) 청크가 없습니다.");
  }
  const backgroundBgra: readonly [number, number, number, number] = [
    anim.data[0]!,
    anim.data[1]!,
    anim.data[2]!,
    anim.data[3]!,
  ];
  const loopCount = anim.data[4]! | (anim.data[5]! << 8);

  const frames: AnimatedWebpFrameSummary[] = [];
  let frameIdx = 0;
  for (const chunk of topChunks) {
    if (chunk.fourCC !== "ANMF") continue;
    if (chunk.data.byteLength < 24) {
      throw new Error(`ANMF[${frameIdx}] 청크 길이가 최소 헤더보다 짧습니다.`);
    }
    const x = readUint24LE(chunk.data, 0) * 2;
    const y = readUint24LE(chunk.data, 3) * 2;
    const width = readUint24LE(chunk.data, 6) + 1;
    const height = readUint24LE(chunk.data, 9) + 1;
    const durationMs = readUint24LE(chunk.data, 12);
    const fFlags = chunk.data[15]!;
    const blend: WebpFrameBlendMode =
      (fFlags & ANMF_FLAG_DO_NOT_BLEND) !== 0 ? "do-not-blend" : "alpha-blend";
    const dispose: WebpFrameDisposeMode =
      (fFlags & ANMF_FLAG_DISPOSE_BACKGROUND) !== 0 ? "background" : "none";

    const innerChunks = walkRiffSubchunks(chunk.data, 16, chunk.data.byteLength);
    const hasAlphChunk = innerChunks.some((ic) => ic.fourCC === "ALPH");
    const bitstream = innerChunks.find((ic) => ic.fourCC === "VP8 " || ic.fourCC === "VP8L");
    if (!bitstream || (bitstream.fourCC !== "VP8 " && bitstream.fourCC !== "VP8L")) {
      throw new Error(`ANMF[${frameIdx}] 내부에 VP8/VP8L 비트스트림이 없습니다.`);
    }

    frames.push({
      index: frameIdx,
      x,
      y,
      width,
      height,
      durationMs,
      blend,
      dispose,
      hasAlphChunk,
      bitstreamFourCC: bitstream.fourCC,
      bitstreamByteLength: bitstream.data.byteLength,
    });
    frameIdx += 1;
  }

  if (frames.length === 0) {
    throw new Error("애니메이션 WebP에 ANMF 프레임이 하나도 없습니다.");
  }

  return {
    byteLength: bytes.byteLength,
    canvasWidth,
    canvasHeight,
    hasAnimationFlag,
    hasAlphaFlag,
    backgroundBgra,
    loopCount,
    totalDurationMs: frames.reduce((acc, item) => acc + item.durationMs, 0),
    frameCount: frames.length,
    frames,
  };
}
