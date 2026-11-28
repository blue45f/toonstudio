/**
 * Wave 132 — 순수 ES2017 8×8 직교 2D DCT-II/IDCT-II 변환, CRC-8 페이로드 코덱,
 * 대척점(antipodal) 비밀 키 스케줄 및 픽셀 타일 검증·휘도 추출 유틸리티.
 */

import { bytesToHexLower, sha256Bytes } from "./forensic-crypto-sha256";
import {
  FORENSIC_CODEWORD_BIT_LENGTH,
  FORENSIC_PAYLOAD_BIT_LENGTH,
  ForensicWatermarkError,
  MACRO_TILE_BLOCKS,
  MID_BAND_DCT_PAIRS,
  SYNC_PREAMBLE_BITS,
  type BitValue,
  type EncodedForensicPayload,
  type ForensicPayloadSpec,
  type WatermarkDetectResult,
  type WatermarkTileImage,
} from "./forensic-watermark-types";

/** 8×8 1D 직교 DCT-II 기저 행렬 C[k * 8 + n]. */
const DCT_BASIS_8X8 = ((): Float64Array => {
  const table = new Float64Array(64);
  const invSqrt8 = 1 / Math.sqrt(8);
  for (let k = 0; k < 8; k += 1) {
    const alpha = k === 0 ? invSqrt8 : 0.5;
    for (let n = 0; n < 8; n += 1) {
      table[k * 8 + n] = alpha * Math.cos(((2 * n + 1) * k * Math.PI) / 16);
    }
  }
  return table;
})();

/** 8×8 직교 2D DCT-II 정변환 (행-열 분리 계산, Float64Array(64) 반환). */
export function forwardDct8x8(block: ArrayLike<number>): Float64Array {
  if (block.length !== 64) {
    throw new ForensicWatermarkError(
      "INVALID_DCT_BLOCK",
      `8×8 DCT 입력 블록은 정확히 64개 요소여야 합니다 (입력: ${block.length}).`,
    );
  }
  const temp = new Float64Array(64);
  for (let y = 0; y < 8; y += 1) {
    const rowOff = y * 8;
    for (let u = 0; u < 8; u += 1) {
      const basisRow = u * 8;
      let sum = 0;
      for (let x = 0; x < 8; x += 1) {
        const val = block[rowOff + x];
        if (!Number.isFinite(val)) {
          throw new ForensicWatermarkError("INVALID_DCT_BLOCK", "8×8 DCT 입력 블록에 비유한 값이 있습니다.");
        }
        sum += val * DCT_BASIS_8X8[basisRow + x];
      }
      temp[rowOff + u] = sum;
    }
  }

  const out = new Float64Array(64);
  for (let v = 0; v < 8; v += 1) {
    const basisRow = v * 8;
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let y = 0; y < 8; y += 1) {
        sum += DCT_BASIS_8X8[basisRow + y] * temp[y * 8 + u];
      }
      out[v * 8 + u] = sum;
    }
  }
  return out;
}

/** 8×8 직교 2D IDCT-II 역변환 (행-열 분리 계산, Float64Array(64) 반환). */
export function inverseDct8x8(coeffs: ArrayLike<number>): Float64Array {
  if (coeffs.length !== 64) {
    throw new ForensicWatermarkError(
      "INVALID_DCT_BLOCK",
      `8×8 IDCT 입력 계수는 정확히 64개 요소여야 합니다 (입력: ${coeffs.length}).`,
    );
  }
  const temp = new Float64Array(64);
  for (let v = 0; v < 8; v += 1) {
    const rowOff = v * 8;
    for (let x = 0; x < 8; x += 1) {
      let sum = 0;
      for (let u = 0; u < 8; u += 1) {
        const c = coeffs[rowOff + u];
        if (!Number.isFinite(c)) {
          throw new ForensicWatermarkError("INVALID_DCT_BLOCK", "8×8 IDCT 입력 계수에 비유한 값이 있습니다.");
        }
        sum += c * DCT_BASIS_8X8[u * 8 + x];
      }
      temp[rowOff + x] = sum;
    }
  }

  const out = new Float64Array(64);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      let sum = 0;
      for (let v = 0; v < 8; v += 1) {
        sum += DCT_BASIS_8X8[v * 8 + y] * temp[v * 8 + x];
      }
      out[y * 8 + x] = sum;
    }
  }
  return out;
}

/** 8×8 DCT-II → IDCT-II 왕복 최대 절대 오차를 계산한다. */
export function verifyDct8x8RoundTrip(block: ArrayLike<number>): number {
  const restored = inverseDct8x8(forwardDct8x8(block));
  let maxErr = 0;
  for (let i = 0; i < 64; i += 1) {
    const err = Math.abs(restored[i] - block[i]);
    if (err > maxErr) maxErr = err;
  }
  return maxErr;
}

/** 16비트 페이로드에 대한 표준 CRC-8 (다항식 0x07)을 계산한다. */
export function computeForensicCrc8(payloadCode: number): number {
  let crc = 0x5a;
  const bytes = [(payloadCode >>> 8) & 0xff, payloadCode & 0xff];
  for (let b = 0; b < 2; b += 1) {
    crc ^= bytes[b];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

export function uintToBits(value: number, width: number): readonly BitValue[] {
  const bits: BitValue[] = [];
  for (let i = width - 1; i >= 0; i -= 1) {
    bits.push(((value >>> i) & 1) === 1 ? 1 : 0);
  }
  return bits;
}

export function bitsToUint(bits: readonly BitValue[]): number {
  let out = 0;
  for (let i = 0; i < bits.length; i += 1) {
    out = (out << 1) | (bits[i] === 1 ? 1 : 0);
  }
  return out >>> 0;
}

export function toHex4(code16: number): string {
  return (code16 & 0xffff).toString(16).padStart(4, "0");
}

/** 저작자·회차·대상 ID 또는 명시 비트를 32비트 코드워드(8동기 + 16페이로드 + 8CRC)로 부호화한다. */
export function encodeForensicPayloadBits(spec: ForensicPayloadSpec): EncodedForensicPayload {
  const creatorId = spec.creatorId.trim();
  const episodeId = spec.episodeId.trim();
  const recipientId = spec.recipientId.trim();
  if (creatorId.length === 0 || episodeId.length === 0 || recipientId.length === 0) {
    throw new ForensicWatermarkError(
      "INVALID_PAYLOAD",
      "creatorId, episodeId, recipientId는 모두 비어 있지 않아야 합니다.",
    );
  }

  let payloadBits: readonly BitValue[];
  let payloadCode: number;

  if (spec.payloadBits !== undefined) {
    if (spec.payloadBits.length !== FORENSIC_PAYLOAD_BIT_LENGTH) {
      throw new ForensicWatermarkError(
        "INVALID_PAYLOAD",
        `payloadBits 길이는 정확히 ${FORENSIC_PAYLOAD_BIT_LENGTH}비트여야 합니다.`,
      );
    }
    for (let i = 0; i < spec.payloadBits.length; i += 1) {
      if (spec.payloadBits[i] !== 0 && spec.payloadBits[i] !== 1) {
        throw new ForensicWatermarkError("INVALID_PAYLOAD", "payloadBits 요소는 0 또는 1이어야 합니다.");
      }
    }
    payloadBits = spec.payloadBits.slice();
    payloadCode = bitsToUint(payloadBits);
  } else if (spec.payloadCode !== undefined) {
    if (!Number.isInteger(spec.payloadCode) || spec.payloadCode < 0 || spec.payloadCode > 0xffff) {
      throw new ForensicWatermarkError("INVALID_PAYLOAD", "payloadCode는 0~65535 범위의 정수여야 합니다.");
    }
    payloadCode = spec.payloadCode;
    payloadBits = uintToBits(payloadCode, 16);
  } else {
    const digest = sha256Bytes(`toonstudio-w132-payload|${creatorId}|${episodeId}|${recipientId}`);
    payloadCode = ((digest[0] << 8) | digest[1]) & 0xffff;
    payloadBits = uintToBits(payloadCode, 16);
  }

  const crc8 = computeForensicCrc8(payloadCode);
  return {
    creatorId,
    episodeId,
    recipientId,
    payloadBits,
    payloadCode,
    payloadHex: toHex4(payloadCode),
    crc8,
    codewordBits: [...SYNC_PREAMBLE_BITS, ...payloadBits, ...uintToBits(crc8, 8)],
  };
}

/** 블라인드 검출 결과와 후보 배포 대상 목록을 대조해 유출자 ID를 판별한다. */
export function matchDetectedPayloadToRecipients(
  detection: WatermarkDetectResult,
  creatorId: string,
  episodeId: string,
  candidateRecipientIds: readonly string[],
): string | null {
  if (!detection.detected) return null;
  for (let i = 0; i < candidateRecipientIds.length; i += 1) {
    const recipientId = candidateRecipientIds[i];
    const encoded = encodeForensicPayloadBits({ creatorId, episodeId, recipientId });
    if (encoded.payloadCode === detection.recoveredPayloadCode) return recipientId;
  }
  return null;
}

export interface ForensicKeySchedule {
  readonly fingerprintHex: string;
  readonly slotToBitIndex: Uint8Array;
  readonly slotPolarity: Int8Array;
}

export function deriveForensicKeySchedule(secretKey: string): ForensicKeySchedule {
  const trimmedKey = secretKey.trim();
  if (trimmedKey.length < 4) {
    throw new ForensicWatermarkError("INVALID_KEY", "secretKey는 공백 제외 4자 이상이어야 합니다.");
  }

  const keyHash = sha256Bytes(`toonstudio-w132-key|${trimmedKey}`);
  const fingerprintHex = bytesToHexLower(keyHash.slice(0, 8));

  let rng = ((keyHash[0] << 24) | (keyHash[1] << 16) | (keyHash[2] << 8) | keyHash[3]) >>> 0;
  if (rng === 0) rng = 0x9e3779b9;
  const nextU32 = (): number => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return rng >>> 0;
  };

  const bitPerm = new Uint8Array(FORENSIC_CODEWORD_BIT_LENGTH);
  for (let i = 0; i < FORENSIC_CODEWORD_BIT_LENGTH; i += 1) bitPerm[i] = i;
  for (let i = FORENSIC_CODEWORD_BIT_LENGTH - 1; i > 0; i -= 1) {
    const j = nextU32() % (i + 1);
    const tmp = bitPerm[i];
    bitPerm[i] = bitPerm[j];
    bitPerm[j] = tmp;
  }

  const slotToBitIndex = new Uint8Array(64);
  let pairCursor = 0;
  for (let my = 0; my < MACRO_TILE_BLOCKS; my += 1) {
    for (let mx = 0; mx < 2; mx += 1) {
      const twinMx = (mx + 2) & 3;
      const twinMy = (my + 2) & 3;
      for (let p = 0; p < MID_BAND_DCT_PAIRS.length; p += 1) {
        const bitIdx = bitPerm[pairCursor];
        pairCursor += 1;
        slotToBitIndex[(my * 4 + mx) * 4 + p] = bitIdx;
        slotToBitIndex[(twinMy * 4 + twinMx) * 4 + p] = bitIdx;
      }
    }
  }

  const signHashA = sha256Bytes(`toonstudio-w132-sign-a|${trimmedKey}`);
  const signHashB = sha256Bytes(`toonstudio-w132-sign-b|${trimmedKey}`);
  const slotPolarity = new Int8Array(64);
  for (let s = 0; s < 64; s += 1) {
    const byteVal = s < 32 ? signHashA[s] : signHashB[s - 32];
    slotPolarity[s] = (((byteVal >>> (s & 7)) ^ (byteVal & 1)) & 1) === 1 ? 1 : -1;
  }

  return { fingerprintHex, slotToBitIndex, slotPolarity };
}

export function validateTileImage(
  tile: WatermarkTileImage,
  minDim: number,
): { readonly blocksX: number; readonly blocksY: number; readonly channels: number } {
  if (
    !Number.isInteger(tile.width) ||
    !Number.isInteger(tile.height) ||
    tile.width < minDim ||
    tile.height < minDim
  ) {
    throw new ForensicWatermarkError(
      "INVALID_DIMENSIONS",
      `타일 크기는 최소 ${minDim}×${minDim} 이상인 정수여야 합니다 (입력: ${tile.width}×${tile.height}).`,
    );
  }
  if (tile.width % 8 !== 0 || tile.height % 8 !== 0) {
    throw new ForensicWatermarkError(
      "INVALID_DIMENSIONS",
      `타일 가로·세로는 8×8 DCT 블록 배수여야 합니다 (입력: ${tile.width}×${tile.height}).`,
    );
  }
  if (tile.format !== "luma-u8" && tile.format !== "rgba-u8") {
    throw new ForensicWatermarkError("INVALID_PIXEL_BUFFER", `지원하지 않는 포맷입니다: ${String(tile.format)}`);
  }
  const channels = tile.format === "rgba-u8" ? 4 : 1;
  const expectedLen = tile.width * tile.height * channels;
  if (!(tile.data instanceof Uint8Array) || tile.data.length !== expectedLen) {
    throw new ForensicWatermarkError(
      "INVALID_PIXEL_BUFFER",
      `픽셀 버퍼 길이가 일치하지 않습니다 (기대: ${expectedLen}, 실제: ${tile.data?.length ?? 0}).`,
    );
  }
  return { blocksX: tile.width / 8, blocksY: tile.height / 8, channels };
}

export function extractLumaPlane(tile: WatermarkTileImage): Float64Array {
  const pixelCount = tile.width * tile.height;
  const luma = new Float64Array(pixelCount);
  if (tile.format === "luma-u8") {
    for (let i = 0; i < pixelCount; i += 1) luma[i] = tile.data[i];
  } else {
    for (let i = 0; i < pixelCount; i += 1) {
      const off = i * 4;
      luma[i] = 0.299 * tile.data[off] + 0.587 * tile.data[off + 1] + 0.114 * tile.data[off + 2];
    }
  }
  return luma;
}

export function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}
