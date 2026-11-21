/**
 * 바이너리 원본(.clip/.psd/.blend/.skp/.vrm) 단독 체크아웃 잠금 · 외주 스코프 시한부 링크 ·
 * 실제 Uint8ClampedArray RGBA 비가시 LSB 포렌식 워터마크 인코더/디코더 (T-008, T-009).
 */

import type { DivisionRoleId, LayerFolderId } from "./layer-authority-rbac";

export const SUPPORTED_BINARY_EXTENSIONS = [".clip", ".psd", ".blend", ".skp", ".vrm"] as const;

export type SupportedBinaryExtension = (typeof SUPPORTED_BINARY_EXTENSIONS)[number];

export interface BinaryAssetLockRecord {
  readonly assetPath: string;
  readonly extension: SupportedBinaryExtension;
  readonly holderId: string;
  readonly holderName: string;
  readonly holderRole: DivisionRoleId;
  readonly checkedOutAtIso: string;
  readonly expiresAtIso: string;
}

export interface BinaryLockAuditEntry {
  readonly id: string;
  readonly assetPath: string;
  readonly action: "checkout" | "release" | "force_reclaim" | "expired_purge";
  readonly actorId: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly occurredAtIso: string;
}

export interface BinaryLockRegistry {
  readonly locks: Readonly<Record<string, BinaryAssetLockRecord>>;
  readonly auditLog: readonly BinaryLockAuditEntry[];
}

export interface BinaryLockOperationResult {
  readonly ok: boolean;
  readonly registry: BinaryLockRegistry;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface OutsourceScopedLink {
  readonly token: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly sliceId: string;
  readonly allowedFolders: readonly LayerFolderId[];
  readonly vendorId: string;
  readonly vendorName: string;
  readonly issuedAtIso: string;
  readonly expiresAtIso: string;
  readonly revoked: boolean;
  readonly watermarkPayload: string;
}

export interface OutsourceScopedVerificationResult {
  readonly allowed: boolean;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface ForensicWatermarkEmbedResult {
  readonly ok: boolean;
  readonly watermarkedRgba: Uint8ClampedArray | null;
  readonly embeddedBits: number;
  readonly capacityBits: number;
  readonly maxChannelDelta: number;
  readonly psnrDb: number;
  readonly crc16Hex: string;
  readonly errorReason?: string;
}

export interface ForensicWatermarkExtractResult {
  readonly found: boolean;
  readonly verified: boolean;
  readonly payload: string | null;
  readonly crc16Hex: string | null;
  readonly byteLength: number;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

const WATERMARK_MAGIC: readonly [number, number, number, number] = [0x54, 0x53, 0x57, 0x4d]; // "TSWM"
const WATERMARK_HEADER_BYTES = 8; // 4B magic + 2B length + 2B CRC-16

function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** CRC-16/CCITT-FALSE 체크섬 (포렌식 페이로드 무결성·변조 탐지용) */
function computeCrc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

export function detectBinaryExtension(assetPath: string): SupportedBinaryExtension | null {
  const lower = assetPath.trim().toLowerCase();
  for (const ext of SUPPORTED_BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

export function createInitialBinaryLockRegistry(nowIso = "2026-11-21T09:00:00.000Z"): BinaryLockRegistry {
  const expiresAtIso = new Date(Date.parse(nowIso) + 180 * 60_000).toISOString();
  const initialLocks: Record<string, BinaryAssetLockRecord> = {
    "ep12/20_LINE/ep12_slice01_line.clip": {
      assetPath: "ep12/20_LINE/ep12_slice01_line.clip",
      extension: ".clip",
      holderId: "m-line-1",
      holderName: "박서윤",
      holderRole: "line",
      checkedOutAtIso: nowIso,
      expiresAtIso,
    },
    "ep12/10_BG_3D/post_office_night.blend": {
      assetPath: "ep12/10_BG_3D/post_office_night.blend",
      extension: ".blend",
      holderId: "m-bg-1",
      holderName: "정우진",
      holderRole: "bg3d",
      checkedOutAtIso: nowIso,
      expiresAtIso,
    },
  };
  return {
    locks: initialLocks,
    auditLog: [
      {
        id: "audit-init-1",
        assetPath: "ep12/20_LINE/ep12_slice01_line.clip",
        action: "checkout",
        actorId: "m-line-1",
        detailKo: "박서윤님이 .clip 원본 단독 체크아웃 잠금 획득",
        detailEn: "Park Seoyun acquired exclusive .clip checkout lock.",
        occurredAtIso: nowIso,
      },
    ],
  };
}

/** 만료된 바이너리 잠금 정리 */
export function purgeExpiredBinaryLocks(
  registry: BinaryLockRegistry,
  nowIso: string,
): BinaryLockRegistry {
  const nowMs = Date.parse(nowIso);
  const nextLocks: Record<string, BinaryAssetLockRecord> = {};
  const nextAudit = [...registry.auditLog];

  for (const [path, record] of Object.entries(registry.locks)) {
    if (Date.parse(record.expiresAtIso) > nowMs) {
      nextLocks[path] = record;
    } else {
      nextAudit.push({
        id: `audit-exp-${fnv1aHex(`${path}:${nowIso}`)}`,
        assetPath: path,
        action: "expired_purge",
        actorId: "system",
        detailKo: `${record.holderName}님의 만료된 잠금(${path}) 자동 회수`,
        detailEn: `Auto-purged expired lock on ${path} held by ${record.holderName}.`,
        occurredAtIso: nowIso,
      });
    }
  }

  return { locks: nextLocks, auditLog: nextAudit };
}

/** .clip/.psd/.blend/.skp/.vrm 단독 체크아웃 잠금 획득 */
export function checkoutBinaryAssetLock(
  registry: BinaryLockRegistry,
  input: {
    readonly assetPath: string;
    readonly holderId: string;
    readonly holderName: string;
    readonly holderRole: DivisionRoleId;
    readonly nowIso: string;
    readonly ttlMinutes?: number;
  },
): BinaryLockOperationResult {
  const cleaned = purgeExpiredBinaryLocks(registry, input.nowIso);
  const extension = detectBinaryExtension(input.assetPath);
  if (!extension) {
    return {
      ok: false,
      registry: cleaned,
      reasonKo: `지원하지 않는 바이너리 형식입니다. (${SUPPORTED_BINARY_EXTENSIONS.join(", ")} 전용)`,
      reasonEn: `Unsupported binary extension. Supported: ${SUPPORTED_BINARY_EXTENSIONS.join(", ")}.`,
    };
  }

  const existing = cleaned.locks[input.assetPath];
  if (existing && existing.holderId !== input.holderId) {
    return {
      ok: false,
      registry: cleaned,
      reasonKo: `${input.assetPath}은(는) ${existing.holderName}님이 단독 점유 중입니다.`,
      reasonEn: `${input.assetPath} is exclusively locked by ${existing.holderName}.`,
    };
  }

  const ttlMinutes = Math.max(15, Math.min(720, input.ttlMinutes ?? 180));
  const expiresAtIso = new Date(Date.parse(input.nowIso) + ttlMinutes * 60_000).toISOString();
  const record: BinaryAssetLockRecord = {
    assetPath: input.assetPath,
    extension,
    holderId: input.holderId,
    holderName: input.holderName,
    holderRole: input.holderRole,
    checkedOutAtIso: input.nowIso,
    expiresAtIso,
  };

  return {
    ok: true,
    registry: {
      locks: { ...cleaned.locks, [input.assetPath]: record },
      auditLog: [
        ...cleaned.auditLog,
        {
          id: `audit-co-${fnv1aHex(`${input.assetPath}:${input.holderId}:${input.nowIso}`)}`,
          assetPath: input.assetPath,
          action: "checkout",
          actorId: input.holderId,
          detailKo: `${input.holderName}님이 ${input.assetPath} 단독 잠금 획득 (${ttlMinutes}분)`,
          detailEn: `${input.holderName} checked out ${input.assetPath} (${ttlMinutes}m lock).`,
          occurredAtIso: input.nowIso,
        },
      ],
    },
    reasonKo: `${input.assetPath} 체크아웃 완료 (${ttlMinutes}분 단독 잠금)`,
    reasonEn: `Checked out ${input.assetPath} with ${ttlMinutes}m exclusive lock.`,
  };
}

/** 본인 보유 바이너리 잠금 해제 */
export function releaseBinaryAssetLock(
  registry: BinaryLockRegistry,
  input: {
    readonly assetPath: string;
    readonly actorId: string;
    readonly nowIso: string;
  },
): BinaryLockOperationResult {
  const existing = registry.locks[input.assetPath];
  if (!existing) {
    return {
      ok: false,
      registry,
      reasonKo: `${input.assetPath}에 활성 잠금이 없습니다.`,
      reasonEn: `No active lock found for ${input.assetPath}.`,
    };
  }
  if (existing.holderId !== input.actorId) {
    return {
      ok: false,
      registry,
      reasonKo: `${existing.holderName}님이 보유한 잠금은 본인 해제할 수 없습니다. PD/AD 강제 회수를 사용하세요.`,
      reasonEn: `Cannot release lock held by ${existing.holderName}; PD/AD force-reclaim required.`,
    };
  }

  const nextLocks = { ...registry.locks };
  delete nextLocks[input.assetPath];
  return {
    ok: true,
    registry: {
      locks: nextLocks,
      auditLog: [
        ...registry.auditLog,
        {
          id: `audit-rel-${fnv1aHex(`${input.assetPath}:${input.actorId}:${input.nowIso}`)}`,
          assetPath: input.assetPath,
          action: "release",
          actorId: input.actorId,
          detailKo: `${existing.holderName}님이 ${input.assetPath} 잠금을 정상 해제`,
          detailEn: `${existing.holderName} released lock on ${input.assetPath}.`,
          occurredAtIso: input.nowIso,
        },
      ],
    },
    reasonKo: `${input.assetPath} 체크인 및 잠금 해제 완료`,
    reasonEn: `Checked in and released lock on ${input.assetPath}.`,
  };
}

/** PD/AD 직권 바이너리 잠금 강제 회수 */
export function forceReclaimBinaryAssetLock(
  registry: BinaryLockRegistry,
  input: {
    readonly assetPath: string;
    readonly actorId: string;
    readonly actorRole: DivisionRoleId;
    readonly reason: string;
    readonly nowIso: string;
  },
): BinaryLockOperationResult {
  if (input.actorRole !== "pd" && input.actorRole !== "art_director") {
    return {
      ok: false,
      registry,
      reasonKo: "강제 회수는 PD 또는 AD 권한만 수행할 수 있습니다.",
      reasonEn: "Only PD or AD roles can force-reclaim an active binary lock.",
    };
  }
  const existing = registry.locks[input.assetPath];
  if (!existing) {
    return {
      ok: false,
      registry,
      reasonKo: `${input.assetPath}에 회수할 잠금이 없습니다.`,
      reasonEn: `No active lock to reclaim on ${input.assetPath}.`,
    };
  }

  const nextLocks = { ...registry.locks };
  delete nextLocks[input.assetPath];
  const note = input.reason.trim() || "마감 긴급 인계";
  return {
    ok: true,
    registry: {
      locks: nextLocks,
      auditLog: [
        ...registry.auditLog,
        {
          id: `audit-frc-${fnv1aHex(`${input.assetPath}:${input.actorId}:${input.nowIso}`)}`,
          assetPath: input.assetPath,
          action: "force_reclaim",
          actorId: input.actorId,
          detailKo: `${input.actorRole.toUpperCase()} 직권으로 ${existing.holderName}님의 ${input.assetPath} 잠금 강제 회수 (${note})`,
          detailEn: `${input.actorRole.toUpperCase()} force-reclaimed ${input.assetPath} from ${existing.holderName} (${note}).`,
          occurredAtIso: input.nowIso,
        },
      ],
    },
    reasonKo: `${input.assetPath} 잠금을 강제 회수하고 감사 로그에 기록했습니다.`,
    reasonEn: `Force-reclaimed ${input.assetPath} and recorded audit entry.`,
  };
}

/** 외주 스코프 시한부 링크 발급 (T-009) */
export function issueOutsourceScopedLink(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly sliceId: string;
  readonly allowedFolders: readonly LayerFolderId[];
  readonly vendorId: string;
  readonly vendorName: string;
  readonly nowIso: string;
  readonly ttlHours?: number;
}): OutsourceScopedLink {
  const ttlHours = Math.max(1, Math.min(168, Math.round(input.ttlHours ?? 48)));
  const expiresAtIso = new Date(Date.parse(input.nowIso) + ttlHours * 3_600_000).toISOString();
  const digest = fnv1aHex(
    `${input.projectId}:${input.episodeId}:${input.sliceId}:${input.vendorId}:${expiresAtIso}`,
  );
  const compactExp = expiresAtIso.slice(0, 10).replaceAll("-", "");
  return {
    token: `ts-ext-${digest}`,
    projectId: input.projectId,
    episodeId: input.episodeId,
    sliceId: input.sliceId,
    allowedFolders: [...new Set(input.allowedFolders)],
    vendorId: input.vendorId,
    vendorName: input.vendorName,
    issuedAtIso: input.nowIso,
    expiresAtIso,
    revoked: false,
    watermarkPayload: `v=${input.vendorId}|ep=${input.episodeId}|sl=${input.sliceId}|exp=${compactExp}`,
  };
}

export function verifyOutsourceScopedAccess(
  link: OutsourceScopedLink,
  request: {
    readonly sliceId: string;
    readonly folder: LayerFolderId;
    readonly nowIso: string;
  },
): OutsourceScopedVerificationResult {
  if (link.revoked) {
    return {
      allowed: false,
      reasonKo: "폐기된 외주 링크입니다.",
      reasonEn: "Outsource link has been revoked.",
    };
  }
  if (Date.parse(request.nowIso) >= Date.parse(link.expiresAtIso)) {
    return {
      allowed: false,
      reasonKo: "만료된 외주 스코프 링크입니다.",
      reasonEn: "Outsource scoped link has expired.",
    };
  }
  if (request.sliceId !== link.sliceId) {
    return {
      allowed: false,
      reasonKo: `허가되지 않은 슬라이스(${request.sliceId}) 접근 차단 (허가: ${link.sliceId}).`,
      reasonEn: `Denied out-of-scope slice ${request.sliceId} (allowed: ${link.sliceId}).`,
    };
  }
  if (!link.allowedFolders.includes(request.folder)) {
    return {
      allowed: false,
      reasonKo: `허가되지 않은 레이어 폴더(${request.folder}) 접근 차단.`,
      reasonEn: `Denied out-of-scope layer folder ${request.folder}.`,
    };
  }
  return {
    allowed: true,
    reasonKo: `${link.vendorName} 외주 스코프 접근 허용 (${request.sliceId} / ${request.folder})`,
    reasonEn: `Granted scoped access to ${link.vendorName} (${request.sliceId} / ${request.folder}).`,
  };
}

/**
 * 실제 Uint8ClampedArray RGBA 픽셀 버퍼의 RGB 채널 최하위 비트(LSB)에
 * 비가시 포렌식 워터마크(TSWM 매직 + 16비트 길이 + UTF-8 페이로드 + CRC-16)를 삽입한다.
 * 알파 채널은 보존되며, 채널당 최대 변경폭은 ±1 (비가시 PSNR > 51 dB)로 보장된다.
 */
export function embedForensicLsbWatermark(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  payload: string,
): ForensicWatermarkEmbedResult {
  const expectedLength = width * height * 4;
  if (width <= 0 || height <= 0 || rgba.length < expectedLength) {
    return {
      ok: false,
      watermarkedRgba: null,
      embeddedBits: 0,
      capacityBits: 0,
      maxChannelDelta: 0,
      psnrDb: 0,
      crc16Hex: "0000",
      errorReason: "Invalid RGBA buffer dimensions.",
    };
  }

  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  if (payloadBytes.length === 0 || payloadBytes.length > 0xffff) {
    return {
      ok: false,
      watermarkedRgba: null,
      embeddedBits: 0,
      capacityBits: width * height * 3,
      maxChannelDelta: 0,
      psnrDb: 0,
      crc16Hex: "0000",
      errorReason: "Payload must be 1..65535 UTF-8 bytes.",
    };
  }

  const totalBytes = WATERMARK_HEADER_BYTES + payloadBytes.length;
  const requiredBits = totalBytes * 8;
  const capacityBits = width * height * 3; // R, G, B channels (Alpha untouched)
  if (requiredBits > capacityBits) {
    return {
      ok: false,
      watermarkedRgba: null,
      embeddedBits: 0,
      capacityBits,
      maxChannelDelta: 0,
      psnrDb: 0,
      crc16Hex: "0000",
      errorReason: `Insufficient RGBA capacity: need ${requiredBits} bits, have ${capacityBits} bits.`,
    };
  }

  const crc16 = computeCrc16(payloadBytes);
  const packet = new Uint8Array(totalBytes);
  packet[0] = WATERMARK_MAGIC[0];
  packet[1] = WATERMARK_MAGIC[1];
  packet[2] = WATERMARK_MAGIC[2];
  packet[3] = WATERMARK_MAGIC[3];
  packet[4] = (payloadBytes.length >>> 8) & 0xff;
  packet[5] = payloadBytes.length & 0xff;
  packet[6] = (crc16 >>> 8) & 0xff;
  packet[7] = crc16 & 0xff;
  packet.set(payloadBytes, WATERMARK_HEADER_BYTES);

  const output = new Uint8ClampedArray(rgba);
  let bitCursor = 0;
  let maxChannelDelta = 0;
  let squaredErrorSum = 0;

  for (let pixelIndex = 0; pixelIndex < width * height && bitCursor < requiredBits; pixelIndex += 1) {
    const baseOffset = pixelIndex * 4;
    for (let channel = 0; channel < 3 && bitCursor < requiredBits; channel += 1) {
      const byteIndex = bitCursor >>> 3;
      const bitOffset = 7 - (bitCursor & 7);
      const bit = ((packet[byteIndex] ?? 0) >>> bitOffset) & 1;
      const original = output[baseOffset + channel] ?? 0;
      const updated = (original & 0xfe) | bit;
      const delta = Math.abs(updated - original);
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      squaredErrorSum += delta * delta;
      output[baseOffset + channel] = updated;
      bitCursor += 1;
    }
  }

  const totalRgbChannels = width * height * 3;
  const mse = squaredErrorSum / totalRgbChannels;
  const psnrDb =
    mse === 0
      ? 99.99
      : Math.round((10 * Math.log10((255 * 255) / mse)) * 100) / 100;

  return {
    ok: true,
    watermarkedRgba: output,
    embeddedBits: bitCursor,
    capacityBits,
    maxChannelDelta,
    psnrDb,
    crc16Hex: crc16.toString(16).toUpperCase().padStart(4, "0"),
  };
}

/** RGBA 버퍼에서 비가시 LSB 포렌식 워터마크를 비트 단위로 복원하고 CRC-16 무결성을 검증한다 */
export function extractForensicLsbWatermark(
  rgba: Uint8ClampedArray,
): ForensicWatermarkExtractResult {
  const pixelCount = Math.floor(rgba.length / 4);
  const capacityBits = pixelCount * 3;
  if (capacityBits < WATERMARK_HEADER_BYTES * 8) {
    return {
      found: false,
      verified: false,
      payload: null,
      crc16Hex: null,
      byteLength: 0,
      reasonKo: "픽셀 버퍼가 포렌식 헤더 크기보다 작습니다.",
      reasonEn: "RGBA buffer is smaller than the forensic header size.",
    };
  }

  const readByteAt = (byteIndex: number): number => {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const globalBit = byteIndex * 8 + bit;
      const pixelIndex = Math.floor(globalBit / 3);
      const channel = globalBit % 3;
      const lsb = (rgba[pixelIndex * 4 + channel] ?? 0) & 1;
      value = (value << 1) | lsb;
    }
    return value;
  };

  for (let i = 0; i < 4; i += 1) {
    if (readByteAt(i) !== WATERMARK_MAGIC[i]) {
      return {
        found: false,
        verified: false,
        payload: null,
        crc16Hex: null,
        byteLength: 0,
        reasonKo: "포렌식 워터마크 매직 시그니처(TSWM)가 감지되지 않았습니다.",
        reasonEn: "Forensic watermark magic signature (TSWM) not found.",
      };
    }
  }

  const payloadLength = (readByteAt(4) << 8) | readByteAt(5);
  const expectedCrc16 = (readByteAt(6) << 8) | readByteAt(7);
  const totalRequiredBits = (WATERMARK_HEADER_BYTES + payloadLength) * 8;
  if (payloadLength === 0 || totalRequiredBits > capacityBits) {
    return {
      found: true,
      verified: false,
      payload: null,
      crc16Hex: expectedCrc16.toString(16).toUpperCase().padStart(4, "0"),
      byteLength: payloadLength,
      reasonKo: "워터마크 길이 헤더가 손상되었거나 픽셀 용량을 초과했습니다.",
      reasonEn: "Corrupted watermark length header or truncated pixel buffer.",
    };
  }

  const payloadBytes = new Uint8Array(payloadLength);
  for (let index = 0; index < payloadLength; index += 1) {
    payloadBytes[index] = readByteAt(WATERMARK_HEADER_BYTES + index);
  }

  const actualCrc16 = computeCrc16(payloadBytes);
  const crc16Hex = actualCrc16.toString(16).toUpperCase().padStart(4, "0");
  if (actualCrc16 !== expectedCrc16) {
    return {
      found: true,
      verified: false,
      payload: null,
      crc16Hex,
      byteLength: payloadLength,
      reasonKo: `CRC-16 무결성 불일치 (기대 ${expectedCrc16.toString(16).toUpperCase().padStart(4, "0")} ≠ 실측 ${crc16Hex}) — 픽셀 변조 의심`,
      reasonEn: `CRC-16 checksum mismatch (expected ${expectedCrc16.toString(16).toUpperCase().padStart(4, "0")} vs actual ${crc16Hex}) — possible tampering.`,
    };
  }

  const payload = new TextDecoder().decode(payloadBytes);
  return {
    found: true,
    verified: true,
    payload,
    crc16Hex,
    byteLength: payloadLength,
    reasonKo: `포렌식 워터마크 복원 및 CRC-16(${crc16Hex}) 검증 완료 (${payloadLength} bytes)`,
    reasonEn: `Forensic watermark extracted & CRC-16(${crc16Hex}) verified (${payloadLength} bytes).`,
  };
}

/** 데모·검증용 결정적 RGBA 테스트 프레임 생성기 */
export function createSampleManuscriptRgbaBuffer(
  width = 64,
  height = 32,
): Uint8ClampedArray {
  const buffer = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      buffer[offset] = (40 + x * 3) & 0xff;
      buffer[offset + 1] = (64 + y * 5) & 0xff;
      buffer[offset + 2] = (120 + ((x + y) * 2)) & 0xff;
      buffer[offset + 3] = 255;
    }
  }
  return buffer;
}
