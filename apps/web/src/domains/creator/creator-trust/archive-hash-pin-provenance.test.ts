import { describe, expect, it } from "vitest";

import {
  STANDARD_MARKET_LICENSE_PRESETS,
  computePurchaseReceiptSignature,
  createTrialStampPlacement,
  swapTrialStampToPurchasedAsset,
  type MarketplacePurchaseReceiptPayload,
} from "../creator-commerce";
import { computeDHash64 } from "../local-render-cache/perceptual-copyright-fingerprint";
import {
  ARCHIVED_ASSET_PIN_SCHEMA,
  ARCHIVE_CAS_URI_PREFIX,
  HUMAN_PROVENANCE_LEDGER_SCHEMA,
  buildHumanStrokeProvenanceRecord,
  compareProvenanceDHash,
  computeSha256Hex,
  pinPurchasedAssetSnapshot,
  verifyArchivedAssetPin,
  verifyHumanStrokeProvenanceRecord,
  verifyManuscriptArchivePins,
  type RgbaImageSurface,
} from "./index";

function createPatternSurface(
  width: number,
  height: number,
  variant: "diagonal" | "brightened" | "inverted-checker",
): RgbaImageSurface {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      let luma: number;
      if (variant === "inverted-checker") {
        const checker = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) === 0;
        luma = checker ? 235 - Math.floor((x / width) * 60) : 25 + Math.floor((y / height) * 50);
      } else {
        const base = Math.floor(
          ((x * 3 + y * 5) / (width * 3 + height * 5)) * 180 +
            Math.sin((x / width) * Math.PI * 2) * 35 +
            35,
        );
        const offset = variant === "brightened" ? 18 : 0;
        luma = Math.max(0, Math.min(255, base + offset));
      }
      data[idx] = luma;
      data[idx + 1] = Math.max(0, Math.min(255, luma - 6));
      data[idx + 2] = Math.max(0, Math.min(255, luma + 4));
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("archive-hash-pin-provenance · 64-bit dHash · C2PA 인간 작화 비중 투명 배지", () => {
  it("64-bit dHash 지문과 순수 수작업·보조 도구 병행·생성형 혼합 투명 배지를 정확히 산출한다", () => {
    const surface = createPatternSurface(72, 64, "diagonal");
    const pureRecord = buildHumanStrokeProvenanceRecord({
      workId: "work-aurora",
      episodeId: "ep-12",
      cutId: "cut-01",
      creatorDisplayName: "한서연 작가",
      creatorHandle: "@seoyeon_draws",
      surface,
      humanStrokeCount: 420,
      manualDrawingDurationSec: 1850,
      issuedAtIso: "2026-11-22T10:00:00.000Z",
    });

    // local-render-cache 64-bit dHash와 비트 단위 일치 확인
    expect(pureRecord.schema).toBe(HUMAN_PROVENANCE_LEDGER_SCHEMA);
    expect(pureRecord.dHash64.hex).toBe(computeDHash64(surface, "0deg").hex);
    expect(pureRecord.humanStrokeRatio).toBe(1);
    expect(pureRecord.humanStrokePercent).toBe(100);
    expect(pureRecord.generativeAiDisclosed).toBe(false);
    expect(pureRecord.badge.tier).toBe("pure-human-hand");
    expect(pureRecord.badge.c2paDigitalSourceType).toContain("digitalArt");

    const assistedRecord = buildHumanStrokeProvenanceRecord({
      workId: "work-aurora",
      episodeId: "ep-12",
      cutId: "cut-02",
      creatorDisplayName: "한서연 작가",
      surface,
      humanStrokeCount: 320,
      assistTools: [
        {
          toolId: "tool-3d-lt",
          category: "3d-background-lt",
          contributedUnits: 60,
          generativeAiInvolved: false,
          appliedCutIds: ["cut-02"],
        },
        {
          toolId: "tool-ruler",
          category: "perspective-ruler",
          contributedUnits: 20,
          generativeAiInvolved: false,
        },
      ],
    });

    expect(assistedRecord.humanStrokeRatio).toBe(0.8);
    expect(assistedRecord.humanStrokePercent).toBe(80);
    expect(assistedRecord.assistToolRatio).toBe(0.2);
    expect(assistedRecord.generativeAiDisclosed).toBe(false);
    expect(assistedRecord.badge.tier).toBe("human-primary-assisted");
    expect(assistedRecord.badge.assistSummaryKo).toContain("3D 배경 선화 변환");
    expect(assistedRecord.badge.assistSummaryKo).toContain("원근·소실점 자");

    // generative-fill 카테고리는 generativeAiInvolved=false로 넘겨도 투명 공개 강제
    const hybridRecord = buildHumanStrokeProvenanceRecord({
      workId: "work-aurora",
      episodeId: "ep-12",
      cutId: "cut-03",
      creatorDisplayName: "한서연 작가",
      surface,
      humanStrokeCount: 60,
      assistTools: [
        {
          toolId: "tool-gen-fill",
          category: "generative-fill",
          contributedUnits: 40,
          generativeAiInvolved: false,
        },
      ],
    });
    expect(hybridRecord.humanStrokeRatio).toBe(0.6);
    expect(hybridRecord.generativeAiDisclosed).toBe(true);
    expect(hybridRecord.generativeAiRatio).toBe(0.4);
    expect(hybridRecord.badge.tier).toBe("human-ai-hybrid");
    expect(hybridRecord.badge.c2paDigitalSourceType).toContain("compositeWithTrainedAlgorithmicMedia");

    // 0 스트로크 빈 기록은 100%로 조작하지 않고 미기록 처리
    const emptyRecord = buildHumanStrokeProvenanceRecord({
      workId: "work-aurora",
      episodeId: "ep-12",
      cutId: "cut-04",
      creatorDisplayName: "한서연 작가",
      surface,
      humanStrokeCount: 0,
    });
    expect(emptyRecord.humanStrokeRatio).toBe(0);
    expect(emptyRecord.badge.tier).toBe("unverified-empty");
  });

  it("인간 작화 원장 검증이 정상 원고·미세 밝기 변화는 통과시키고 클레임 변조·바이트 변조·상이한 dHash를 차단한다", () => {
    const surface = createPatternSurface(72, 64, "diagonal");
    const brightened = createPatternSurface(72, 64, "brightened");
    const unrelated = createPatternSurface(72, 64, "inverted-checker");

    const record = buildHumanStrokeProvenanceRecord({
      workId: "work-aurora",
      episodeId: "ep-12",
      cutId: "cut-05",
      creatorDisplayName: "한서연 작가",
      surface,
      humanStrokeCount: 200,
      assistTools: [
        {
          toolId: "tool-flat",
          category: "color-flatting-assist",
          contributedUnits: 50,
          generativeAiInvolved: false,
        },
      ],
    });

    const ok = verifyHumanStrokeProvenanceRecord(record, {
      contentBytes: surface.data,
      surface,
    });
    expect(ok.valid).toBe(true);
    expect(ok.status).toBe("verified");
    expect(ok.dHashHammingDistance).toBe(0);

    // 밝기 이동 이미지는 dHash 해밍 거리가 매우 작아 지각 동일성 통과
    const brightenedCheck = verifyHumanStrokeProvenanceRecord(record, {
      surface: brightened,
      maxDHashHammingDistance: 5,
    });
    expect(brightenedCheck.valid).toBe(true);
    expect(brightenedCheck.dHashHammingDistance).toBeLessThanOrEqual(5);

    // 완전히 다른 구도 이미지는 dHash 불일치 탐지
    const mismatch = verifyHumanStrokeProvenanceRecord(record, {
      surface: unrelated,
      maxDHashHammingDistance: 5,
    });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.status).toBe("dhash-mismatch");
    expect(compareProvenanceDHash(record, computeDHash64(unrelated, "0deg")).hammingDistance).toBeGreaterThan(5);

    // 인간 작화 비중 조작 시 클레임 변조 탐지
    const tampered = { ...record, humanStrokeRatio: 0.99 };
    expect(verifyHumanStrokeProvenanceRecord(tampered).status).toBe("claim-tampered");

    // 원고 1바이트 변조 시 콘텐츠 변조 탐지
    const alteredBytes = new Uint8ClampedArray(surface.data);
    alteredBytes[10] = (alteredBytes[10] + 1) % 256;
    expect(
      verifyHumanStrokeProvenanceRecord(record, { contentBytes: alteredBytes }).status,
    ).toBe("content-tampered");
  });
});

describe("archive-hash-pin-provenance · #100 불변 아카이브 해시 핀 고정 및 복원 계약", () => {
  const purchasedBytes = new TextEncoder().encode("PURCHASED-ORIGINAL-3D-POSTOFFICE-V1-2026");
  const sellerModifiedBytes = new TextEncoder().encode("SELLER-OVERWRITTEN-V2-DIFFERENT-GEOMETRY");

  it("마켓 판매자가 사후에 원본을 삭제하거나 수정해도 구매 시점 SHA-256 핀 스냅샷으로 원고를 안전하게 연다", () => {
    const previewSurface = createPatternSurface(36, 32, "diagonal");
    const pin = pinPurchasedAssetSnapshot({
      assetId: "asset-3d-postoffice",
      assetTitle: "야간 우체국 3D 배경",
      sellerId: "seller-3d-park",
      buyerId: "author-seoyeon",
      receiptId: "RCPT-2026-1122-001",
      workId: "work-aurora",
      episodeId: "ep-12",
      snapshotBytes: purchasedBytes,
      previewSurface,
      sellerVersionTagAtPurchase: "v1.4.0",
      archiveStorageTier: "project-archive-bundle",
      pinnedAtIso: "2026-11-22T09:10:05.000Z",
    });

    expect(pin.schema).toBe(ARCHIVED_ASSET_PIN_SCHEMA);
    expect(pin.snapshotSha256).toBe(computeSha256Hex(purchasedBytes));
    expect(pin.contentAddressedUri).toBe(`${ARCHIVE_CAS_URI_PREFIX}${pin.snapshotSha256}`);
    expect(pin.snapshotDHash64).toBe(computeDHash64(previewSurface, "0deg").hex);

    // 시나리오 1: 판매자가 마켓에서 에셋을 영구 삭제(404)
    const afterSellerDelete = verifyArchivedAssetPin(pin, {
      pinnedSnapshotBytes: purchasedBytes,
      upstreamState: "seller-deleted",
      upstreamBytes: null,
      expectedBuyerId: "author-seoyeon",
    });
    expect(afterSellerDelete.canOpenSafely).toBe(true);
    expect(afterSellerDelete.status).toBe("verified-pinned-isolated-from-upstream-change");
    expect(afterSellerDelete.upstreamDriftDetected).toBe(true);
    expect(afterSellerDelete.recoverySource).toBe("local-pinned-snapshot");
    expect(afterSellerDelete.restoredBytes).toEqual(purchasedBytes);

    // 반환된 바이트를 외부에서 수정해도 원본 버퍼는 오염되지 않는 방어 복사 확인
    if (afterSellerDelete.restoredBytes) {
      afterSellerDelete.restoredBytes[0] = 0;
    }
    expect(purchasedBytes[0]).not.toBe(0);

    // 시나리오 2: 판매자가 원본 파일을 다른 파일로 몰래 덮어씀
    const afterSellerModify = verifyArchivedAssetPin(pin, {
      pinnedSnapshotBytes: purchasedBytes,
      upstreamState: "seller-modified",
      upstreamBytes: sellerModifiedBytes,
      upstreamLatestSha256: computeSha256Hex(sellerModifiedBytes),
      expectedBuyerId: "author-seoyeon",
    });
    expect(afterSellerModify.canOpenSafely).toBe(true);
    expect(afterSellerModify.status).toBe("verified-pinned-isolated-from-upstream-change");
    expect(afterSellerModify.upstreamDriftDetected).toBe(true);
    expect(afterSellerModify.upstreamSubstitutionBlocked).toBe(true);
    expect(afterSellerModify.restoredBytes).toEqual(purchasedBytes);

    // 시나리오 3: 오프라인 환경(마켓 서버 미도달)에서도 정상 열기
    const offlineOpen = verifyArchivedAssetPin(pin, {
      pinnedSnapshotBytes: purchasedBytes,
      upstreamState: "offline-unreachable",
      expectedBuyerId: "author-seoyeon",
    });
    expect(offlineOpen.canOpenSafely).toBe(true);
    expect(offlineOpen.status).toBe("verified-pinned");
  });

  it("로컬 캐시 손상 시 검증된 백업 미러에서 복원하되, 해시가 다른 판매자 수정본으로의 무단 대체는 fail-closed 차단한다", () => {
    const pin = pinPurchasedAssetSnapshot({
      assetId: "asset-3d-postoffice",
      assetTitle: "야간 우체국 3D 배경",
      sellerId: "seller-3d-park",
      buyerId: "author-seoyeon",
      receiptId: "RCPT-2026-1122-001",
      workId: "work-aurora",
      episodeId: "ep-12",
      snapshotBytes: purchasedBytes,
    });

    const corruptedLocal = new Uint8Array(purchasedBytes);
    corruptedLocal[0] ^= 0xff;

    // 1. 로컬 손상 + 백업 미러 해시 일치 → 안전 복원
    const restoredFromFallback = verifyArchivedAssetPin(pin, {
      pinnedSnapshotBytes: corruptedLocal,
      fallbackMirrorBytes: purchasedBytes,
      upstreamState: "seller-deleted",
    });
    expect(restoredFromFallback.canOpenSafely).toBe(true);
    expect(restoredFromFallback.status).toBe("restored-from-verified-fallback");
    expect(restoredFromFallback.primaryCorruptionDetected).toBe(true);
    expect(restoredFromFallback.restoredBytes).toEqual(purchasedBytes);

    // 2. 로컬 누락 + 마켓 원본 미변경(정확 해시 일치) → 마켓에서 안전 복구
    const restoredFromUpstream = verifyArchivedAssetPin(pin, {
      pinnedSnapshotBytes: null,
      upstreamBytes: purchasedBytes,
      upstreamState: "unchanged",
    });
    expect(restoredFromUpstream.canOpenSafely).toBe(true);
    expect(restoredFromUpstream.status).toBe("restored-from-verified-upstream");

    // 3. 로컬 손상 + 백업 없음 + 판매자 수정본만 존재 → 절대 대체하지 않고 차단
    const blockedSubstitution = verifyArchivedAssetPin(pin, {
      pinnedSnapshotBytes: corruptedLocal,
      upstreamBytes: sellerModifiedBytes,
      upstreamState: "seller-modified",
    });
    expect(blockedSubstitution.canOpenSafely).toBe(false);
    expect(blockedSubstitution.status).toBe("snapshot-corrupted");
    expect(blockedSubstitution.upstreamSubstitutionBlocked).toBe(true);
    expect(blockedSubstitution.restoredBytes).toBeNull();

    // 4. 권한 경계: 다른 구매자 계정 차단
    const wrongBuyer = verifyArchivedAssetPin(pin, {
      pinnedSnapshotBytes: purchasedBytes,
      expectedBuyerId: "intruder-user",
    });
    expect(wrongBuyer.canOpenSafely).toBe(false);
    expect(wrongBuyer.status).toBe("buyer-mismatch");

    // 5. 핀 메타데이터 변조(구매 해시 바꿔치기) 차단
    const tamperedPin = {
      ...pin,
      snapshotSha256: computeSha256Hex(sellerModifiedBytes),
      contentAddressedUri: `${ARCHIVE_CAS_URI_PREFIX}${computeSha256Hex(sellerModifiedBytes)}` as const,
    };
    const tamperedCheck = verifyArchivedAssetPin(tamperedPin, {
      pinnedSnapshotBytes: sellerModifiedBytes,
    });
    expect(tamperedCheck.canOpenSafely).toBe(false);
    expect(tamperedCheck.status).toBe("pin-tampered");

    // 6. 빈 0바이트 스냅샷 핀 고정 거부
    expect(() =>
      pinPurchasedAssetSnapshot({
        assetId: "asset-empty",
        assetTitle: "빈 파일",
        sellerId: "s",
        buyerId: "b",
        receiptId: "r",
        workId: "w",
        episodeId: "e",
        snapshotBytes: new Uint8Array(0),
      }),
    ).toThrow(/1바이트 이상/u);
  });

  it("워터마크 체험 치환(creator-commerce)부터 아카이브 해시 핀 일괄 감사(creator-trust)까지 단절 없이 연계된다", () => {
    const assetBytes = new TextEncoder().encode("LOSSLESS-CAFE-INTERIOR-PACK-V1");
    const assetHash = computeSha256Hex(assetBytes);

    const trial = createTrialStampPlacement({
      placementId: "plc-cafe-01",
      cutId: "cut-07",
      layerId: "layer-bg",
      assetId: "asset-cafe-pack",
      assetTitle: "빈티지 카페 3D 패키지",
      sellerId: "seller-cafe-lee",
      proxyAssetUri: "trial://proxy/cafe.webp",
      proxySha256: computeSha256Hex("trial-cafe-proxy"),
      transform: {
        x: 100,
        y: 220,
        width: 800,
        height: 1200,
        rotationDeg: 0,
        scaleX: 1,
        scaleY: 1,
        skewXDeg: 0,
        skewYDeg: 0,
        opacity: 1,
        zIndex: 5,
        flipX: false,
        flipY: false,
        blendMode: "normal",
        anchorX: 0.5,
        anchorY: 0.5,
      },
      licenseRights: STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
    });

    const receiptPayload: MarketplacePurchaseReceiptPayload = {
      receiptId: "RCPT-CAFE-99",
      orderId: "ORD-CAFE-99",
      assetId: "asset-cafe-pack",
      buyerId: "author-seoyeon",
      sellerId: "seller-cafe-lee",
      purchasedAtIso: "2026-11-22T11:00:00.000Z",
      currency: "KRW",
      paidAmountMinor: 45_000,
      purchasedSnapshotSha256: assetHash,
      licenseRights: STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
      status: "paid",
    };

    const swapped = swapTrialStampToPurchasedAsset({
      placement: trial,
      receipt: {
        ...receiptPayload,
        signatureSha256: computePurchaseReceiptSignature(receiptPayload),
      },
      losslessAsset: {
        assetId: "asset-cafe-pack",
        losslessAssetUri: `${ARCHIVE_CAS_URI_PREFIX}${assetHash}`,
        contentSha256: assetHash,
        originalWidthPx: 2048,
        originalHeightPx: 2048,
        format: "glb",
        byteLength: assetBytes.byteLength,
      },
      buyerId: "author-seoyeon",
    });

    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;

    const pin1 = pinPurchasedAssetSnapshot({
      assetId: swapped.placement.assetId,
      assetTitle: swapped.placement.assetTitle,
      sellerId: swapped.placement.sellerId,
      buyerId: swapped.placement.buyerId,
      receiptId: swapped.placement.receiptId,
      workId: "work-aurora",
      episodeId: "ep-12",
      snapshotBytes: assetBytes,
      licenseSnapshotDigestSha256: swapped.placement.rightsBomEntry.rightsDigestSha256,
    });
    const pin2 = pinPurchasedAssetSnapshot({
      assetId: "asset-brush-ink",
      assetTitle: "만년필 잉크 브러시",
      sellerId: "seller-brush-kim",
      buyerId: "author-seoyeon",
      receiptId: "RCPT-BRUSH-02",
      workId: "work-aurora",
      episodeId: "ep-12",
      snapshotBytes: purchasedBytes,
    });

    const audit = verifyManuscriptArchivePins([pin1, pin2], (pin) => {
      if (pin.assetId === "asset-cafe-pack") {
        return {
          pinnedSnapshotBytes: assetBytes,
          upstreamState: "seller-deleted",
          expectedBuyerId: "author-seoyeon",
        };
      }
      return {
        pinnedSnapshotBytes: purchasedBytes,
        upstreamState: "unchanged",
        expectedBuyerId: "author-seoyeon",
      };
    });

    expect(audit.allSafeToOpen).toBe(true);
    expect(audit.totalPins).toBe(2);
    expect(audit.verifiedCount).toBe(2);
    expect(audit.isolatedUpstreamChangeCount).toBe(1);
    expect(audit.blockedCount).toBe(0);
  });
});
