/**
 * 마켓 30초 무료 시착 · 권리 BOM 공동 로열티 분배 · 에셋 바운티 · POD 굿즈 인쇄 규격 검증 엔진.
 * 모든 상태 전이와 정산 계산은 결정론적 순수 함수로 동작하며, 합계 100%(10,000 bps) 불변식을 보장한다.
 */

import {
  DEFAULT_BOM_ROYALTY_CONTRIBUTORS,
  MARKET_BOUNTY_PRESETS,
  MARKET_TRYON_CATALOG,
  POD_PRODUCT_LABELS,
  READER_GOODS_PRODUCT_LABELS,
  READER_GOODS_PROPOSAL_PRESETS,
  type AssetBountyItem,
  type AssetBountyStatus,
  type BomContributorRole,
  type BomRoyaltyAllocation,
  type BomRoyaltyContributor,
  type BomRoyaltySplitInput,
  type BomRoyaltySplitResult,
  type BountyFundingEvaluation,
  type CreateReaderGoodsProposalInput,
  type LiveMarketTryOnSession,
  type LiveMarketTryOnSessionInput,
  type MarketTryOnCatalogItem,
  type MarketTryOnStatus,
  type PodColorProfile,
  type PodGoodsPrintSpecInput,
  type PodGoodsPrintValidation,
  type PodProductType,
  type PodSpecCheckItem,
  type ReaderGoodsApprovalResult,
  type ReaderGoodsProductKind,
  type ReaderGoodsProposal,
  type ReaderGoodsProposalSettlement,
  type ReaderGoodsProposalStatus,
  type TryOnCompareMode,
} from "./market-tryon-bounty-catalog";

export {
  DEFAULT_BOM_ROYALTY_CONTRIBUTORS,
  MARKET_BOUNTY_PRESETS,
  MARKET_TRYON_CATALOG,
  POD_PRODUCT_LABELS,
  READER_GOODS_PRODUCT_LABELS,
  READER_GOODS_PROPOSAL_PRESETS,
  type AssetBountyItem,
  type AssetBountyStatus,
  type BomContributorRole,
  type BomRoyaltyAllocation,
  type BomRoyaltyContributor,
  type BomRoyaltySplitInput,
  type BomRoyaltySplitResult,
  type BountyFundingEvaluation,
  type CreateReaderGoodsProposalInput,
  type LiveMarketTryOnSession,
  type LiveMarketTryOnSessionInput,
  type MarketTryOnCatalogItem,
  type MarketTryOnStatus,
  type PodColorProfile,
  type PodGoodsPrintSpecInput,
  type PodGoodsPrintValidation,
  type PodProductType,
  type PodSpecCheckItem,
  type ReaderGoodsApprovalResult,
  type ReaderGoodsProductKind,
  type ReaderGoodsProposal,
  type ReaderGoodsProposalSettlement,
  type ReaderGoodsProposalStatus,
  type TryOnCompareMode,
};

const TOTAL_BASIS_POINTS = 10_000;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * 캔버스 30초 무료 시착 세션을 생성한다. 시착 중에는 반투명 워터마크를 표시하고 전/후 비교를 허용한다.
 */
export function createLiveMarketTryOnSession(
  input: LiveMarketTryOnSessionInput,
): LiveMarketTryOnSession {
  const durationSeconds = Math.round(clampNumber(input.durationSeconds ?? 30, 10, 60));
  const priceKrw = Math.max(0, Math.round(input.priceKrw));
  return {
    sessionId: input.sessionId.trim() || `tryon-${input.assetId}`,
    assetId: input.assetId,
    assetTitleKo: input.assetTitleKo,
    priceKrw,
    durationSeconds,
    elapsedSeconds: 0,
    remainingSeconds: durationSeconds,
    progressPercent: 100,
    status: "active",
    watermarkVisible: true,
    watermarkOpacity: 0.24,
    watermarkLabelKo: `시착 프리뷰 · ${durationSeconds}초 남음`,
    compareMode: "split",
    splitRatio: 0.5,
    startedAtMs: input.startedAtMs,
    purchaseReceiptId: null,
    unlockedRightsBomId: null,
    statusSummaryKo: `30초 무료 시착 진행 중 (${durationSeconds}초 남음) — 적용 전/후를 비교해 보세요.`,
  };
}

/**
 * 시착 타이머를 지정한 초(deltaSeconds)만큼 전진시킨다. 구매 해제된 세션은 만료되지 않는다.
 */
export function tickLiveMarketTryOnSession(
  session: LiveMarketTryOnSession,
  deltaSeconds: number,
): LiveMarketTryOnSession {
  if (session.status === "unlocked-purchased") {
    return session;
  }
  const safeDelta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const elapsedSeconds = Math.min(session.durationSeconds, session.elapsedSeconds + safeDelta);
  const remainingSeconds = Math.max(0, Number((session.durationSeconds - elapsedSeconds).toFixed(2)));
  const progressPercent = Math.round((remainingSeconds / Math.max(1, session.durationSeconds)) * 100);
  const expired = remainingSeconds <= 0;

  return {
    ...session,
    elapsedSeconds,
    remainingSeconds,
    progressPercent,
    status: expired ? "expired" : "active",
    watermarkVisible: true,
    watermarkOpacity: expired ? 0.36 : 0.24,
    watermarkLabelKo: expired
      ? "시착 종료 — 구매 잠금 해제 시 바로 유지"
      : `시착 프리뷰 · ${Math.ceil(remainingSeconds)}초 남음`,
    compareMode: expired ? "before" : session.compareMode,
    statusSummaryKo: expired
      ? "30초 무료 시착이 끝났습니다. 원클릭 구매로 워터마크를 지우고 방금 배치한 컷을 그대로 확정하세요."
      : `무료 시착 진행 중 (${Math.ceil(remainingSeconds)}초 남음) — 전/후 비교 슬라이더를 움직여 확인하세요.`,
  };
}

/**
 * 시착 전/후 비교 모드와 분할 비율(0.1~0.9)을 변경한다.
 */
export function updateTryOnCompareView(
  session: LiveMarketTryOnSession,
  compareMode: TryOnCompareMode,
  splitRatio = session.splitRatio,
): LiveMarketTryOnSession {
  const safeRatio = Number(clampNumber(splitRatio, 0.1, 0.9).toFixed(2));
  const resolvedMode: TryOnCompareMode =
    session.status === "expired" && compareMode === "after" ? "before" : compareMode;
  return { ...session, compareMode: resolvedMode, splitRatio: safeRatio };
}

/**
 * 원클릭 구매 잠금 해제를 적용해 워터마크를 즉시 제거하고 Rights BOM 증빙을 연결한다.
 */
export function unlockLiveMarketTryOnPurchase(
  session: LiveMarketTryOnSession,
  receiptId: string,
): LiveMarketTryOnSession {
  const safeReceipt = receiptId.trim() || `rcpt-${session.assetId}`;
  return {
    ...session,
    status: "unlocked-purchased",
    watermarkVisible: false,
    watermarkOpacity: 0,
    watermarkLabelKo: "정식 라이선스 잠금 해제 완료",
    compareMode: "after",
    purchaseReceiptId: safeReceipt,
    unlockedRightsBomId: `bom-${session.assetId}-${safeReceipt}`,
    statusSummaryKo: "구매 잠금 해제가 완료되어 워터마크 없이 현재 컷 레이어에 영구 반영되었습니다.",
  };
}

/**
 * 권리 BOM 기여자별 공동 로열티를 정산한다.
 * 최대 나머지(Hamilton) 배분으로 지분 합계 10,000 bps(100.00%)와 원화 합계 100% 일치 불변식을 보장한다.
 */
export function calculateBomRoyaltySplit(input: BomRoyaltySplitInput): BomRoyaltySplitResult {
  const grossSaleKrw = Math.max(0, Math.round(input.grossSaleKrw));
  const platformFeePercent = Number(clampNumber(input.platformFeePercent ?? 10, 0, 30).toFixed(2));
  const platformFeeKrw = Math.round((grossSaleKrw * platformFeePercent) / 100);
  const netCreatorPoolKrw = Math.max(0, grossSaleKrw - platformFeeKrw);

  const validContributors = input.contributors.filter(
    (item) => Number.isFinite(item.weight) && item.weight > 0,
  );
  if (validContributors.length === 0) {
    return {
      grossSaleKrw,
      platformFeePercent,
      platformFeeKrw,
      netCreatorPoolKrw,
      allocations: [],
      totalShareBasisPoints: 0,
      totalSharePercent: 0,
      totalAllocatedKrw: 0,
      invariantVerified: false,
    };
  }

  const weightSum = validContributors.reduce((acc, item) => acc + item.weight, 0);

  const exactBps = validContributors.map((item, index) => {
    const raw = (item.weight / weightSum) * TOTAL_BASIS_POINTS;
    const floor = Math.floor(raw);
    return { index, floor, remainder: raw - floor };
  });
  let remainingBps = TOTAL_BASIS_POINTS - exactBps.reduce((acc, entry) => acc + entry.floor, 0);
  const bpsByRemainder = [...exactBps].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const finalBps = exactBps.map((entry) => entry.floor);
  for (const entry of bpsByRemainder) {
    if (remainingBps <= 0) break;
    finalBps[entry.index] = (finalBps[entry.index] ?? 0) + 1;
    remainingBps -= 1;
  }

  const exactKrw = validContributors.map((_item, index) => {
    const bps = finalBps[index] ?? 0;
    const raw = (netCreatorPoolKrw * bps) / TOTAL_BASIS_POINTS;
    const floor = Math.floor(raw);
    return { index, floor, remainder: raw - floor };
  });
  let remainingKrw = netCreatorPoolKrw - exactKrw.reduce((acc, entry) => acc + entry.floor, 0);
  const krwByRemainder = [...exactKrw].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const finalKrw = exactKrw.map((entry) => entry.floor);
  for (const entry of krwByRemainder) {
    if (remainingKrw <= 0) break;
    finalKrw[entry.index] = (finalKrw[entry.index] ?? 0) + 1;
    remainingKrw -= 1;
  }

  const allocations: BomRoyaltyAllocation[] = validContributors.map((contributor, index) => {
    const shareBasisPoints = finalBps[index] ?? 0;
    return {
      contributorId: contributor.id,
      displayName: contributor.displayName,
      role: contributor.role,
      roleLabelKo: contributor.roleLabelKo,
      shareBasisPoints,
      sharePercent: Number((shareBasisPoints / 100).toFixed(2)),
      payoutKrw: finalKrw[index] ?? 0,
    };
  });

  const totalShareBasisPoints = allocations.reduce((acc, item) => acc + item.shareBasisPoints, 0);
  const totalSharePercent = Number((totalShareBasisPoints / 100).toFixed(2));
  const totalAllocatedKrw = allocations.reduce((acc, item) => acc + item.payoutKrw, 0);

  return {
    grossSaleKrw,
    platformFeePercent,
    platformFeeKrw,
    netCreatorPoolKrw,
    allocations,
    totalShareBasisPoints,
    totalSharePercent,
    totalAllocatedKrw,
    invariantVerified:
      totalShareBasisPoints === TOTAL_BASIS_POINTS &&
      totalSharePercent === 100 &&
      totalAllocatedKrw === netCreatorPoolKrw,
  };
}

/**
 * 에셋 바운티의 현재 모금 달성률과 상태를 평가한다.
 */
export function evaluateBountyFundingProgress(bounty: AssetBountyItem): BountyFundingEvaluation {
  const safeTarget = Math.max(1, Math.round(bounty.targetKrw));
  const safePledged = Math.max(0, Math.round(bounty.pledgedKrw));
  const progressPercent = Math.min(100, Math.round((safePledged / safeTarget) * 100));
  const remainingKrw = Math.max(0, safeTarget - safePledged);
  const isFullyFunded = safePledged >= safeTarget;
  const resolvedStatus: AssetBountyStatus =
    bounty.status === "delivered" || bounty.status === "in-production"
      ? bounty.status
      : isFullyFunded
        ? "funded"
        : "open";
  const statusLabelMap: Readonly<Record<AssetBountyStatus, string>> = {
    open: "참여 모집 중",
    funded: "목표 달성 · 제작 착수 대기",
    "in-production": "공동 제작 진행 중",
    delivered: "에셋 배포 완료",
  };

  return {
    progressPercent,
    remainingKrw,
    isFullyFunded,
    status: resolvedStatus,
    statusLabelKo: statusLabelMap[resolvedStatus],
  };
}

/**
 * 에셋 바운티에 공동제작 후원금을 참여 반영하고 최신 상태를 반환한다.
 */
export function pledgeToAssetBounty(
  bounty: AssetBountyItem,
  pledgeAmountKrw: number,
): AssetBountyItem {
  const safeAmount = Math.max(bounty.minPledgeKrw, Math.round(pledgeAmountKrw));
  const nextPledged = bounty.pledgedKrw + safeAmount;
  const nextStatus: AssetBountyStatus =
    bounty.status === "delivered" || bounty.status === "in-production"
      ? bounty.status
      : nextPledged >= bounty.targetKrw
        ? "funded"
        : "open";

  return {
    ...bounty,
    pledgedKrw: nextPledged,
    backerCount: bounty.backerCount + 1,
    status: nextStatus,
  };
}

/**
 * POD 굿즈 출고 전 CMYK 프로파일·사방 3mm 재단선(블리드)·300 DPI·총 잉크량(TAC)·칼선·권리 BOM을 검증한다.
 */
export function validatePodGoodsPrintSpec(
  input: PodGoodsPrintSpecInput,
): PodGoodsPrintValidation {
  const trimW = Math.max(10, input.trimWidthMm);
  const trimH = Math.max(10, input.trimHeightMm);
  const bleedMm = Math.max(0, input.bleedMm);
  const safeMarginMm = Math.max(0, input.safeMarginMm);
  const dpi = Math.max(72, Math.round(input.dpi));
  const tac = Math.max(0, Math.round(input.totalInkCoveragePercent));
  const needsDieCut =
    input.productType === "acrylic-stand" || input.productType === "sticker-sheet";
  const isCmyk =
    input.colorProfile === "CMYK-FOGRA39" || input.colorProfile === "CMYK-JapanColor2001";

  const bleedBoxWidthMm = Number((trimW + bleedMm * 2).toFixed(1));
  const bleedBoxHeightMm = Number((trimH + bleedMm * 2).toFixed(1));
  const requiredPixelWidth = Math.ceil((bleedBoxWidthMm / 25.4) * Math.max(300, dpi));
  const requiredPixelHeight = Math.ceil((bleedBoxHeightMm / 25.4) * Math.max(300, dpi));

  const checks: PodSpecCheckItem[] = [
    { id: "pod-bleed-3mm", labelKo: "사방 재단선 여백(Bleed)", passed: bleedMm >= 3, actualKo: `${bleedMm}mm`, requiredKo: "3mm 이상" },
    { id: "pod-safe-margin", labelKo: "내부 안전 여백(Safe Zone)", passed: safeMarginMm >= 3, actualKo: `${safeMarginMm}mm`, requiredKo: "3mm 이상" },
    { id: "pod-cmyk-profile", labelKo: "인쇄 색상 프로파일(CMYK)", passed: isCmyk, actualKo: input.colorProfile, requiredKo: "CMYK-FOGRA39 또는 CMYK-JapanColor2001" },
    { id: "pod-dpi-300", labelKo: "출력 해상도(DPI)", passed: dpi >= 300, actualKo: `${dpi} DPI`, requiredKo: "300 DPI 이상" },
    { id: "pod-tac-limit", labelKo: "총 잉크량(TAC)", passed: tac <= 300, actualKo: `${tac}%`, requiredKo: "300% 이하" },
    { id: "pod-rights-bom", labelKo: "Rights BOM 굿즈 상업 권리", passed: input.rightsBomCommercialClear, actualKo: input.rightsBomCommercialClear ? "검증 통과" : "미검증/제한", requiredKo: "상업 인쇄·판매 허용" },
  ];

  if (needsDieCut) {
    checks.push({
      id: "pod-cut-contour",
      labelKo: "칼선(CutContour) 벡터 레이어",
      passed: input.hasCutContourLayer,
      actualKo: input.hasCutContourLayer ? "포함됨" : "누락됨",
      requiredKo: "별색 CutContour 폐곡선 필수",
    });
  }

  const nextFixesKo: string[] = [];
  if (bleedMm < 3) nextFixesKo.push("사방 재단선(Bleed)을 최소 3mm로 확장하세요.");
  if (safeMarginMm < 3) nextFixesKo.push("핵심 캐릭터·텍스트를 재단선 안쪽 3mm 이상으로 옮기세요.");
  if (!isCmyk) nextFixesKo.push("RGB 작업본을 CMYK-FOGRA39 또는 JapanColor2001 프로파일로 변환하세요.");
  if (dpi < 300) nextFixesKo.push(`인쇄 해상도를 300 DPI(${requiredPixelWidth}×${requiredPixelHeight}px) 이상으로 설정하세요.`);
  if (tac > 300) nextFixesKo.push("어두운 영역의 총 잉크량(TAC)을 300% 이하로 낮춰 뒤묻음을 방지하세요.");
  if (needsDieCut && !input.hasCutContourLayer) nextFixesKo.push("아크릴/스티커용 폐곡선 CutContour 벡터 레이어를 추가하세요.");
  if (!input.rightsBomCommercialClear) nextFixesKo.push("폰트·소재 Rights BOM의 상업 굿즈 인쇄 허용 여부를 먼저 확인하세요.");

  const passed = checks.every((item) => item.passed);
  const status: PodGoodsPrintValidation["status"] = !input.rightsBomCommercialClear
    ? "blocked"
    : passed
      ? "print-ready"
      : "needs-fix";

  return {
    passed,
    status,
    productLabelKo: POD_PRODUCT_LABELS[input.productType],
    bleedBoxWidthMm,
    bleedBoxHeightMm,
    requiredPixelWidth,
    requiredPixelHeight,
    checks,
    nextFixesKo,
    summaryKo: passed
      ? `${POD_PRODUCT_LABELS[input.productType]} 출고 규격 통과 (${bleedBoxWidthMm}×${bleedBoxHeightMm}mm · ${requiredPixelWidth}×${requiredPixelHeight}px).`
      : `인쇄 전 보완 항목 ${nextFixesKo.length}건을 먼저 조정해 주세요.`,
  };
}

/**
 * 독자가 웹툰 명장면 컷을 지정해 아크릴 스탠드·포토카드·키링·담요 목업을 역제안한다.
 */
export function createReaderGoodsProposal(
  input: CreateReaderGoodsProposalInput,
): ReaderGoodsProposal {
  const voteGoal = Math.round(clampNumber(input.voteGoal ?? 200, 20, 10_000));
  const unitPriceKrw = Math.max(5_000, Math.round(input.unitPriceKrw ?? 18_000));
  const estimatedOrderQty = Math.round(clampNumber(input.estimatedOrderQty ?? 200, 10, 50_000));
  const proposerRoyaltyPercent = Number(clampNumber(input.proposerRoyaltyPercent ?? 4, 1, 10).toFixed(2));
  const productLabelKo = READER_GOODS_PRODUCT_LABELS[input.productKind];

  return {
    id: input.id.trim() || `rgp-${input.episodeNumber}-${input.productKind}`,
    proposerHandle: input.proposerHandle.trim() || "@reader",
    episodeNumber: Math.max(1, Math.round(input.episodeNumber)),
    cutReference: input.cutReference.trim() || `EP.${Math.max(1, Math.round(input.episodeNumber))} 명장면 컷`,
    productKind: input.productKind,
    productLabelKo,
    titleKo: input.titleKo.trim() || `${productLabelKo} 독자 제안 목업`,
    mockupNoteKo: input.mockupNoteKo.trim() || "명장면 레이어 분리 및 3mm 재단선 자동 목업",
    voteCount: 1,
    voteGoal,
    unitPriceKrw,
    estimatedOrderQty,
    proposerRoyaltyPercent,
    proposerPerkKo: `초판 ${productLabelKo} 1세트 무료 증정 + 순수익 ${proposerRoyaltyPercent}% 제안자 로열티`,
    status: "voting",
    creatorApprovedAtIso: null,
  };
}

/**
 * 독자 역제안 굿즈에 팬 투표를 반영하고 목표 달성 시 상태를 `goal-reached`로 승격한다.
 */
export function voteReaderGoodsProposal(
  proposal: ReaderGoodsProposal,
  additionalVotes = 1,
): ReaderGoodsProposal {
  const delta = Math.max(1, Math.round(additionalVotes));
  const nextVotes = proposal.voteCount + delta;
  const nextStatus: ReaderGoodsProposalStatus =
    proposal.status === "creator-approved" || proposal.status === "in-production"
      ? proposal.status
      : nextVotes >= proposal.voteGoal
        ? "goal-reached"
        : "voting";

  return { ...proposal, voteCount: nextVotes, status: nextStatus };
}

/**
 * 팬 투표 목표를 달성한 독자 역제안 굿즈를 작가가 1클릭 승인해 제작·정산 단계로 넘긴다.
 */
export function approveReaderGoodsProposalByCreator(
  proposal: ReaderGoodsProposal,
  approvedAtIso: string,
): ReaderGoodsApprovalResult {
  if (proposal.voteCount < proposal.voteGoal) {
    return {
      approved: false,
      proposal,
      reasonKo: `팬 투표 목표(${proposal.voteGoal}표)까지 ${proposal.voteGoal - proposal.voteCount}표가 더 필요합니다.`,
    };
  }
  const updated: ReaderGoodsProposal = {
    ...proposal,
    status: "creator-approved",
    creatorApprovedAtIso: approvedAtIso.trim() || "2026-11-23T00:00:00Z",
  };
  return {
    approved: true,
    proposal: updated,
    reasonKo: `작가 1클릭 승인이 완료되어 ${updated.titleKo} 제작 및 제안자 로열티 정산이 예약되었습니다.`,
  };
}

/**
 * 승인된 독자 역제안 굿즈의 제작 원가·순수익·제안자 로열티·작가/플랫폼 정산을 계산한다(합계 100% 일치 불변식 보장).
 */
export function calculateReaderGoodsProposalSettlement(
  proposal: ReaderGoodsProposal,
  productionCostRatio = 0.42,
): ReaderGoodsProposalSettlement {
  const grossRevenueKrw = Math.max(0, Math.round(proposal.unitPriceKrw * proposal.estimatedOrderQty));
  const safeCostRatio = clampNumber(productionCostRatio, 0.1, 0.8);
  const productionCostKrw = Math.round(grossRevenueKrw * safeCostRatio);
  const netProfitKrw = Math.max(0, grossRevenueKrw - productionCostKrw);
  const proposerRoyaltyKrw = Math.round((netProfitKrw * proposal.proposerRoyaltyPercent) / 100);
  const platformShareKrw = Math.round(netProfitKrw * 0.1);
  const creatorShareKrw = Math.max(0, netProfitKrw - proposerRoyaltyKrw - platformShareKrw);
  const totalAllocatedNetKrw = proposerRoyaltyKrw + creatorShareKrw + platformShareKrw;

  return {
    proposalId: proposal.id,
    grossRevenueKrw,
    productionCostKrw,
    netProfitKrw,
    proposerRoyaltyKrw,
    creatorShareKrw,
    platformShareKrw,
    proposerRoyaltyPercent: proposal.proposerRoyaltyPercent,
    proposerPerkKo: proposal.proposerPerkKo,
    totalAllocatedNetKrw,
    invariantVerified: totalAllocatedNetKrw === netProfitKrw,
  };
}
