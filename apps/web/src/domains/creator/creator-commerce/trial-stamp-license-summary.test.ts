import { describe, expect, it } from "vitest";

import { computeSha256Hex } from "../creator-trust/creator-trust-sha256";
import {
  PRINTABLE_SETTLEMENT_STATEMENT_SCHEMA_VERSION,
  SPONSORED_BADGE_LABEL_KO,
  STANDARD_MARKET_LICENSE_PRESETS,
  TRIAL_STAMP_LICENSE_SCHEMA_VERSION,
  buildPrintableSettlementStatement,
  buildTransparentLicenseSummary,
  calculateRoyaltySettlement,
  checkLicenseUsageEligibility,
  computePurchaseReceiptSignature,
  createMarketplaceCardDisclosure,
  createTrialStampPlacement,
  generateDeterministicSettlementStatement,
  partitionMarketplaceListings,
  swapAllTrialStampsForPurchasedAsset,
  swapTrialStampToPurchasedAsset,
  toMinorUnits,
  verifyPurchaseReceipt,
  type CanvasPlacementTransform,
  type MarketplacePurchaseReceipt,
  type MarketplacePurchaseReceiptPayload,
  type PurchasedLosslessAssetRef,
  type RoyaltySettlementRequest,
  type SettlementCurrency,
} from "./index";

function createSampleTransform(): CanvasPlacementTransform {
  return {
    x: 248.5,
    y: 612.25,
    width: 720,
    height: 1080,
    rotationDeg: -7.5,
    scaleX: 1.125,
    scaleY: 0.94,
    skewXDeg: 2.25,
    skewYDeg: -1.5,
    opacity: 0.88,
    zIndex: 14,
    flipX: true,
    flipY: false,
    blendMode: "multiply",
    anchorX: 0.5,
    anchorY: 0.25,
    camera3dPose: {
      position: [4.2, 1.8, -6.5],
      target: [0, 1.2, 0],
      fovDeg: 42,
    },
  };
}

function createSignedReceipt(
  overrides?: Partial<MarketplacePurchaseReceiptPayload>,
  secret?: string,
): MarketplacePurchaseReceipt {
  const losslessBytes = new TextEncoder().encode("LOSSLESS-3D-POSTOFFICE-V1-BINARY-PAYLOAD");
  const payload: MarketplacePurchaseReceiptPayload = {
    receiptId: "RCPT-2026-1122-001",
    orderId: "ORD-2026-1122-001",
    assetId: "asset-3d-postoffice",
    buyerId: "author-seoyeon",
    sellerId: "seller-3d-park",
    purchasedAtIso: "2026-11-22T09:10:00.000Z",
    currency: "KRW",
    paidAmountMinor: 39_000,
    purchasedSnapshotSha256: computeSha256Hex(losslessBytes),
    licenseRights: STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
    status: "paid",
    ...overrides,
  };
  return {
    ...payload,
    signatureSha256: computePurchaseReceiptSignature(payload, secret),
  };
}

function createLosslessAssetRef(
  overrides?: Partial<PurchasedLosslessAssetRef>,
): PurchasedLosslessAssetRef {
  const losslessBytes = new TextEncoder().encode("LOSSLESS-3D-POSTOFFICE-V1-BINARY-PAYLOAD");
  return {
    assetId: "asset-3d-postoffice",
    losslessAssetUri: "cas://sha256/postoffice-original.glb",
    contentSha256: computeSha256Hex(losslessBytes),
    originalWidthPx: 4096,
    originalHeightPx: 4096,
    format: "glb",
    byteLength: losslessBytes.byteLength,
    ...overrides,
  };
}

describe("trial-stamp-license-summary · 3줄 투명 라이선스 배지 · 투명 랭킹 격리", () => {
  it("모든 에셋 카드용 3줄 투명 라이선스 배지(상업 연재 / 어시 공유 / 단행본)를 일관된 한국어 평문으로 생성한다", () => {
    const teamSummary = buildTransparentLicenseSummary(
      STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
    );
    expect(teamSummary.schemaVersion).toBe(TRIAL_STAMP_LICENSE_SCHEMA_VERSION);
    expect(teamSummary.badges).toHaveLength(3);
    expect(teamSummary.badges.map((b) => b.axisLabelKo)).toEqual([
      "상업 연재",
      "어시 공유",
      "단행본",
    ]);
    expect(teamSummary.linesKo[0]).toBe("상업 연재: 허용");
    expect(teamSummary.linesKo[1]).toContain("어시 공유: 조건부 허용");
    expect(teamSummary.linesKo[1]).toContain("최대 5인");
    expect(teamSummary.linesKo[2]).toContain("단행본: 허용");
    expect(teamSummary.commercialSerializationReady).toBe(true);
    expect(teamSummary.assistantSharingAllowed).toBe(true);
    expect(teamSummary.printVolumeAllowed).toBe(true);
    expect(teamSummary.rightsDigestSha256).toMatch(/^[0-9a-f]{64}$/u);

    const previewSummary = buildTransparentLicenseSummary(
      STANDARD_MARKET_LICENSE_PRESETS["editorial-preview-only"],
    );
    expect(previewSummary.commercialSerializationReady).toBe(false);
    expect(previewSummary.assistantSharingAllowed).toBe(false);
    expect(previewSummary.printVolumeAllowed).toBe(false);
    expect(previewSummary.linesKo[0]).toContain("상업 연재: 불가");
  });

  it("권한·라이선스 경계(상업 연재 금지·어시 좌석 초과·출처 표기 누락)를 정확히 차단한다", () => {
    const soloSummary = buildTransparentLicenseSummary(
      STANDARD_MARKET_LICENSE_PRESETS["solo-commercial"],
    );
    const soloWithAssist = checkLicenseUsageEligibility(soloSummary, {
      commercialSerialization: true,
      assistantSeatCount: 2,
      printVolume: true,
    });
    expect(soloWithAssist.eligible).toBe(false);
    expect(soloWithAssist.blockedAxes).toEqual(["assistant-sharing"]);

    const teamSummary = buildTransparentLicenseSummary(
      STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
    );
    expect(
      checkLicenseUsageEligibility(teamSummary, {
        commercialSerialization: true,
        assistantSeatCount: 5,
        printVolume: true,
      }).eligible,
    ).toBe(true);
    expect(
      checkLicenseUsageEligibility(teamSummary, {
        commercialSerialization: true,
        assistantSeatCount: 6,
      }).blockedAxes,
    ).toEqual(["assistant-sharing"]);

    const attributionRequiredSummary = buildTransparentLicenseSummary({
      commercialSerialization: { status: "conditional", attributionRequired: true },
      assistantSharing: { status: "allowed" },
      printVolume: { status: "conditional", attributionRequired: true },
    });
    const missingAttribution = checkLicenseUsageEligibility(attributionRequiredSummary, {
      commercialSerialization: true,
      printVolume: true,
      attributionIncluded: false,
    });
    expect(missingAttribution.eligible).toBe(false);
    expect(missingAttribution.blockedAxes).toEqual(["commercial-serialization", "print-volume"]);
  });

  it("MONETIZATION.md 원칙에 따라 유기적 랭킹과 AD·스폰서 슬롯을 엄격히 격리하고 혼입을 차단한다", () => {
    const partitioned = partitionMarketplaceListings([
      {
        assetId: "asset-rank-2",
        title: "서울 골목길 3D 세트",
        placement: "organic-ranking",
        organicRank: 2,
        licenseRights: STANDARD_MARKET_LICENSE_PRESETS["solo-commercial"],
      },
      {
        assetId: "asset-sponsor-1",
        title: "신규 중세 성채 팩",
        placement: "sponsored-slot",
        sponsorCampaignId: "cmp-2026-q4-01",
        licenseRights: STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
      },
      {
        assetId: "asset-rank-1",
        title: "G펜 잉크 브러시 프로",
        placement: "organic-ranking",
        organicRank: 1,
        licenseRights: STANDARD_MARKET_LICENSE_PRESETS["solo-commercial"],
      },
    ]);

    expect(partitioned.rankingIntegrityVerified).toBe(true);
    expect(partitioned.organicRankedCards.map((c) => c.organicRank)).toEqual([1, 2]);
    expect(partitioned.organicRankedCards.every((c) => c.sponsorBadgeLabelKo === null)).toBe(true);
    expect(partitioned.isolatedSponsoredSlots).toHaveLength(1);
    expect(partitioned.isolatedSponsoredSlots[0]?.sponsorBadgeLabelKo).toBe(
      SPONSORED_BADGE_LABEL_KO,
    );
    expect(partitioned.isolatedSponsoredSlots[0]?.organicRank).toBeNull();

    // 스폰서 카드에 랭킹 순위를 끼워 넣으려 하면 즉시 예외로 차단
    expect(() =>
      createMarketplaceCardDisclosure({
        assetId: "asset-smuggled",
        title: "랭킹 혼입 시도",
        placement: "sponsored-slot",
        organicRank: 1,
        sponsorCampaignId: "cmp-bad",
        licenseRights: STANDARD_MARKET_LICENSE_PRESETS["solo-commercial"],
      }),
    ).toThrow(/랭킹 격리/u);
  });
});

describe("trial-stamp-license-summary · 10초 워터마크 체험 → 구매 즉시 무손실 자동 치환", () => {
  it("워터마크 체험 프록시를 배치하고 유효 영수증 검증 시 좌표·변환·3D 포즈를 100% 유지해 무손실 원본으로 치환한다", () => {
    const originalTransform = createSampleTransform();
    const trialPlacement = createTrialStampPlacement({
      placementId: "plc-cut03-bg",
      cutId: "cut-003",
      layerId: "layer-bg-3d",
      assetId: "asset-3d-postoffice",
      assetTitle: "야간 우체국 3D 배경",
      sellerId: "seller-3d-park",
      proxyAssetUri: "trial://proxy/postoffice-watermarked.webp",
      proxySha256: computeSha256Hex("trial-proxy-bytes"),
      transform: originalTransform,
      licenseRights: STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
      placedAtIso: "2026-11-22T09:09:50.000Z",
    });

    expect(trialPlacement.state).toBe("trial-watermarked");
    expect(trialPlacement.exportBlocked).toBe(true);
    expect(trialPlacement.watermark.losslessBlocked).toBe(true);

    const receipt = createSignedReceipt();
    const losslessAsset = createLosslessAssetRef();
    const swapped = swapTrialStampToPurchasedAsset({
      placement: trialPlacement,
      receipt,
      losslessAsset,
      buyerId: "author-seoyeon",
      swappedAtIso: "2026-11-22T09:10:00.000Z",
    });

    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;

    expect(swapped.placement.state).toBe("purchased-lossless");
    expect(swapped.placement.watermarkRemoved).toBe(true);
    expect(swapped.placement.exportBlocked).toBe(false);
    expect(swapped.placement.transformPreserved).toBe(true);
    expect(swapped.placement.transform).toEqual(originalTransform);
    expect(swapped.placement.assetUri).toBe(losslessAsset.losslessAssetUri);
    expect(swapped.placement.pinnedContentSha256).toBe(losslessAsset.contentSha256);
    expect(swapped.placement.rightsBomEntry.receiptId).toBe(receipt.receiptId);
    expect(swapped.placement.rightsBomEntry.commercialSerializationReady).toBe(true);
  });

  it("결제 미완료·환불·서명 변조·타인 계정·원본 SHA-256 불일치 시 치환을 fail-closed 차단하고 체험 배치를 보존한다", () => {
    const trialPlacement = createTrialStampPlacement({
      placementId: "plc-guard-01",
      cutId: "cut-004",
      layerId: "layer-bg",
      assetId: "asset-3d-postoffice",
      assetTitle: "야간 우체국 3D 배경",
      sellerId: "seller-3d-park",
      proxyAssetUri: "trial://proxy/postoffice.webp",
      proxySha256: computeSha256Hex("proxy"),
      transform: createSampleTransform(),
      licenseRights: STANDARD_MARKET_LICENSE_PRESETS["solo-commercial"],
    });
    const losslessAsset = createLosslessAssetRef();

    // 1. 환불된 영수증 차단
    const refunded = swapTrialStampToPurchasedAsset({
      placement: trialPlacement,
      receipt: createSignedReceipt({ status: "refunded" }),
      losslessAsset,
      buyerId: "author-seoyeon",
    });
    expect(refunded.ok).toBe(false);
    if (!refunded.ok) {
      expect(refunded.errorCode).toBe("INVALID_RECEIPT_STATUS");
      expect(refunded.unchangedPlacement).toBe(trialPlacement);
    }

    // 2. 영수증 금액 변조 → 서명 불일치 차단
    const validReceipt = createSignedReceipt();
    const tamperedReceipt: MarketplacePurchaseReceipt = {
      ...validReceipt,
      paidAmountMinor: 1,
    };
    const tampered = swapTrialStampToPurchasedAsset({
      placement: trialPlacement,
      receipt: tamperedReceipt,
      losslessAsset,
      buyerId: "author-seoyeon",
    });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.errorCode).toBe("RECEIPT_SIGNATURE_MISMATCH");

    // 3. 다른 구매자 계정 차단
    const wrongBuyer = swapTrialStampToPurchasedAsset({
      placement: trialPlacement,
      receipt: validReceipt,
      losslessAsset,
      buyerId: "other-user-99",
    });
    expect(wrongBuyer.ok).toBe(false);
    if (!wrongBuyer.ok) expect(wrongBuyer.errorCode).toBe("BUYER_MISMATCH");

    // 4. 무손실 원본 SHA-256이 영수증 구매 해시와 불일치 시 차단
    const alteredAsset = createLosslessAssetRef({
      contentSha256: computeSha256Hex("TAMPERED-ASSET-BYTES"),
    });
    const hashMismatch = swapTrialStampToPurchasedAsset({
      placement: trialPlacement,
      receipt: validReceipt,
      losslessAsset: alteredAsset,
      buyerId: "author-seoyeon",
    });
    expect(hashMismatch.ok).toBe(false);
    if (!hashMismatch.ok) expect(hashMismatch.errorCode).toBe("CONTENT_HASH_MISMATCH");

    // 5. verifyPurchaseReceipt 직접 호출 시 정상 통과 확인
    expect(
      verifyPurchaseReceipt(validReceipt, {
        assetId: "asset-3d-postoffice",
        buyerId: "author-seoyeon",
        sellerId: "seller-3d-park",
      }).valid,
    ).toBe(true);
  });

  it("원고 내 여러 컷에 배치된 동일 체험 프록시를 1클릭 일괄 치환하고 타 에셋은 건드리지 않는다", () => {
    const baseTransform = createSampleTransform();
    const trialCut1 = createTrialStampPlacement({
      placementId: "plc-1",
      cutId: "cut-01",
      layerId: "bg",
      assetId: "asset-3d-postoffice",
      assetTitle: "야간 우체국 3D 배경",
      sellerId: "seller-3d-park",
      proxyAssetUri: "trial://proxy/postoffice.webp",
      proxySha256: computeSha256Hex("proxy-1"),
      transform: baseTransform,
      licenseRights: STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
    });
    const trialCut2 = createTrialStampPlacement({
      placementId: "plc-2",
      cutId: "cut-02",
      layerId: "bg",
      assetId: "asset-3d-postoffice",
      assetTitle: "야간 우체국 3D 배경",
      sellerId: "seller-3d-park",
      proxyAssetUri: "trial://proxy/postoffice.webp",
      proxySha256: computeSha256Hex("proxy-1"),
      transform: { ...baseTransform, x: 512, rotationDeg: 12 },
      licenseRights: STANDARD_MARKET_LICENSE_PRESETS["team-studio"],
    });
    const unrelatedTrial = createTrialStampPlacement({
      placementId: "plc-other",
      cutId: "cut-02",
      layerId: "prop",
      assetId: "asset-prop-lantern",
      assetTitle: "가스등 소품",
      sellerId: "seller-prop-choi",
      proxyAssetUri: "trial://proxy/lantern.webp",
      proxySha256: computeSha256Hex("proxy-lantern"),
      transform: baseTransform,
      licenseRights: STANDARD_MARKET_LICENSE_PRESETS["solo-commercial"],
    });

    const batch = swapAllTrialStampsForPurchasedAsset([trialCut1, trialCut2, unrelatedTrial], {
      receipt: createSignedReceipt(),
      losslessAsset: createLosslessAssetRef(),
      buyerId: "author-seoyeon",
    });

    expect(batch.ok).toBe(true);
    expect(batch.swappedPlacementIds).toEqual(["plc-1", "plc-2"]);
    expect(batch.skippedPlacementIds).toEqual(["plc-other"]);
    expect(batch.placements[0]?.state).toBe("purchased-lossless");
    expect(batch.placements[1]?.state).toBe("purchased-lossless");
    expect(batch.placements[2]?.state).toBe("trial-watermarked");
  });
});

describe("royalty-settlement-calculator · 다중 통화(KRW/USD/JPY/EUR) 인쇄용 정산 명세서 결정론 생성기", () => {
  function createMultiCurrencyRequest(
    settlementCurrency: SettlementCurrency,
  ): RoyaltySettlementRequest {
    return {
      settlementId: `STL-2026-11-${settlementCurrency}`,
      seriesId: "series-postoffice",
      episodeId: "ep-042",
      periodLabel: "2026-11",
      settlementCurrency,
      totalEpisodeCuts: 60,
      generatedAtIso: "2026-11-22T12:00:00.000Z",
      streams: [
        {
          streamId: "kr-serial",
          kind: "serial-episode",
          label: "국내 연재 수익",
          currency: "KRW",
          grossAmountMinor: 1_500_000,
          platformFeeRateBps: 1500,
        },
        {
          streamId: "us-fastpass",
          kind: "serial-episode",
          label: "북미 패스트패스",
          currency: "USD",
          grossAmountMinor: toMinorUnits(320.5, "USD"),
          platformFeeRateBps: 2000,
        },
        {
          streamId: "jp-sub",
          kind: "subscription-pool",
          label: "일본 구독 수익",
          currency: "JPY",
          grossAmountMinor: 54_000,
          platformFeeRateBps: 1200,
        },
        {
          streamId: "eu-market",
          kind: "marketplace-sales",
          label: "유럽 3D 에셋 판매",
          currency: "EUR",
          grossAmountMinor: toMinorUnits(95, "EUR"),
          platformFeeRateBps: 1000,
          directRecipientId: "seller-eu-kim",
          directRecipientName: "김유럽",
          directRecipientTaxProfile: "non-resident-treaty",
        },
      ],
      teamContributors: [
        {
          memberId: "team-main",
          memberName: "한서연",
          role: "lineart",
          shareBps: 6000,
          completedCuts: 60,
          taxProfile: "kr-freelancer-3.3",
        },
        {
          memberId: "team-studio",
          memberName: "스튜디오 밤법인",
          role: "coloring",
          shareBps: 4000,
          completedCuts: 45,
          taxProfile: "kr-corporate-0",
        },
      ],
    };
  }

  it("KRW/USD/JPY/EUR 4개 정산 통화 전체에서 세율·수수료·실지급액·인쇄 요약을 결정론적으로 생성한다", () => {
    const currencies: readonly SettlementCurrency[] = ["KRW", "USD", "JPY", "EUR"];
    for (const currency of currencies) {
      const request = createMultiCurrencyRequest(currency);
      const first = generateDeterministicSettlementStatement(request);
      const second = generateDeterministicSettlementStatement(request);

      expect(first.statement.schemaVersion).toBe(PRINTABLE_SETTLEMENT_STATEMENT_SCHEMA_VERSION);
      expect(first.statement.statementSha256).toBe(second.statement.statementSha256);
      expect(first.statement.statementSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(first.statement.reconciliationBalanced).toBe(true);
      expect(first.statement.summaryCards).toHaveLength(5);
      expect(first.statement.sourceCurrencyBreakdown.map((b) => b.currency)).toEqual([
        "KRW",
        "USD",
        "JPY",
        "EUR",
      ]);
      expect(first.statement.fxSnapshotRows).toHaveLength(4);
      expect(first.statement.totalNetPayoutEquivalents).toHaveLength(4);

      // 수취인별 세율 및 세전 = 원천징수 + 실지급 항등식 확인
      for (const row of first.statement.recipientRows) {
        expect(row.withholdingTaxMinor + row.netPayoutMinor).toBe(row.grossAllocationMinor);
        expect(row.incomeTaxMinor + row.localIncomeTaxMinor).toBe(row.withholdingTaxMinor);
        expect(row.multiCurrencyNetEquivalents).toHaveLength(4);
      }

      const freelancer = first.statement.recipientRows.find((r) => r.recipientId === "team-main");
      const corporate = first.statement.recipientRows.find((r) => r.recipientId === "team-studio");
      const nonResident = first.statement.recipientRows.find((r) => r.recipientId === "seller-eu-kim");
      expect(freelancer?.withholdingRatePercentText).toBe("3.30%");
      expect(corporate?.withholdingRatePercentText).toBe("0.00%");
      expect(nonResident?.withholdingRatePercentText).toBe("10.00%");

      expect(first.statement.plainTextPrintSummary).toContain(first.statement.documentNumber);
      expect(first.statement.plainTextPrintSummary).toContain(first.statement.totals.netPayoutFormatted);
    }
  });

  it("개별 수취인 범위 명세서(recipientFilterId)를 생성하고 없는 수취인 ID는 거부한다", () => {
    const ledger = calculateRoyaltySettlement(createMultiCurrencyRequest("KRW"));
    const soloStatement = buildPrintableSettlementStatement(ledger, {
      recipientFilterId: "team-main",
      referenceCurrencies: ["KRW", "USD"],
    });

    expect(soloStatement.recipientScope).toBe("single-recipient");
    expect(soloStatement.scopedRecipientId).toBe("team-main");
    expect(soloStatement.recipientRows).toHaveLength(1);
    expect(soloStatement.totalNetPayoutEquivalents.map((e) => e.currency)).toEqual(["KRW", "USD"]);
    expect(soloStatement.totals.netPayoutMinor).toBe(
      soloStatement.recipientRows[0]?.netPayoutMinor,
    );

    expect(() =>
      buildPrintableSettlementStatement(ledger, { recipientFilterId: "unknown-recipient" }),
    ).toThrow(/존재하지 않는 수취인/u);
  });
});
