/**
 * 크리에이터 마켓 10초 워터마크 체험 배치(Trial Stamp) → 구매 즉시 원본 무손실 자동 치환 계약.
 *
 * - 브라우저 영구 저장소에 직접 접근하지 않는 순수 도메인 엔진.
 * - 체험 프록시는 출고 차단(`exportBlocked: true`)으로 강제되며, 유효한 결제 영수증과
 *   SHA-256 해시가 일치하는 무손실 원본이 검증된 경우에만 좌표·변환을 100% 보존해 치환한다.
 * - 3줄 투명 라이선스 배지(`상업 연재 / 어시 공유 / 단행본`) 및 스폰서 격리 API를 함께 재노출한다.
 */

import {
  canonicalJsonStringify,
  computeSha256Hex,
} from "../creator-trust/creator-trust-sha256";
import {
  SUPPORTED_SETTLEMENT_CURRENCIES,
  type SettlementCurrency,
} from "./settlement-currency-utils";
import {
  SPONSORED_BADGE_LABEL_KO,
  STANDARD_MARKET_LICENSE_PRESETS,
  TRIAL_STAMP_LICENSE_SCHEMA_VERSION,
  buildTransparentLicenseSummary,
  checkLicenseUsageEligibility,
  createMarketplaceCardDisclosure,
  partitionMarketplaceListings,
  type AssetLicenseRightsInput,
  type LicenseAxisSpec,
  type LicenseBadgeAxis,
  type LicenseGrantStatus,
  type LicenseUsageCheckInput,
  type LicenseUsageCheckResult,
  type MarketplaceCardDisclosure,
  type MarketplaceListingCardInput,
  type MarketplaceListingPlacement,
  type PartitionedMarketplaceListings,
  type TransparentLicenseBadgeItem,
  type TransparentLicenseThreeLineSummary,
} from "./transparent-license-badges";

export {
  SPONSORED_BADGE_LABEL_KO,
  STANDARD_MARKET_LICENSE_PRESETS,
  TRIAL_STAMP_LICENSE_SCHEMA_VERSION,
  buildTransparentLicenseSummary,
  checkLicenseUsageEligibility,
  createMarketplaceCardDisclosure,
  partitionMarketplaceListings,
  type AssetLicenseRightsInput,
  type LicenseAxisSpec,
  type LicenseBadgeAxis,
  type LicenseGrantStatus,
  type LicenseUsageCheckInput,
  type LicenseUsageCheckResult,
  type MarketplaceCardDisclosure,
  type MarketplaceListingCardInput,
  type MarketplaceListingPlacement,
  type PartitionedMarketplaceListings,
  type TransparentLicenseBadgeItem,
  type TransparentLicenseThreeLineSummary,
};

/** 1클릭 캔버스 워터마크 체험 배치 목표 응답 시간(10초). */
export const TRIAL_STAMP_QUICK_PLACE_TARGET_MS = 10_000 as const;

const HEX_SHA256_REGEX = /^[0-9a-f]{64}$/u;
const DEFAULT_RECEIPT_SECRET = "toonstudio.local-commerce-receipt-seal.v1";

export type CanvasBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export interface Camera3dPoseSnapshot {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDeg: number;
}

export interface CanvasPlacementTransform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly skewXDeg: number;
  readonly skewYDeg: number;
  readonly opacity: number;
  readonly zIndex: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly blendMode: CanvasBlendMode;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly camera3dPose?: Camera3dPoseSnapshot;
}

export interface TrialWatermarkSpec {
  readonly watermarkText: string;
  readonly diagonalAngleDeg: number;
  readonly opacity: number;
  readonly proxyMaxDimensionPx: number;
  readonly losslessBlocked: true;
}

export interface TrialStampPlacement {
  readonly schemaVersion: typeof TRIAL_STAMP_LICENSE_SCHEMA_VERSION;
  readonly placementId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly sellerId: string;
  readonly state: "trial-watermarked";
  readonly proxyAssetUri: string;
  readonly proxySha256: string;
  readonly watermark: TrialWatermarkSpec;
  readonly transform: CanvasPlacementTransform;
  readonly licenseSummary: TransparentLicenseThreeLineSummary;
  readonly placedAtIso: string;
  readonly exportBlocked: true;
}

export interface CreateTrialStampPlacementInput {
  readonly placementId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly sellerId: string;
  readonly proxyAssetUri: string;
  readonly proxySha256: string;
  readonly transform: CanvasPlacementTransform;
  readonly licenseRights: AssetLicenseRightsInput;
  readonly watermarkText?: string;
  readonly watermarkOpacity?: number;
  readonly proxyMaxDimensionPx?: number;
  readonly placedAtIso?: string;
}

export type PurchaseReceiptStatus = "paid" | "pending" | "refunded" | "revoked";

export interface MarketplacePurchaseReceiptPayload {
  readonly receiptId: string;
  readonly orderId: string;
  readonly assetId: string;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly purchasedAtIso: string;
  readonly currency: SettlementCurrency;
  readonly paidAmountMinor: number;
  readonly purchasedSnapshotSha256: string;
  readonly licenseRights: AssetLicenseRightsInput;
  readonly status: PurchaseReceiptStatus;
}

export interface MarketplacePurchaseReceipt extends MarketplacePurchaseReceiptPayload {
  /** `computePurchaseReceiptSignature`로 산출되는 결정론적 64자 SHA-256 영수증 서명. */
  readonly signatureSha256: string;
}

export interface PurchasedLosslessAssetRef {
  readonly assetId: string;
  readonly losslessAssetUri: string;
  readonly contentSha256: string;
  readonly originalWidthPx: number;
  readonly originalHeightPx: number;
  readonly format: "png" | "svg" | "glb" | "abr" | "ttf" | "otf";
  readonly byteLength: number;
}

export interface SwappedRightsBomEntry {
  readonly assetId: string;
  readonly assetTitle: string;
  readonly sellerId: string;
  readonly receiptId: string;
  readonly pinnedContentSha256: string;
  readonly commercialSerializationReady: boolean;
  readonly attributionRequired: boolean;
  readonly licenseLinesKo: readonly [string, string, string];
  readonly rightsDigestSha256: string;
}

export interface PurchasedAssetPlacement {
  readonly schemaVersion: typeof TRIAL_STAMP_LICENSE_SCHEMA_VERSION;
  readonly placementId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly sellerId: string;
  readonly state: "purchased-lossless";
  readonly assetUri: string;
  readonly pinnedContentSha256: string;
  readonly originalWidthPx: number;
  readonly originalHeightPx: number;
  readonly format: PurchasedLosslessAssetRef["format"];
  readonly byteLength: number;
  readonly transform: CanvasPlacementTransform;
  readonly transformPreserved: true;
  readonly watermarkRemoved: true;
  readonly exportBlocked: false;
  readonly receiptId: string;
  readonly buyerId: string;
  readonly licenseSummary: TransparentLicenseThreeLineSummary;
  readonly rightsBomEntry: SwappedRightsBomEntry;
  readonly placedAtIso: string;
  readonly swappedAtIso: string;
}

export type CanvasMarketplacePlacement = TrialStampPlacement | PurchasedAssetPlacement;

export type TrialSwapErrorCode =
  | "ALREADY_PURCHASED"
  | "INVALID_RECEIPT_STATUS"
  | "INVALID_RECEIPT_FIELDS"
  | "RECEIPT_SIGNATURE_MISMATCH"
  | "ASSET_ID_MISMATCH"
  | "BUYER_MISMATCH"
  | "SELLER_MISMATCH"
  | "CONTENT_HASH_MISMATCH"
  | "INVALID_LOSSLESS_ASSET";

export interface ReceiptVerificationResult {
  readonly valid: boolean;
  readonly errorCode: Exclude<
    TrialSwapErrorCode,
    "ALREADY_PURCHASED" | "CONTENT_HASH_MISMATCH" | "INVALID_LOSSLESS_ASSET"
  > | null;
  readonly reasonKo: string;
}

export interface SwapTrialStampInput {
  readonly placement: CanvasMarketplacePlacement;
  readonly receipt: MarketplacePurchaseReceipt;
  readonly losslessAsset: PurchasedLosslessAssetRef;
  readonly buyerId: string;
  readonly swappedAtIso?: string;
  readonly verificationSecret?: string;
}

export type SwapTrialStampResult =
  | {
      readonly ok: true;
      readonly placement: PurchasedAssetPlacement;
      readonly summaryKo: string;
    }
  | {
      readonly ok: false;
      readonly errorCode: TrialSwapErrorCode;
      readonly reasonKo: string;
      readonly unchangedPlacement: CanvasMarketplacePlacement;
    };

export interface BatchTrialSwapResult {
  readonly ok: boolean;
  readonly placements: readonly CanvasMarketplacePlacement[];
  readonly swappedPlacementIds: readonly string[];
  readonly skippedPlacementIds: readonly string[];
  readonly failedPlacementIds: readonly string[];
  readonly errorCode: TrialSwapErrorCode | null;
  readonly summaryKo: string;
}

function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new RangeError(`${fieldName} 값은 비어 있을 수 없습니다.`);
  }
  return trimmed;
}

function assertSha256Hex(value: string, fieldName: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HEX_SHA256_REGEX.test(normalized)) {
    throw new RangeError(`${fieldName} 값은 64자리 소문자 SHA-256 16진수여야 합니다.`);
  }
  return normalized;
}

function freezeTransform(transform: CanvasPlacementTransform): CanvasPlacementTransform {
  const numericFields: readonly [string, number][] = [
    ["x", transform.x],
    ["y", transform.y],
    ["width", transform.width],
    ["height", transform.height],
    ["rotationDeg", transform.rotationDeg],
    ["scaleX", transform.scaleX],
    ["scaleY", transform.scaleY],
    ["skewXDeg", transform.skewXDeg],
    ["skewYDeg", transform.skewYDeg],
    ["opacity", transform.opacity],
    ["zIndex", transform.zIndex],
    ["anchorX", transform.anchorX],
    ["anchorY", transform.anchorY],
  ];
  for (const [name, value] of numericFields) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`transform.${name} 값은 유한한 숫자여야 합니다.`);
    }
  }
  if (transform.width <= 0 || transform.height <= 0) {
    throw new RangeError("transform.width와 transform.height는 0보다 커야 합니다.");
  }
  if (transform.opacity < 0 || transform.opacity > 1) {
    throw new RangeError("transform.opacity는 0~1 범위여야 합니다.");
  }
  let frozenCamera: Camera3dPoseSnapshot | undefined;
  if (transform.camera3dPose) {
    const { position, target, fovDeg } = transform.camera3dPose;
    if (
      !position.every(Number.isFinite) ||
      !target.every(Number.isFinite) ||
      !Number.isFinite(fovDeg) ||
      fovDeg <= 0 ||
      fovDeg >= 180
    ) {
      throw new RangeError("transform.camera3dPose 값이 유효하지 않습니다.");
    }
    frozenCamera = Object.freeze({
      position: Object.freeze([position[0], position[1], position[2]] as const),
      target: Object.freeze([target[0], target[1], target[2]] as const),
      fovDeg,
    });
  }
  return Object.freeze({
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotationDeg: transform.rotationDeg,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    skewXDeg: transform.skewXDeg,
    skewYDeg: transform.skewYDeg,
    opacity: transform.opacity,
    zIndex: transform.zIndex,
    flipX: Boolean(transform.flipX),
    flipY: Boolean(transform.flipY),
    blendMode: transform.blendMode,
    anchorX: transform.anchorX,
    anchorY: transform.anchorY,
    ...(frozenCamera ? { camera3dPose: frozenCamera } : {}),
  });
}

/**
 * 10초 캔버스 워터마크 체험 배치(Trial Stamp)를 생성한다.
 * 구매 전까지 대각선 워터마크 프록시로 배치되며 상업 출고가 자동 차단된다.
 */
export function createTrialStampPlacement(
  input: CreateTrialStampPlacementInput,
): TrialStampPlacement {
  const placementId = requireNonEmpty(input.placementId, "placementId");
  const cutId = requireNonEmpty(input.cutId, "cutId");
  const layerId = requireNonEmpty(input.layerId, "layerId");
  const assetId = requireNonEmpty(input.assetId, "assetId");
  const assetTitle = requireNonEmpty(input.assetTitle, "assetTitle");
  const sellerId = requireNonEmpty(input.sellerId, "sellerId");
  const proxyAssetUri = requireNonEmpty(input.proxyAssetUri, "proxyAssetUri");
  const proxySha256 = assertSha256Hex(input.proxySha256, "proxySha256");

  const opacityRaw = input.watermarkOpacity ?? 0.34;
  if (!Number.isFinite(opacityRaw) || opacityRaw < 0.15 || opacityRaw > 0.65) {
    throw new RangeError("워터마크 불투명도는 0.15~0.65 범위여야 합니다.");
  }
  const proxyMaxDimensionPx = input.proxyMaxDimensionPx ?? 1024;
  if (
    !Number.isSafeInteger(proxyMaxDimensionPx) ||
    proxyMaxDimensionPx < 128 ||
    proxyMaxDimensionPx > 2048
  ) {
    throw new RangeError("체험 프록시 최대 해상도는 128~2048px 정수여야 합니다.");
  }

  const watermarkText = input.watermarkText?.trim() || `ToonStudio 체험용 · ${assetTitle}`;
  const transform = freezeTransform(input.transform);
  const licenseSummary = buildTransparentLicenseSummary(input.licenseRights);

  return Object.freeze({
    schemaVersion: TRIAL_STAMP_LICENSE_SCHEMA_VERSION,
    placementId,
    cutId,
    layerId,
    assetId,
    assetTitle,
    sellerId,
    state: "trial-watermarked",
    proxyAssetUri,
    proxySha256,
    watermark: Object.freeze({
      watermarkText,
      diagonalAngleDeg: -30,
      opacity: opacityRaw,
      proxyMaxDimensionPx,
      losslessBlocked: true,
    }),
    transform,
    licenseSummary,
    placedAtIso: input.placedAtIso ?? "2026-11-22T00:00:00.000Z",
    exportBlocked: true,
  });
}

/** 결제 영수증 본문의 결정론적 SHA-256 서명 다이제스트를 계산한다. */
export function computePurchaseReceiptSignature(
  payload: MarketplacePurchaseReceiptPayload,
  verificationSecret: string = DEFAULT_RECEIPT_SECRET,
): string {
  const normalizedPayload = {
    receiptId: payload.receiptId.trim(),
    orderId: payload.orderId.trim(),
    assetId: payload.assetId.trim(),
    buyerId: payload.buyerId.trim(),
    sellerId: payload.sellerId.trim(),
    purchasedAtIso: payload.purchasedAtIso.trim(),
    currency: payload.currency,
    paidAmountMinor: payload.paidAmountMinor,
    purchasedSnapshotSha256: payload.purchasedSnapshotSha256.trim().toLowerCase(),
    licenseRightsDigest: buildTransparentLicenseSummary(payload.licenseRights).rightsDigestSha256,
    status: payload.status,
  };
  return computeSha256Hex(`${verificationSecret}::${canonicalJsonStringify(normalizedPayload)}`);
}

/** 영수증 서명·결제 상태·구매자·에셋·판매자 일치를 fail-closed 검증한다. */
export function verifyPurchaseReceipt(
  receipt: MarketplacePurchaseReceipt,
  expected: {
    readonly assetId: string;
    readonly buyerId: string;
    readonly sellerId?: string;
    readonly verificationSecret?: string;
  },
): ReceiptVerificationResult {
  if (
    !receipt.receiptId.trim() ||
    !receipt.orderId.trim() ||
    !receipt.assetId.trim() ||
    !receipt.buyerId.trim() ||
    !receipt.sellerId.trim() ||
    !SUPPORTED_SETTLEMENT_CURRENCIES.includes(receipt.currency) ||
    !Number.isSafeInteger(receipt.paidAmountMinor) ||
    receipt.paidAmountMinor < 0 ||
    !HEX_SHA256_REGEX.test(receipt.purchasedSnapshotSha256.trim().toLowerCase()) ||
    !HEX_SHA256_REGEX.test(receipt.signatureSha256.trim().toLowerCase())
  ) {
    return Object.freeze({
      valid: false,
      errorCode: "INVALID_RECEIPT_FIELDS",
      reasonKo: "구매 영수증 필수 필드 또는 SHA-256 서명 형식이 올바르지 않습니다.",
    });
  }

  if (receipt.status !== "paid") {
    return Object.freeze({
      valid: false,
      errorCode: "INVALID_RECEIPT_STATUS",
      reasonKo: `결제 완료 상태가 아닌 영수증(${receipt.status})으로는 원본 치환을 진행할 수 없습니다.`,
    });
  }

  if (receipt.assetId.trim() !== expected.assetId.trim()) {
    return Object.freeze({
      valid: false,
      errorCode: "ASSET_ID_MISMATCH",
      reasonKo: "영수증의 에셋 ID가 캔버스 체험 배치 에셋 ID와 일치하지 않습니다.",
    });
  }

  if (receipt.buyerId.trim() !== expected.buyerId.trim()) {
    return Object.freeze({
      valid: false,
      errorCode: "BUYER_MISMATCH",
      reasonKo: "영수증 구매자와 현재 작업자 계정이 일치하지 않습니다.",
    });
  }

  if (expected.sellerId !== undefined && receipt.sellerId.trim() !== expected.sellerId.trim()) {
    return Object.freeze({
      valid: false,
      errorCode: "SELLER_MISMATCH",
      reasonKo: "영수증 판매자 ID가 배치된 에셋의 판매자 ID와 일치하지 않습니다.",
    });
  }

  const expectedSig = computePurchaseReceiptSignature(receipt, expected.verificationSecret);
  if (expectedSig !== receipt.signatureSha256.trim().toLowerCase()) {
    return Object.freeze({
      valid: false,
      errorCode: "RECEIPT_SIGNATURE_MISMATCH",
      reasonKo: "영수증 무결성 서명이 일치하지 않습니다(변조 또는 키 불일치).",
    });
  }

  return Object.freeze({
    valid: true,
    errorCode: null,
    reasonKo: `결제 영수증(${receipt.receiptId}) 무결성 검증을 통과했습니다.`,
  });
}

/**
 * 캔버스에 배치된 워터마크 체험 프록시를 구매 영수증 검증 즉시
 * 동일 좌표·회전·배율·기울기·블렌드·3D 카메라 포즈를 그대로 유지한 무손실 원본 에셋으로 1클릭 치환한다.
 */
export function swapTrialStampToPurchasedAsset(
  input: SwapTrialStampInput,
): SwapTrialStampResult {
  if (input.placement.state !== "trial-watermarked") {
    return Object.freeze({
      ok: false,
      errorCode: "ALREADY_PURCHASED",
      reasonKo: "이미 원본 무손실 에셋으로 치환이 완료된 배치입니다.",
      unchangedPlacement: input.placement,
    });
  }

  const receiptCheck = verifyPurchaseReceipt(input.receipt, {
    assetId: input.placement.assetId,
    buyerId: input.buyerId,
    sellerId: input.placement.sellerId,
    verificationSecret: input.verificationSecret,
  });
  if (!receiptCheck.valid && receiptCheck.errorCode !== null) {
    return Object.freeze({
      ok: false,
      errorCode: receiptCheck.errorCode,
      reasonKo: receiptCheck.reasonKo,
      unchangedPlacement: input.placement,
    });
  }

  const asset = input.losslessAsset;
  const normalizedAssetHash = asset.contentSha256.trim().toLowerCase();
  if (
    !asset.losslessAssetUri.trim() ||
    !HEX_SHA256_REGEX.test(normalizedAssetHash) ||
    !Number.isSafeInteger(asset.originalWidthPx) ||
    asset.originalWidthPx <= 0 ||
    !Number.isSafeInteger(asset.originalHeightPx) ||
    asset.originalHeightPx <= 0 ||
    !Number.isSafeInteger(asset.byteLength) ||
    asset.byteLength <= 0
  ) {
    return Object.freeze({
      ok: false,
      errorCode: "INVALID_LOSSLESS_ASSET",
      reasonKo: "무손실 원본 에셋의 경로·해상도·바이트 크기 정보가 유효하지 않습니다.",
      unchangedPlacement: input.placement,
    });
  }

  if (asset.assetId.trim() !== input.placement.assetId) {
    return Object.freeze({
      ok: false,
      errorCode: "ASSET_ID_MISMATCH",
      reasonKo: "제공된 무손실 원본의 에셋 ID가 체험 배치 에셋 ID와 다릅니다.",
      unchangedPlacement: input.placement,
    });
  }

  const pinnedHash = input.receipt.purchasedSnapshotSha256.trim().toLowerCase();
  if (normalizedAssetHash !== pinnedHash) {
    return Object.freeze({
      ok: false,
      errorCode: "CONTENT_HASH_MISMATCH",
      reasonKo: "원본 파일 SHA-256 해시가 구매 시점 영수증 해시와 일치하지 않아 치환을 차단했습니다.",
      unchangedPlacement: input.placement,
    });
  }

  const licenseSummary = buildTransparentLicenseSummary(input.receipt.licenseRights);
  const preservedTransform = freezeTransform(input.placement.transform);
  const attributionRequired = licenseSummary.badges.some((badge) => badge.attributionRequired);

  const purchasedPlacement: PurchasedAssetPlacement = Object.freeze({
    schemaVersion: TRIAL_STAMP_LICENSE_SCHEMA_VERSION,
    placementId: input.placement.placementId,
    cutId: input.placement.cutId,
    layerId: input.placement.layerId,
    assetId: input.placement.assetId,
    assetTitle: input.placement.assetTitle,
    sellerId: input.placement.sellerId,
    state: "purchased-lossless",
    assetUri: asset.losslessAssetUri.trim(),
    pinnedContentSha256: pinnedHash,
    originalWidthPx: asset.originalWidthPx,
    originalHeightPx: asset.originalHeightPx,
    format: asset.format,
    byteLength: asset.byteLength,
    transform: preservedTransform,
    transformPreserved: true,
    watermarkRemoved: true,
    exportBlocked: false,
    receiptId: input.receipt.receiptId.trim(),
    buyerId: input.buyerId.trim(),
    licenseSummary,
    rightsBomEntry: Object.freeze({
      assetId: input.placement.assetId,
      assetTitle: input.placement.assetTitle,
      sellerId: input.placement.sellerId,
      receiptId: input.receipt.receiptId.trim(),
      pinnedContentSha256: pinnedHash,
      commercialSerializationReady: licenseSummary.commercialSerializationReady,
      attributionRequired,
      licenseLinesKo: licenseSummary.linesKo,
      rightsDigestSha256: licenseSummary.rightsDigestSha256,
    }),
    placedAtIso: input.placement.placedAtIso,
    swappedAtIso: input.swappedAtIso ?? "2026-11-22T00:00:10.000Z",
  });

  return Object.freeze({
    ok: true,
    placement: purchasedPlacement,
    summaryKo: `${input.placement.assetTitle} 워터마크 체험 배치를 동일 좌표·변환 유지 상태로 원본 무손실 에셋으로 치환했습니다.`,
  });
}

/** 원고 내 모든 컷에 배치된 동일 에셋의 체험 프록시를 구매 즉시 일괄 치환한다. */
export function swapAllTrialStampsForPurchasedAsset(
  placements: readonly CanvasMarketplacePlacement[],
  params: Omit<SwapTrialStampInput, "placement">,
): BatchTrialSwapResult {
  const nextPlacements: CanvasMarketplacePlacement[] = [];
  const swappedPlacementIds: string[] = [];
  const skippedPlacementIds: string[] = [];
  const failedPlacementIds: string[] = [];
  let firstErrorCode: TrialSwapErrorCode | null = null;

  for (const current of placements) {
    if (current.state !== "trial-watermarked" || current.assetId !== params.losslessAsset.assetId) {
      nextPlacements.push(current);
      skippedPlacementIds.push(current.placementId);
      continue;
    }
    const swapped = swapTrialStampToPurchasedAsset({
      ...params,
      placement: current,
    });
    if (swapped.ok) {
      nextPlacements.push(swapped.placement);
      swappedPlacementIds.push(current.placementId);
    } else {
      nextPlacements.push(swapped.unchangedPlacement);
      failedPlacementIds.push(current.placementId);
      firstErrorCode ??= swapped.errorCode;
    }
  }

  const ok = failedPlacementIds.length === 0;
  return Object.freeze({
    ok,
    placements: Object.freeze(nextPlacements),
    swappedPlacementIds: Object.freeze(swappedPlacementIds),
    skippedPlacementIds: Object.freeze(skippedPlacementIds),
    failedPlacementIds: Object.freeze(failedPlacementIds),
    errorCode: firstErrorCode,
    summaryKo: ok
      ? `체험 배치 ${swappedPlacementIds.length}건을 무손실 원본으로 자동 치환했습니다.`
      : `원본 치환 실패 ${failedPlacementIds.length}건(오류: ${firstErrorCode ?? "UNKNOWN"}). 기존 체험 배치를 안전하게 유지했습니다.`,
  });
}
