/**
 * Wave 43: 브라우저 크래시·전원 차단 시 0손실 복구를 보장하는 OPFS 바이너리 획 저널 코덱.
 *
 * - 파일 헤더(`TSWJ`, 버전, 좌표 양자화 배율, 문서 에포크, 헤더 CRC32)와
 *   레코드 단위 프레임(`STRK`, 페이로드 길이, 프레임 CRC32, 획 시퀀스 번호, 압축 델타 좌표)을 인코딩한다.
 * - 후속 좌표·필압·기울기·시간 간격을 ZigZag + 부호 없는 LEB128 가변 길이 정수로 압축하며,
 *   비정상 종료로 깨진 마지막 레코드를 자동 절단(Tail Truncation Recovery)해 직전 확정 획까지 복구한다.
 */

/** 저널 파일 매직 헤더 문자열(`TSWJ`: ToonStudio Stroke Write-Ahead Journal). */
export const STROKE_JOURNAL_MAGIC = "TSWJ" as const;
/** 개별 획 레코드 동기화 마커(`STRK`). */
export const STROKE_FRAME_MAGIC = "STRK" as const;
/** 바이너리 저널 포맷 버전(`1`). */
export const STROKE_JOURNAL_VERSION = 1 as const;
/** 파일 헤더 고정 바이트 길이(`16 bytes`). */
export const JOURNAL_FILE_HEADER_BYTES = 16 as const;
/** 획 프레임 헤더 고정 바이트 길이(`24 bytes`). */
export const JOURNAL_FRAME_HEADER_BYTES = 24 as const;
/** 기본 좌표 양자화 배율(`100` = `0.01px` 정밀도). */
export const DEFAULT_COORD_QUANT_SCALE = 100 as const;

const MAX_FRAME_PAYLOAD_BYTES = 16 * 1024 * 1024;
const MAGIC_TSWJ = [0x54, 0x53, 0x57, 0x4a] as const;
const MAGIC_STRK = [0x53, 0x54, 0x52, 0x4b] as const;

export interface JournalStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timestampMs: number;
}

export interface JournalRgba8 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface JournalStrokeEntry {
  readonly sequence: number;
  readonly layerSlot: number;
  readonly brushSizePx: number;
  readonly colorRgba: JournalRgba8;
  readonly points: readonly JournalStrokePoint[];
}

export interface StrokeJournalHeaderOptions {
  readonly documentEpoch?: number;
  readonly coordQuantScale?: number;
}

export type StrokeJournalRecoveryStatus = "empty" | "healthy" | "tail-truncated-recovered" | "crc-mismatch-truncated" | "invalid-header";

export interface StrokeJournalDecodeResult {
  readonly status: StrokeJournalRecoveryStatus;
  readonly headerValid: boolean;
  readonly version: number | null;
  readonly documentEpoch: number | null;
  readonly coordQuantScale: number;
  readonly strokes: readonly JournalStrokeEntry[];
  readonly sequenceContiguous: boolean;
  readonly safeTruncateByteOffset: number;
  readonly discardedTailBytes: number;
  readonly crcMismatchDetected: boolean;
  readonly truncatedTailDetected: boolean;
  readonly repairedJournalBytes: Uint8Array;
  readonly messageKo: string;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    table[i] = crc >>> 0;
  }
  return table;
})();

const clampInt = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;

/** 표준 IEEE 802.3 다항식(`0xEDB88320`) 기반 부호 없는 32비트 CRC32 체크섬을 계산한다. */
export function computeCrc32(bytes: Uint8Array, startOffset = 0, endOffset: number = bytes.byteLength): number {
  const start = Math.max(0, Math.min(bytes.byteLength, Math.trunc(startOffset)));
  const end = Math.max(start, Math.min(bytes.byteLength, Math.trunc(endOffset)));
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 부호 있는 32비트 정수를 부호 없는 ZigZag 32비트 정수로 변환한다. */
export function zigzagEncode32(value: number): number {
  const i32 = value | 0;
  return ((i32 << 1) ^ (i32 >> 31)) >>> 0;
}

/** 부호 없는 ZigZag 32비트 정수를 원래 부호 있는 32비트 정수로 복원한다. */
export function zigzagDecode32(encoded: number): number {
  const u32 = encoded >>> 0;
  return (u32 >>> 1) ^ -(u32 & 1);
}

function pushUnsignedVarint(out: number[], value: number): void {
  let remaining = value >>> 0;
  while (remaining >= 0x80) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
}

const pushSignedVarint = (out: number[], value: number): void => pushUnsignedVarint(out, zigzagEncode32(value));

interface VarintReadCursor {
  offset: number;
  ok: boolean;
}

function readUnsignedVarint(bytes: Uint8Array, limit: number, cursor: VarintReadCursor): number {
  let result = 0;
  for (let shift = 0; shift <= 28; shift += 7) {
    if (cursor.offset >= limit) {
      cursor.ok = false;
      return 0;
    }
    const byte = bytes[cursor.offset] ?? 0;
    cursor.offset += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result >>> 0;
  }
  cursor.ok = false;
  return 0;
}

const readSignedVarint = (bytes: Uint8Array, limit: number, cursor: VarintReadCursor): number =>
  zigzagDecode32(readUnsignedVarint(bytes, limit, cursor));

function hasMagic(bytes: Uint8Array, offset: number, expected: readonly [number, number, number, number]): boolean {
  return (
    offset + 4 <= bytes.byteLength &&
    bytes[offset] === expected[0] &&
    bytes[offset + 1] === expected[1] &&
    bytes[offset + 2] === expected[2] &&
    bytes[offset + 3] === expected[3]
  );
}

/** 16바이트 `TSWJ` 파일 헤더를 인코딩한다. */
export function encodeJournalHeader(options: StrokeJournalHeaderOptions = {}): Uint8Array {
  const coordQuantScale = clampInt(options.coordQuantScale ?? DEFAULT_COORD_QUANT_SCALE, 10, 10_000);
  const documentEpoch = (options.documentEpoch ?? 1) >>> 0;
  const header = new Uint8Array(JOURNAL_FILE_HEADER_BYTES);
  header.set(MAGIC_TSWJ, 0);
  header[4] = STROKE_JOURNAL_VERSION;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  view.setUint16(6, coordQuantScale, true);
  view.setUint32(8, documentEpoch, true);
  view.setUint32(12, computeCrc32(header, 0, 12), true);
  return header;
}

/** 단일 획 엔트리를 자체 CRC32가 포함된 `STRK` 바이너리 프레임으로 인코딩한다. */
export function encodeStrokeFrame(stroke: JournalStrokeEntry, coordQuantScale: number = DEFAULT_COORD_QUANT_SCALE): Uint8Array {
  const scale = clampInt(coordQuantScale, 10, 10_000);
  const points = stroke.points;
  const { r, g, b, a } = stroke.colorRgba;
  const payloadBytes: number[] = [clampInt(r, 0, 255), clampInt(g, 0, 255), clampInt(b, 0, 255), clampInt(a, 0, 255)];

  const p0 = points[0];
  if (p0 !== undefined) {
    const anchorBuf = new Uint8Array(22);
    const anchorView = new DataView(anchorBuf.buffer);
    const baseTimestampMs = Number.isFinite(p0.timestampMs) ? p0.timestampMs : 0;

    let prevQx = clampInt(p0.x * scale, -0x3fffffff, 0x3fffffff);
    let prevQy = clampInt(p0.y * scale, -0x3fffffff, 0x3fffffff);
    let prevQp = clampInt(p0.pressure * 65535, 0, 65535);
    let prevQtX = clampInt(p0.tiltX * 100, -9000, 9000);
    let prevQtY = clampInt(p0.tiltY * 100, -9000, 9000);
    let prevTimeTicks = 0;

    anchorView.setFloat64(0, baseTimestampMs, true);
    anchorView.setInt32(8, prevQx, true);
    anchorView.setInt32(12, prevQy, true);
    anchorView.setUint16(16, prevQp, true);
    anchorView.setInt16(18, prevQtX, true);
    anchorView.setInt16(20, prevQtY, true);
    for (const byte of anchorBuf) payloadBytes.push(byte);

    for (let i = 1; i < points.length; i += 1) {
      const pt = points[i];
      if (pt === undefined) continue;
      const qx = clampInt(pt.x * scale, -0x3fffffff, 0x3fffffff);
      const qy = clampInt(pt.y * scale, -0x3fffffff, 0x3fffffff);
      const qp = clampInt(pt.pressure * 65535, 0, 65535);
      const qtX = clampInt(pt.tiltX * 100, -9000, 9000);
      const qtY = clampInt(pt.tiltY * 100, -9000, 9000);
      const rawTicks = Math.max(prevTimeTicks, Math.round((pt.timestampMs - baseTimestampMs) * 100));

      pushSignedVarint(payloadBytes, qx - prevQx);
      pushSignedVarint(payloadBytes, qy - prevQy);
      pushSignedVarint(payloadBytes, qp - prevQp);
      pushSignedVarint(payloadBytes, qtX - prevQtX);
      pushSignedVarint(payloadBytes, qtY - prevQtY);
      pushUnsignedVarint(payloadBytes, rawTicks - prevTimeTicks);
      prevQx = qx;
      prevQy = qy;
      prevQp = qp;
      prevQtX = qtX;
      prevQtY = qtY;
      prevTimeTicks = rawTicks;
    }
  }

  const frame = new Uint8Array(JOURNAL_FRAME_HEADER_BYTES + payloadBytes.length);
  frame.set(MAGIC_STRK, 0);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(4, payloadBytes.length >>> 0, true);
  view.setUint32(12, Math.max(0, Math.trunc(stroke.sequence)) >>> 0, true);
  view.setUint16(16, clampInt(stroke.layerSlot, 0, 65535), true);
  view.setUint16(18, clampInt(stroke.brushSizePx * 10, 1, 65535), true);
  view.setUint32(20, points.length >>> 0, true);
  frame.set(payloadBytes, JOURNAL_FRAME_HEADER_BYTES);
  view.setUint32(8, computeCrc32(frame, 12, frame.byteLength), true);
  return frame;
}

/** 전체 획 배열을 `TSWJ` 헤더 + 연속된 `STRK` 프레임 저널 `Uint8Array`로 인코딩한다. */
export function encodeStrokeJournal(strokes: readonly JournalStrokeEntry[], options: StrokeJournalHeaderOptions = {}): Uint8Array {
  const coordQuantScale = clampInt(options.coordQuantScale ?? DEFAULT_COORD_QUANT_SCALE, 10, 10_000);
  const header = encodeJournalHeader({ ...options, coordQuantScale });
  const frames = strokes.map((stroke) => encodeStrokeFrame(stroke, coordQuantScale));
  let totalBytes = header.byteLength;
  for (const frame of frames) totalBytes += frame.byteLength;
  const out = new Uint8Array(totalBytes);
  out.set(header, 0);
  let cursor = header.byteLength;
  for (const frame of frames) {
    out.set(frame, cursor);
    cursor += frame.byteLength;
  }
  return out;
}

/** 기존 저널 바이트 배열 끝에 새 획 프레임을 원자적 추가용으로 결합한다. */
export function appendStrokeToJournal(
  existingJournal: Uint8Array,
  stroke: JournalStrokeEntry,
  options: StrokeJournalHeaderOptions = {},
): Uint8Array {
  if (existingJournal.byteLength === 0) return encodeStrokeJournal([stroke], options);
  const view = new DataView(existingJournal.buffer, existingJournal.byteOffset, existingJournal.byteLength);
  const scale =
    existingJournal.byteLength >= JOURNAL_FILE_HEADER_BYTES && hasMagic(existingJournal, 0, MAGIC_TSWJ)
      ? clampInt(view.getUint16(6, true), 10, 10_000)
      : clampInt(options.coordQuantScale ?? DEFAULT_COORD_QUANT_SCALE, 10, 10_000);
  const frame = encodeStrokeFrame(stroke, scale);
  const combined = new Uint8Array(existingJournal.byteLength + frame.byteLength);
  combined.set(existingJournal, 0);
  combined.set(frame, existingJournal.byteLength);
  return combined;
}

function decodeSingleFramePayload(
  bytes: Uint8Array,
  payloadStart: number,
  payloadEnd: number,
  pointCount: number,
  coordQuantScale: number,
  meta: { sequence: number; layerSlot: number; brushSizePx: number },
): JournalStrokeEntry | null {
  if (payloadEnd - payloadStart < 4) return null;
  const colorRgba: JournalRgba8 = {
    r: bytes[payloadStart] ?? 0,
    g: bytes[payloadStart + 1] ?? 0,
    b: bytes[payloadStart + 2] ?? 0,
    a: bytes[payloadStart + 3] ?? 0,
  };
  if (pointCount === 0) return payloadEnd - payloadStart === 4 ? { ...meta, colorRgba, points: [] } : null;

  const anchorOffset = payloadStart + 4;
  if (anchorOffset + 22 > payloadEnd) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + anchorOffset, 22);
  const baseTimestampMs = view.getFloat64(0, true);
  if (!Number.isFinite(baseTimestampMs)) return null;

  let qx = view.getInt32(8, true);
  let qy = view.getInt32(12, true);
  let qp = view.getUint16(16, true);
  let qtX = view.getInt16(18, true);
  let qtY = view.getInt16(20, true);
  let timeTicks = 0;

  const points: JournalStrokePoint[] = [
    { x: qx / coordQuantScale, y: qy / coordQuantScale, pressure: qp / 65535, tiltX: qtX / 100, tiltY: qtY / 100, timestampMs: baseTimestampMs },
  ];

  const cursor: VarintReadCursor = { offset: anchorOffset + 22, ok: true };
  for (let i = 1; i < pointCount; i += 1) {
    qx += readSignedVarint(bytes, payloadEnd, cursor);
    qy += readSignedVarint(bytes, payloadEnd, cursor);
    qp = clampInt(qp + readSignedVarint(bytes, payloadEnd, cursor), 0, 65535);
    qtX = clampInt(qtX + readSignedVarint(bytes, payloadEnd, cursor), -9000, 9000);
    qtY = clampInt(qtY + readSignedVarint(bytes, payloadEnd, cursor), -9000, 9000);
    timeTicks += readUnsignedVarint(bytes, payloadEnd, cursor);
    if (!cursor.ok) return null;
    points.push({
      x: qx / coordQuantScale,
      y: qy / coordQuantScale,
      pressure: qp / 65535,
      tiltX: qtX / 100,
      tiltY: qtY / 100,
      timestampMs: baseTimestampMs + timeTicks / 100,
    });
  }
  return cursor.offset === payloadEnd ? { ...meta, colorRgba, points } : null;
}

function buildResult(
  status: StrokeJournalRecoveryStatus,
  messageKo: string,
  overrides: Partial<StrokeJournalDecodeResult> = {},
): StrokeJournalDecodeResult {
  return {
    status,
    headerValid: false,
    version: null,
    documentEpoch: null,
    coordQuantScale: DEFAULT_COORD_QUANT_SCALE,
    strokes: [],
    sequenceContiguous: false,
    safeTruncateByteOffset: 0,
    discardedTailBytes: 0,
    crcMismatchDetected: false,
    truncatedTailDetected: false,
    repairedJournalBytes: new Uint8Array(0),
    messageKo,
    ...overrides,
  };
}

/**
 * OPFS 저널 바이트를 검증·복원하고, 마지막 레코드가 깨졌을 경우
 * 정상 확정된 마지막 오프셋으로 자동 절단(Tail Truncation Recovery)한 복구 본을 함께 반환한다.
 */
export function recoverAndDecodeStrokeJournal(journalBytes: Uint8Array): StrokeJournalDecodeResult {
  const totalLen = journalBytes.byteLength;
  if (totalLen === 0) return buildResult("empty", "빈 획 저널 상태", { headerValid: true, sequenceContiguous: true });

  if (totalLen < JOURNAL_FILE_HEADER_BYTES || !hasMagic(journalBytes, 0, MAGIC_TSWJ)) {
    return buildResult("invalid-header", "저널 매직 헤더(TSWJ) 불일치 또는 헤더 절단 감지", {
      discardedTailBytes: totalLen,
      truncatedTailDetected: totalLen < JOURNAL_FILE_HEADER_BYTES,
    });
  }

  const headerView = new DataView(journalBytes.buffer, journalBytes.byteOffset, JOURNAL_FILE_HEADER_BYTES);
  const version = journalBytes[4] ?? 0;
  const coordQuantScale = headerView.getUint16(6, true);
  const documentEpoch = headerView.getUint32(8, true);
  const crcMismatchHeader = headerView.getUint32(12, true) !== computeCrc32(journalBytes, 0, 12);
  if (version !== STROKE_JOURNAL_VERSION || coordQuantScale < 10 || coordQuantScale > 10_000 || crcMismatchHeader) {
    return buildResult("invalid-header", "저널 파일 헤더 버전 미지원 또는 헤더 CRC32 무결성 오류", {
      version,
      documentEpoch,
      discardedTailBytes: totalLen,
      crcMismatchDetected: crcMismatchHeader,
    });
  }

  const strokes: JournalStrokeEntry[] = [];
  let offset: number = JOURNAL_FILE_HEADER_BYTES;
  let crcMismatchDetected = false;
  let truncatedTailDetected = false;

  while (offset < totalLen) {
    if (offset + JOURNAL_FRAME_HEADER_BYTES > totalLen) {
      truncatedTailDetected = true;
      break;
    }
    if (!hasMagic(journalBytes, offset, MAGIC_STRK)) {
      crcMismatchDetected = true;
      break;
    }
    const fh = new DataView(journalBytes.buffer, journalBytes.byteOffset + offset, JOURNAL_FRAME_HEADER_BYTES);
    const payloadLen = fh.getUint32(4, true);
    const frameEnd = offset + JOURNAL_FRAME_HEADER_BYTES + payloadLen;
    if (payloadLen > MAX_FRAME_PAYLOAD_BYTES || frameEnd > totalLen) {
      truncatedTailDetected = true;
      break;
    }
    if (fh.getUint32(8, true) !== computeCrc32(journalBytes, offset + 12, frameEnd)) {
      crcMismatchDetected = true;
      break;
    }
    const decoded = decodeSingleFramePayload(journalBytes, offset + JOURNAL_FRAME_HEADER_BYTES, frameEnd, fh.getUint32(20, true), coordQuantScale, {
      sequence: fh.getUint32(12, true),
      layerSlot: fh.getUint16(16, true),
      brushSizePx: fh.getUint16(18, true) / 10,
    });
    if (decoded === null) {
      truncatedTailDetected = true;
      break;
    }
    strokes.push(decoded);
    offset = frameEnd;
  }

  let sequenceContiguous = true;
  for (let i = 1; i < strokes.length; i += 1) {
    const curr = strokes[i];
    const prev = strokes[i - 1];
    if (curr !== undefined && prev !== undefined && curr.sequence !== prev.sequence + 1) sequenceContiguous = false;
  }

  const discardedTailBytes = totalLen - offset;
  const status: StrokeJournalRecoveryStatus = crcMismatchDetected
    ? "crc-mismatch-truncated"
    : truncatedTailDetected
      ? "tail-truncated-recovered"
      : "healthy";
  const messageKo =
    status === "healthy"
      ? `정상 복원 완료 (획 ${strokes.length}개)`
      : status === "tail-truncated-recovered"
        ? `비정상 종료 꼬리 레코드 ${discardedTailBytes}바이트 절단 후 직전 획 ${strokes.length}개 무손실 복구 완료`
        : `CRC32/프레임 손상 지점(${offset}B) 이후 ${discardedTailBytes}바이트 격리 및 검증된 획 ${strokes.length}개 복구 완료`;

  return buildResult(status, messageKo, {
    headerValid: true,
    version,
    documentEpoch,
    coordQuantScale,
    strokes,
    sequenceContiguous,
    safeTruncateByteOffset: offset,
    discardedTailBytes,
    crcMismatchDetected,
    truncatedTailDetected,
    repairedJournalBytes: journalBytes.slice(0, offset),
  });
}
