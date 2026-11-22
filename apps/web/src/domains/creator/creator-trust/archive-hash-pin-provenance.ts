/**
 * 구매 에셋 불변 아카이브 SHA-256 해시 핀 고정·복원 계약(`#100`) 및
 * 64-bit dHash · C2PA 스타일 인간 작화 비중 원장 통합 진입 모듈.
 *
 * - 외부 네트워크 및 브라우저 영구 저장소 호출 0건.
 * - 마켓 판매자가 원본 에셋을 사후 수정·삭제하더라도 구매 시점 SHA-256 해시 스냅샷을 핀 고정해
 *   기존 구매 작가의 원고 아카이브가 변조 없이 안전하게 열리도록 검증·복원한다.
 */

import {
  computeDHash64,
  type PixelSurfaceInput,
} from "../local-render-cache/perceptual-copyright-fingerprint";
import {
  canonicalJsonStringify,
  computeSha256Hex,
  type ByteSequence,
} from "./creator-trust-sha256";
import {
  ASSIST_TOOL_CATEGORY_LABELS_KO,
  HUMAN_PROVENANCE_LEDGER_SCHEMA,
  buildHumanStrokeProvenanceRecord,
  compareProvenanceDHash,
  verifyHumanStrokeProvenanceRecord,
  type AssistToolCategory,
  type AssistToolUsageRecord,
  type BuildHumanStrokeProvenanceInput,
  type C2paDigitalSourceTypeUri,
  type HumanAuthorshipBadge,
  type HumanAuthorshipBadgeTier,
  type HumanProvenanceAssertion,
  type HumanProvenanceVerificationResult,
  type HumanProvenanceVerificationStatus,
  type HumanStrokeProvenanceRecord,
  type NormalizedAssistToolUsageRecord,
} from "./human-stroke-provenance-ledger";

export {
  ASSIST_TOOL_CATEGORY_LABELS_KO,
  HUMAN_PROVENANCE_LEDGER_SCHEMA,
  buildHumanStrokeProvenanceRecord,
  compareProvenanceDHash,
  verifyHumanStrokeProvenanceRecord,
  type AssistToolCategory,
  type AssistToolUsageRecord,
  type BuildHumanStrokeProvenanceInput,
  type C2paDigitalSourceTypeUri,
  type HumanAuthorshipBadge,
  type HumanAuthorshipBadgeTier,
  type HumanProvenanceAssertion,
  type HumanProvenanceVerificationResult,
  type HumanProvenanceVerificationStatus,
  type HumanStrokeProvenanceRecord,
  type NormalizedAssistToolUsageRecord,
};

export const ARCHIVED_ASSET_PIN_SCHEMA = "toonstudio.archived-asset-pin/1" as const;
export const ARCHIVE_CAS_URI_PREFIX = "cas://sha256/" as const;

const HEX_SHA256_REGEX = /^[0-9a-f]{64}$/u;

export type ArchiveUpstreamCatalogState =
  | "unchanged"
  | "seller-modified"
  | "seller-deleted"
  | "offline-unreachable";

export type ArchiveStorageTier =
  | "local-opfs-cas"
  | "project-archive-bundle"
  | "offline-vault";

export interface PinPurchasedAssetSnapshotInput {
  readonly assetId: string;
  readonly assetTitle: string;
  readonly sellerId: string;
  readonly buyerId: string;
  readonly receiptId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly snapshotBytes: ByteSequence;
  readonly previewSurface?: PixelSurfaceInput;
  readonly sellerVersionTagAtPurchase?: string;
  readonly archiveStorageTier?: ArchiveStorageTier;
  readonly licenseSnapshotDigestSha256?: string;
  readonly pinnedAtIso?: string;
}

export interface ArchivedAssetHashPin {
  readonly schema: typeof ARCHIVED_ASSET_PIN_SCHEMA;
  readonly schemaVersion: 1;
  readonly pinId: string;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly sellerId: string;
  readonly buyerId: string;
  readonly receiptId: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly pinnedAtIso: string;
  readonly snapshotSha256: string;
  readonly snapshotByteLength: number;
  readonly snapshotDHash64: string | null;
  readonly contentAddressedUri: `${typeof ARCHIVE_CAS_URI_PREFIX}${string}`;
  readonly sellerVersionTagAtPurchase: string;
  readonly archiveStorageTier: ArchiveStorageTier;
  readonly licenseSnapshotDigestSha256: string | null;
  readonly immutabilityNoticeKo: string;
  readonly pinSealSha256: string;
}

export interface VerifyArchivedAssetPinContext {
  readonly pinnedSnapshotBytes?: ByteSequence | null;
  readonly fallbackMirrorBytes?: ByteSequence | null;
  readonly upstreamBytes?: ByteSequence | null;
  readonly upstreamState?: ArchiveUpstreamCatalogState;
  readonly upstreamLatestSha256?: string | null;
  /** 현재 원고를 여는 작업자·소유자 계정 ID(지정 시 핀의 구매자 ID와 대조). */
  readonly expectedBuyerId?: string;
}

export type ArchivedAssetPinStatus =
  | "verified-pinned"
  | "verified-pinned-isolated-from-upstream-change"
  | "restored-from-verified-fallback"
  | "restored-from-verified-upstream"
  | "snapshot-corrupted"
  | "snapshot-unavailable"
  | "buyer-mismatch"
  | "pin-tampered"
  | "invalid-pin";

export type ArchivedAssetRecoverySource =
  | "local-pinned-snapshot"
  | "verified-fallback-mirror"
  | "verified-upstream-exact-match";

export interface ArchivedAssetPinVerificationResult {
  readonly canOpenSafely: boolean;
  readonly status: ArchivedAssetPinStatus;
  readonly pinIntegrityValid: boolean;
  readonly recoverySource: ArchivedAssetRecoverySource | null;
  readonly expectedSnapshotSha256: string | null;
  readonly verifiedSnapshotSha256: string | null;
  readonly restoredBytes: Uint8Array | null;
  readonly upstreamState: ArchiveUpstreamCatalogState;
  readonly upstreamDriftDetected: boolean;
  readonly upstreamSubstitutionBlocked: boolean;
  readonly primaryCorruptionDetected: boolean;
  readonly summaryKo: string;
}

export interface ManuscriptArchivePinAuditReport {
  readonly totalPins: number;
  readonly allSafeToOpen: boolean;
  readonly verifiedCount: number;
  readonly isolatedUpstreamChangeCount: number;
  readonly restoredCount: number;
  readonly blockedCount: number;
  readonly results: readonly {
    readonly pinId: string;
    readonly assetId: string;
    readonly verification: ArchivedAssetPinVerificationResult;
  }[];
}

function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new RangeError(`${fieldName} 값은 비어 있을 수 없습니다.`);
  }
  return trimmed;
}

function cloneBytes(bytes: ByteSequence): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return copy;
}

/**
 * 구매 시점 에셋 바이트의 불변 SHA-256 해시 스냅샷 핀을 생성한다.
 * 판매자가 사후에 마켓 원본을 수정·삭제하더라도 구매 작가 원고 아카이브는
 * 이 콘텐츠 주소(`cas://sha256/<hash>`)와 핀 봉인 해시로 영구 재현·검증된다.
 */
export function pinPurchasedAssetSnapshot(
  input: PinPurchasedAssetSnapshotInput,
): ArchivedAssetHashPin {
  const assetId = requireNonEmpty(input.assetId, "assetId");
  const assetTitle = requireNonEmpty(input.assetTitle, "assetTitle");
  const sellerId = requireNonEmpty(input.sellerId, "sellerId");
  const buyerId = requireNonEmpty(input.buyerId, "buyerId");
  const receiptId = requireNonEmpty(input.receiptId, "receiptId");
  const workId = requireNonEmpty(input.workId, "workId");
  const episodeId = requireNonEmpty(input.episodeId, "episodeId");

  if (input.snapshotBytes.byteLength <= 0) {
    throw new RangeError("구매 스냅샷 바이트(snapshotBytes)는 1바이트 이상이어야 합니다.");
  }

  const licenseSnapshotDigestSha256 =
    input.licenseSnapshotDigestSha256 !== undefined
      ? input.licenseSnapshotDigestSha256.trim().toLowerCase()
      : null;
  if (
    licenseSnapshotDigestSha256 !== null &&
    !HEX_SHA256_REGEX.test(licenseSnapshotDigestSha256)
  ) {
    throw new RangeError("licenseSnapshotDigestSha256은 64자리 SHA-256 16진수여야 합니다.");
  }

  const snapshotSha256 = computeSha256Hex(input.snapshotBytes);
  const snapshotDHash64 =
    input.previewSurface !== undefined ? computeDHash64(input.previewSurface, "0deg").hex : null;
  const pinnedAtIso = input.pinnedAtIso ?? "2026-11-22T00:00:00.000Z";
  const sellerVersionTagAtPurchase = input.sellerVersionTagAtPurchase?.trim() || "v1.0.0";
  const archiveStorageTier: ArchiveStorageTier =
    input.archiveStorageTier ?? "project-archive-bundle";

  const pinId = `ts-pin-${computeSha256Hex(`${workId}:${episodeId}:${assetId}:${receiptId}:${snapshotSha256}`).slice(0, 16)}`;
  const contentAddressedUri: `${typeof ARCHIVE_CAS_URI_PREFIX}${string}` = `${ARCHIVE_CAS_URI_PREFIX}${snapshotSha256}`;
  const immutabilityNoticeKo =
    "본 에셋은 구매 시점 SHA-256 해시 스냅샷으로 아카이브에 고정되었습니다. 마켓 제작자의 사후 파일 수정·삭제와 무관하게 동일 바이트 무결성 검증을 통과하면 안전하게 열립니다.";

  const pinBody: Omit<ArchivedAssetHashPin, "pinSealSha256"> = {
    schema: ARCHIVED_ASSET_PIN_SCHEMA,
    schemaVersion: 1,
    pinId,
    assetId,
    assetTitle,
    sellerId,
    buyerId,
    receiptId,
    workId,
    episodeId,
    pinnedAtIso,
    snapshotSha256,
    snapshotByteLength: input.snapshotBytes.byteLength,
    snapshotDHash64,
    contentAddressedUri,
    sellerVersionTagAtPurchase,
    archiveStorageTier,
    licenseSnapshotDigestSha256,
    immutabilityNoticeKo,
  };

  return Object.freeze({
    ...pinBody,
    pinSealSha256: computeSha256Hex(canonicalJsonStringify(pinBody)),
  });
}

/**
 * 아카이브에 핀 고정된 구매 에셋 스냅샷의 무결성과 복원 가능성을 검증한다.
 *
 * - 판매자가 마켓 원본을 수정(`seller-modified`)하거나 삭제(`seller-deleted`)해도
 *   로컬 핀 스냅샷(또는 검증된 백업 미러)의 SHA-256이 구매 해시와 일치하면 안전하게 연다.
 * - 구매 해시와 다른 판매자 수정본(`upstreamBytes`)으로의 무음 대체는 절대 허용하지 않는다(fail-closed).
 */
export function verifyArchivedAssetPin(
  pin: unknown,
  context: VerifyArchivedAssetPinContext,
): ArchivedAssetPinVerificationResult {
  const upstreamState: ArchiveUpstreamCatalogState = context.upstreamState ?? "unchanged";

  if (!pin || typeof pin !== "object") {
    return Object.freeze({
      canOpenSafely: false,
      status: "invalid-pin",
      pinIntegrityValid: false,
      recoverySource: null,
      expectedSnapshotSha256: null,
      verifiedSnapshotSha256: null,
      restoredBytes: null,
      upstreamState,
      upstreamDriftDetected: false,
      upstreamSubstitutionBlocked: false,
      primaryCorruptionDetected: false,
      summaryKo: "아카이브 핀 레코드가 유효한 객체 형식이 아닙니다.",
    });
  }

  const candidate = pin as Partial<ArchivedAssetHashPin>;
  if (
    candidate.schema !== ARCHIVED_ASSET_PIN_SCHEMA ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.pinId !== "string" ||
    typeof candidate.assetId !== "string" ||
    typeof candidate.buyerId !== "string" ||
    typeof candidate.snapshotSha256 !== "string" ||
    !HEX_SHA256_REGEX.test(candidate.snapshotSha256) ||
    typeof candidate.pinSealSha256 !== "string" ||
    !HEX_SHA256_REGEX.test(candidate.pinSealSha256) ||
    typeof candidate.snapshotByteLength !== "number" ||
    !Number.isSafeInteger(candidate.snapshotByteLength) ||
    candidate.snapshotByteLength <= 0 ||
    candidate.contentAddressedUri !== `${ARCHIVE_CAS_URI_PREFIX}${candidate.snapshotSha256}`
  ) {
    return Object.freeze({
      canOpenSafely: false,
      status: "invalid-pin",
      pinIntegrityValid: false,
      recoverySource: null,
      expectedSnapshotSha256: null,
      verifiedSnapshotSha256: null,
      restoredBytes: null,
      upstreamState,
      upstreamDriftDetected: false,
      upstreamSubstitutionBlocked: false,
      primaryCorruptionDetected: false,
      summaryKo: "아카이브 핀 스키마 또는 SHA-256 콘텐츠 주소 형식이 올바르지 않습니다.",
    });
  }

  const { pinSealSha256, ...pinBody } = candidate as ArchivedAssetHashPin;
  const expectedPinSeal = computeSha256Hex(canonicalJsonStringify(pinBody));
  if (expectedPinSeal !== pinSealSha256) {
    return Object.freeze({
      canOpenSafely: false,
      status: "pin-tampered",
      pinIntegrityValid: false,
      recoverySource: null,
      expectedSnapshotSha256: candidate.snapshotSha256,
      verifiedSnapshotSha256: null,
      restoredBytes: null,
      upstreamState,
      upstreamDriftDetected: false,
      upstreamSubstitutionBlocked: false,
      primaryCorruptionDetected: false,
      summaryKo: "아카이브 해시 핀 봉인 서명이 변조되어 에셋 복원을 차단했습니다.",
    });
  }

  if (
    context.expectedBuyerId !== undefined &&
    context.expectedBuyerId.trim() !== candidate.buyerId
  ) {
    return Object.freeze({
      canOpenSafely: false,
      status: "buyer-mismatch",
      pinIntegrityValid: true,
      recoverySource: null,
      expectedSnapshotSha256: candidate.snapshotSha256,
      verifiedSnapshotSha256: null,
      restoredBytes: null,
      upstreamState,
      upstreamDriftDetected: false,
      upstreamSubstitutionBlocked: false,
      primaryCorruptionDetected: false,
      summaryKo: "핀 고정된 구매자 계정과 요청 작업자 계정이 일치하지 않습니다.",
    });
  }

  const expectedHash = candidate.snapshotSha256;
  const normalizedUpstreamLatestHash = context.upstreamLatestSha256?.trim().toLowerCase() ?? null;
  const upstreamBytesHash =
    context.upstreamBytes && context.upstreamBytes.byteLength > 0
      ? computeSha256Hex(context.upstreamBytes)
      : null;

  const upstreamHashDiffers =
    (normalizedUpstreamLatestHash !== null && normalizedUpstreamLatestHash !== expectedHash) ||
    (upstreamBytesHash !== null && upstreamBytesHash !== expectedHash);
  const upstreamDriftDetected =
    upstreamState === "seller-deleted" ||
    upstreamState === "seller-modified" ||
    upstreamHashDiffers;
  const upstreamSubstitutionBlocked = upstreamBytesHash !== null && upstreamBytesHash !== expectedHash;

  const primaryBytes = context.pinnedSnapshotBytes ?? null;
  let primaryCorruptionDetected = false;
  if (primaryBytes !== null) {
    const primaryHash = computeSha256Hex(primaryBytes);
    if (primaryHash === expectedHash && primaryBytes.byteLength === candidate.snapshotByteLength) {
      const isolated = upstreamDriftDetected;
      return Object.freeze({
        canOpenSafely: true,
        status: isolated
          ? "verified-pinned-isolated-from-upstream-change"
          : "verified-pinned",
        pinIntegrityValid: true,
        recoverySource: "local-pinned-snapshot",
        expectedSnapshotSha256: expectedHash,
        verifiedSnapshotSha256: primaryHash,
        restoredBytes: cloneBytes(primaryBytes),
        upstreamState,
        upstreamDriftDetected,
        upstreamSubstitutionBlocked,
        primaryCorruptionDetected: false,
        summaryKo: isolated
          ? `마켓 원본 변경·삭제(${upstreamState})를 격리하고 구매 시점 SHA-256 핀 스냅샷으로 원고를 안전하게 열었습니다.`
          : "구매 시점 SHA-256 아카이브 핀 스냅샷 무결성 검증을 통과했습니다.",
      });
    }
    primaryCorruptionDetected = true;
  }

  const fallbackBytes = context.fallbackMirrorBytes ?? null;
  if (fallbackBytes !== null) {
    const fallbackHash = computeSha256Hex(fallbackBytes);
    if (
      fallbackHash === expectedHash &&
      fallbackBytes.byteLength === candidate.snapshotByteLength
    ) {
      return Object.freeze({
        canOpenSafely: true,
        status: "restored-from-verified-fallback",
        pinIntegrityValid: true,
        recoverySource: "verified-fallback-mirror",
        expectedSnapshotSha256: expectedHash,
        verifiedSnapshotSha256: fallbackHash,
        restoredBytes: cloneBytes(fallbackBytes),
        upstreamState,
        upstreamDriftDetected,
        upstreamSubstitutionBlocked,
        primaryCorruptionDetected,
        summaryKo: primaryCorruptionDetected
          ? "로컬 캐시 스냅샷 손상을 감지해 검증된 백업 미러에서 구매 시점 원본을 복원했습니다."
          : "검증된 아카이브 백업 미러에서 구매 시점 SHA-256 스냅샷을 복원했습니다.",
      });
    }
  }

  if (
    context.upstreamBytes &&
    upstreamBytesHash === expectedHash &&
    context.upstreamBytes.byteLength === candidate.snapshotByteLength
  ) {
    return Object.freeze({
      canOpenSafely: true,
      status: "restored-from-verified-upstream",
      pinIntegrityValid: true,
      recoverySource: "verified-upstream-exact-match",
      expectedSnapshotSha256: expectedHash,
      verifiedSnapshotSha256: upstreamBytesHash,
      restoredBytes: cloneBytes(context.upstreamBytes),
      upstreamState,
      upstreamDriftDetected,
      upstreamSubstitutionBlocked: false,
      primaryCorruptionDetected,
      summaryKo: "구매 시점 SHA-256과 정확히 일치하는 마켓 원본에서 로컬 아카이브 스냅샷을 복구했습니다.",
    });
  }

  if (primaryCorruptionDetected) {
    return Object.freeze({
      canOpenSafely: false,
      status: "snapshot-corrupted",
      pinIntegrityValid: true,
      recoverySource: null,
      expectedSnapshotSha256: expectedHash,
      verifiedSnapshotSha256: null,
      restoredBytes: null,
      upstreamState,
      upstreamDriftDetected,
      upstreamSubstitutionBlocked,
      primaryCorruptionDetected: true,
      summaryKo: upstreamSubstitutionBlocked
        ? "로컬 스냅샷이 손상되었으며 해시가 다른 판매자 수정본으로의 무단 대체를 차단했습니다. 백업 아카이브에서 복구하세요."
        : "로컬 핀 스냅샷의 SHA-256 해시가 구매 시점 핀과 일치하지 않아 열기를 중단했습니다.",
    });
  }

  return Object.freeze({
    canOpenSafely: false,
    status: "snapshot-unavailable",
    pinIntegrityValid: true,
    recoverySource: null,
    expectedSnapshotSha256: expectedHash,
    verifiedSnapshotSha256: null,
    restoredBytes: null,
    upstreamState,
    upstreamDriftDetected,
    upstreamSubstitutionBlocked,
    primaryCorruptionDetected: false,
    summaryKo: upstreamSubstitutionBlocked
      ? "구매 시점 스냅샷을 찾을 수 없으며 SHA-256이 다른 마켓 수정본으로의 자동 대체를 차단했습니다."
      : "구매 시점 SHA-256 스냅샷 파일이 누락되었습니다. 프로젝트 아카이브 백업을 연결해 복구하세요.",
  });
}

/** 원고 전체에 핀 고정된 모든 구매 에셋을 일괄 검증·복원 감사한다. */
export function verifyManuscriptArchivePins(
  pins: readonly ArchivedAssetHashPin[],
  resolveContext: (pin: ArchivedAssetHashPin) => VerifyArchivedAssetPinContext,
): ManuscriptArchivePinAuditReport {
  let verifiedCount = 0;
  let isolatedUpstreamChangeCount = 0;
  let restoredCount = 0;
  let blockedCount = 0;

  const results = pins.map((pin) => {
    const verification = verifyArchivedAssetPin(pin, resolveContext(pin));
    if (!verification.canOpenSafely) {
      blockedCount += 1;
    } else if (verification.status === "verified-pinned-isolated-from-upstream-change") {
      verifiedCount += 1;
      isolatedUpstreamChangeCount += 1;
    } else if (verification.status === "verified-pinned") {
      verifiedCount += 1;
    } else {
      restoredCount += 1;
    }
    return Object.freeze({
      pinId: pin.pinId,
      assetId: pin.assetId,
      verification,
    });
  });

  return Object.freeze({
    totalPins: pins.length,
    allSafeToOpen: blockedCount === 0,
    verifiedCount,
    isolatedUpstreamChangeCount,
    restoredCount,
    blockedCount,
    results: Object.freeze(results),
  });
}
