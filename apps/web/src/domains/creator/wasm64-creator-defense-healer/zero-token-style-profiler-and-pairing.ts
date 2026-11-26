/**
 * 제로-토큰(0 AI Token) 작가 화풍 프로파일러 & ₩0 저지연 PC↔태블릿/모바일 컴패니언 페어링.
 *
 * - `ArtistStyleProfiler`(`./artist-style-profiler` 재수출): 작가의 과거 원고 RGBA 타일을
 *   로컬에서 직접 분석해 선 굵기·OKLCH 팔레트·명암 대비·스크린톤 밀도와 컷별 프리셋을 생성한다.
 * - `ZeroLagDevicePairingSession`: 6자리 SAS 인증 핸드셰이크, `<= 16 KiB` DataChannel 프레임
 *   규격의 서브프레임 XOR+RLE 더티 타일 미러링, 스타일러스·터치 저지연 입력 릴레이를 서버 비용 ₩0으로 제공한다.
 */

export {
  ArtistStyleProfiler,
  srgbToOklch,
  type ArtistBrushPreset,
  type ArtistLightingPreset,
  type ArtistStyleProfile,
  type ArtistTonePreset,
  type ContrastCurveProfile,
  type EmittedCutStylePreset,
  type LightingMoodKind,
  type LineStyleKind,
  type OklchSwatch,
  type PaletteHarmonyKind,
  type StyleCutContext,
} from "./artist-style-profiler";

export const MAX_DATACHANNEL_FRAME_BYTES = 16 * 1024;
export const DEFAULT_MIRROR_TILE_SIZE = 32;
const MIRROR_FRAME_HEADER_BYTES = 24;
const INPUT_PACKET_BYTES = 28;
const MIRROR_MAGIC = 0x54534d31; // TSM1
const INPUT_MAGIC = 0x54534931; // TSI1

export type PairingRole = "pc-host" | "tablet-companion";
export type PairingState = "idle" | "awaiting-sas" | "paired" | "rejected";
export type CompanionInputType = "down" | "move" | "up" | "hover" | "pinch" | "undo-gesture";

export interface PairingOffer {
  readonly sessionId: string;
  readonly hostDeviceId: string;
  readonly hostNonceHex: string;
  readonly hostPublicTokenHex: string;
}

export interface PairingAnswer {
  readonly sessionId: string;
  readonly companionDeviceId: string;
  readonly companionNonceHex: string;
  readonly companionPublicTokenHex: string;
  readonly sasCode: string;
}

export interface MirrorFrameBatch {
  readonly frameSeq: number;
  readonly frames: readonly Uint8Array[];
  readonly dirtyTileCount: number;
  readonly totalTileCount: number;
  readonly rawDirtyBytes: number;
  readonly compressedBytes: number;
  readonly maxFrameBytes: number;
  readonly compressionRatio: number;
  readonly encodeDurationMs: number;
}

export interface MirrorReceiveReport {
  readonly frameSeq: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileW: number;
  readonly tileH: number;
  readonly completedTile: boolean;
  readonly decodeDurationMs: number;
}

export interface CompanionStylusInput {
  readonly type: CompanionInputType;
  readonly pointerId: number;
  readonly xNorm: number;
  readonly yNorm: number;
  readonly pressure: number;
  readonly tiltXDeg: number;
  readonly tiltYDeg: number;
  readonly twistDeg: number;
  readonly clientTimestampUs: number;
}

export interface RelayedStylusEvent extends CompanionStylusInput {
  readonly inputSeq: number;
  readonly canvasX: number;
  readonly canvasY: number;
  readonly packetBytes: number;
  readonly relayLatencyMs: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function mixU32(x: number): number {
  let v = x >>> 0;
  v = (v ^ (v >>> 16)) >>> 0;
  v = Math.imul(v, 0x7feb352d) >>> 0;
  v = (v ^ (v >>> 15)) >>> 0;
  v = Math.imul(v, 0x846ca68b) >>> 0;
  return (v ^ (v >>> 16)) >>> 0;
}

function hashStringU32(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul((h ^ (text.charCodeAt(i) & 0xff)) >>> 0, 0x01000193) >>> 0;
    h = Math.imul((h ^ ((text.charCodeAt(i) >>> 8) & 0xff)) >>> 0, 0x01000193) >>> 0;
  }
  return mixU32(h);
}

function toHex8(v: number): string {
  return (v >>> 0).toString(16).padStart(8, "0");
}

function crc16Frame(bytes: Uint8Array, length: number): number {
  let crc = 0xffff;
  for (let i = 0; i < length; i += 1) {
    crc ^= (bytes[i] << 8) & 0xffff;
    for (let b = 0; b < 8; b += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** 이전 타일과의 XOR 차분을 PackBits 제어 바이트 RLE로 무손실 압축한다. */
export function encodeXorRle(previous: Uint8Array, current: Uint8Array): Uint8Array {
  if (previous.length !== current.length) {
    throw new Error("XOR+RLE 인코딩 대상 버퍼 길이가 일치하지 않습니다.");
  }
  const len = current.length;
  const xorBuf = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) xorBuf[i] = previous[i] ^ current[i];

  const out: number[] = [];
  let i = 0;
  while (i < len) {
    let runLen = 1;
    while (i + runLen < len && runLen < 130 && xorBuf[i + runLen] === xorBuf[i]) runLen += 1;
    if (runLen >= 3) {
      out.push(0x80 | (runLen - 3), xorBuf[i]);
      i += runLen;
    } else {
      const litStart = i;
      let litLen = 0;
      while (i < len && litLen < 128) {
        if (i + 2 < len && xorBuf[i] === xorBuf[i + 1] && xorBuf[i] === xorBuf[i + 2]) break;
        i += 1;
        litLen += 1;
      }
      out.push(litLen - 1);
      for (let k = 0; k < litLen; k += 1) out.push(xorBuf[litStart + k]);
    }
  }
  return new Uint8Array(out);
}

/** XOR+RLE 압축 스트림을 이전 타일에 역적용해 비트-정확 RGBA 타일을 복원한다. */
export function decodeXorRle(
  previous: Uint8Array,
  encoded: Uint8Array,
  expectedLength: number,
): Uint8Array {
  if (previous.length !== expectedLength) {
    throw new Error("XOR+RLE 디코딩 대상 이전 타일 길이가 일치하지 않습니다.");
  }
  const out = new Uint8Array(expectedLength);
  let src = 0;
  let dst = 0;
  while (src < encoded.length && dst < expectedLength) {
    const ctrl = encoded[src];
    src += 1;
    if ((ctrl & 0x80) !== 0) {
      const runLen = (ctrl & 0x7f) + 3;
      if (src >= encoded.length) throw new Error("손상된 RLE 반복 런 페이로드입니다.");
      const val = encoded[src];
      src += 1;
      for (let k = 0; k < runLen && dst < expectedLength; k += 1) {
        out[dst] = previous[dst] ^ val;
        dst += 1;
      }
    } else {
      const litLen = ctrl + 1;
      for (let k = 0; k < litLen && dst < expectedLength; k += 1) {
        if (src >= encoded.length) throw new Error("손상된 RLE 리터럴 페이로드입니다.");
        out[dst] = previous[dst] ^ encoded[src];
        src += 1;
        dst += 1;
      }
    }
  }
  if (dst !== expectedLength) {
    throw new Error(`XOR+RLE 디코딩 길이 불일치: 기대 ${expectedLength}, 실제 ${dst}`);
  }
  return out;
}

const INPUT_TYPE_TO_CODE: Record<CompanionInputType, number> = {
  down: 1,
  move: 2,
  up: 3,
  hover: 4,
  pinch: 5,
  "undo-gesture": 6,
};

const CODE_TO_INPUT_TYPE: readonly CompanionInputType[] = [
  "move",
  "down",
  "move",
  "up",
  "hover",
  "pinch",
  "undo-gesture",
];

function derivePairingSecrets(
  sessionId: string,
  hostDeviceId: string,
  hostNonceHex: string,
  hostPublicTokenHex: string,
  companionDeviceId: string,
  companionNonceHex: string,
  companionPublicTokenHex: string,
): { readonly sasCode: string; readonly sessionTag16: number } {
  const transcript = [
    "toonstudio-sas-v1",
    sessionId,
    hostDeviceId,
    hostNonceHex,
    hostPublicTokenHex,
    companionDeviceId,
    companionNonceHex,
    companionPublicTokenHex,
  ].join("|");
  const h1 = hashStringU32(transcript, 0x243f6a88);
  const h2 = hashStringU32(transcript, 0x85a308d3);
  const sasNum = ((h1 ^ Math.imul(h2, 0x9e3779b1)) >>> 0) % 1000000;
  return {
    sasCode: sasNum.toString().padStart(6, "0"),
    sessionTag16: (h1 ^ (h2 >>> 16)) & 0xffff,
  };
}

/** ₩0 서버 중계 없는 PC↔태블릿/모바일 컴패니언 페어링 세션. */
export class ZeroLagDevicePairingSession {
  public readonly role: PairingRole;
  public readonly deviceId: string;
  public readonly canvasWidth: number;
  public readonly canvasHeight: number;
  public readonly tileSize: number;

  private state: PairingState = "idle";
  private sessionId = "";
  private localNonceHex = "";
  private localPublicTokenHex = "";
  private expectedSasCode = "";
  private sessionTag16 = 0;
  private rejectedAttempts = 0;
  private mirrorSeq = 0;
  private inputSeq = 0;

  private readonly framebuffer: Uint8ClampedArray;
  private readonly pendingTileChunks = new Map<
    string,
    { readonly chunkCount: number; readonly chunks: Array<Uint8Array | undefined>; received: number }
  >();

  public constructor(options: {
    readonly role: PairingRole;
    readonly deviceId: string;
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly tileSize?: number;
  }) {
    if (options.canvasWidth < 8 || options.canvasHeight < 8) {
      throw new Error("컴패니언 캔버스 크기는 최소 8×8 이상이어야 합니다.");
    }
    this.role = options.role;
    this.deviceId = options.deviceId;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;
    this.tileSize = clamp(Math.round(options.tileSize ?? DEFAULT_MIRROR_TILE_SIZE), 16, 128);
    this.framebuffer = new Uint8ClampedArray(this.canvasWidth * this.canvasHeight * 4);
  }

  public get pairingState(): PairingState {
    return this.state;
  }

  public get sasCode(): string {
    return this.expectedSasCode;
  }

  public get failedSasAttempts(): number {
    return this.rejectedAttempts;
  }

  public getMirroredFramebuffer(): Uint8ClampedArray {
    return this.framebuffer;
  }

  /** PC 호스트가 6자리 SAS 핸드셰이크용 페어링 제안을 생성한다. */
  public createPairingOffer(seed = 1): PairingOffer {
    if (this.role !== "pc-host") throw new Error("페어링 제안은 pc-host 역할에서만 생성할 수 있습니다.");
    const s = seed >>> 0;
    const hA = hashStringU32(`${this.deviceId}:nonce:${s}`, 0x13579bdf);
    const hB = hashStringU32(`${this.deviceId}:pub:${s}`, 0x2468ace0);
    this.sessionId = `ts-pair-${toHex8(hA ^ hB)}`;
    this.localNonceHex = toHex8(hA);
    this.localPublicTokenHex = toHex8(hB);
    this.state = "awaiting-sas";
    return {
      sessionId: this.sessionId,
      hostDeviceId: this.deviceId,
      hostNonceHex: this.localNonceHex,
      hostPublicTokenHex: this.localPublicTokenHex,
    };
  }

  /** 태블릿/모바일 컴패니언이 제안을 수락하고 동일한 6자리 SAS 코드를 유도한다. */
  public acceptPairingOffer(offer: PairingOffer, seed = 1): PairingAnswer {
    if (this.role !== "tablet-companion") {
      throw new Error("페어링 수락은 tablet-companion 역할에서만 호출할 수 있습니다.");
    }
    const s = seed >>> 0;
    const cNonce = toHex8(hashStringU32(`${this.deviceId}:cnonce:${s}`, 0x31415926));
    const cPub = toHex8(hashStringU32(`${this.deviceId}:cpub:${s}`, 0x27182818));
    this.sessionId = offer.sessionId;
    this.localNonceHex = cNonce;
    this.localPublicTokenHex = cPub;

    const derived = derivePairingSecrets(
      offer.sessionId, offer.hostDeviceId, offer.hostNonceHex, offer.hostPublicTokenHex,
      this.deviceId, cNonce, cPub,
    );
    this.expectedSasCode = derived.sasCode;
    this.sessionTag16 = derived.sessionTag16;
    this.state = "awaiting-sas";
    return {
      sessionId: offer.sessionId,
      companionDeviceId: this.deviceId,
      companionNonceHex: cNonce,
      companionPublicTokenHex: cPub,
      sasCode: derived.sasCode,
    };
  }

  /** PC 호스트가 컴패니언 응답을 받아 로컬에서 동일한 6자리 SAS 코드를 독립 계산한다. */
  public completeHandshakeFromAnswer(answer: PairingAnswer): string {
    if (this.role !== "pc-host" || this.state !== "awaiting-sas") {
      throw new Error("pc-host 대기 상태에서만 핸드셰이크 응답을 처리할 수 있습니다.");
    }
    if (answer.sessionId !== this.sessionId) throw new Error("세션 ID가 일치하지 않습니다.");
    const derived = derivePairingSecrets(
      this.sessionId, this.deviceId, this.localNonceHex, this.localPublicTokenHex,
      answer.companionDeviceId, answer.companionNonceHex, answer.companionPublicTokenHex,
    );
    this.expectedSasCode = derived.sasCode;
    this.sessionTag16 = derived.sessionTag16;
    return this.expectedSasCode;
  }

  /** 사용자가 두 기기의 6자리 SAS 코드 일치를 승인하면 페어링이 완료된다. */
  public confirmSasCode(enteredSasCode: string): boolean {
    if (this.state !== "awaiting-sas" || this.expectedSasCode.length !== 6) return false;
    if (enteredSasCode === this.expectedSasCode) {
      this.state = "paired";
      return true;
    }
    this.rejectedAttempts += 1;
    this.state = "rejected";
    return false;
  }

  /** PC 캔버스에서 변경된 타일만 XOR+RLE 압축해 `<= 16 KiB` DataChannel 프레임으로 생성한다. */
  public encodeDirtyMirrorFrames(currentRgba: Uint8ClampedArray | Uint8Array): MirrorFrameBatch {
    if (this.role !== "pc-host" || this.state !== "paired") {
      throw new Error("페어링 완료된 pc-host에서만 미러링 프레임을 인코딩할 수 있습니다.");
    }
    if (currentRgba.length !== this.canvasWidth * this.canvasHeight * 4) {
      throw new Error("미러링 대상 RGBA 버퍼 크기가 세션 캔버스와 일치하지 않습니다.");
    }

    const startMs = nowMs();
    this.mirrorSeq += 1;
    const frameSeq = this.mirrorSeq;
    const tilesX = Math.ceil(this.canvasWidth / this.tileSize);
    const tilesY = Math.ceil(this.canvasHeight / this.tileSize);
    const maxChunkPayload = MAX_DATACHANNEL_FRAME_BYTES - MIRROR_FRAME_HEADER_BYTES;

    const frames: Uint8Array[] = [];
    let dirtyTileCount = 0;
    let rawDirtyBytes = 0;
    let compressedBytes = 0;
    let maxFrameBytes = 0;

    for (let ty = 0; ty < tilesY; ty += 1) {
      const y0 = ty * this.tileSize;
      const tileH = Math.min(this.tileSize, this.canvasHeight - y0);
      for (let tx = 0; tx < tilesX; tx += 1) {
        const x0 = tx * this.tileSize;
        const tileW = Math.min(this.tileSize, this.canvasWidth - x0);
        const tileBytes = tileW * tileH * 4;
        const prevTile = new Uint8Array(tileBytes);
        const currTile = new Uint8Array(tileBytes);
        let dirty = false;

        for (let row = 0; row < tileH; row += 1) {
          const fbOff = ((y0 + row) * this.canvasWidth + x0) * 4;
          const rowBytes = tileW * 4;
          const dstOff = row * rowBytes;
          for (let k = 0; k < rowBytes; k += 1) {
            const pv = this.framebuffer[fbOff + k];
            const cv = currentRgba[fbOff + k];
            prevTile[dstOff + k] = pv;
            currTile[dstOff + k] = cv;
            if (pv !== cv) dirty = true;
          }
        }
        if (!dirty) continue;
        dirtyTileCount += 1;
        rawDirtyBytes += tileBytes;

        for (let row = 0; row < tileH; row += 1) {
          const fbOff = ((y0 + row) * this.canvasWidth + x0) * 4;
          const rowBytes = tileW * 4;
          this.framebuffer.set(currTile.subarray(row * rowBytes, (row + 1) * rowBytes), fbOff);
        }

        const rle = encodeXorRle(prevTile, currTile);
        const chunkCount = Math.max(1, Math.ceil(rle.length / maxChunkPayload));
        for (let ci = 0; ci < chunkCount; ci += 1) {
          const start = ci * maxChunkPayload;
          const slice = rle.subarray(start, Math.min(rle.length, start + maxChunkPayload));
          const frame = new Uint8Array(MIRROR_FRAME_HEADER_BYTES + slice.length);
          const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
          view.setUint32(0, MIRROR_MAGIC, false);
          view.setUint32(4, frameSeq, false);
          view.setUint16(8, x0, false);
          view.setUint16(10, y0, false);
          view.setUint16(12, tileW, false);
          view.setUint16(14, tileH, false);
          frame[16] = ci;
          frame[17] = chunkCount;
          view.setUint16(18, slice.length, false);
          view.setUint16(20, this.sessionTag16, false);
          frame.set(slice, MIRROR_FRAME_HEADER_BYTES);
          const crcInput = new Uint8Array(22 + slice.length);
          crcInput.set(frame.subarray(0, 22), 0);
          crcInput.set(slice, 22);
          view.setUint16(22, crc16Frame(crcInput, crcInput.length), false);

          frames.push(frame);
          compressedBytes += frame.length;
          if (frame.length > maxFrameBytes) maxFrameBytes = frame.length;
        }
      }
    }

    return {
      frameSeq,
      frames,
      dirtyTileCount,
      totalTileCount: tilesX * tilesY,
      rawDirtyBytes,
      compressedBytes,
      maxFrameBytes,
      compressionRatio: compressedBytes > 0 ? rawDirtyBytes / compressedBytes : 1,
      encodeDurationMs: nowMs() - startMs,
    };
  }

  /** 태블릿/모바일 컴패니언이 수신한 `<= 16 KiB` XOR+RLE 프레임을 적용해 캔버스를 무손실 복원한다. */
  public receiveMirrorFrame(frame: Uint8Array): MirrorReceiveReport {
    if (this.role !== "tablet-companion" || this.state !== "paired") {
      throw new Error("페어링된 tablet-companion에서만 미러 프레임을 수신할 수 있습니다.");
    }
    if (frame.length < MIRROR_FRAME_HEADER_BYTES || frame.length > MAX_DATACHANNEL_FRAME_BYTES) {
      throw new Error("미러 프레임 크기가 16 KiB DataChannel 규격을 벗어났습니다.");
    }
    const startMs = nowMs();
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    if (view.getUint32(0, false) !== MIRROR_MAGIC) throw new Error("유효하지 않은 미러 프레임 매직 헤더입니다.");

    const frameSeq = view.getUint32(4, false);
    const tileX = view.getUint16(8, false);
    const tileY = view.getUint16(10, false);
    const tileW = view.getUint16(12, false);
    const tileH = view.getUint16(14, false);
    const chunkIndex = frame[16];
    const chunkCount = frame[17];
    const payloadLen = view.getUint16(18, false);
    if (view.getUint16(20, false) !== this.sessionTag16) {
      throw new Error("세션 인증 태그 불일치: 승인되지 않은 미러 프레임입니다.");
    }
    if (payloadLen !== frame.length - MIRROR_FRAME_HEADER_BYTES) {
      throw new Error("미러 프레임 페이로드 길이가 헤더와 일치하지 않습니다.");
    }

    const slice = frame.subarray(MIRROR_FRAME_HEADER_BYTES);
    const crcInput = new Uint8Array(22 + slice.length);
    crcInput.set(frame.subarray(0, 22), 0);
    crcInput.set(slice, 22);
    if (crc16Frame(crcInput, crcInput.length) !== view.getUint16(22, false)) {
      throw new Error("미러 프레임 CRC-16 무결성 검증에 실패했습니다.");
    }

    let assembledRle: Uint8Array | null = null;
    if (chunkCount <= 1) {
      assembledRle = slice;
    } else {
      const key = `${frameSeq}:${tileX}:${tileY}`;
      let entry = this.pendingTileChunks.get(key);
      if (!entry) {
        entry = { chunkCount, chunks: new Array<Uint8Array | undefined>(chunkCount), received: 0 };
        this.pendingTileChunks.set(key, entry);
      }
      if (entry.chunks[chunkIndex] === undefined) {
        entry.chunks[chunkIndex] = new Uint8Array(slice);
        entry.received += 1;
      }
      if (entry.received === entry.chunkCount) {
        let totalLen = 0;
        for (let i = 0; i < entry.chunkCount; i += 1) totalLen += entry.chunks[i]?.length ?? 0;
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (let i = 0; i < entry.chunkCount; i += 1) {
          const part = entry.chunks[i];
          if (part) { merged.set(part, offset); offset += part.length; }
        }
        this.pendingTileChunks.delete(key);
        assembledRle = merged;
      }
    }

    let completedTile = false;
    if (assembledRle !== null) {
      const tileBytes = tileW * tileH * 4;
      const prevTile = new Uint8Array(tileBytes);
      for (let row = 0; row < tileH; row += 1) {
        const fbOff = ((tileY + row) * this.canvasWidth + tileX) * 4;
        const rowBytes = tileW * 4;
        prevTile.set(this.framebuffer.subarray(fbOff, fbOff + rowBytes), row * rowBytes);
      }
      const restored = decodeXorRle(prevTile, assembledRle, tileBytes);
      for (let row = 0; row < tileH; row += 1) {
        const fbOff = ((tileY + row) * this.canvasWidth + tileX) * 4;
        const rowBytes = tileW * 4;
        this.framebuffer.set(restored.subarray(row * rowBytes, (row + 1) * rowBytes), fbOff);
      }
      completedTile = true;
    }

    return { frameSeq, tileX, tileY, tileW, tileH, completedTile, decodeDurationMs: nowMs() - startMs };
  }

  /** 태블릿/모바일 스타일러스·터치 입력을 28바이트 바이너리 패킷으로 인코딩한다. */
  public encodeCompanionInput(input: CompanionStylusInput): Uint8Array {
    if (this.role !== "tablet-companion" || this.state !== "paired") {
      throw new Error("페어링된 tablet-companion에서만 입력 패킷을 전송할 수 있습니다.");
    }
    this.inputSeq += 1;
    const packet = new Uint8Array(INPUT_PACKET_BYTES);
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    view.setUint32(0, INPUT_MAGIC, false);
    view.setUint32(4, this.inputSeq, false);
    packet[8] = INPUT_TYPE_TO_CODE[input.type];
    packet[9] = input.pointerId & 0xff;
    view.setUint16(10, Math.round(clamp(input.xNorm, 0, 1) * 65535), false);
    view.setUint16(12, Math.round(clamp(input.yNorm, 0, 1) * 65535), false);
    view.setUint16(14, Math.round(clamp(input.pressure, 0, 1) * 65535), false);
    view.setInt16(16, Math.round(clamp(input.tiltXDeg, -90, 90) * 100), false);
    view.setInt16(18, Math.round(clamp(input.tiltYDeg, -90, 90) * 100), false);
    view.setUint16(20, Math.round((((input.twistDeg % 360) + 360) % 360) * 100), false);
    view.setUint16(22, Math.round(input.clientTimestampUs / 100) & 0xffff, false);
    view.setUint16(24, this.sessionTag16, false);
    view.setUint16(26, crc16Frame(packet, 26), false);
    return packet;
  }

  /** PC 호스트가 컴패니언 입력 패킷을 검증·복원해 PC 캔버스 좌표 이벤트로 변환한다. */
  public receiveCompanionInput(packet: Uint8Array, receivedTimestampUs?: number): RelayedStylusEvent {
    if (this.role !== "pc-host" || this.state !== "paired") {
      throw new Error("페어링된 pc-host에서만 컴패니언 입력 패킷을 수신할 수 있습니다.");
    }
    if (packet.length !== INPUT_PACKET_BYTES) {
      throw new Error(`입력 패킷 크기는 ${INPUT_PACKET_BYTES}바이트여야 합니다.`);
    }
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    if (view.getUint32(0, false) !== INPUT_MAGIC) throw new Error("유효하지 않은 입력 패킷 매직 헤더입니다.");
    if (view.getUint16(24, false) !== this.sessionTag16) {
      throw new Error("세션 인증 태그 불일치: 거부된 입력 패킷입니다.");
    }
    if (crc16Frame(packet, 26) !== view.getUint16(26, false)) {
      throw new Error("입력 패킷 CRC-16 무결성 검증에 실패했습니다.");
    }

    const xNorm = view.getUint16(10, false) / 65535;
    const yNorm = view.getUint16(12, false) / 65535;
    const sentTick100Us = view.getUint16(22, false);
    let relayLatencyMs = 0;
    if (receivedTimestampUs !== undefined) {
      const recvTick100Us = Math.round(receivedTimestampUs / 100) & 0xffff;
      relayLatencyMs = (((recvTick100Us - sentTick100Us + 65536) & 0xffff) * 100) / 1000;
    }

    return {
      inputSeq: view.getUint32(4, false),
      type: CODE_TO_INPUT_TYPE[packet[8]] ?? "move",
      pointerId: packet[9],
      xNorm,
      yNorm,
      pressure: view.getUint16(14, false) / 65535,
      tiltXDeg: view.getInt16(16, false) / 100,
      tiltYDeg: view.getInt16(18, false) / 100,
      twistDeg: view.getUint16(20, false) / 100,
      clientTimestampUs: sentTick100Us * 100,
      canvasX: xNorm * this.canvasWidth,
      canvasY: yNorm * this.canvasHeight,
      packetBytes: packet.length,
      relayLatencyMs,
    };
  }
}
