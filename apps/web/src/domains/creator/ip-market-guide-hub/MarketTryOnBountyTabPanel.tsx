/**
 * 탭 2: 마켓 30초 무료 시착 · Rights BOM 공동 로열티 분배 · 에셋 바운티 · POD 굿즈 CMYK/3mm 검증 패널.
 */

import { useMemo, useState } from "react";

import { ReaderGoodsProposalCard } from "./ReaderGoodsProposalCard";
import {
  calculateBomRoyaltySplit,
  createLiveMarketTryOnSession,
  DEFAULT_BOM_ROYALTY_CONTRIBUTORS,
  evaluateBountyFundingProgress,
  MARKET_BOUNTY_PRESETS,
  MARKET_TRYON_CATALOG,
  pledgeToAssetBounty,
  POD_PRODUCT_LABELS,
  tickLiveMarketTryOnSession,
  unlockLiveMarketTryOnPurchase,
  updateTryOnCompareView,
  validatePodGoodsPrintSpec,
  type AssetBountyItem,
  type PodColorProfile,
  type PodProductType,
} from "./market-tryon-bounty-engine";

export interface MarketTryOnBountyTabPanelProps {
  readonly onNotify?: (message: string) => void;
}

const POD_PRODUCTS: readonly PodProductType[] = [
  "acrylic-stand",
  "artbook-cover",
  "postcard-set",
  "sticker-sheet",
  "poster-a3",
];

export function MarketTryOnBountyTabPanel({ onNotify }: MarketTryOnBountyTabPanelProps) {
  const initialAsset = MARKET_TRYON_CATALOG[0];
  const [selectedAssetId, setSelectedAssetId] = useState(initialAsset?.assetId ?? "tryon-rooftop-sunset-3d");
  const [tryOnSession, setTryOnSession] = useState(() =>
    createLiveMarketTryOnSession({
      sessionId: "live-tryon-01",
      assetId: initialAsset?.assetId ?? "tryon-rooftop-sunset-3d",
      assetTitleKo: initialAsset?.titleKo ?? "노을 옥상 3D 스테이지",
      priceKrw: initialAsset?.priceKrw ?? 28000,
      durationSeconds: 30,
      startedAtMs: 1_763_866_000_000,
    }),
  );

  const [grossSaleKrw, setGrossSaleKrw] = useState(100_000);
  const [weights, setWeights] = useState<Readonly<Record<string, number>>>({
    "contrib-3d": 55,
    "contrib-shader": 25,
    "contrib-font": 20,
  });

  const [bounties, setBounties] = useState<readonly AssetBountyItem[]>(MARKET_BOUNTY_PRESETS);

  const [podProduct, setPodProduct] = useState<PodProductType>("acrylic-stand");
  const [podColorProfile, setPodColorProfile] = useState<PodColorProfile>("CMYK-FOGRA39");
  const [podBleedMm, setPodBleedMm] = useState(3);
  const [podDpi, setPodDpi] = useState(300);
  const [podCutContour, setPodCutContour] = useState(true);

  const royaltyResult = useMemo(
    () =>
      calculateBomRoyaltySplit({
        grossSaleKrw,
        platformFeePercent: 10,
        contributors: DEFAULT_BOM_ROYALTY_CONTRIBUTORS.map((item) => ({
          ...item,
          weight: weights[item.id] ?? item.weight,
        })),
      }),
    [grossSaleKrw, weights],
  );

  const podValidation = useMemo(
    () =>
      validatePodGoodsPrintSpec({
        productType: podProduct,
        trimWidthMm: podProduct === "poster-a3" ? 297 : 100,
        trimHeightMm: podProduct === "poster-a3" ? 420 : 148,
        bleedMm: podBleedMm,
        safeMarginMm: 3,
        dpi: podDpi,
        colorProfile: podColorProfile,
        totalInkCoveragePercent: 270,
        hasCutContourLayer: podCutContour,
        rightsBomCommercialClear: true,
      }),
    [podBleedMm, podColorProfile, podCutContour, podDpi, podProduct],
  );

  const startTryOnForAsset = (assetId: string) => {
    const picked = MARKET_TRYON_CATALOG.find((item) => item.assetId === assetId);
    if (!picked) return;
    setSelectedAssetId(picked.assetId);
    setTryOnSession((prev) =>
      createLiveMarketTryOnSession({
        sessionId: `tryon-${picked.assetId}`,
        assetId: picked.assetId,
        assetTitleKo: picked.titleKo,
        priceKrw: picked.priceKrw,
        durationSeconds: 30,
        startedAtMs: prev.startedAtMs + 30_000,
      }),
    );
    onNotify?.(`${picked.titleKo} 30초 무료 시착을 시작했습니다.`);
  };

  return (
    <div className="img-hub-grid" data-testid="market-tryon-bounty-panel">
      <div className="img-hub-grid img-hub-grid-2">
        <section className="img-hub-card" aria-labelledby="tryon-heading">
          <div className="img-hub-section-head">
            <h3 id="tryon-heading" className="img-hub-section-title">
              <img
                src="/assets/studio/vibrant-sprites/emblem-market.webp"
                alt=""
                aria-hidden="true"
                className="img-hub-sprite-img"
              />
              캔버스 30초 무료 시착 & 원클릭 해제
            </h3>
            <span
              className="img-hub-badge img-hub-num"
              data-tone={
                tryOnSession.status === "unlocked-purchased"
                  ? "good"
                  : tryOnSession.status === "expired"
                    ? "bad"
                    : "warn"
              }
            >
              {tryOnSession.status === "unlocked-purchased"
                ? "잠금 해제됨"
                : `${Math.ceil(tryOnSession.remainingSeconds)}초 남음`}
            </span>
          </div>

          <div className="img-hub-pill-row" role="group" aria-label="시착할 마켓 에셋">
            {MARKET_TRYON_CATALOG.map((asset) => (
              <button
                key={asset.assetId}
                type="button"
                className="img-hub-pill-btn"
                aria-pressed={selectedAssetId === asset.assetId}
                onClick={() => startTryOnForAsset(asset.assetId)}
              >
                <img src={asset.spritePath} alt="" aria-hidden="true" className="img-hub-sprite-img" />
                <span>{asset.categoryKo}</span>
              </button>
            ))}
          </div>

          <div className="img-hub-tryon-stage">
            <div className="img-hub-section-head">
              <strong className="text-sm font-bold text-fg">{tryOnSession.assetTitleKo}</strong>
              <span className="img-hub-badge img-hub-num">
                ₩{tryOnSession.priceKrw.toLocaleString("ko-KR")}
              </span>
            </div>
            <div className="img-hub-progress-track mt-2">
              <div
                className="img-hub-progress-fill"
                style={{ width: `${tryOnSession.progressPercent}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {tryOnSession.watermarkVisible ? (
                <span className="img-hub-watermark-banner" data-testid="tryon-watermark-badge">
                  워터마크: {tryOnSession.watermarkLabelKo}
                </span>
              ) : (
                <span className="img-hub-badge" data-tone="good" data-testid="tryon-unlocked-badge">
                  워터마크 제거 완료 · BOM {tryOnSession.unlockedRightsBomId}
                </span>
              )}
              <span className="img-hub-badge img-hub-num">
                비교 모드: {tryOnSession.compareMode} ({Math.round(tryOnSession.splitRatio * 100)}%)
              </span>
            </div>
            <p className="img-hub-muted mt-2">{tryOnSession.statusSummaryKo}</p>
          </div>

          <div className="img-hub-pill-row">
            <button
              type="button"
              className="img-hub-btn"
              onClick={() => setTryOnSession((prev) => tickLiveMarketTryOnSession(prev, 10))}
            >
              10초 경과 시뮬레이션
            </button>
            <button
              type="button"
              className="img-hub-btn"
              onClick={() =>
                setTryOnSession((prev) =>
                  updateTryOnCompareView(
                    prev,
                    prev.compareMode === "split" ? "before" : "split",
                    prev.splitRatio,
                  ),
                )
              }
            >
              전/후 비교 전환
            </button>
            <button
              type="button"
              className="img-hub-btn img-hub-btn-primary"
              onClick={() => {
                setTryOnSession((prev) => unlockLiveMarketTryOnPurchase(prev, "demo-receipt-2026"));
                onNotify?.(`${tryOnSession.assetTitleKo} 시착 레이어를 정식 라이선스로 잠금 해제했습니다.`);
              }}
            >
              원클릭 구매 잠금 해제
            </button>
          </div>
        </section>

        <section className="img-hub-card" aria-labelledby="royalty-heading">
          <div className="img-hub-section-head">
            <h3 id="royalty-heading" className="img-hub-section-title">
              <img
                src="/assets/studio/vibrant-sprites/emblem-community.webp"
                alt=""
                aria-hidden="true"
                className="img-hub-sprite-img"
              />
              권리 BOM 공동 로열티 자동 정산
            </h3>
            <span className="img-hub-badge img-hub-num" data-tone={royaltyResult.invariantVerified ? "good" : "bad"}>
              합계 {royaltyResult.totalSharePercent}% ({royaltyResult.totalShareBasisPoints} bps)
            </span>
          </div>

          <label className="text-xs font-bold text-fg-2">
            판매 정산 금액 (KRW)
            <select
              aria-label="공동 로열티 정산 기준 금액"
              className="img-hub-select mt-1"
              value={grossSaleKrw}
              onChange={(event) => setGrossSaleKrw(Number(event.target.value))}
            >
              <option value={50000}>₩50,000 (단품 패키지)</option>
              <option value={100000}>₩100,000 (스튜디오 번들)</option>
              <option value={333333}>₩333,333 (반올림 불변식 테스트)</option>
            </select>
          </label>

          <p className="img-hub-muted img-hub-num">
            플랫폼 수수료 {royaltyResult.platformFeePercent}% (₩
            {royaltyResult.platformFeeKrw.toLocaleString("ko-KR")}) 제외 창작자 분배 풀: ₩
            {royaltyResult.netCreatorPoolKrw.toLocaleString("ko-KR")}
          </p>

          <ul className="img-hub-step-list">
            {royaltyResult.allocations.map((row) => (
              <li key={row.contributorId} className="img-hub-step-item">
                <div>
                  <strong className="text-xs font-bold text-fg">{row.displayName}</strong>
                  <p className="img-hub-muted">{row.roleLabelKo}</p>
                </div>
                <div className="img-hub-pill-row">
                  <button
                    type="button"
                    className="img-hub-btn"
                    aria-label={`${row.roleLabelKo} 가중치 올리기`}
                    onClick={() =>
                      setWeights((prev) => ({
                        ...prev,
                        [row.contributorId]: (prev[row.contributorId] ?? 20) + 10,
                      }))
                    }
                  >
                    +비중
                  </button>
                  <span className="img-hub-badge img-hub-num" data-tone="good">
                    {row.sharePercent}% · ₩{row.payoutKrw.toLocaleString("ko-KR")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="img-hub-grid img-hub-grid-2">
        <section className="img-hub-card" aria-labelledby="bounty-heading">
          <div className="img-hub-section-head">
            <h3 id="bounty-heading" className="img-hub-section-title">에셋 바운티 (공동제작 현상금 보드)</h3>
            <span className="img-hub-badge img-hub-num">{bounties.length}건 활성</span>
          </div>
          <ul className="img-hub-step-list">
            {bounties.map((bounty) => {
              const evalInfo = evaluateBountyFundingProgress(bounty);
              return (
                <li key={bounty.id} className="img-hub-subcard">
                  <div className="img-hub-section-head">
                    <strong className="text-sm font-bold text-fg">{bounty.titleKo}</strong>
                    <span className="img-hub-badge img-hub-num" data-tone={evalInfo.isFullyFunded ? "good" : "warn"}>
                      {evalInfo.progressPercent}% · {evalInfo.statusLabelKo}
                    </span>
                  </div>
                  <div className="img-hub-progress-track">
                    <div
                      className="img-hub-progress-fill"
                      style={{ width: `${evalInfo.progressPercent}%` }}
                    />
                  </div>
                  <div className="img-hub-section-head">
                    <span className="img-hub-muted img-hub-num">
                      ₩{bounty.pledgedKrw.toLocaleString("ko-KR")} / ₩
                      {bounty.targetKrw.toLocaleString("ko-KR")} ({bounty.backerCount}명 참여)
                    </span>
                    <button
                      type="button"
                      className="img-hub-btn"
                      onClick={() => {
                        setBounties((prev) =>
                          prev.map((item) =>
                            item.id === bounty.id ? pledgeToAssetBounty(item, item.minPledgeKrw) : item,
                          ),
                        );
                        onNotify?.(`${bounty.titleKo} 바운티에 ₩${bounty.minPledgeKrw.toLocaleString("ko-KR")} 참여했습니다.`);
                      }}
                    >
                      +₩{bounty.minPledgeKrw.toLocaleString("ko-KR")} 참여
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="img-hub-card" aria-labelledby="pod-heading">
          <div className="img-hub-section-head">
            <h3 id="pod-heading" className="img-hub-section-title">POD 굿즈 CMYK · 3mm 재단선 검증기</h3>
            <span className="img-hub-badge" data-tone={podValidation.passed ? "good" : "warn"}>
              {podValidation.passed ? "인쇄 출고 통과" : "규격 보완 필요"}
            </span>
          </div>
          <div className="img-hub-pill-row">
            {POD_PRODUCTS.map((type) => (
              <button
                key={type}
                type="button"
                className="img-hub-pill-btn"
                aria-pressed={podProduct === type}
                onClick={() => setPodProduct(type)}
              >
                {POD_PRODUCT_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="img-hub-pill-row">
            <button
              type="button"
              className="img-hub-btn"
              onClick={() =>
                setPodColorProfile((prev) => (prev === "CMYK-FOGRA39" ? "sRGB" : "CMYK-FOGRA39"))
              }
            >
              색상: {podColorProfile}
            </button>
            <button
              type="button"
              className="img-hub-btn img-hub-num"
              onClick={() => setPodBleedMm((prev) => (prev >= 3 ? 1 : 3))}
            >
              재단선: {podBleedMm}mm
            </button>
            <button
              type="button"
              className="img-hub-btn img-hub-num"
              onClick={() => setPodDpi((prev) => (prev >= 300 ? 150 : 300))}
            >
              해상도: {podDpi} DPI
            </button>
            <button
              type="button"
              className="img-hub-btn"
              onClick={() => setPodCutContour((prev) => !prev)}
            >
              칼선 레이어: {podCutContour ? "포함" : "누락"}
            </button>
          </div>
          <p className="img-hub-muted img-hub-num">{podValidation.summaryKo}</p>
          <ul className="img-hub-step-list">
            {podValidation.checks.map((check) => (
              <li key={check.id} className="img-hub-step-item" data-step-done={check.passed}>
                <span className="text-xs font-bold text-fg">{check.labelKo}</span>
                <span className="img-hub-badge img-hub-num" data-tone={check.passed ? "good" : "warn"}>
                  {check.actualKo} / 기준 {check.requiredKo}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ReaderGoodsProposalCard onNotify={onNotify} />
    </div>
  );
}
